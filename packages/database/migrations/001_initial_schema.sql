-- ============================================================
-- migrations/001_initial_schema.sql
-- USERS and ROOMS — the foundation tables.
-- Run order: FIRST. Everything else depends on users.id.
--
-- SYSTEM CONCEPT — UUID primary keys (not auto-increment integers):
--   UUIDs (gen_random_uuid()) are globally unique — safe to generate client-side.
--   Integer auto-increment leaks information: GET /users/1, /users/2 reveals user count.
--   UUIDs prevent enumeration attacks.
--   Tradeoff: UUIDs are 16 bytes vs 4 bytes for int — acceptable for this scale.
--
-- SYSTEM CONCEPT — TIMESTAMPTZ (not TIMESTAMP):
--   TIMESTAMP stores time without timezone — ambiguous.
--   TIMESTAMPTZ stores UTC + converts on read based on session timezone.
--   Always use TIMESTAMPTZ for audit fields. Supabase returns ISO 8601 strings.
-- ============================================================

-- Enable UUID extension (available on Supabase by default)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) NOT NULL,
  username        VARCHAR(50)  NOT NULL,
  password_hash   TEXT         NOT NULL,   -- bcrypt hash, NEVER store plaintext
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_email_format CHECK (email LIKE '%@%'),
  CONSTRAINT users_username_length CHECK (char_length(username) >= 3)
);

-- Index for login queries (findUserByEmail is the most common users query)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ─── rooms ────────────────────────────────────────────────────────────────────
-- invite_code: a 6-character alphanumeric code displayed in the lobby (e.g. "XK7P2Q")
-- current_queue_position: which player in the auction_queue is currently being bid on
CREATE TABLE IF NOT EXISTS rooms (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code             CHAR(6)      NOT NULL,
  host_user_id            UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status                  VARCHAR(20)  NOT NULL DEFAULT 'lobby'
                            CHECK (status IN ('lobby', 'active', 'completed')),
  current_queue_position  INT          NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT rooms_invite_code_unique UNIQUE (invite_code),
  CONSTRAINT rooms_invite_code_format CHECK (invite_code ~ '^[A-Z0-9]{6}$')
);

CREATE INDEX IF NOT EXISTS idx_rooms_invite_code ON rooms(invite_code);
CREATE INDEX IF NOT EXISTS idx_rooms_host ON rooms(host_user_id);
