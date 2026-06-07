-- ============================================================
-- migrations/003_auction_queue_and_bids.sql
-- auction_queue, bids, squad_players, bid_events — the auction runtime tables.
-- Run order: AFTER 002.
--
-- SYSTEM CONCEPT — auction_queue:
--   The queue is the ordered list of all players to be auctioned.
--   Fisher-Yates shuffle determines the order (see queueManager.ts in Phase 4).
--   `position` = the order slot (1, 2, 3... → last player).
--   `status` advances from 'pending' → 'active' → 'sold'/'unsold'.
--   The server reads `current_queue_position` from rooms table to find the current player.
--
-- SYSTEM CONCEPT — bids table vs Redis:
--   Redis: holds the CURRENT winning bid during active bidding (fast, ephemeral).
--   bids table: stores ALL bids as a permanent audit trail (slow, durable).
--   is_winning_bid = true marks which bid was the final accepted bid for a player.
--   This lets you reconstruct the full auction history from the DB alone (no Redis needed).
-- ============================================================

-- ─── auction_queue ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auction_queue (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id   UUID        NOT NULL REFERENCES players(id),
  position    INT         NOT NULL,  -- 1-indexed order in the queue
  phase       VARCHAR(20) NOT NULL CHECK (phase IN ('marquee', 'general')),
  status      VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'active', 'sold', 'unsold')),

  CONSTRAINT auction_queue_unique_position UNIQUE (room_id, position),
  CONSTRAINT auction_queue_unique_player   UNIQUE (room_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_auction_queue_room_position ON auction_queue(room_id, position);
CREATE INDEX IF NOT EXISTS idx_auction_queue_status ON auction_queue(room_id, status);

-- ─── bids ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bids (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         UUID        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id       UUID        NOT NULL REFERENCES players(id),
  room_member_id  UUID        NOT NULL REFERENCES room_members(id) ON DELETE CASCADE,
  amount_lakhs    INT         NOT NULL CHECK (amount_lakhs > 0),
  is_winning_bid  BOOLEAN     NOT NULL DEFAULT FALSE,
  placed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bids_player_room ON bids(player_id, room_id);
CREATE INDEX IF NOT EXISTS idx_bids_placed_at   ON bids(placed_at DESC);

-- ─── squad_players ────────────────────────────────────────────────────────────
-- Records the final acquisition of a player by a franchise.
-- Written when a player is SOLD (timer expires with at least one bid).
CREATE TABLE IF NOT EXISTS squad_players (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_member_id    UUID        NOT NULL REFERENCES room_members(id) ON DELETE CASCADE,
  player_id         UUID        NOT NULL REFERENCES players(id),
  price_paid_lakhs  INT         NOT NULL CHECK (price_paid_lakhs > 0),
  acquired_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- A player can only be in one squad per room
  CONSTRAINT squad_players_unique UNIQUE (room_member_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_squad_players_member ON squad_players(room_member_id);

-- ─── bid_events (audit log) ───────────────────────────────────────────────────
-- Append-only audit trail — never updated, never deleted.
-- Allows reconstructing the full auction sequence from the DB alone.
-- Used by: RUNBOOK recovery, post-game analytics, dispute resolution.
CREATE TABLE IF NOT EXISTS bid_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id   UUID        REFERENCES players(id),          -- NULL for room-level events
  user_id     UUID        REFERENCES users(id),            -- NULL for system events
  event_type  VARCHAR(30) NOT NULL
                CHECK (event_type IN (
                  'bid_placed', 'bid_rejected', 'bid_accepted',
                  'player_sold', 'player_unsold', 'timer_extended',
                  'auction_started', 'auction_completed',
                  'player_up', 'phase_transition'
                )),
  payload     JSONB       NOT NULL DEFAULT '{}'::jsonb,   -- Flexible extra data per event type
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bid_events_room       ON bid_events(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bid_events_event_type ON bid_events(event_type);
