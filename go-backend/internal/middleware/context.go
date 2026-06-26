package middleware

import (
	"net/http"

	"github.com/stenseegel/chatbotadmin-backend/internal/logctx"
	"github.com/stenseegel/chatbotadmin-backend/internal/requestid"
)

// RequestContext assigns/propagates a request ID and attaches a request-scoped
// logger so handler and auth-middleware logs carry a correlatable request_id.
func RequestContext(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, id, err := requestid.EnsureContext(r.Context())
		if err == nil {
			w.Header().Set("X-Request-Id", id)
		}
		ctx = logctx.Attach(ctx)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
