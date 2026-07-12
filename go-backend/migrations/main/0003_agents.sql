-- +goose Up
-- +goose StatementBegin

-- Agents (Ebene 1 — the "brain"): model, system prompt, rules, token cap, and
-- placeholders for tools/knowledge. Like widgets, an agent is stored as a
-- single JSONB blob keyed by its UUID string id, mirroring the shape the
-- frontend sends/receives (internal/agents/store_pg.go stores it verbatim).
--
-- This "un-smears" the agent config that until now lived inside each widget's
-- config blob. A widget becomes a thin front that references an agent by id
-- (widgets.data->>'agentId'); the backend resolves model/prompt from the agent.
CREATE TABLE IF NOT EXISTS agents (
    id         text        PRIMARY KEY,
    data       jsonb       NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Backfill: give every existing widget its own agent, extracting the "brain"
-- fields, then link the widget to it via a new agentId field.
--
-- The `src` CTE is MATERIALIZED so the volatile gen_random_uuid() is evaluated
-- exactly once per widget; the same aid is then used both to INSERT the agent
-- and to UPDATE the owning widget. Without MATERIALIZED the planner could
-- inline the CTE and re-evaluate the uuid, breaking the link.
--
-- knowledgeBaseId is the *model* id in this codebase (see internal/widgets/
-- chat.go: Model = KnowledgeBaseID), so it maps to agent.model. Real RAG
-- "knowledge" is a future, separate concept and starts empty here.
WITH src AS MATERIALIZED (
    SELECT id AS wid, gen_random_uuid()::text AS aid, data
    FROM widgets
    WHERE data->>'agentId' IS NULL      -- idempotent: skip already-linked widgets
),
ins AS (
    INSERT INTO agents (id, data)
    SELECT
        aid,
        jsonb_build_object(
            'id',           aid,
            'name',         COALESCE(NULLIF(data->>'name', ''), 'Agent'),
            'model',        COALESCE(data->>'knowledgeBaseId', ''),
            'systemPrompt', COALESCE(data->'config'->>'startPrompt', ''),
            'rules',        COALESCE(data->'config'->'rules', '[]'::jsonb),
            'maxTokens',    COALESCE(data->'config'->'maxTokensPerAnswer', to_jsonb(2000)),
            'tools',        '[]'::jsonb,
            'knowledge',    '[]'::jsonb
        )
    FROM src
    RETURNING id
)
UPDATE widgets w
SET data = jsonb_set(w.data, '{agentId}', to_jsonb(src.aid)),
    updated_at = now()
FROM src
WHERE w.id = src.wid;

-- Reverse lookup for the Agent List ("Verwendet von N Widgets") and to block
-- deleting an agent that is still referenced by a widget.
CREATE INDEX IF NOT EXISTS idx_widgets_agent_id ON widgets ((data->>'agentId'));

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Fold the agent's brain fields back into each referencing widget so the old
-- single-blob shape is restored, then drop the agents table.
UPDATE widgets w
SET data = (w.data - 'agentId')
        || jsonb_build_object('knowledgeBaseId', a.data->>'model')
        || jsonb_build_object('config',
             COALESCE(w.data->'config', '{}'::jsonb)
             || jsonb_build_object(
                  'startPrompt',        COALESCE(a.data->>'systemPrompt', ''),
                  'rules',              COALESCE(a.data->'rules', '[]'::jsonb),
                  'maxTokensPerAnswer', COALESCE(a.data->'maxTokens', to_jsonb(2000))
                )
           ),
    updated_at = now()
FROM agents a
WHERE w.data->>'agentId' = a.id;

DROP INDEX IF EXISTS idx_widgets_agent_id;
DROP TABLE IF EXISTS agents;

-- +goose StatementEnd
