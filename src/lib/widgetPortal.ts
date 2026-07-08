/**
 * URL of the mock widget portal — the standalone site that embeds the widget.
 * It lives on a DIFFERENT origin than the admin UI so it exercises the real
 * cross-origin embed + login path.
 *
 * Default (VITE_WIDGET_PORTAL_URL unset): the current deployment's host on the
 * portal port — :6443 (TLS) in production, :8082 locally. Pass a widgetId to
 * deep-link the portal to a specific widget (the portal reads ?widget=).
 */
export function resolveWidgetPortalUrl(widgetId?: string): string {
  const override = import.meta.env.VITE_WIDGET_PORTAL_URL;
  let base = override;
  if (!base) {
    const { protocol, hostname } = window.location;
    const port = protocol === "https:" ? "6443" : "8082";
    base = `${protocol}//${hostname}:${port}/`;
  }
  if (!widgetId) return base;
  const url = new URL(base);
  url.searchParams.set("widget", widgetId);
  return url.toString();
}
