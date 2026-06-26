# Authentication

Authentication is owned by the **Go backend** in [go-backend/](../go-backend/),
modelled on JustRAG's auth subsystem. The backend issues its own **HS256 JWTs**
and supports two login methods:

1. **Local username/password** — bcrypt-hashed accounts in Postgres (seeded
   `admin` superadmin).
2. **OIDC / Keycloak (server-side broker)** — the backend performs the
   Authorization Code + PKCE exchange as a **confidential** client and hands the
   SPA a backend JWT. The browser never holds a Keycloak token.

API keys (`jrag_…`) and a protected model proxy (`/api/models`, `/api/chat`)
round out the surface.

> This replaces the earlier browser-side `oidc-client-ts` flow. The SPA no
> longer talks to Keycloak directly and carries no OIDC client.

---

## Architecture

```
┌─────────┐                         ┌──────────────────────────────┐
│ Browser │ ── /login ───────────▶  │  React SPA (this repo)        │
│  (SPA)  │                         │  AuthContext holds JWT + user │
└────┬────┘                         └──────────────┬───────────────┘
     │                                             │ all /api calls carry
     │                                             │ Authorization: Bearer <JWT>
     │                                             ▼
     │   local: POST /api/auth/login   ┌──────────────────────────────┐
     │ ───────────────────────────────▶│  Go backend (go-backend/)     │
     │   SSO:   GET  /api/auth/oidc/... │  • signs/validates JWT (HS256)│
     │ ◀───────────────────────────────│  • bcrypt local login         │
     │   #oidc=<base64({token,user})>   │  • OIDC broker (PKCE)         │
     │                                  │  • API keys, model proxy      │
     │                                  └───────┬───────────┬──────────┘
     │                                          │           │
     │                            ┌─────────────▼──┐   ┌────▼─────┐
     │   OIDC redirect            │  Postgres      │   │  Redis   │
     └──────────────────────────▶ │ users,         │   │ JWT      │
        ┌────────────┐            │ auth_providers,│   │ blacklist│
        │  Keycloak  │            │ api_keys       │   └──────────┘
        └────────────┘            └────────────────┘
```

### Local login

`POST /api/auth/login {username,password}` → backend bcrypt-compares against
`users.password_hash` → returns `{token, user}`. The SPA stores both (see
[AuthContext](../src/auth/AuthContext.tsx)).

### OIDC / Keycloak (server-side broker)

1. SPA sends the browser to `GET /api/auth/oidc/login`.
2. Backend looks up the active OIDC provider, sets state + PKCE cookies, and
   redirects to Keycloak.
3. Keycloak authenticates the user and redirects to
   `GET /api/auth/oidc/callback` **on the backend**.
4. Backend verifies state, exchanges the code (with the `code_verifier`),
   verifies the ID token, resolves/provisions the user, signs a JWT, and
   redirects to the SPA at `OIDC_SUCCESS_REDIRECT` with the session in the URL
   **fragment**: `/auth/callback#oidc=<base64url({token,user})>`.
5. [AuthCallbackPage](../src/pages/AuthCallbackPage.tsx) decodes the fragment,
   stores the session, and enters the app. (Fragments never reach servers, so
   the token stays out of access logs.)

---

## Backend

See [go-backend/](../go-backend/) and [go-backend/.env.example](../go-backend/.env.example).

| Path | Purpose |
| --- | --- |
| `internal/auth/` | JWT parse/sign (HS256), auth middleware, Redis token blacklist, roles. |
| `internal/authhandler/` | login / logout / refresh, the OIDC broker (`oidc.go`), provider-secret encryption (`secrets.go`), `GET /api/auth/providers`. |
| `internal/apikeyauth/`, `internal/apikeys/` | `jrag_` API-key validation middleware + key CRUD. |
| `internal/modelproxy/` | `/api/models` + `/api/chat` proxy to the HRZ OpenAI-compatible endpoint, server-side. |
| `internal/users/` | user record types + (wired) `GET`/`PATCH /api/users/{id}`. |
| `internal/config/`, `internal/database/`, `internal/migrate/` | config load+validate, pgx pool, goose migrations + seed. |
| `internal/app/` | router + server bootstrap (CORS, graceful shutdown). |
| `migrations/main/` | `users`, `auth_providers`, `api_keys` schema. |

### HTTP API

