// Package config loads and validates the backend's environment configuration.
package config

import (
	"encoding/base64"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// RedisConfig holds the connection settings consumed by internal/redisclient.
type RedisConfig struct {
	Host     string
	Port     int
	Password string
	DB       int
	PoolSize int
}

// OIDCSeed is the OIDC provider configuration seeded into auth_providers at
// migrate time. JustRAG manages providers via an admin UI; this deployment
// has a single Keycloak provider configured entirely from the environment.
type OIDCSeed struct {
	Name                  string
	IssuerURL             string
	ClientID              string
	ClientSecret          string
	RedirectURI           string
	Scopes                []string
	SuccessRedirect       string
	PostLogoutRedirectURI string
	// EndSessionEndpoint optionally overrides the IdP logout URL the broker
	// would otherwise auto-discover (OIDC_LOGOUT_URI). Keycloak advertises this
	// in its discovery document, so it is usually only needed when discovery
	// omits it.
	EndSessionEndpoint string
}

// Enabled reports whether enough OIDC settings are present to seed a provider.
func (o OIDCSeed) Enabled() bool {
	return o.IssuerURL != "" && o.ClientID != "" && o.RedirectURI != ""
}

// Config is the fully-resolved backend configuration.
type Config struct {
	Port           string
	IsProduction   bool
	DatabaseURL    string
	Redis          RedisConfig
	JWTSecret      string
	AllowedOrigins []string

	// Model proxy (HRZ OpenAI-compatible endpoint).
	KIAPIKey  string
	KIBaseURL string

	// OIDC provider seed.
	OIDC OIDCSeed

	// Seed admin credentials.
	AdminUsername string
	AdminPassword string
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// firstNonEmpty returns the first non-empty value, or "" if all are empty.
func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

// deriveIssuer normalises an OIDC_IDP value to the bare issuer URL go-oidc
// expects. The HRZ hands out the full discovery URL
// (…/realms/jlu/.well-known/openid-configuration); go-oidc appends the
// well-known path itself, so we strip it (and any trailing slash) here.
func deriveIssuer(idp string) string {
	idp = strings.TrimSuffix(strings.TrimSpace(idp), "/")
	idp = strings.TrimSuffix(idp, "/.well-known/openid-configuration")
	return strings.TrimSuffix(idp, "/")
}

func atoiDefault(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

// Load reads configuration from the environment and validates it. It returns an
// error (rather than panicking) so the caller can log and exit cleanly.
func Load() (*Config, error) {
	isProd := strings.EqualFold(getenv("GO_ENV", ""), "production")

	cfg := &Config{
		Port:         getenv("PORT", "8080"),
		IsProduction: isProd,
		DatabaseURL:  os.Getenv("DATABASE_URL"),
		Redis: RedisConfig{
			Host:     getenv("REDIS_HOST", "localhost"),
			Port:     atoiDefault("REDIS_PORT", 6379),
			Password: os.Getenv("REDIS_PASSWORD"),
			DB:       atoiDefault("REDIS_DB", 0),
			PoolSize: atoiDefault("REDIS_POOL_SIZE", 0),
		},
		JWTSecret: os.Getenv("JWT_SECRET"),
		KIAPIKey:  os.Getenv("KI_API_KEY"),
		KIBaseURL: getenv("KI_BASE_URL", "https://api.hrz.uni-giessen.de/v1"),
		OIDC: OIDCSeed{
			Name: getenv("OIDC_PROVIDER_NAME", "Keycloak"),
			// OIDC_IDP is the IdP discovery URL the HRZ hands out
			// (…/.well-known/openid-configuration); go-oidc wants the bare
			// issuer and appends the well-known path itself, so normalise it.
			// OIDC_ISSUER_URL stays accepted as the legacy name.
			IssuerURL:    deriveIssuer(firstNonEmpty(os.Getenv("OIDC_IDP"), os.Getenv("OIDC_ISSUER_URL"))),
			ClientID:     os.Getenv("OIDC_CLIENT_ID"),
			ClientSecret: os.Getenv("OIDC_CLIENT_SECRET"),
			RedirectURI:  os.Getenv("OIDC_REDIRECT_URI"),
			Scopes:       splitNonEmpty(getenv("OIDC_SCOPES", "openid profile email")),
			SuccessRedirect: getenv("OIDC_SUCCESS_REDIRECT", "/"),
			PostLogoutRedirectURI: os.Getenv("OIDC_POST_LOGOUT_REDIRECT_URI"),
			// OIDC_LOGOUT_URI is the IdP end-session endpoint (Keycloak's
			// …/protocol/openid-connect/logout).
			EndSessionEndpoint: os.Getenv("OIDC_LOGOUT_URI"),
		},
		AdminUsername: getenv("ADMIN_USERNAME", "admin"),
		AdminPassword: os.Getenv("ADMIN_PASSWORD"),
	}

	cfg.AllowedOrigins = splitNonEmpty(os.Getenv("ALLOWED_ORIGINS"))
	if len(cfg.AllowedOrigins) == 0 && !isProd {
		// Dev fallback so the Vite dev server (5173) and the widget mock-portal
		// (8082, which logs in cross-origin to the admin) work out of the box.
		cfg.AllowedOrigins = []string{
			"http://localhost:5173",
			"http://localhost:8082",
		}
	}

	if err := cfg.validate(); err != nil {
		return nil, err
	}
	return cfg, nil
}

func splitNonEmpty(s string) []string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	// Accept comma- or space-separated lists.
	fields := strings.FieldsFunc(s, func(r rune) bool { return r == ',' || r == ' ' })
	out := make([]string, 0, len(fields))
	for _, f := range fields {
		if t := strings.TrimSpace(f); t != "" {
			out = append(out, t)
		}
	}
	return out
}

func (c *Config) validate() error {
	if c.DatabaseURL == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	if len(c.JWTSecret) < 32 {
		return fmt.Errorf("JWT_SECRET is required and must be at least 32 characters")
	}
	// AllowedOrigins must be explicit in production: an empty allowlist with
	// AllowCredentials:true would reflect any origin (rs/cors behaviour).
	if c.IsProduction && len(c.AllowedOrigins) == 0 {
		return fmt.Errorf("ALLOWED_ORIGINS is required in production")
	}
	// The OIDC client_secret is encrypted at rest with AUTH_PROVIDER_SECRET_KEY,
	// so that key must be present and valid whenever an OIDC provider is seeded.
	if c.OIDC.Enabled() && c.OIDC.ClientSecret != "" {
		if err := validateSecretKey(); err != nil {
			return err
		}
	}
	return nil
}

// validateSecretKey checks AUTH_PROVIDER_SECRET_KEY decodes to 32 bytes.
func validateSecretKey() error {
	raw := os.Getenv("AUTH_PROVIDER_SECRET_KEY")
	if raw == "" {
		return fmt.Errorf("AUTH_PROVIDER_SECRET_KEY is required to encrypt the OIDC client_secret")
	}
	decoded, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return fmt.Errorf("AUTH_PROVIDER_SECRET_KEY is not valid base64: %w", err)
	}
	if len(decoded) != 32 {
		return fmt.Errorf("AUTH_PROVIDER_SECRET_KEY must decode to exactly 32 bytes (got %d)", len(decoded))
	}
	return nil
}
