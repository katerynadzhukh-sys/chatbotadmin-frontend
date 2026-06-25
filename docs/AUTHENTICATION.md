# Authentication

The admin frontend authenticates users against **Keycloak** using the
**OpenID Connect Authorization Code flow with PKCE**. There is no password
form in the app — login is delegated entirely to the identity provider (IdP).

The flow is implemented with
[`react-oidc-context`](https://github.com/authts/react-oidc-context) on top of
[`oidc-client-ts`](https://github.com/authts/oidc-client-ts).

---

## How it works

```
┌──────────┐   1. visit /          ┌────────────────┐
│  Browser │ ────────────────────▶ │ ProtectedRoute │
└──────────┘                       └────────┬───────┘
     ▲                                       │ 2. not authenticated →
     │                                       │    signinRedirect({ returnTo })
     │                                       ▼
     │                              ┌────────────────┐
     │  3. login at IdP             │    Keycloak    │
     │ ◀──────────────────────────▶│  (idp.uni-…)   │
     │                              └────────┬───────┘
     │                                       │ 4. redirect to
     │                                       │    /auth/callback?code=…&state=…
     ▼                                       ▼
┌────────────────────┐  5. exchange   ┌──────────────────┐
│ AuthCallbackPage   │  code→tokens   │ react-oidc-context│
│  (spinner)         │ ◀──────────────│  (PKCE verifier)  │
└─────────┬──────────┘                └──────────────────┘
          │ 6. authenticated → <Navigate to={returnTo}>
          ▼
   protected app
```

1. The user requests any protected route.
2. [`ProtectedRoute`](src/components/ProtectedRoute.tsx) sees they are not
   authenticated and calls `signinRedirect(...)`, passing the current path as
   `returnTo` in the OIDC `state`.
3. The browser is redirected to Keycloak, where the user logs in.
4. Keycloak redirects back to `/auth/callback?code=…&state=…`.
5. `react-oidc-context` automatically exchanges the authorization `code` for
   tokens (using the PKCE `code_verifier` it stored before the redirect).
6. [`AuthCallbackPage`](src/pages/AuthCallbackPage.tsx) detects the
   authenticated state and routes the user back to their original `returnTo`
   location (or `/`).

Tokens are then held in memory and `sessionStorage` by `oidc-client-ts`, and
attached to API calls via [`useAuthFetch`](src/auth/authFetch.ts).

---

## Configuration

All settings are driven by `VITE_OIDC_*` environment variables so each
environment (local, staging, production) can point at a different realm /
client without code changes. See [`.env.example`](.env.example) for the full
list.

| Variable | Purpose |
| --- | --- |
| `VITE_OIDC_AUTHORITY` | Keycloak realm URL (OIDC issuer / discovery endpoint), e.g. `https://idp.uni-giessen.de/realms/chatbot` |
| `VITE_OIDC_CLIENT_ID` | Client ID registered in Keycloak as a **public** client |
| `VITE_OIDC_REDIRECT_URI` | Where Keycloak redirects after login — must be `<origin>/auth/callback` |
| `VITE_OIDC_POST_LOGOUT_REDIRECT_URI` | Where Keycloak redirects after logout |
| `VITE_OIDC_SCOPE` | Space-separated scopes (default: `openid profile email`) |

> **Note:** these are `VITE_`-prefixed, so they are **embedded into the client
> bundle at build time** and are publicly visible. This is expected and safe —
> the client is a *public* OIDC client with no secret. Never put a
> `client_secret` here.

The runtime configuration object lives in
[`src/auth/oidcConfig.ts`](src/auth/oidcConfig.ts).

### Keycloak client setup

Create a **public** client in your realm with:

- **Standard flow:** enabled
- **Direct access grants:** disabled
- **PKCE Code Challenge Method:** `S256`
- **Valid Redirect URIs:** `http://localhost:5173/auth/callback` (dev) and
  `https://<your-domain>/auth/callback` (prod)
- **Web Origins:** `http://localhost:5173` (dev) and `https://<your-domain>` (prod)

---

## Key files

| File | Responsibility |
| --- | --- |
| [`src/auth/oidcConfig.ts`](src/auth/oidcConfig.ts) | `UserManagerSettings` built from env vars (authority, client, scopes, token storage, silent renew). |
| [`src/auth/AuthProvider.tsx`](src/auth/AuthProvider.tsx) | Wraps the app in the `react-oidc-context` provider; cleans the `?code=&state=` params off the URL after callback. Mounted in [`main.tsx`](src/main.tsx). |
| [`src/components/ProtectedRoute.tsx`](src/components/ProtectedRoute.tsx) | Route guard. Shows loading/error UI, triggers the login redirect, and optionally enforces a `requiredRole`. |
| [`src/pages/AuthCallbackPage.tsx`](src/pages/AuthCallbackPage.tsx) | Renders the `/auth/callback` route; shows a spinner during code exchange, then navigates to `returnTo`. |
| [`src/auth/authFetch.ts`](src/auth/authFetch.ts) | `useAuthFetch()` / `useAccessToken()` hooks for making authenticated API calls. |
| [`src/auth/roles.ts`](src/auth/roles.ts) | `extractRoles()` — pulls Keycloak roles from token claims. |
| [`src/hooks/useCurrentUser.ts`](src/hooks/useCurrentUser.ts) | `useCurrentUser()` — structured user info (name, email, roles, initials) from token claims. |

---

## Usage

### Protecting a route

Wrap the route element in `ProtectedRoute` (see [`App.tsx`](src/App.tsx)):

```tsx
<Route
  path="/statistiken"
  element={
    <ProtectedRoute>
      <AuthenticatedLayout>
        <StatisticsPage />
      </AuthenticatedLayout>
    </ProtectedRoute>
  }
/>
```

To require a specific Keycloak role:

```tsx
<ProtectedRoute requiredRole="admin">
  <AdminPage />
</ProtectedRoute>
```

The `/auth/callback` route is intentionally **not** wrapped — Keycloak must be
able to land there before the user is authenticated.

### Making authenticated API calls

Use the `useAuthFetch` hook — it attaches the bearer token automatically,
proactively renews an expired token before the request, and redirects to login
on a `401`:

```ts
const authFetch = useAuthFetch();
const res = await authFetch("/api/models");
const data = await res.json();
```

For libraries that don't use `fetch` directly (e.g. the OpenAI client), grab
the raw token:

```ts
const token = useAccessToken(); // string | undefined
```

### Reading the current user

```ts
const user = useCurrentUser();
// user?.displayName, user?.email, user?.roles, user?.initials, …
```

Returns `null` when no user is authenticated.

### Logging out

`AuthenticatedLayout` passes `auth.signoutRedirect()` to the sidebar logout
button. This ends the session at Keycloak and returns the user to
`VITE_OIDC_POST_LOGOUT_REDIRECT_URI`.

---

## Tokens, sessions & renewal

- **Storage:** OIDC state and tokens are kept in `sessionStorage`
  (`WebStorageStateStore`). They survive page reloads within a tab but do not
  persist after the tab closes and do not leak across tabs.
- **Silent renew:** `automaticSilentRenew` is enabled. `oidc-client-ts` uses
  the refresh-token grant against the token endpoint to renew the access token
  before it expires — no hidden iframe and no `silent_redirect_uri` required.
- **Session monitoring is disabled** (`monitorSession: false`). The app and
  Keycloak are on different origins, so the Keycloak `check_session_iframe`
  cookie is blocked by the browser as a third-party cookie. With monitoring on,
  this caused a spurious "session changed" → forced logout loop. Re-enable it
  only for a same-origin deployment or after configuring a `silent_redirect_uri`.

---

## Roles

`extractRoles()` in [`src/auth/roles.ts`](src/auth/roles.ts) merges:

- realm roles — `realm_access.roles`
- client roles — `resource_access.<client>.roles`

into a single de-duplicated list, so role checks work regardless of whether
Keycloak maps a given role at the realm or client scope. To expose roles in the
token, configure the corresponding **role mappers** (and the `roles` client
scope) in Keycloak.

---

## Security model

> ⚠️ **Client-side guards are UX, not a security boundary.**

`ProtectedRoute` and the `requiredRole` check only control what the SPA
*renders*. They are trivially bypassable in the browser. **All authorization
must be enforced server-side.** Every API endpoint must independently:

- validate the JWT **signature**, **issuer** (`iss`), and **audience** (`aud`);
- check token **expiry**; and
- enforce the required roles/permissions for the operation.

Never treat a request as authorized just because it carries *a* token — verify
it.

---

## Local development

1. Copy the example env file and fill in your realm/client values:
   ```bash
   cp .env.example .env.local
   ```
2. Ensure your Keycloak client lists `http://localhost:5173/auth/callback` as a
   valid redirect URI and `http://localhost:5173` as a web origin.
3. Start the dev server (`npm run dev`) and open the app — you'll be redirected
   to Keycloak to log in.

### Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Stuck on the callback spinner | `returnTo`/callback handling — confirm `AuthCallbackPage` is mounted at `/auth/callback` and the route is **not** protected. |
| Redirect loops between app and Keycloak | Redirect URI / web origin mismatch in the Keycloak client, or `monitorSession` re-enabled on a cross-origin setup. |
| `requiredRole` always denies access | The role isn't in the token — add the Keycloak role mapper and the `roles` client scope. |
| Login redirect fails in dev only | React StrictMode double-invoking effects; the PKCE verifier guard in `ProtectedRoute` handles this — make sure you didn't reintroduce a render-phase `signinRedirect`. |
