package app

import (
	"net/http"
	"strings"

	"github.com/stenseegel/chatbotadmin-backend/internal/apikeyauth"
	"github.com/stenseegel/chatbotadmin-backend/internal/apikeys"
	"github.com/stenseegel/chatbotadmin-backend/internal/auth"
	"github.com/stenseegel/chatbotadmin-backend/internal/authhandler"
	"github.com/stenseegel/chatbotadmin-backend/internal/modelproxy"
	"github.com/stenseegel/chatbotadmin-backend/internal/users"
)

type routerDeps struct {
	auth     *authhandler.Handler
	users    *users.Handler
	apiKeys  *apikeys.Handler
	proxy    *modelproxy.Handler
	jwtMW    *auth.Middleware
	apiKeyMW *apikeyauth.Middleware
	version  string
}

// newRouter builds the HTTP mux. It uses Go 1.22 method+path patterns, so the
// handlers can read path values via r.PathValue (e.g. /api/users/{id}).
func newRouter(d routerDeps) *http.ServeMux {
	mux := http.NewServeMux()

	// jwt wraps a handler so it requires a valid JWT.
	jwt := func(h http.HandlerFunc) http.Handler { return d.jwtMW.Authenticate(http.HandlerFunc(h)) }

	// ---- health --------------------------------------------------------------
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	// ---- auth (public) -------------------------------------------------------
	mux.HandleFunc("POST /api/auth/login", d.auth.Login)
	mux.HandleFunc("GET /api/auth/providers", d.auth.ListPublicProviders)
	mux.HandleFunc("GET /api/auth/oidc/login", d.auth.OIDCLogin)
	mux.HandleFunc("GET /api/auth/oidc/callback", d.auth.OIDCCallback)
	// RP-initiated logout reads an optional Bearer itself; back-channel logout
	// is an IdP-to-server signed POST. Both are public by design.
	mux.HandleFunc("GET /api/auth/oidc/logout", d.auth.OIDCLogout)
	mux.HandleFunc("POST /api/auth/oidc/logout", d.auth.OIDCBackchannelLogout)

	// ---- auth (JWT-protected) ------------------------------------------------
	mux.Handle("POST /api/auth/logout", jwt(d.auth.Logout))
	mux.Handle("POST /api/auth/refresh", jwt(d.auth.Refresh))

	// ---- users (JWT-protected; per-handler role/ownership checks inside) -----
	mux.Handle("GET /api/users/{id}", jwt(d.users.GetUser))
	mux.Handle("PATCH /api/users/{id}", jwt(d.users.UpdateUser))

	// ---- API keys (JWT-protected) --------------------------------------------
	mux.Handle("POST /api/api-keys", jwt(d.apiKeys.CreateApiKey))
	mux.Handle("GET /api/api-keys", jwt(d.apiKeys.ListApiKeys))
	mux.Handle("DELETE /api/api-keys/{id}", jwt(d.apiKeys.DeleteApiKey))

	// ---- model proxy (JWT or API key) ----------------------------------------
	// The browser admin UI calls these with its JWT; programmatic callers may
	// use a jrag_ API key instead. eitherAuth dispatches on the token shape.
	eitherAuth := d.combinedAuth
	mux.Handle("GET /api/models", eitherAuth(http.HandlerFunc(d.proxy.ListModels)))
	mux.Handle("POST /api/chat", eitherAuth(http.HandlerFunc(d.proxy.Chat)))

	return mux
}

// combinedAuth accepts either a JustRAG API key (Bearer jrag_…) or a JWT.
// It selects the API-key middleware when the bearer token carries the jrag_
// prefix, otherwise falls back to JWT validation. Both inject auth.Claims.
func (d routerDeps) combinedAuth(next http.Handler) http.Handler {
	apiChain := d.apiKeyMW.Authenticate(next)
	jwtChain := d.jwtMW.Authenticate(next)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if strings.HasPrefix(token, "jrag_") {
			apiChain.ServeHTTP(w, r)
			return
		}
		jwtChain.ServeHTTP(w, r)
	})
}
