package agents

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

// fakeStore is an in-memory agents.Store.
type fakeStore struct {
	data map[string]json.RawMessage
}

func (s *fakeStore) List(context.Context) ([]json.RawMessage, error) {
	out := []json.RawMessage{}
	for _, v := range s.data {
		out = append(out, v)
	}
	return out, nil
}

func (s *fakeStore) Get(_ context.Context, id string) (json.RawMessage, error) {
	v, ok := s.data[id]
	if !ok {
		return nil, nil
	}
	return v, nil
}

func (s *fakeStore) Upsert(_ context.Context, id string, data []byte) (json.RawMessage, error) {
	s.data[id] = json.RawMessage(data)
	return json.RawMessage(data), nil
}

func (s *fakeStore) Delete(_ context.Context, id string) (bool, error) {
	if _, ok := s.data[id]; !ok {
		return false, nil
	}
	delete(s.data, id)
	return true, nil
}

// fakeRefs stands in for the widgets store: it reports a fixed reference count
// per agent id, so the delete guard can be exercised without Postgres.
type fakeRefs struct {
	byAgent map[string]int
}

func (r *fakeRefs) CountByAgent(_ context.Context, agentID string) (int, error) {
	return r.byAgent[agentID], nil
}

// newTestHandler wires an agents.Handler over the fakes and returns a mux that
// routes the agent paths (so r.PathValue("id") is populated as in production).
// Delete is wrapped exactly like the real router, but without the JWT/role
// middleware — the role check is the router's concern, not the handler's.
func newTestHandler(store Store, refs WidgetRefs) http.Handler {
	h := NewHandler(store, refs)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/agents", h.List)
	mux.HandleFunc("PUT /api/agents/{id}", h.Upsert)
	mux.HandleFunc("DELETE /api/agents/{id}", h.Delete)
	return mux
}

func agentJSON(id, name, model string) string {
	b, _ := json.Marshal(map[string]any{
		"id":    id,
		"name":  name,
		"model": model,
		"rules": []any{},
	})
	return string(b)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

func TestUpsert_CreatesAgent(t *testing.T) {
	store := &fakeStore{data: map[string]json.RawMessage{}}
	handler := newTestHandler(store, &fakeRefs{})

	const id = "a1"
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/api/agents/"+id,
		strings.NewReader(agentJSON(id, "JLU Assistent", "jlu/gpt-oss-20b")))
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body: %s)", rec.Code, rec.Body.String())
	}
	if _, ok := store.data[id]; !ok {
		t.Fatalf("agent %q was not stored", id)
	}
}

func TestUpsert_RejectsIDMismatch(t *testing.T) {
	handler := newTestHandler(&fakeStore{data: map[string]json.RawMessage{}}, &fakeRefs{})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/api/agents/url-id",
		strings.NewReader(agentJSON("body-id", "Name", "model")))
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for id mismatch", rec.Code)
	}
}

func TestUpsert_RequiresNameAndModel(t *testing.T) {
	handler := newTestHandler(&fakeStore{data: map[string]json.RawMessage{}}, &fakeRefs{})

	cases := map[string]string{
		"missing name":  agentJSON("a1", "", "model"),
		"missing model": agentJSON("a1", "Name", ""),
	}
	for label, body := range cases {
		t.Run(label, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPut, "/api/agents/a1", strings.NewReader(body))
			handler.ServeHTTP(rec, req)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400 (%s)", rec.Code, label)
			}
		})
	}
}

// An agent still referenced by a widget must not be deletable (409), and it
// must remain in the store.
func TestDelete_RefusesWhenAgentInUse(t *testing.T) {
	store := &fakeStore{data: map[string]json.RawMessage{
		"a1": json.RawMessage(agentJSON("a1", "In Use", "model")),
	}}
	refs := &fakeRefs{byAgent: map[string]int{"a1": 2}}
	handler := newTestHandler(store, refs)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodDelete, "/api/agents/a1", nil)
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409 for in-use agent", rec.Code)
	}
	if _, ok := store.data["a1"]; !ok {
		t.Fatalf("in-use agent was deleted despite 409")
	}
}

// An unreferenced agent deletes cleanly (204).
func TestDelete_SucceedsWhenUnused(t *testing.T) {
	store := &fakeStore{data: map[string]json.RawMessage{
		"a1": json.RawMessage(agentJSON("a1", "Standalone", "model")),
	}}
	handler := newTestHandler(store, &fakeRefs{byAgent: map[string]int{"a1": 0}})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodDelete, "/api/agents/a1", nil)
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	if _, ok := store.data["a1"]; ok {
		t.Fatalf("agent was not deleted")
	}
}

func TestDelete_UnknownAgentReturns404(t *testing.T) {
	handler := newTestHandler(&fakeStore{data: map[string]json.RawMessage{}}, &fakeRefs{})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodDelete, "/api/agents/nope", nil)
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestList_ReturnsAgentsEnvelope(t *testing.T) {
	store := &fakeStore{data: map[string]json.RawMessage{
		"a1": json.RawMessage(agentJSON("a1", "One", "m")),
	}}
	handler := newTestHandler(store, &fakeRefs{})

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/agents", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var resp struct {
		Agents []json.RawMessage `json:"agents"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Agents) != 1 {
		t.Fatalf("agents length = %d, want 1", len(resp.Agents))
	}
}