| Method · Path | Auth | Purpose |
| --- | --- | --- |
| `POST /api/auth/login` | none | Local username/password → `{token, user}` |
| `GET /api/auth/providers` | none | Lists enabled methods for the login page |
| `GET /api/auth/oidc/login` | none | Start the OIDC redirect to Keycloak |
| `GET /api/auth/oidc/callback` | none | Code exchange → redirect to SPA with `#oidc=` |
| `GET /api/auth/oidc/logout` | optional Bearer | RP-initiated single logout |
| `POST /api/auth/oidc/logout` | signed token | OIDC back-channel logout |
| `POST /api/auth/logout` | JWT | Blacklist the current token |
| `POST /api/auth/refresh` | JWT | Rotate to a new token (old JTI blacklisted) |
| `GET`/`PATCH /api/users/{id}` | JWT | User read / profile update |
| `POST`/`GET /api/api-keys`, `DELETE /api/api-keys/{id}` | JWT | API key management |
| `GET /api/models`, `POST /api/chat` | JWT **or** `jrag_` API key | Model proxy |
| `GET /healthz` | none | Liveness |

### Datastores & tokens

- **Postgres** — `users`, `auth_providers` (the OIDC provider, with the client
  secret AES-GCM-encrypted at rest), `api_keys`.
- **Redis** — JWT revocation: per-token blacklist on logout/refresh, per-user
  invalidation, and a server-boot cutoff. Fails **closed** in production.
- **JWT** — HS256, 24 h expiry, claims `{id, username, role, jti, iat, exp}`.

### Configuration (env)

Backend env lives in [go-backend/.env.example](../go-backend/.env.example) (the
standalone backend / `npm run dev` loop) and [.env.staging.example](../.env.staging.example)
at the repo root (copy-ready values for the full-stack root compose on staging).
Key vars: `DATABASE_URL`, `REDIS_HOST`, `JWT_SECRET`
(≥32 chars), `AUTH_PROVIDER_SECRET_KEY` (base64 32 bytes, encrypts the OIDC client
secret), `ALLOWED_ORIGINS` (required in production), `ADMIN_PASSWORD`, `KI_API_KEY`.

OIDC is configured from the four values the HRZ hands out plus three
deployment-derived URLs:

| Var | Meaning |
| --- | --- |
| `OIDC_IDP` | IdP **discovery URL** (`…/realms/jlu/.well-known/openid-configuration`). The backend strips the well-known suffix to the issuer go-oidc expects. (`OIDC_ISSUER_URL` is still accepted as a legacy alias.) |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | Confidential client credentials. |
| `OIDC_LOGOUT_URI` | IdP **end-session endpoint** for RP-initiated logout. Overrides the value auto-discovered from `OIDC_IDP`. (Legacy alias: configuring nothing falls back to discovery.) |
| `OIDC_REDIRECT_URI` | Backend callback — `<backend-origin>/api/auth/oidc/callback`. |
| `OIDC_SUCCESS_REDIRECT` | Frontend page the callback bounces to with the JWT fragment — `<frontend-origin>/auth/callback`. |
| `OIDC_POST_LOGOUT_REDIRECT_URI` | Where the IdP returns the browser after logout (must be pre-registered) — e.g. `<frontend-origin>/login`. |

> **Keycloak client** is **confidential** (the backend holds the secret):
> Client authentication ON, Standard flow + PKCE S256, Valid Redirect URI
> `<backend-origin>/api/auth/oidc/callback`.

### Login page: which methods are shown

`GET /api/auth/providers` returns `{ providers, localAuthEnabled }`, and the
login page renders only the enabled methods (it never shows both a password form
and SSO at once):

- **No OIDC provider active** (local dev): `localAuthEnabled` is `true` → the
  **username/password form** is shown. This is the seeded `admin` / `password`.
- **An OIDC provider is active** (staging/prod): `localAuthEnabled` is `false`
  → only the **SSO button** is shown. Local password login is also rejected
  server-side **for everyone — there is no breakglass**, so an OIDC-only
  deployment has no password path at all. `DISABLE_LOCAL_AUTH=true` force-hides
  local auth the same way even when no OIDC is configured.

### Roles & first-login bootstrap

Roles are `user` < `admin` < `superadmin` ([roles.go](../go-backend/internal/auth/roles.go)).
There is **no role-change API** — `PATCH /api/users/{id}` cannot set `role` — so
a role is assigned only at provisioning time:

- **Local seed**: the `admin` user (`ADMIN_USERNAME`/`ADMIN_PASSWORD`) is seeded
  as `superadmin`. This is the local-dev administrator.
- **First SSO login → superadmin**: when **no OIDC user exists yet**, the first
  person to log in via SSO is provisioned as `superadmin`
  ([resolveOIDCUser](../go-backend/internal/authhandler/oidc.go)). Everyone who
  logs in after them is a plain `user`. The seeded local `admin` has
  `auth_method='local'` and does **not** count, so this bootstrap still fires in
  an OIDC-only deployment.
