-- Spinventory · Cloudflare D1 (SQLite) schema
--
--   Local:   pnpm run db:migrate:local
--   Remote:  pnpm run db:migrate:remote
--
-- Idempotent (IF NOT EXISTS everywhere), so it is safe to re-run.
--
-- Databases created from an older version of this file: `CREATE TABLE IF NOT EXISTS` does not add
-- new columns to existing tables, so also run worker/migrate_v2.sql once
-- (pnpm run db:migrate:v2:local / db:migrate:v2:remote; idempotent and data-preserving).
--
-- Multi-user isolation: every business table is keyed by (user_id, id). Record ids are generated
-- on the client, and the demo seed data uses fixed ids that exist in every browser, so a global
-- `id` primary key would let one account's local-data import collide with another account's rows.
-- Dates are `YYYY-MM-DD` strings; timestamps are ISO-8601 strings.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT UNIQUE COLLATE NOCASE,
  -- NULL for accounts that only sign in through a third-party OAuth provider (reserved).
  password_hash TEXT,
  created_at TEXT NOT NULL
);

-- Reserved for future GitHub / Google sign-in.
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'github' | 'google'
  provider_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user ON oauth_accounts (user_id);

CREATE TABLE IF NOT EXISTS rackets (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  blade TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'inventory' (spare blade) | 'retired'
  forehand_rubber_id TEXT, -- currently mounted rubbers; NULL = empty slot
  backhand_rubber_id TEXT,
  sort_order INTEGER,
  notes TEXT,
  grip_type TEXT, -- 'FL' | 'ST' | 'AN' | 'CS' | 'JP' (v2 migration)
  blade_weight_grams REAL, -- bare blade weight
  total_weight_grams REAL, -- assembled racket weight
  started_at TEXT, -- date the blade was put into service
  initial_play_minutes INTEGER, -- play time before the blade was recorded
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS rubbers (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  racket_id TEXT, -- NULL while in inventory; kept after retirement for the racket's history
  side TEXT, -- 'forehand' | 'backhand'; NULL while in inventory
  name TEXT NOT NULL, -- model
  label TEXT, -- optional custom name telling sheets of the same model apart (v4 migration)
  quantity INTEGER, -- inventory stock: identical brand-new sheets in this record; NULL = 1 (v4 migration)
  hardness TEXT,
  thickness_mm REAL,
  weight_grams REAL, -- sheet weight (v2 migration)
  installed_at TEXT, -- first glued on; calendar life starts here. NULL for brand-new inventory sheets
  mounted_at TEXT, -- used sheets moved onto their racket after installed_at; sessions count from here
  removed_at TEXT, -- set when retired; life stops accumulating
  boosted INTEGER NOT NULL DEFAULT 0, -- 1 = boosting rubber (灌油胶皮): boosting logs and re-boost reminders
  custom_calendar_days INTEGER, -- NULL = 120 days
  custom_play_minutes INTEGER, -- NULL = 5400 minutes (90 h)
  initial_play_minutes INTEGER, -- play not covered by the current racket's sessions (before recording, earlier rackets)
  boost_cycle_days INTEGER, -- NULL = 21 days
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_rubbers_racket ON rubbers (user_id, racket_id);

CREATE TABLE IF NOT EXISTS boosting_logs (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rubber_id TEXT NOT NULL,
  date TEXT NOT NULL,
  boost_number INTEGER NOT NULL, -- 1-based, recalculated from (date, created_at, id) order
  layers INTEGER NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_boosting_logs_rubber ON boosting_logs (user_id, rubber_id, date);

CREATE TABLE IF NOT EXISTS play_sessions (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  racket_id TEXT NOT NULL,
  date TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_play_sessions_racket ON play_sessions (user_id, racket_id, date);
