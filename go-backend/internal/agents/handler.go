// Package agents provides handlers for managing Agents — the reusable "brain"
// (Ebene 1): model, system prompt, rules, token cap, and (post-MVP) tools and
// knowledge. An agent is stored as a single JSONB blob keyed by its UUID id.
//
// Endpoints (all JWT-protected; agents are never exposed unauthenticated —
// widget.js consumes the resolved public config via the widgets endpoint):
//
//   - GET    /api/agents       — full list for the admin UI
//   - PUT    /api/agents/{id}   — create/update from the admin UI
//   - DELETE /api/agents/{id}   — remove an agent (superadmin only)
//
// A widget references an agent by id (widgets.data->>'agentId'). Deleting an
// agent that is still referenced by a widget is rejected with 409 so a live
// widget cannot be left pointing at a missing brain.
package agents

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/stenseegel/chatbotadmin-backend/internal/httputil"
)

// maxBodyBytes caps a PUT body; the agent object is small (a few KB).
const maxBodyBytes = 1 << 20 // 1 MiB

// Store is the database interface required by Handler.
type Store interface {
	List(ctx context.Context) ([]json.RawMessage, error)
	Get(ctx context.Context, id string) (json.RawMessage, error)
	Upsert(ctx context.Context, id string, data []byte) (json.RawMessage, error)
	Delete(ctx context.Context, id string) (bool, error)
}

// WidgetRefs reports how many widgets reference a given agent. It is satisfied
// by the widgets store, whose table owns the reverse reference (agentId). The
// agents handler uses it to guard deletion of an in-use agent.
type WidgetRefs interface {
	CountByAgent(ctx context.Context, agentID string) (int, error)
}

// Handler holds the dependencies for the agent endpoints.
type Handler struct {
	store   Store
	widgets WidgetRefs
}

// NewHandler creates a Handler using the given agent Store and widget-reference
// counter.
func NewHandler(store Store, widgets WidgetRefs) *Handler {
	return &Handler{store: store, widgets: widgets}
}

// agent is the subset of the stored object the backend parses (for validation).
// Unknown fields (rules, tools, knowledge, …) are ignored on parse but
// preserved in storage because the raw request JSON is stored verbatim.
type agent struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Model string `json:"model"`
}

// List handles GET /api/agents — returns { "agents": [ ...full... ] }.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.store.List(r.Context())
	if err != nil {
		httputil.WriteInternalErrorCtx(r.Context(), w, err)
		return
	}
	httputil.WriteJSONCtx(r.Context(), w, http.StatusOK, map[string]any{"agents": rows})
}

// Upsert handles PUT /api/agents/{id} — creates or replaces an agent.
func (h *Handler) Upsert(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		httputil.WriteErrorCtx(r.Context(), w, http.StatusBadRequest, "missing agent id")
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	if err != nil {
		httputil.WriteErrorCtx(r.Context(), w, http.StatusBadRequest, "request body too large or unreadable")
		return
	}

	var parsed agent
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

// Delete handles DELETE /api/agents/{id} (superadmin) — removes an agent.
// Returns 409 when the agent is still referenced by one or more widgets, 404
// when no agent with that id exists, and 204 on success. The superadmin role is
// enforced by the router middleware, not here.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		httputil.WriteErrorCtx(r.Context(), w, http.StatusBadRequest, "missing agent id")
		return
	}

	// Guard: refuse to orphan a widget that still points at this agent.
	used, err := h.widgets.CountByAgent(r.Context(), id)
	if err != nil {
		httputil.WriteInternalErrorCtx(r.Context(), w, err)
		return
	}
	if used > 0 {
		httputil.WriteErrorCtx(r.Context(), w, http.StatusConflict,
			"Agent wird noch von einem oder mehreren Widgets verwendet und kann nicht gelöscht werden.")
		return
	}

	existed, err := h.store.Delete(r.Context(), id)
	if err != nil {
		httputil.WriteInternalErrorCtx(r.Context(), w, err)
		return
	}
	if !existed {
		httputil.WriteErrorCtx(r.Context(), w, http.StatusNotFound, "Agent nicht gefunden.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// validate enforces the invariants the verbatim upsert needs: the body id must
// match the URL, and the essential fields must be present.
func validate(id string, a *agent) string {
	if a.ID != id {
		return "Agent-id im Body muss zur URL passen."
	}
	if strings.TrimSpace(a.Name) == "" {
		return "name is required"
	}
	if strings.TrimSpace(a.Model) == "" {
		return "model is required"
	}
	return ""
}
