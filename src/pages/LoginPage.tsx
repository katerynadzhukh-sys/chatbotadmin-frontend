import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "../auth/api";
import { useAuth } from "../auth/AuthContext";
import { Icon } from "../components/Icon";

interface PublicProvider {
  id: string;
  type: string;
  name: string;
}

interface ProvidersResponse {
  providers: PublicProvider[];
  localAuthEnabled: boolean;
}

/**
 * Login screen. Renders the username/password form when local auth is enabled
 * and a "Sign in with SSO" button for each configured OIDC provider. The set of
 * options is driven by GET /api/auth/providers.
 */
export function LoginPage() {
  const { isAuthenticated, loginLocal, loginWithSSO } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [localAuthEnabled, setLocalAuthEnabled] = useState(false);
  const [oidcProvider, setOidcProvider] = useState<PublicProvider | null>(null);
  const [authConfigLoaded, setAuthConfigLoaded] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // Initial error is derived once from an OIDC failure code the broker may
  // bounce back as /login?oidc_error=...; login failures overwrite it later.
  const [error, setError] = useState<string | null>(() => {
    const oidcErr = new URLSearchParams(window.location.search).get("oidc_error");
    return oidcErr ? `SSO-Anmeldung fehlgeschlagen (${oidcErr})` : null;
  });
  const [submitting, setSubmitting] = useState(false);

  // Discover which auth methods the backend offers so the page renders only the
  // ones that are actually enabled (SSO-only when OIDC is configured, the
  // password form otherwise).
  useEffect(() => {
    let active = true;
    apiFetch("/api/auth/providers")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ProvidersResponse | null) => {
        if (!active) return;
        if (data) {
          setLocalAuthEnabled(data.localAuthEnabled);
          setOidcProvider(data.providers.find((p) => p.type === "oidc") ?? null);
        } else {
          // Backend reachable but errored — fall back to the local form.
          setLocalAuthEnabled(true);
        }
        setAuthConfigLoaded(true);
      })
      .catch(() => {
        // Backend unreachable — fall back to the local form so a hiccup never
        // strands the user at a button-less screen.
        if (!active) return;
        setLocalAuthEnabled(true);
        setAuthConfigLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  // Mutually exclusive: render whatever the backend advertises once the config
  // has loaded (SSO-only when OIDC is active, the password form otherwise).
  const showPasswordForm = authConfigLoaded && localAuthEnabled;
  const showOidcButton = authConfigLoaded && oidcProvider !== null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await loginLocal(username, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-surface text-on-surface min-h-screen flex items-center justify-center p-gutter">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 mb-8">
          <Icon name="smart_toy" className="text-primary" style={{ fontSize: 40 }} />
          <h1 className="text-headline-md font-bold text-primary">ChatBot Admin</h1>
          <p className="text-on-surface-variant font-body-base text-sm">
            Melden Sie sich an, um fortzufahren
          </p>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm p-6 space-y-stack-sm">
          {error && (
            <p className="text-sm text-error text-center" role="alert">
              {error}
            </p>
          )}

          {!authConfigLoaded && (
            <div className="flex justify-center py-2">
              <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {showOidcButton && oidcProvider && (
            <button
              type="button"
              onClick={loginWithSSO}
              className="w-full bg-primary text-on-primary px-6 py-3 rounded-lg shadow-lg hover:brightness-110 active:scale-95 transition-all font-label-sm text-label-sm flex items-center justify-center gap-2"
            >
              <Icon name="login" className="text-[18px]" />
              Anmelden mit {oidcProvider.name}
            </button>
          )}

          {showPasswordForm && (
            <form onSubmit={handleSubmit} className="space-y-stack-sm">
              <div className="flex flex-col gap-1">
                <label className="font-label-sm text-on-surface-variant" htmlFor="login-username">
                  Benutzername
                </label>
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  className="w-full px-4 py-3 bg-surface border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-label-sm text-on-surface-variant" htmlFor="login-password">
                  Passwort
                </label>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  className="w-full px-4 py-3 bg-surface border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-secondary-container text-on-secondary-container px-6 py-3 rounded-lg hover:brightness-105 active:scale-95 transition-all font-label-sm text-label-sm flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {submitting ? "Anmeldung…" : "Anmelden"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