- **Username link**: if an SSO user's `preferred_username` matches an existing
  row, they are linked to it and **keep that row's role** (e.g. an SSO user named
  `admin` inherits the seeded superadmin).

> ⚠️ **Bootstrap safety.** "First SSO login becomes superadmin" means whoever
> authenticates first wins. Since the IdP is the university-wide realm, **log in
> yourself immediately after enabling OIDC**, and/or restrict who can reach the
> `chatwidgets` client in Keycloak, so a random member can't claim the first
> superadmin slot. After the first admin exists, change other users' roles
> directly in Postgres until a role-management UI lands (see [TODO.md](./TODO.md)).

---

## Frontend

| File | Responsibility |
| --- | --- |
| [src/auth/api.ts](../src/auth/api.ts) | `apiFetch` — attaches the JWT, raises `auth:unauthorized` on 401; token store mirrored for non-React callers. |
| [src/auth/AuthContext.tsx](../src/auth/AuthContext.tsx) | Session state, `loginLocal` / `loginWithSSO` / `logout`, persistence. |
| [src/auth/authFetch.ts](../src/auth/authFetch.ts) | `useAuthFetch` / `useAccessToken` hooks over `apiFetch`. |
| [src/pages/LoginPage.tsx](../src/pages/LoginPage.tsx) | Local form + Keycloak SSO button, driven by `/api/auth/providers`. |
| [src/pages/AuthCallbackPage.tsx](../src/pages/AuthCallbackPage.tsx) | Decodes the `#oidc=` fragment and stores the session. |
| [src/components/ProtectedRoute.tsx](../src/components/ProtectedRoute.tsx) | Redirects to `/login`; optional `requiredRole` (superadmin bypasses). |
| [src/hooks/useCurrentUser.ts](../src/hooks/useCurrentUser.ts) | Display info derived from the session. |

The SPA calls relative `/api/...`; in dev the Vite proxy
([vite.config.ts](../vite.config.ts)) forwards `/api` to the backend
(`BACKEND_ORIGIN`, default `http://localhost:8080`), and in production nginx
reverse-proxies `/api`. Set `VITE_API_BASE_URL` only for a cross-origin backend.

### Security model

Client-side route guards (`ProtectedRoute`, `requiredRole`) are **UX only** and
trivially bypassable. Authorization is enforced **server-side**: the backend
validates the JWT signature/expiry, checks the Redis blacklist on every request,
and enforces roles. The model proxy and all data endpoints sit behind that
middleware.

---

## Local development

Local dev needs **both** the SPA and the backend. `npm run dev` brings up both —
it first runs `backend:up` (`docker compose up -d --build` against
[go-backend/docker-compose.yml](../go-backend/docker-compose.yml)) and then starts
Vite:

```bash
npm install
npm run dev                     # backend on :8080 (detached) + Vite on :5173
```

Open http://localhost:5173 and log in with **`admin` / `password`**.

| Script | Action |
| --- | --- |
| `npm run dev` | Start the backend (detached) **and** the Vite dev server. |
| `npm run dev:frontend` | Vite only — when you manage the backend yourself. |
| `npm run backend:up` | Build + start the backend stack (idempotent). |
| `npm run backend:logs` | Tail the backend logs. |
| `npm run backend:down` | Stop the backend stack. |

Out of the box (no `.env`, no Keycloak) the backend works with the compose
defaults and seeds an **`admin` / `password`** superadmin. This mirrors
JustRAG's approach: local dev runs the real backend with a seeded default
account rather than a mock/bypass.

To customise — a different admin password, the `KI_API_KEY` for the model
proxy, or OIDC — copy `go-backend/.env.example` to `go-backend/.env` and edit;
the compose defaults are overridden by it. Once `OIDC_*` is set, the login page
also shows the Keycloak SSO button. For the full-stack root compose (and
staging), start from the repo-root `.env.staging.example` instead.

### Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `JWT_SECRET is required and must be at least 32 characters` at startup | Set a ≥32-char `JWT_SECRET`. |
| `AUTH_PROVIDER_SECRET_KEY is required` | An OIDC client secret is set but the AES key is missing — `openssl rand -base64 32`. |
| Login works locally but SSO doesn't | Keycloak client must be confidential with redirect URI `<backend>/api/auth/oidc/callback`; check `OIDC_*`. |
| Stuck on the callback spinner | The `#oidc=` fragment wasn't produced — check `OIDC_SUCCESS_REDIRECT` points at `<frontend>/auth/callback`. |
| 401 loops / immediate logout | Redis unreachable (blacklist fails closed in production) or clock skew on the JWT. |
| `/api` calls 404 in dev | Backend not running on `BACKEND_ORIGIN`, or the Vite proxy target is wrong. |
