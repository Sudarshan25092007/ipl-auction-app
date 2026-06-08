/**
 * apps/backend/src/services/queueManager.ts
 *
 * MAJOR FUNCTION: Manages the ordered auction queue — initialization, retrieval, and advancement.
 * This is the COMPLETE replacement of the Phase 3 stub.
 *
 * SYSTEM CONCEPT — Fisher-Yates Shuffle (Knuth Shuffle):
 *   The algorithm for an unbiased random permutation of N items.
 *   Naïve approach (sort by Math.random()):
 *     array.sort(() => Math.random() - 0.5) — BIASED. Not all permutations equally likely.
 *     Reason: sort algorithms compare elements multiple times, creating statistical correlations.
 *
 *   Fisher-Yates (O(n), provably unbiased):
 *     for i from n-1 down to 1:
 *       j = random integer in [0, i]
 *       swap(array[i], array[j])
 *
 *   Each element gets exactly one random "landing spot" — every permutation equally likely.
 *   Vital for auction fairness: no franchise gets an unfair advantage from player ordering.
 *
 * SYSTEM CONCEPT — Queue Caching Strategy:
 *   On initialization:
 *     1. Fetch players from DB (slow, one-time)
 *     2. Shuffle them (CPU, one-time)
 *     3. Bulk INSERT into auction_queue (DB, one-time)
 *     4. Serialize as JSON → store in Redis with 24h TTL (fast reads forever after)
 *
 *   On getNextPlayer:
 *     1. Read current_queue_position from rooms table (always DB — it's the authoritative pointer)
 *     2. Try Redis: GET auction:{roomId}:queue → parse JSON → index into array
 *     3. If Redis miss (cold start, eviction): query auction_queue table → rebuild in Redis
 *
 *   This gives O(1) amortized player lookups after the first call.
 *
 * SYSTEM CONCEPT — Phase Detection:
 *   The queue has two phases: 'marquee' (premium players first) then 'general'.
 *   Phase transition is detected when the CURRENT player is 'general' AND the PREVIOUS was 'marquee'.
 *   On detection: emit auction:phase_transition to the room.
 *   Frontend shows a 5-second interstitial before continuing.
 */
import { pool } from '../db/client';
import { redis } from '../redis/client';
import { REDIS_KEYS } from '../redis/keys';
import { getAllPlayers } from '../db/queries/players';
import {
  insertAuctionQueue,
  markQueueEntryActive,
  advanceQueuePosition,
  resolveQueueEntry,
} from '../db/queries/auction';
import type { Player } from '@ipl-auction/shared';

// ─── Fisher-Yates Shuffle ─────────────────────────────────────────────────────

/**
 * In-place Fisher-Yates shuffle. Mutates the input array.
 * O(n) time, O(1) extra space. Provably uniform distribution.
 */
function fisherYatesShuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]; // ES6 destructuring swap — no temp variable
  }
  return arr;
}

// ─── Queue Shape (what we store in Redis) ────────────────────────────────────

interface QueueEntry {
  player: Player;
  phase: 'marquee' | 'general';
  position: number; // 1-indexed
}

// ─── initializeQueue ─────────────────────────────────────────────────────────

/**
 * Full implementation — replaces the Phase 3 stub.
 * Called by roomHandler when host fires room:start_auction.
 */
export async function initializeQueue(roomId: string): Promise<void> {
  console.info(`[QueueManager] Initializing queue for room ${roomId}`);

  // 1. Fetch all players from DB, split by marquee
  const { marquee, general } = await getAllPlayers();

  // 2. Shuffle each group independently (marquee first, then general)
  const shuffledMarquee = fisherYatesShuffle([...marquee]);
  const shuffledGeneral = fisherYatesShuffle([...general]);
  const orderedPlayers = [
    ...shuffledMarquee.map((p) => ({ player: p, phase: 'marquee' as const })),
    ...shuffledGeneral.map((p) => ({ player: p, phase: 'general' as const })),
  ];

  // 3. Bulk INSERT into auction_queue table (one round trip for 94 players)
  await insertAuctionQueue(roomId, orderedPlayers);

  // 4. Build QueueEntry[] and cache as JSON in Redis (24h TTL)
  const queueEntries: QueueEntry[] = orderedPlayers.map((item, index) => ({
    player: item.player,
    phase: item.phase,
    position: index + 1,
  }));

  await redis.set(
    REDIS_KEYS.auctionQueue(roomId),
    JSON.stringify(queueEntries),
    'EX',
    86_400 // 24 hours TTL — longer than any possible auction
  );

  // 5. Initialize auction state in Redis
  await redis.set(REDIS_KEYS.auctionState(roomId), 'idle');
  await redis.set(REDIS_KEYS.currentBid(roomId), '0');

  console.info(`[QueueManager] Queue initialized: ${shuffledMarquee.length} marquee + ${shuffledGeneral.length} general players`);
}

