-- ============================================================
-- migrations/002_auction_tables.sql
-- room_members, players — auction participants and the player pool.
-- Run order: AFTER 001 (depends on users, rooms).
--
-- SYSTEM CONCEPT — UNIQUE(room_id, franchise):
--   Two users cannot select the same franchise in the same room.
--   WITHOUT this constraint: if two users click "Mumbai Indians" simultaneously,
--   both pass the application-level check (race condition), both INSERT → both claim MI.
--   WITH this constraint: the DB rejects the second INSERT with error code 23505.
--   The application catches 23505 and emits room:franchise_claimed_error.
--   This is the "belt AND suspenders" pattern — application logic + DB constraint.
-- ============================================================

-- ─── room_members ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS room_members (
  id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id                 UUID         NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id                 UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  franchise               VARCHAR(60)  NULL,        -- NULL until franchise is selected
  wallet_remaining_lakhs  INT          NOT NULL DEFAULT 12000,  -- ₹120 Cr = 12000 lakhs
  joined_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- One user per room
  CONSTRAINT room_members_unique_user_per_room UNIQUE (room_id, user_id),
  -- One franchise per room — prevents double-claiming
  -- NULLS NOT DISTINCT: NULL != NULL for this constraint (multiple NULL allowed — not yet selected)
  CONSTRAINT room_members_unique_franchise_per_room UNIQUE NULLS NOT DISTINCT (room_id, franchise)
);

CREATE INDEX IF NOT EXISTS idx_room_members_room ON room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_id);

-- ─── players ──────────────────────────────────────────────────────────────────
-- Players are loaded from the Excel seed file via seedPlayers.ts
-- All players are shared across all rooms (no room_id here — rooms share the same player pool)
CREATE TABLE IF NOT EXISTS players (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(100) NOT NULL,
  category        VARCHAR(80)  NOT NULL,   -- "Premium Marquee A", "Uncapped Indian Batters", etc.
  role            VARCHAR(20)  NOT NULL
                    CHECK (role IN ('batter', 'pacer', 'spinner', 'allrounder', 'wk')),
  nationality     VARCHAR(20)  NOT NULL
                    CHECK (nationality IN ('indian', 'overseas')),
  is_marquee      BOOLEAN      NOT NULL DEFAULT FALSE,
  is_capped       BOOLEAN      NOT NULL DEFAULT TRUE,
  base_price_lakhs INT         NOT NULL CHECK (base_price_lakhs > 0),

  CONSTRAINT players_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_players_is_marquee ON players(is_marquee);
CREATE INDEX IF NOT EXISTS idx_players_role ON players(role);
CREATE INDEX IF NOT EXISTS idx_players_nationality ON players(nationality);
