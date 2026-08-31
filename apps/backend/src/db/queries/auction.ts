/**
 * apps/backend/src/db/queries/auction.ts
 *
 * MAJOR FUNCTION: All SQL for the auction runtime tables:
 *   auction_queue, bids, squad_players, bid_events, and wallet updates on room_members.
 *
 * SYSTEM CONCEPT — Tiered Durability (the core data architecture):
 *   FAST PATH (Redis):
 *     Current bid, current bidder, timer deadline, franchise wallet, auction state.
 *     Read/written on EVERY bid (~0.1ms per operation).
 *
 *   SLOW PATH (PostgreSQL — this file):
 *     Bid audit trail, squad ownership, wallet balance of record.
 *     Written ASYNCHRONOUSLY after Redis confirms the bid — never on the critical path.
 *
 *   Why async to Postgres?
 *     A bid arrives → lock acquired → Redis updated → response emitted → THEN Postgres written.
 *     Total latency for the bidder: ~5ms (Redis only).
 *     If Postgres write is synchronous: +3-5ms per bid → 10ms total → noticeable lag.
 *     If Postgres write fails: we log and alert, but the auction continues.
 *     The source of truth during the auction is Redis. Postgres is the durable audit copy.
 *     At auction end, the final state is reconciled and written durably.
 *
 * SYSTEM CONCEPT — Bulk INSERT for auction_queue:
 *   Instead of N individual INSERTs (one per player), we build one SQL statement
 *   with N rows. PostgreSQL processes this in a single round trip.
 *   For 94 players: 1 query vs 94 queries = 93 fewer round trips.
 */
import { pool } from '../client';
import type { Player, FranchiseName } from '@ipl-auction/shared';

// ─── Auction Queue ────────────────────────────────────────────────────────────

/**
 * Bulk insert all auction queue entries for a room.
 * Called once by queueManager.initializeQueue() after shuffle.
 * Uses a single INSERT with multiple value rows for efficiency.
 */
export async function insertAuctionQueue(
  roomId: string,
  orderedPlayers: Array<{ player: Player; phase: 'marquee' | 'general' }>
): Promise<void> {
  if (orderedPlayers.length === 0) return;

  // Build: INSERT INTO auction_queue VALUES ($1,$2,$3,...), ($4,$5,$6,...), ...
  const values: (string | number)[] = [];
  const placeholders: string[] = [];

  orderedPlayers.forEach(({ player, phase }, index) => {
    const base = index * 4; // 4 values per row
    placeholders.push(
      `(gen_random_uuid(), $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, 'pending')`
    );
    values.push(roomId, player.id, index + 1, phase); // position is 1-indexed
  });

  await pool.query(
    `INSERT INTO auction_queue (id, room_id, player_id, position, phase, status)
     VALUES ${placeholders.join(', ')}`,
    values
  );
}

/**
 * Get the full ordered queue for a room from the DB.
 * Used as Redis fallback when the cached queue is missing.
 */
export async function getAuctionQueueFromDB(roomId: string): Promise<
  Array<{
    playerId: string;
    position: number;
    phase: 'marquee' | 'general';
    status: string;
  }>
> {
  const result = await pool.query<{
    player_id: string;
    position: number;
    phase: 'marquee' | 'general';
    status: string;
  }>(
    `SELECT player_id, position, phase, status
     FROM auction_queue
     WHERE room_id = $1
     ORDER BY position ASC`,
    [roomId]
  );
  return result.rows.map((r) => ({
    playerId: r.player_id,
    position: r.position,
    phase: r.phase,
    status: r.status,
  }));
}

/**
 * Mark a queue entry as 'active' (currently on the block).
 * Called when the auction engine advances to a new player.
 */
export async function markQueueEntryActive(
  roomId: string,
  position: number
): Promise<void> {
  await pool.query(
    `UPDATE auction_queue SET status = 'active'
     WHERE room_id = $1 AND position = $2`,
    [roomId, position]
  );
}

/**
 * Mark a queue entry as 'sold' or 'unsold'.
 * Called when the timer expires.
 */
export async function resolveQueueEntry(
  roomId: string,
  position: number,
  outcome: 'sold' | 'unsold'
): Promise<void> {
  await pool.query(
    `UPDATE auction_queue SET status = $3
     WHERE room_id = $1 AND position = $2`,
    [roomId, position, outcome]
  );
}

