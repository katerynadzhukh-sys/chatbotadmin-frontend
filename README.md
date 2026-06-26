# Chatbot Admin Frontend

This repository contains the administration dashboard and widget loader for the chatbot system at Justus Liebig University Gießen (JLU Gießen).

---

## What is this repo?

This is a Single Page Application (SPA) that serves two primary purposes:
1. **Admin Panel:** A dashboard to configure, manage, and monitor chatbot widgets.
2. **Widget Hosting:** Serves the embedded floating chatbot widget loader (`widget.js`) to external portals (like the JLU Gießen website).

---

## Tech Stack

* **Frontend Framework:** React 19 (with TypeScript)
* **Build Tool & Server:** Vite 8 (using a dev-only proxy to securely communicate with the JLU OpenAI-compatible API endpoint)
* **Styling & Components:** Tailwind CSS v4 and Lucide React icons
* **Routing:** React Router DOM v7
* **Authentication:** Keycloak Integration (OIDC Authorization Code flow with PKCE via `react-oidc-context` and `oidc-client-ts`)
* **Production Web Server:** Nginx (alpine-based container for SPA hosting and SSL termination)
* **Containerization:** Docker & Docker Compose (supporting a dual-container local development/test setup)

---

## Project Structure

```text
├── docs/                      # Technical guides & documentation
│   ├── AUTHENTICATION.md      # Detailed Keycloak OIDC authentication setup
│   └── DEPLOYMENT.md          # Local testing and staging deployment instructions
├── src/                       # Main application codebase (React/TypeScript)
│   ├── auth/                  # OIDC providers, hooks, and role mappings
│   ├── components/            # Reusable UI components
│   ├── hooks/                 # Custom React hooks (e.g. useCurrentUser)
│   ├── pages/                 # Routing endpoints (Dashboard, Config, callback page)
│   └── types/                 # TypeScript type definitions
├── widget-test/               # Mock JLU portal for embedding & testing the widget locally
├── Dockerfile                 # Multi-stage production build configuration
├── docker-compose.yml         # Staging/Production service definition
├── docker-compose.override.yml# Local development service override
└── vite.config.ts             # Vite build pipeline and custom API/KI proxy setup
```

---

## Detailed Documentation

For deeper configurations, check the following guides:
* 🔐 **[Authentication Guide](docs/AUTHENTICATION.md)** - Details on authentication architecture, Keycloak setup, token storage, and roles.
* 🚀 **[Deployment & Testing Guide](docs/DEPLOYMENT.md)** - Instructions on running local test environments, deploying to staging, and SSL/CORS setup.

---

## Local Development

```bash
npm install
npm run dev
```

`npm run dev` starts the backend (Docker), the widget mock-portal, and the Vite
dev server with live reload — seeded with an `admin` / `password` superadmin.

* **Admin UI (live reload):** [http://localhost:5173](http://localhost:5173)
* **Widget mock-portal (cross-origin):** [http://localhost:8082](http://localhost:8082)

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for staging and production.
