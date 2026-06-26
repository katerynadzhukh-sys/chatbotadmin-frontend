// Package adminproviders holds the auth_providers row type shared by the auth
// handlers. JustRAG also exposes admin CRUD for providers here; this deployment
// seeds the single OIDC provider from environment variables at migrate time
// (see internal/migrate), so only the data type is retained.
package adminproviders

import (
	"encoding/json"
	"time"
)

// AuthProviderRow holds a full auth_provider record from the database.
type AuthProviderRow struct {
	ID        string          `json:"id" db:"id"`
	Type      string          `json:"type" db:"type"`
	Name      string          `json:"name" db:"name"`
	Config    json.RawMessage `json:"config" db:"config"`
	IsActive  bool            `json:"isActive" db:"is_active"`
	CreatedAt time.Time       `json:"createdAt" db:"created_at"`
}
