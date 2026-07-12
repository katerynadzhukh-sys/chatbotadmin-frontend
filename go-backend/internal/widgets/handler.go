// Package widgets provides handlers for managing chatbot widget configurations.
//
// A widget is stored as a single JSONB blob (the full admin object). Three
// endpoints expose it:
//
//   - GET    /api/widgets       (JWT) — full list for the admin UI
//   - PUT    /api/widgets/{id}  (JWT) — create/update from the admin UI
//   - DELETE /api/widgets/{id}  (superadmin) — remove a widget
//   - GET    /api/widgets/{id}  (public) — reduced config for the embedded widget.js
//
// The public projection mirrors the previous Node backend (server/widgets-store.mjs):
// Lucide icon names are mapped to Material-Symbols names and only enabled rules
// are exposed, as plain text.
package widgets

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/stenseegel/chatbotadmin-backend/internal/httputil"
)

// maxBodyBytes caps a PUT body; the widget object is small (a few KB).
const maxBodyBytes = 1 << 20 // 1 MiB

// Store is the database interface required by Handler.
type Store interface {
	List(ctx context.Context) ([]json.RawMessage, error)
	Get(ctx context.Context, id string) (json.RawMessage, error)
	Upsert(ctx context.Context, id string, data []byte) (json.RawMessage, error)
	Delete(ctx context.Context, id string) (bool, error)
}

// AgentStore resolves an agent's stored JSON by id. It is satisfied by
// *agents.PGStore. The widget path uses it to source the "brain" (model,
// system prompt, rules, token cap) from the linked agent (Ebene 1) rather than
// from the widget's own embedded config.
type AgentStore interface {
	Get(ctx context.Context, id string) (json.RawMessage, error)
}

// agentBrain is the subset of an agent the widget path consumes. Field names
// match the agent JSON shape (see migrations/main/0003_agents.sql).
type agentBrain struct {
	Model        string       `json:"model"`
	SystemPrompt string       `json:"systemPrompt"`
	Rules        []widgetRule `json:"rules"`
	MaxTokens    int          `json:"maxTokens"`
}

// Handler holds the dependencies for the widget endpoints.
type Handler struct {
	store   Store
	agents  AgentStore
	chat    ChatProxy
	limiter *rateLimiter
}

// NewHandler creates a Handler using the given widget Store, agent store (for
// resolving the linked brain), and chat proxy.
func NewHandler(store Store, agents AgentStore, chat ChatProxy) *Handler {
	return &Handler{
		store:   store,
		agents:  agents,
		chat:    chat,
		limiter: newRateLimiter(chatRateWindow, chatRateMax),
	}
}

// resolveBrain returns the "brain" a widget runs on. The agent linked via
// widget.agentId (Ebene 1) is the source of truth. During the migration window
// a widget may still carry its own legacy fields and may not be linked yet, so
// this falls back to the widget's embedded config when there is no agentId or
// the referenced agent has gone missing — nothing breaks mid-rollout. A genuine
// store error is propagated so the caller can return 500.
func (h *Handler) resolveBrain(ctx context.Context, wgt widget) (agentBrain, error) {
	// Legacy fallback: the fields that used to live on the widget itself.
	fallback := agentBrain{Model: wgt.KnowledgeBaseID}
	if wgt.Config != nil {
		fallback.SystemPrompt = wgt.Config.StartPrompt
		fallback.Rules = wgt.Config.Rules
		fallback.MaxTokens = wgt.Config.MaxTokensPerAnswer
	}

	if h.agents == nil || strings.TrimSpace(wgt.AgentID) == "" {
		return fallback, nil
	}
	raw, err := h.agents.Get(ctx, wgt.AgentID)
	if err != nil {
		return agentBrain{}, err
	}
	if raw == nil {
		// Linked agent was deleted/missing — degrade to the widget's own fields.
		return fallback, nil
	}
	var b agentBrain
	if err := json.Unmarshal(raw, &b); err != nil {
		return agentBrain{}, err
	}
	// Defensive: if the agent somehow has no model, keep the widget's legacy one.
	if strings.TrimSpace(b.Model) == "" {
		b.Model = fallback.Model
	}
	return b, nil
}

