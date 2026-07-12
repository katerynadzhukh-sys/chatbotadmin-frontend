package agents

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PGStore is a PostgreSQL-backed implementation of the agents Store interface.
// Each agent is persisted as a single JSONB blob keyed by its string id
// (a UUID), mirroring the widgets store: the raw request JSON is stored
// verbatim so fields the backend does not model survive a round-trip.
type PGStore struct {
	pool *pgxpool.Pool
}

// NewStore creates a new PGStore backed by pool.
func NewStore(pool *pgxpool.Pool) *PGStore {
	return &PGStore{pool: pool}
}

// Compile-time interface assertion.
var _ Store = (*PGStore)(nil)

// List returns every agent's stored JSON, ordered by id. An empty (non-nil)
// slice is returned when there are no agents.
func (s *PGStore) List(ctx context.Context) ([]json.RawMessage, error) {
	const sql = `SELECT data FROM agents ORDER BY id`
	rows, err := s.pool.Query(ctx, sql)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []json.RawMessage{}
	for rows.Next() {
		var data []byte
		if err := rows.Scan(&data); err != nil {
			return nil, err
		}
		out = append(out, json.RawMessage(data))
	}
	return out, rows.Err()
}

// Get returns the stored JSON for id, or nil when no agent with that id exists.
func (s *PGStore) Get(ctx context.Context, id string) (json.RawMessage, error) {
	const sql = `SELECT data FROM agents WHERE id = $1`
	var data []byte
	err := s.pool.QueryRow(ctx, sql, id).Scan(&data)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return json.RawMessage(data), nil
}

// Upsert inserts or replaces the agent with the given id and returns the stored
// JSON. The raw request JSON is stored verbatim.
func (s *PGStore) Upsert(ctx context.Context, id string, data []byte) (json.RawMessage, error) {
	const sql = `
		INSERT INTO agents (id, data, updated_at)
		VALUES ($1, $2::jsonb, now())
		ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
		RETURNING data`
	var out []byte
	if err := s.pool.QueryRow(ctx, sql, id, string(data)).Scan(&out); err != nil {
		return nil, err
	}
	return json.RawMessage(out), nil
}

// Delete removes the agent with the given id. It reports whether a row was
// actually deleted so the caller can distinguish a successful delete from a
// missing agent (404).
func (s *PGStore) Delete(ctx context.Context, id string) (bool, error) {
	const sql = `DELETE FROM agents WHERE id = $1`
	tag, err := s.pool.Exec(ctx, sql, id)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}
