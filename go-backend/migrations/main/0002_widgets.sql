-- +goose Up
-- +goose StatementBegin

-- Widget configurations. The full admin-facing widget object is stored as a
-- single JSONB blob keyed by its string id (e.g. "sales-tracker"), mirroring
-- the shape the frontend sends/receives. widget.js reads a reduced public
-- projection of this (see internal/widgets/handler.go).
CREATE TABLE IF NOT EXISTS widgets (
    id         text        PRIMARY KEY,
    data       jsonb       NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed the two demo widgets so the admin dashboard and the embedded widget
-- have data on a fresh database. ON CONFLICT DO NOTHING keeps any edits made
-- through the API on re-runs.
INSERT INTO widgets (id, data) VALUES
('support-bot', '{
  "id": "support-bot",
  "name": "Support Bot",
  "knowledgeBaseId": "jlu/gpt-oss-20b",
  "routing": "public",
  "status": "active",
  "icon": "Languages",
  "accent": "primary",
  "stats": { "conversations": 1204, "rating": 4.7 },
  "config": {
    "startPrompt": "Du bist der offizielle Assistent der JLU Gießen. Beantworte Fragen freundlich, sachlich und ausschließlich auf Basis der hinterlegten Wissensdatenbank.",
    "templates": ["Was ist die JLU?", "Wie bewerbe ich mich?", "Semesterticket", "Öffnungszeiten"],
    "rules": [
      { "text": "Nur auf Deutsch antworten", "enabled": true },
      { "text": "Keine persönlichen Daten speichern", "enabled": true },
      { "text": "Keine medizinischen Ratschläge geben", "enabled": true },
      { "text": "Keine Links zu externen Webseiten", "enabled": false }
    ],
    "saveHistory": true,
    "feedbackButtons": true,
    "rateLimitPerMinute": 20,
    "rateLimitPerUserPerDay": 100,
    "maxTokensPerAnswer": 2000,
    "title": "JLU Assistent",
    "greeting": "Hallo! Wie kann ich dir heute helfen?",
    "accentColor": "#0052ff",
    "position": "bottom-right"
  }
}'),
('sales-tracker', '{
  "id": "sales-tracker",
  "name": "Sales Tracker",
  "knowledgeBaseId": "jlu/gpt-oss-20b",
  "routing": "internal",
  "status": "paused",
  "icon": "LineChart",
  "accent": "secondary",
  "stats": { "conversations": 389, "rating": 4.5 },
  "config": {
    "startPrompt": "Du bist ein interner Assistent für das Vertriebsteam. Hilf bei Fragen zu Verkaufszahlen, Kundenkontakten und internen Prozessen.",
    "templates": [],
    "rules": [],
    "saveHistory": false,
    "feedbackButtons": false,
    "rateLimitPerMinute": 10,
    "rateLimitPerUserPerDay": 50,
    "maxTokensPerAnswer": 2000,
    "title": "Sales Tracker",
    "greeting": "Willkommen zurück! Wobei kann ich unterstützen?",
    "accentColor": "#7c4dff",
    "position": "bottom-left"
  }
}')
ON CONFLICT (id) DO NOTHING;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS widgets;
-- +goose StatementEnd
