// Package modelproxy proxies the frontend's /api/models and /api/chat calls to
// the HRZ (Uni Gießen) OpenAI-compatible endpoint, server-side, so the API key
// never reaches the browser. It mirrors the request/response contract the
// frontend already expects (previously served by the Vite dev middleware).
package modelproxy

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"

	"github.com/stenseegel/chatbotadmin-backend/internal/httputil"
)

// Handler proxies model + chat requests to the upstream OpenAI-compatible API.
type Handler struct {
	apiKey  string
	baseURL string
	client  *http.Client
}

// NewHandler builds a proxy targeting baseURL with the given bearer apiKey.
func NewHandler(apiKey, baseURL string) *Handler {
	return &Handler{
		apiKey:  apiKey,
		baseURL: strings.TrimRight(baseURL, "/"),
		// No overall timeout: chat streaming responses are long-lived. The
		// upstream request carries its own context for cancellation.
		client: &http.Client{},
	}
}

func (h *Handler) configured(w http.ResponseWriter, r *http.Request) bool {
	if h.apiKey == "" {
		httputil.WriteJSONCtx(r.Context(), w, http.StatusServiceUnavailable,
			map[string]string{"error": "KI_API_KEY ist nicht gesetzt. Bitte in der Backend-Konfiguration eintragen."})
		return false
	}
	return true
}

func (h *Handler) upstream(ctx context.Context, method, path string, body []byte) (*http.Response, error) {
	var rdr *bytes.Reader
	if body != nil {
		rdr = bytes.NewReader(body)
	} else {
		rdr = bytes.NewReader(nil)
	}
	req, err := http.NewRequestWithContext(ctx, method, h.baseURL+path, rdr)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+h.apiKey)
	req.Header.Set("Content-Type", "application/json")
	return h.client.Do(req)
}

// ---------------------------------------------------------------------------
// GET /api/models
// ---------------------------------------------------------------------------

type modelInfo struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	OwnedBy string `json:"ownedBy"`
	Created int64  `json:"created"`
}

