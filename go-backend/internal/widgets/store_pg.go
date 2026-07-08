package widgets

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PGStore is a PostgreSQL-backed implementation of the widgets Store interface.
// Each widget is persisted as a single JSONB blob keyed by its string id.
type PGStore struct {
	pool *pgxpool.Pool
}

// NewStore creates a new PGStore backed by pool.
func NewStore(pool *pgxpool.Pool) *PGStore {
	return &PGStore{pool: pool}
}

// Compile-time interface assertion.
var _ Store = (*PGStore)(nil)

// List returns every widget's stored JSON, ordered by id. An empty (non-nil)
// slice is returned when there are no widgets.
func (s *PGStore) List(ctx context.Context) ([]json.RawMessage, error) {
	const sql = `SELECT data FROM widgets ORDER BY id`
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

// Get returns the stored JSON for id, or nil when no widget with that id exists.
func (s *PGStore) Get(ctx context.Context, id string) (json.RawMessage, error) {
	const sql = `SELECT data FROM widgets WHERE id = $1`
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

// Upsert inserts or replaces the widget with the given id and returns the
// stored JSON. The raw request JSON is stored verbatim so fields the backend
// does not model (e.g. stats, accent) survive a round-trip.
func (s *PGStore) Upsert(ctx context.Context, id string, data []byte) (json.RawMessage, error) {
	const sql = `
		INSERT INTO widgets (id, data, updated_at)
		VALUES ($1, $2::jsonb, now())
		ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
		RETURNING data`
	var out []byte
	if err := s.pool.QueryRow(ctx, sql, id, string(data)).Scan(&out); err != nil {
		return nil, err
	}
	return json.RawMessage(out), nil
}