/**
 * Advance the room's current_queue_position pointer by 1.
 * Called after each player is resolved (sold or unsold).
 */
export async function advanceQueuePosition(roomId: string): Promise<number> {
  const result = await pool.query<{ current_queue_position: number }>(
    `UPDATE rooms
     SET current_queue_position = current_queue_position + 1, updated_at = NOW()
     WHERE id = $1
     RETURNING current_queue_position`,
    [roomId]
  );
  return result.rows[0]?.current_queue_position ?? 0;
}

// ─── Bids ─────────────────────────────────────────────────────────────────────

/**
 * Write a bid to the persistent audit trail.
 * Called ASYNCHRONOUSLY after Redis has already accepted and broadcast the bid.
 * Never on the bid critical path — a write failure here doesn't affect the live auction.
 */
export async function insertBid(params: {
  roomId: string;
  playerId: string;
  roomMemberId: string;
  amountLakhs: number;
  isWinningBid: boolean;
}): Promise<void> {
  await pool.query(
    `INSERT INTO bids (id, room_id, player_id, room_member_id, amount_lakhs, is_winning_bid, placed_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())`,
    [
      params.roomId,
      params.playerId,
      params.roomMemberId,
      params.amountLakhs,
      params.isWinningBid,
    ]
  );
}

// ─── Squad Players ────────────────────────────────────────────────────────────

/**
 * Record a player acquisition in squad_players.
 * Deducts the winning bid from room_members.wallet_remaining_lakhs.
 * Both writes are in a SINGLE TRANSACTION — atomicity guarantee.
 * If either fails, neither commits — no phantom squad entries with stale wallets.
 */
export async function recordPlayerSold(params: {
  roomId: string;
  roomMemberId: string;
  playerId: string;
  priceLakhs: number;
  franchise: FranchiseName;
}): Promise<void> {
  // Use a client from the pool for explicit transaction control
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert squad acquisition
    await client.query(
      `INSERT INTO squad_players (id, room_member_id, player_id, price_paid_lakhs, acquired_at)
       VALUES (gen_random_uuid(), $1, $2, $3, NOW())`,
      [params.roomMemberId, params.playerId, params.priceLakhs]
    );

    // Deduct from wallet (source of truth in DB, mirrored in Redis during auction)
    await client.query(
      `UPDATE room_members
       SET wallet_remaining_lakhs = wallet_remaining_lakhs - $1
       WHERE id = $2 AND wallet_remaining_lakhs >= $1`,
      [params.priceLakhs, params.roomMemberId]
    );

    // Append to audit log
    await client.query(
      `INSERT INTO bid_events (id, room_id, player_id, user_id, event_type, payload, created_at)
       SELECT gen_random_uuid(), $1, $2, rm.user_id, 'player_sold',
              jsonb_build_object('franchise', $3::text, 'price_lakhs', $4::integer), NOW()
       FROM room_members rm WHERE rm.id = $5`,
      [
        params.roomId,
        params.playerId,
        params.franchise,
        params.priceLakhs,
        params.roomMemberId,
      ]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release(); // ALWAYS release — prevents connection pool exhaustion
  }
}

/**
 * Get the room_member row for a specific franchise in a room.
 * Used by auctionEngine to find the roomMemberId for the winning bidder.
 */
export async function getRoomMemberByFranchise(
  roomId: string,
  franchise: FranchiseName
): Promise<{ id: string; user_id: string } | null> {
  const result = await pool.query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM room_members WHERE room_id = $1 AND franchise = $2`,
    [roomId, franchise]
  );
  return result.rows[0] ?? null;
}

/**
 * Append an event to the bid_events audit log.
 * Append-only — never updated, never deleted.
 */
export async function appendBidEvent(params: {
  roomId: string;
  playerId?: string;
  userId?: string;
  eventType: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await pool.query(
    `INSERT INTO bid_events (id, room_id, player_id, user_id, event_type, payload, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())`,
    [
      params.roomId,
      params.playerId ?? null,
      params.userId ?? null,
      params.eventType,
      JSON.stringify(params.payload ?? {}),
    ]
  );
}
