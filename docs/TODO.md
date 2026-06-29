# TODO — Authentication backend

Tracks the auth/backend work. See [AUTHENTICATION.md](./AUTHENTICATION.md) for
the architecture and [go-backend/](../go-backend/) for the service.

Status legend: `[x]` done · `[ ]` open · `[~]` partial

---

## Done

- [x] Go auth backend (`go-backend/`) modelled on JustRAG: HS256 JWT, bcrypt
      local login, logout/refresh, Redis token blacklist.
- [x] Server-side OIDC broker (Keycloak, Authorization Code + PKCE, confidential
      client); JWT delivered to the SPA via URL fragment.
- [x] API keys (`jrag_…`) — validation middleware + create/list/delete.
- [x] Protected model proxy (`/api/models`, `/api/chat` → HRZ) behind JWT/API key.
- [x] Postgres schema + goose migrations; seed of `admin` + OIDC provider from env.
- [x] Dockerfile + docker-compose (Postgres + Redis + migrate + serve).
- [x] Turnkey local dev: `npm run dev` brings up the backend (`docker compose up
      -d --build`, no `.env` needed) **and** Vite → log in with `admin` / `password`.
- [x] Frontend reworked off client-side OIDC onto the backend JWT (AuthContext,
      LoginPage, AuthCallbackPage, apiFetch, ProtectedRoute, Vite `/api` proxy).
- [x] Backend builds + runs verified end-to-end; frontend tsc + lint + build green.
- [x] Nginx `/api/` reverse-proxy added to `nginx.conf` + `nginx.staging.conf`
      (resolver-based upstream so Nginx still boots without the backend); `nginx -t` passes.
- [x] `docs/DEPLOYMENT.md` updated for the backend (architecture, local backend
      run, staging backend + Postgres + Redis, prod env/secrets, CORS).

---

## Next up (before this can ship)

- [~] **End-to-end Keycloak SSO test.** OIDC is now wired to the JLU `jlu` realm
      via `OIDC_IDP` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `OIDC_LOGOUT_URI`
      (set them in `go-backend/.env` on staging). Login page is SSO-only when a
      provider is active, password form otherwise (no `/admin` breakglass — local
      password login is fully disabled under OIDC). The **first SSO login is
      provisioned as superadmin** (bootstrap); everyone after is `user`. Still
      TODO: run the real login + logout round-trip against the realm (client
      secret + registered redirect/post-logout URIs), and **log in first** so a
      random realm member can't claim the superadmin slot. Only local password is
      verified end-to-end so far.
- [ ] **Production deployment wiring.**
  - [x] nginx: reverse-proxy `/api` → backend (dev uses the Vite proxy).
  - [x] Documented the prod compose services in `docs/DEPLOYMENT.md` §2b.
  - [x] Wired `backend` + Postgres + Redis + `migrate` into the **root**
        `docker-compose.yml`, on the shared network so the frontend nginx reaches
        `backend:8080`. Staging/prod run `docker compose up` with the repo-root
        `.env` (template: `.env.staging.example`); prod pins `FRONTEND_IMAGE_TAG=prod`.
  - [x] Build & publish the backend image to GHCR (`chatbotadmin-backend`) so
        staging/prod pull it instead of building from `go-backend/` source.
        (`docker-publish.yml` now builds both images via a matrix; root compose
        pulls `chatbotadmin-backend` with `pull_policy: always`, prod pins
        `BACKEND_IMAGE_TAG=prod`.)
  - [ ] Real secrets: `JWT_SECRET`, `AUTH_PROVIDER_SECRET_KEY` (base64 32 bytes,
        required once `OIDC_CLIENT_SECRET` is set), `OIDC_CLIENT_SECRET`,
        `ALLOWED_ORIGINS` (required in prod).
- [ ] **Login rate limiting.** JustRAG throttles `POST /api/auth/login`
      (Redis + in-memory limiters); we dropped it. Re-add before exposing publicly.
- [ ] **CI/CD.** `go vet` + tests, build & publish the backend image (ghcr),
      run `migrate` as an init step on deploy.

---

## Backlog

- [ ] **Backend tests.** JustRAG's auth tests weren't copied — add unit tests for
      jwt, middleware, blacklist, login handler, OIDC callback.
- [ ] **User management UI + role changes.** Endpoints (`GET`/`PATCH
      /api/users/{id}`) are wired but unused by the SPA, and `PATCH` cannot
      currently change `role` — so after the first-login superadmin bootstrap,
      promoting/demoting users means editing Postgres by hand. Add a
      superadmin-guarded role field to `PATCH` + the admin screen.
- [ ] **API-key management UI.** Surface create/list/delete in the app.
- [ ] **Token refresh strategy (frontend).** Currently a 401 just logs the user
      out; consider proactive refresh via `POST /api/auth/refresh`.
- [ ] **LDAP provider.** Deferred — port `internal/authhandler/ldap.go` + the
      login fallback if Uni-Gießen directory login is needed.
- [ ] Backend healthcheck wired into compose `depends_on` (frontend → backend).

---

## Open questions

- [ ] Keep the Redis JWT blacklist long-term, or simplify to short-TTL tokens
      without server-side revocation?
- [ ] Should the model proxy accept API keys in production, or JWT-only?
- [ ] Do we need a non-admin seeded role (JustRAG's `tester` / `TESTER_PASSWORD`)?
