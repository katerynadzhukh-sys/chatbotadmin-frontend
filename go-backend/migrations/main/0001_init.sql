-- +goose Up
-- +goose StatementBegin

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users: local password, OIDC, and (future) LDAP accounts converge here.
CREATE TABLE IF NOT EXISTS users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username      varchar(255) NOT NULL UNIQUE,
    password_hash text         NOT NULL,
    auth_method   varchar(20)  NOT NULL DEFAULT 'local',
    first_name    varchar(255),
    last_name     varchar(255),
    email         varchar(255),
    role          varchar(50)  NOT NULL DEFAULT 'user',
    external_id   varchar(255),
    created_at    timestamp    NOT NULL DEFAULT now()
);

-- OIDC `sub` is unique when present (NULL for local/LDAP accounts).
CREATE UNIQUE INDEX IF NOT EXISTS users_external_id_unique_idx
    ON users (external_id) WHERE external_id IS NOT NULL;

-- Auth providers: a single active OIDC row is seeded from the environment.
CREATE TABLE IF NOT EXISTS auth_providers (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type       varchar(50)  NOT NULL,
    name       varchar(255) NOT NULL,
    config     jsonb        NOT NULL,
    is_active  boolean      NOT NULL DEFAULT true,
    created_at timestamp    NOT NULL DEFAULT now()
);

-- API keys: bcrypt-hashed bearer tokens (jrag_ prefix) for programmatic access.
CREATE TABLE IF NOT EXISTS api_keys (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         varchar(100) NOT NULL,
    key_hash     text         NOT NULL,
    key_prefix   varchar(13)  NOT NULL,
    last_used_at timestamp,
    expires_at   timestamp,
    created_at   timestamp    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_keys_key_prefix_idx ON api_keys (key_prefix);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS auth_providers;
DROP TABLE IF EXISTS users;
-- +goose StatementEnd
