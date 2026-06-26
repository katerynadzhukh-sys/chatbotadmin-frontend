// Package mainmigrations embeds the SQL migration files for the primary
// database so they can be applied by the goose runner without shipping the
// raw .sql files alongside the binary.
package mainmigrations

import "embed"

// FS holds the embedded migration SQL files.
//
//go:embed *.sql
var FS embed.FS
