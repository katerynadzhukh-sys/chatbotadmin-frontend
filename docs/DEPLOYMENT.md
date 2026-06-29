# Chatbot Admin — Deployment Guide

One **frontend** (SPA + widget loader, served by Nginx) and one **Go backend**
(auth, API keys, model proxy) with **Postgres** + **Redis**. The SPA calls
same-origin `/api`; Nginx reverse-proxies `/api` to the backend. All secrets live
in the backend — nothing sensitive is bundled into the SPA. Auth details:
[AUTHENTICATION.md](./AUTHENTICATION.md).

| Component | Port | Role |
| --- | --- | --- |
| frontend (Nginx) | 80 / 443 | static SPA + `/widget.js`; proxies `/api` → backend |
| backend (Go) | 8080 | JWT/OIDC auth, API keys, model proxy |
| Postgres / Redis | — | users, providers, API keys / JWT revocation |
| widget mock-portal | 8082 | standalone site that embeds the widget |

> **Mock widget portal** — available on **every** deployment as a **separate,
> cross-origin origin** (locally `:8082`; on a server the same host on `:8082`,
> or override with `VITE_WIDGET_PORTAL_URL`). It embeds the widget and logs in
> against the admin's real backend (`POST /api/auth/login`), so it always
> exercises the true cross-origin flow. It's linked from the admin user menu
> (admins only). Browsing to `http://<host>:8080` returns **404** — the backend
> serves only `/api/*` and `/healthz`.

There are exactly three deployments:

---

## 1. Local Development

Live code reload (Vite HMR) **and** the cross-origin widget portal, one command:

```bash
npm install        # first time only
npm run dev
```

`npm run dev` starts the backend (Docker: Postgres + Redis + migrate + serve),
the widget portal, and Vite. No `.env` needed — a **`admin` / `password`**
superadmin is seeded.

- **Admin UI (live reload):** http://localhost:5173 → log in `admin` / `password`.
- **Widget mock-portal (cross-origin):** http://localhost:8082 → log in
  `admin` / `password`, then **Widget neu laden**. Its *Widget Server Origin* is
  pre-filled to `http://localhost:5173` (the dev admin), so the portal on `:8082`
  talks to the admin on `:5173` — a genuine cross-origin test.

Stop with `Ctrl-C` (Vite) then `npm run backend:down`. To customise the admin
password, `KI_API_KEY`, or OIDC, copy `go-backend/.env.example` →
`go-backend/.env`, edit, and `npm run backend:up`.

| Script | Action |
| --- | --- |
| `npm run dev` | Backend + widget portal + Vite. |
| `npm run dev:frontend` | Vite only. |
| `npm run backend:up` / `backend:logs` / `backend:down` | Manage the backend. |

---

## 2. Staging

A real server (`sv90073.hrz.uni-giessen.de`) running ready-made images. On the
server, in the repo checkout:

```bash
cp .env.staging.example .env     # fill in every FILL_IN value (secrets + OIDC)
docker compose pull              # frontend + backend images from GHCR
docker compose up -d             # frontend + backend + Postgres + Redis + portal
```

- **No build runs on the server.** Both the **frontend**
  (`ghcr.io/stenseegel/chatbotadmin-frontend`) and the **backend**
  (`ghcr.io/stenseegel/chatbotadmin-backend`) are prebuilt images published by
  [`.github/workflows/docker-publish.yml`](../.github/workflows/docker-publish.yml)
  on every push to `main`. `pull_policy: always` keeps them fresh.
- **TLS** is served by the frontend on 80/443 using the host certs
  (`/etc/ssl/certs/sv90073.pem`, `/etc/ssl/private/priv.pem`) and
  `nginx.staging.conf` — already wired in `docker-compose.yml`. (If `:443` is
  taken, map `"442:443"` and add `:442` to the URLs + OIDC redirect URIs.)
- **Admin UI:** https://sv90073.hrz.uni-giessen.de — once OIDC is on, the **first
  SSO login becomes superadmin**, so log in immediately (see AUTHENTICATION.md).
- The widget portal (`widget-test-site`, `:8082`) is plain HTTP; for a TLS site
  serve it on an HTTPS origin or point `VITE_WIDGET_PORTAL_URL` at the real portal.

**Required `.env`** (full template in [`.env.staging.example`](../.env.staging.example)):

| Var | Notes |
| --- | --- |
| `GO_ENV=production` | Fail-closed token revocation; makes `ALLOWED_ORIGINS` required. |
| `POSTGRES_PASSWORD`, `JWT_SECRET` (≥32), `AUTH_PROVIDER_SECRET_KEY` (base64 32 B) | Core secrets. |
| `ALLOWED_ORIGINS` | The admin origin, e.g. `https://sv90073.hrz.uni-giessen.de`. CORS is backend-driven by this. |
| `ADMIN_PASSWORD`, `KI_API_KEY` | Seed admin (fallback) + HRZ model proxy. |
| `OIDC_*` | Keycloak (JLU `jlu` realm); redirect URIs use the staging host. See AUTHENTICATION.md. |
| `BACKEND_HTTP_PROXY`, `BACKEND_HTTPS_PROXY`, `BACKEND_NO_PROXY` | Only if the host reaches the internet via the HRZ proxy. |

Embed the widget on any page:

```html
<div class="chatbot-widget" data-widget-id="support-bot" data-kb="jlu-staging-2026" data-lang="de"></div>
<script src="https://sv90073.hrz.uni-giessen.de/widget.js" defer></script>
```

---

## 3. Production

Identical to staging, but runs **only the prod-ready image** instead of `latest`.
Promote a validated staging image, then deploy with that tag pinned:

```bash
# Promote the tested images (CI or manually) — tag both frontend and backend:
for img in chatbotadmin-frontend chatbotadmin-backend; do
  docker tag  ghcr.io/stenseegel/$img:latest ghcr.io/stenseegel/$img:prod
  docker push ghcr.io/stenseegel/$img:prod
done

# On the prod server — .env pins the prod tags plus prod secrets/origins:
docker compose pull
docker compose up -d
```

The only differences from staging are in the prod `.env`: `FRONTEND_IMAGE_TAG=prod`
and `BACKEND_IMAGE_TAG=prod` (so it runs the promoted images, not `latest`), the
production domain in `ALLOWED_ORIGINS`, and the production `OIDC_*` redirect URIs.