// ListModels handles GET /api/models.
func (h *Handler) ListModels(w http.ResponseWriter, r *http.Request) {
	if !h.configured(w, r) {
		return
	}
	resp, err := h.upstream(r.Context(), http.MethodGet, "/models", nil)
	if err != nil {
		httputil.WriteJSONCtx(r.Context(), w, http.StatusBadGateway,
			map[string]string{"error": fmt.Sprintf("Modelle konnten nicht geladen werden: %s", err.Error())})
		return
	}
	defer resp.Body.Close()

	var upstream struct {
		Data []struct {
			ID      string `json:"id"`
			Name    string `json:"name"`
			OwnedBy string `json:"owned_by"`
			Created int64  `json:"created"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&upstream); err != nil {
		httputil.WriteJSONCtx(r.Context(), w, http.StatusBadGateway,
			map[string]string{"error": "Modelle konnten nicht gelesen werden."})
		return
	}

	models := make([]modelInfo, 0, len(upstream.Data))
	for _, m := range upstream.Data {
		models = append(models, modelInfo{ID: m.ID, Name: m.Name, OwnedBy: m.OwnedBy, Created: m.Created})
	}
	// Nach Anzeigename sortieren (fällt auf die ID zurück, falls kein Name).
	sort.Slice(models, func(i, j int) bool {
		ni, nj := models[i].Name, models[j].Name
		if ni == "" {
			ni = models[i].ID
		}
		if nj == "" {
			nj = models[j].ID
		}
		return strings.ToLower(ni) < strings.ToLower(nj)
	})

	httputil.WriteJSONCtx(r.Context(), w, http.StatusOK, map[string]any{"models": models})
}

// ---------------------------------------------------------------------------
// POST /api/chat
// ---------------------------------------------------------------------------

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model     string        `json:"model"`
	Messages  []chatMessage `json:"messages"`
	MaxTokens int           `json:"maxTokens"`
	Stream    bool          `json:"stream"`
}

// upstreamChatRequest is the OpenAI-shaped body sent to the HRZ endpoint.
type upstreamChatRequest struct {
	Model     string        `json:"model"`
	Messages  []chatMessage `json:"messages"`
	MaxTokens *int          `json:"max_tokens,omitempty"`
	Stream    bool          `json:"stream"`
}

// Chat handles POST /api/chat (streaming and non-streaming).
func (h *Handler) Chat(w http.ResponseWriter, r *http.Request) {
	if !h.configured(w, r) {
		return
	}

	var req chatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteJSONCtx(r.Context(), w, http.StatusBadRequest, map[string]string{"error": "Ungültiger Request"})
		return
	}
	if req.Model == "" {
		httputil.WriteJSONCtx(r.Context(), w, http.StatusBadRequest, map[string]string{"error": "Kein Modell ausgewählt."})
		return
	}
	if len(req.Messages) == 0 {
		httputil.WriteJSONCtx(r.Context(), w, http.StatusBadRequest, map[string]string{"error": "Keine Nachrichten übergeben."})
		return
	}

	var maxTokens *int
	if req.MaxTokens > 0 {
		mt := req.MaxTokens
		maxTokens = &mt
	}

	body, err := json.Marshal(upstreamChatRequest{
		Model:     req.Model,
		Messages:  req.Messages,
		MaxTokens: maxTokens,
		Stream:    req.Stream,
	})
	if err != nil {
		httputil.WriteJSONCtx(r.Context(), w, http.StatusInternalServerError, map[string]string{"error": "Request konnte nicht erstellt werden."})
		return
	}

	if req.Stream {
		h.chatStream(w, r, body)
		return
	}
	h.chatOnce(w, r, body)
}

func (h *Handler) chatOnce(w http.ResponseWriter, r *http.Request, body []byte) {
	resp, err := h.upstream(r.Context(), http.MethodPost, "/chat/completions", body)
	if err != nil {
		httputil.WriteJSONCtx(r.Context(), w, http.StatusBadGateway,
			map[string]string{"error": fmt.Sprintf("Antwort konnte nicht generiert werden: %s", err.Error())})
		return
	}
	defer resp.Body.Close()

	var upstream struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
			FinishReason *string `json:"finish_reason"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&upstream); err != nil {
		httputil.WriteJSONCtx(r.Context(), w, http.StatusBadGateway,
			map[string]string{"error": "Antwort konnte nicht gelesen werden."})
		return
	}

	reply := ""
	var finishReason *string
	if len(upstream.Choices) > 0 {
		reply = upstream.Choices[0].Message.Content
		finishReason = upstream.Choices[0].FinishReason
	}
	httputil.WriteJSONCtx(r.Context(), w, http.StatusOK, map[string]any{"reply": reply, "finishReason": finishReason})
}

func (h *Handler) chatStream(w http.ResponseWriter, r *http.Request, body []byte) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, ok := w.(http.Flusher)
	if !ok {
		httputil.WriteJSONCtx(r.Context(), w, http.StatusInternalServerError, map[string]string{"error": "Streaming wird nicht unterstützt."})
		return
	}
	send := func(v any) {
		raw, _ := json.Marshal(v)
		fmt.Fprintf(w, "data: %s\n\n", raw)
		flusher.Flush()
	}

	resp, err := h.upstream(r.Context(), http.MethodPost, "/chat/completions", body)
	if err != nil {
		send(map[string]string{"error": fmt.Sprintf("Antwort konnte nicht generiert werden: %s", err.Error())})
		return
	}
	defer resp.Body.Close()

	var finishReason *string
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "[DONE]" {
			break
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
				FinishReason *string `json:"finish_reason"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(payload), &chunk); err != nil {
			continue
		}
		if len(chunk.Choices) > 0 {
			if c := chunk.Choices[0].Delta.Content; c != "" {
				send(map[string]string{"content": c})
			}
			if chunk.Choices[0].FinishReason != nil {
				finishReason = chunk.Choices[0].FinishReason
			}
		}
	}
	send(map[string]any{"done": true, "finishReason": finishReason})
}