// widgetRule is one configurable behaviour rule (only enabled rules are public).
type widgetRule struct {
	Text    string `json:"text"`
	Enabled bool   `json:"enabled"`
}

// widgetConfig holds the presentation/behaviour fields relevant to the backend.
// Unknown fields (rate limits, etc.) are ignored on parse but preserved in
// storage because the raw request JSON is stored verbatim.
type widgetConfig struct {
	StartPrompt        string       `json:"startPrompt"`
	Templates          []string     `json:"templates"`
	Rules              []widgetRule `json:"rules"`
	FeedbackButtons    bool         `json:"feedbackButtons"`
	MaxTokensPerAnswer int          `json:"maxTokensPerAnswer"`
	Title              string       `json:"title"`
	Greeting           string       `json:"greeting"`
	AccentColor        string       `json:"accentColor"`
	Position           string       `json:"position"`
}

// widget is the subset of the stored object the backend parses (for validation
// and the public projection). Config is a pointer so a missing "config" key can
// be told apart from an empty one. AgentID (Ebene 1) links the widget to the
// agent that provides its brain; empty on widgets not yet migrated/linked.
type widget struct {
	ID              string        `json:"id"`
	AgentID         string        `json:"agentId"`
	KnowledgeBaseID string        `json:"knowledgeBaseId"`
	Routing         string        `json:"routing"`
	Status          string        `json:"status"`
	Icon            string        `json:"icon"`
	Name            string        `json:"name"`
	Config          *widgetConfig `json:"config"`
}

// publicConfig is what the embedded widget.js consumes. Shape matches the
// previous Node backend so no frontend/widget.js change is needed.
type publicConfig struct {
	ID              string   `json:"id"`
	Status          string   `json:"status"`
	KnowledgeBaseID string   `json:"knowledgeBaseId"`
	Routing         string   `json:"routing"`
	Title           string   `json:"title"`
	Greeting        string   `json:"greeting"`
	AccentColor     string   `json:"accentColor"`
	Position        string   `json:"position"`
	Icon            string   `json:"icon"`
	Templates       []string `json:"templates"`
	Rules           []string `json:"rules"`
	StartPrompt     string   `json:"startPrompt"`
	FeedbackButtons bool     `json:"feedbackButtons"`
	MaxTokens       *int     `json:"maxTokens,omitempty"`
}

// iconMap translates Lucide icon names (admin UI) to Material-Symbols names
// (the font widget.js loads). Mirrors ICON_MAP in the former Node backend.
var iconMap = map[string]string{
	"Bot":           "smart_toy",
	"Languages":     "translate",
	"LineChart":     "analytics",
	"Headset":       "headset_mic",
	"MessageSquare": "chat",
	"Brain":         "psychology",
	"Sparkles":      "auto_awesome",
	"Headphones":    "headphones",
	"Globe":         "language",
	"MessageCircle": "chat_bubble",
}

func mapIcon(name string) string {
	if m, ok := iconMap[name]; ok {
		return m
	}
	return "smart_toy"
}

// List handles GET /api/widgets (admin) — returns { "widgets": [ ...full... ] }.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.store.List(r.Context())
	if err != nil {
		httputil.WriteInternalErrorCtx(r.Context(), w, err)
		return
	}
	httputil.WriteJSONCtx(r.Context(), w, http.StatusOK, map[string]any{"widgets": rows})
}

