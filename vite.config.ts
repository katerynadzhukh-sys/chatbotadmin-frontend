import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * The Go backend (see ./go-backend) owns all /api routes — auth, user/API-key
 * management, and the model proxy (/api/models, /api/chat). In development we
 * forward /api to it so the SPA can use same-origin relative URLs; in
 * production nginx reverse-proxies /api to the backend.
 *
 * Set BACKEND_ORIGIN in .env to point the dev proxy at a non-default backend.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendOrigin = env.BACKEND_ORIGIN || 'http://localhost:8080'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': {
          target: backendOrigin,
          changeOrigin: true,
        },
      },
    },
  }
})
