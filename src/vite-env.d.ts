/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL for the chatbot widget (where widget.js is hosted) */
  readonly VITE_WIDGET_BASE_URL: string;

  /**
   * URL of the mock widget portal (the standalone test site that embeds the
   * widget). Linked from the admin user menu. When unset, it follows the current
   * deployment's host on the widget-test-site port (`<protocol>//<host>:8082/`),
   * a cross-origin URL by design. Set this to override (e.g. a dedicated portal
   * domain).
   */
  readonly VITE_WIDGET_PORTAL_URL?: string;

  /**
   * Base URL of the auth + model-proxy backend. Empty string (default) means
   * same origin — the Vite dev server proxies /api to the backend, and in
   * production nginx reverse-proxies /api. Set only for a cross-origin backend.
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