// Upsert handles PUT /api/widgets/{id} (admin) — creates or replaces a widget.
func (h *Handler) Upsert(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		httputil.WriteErrorCtx(r.Context(), w, http.StatusBadRequest, "missing widget id")
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	if err != nil {
		httputil.WriteErrorCtx(r.Context(), w, http.StatusBadRequest, "request body too large or unreadable")
		return
	}

	var parsed widget
	if err := json.Unmarshal(body, &parsed); err != nil {
		httputil.WriteErrorCtx(r.Context(), w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	if msg := validate(id, &parsed); msg != "" {
		httputil.WriteErrorCtx(r.Context(), w, http.StatusBadRequest, msg)
		return
	}

	stored, err := h.store.Upsert(r.Context(), id, body)
	if err != nil {
		httputil.WriteInternalErrorCtx(r.Context(), w, err)
		return
	}
	httputil.WriteJSONCtx(r.Context(), w, http.StatusOK, stored)
}

// Delete handles DELETE /api/widgets/{id} (superadmin) — removes a widget.
// Returns 204 on success and 404 when no widget with that id exists. The
// superadmin role is enforced by the router middleware, not here.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		httputil.WriteErrorCtx(r.Context(), w, http.StatusBadRequest, "missing widget id")
		return
	}

	existed, err := h.store.Delete(r.Context(), id)
	if err != nil {
		httputil.WriteInternalErrorCtx(r.Context(), w, err)
		return
	}
	if !existed {
		httputil.WriteErrorCtx(r.Context(), w, http.StatusNotFound, "Widget nicht gefunden.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// PublicConfig handles GET /api/widgets/{id} (public) — the reduced config for
// the embedded widget.js. 404 when the widget does not exist.
func (h *Handler) PublicConfig(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	raw, err := h.store.Get(r.Context(), id)
	if err != nil {
		httputil.WriteInternalErrorCtx(r.Context(), w, err)
		return
	}
	if raw == nil {
		httputil.WriteErrorCtx(r.Context(), w, http.StatusNotFound, "Widget nicht gefunden.")
		return
	}

	var wgt widget
	if err := json.Unmarshal(raw, &wgt); err != nil {
		httputil.WriteInternalErrorCtx(r.Context(), w, err)
		return
	}
	brain, err := h.resolveBrain(r.Context(), wgt)
	if err != nil {
		httputil.WriteInternalErrorCtx(r.Context(), w, err)
		return
	}
	httputil.WriteJSONCtx(r.Context(), w, http.StatusOK, toPublic(wgt, brain))
}

// validate enforces the invariants the wipe-prone raw upsert needs: the body id
// must match the URL, and the essential fields must be present and sane.
func validate(id string, wgt *widget) string {
	if wgt.ID != id {
		return "Widget-id im Body muss zur URL passen."
	}
	if strings.TrimSpace(wgt.Name) == "" {
		return "name is required"
	}
	if wgt.Status != "active" && wgt.Status != "paused" {
		return "status must be \"active\" or \"paused\""
	}
	if wgt.Config == nil {
		return "config is required"
	}
	return ""
}

// toPublic projects a stored widget onto the public config for widget.js. The
// presentation fields (title, greeting, colour, templates, …) come from the
// widget itself (the front, Ebene 3); the brain fields (model, system prompt,
// rules, token cap) come from the resolved agent (Ebene 1). The wire shape is
// unchanged, so widget.js and the standalone page need no changes.
func toPublic(wgt widget, brain agentBrain) publicConfig {
	cfg := wgt.Config
	if cfg == nil {
		cfg = &widgetConfig{}
	}

	templates := cfg.Templates
	if templates == nil {
		templates = []string{}
	}

	rules := []string{}
	for _, ru := range brain.Rules {
		if ru.Enabled {
			rules = append(rules, ru.Text)
		}
	}

	var maxTokens *int
	if brain.MaxTokens > 0 {
		mt := brain.MaxTokens
		maxTokens = &mt
	}

	return publicConfig{
		ID:              wgt.ID,
		Status:          wgt.Status,
		KnowledgeBaseID: brain.Model,
		Routing:         wgt.Routing,
		Title:           cfg.Title,
		Greeting:        cfg.Greeting,
		AccentColor:     cfg.AccentColor,
		Position:        cfg.Position,
		Icon:            mapIcon(wgt.Icon),
		Templates:       templates,
		Rules:           rules,
		StartPrompt:     brain.SystemPrompt,
		FeedbackButtons: cfg.FeedbackButtons,
		MaxTokens:       maxTokens,
	}
}
