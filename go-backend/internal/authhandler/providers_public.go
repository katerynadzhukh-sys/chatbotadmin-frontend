package authhandler

import (
	"net/http"
	"os"

	"github.com/stenseegel/chatbotadmin-backend/internal/httputil"
	"github.com/stenseegel/chatbotadmin-backend/internal/logctx"
)

// localAuthEnabled reports whether the username/password form should be offered.
// It is auto-disabled whenever an OIDC provider is active (so a configured IdP
// becomes the only method), and can be force-disabled with DISABLE_LOCAL_AUTH=true.
// When disabled, local password login is rejected for everyone — there is no
// breakglass.
func localAuthEnabled(hasOIDC bool) bool {
	if os.Getenv("DISABLE_LOCAL_AUTH") == "true" {
		return false
	}
	return !hasOIDC
}

// publicProvider is the no-secret projection of an auth_providers row returned
// to unauthenticated clients so the login form can decide which buttons to
// render (e.g. "Sign in with SSO" for OIDC).
type publicProvider struct {
	ID   string `json:"id"`
	Type string `json:"type"`
	Name string `json:"name"`
}

// publicProvidersResponse is the public auth-config projection consumed by the
// login page. localAuthEnabled mirrors the DISABLE_LOCAL_AUTH env var so the
// page knows whether to render the username/password form.
type publicProvidersResponse struct {
	Providers        []publicProvider `json:"providers"`
	LocalAuthEnabled bool             `json:"localAuthEnabled"`
}

// ListPublicProviders handles GET /api/auth/providers. No auth required; the
// response intentionally excludes the config JSONB so client_secret and
// bindCredentials can't leak.
func (h *Handler) ListPublicProviders(w http.ResponseWriter, r *http.Request) {
	rows, err := h.store.GetActiveAuthProviders(r.Context())
	if err != nil {
		logctx.From(r.Context()).Error("list public providers", "err", err)
		httputil.WriteJSONCtx(r.Context(), w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
		return
	}
	out := make([]publicProvider, 0, len(rows))
	hasOIDC := false
	for _, p := range rows {
		out = append(out, publicProvider{ID: p.ID, Type: p.Type, Name: p.Name})
		if p.Type == OIDCProviderType {
			hasOIDC = true
		}
	}
	resp := publicProvidersResponse{
		Providers:        out,
		LocalAuthEnabled: localAuthEnabled(hasOIDC),
	}
	httputil.WriteJSONCtx(r.Context(), w, http.StatusOK, resp)
}
