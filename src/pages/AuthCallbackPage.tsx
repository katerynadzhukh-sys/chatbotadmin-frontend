import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, type AuthUser } from "../auth/AuthContext";
import { Icon } from "../components/Icon";

type ParsedCallback = { token: string; user: AuthUser } | { error: string };

/** Decodes the #oidc=<base64url({token,user})> fragment the backend appends. */
function parseCallbackFragment(): ParsedCallback {
  const hash = window.location.hash;
  if (!hash.startsWith("#oidc=")) {
    return { error: "Kein Anmelde-Token empfangen." };
  }
  try {
    const json = decodeBase64Url(hash.slice("#oidc=".length));
    const payload = JSON.parse(json) as { token: string; user: AuthUser };
    if (!payload.token || !payload.user) throw new Error("incomplete");
    return { token: payload.token, user: payload.user };
  } catch {
    return { error: "Anmelde-Token konnte nicht verarbeitet werden." };
  }
}

/**
 * Handles the post-OIDC redirect from the backend broker.
 *
 * After Keycloak authenticates the user, the backend exchanges the code for a
 * JWT and redirects here with the session in the URL **fragment**:
 *
 *   /auth/callback#oidc=<base64url({ token, user })>
 *
 * Fragments never reach the server, so the token stays out of access logs.
 * This page decodes the fragment, stores the session, and navigates into the app.
 *
 * Route: /auth/callback
 */
export function AuthCallbackPage() {
  const { setSession } = useAuth();
  const navigate = useNavigate();
  // Derive the parse result during render (deterministic from the URL fragment);
  // the effect below performs only the side effects when parsing succeeded.
  const parsed = useMemo(() => parseCallbackFragment(), []);
  const error = "error" in parsed ? parsed.error : null;

  useEffect(() => {
    if ("error" in parsed) return;
    setSession(parsed.token, parsed.user);
    // Strip the fragment from history, then enter the app.
    window.history.replaceState({}, document.title, window.location.pathname);
    navigate("/", { replace: true });
  }, [parsed, setSession, navigate]);

  if (error) {
    return (
      <div className="bg-surface text-on-surface min-h-screen flex items-center justify-center p-gutter">
        <div className="w-full max-w-sm text-center">
          <Icon name="error" className="text-error mb-4" style={{ fontSize: 40 }} />
          <h1 className="text-headline-md font-bold text-error mb-2">Anmeldung fehlgeschlagen</h1>
          <p className="text-sm text-on-surface-variant mb-6">{error}</p>
          <button
            onClick={() => navigate("/login", { replace: true })}
            className="bg-primary text-on-primary px-6 py-3 rounded-lg hover:brightness-110 active:scale-95 transition-all font-label-sm"
          >
            Zurück zur Anmeldung
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface text-on-surface min-h-screen flex items-center justify-center p-gutter">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-on-surface-variant">Anmeldung wird verarbeitet…</p>
      </div>
    </div>
  );
}

/** Decodes a base64url string (no padding) to a UTF-8 string. */
function decodeBase64Url(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
