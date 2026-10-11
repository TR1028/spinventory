-- Spinventory · D1 column migrations: v2 (grip type, weights, blade service history, used-rubber backfill) and v4 (rubber custom name, stock quantity)
--
--   Local:   pnpm run db:migrate:v2:local
--   Remote:  pnpm run db:migrate:v2:remote
--
-- Only for databases created from an older worker/schema.sql (fresh databases created from the
-- current schema.sql already have these columns).
--
-- Safe for live data: every statement adds a NULLable column without a default, which SQLite applies
-- as a schema-only change; no existing row is rewritten or deleted.
--
-- Idempotency: SQLite has no `ADD COLUMN IF NOT EXISTS`, so the `db:migrate:v2:*` scripts run this
-- file through scripts/migrate-v2.mjs, which reads the current columns (PRAGMA table_info) and
-- executes only the statements whose column is missing; re-running it is a no-op. (Executing the
-- file directly with `wrangler d1 execute --file` also works once; a re-run then stops with
-- "duplicate column name" without changing anything.) As a last line of defence the Worker adds
-- any missing column itself on its first request (`ensureSchema` in worker/db.ts).
--
-- Keep each statement on one line: scripts/migrate-v2.mjs parses them.

-- Rackets: grip, weights and blade service history.
ALTER TABLE rackets ADD COLUMN grip_type TEXT;
ALTER TABLE rackets ADD COLUMN blade_weight_grams REAL;
ALTER TABLE rackets ADD COLUMN total_weight_grams REAL;
ALTER TABLE rackets ADD COLUMN started_at TEXT;
ALTER TABLE rackets ADD COLUMN initial_play_minutes INTEGER;

-- Rubbers: sheet weight and the history of sheets that were already in use when recorded.
ALTER TABLE rubbers ADD COLUMN weight_grams REAL;
ALTER TABLE rubbers ADD COLUMN initial_play_minutes INTEGER;
ALTER TABLE rubbers ADD COLUMN mounted_at TEXT;

-- v4 · Rubbers: custom name and inventory stock count (several identical brand-new sheets).
ALTER TABLE rubbers ADD COLUMN label TEXT;
ALTER TABLE rubbers ADD COLUMN quantity INTEGER;