// ─── getNextPlayer ─────────────────────────────────────────────────────────────

/**
 * Get the player at the current queue position.
 * Returns null when the queue is exhausted (auction complete).
 *
 * @param roomId  The room UUID
 * @returns       The next QueueEntry or null
 */
export async function getNextPlayer(roomId: string): Promise<QueueEntry | null> {
  // 1. Get current position from DB (authoritative pointer)
  const roomResult = await pool.query<{ current_queue_position: number }>(
    `SELECT current_queue_position FROM rooms WHERE id = $1`,
    [roomId]
  );
  const position = roomResult.rows[0]?.current_queue_position ?? 0;

  // 2. Load queue from Redis (fast path)
  let queue: QueueEntry[] | null = null;

  const cached = await redis.get(REDIS_KEYS.auctionQueue(roomId));
  if (cached) {
    queue = JSON.parse(cached) as QueueEntry[];
  } else {
    // 3. Redis miss → rebuild from DB (cold start / eviction fallback)
    console.warn(`[QueueManager] Redis cache miss for room ${roomId} — falling back to DB`);
    queue = await rebuildQueueFromDB(roomId);
    if (queue) {
      await redis.set(REDIS_KEYS.auctionQueue(roomId), JSON.stringify(queue), 'EX', 86_400);
    }
  }

  if (!queue || position >= queue.length) {
    return null; // Queue exhausted — signal auction end
  }

  return queue[position]; // position is 0-indexed, queue is 0-indexed array
}

// ─── advanceQueue ─────────────────────────────────────────────────────────────

/**
 * Advance the queue pointer by 1 after resolving the current player.
 * @param outcome  Whether the player was sold or unsold (for queue entry status)
 * @returns        The new queue position (useful for logging/events)
 */
export async function advanceQueue(
  roomId: string,
  currentPosition: number,
  outcome: 'sold' | 'unsold'
): Promise<number> {
  // Mark current entry resolved
  await resolveQueueEntry(roomId, currentPosition + 1, outcome); // +1 because DB position is 1-indexed

  // Increment the pointer in rooms table
  const newPosition = await advanceQueuePosition(roomId);

  // Mark next entry as active (if it exists)
  const nextEntry = await getNextPlayer(roomId);
  if (nextEntry) {
    await markQueueEntryActive(roomId, nextEntry.position);
  }

  return newPosition;
}

// ─── detectPhaseTransition ────────────────────────────────────────────────────

/**
 * Check if we're crossing the marquee → general phase boundary.
 * Returns true if the CURRENT player is the first 'general' player.
 */
export async function detectPhaseTransition(roomId: string): Promise<boolean> {
  const roomResult = await pool.query<{ current_queue_position: number }>(
    `SELECT current_queue_position FROM rooms WHERE id = $1`,
    [roomId]
  );
  const position = roomResult.rows[0]?.current_queue_position ?? 0;
  if (position === 0) return false;

  const cached = await redis.get(REDIS_KEYS.auctionQueue(roomId));
  if (!cached) return false;

  const queue = JSON.parse(cached) as QueueEntry[];
  const current = queue[position];
  const previous = queue[position - 1];

  return !!(current?.phase === 'general' && previous?.phase === 'marquee');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function rebuildQueueFromDB(roomId: string): Promise<QueueEntry[] | null> {
  // This is the cold-start fallback — fetch queue order from DB + player details
  const result = await pool.query<{
    player_id: string;
    position: number;
    phase: 'marquee' | 'general';
    name: string;
    category: string;
    role: string;
    nationality: string;
    is_marquee: boolean;
    is_capped: boolean;
    base_price_lakhs: number;
  }>(
    `SELECT aq.player_id, aq.position, aq.phase,
            p.name, p.category, p.role, p.nationality, p.is_marquee, p.is_capped, p.base_price_lakhs
     FROM auction_queue aq
     JOIN players p ON p.id = aq.player_id
     WHERE aq.room_id = $1
     ORDER BY aq.position ASC`,
    [roomId]
  );

  if (result.rows.length === 0) return null;

  return result.rows.map((row) => ({
    player: {
      id: row.player_id,
      name: row.name,
      category: row.category,
      role: row.role as Player['role'],
      nationality: row.nationality as Player['nationality'],
      isMarquee: row.is_marquee,
      isCapped: row.is_capped,
      basePriceLakhs: row.base_price_lakhs,
    },
    phase: row.phase,
    position: row.position,
  }));
}

export type { QueueEntry };
