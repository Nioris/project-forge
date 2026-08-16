-- Project Forge reference schema
-- verified-against: SQLite 3.40+ (WAL mode), 152-ФЗ compliant layout
-- verified-date: 2026-04-25
-- Review each quarter or before using against a fresh RuStore SDK / Node major.

-- ============================================================================
-- RuStore payments — SQL schema
-- ============================================================================
-- Apply to any SQLite / MySQL / Postgres project. Types adjusted for SQLite;
-- for Postgres use SERIAL / TIMESTAMPTZ / TEXT unchanged.
-- ============================================================================

-- Purchases ledger — every credit/debit is logged for audit.
--
--   type:   'credit' (user gains stars) | 'debit' (user spends)
--   source: 'rustore' | 'admin' | 'system' (AI usage)
--   state:  'pending' — RuStore still processing, retry cron will promote
--           'paid'    — validated, stars credited
--           'failed'  — validation rejected (product/app mismatch, cancelled, or pending expired)
--           'refunded'— RuStore reported refund; stars already rolled back
--
-- receipt_token holds the Pay SDK invoiceId (column kept historically).
-- last_checked_at is used by pending-purchase-retry cron to rate-limit re-queries.
CREATE TABLE IF NOT EXISTS purchases (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users(id),
  product_id       TEXT NOT NULL,
  stars            INTEGER NOT NULL,
  type             TEXT NOT NULL DEFAULT 'credit',
  source           TEXT DEFAULT 'rustore',
  receipt_token    TEXT,
  validated        INTEGER DEFAULT 0,
  state            TEXT DEFAULT 'paid',
  last_checked_at  TEXT,
  created_at       TEXT DEFAULT (datetime('now'))
);

-- Indexes supporting the pending-retry cron and admin per-user views.
CREATE INDEX IF NOT EXISTS idx_purchases_state
  ON purchases(state);
CREATE INDEX IF NOT EXISTS idx_purchases_user
  ON purchases(user_id, created_at DESC);

-- Security events — suspicious purchase attempts, rate-limit hits, etc.
-- Keeps attacks triageable separately from real transactions.
--
--   severity: 'critical' — known attack in progress (SKU swap, forged receipt)
--             'high'     — likely attack (cross-user replay)
--             'medium'   — abuse/anomaly (rate-limit hit, repeated failures)
--             'low'      — observational (infra failures, same-user retry)
CREATE TABLE IF NOT EXISTS security_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id),
  event_type  TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'medium',
  ip          TEXT,
  user_agent  TEXT,
  details     TEXT,                              -- JSON blob
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_security_events_created
  ON security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity
  ON security_events(severity);

-- ============================================================================
-- Migration from legacy schema (no state column)
-- ============================================================================
-- SQLite has no IF NOT EXISTS for ALTER TABLE — wrap these in try/catch
-- (see server/database.js initDatabase()) and ignore "duplicate column" errors.

-- ALTER TABLE purchases ADD COLUMN state TEXT DEFAULT 'paid';
-- ALTER TABLE purchases ADD COLUMN last_checked_at TEXT;

-- Backfill: preserve existing validated flag's meaning.
-- UPDATE purchases SET state = 'paid'   WHERE state IS NULL AND validated = 1;
-- UPDATE purchases SET state = 'failed' WHERE state IS NULL AND validated = 0;
