/**
 * apps/backend/src/services/franchiseStateService.ts
 *
 * MAJOR FUNCTION: Manages the FranchiseState hot data in Redis.
 * FranchiseState is the salary-cap + squad-composition snapshot for each franchise.
 * It is the PRIMARY input to bidValidator.canBid() — read on EVERY bid.
 *
 * SYSTEM CONCEPT — Why Redis, not PostgreSQL, for FranchiseState?
 *   canBid() is called on EVERY bid attempt. During peak auction (3-5 bids/second):
 *   - PostgreSQL read: ~3ms per call → 9-15ms of DB time per second just for validation
 *   - Redis read: ~0.3ms per call → 0.9-1.5ms per second
 *
 *   Redis is 10x faster for this access pattern. The wallet and composition counts
 *   change only when a player is won — infrequent writes, extremely frequent reads.
 *   That's the ideal Redis use case.
 *
 * SYSTEM CONCEPT — Redis as Write-Through Cache:
 *   When a player is won:
 *     1. Immediately update Redis FranchiseState (fast, authoritative for auction)
 *     2. Async write to room_members.wallet_remaining_lakhs in PostgreSQL (durable)
 *   If Redis restarts mid-auction, loadFranchiseState falls back to DB to rebuild.
 *
 * SYSTEM CONCEPT — Serialization:
 *   Redis only stores strings. We serialize FranchiseState as JSON:
 *     SET auction:{roomId}:franchise:{name}  '{"walletRemainingLakhs":12000,...}'
 *   JSON.parse on every read is ~0.01ms — negligible.
 */
import { redis } from '../redis/client';
import { REDIS_KEYS } from '../redis/keys';
import { pool } from '../db/client';
import { WALLET_TOTAL_LAKHS } from '@ipl-auction/shared';
import type { FranchiseState, FranchiseName } from '@ipl-auction/shared';
import { getMembersForRoom } from '../db/queries/rooms';

const FRANCHISE_STATE_TTL = 86_400; // 24 hours

// ─── Initialize ───────────────────────────────────────────────────────────────

/**
 * Initialize Redis FranchiseState for ALL franchises in a room.
 * Called once when auction starts (room:start_auction).
 * Sets every franchise's wallet to 12000 and all counts to 0.
 */
export async function initAllFranchiseStates(roomId: string): Promise<void> {
  const members = await getMembersForRoom(roomId);

  const pipeline = redis.pipeline(); // Batch all SETs in one round trip

  for (const member of members) {
    if (!member.franchise) continue; // Skip members who haven't selected a franchise

    const state: FranchiseState = {
      franchise: member.franchise as FranchiseName,
      walletRemainingLakhs: WALLET_TOTAL_LAKHS,
      squadCount: 0,
      tier25PlusCount: 0,
      tier20to25Count: 0,
      tier15to20Count: 0,
      overseasCount: 0,
      uncappedCount: 0,
      wkCount: 0,
      batterCount: 0,
      bowlerCount: 0,
      allRounderCount: 0,
    };

    pipeline.set(
      REDIS_KEYS.franchiseState(roomId, member.franchise),
      JSON.stringify(state),
      'EX',
      FRANCHISE_STATE_TTL
    );
  }

  await pipeline.exec();
  console.info(
    `[FranchiseState] Initialized state for ${members.length} franchises in room ${roomId}`
  );
}

// ─── Load ─────────────────────────────────────────────────────────────────────

/**
 * Load FranchiseState for a single franchise.
 * Hot path: Redis hit (~0.3ms). DB fallback on cache miss.
 */
export async function loadFranchiseState(
  roomId: string,
  franchise: FranchiseName
): Promise<FranchiseState | null> {
  const cached = await redis.get(REDIS_KEYS.franchiseState(roomId, franchise));

  if (cached) {
    return JSON.parse(cached) as FranchiseState;
  }

  // Redis miss → rebuild from DB
  console.warn(
    `[FranchiseState] Cache miss for ${franchise} in room ${roomId} — rebuilding from DB`
  );
  return await rebuildFranchiseStateFromDB(roomId, franchise);
}

// ─── Deduct (on player sold) ──────────────────────────────────────────────────

/**
 * Update Redis FranchiseState after a player is won.
 * Deducts bid amount from wallet, increments all relevant counters.
 * Called BEFORE the async PostgreSQL write (Redis is the hot source of truth during auction).
 */
export async function deductFromFranchiseState(
  roomId: string,
  franchise: FranchiseName,
  priceLakhs: number,
  player: {
    nationality: 'indian' | 'overseas';
    role: 'batter' | 'pacer' | 'spinner' | 'allrounder' | 'wk';
    isCapped: boolean;
    basePriceLakhs: number;
  }
): Promise<FranchiseState> {
  const current = await loadFranchiseState(roomId, franchise);
  if (!current)
    throw new Error(
      `FranchiseState not found for ${franchise} in room ${roomId}`
    );

  // Determine price tier for the winning bid
  let tier: 'tier25Plus' | 'tier20to25' | 'tier15to20' | 'below15';
  if (priceLakhs >= 2_500) tier = 'tier25Plus';
  else if (priceLakhs >= 2_000) tier = 'tier20to25';
  else if (priceLakhs >= 1_500) tier = 'tier15to20';
  else tier = 'below15';

  const updated: FranchiseState = {
    ...current,
    walletRemainingLakhs: current.walletRemainingLakhs - priceLakhs,
    squadCount: current.squadCount + 1,
    tier25PlusCount:
      tier === 'tier25Plus'
        ? current.tier25PlusCount + 1
        : current.tier25PlusCount,
    tier20to25Count:
      tier === 'tier20to25'
        ? current.tier20to25Count + 1
        : current.tier20to25Count,
    tier15to20Count:
      tier === 'tier15to20'
        ? current.tier15to20Count + 1
        : current.tier15to20Count,
    overseasCount:
      player.nationality === 'overseas'
        ? current.overseasCount + 1
        : current.overseasCount,
    uncappedCount: !player.isCapped
      ? current.uncappedCount + 1
      : current.uncappedCount,
    wkCount: player.role === 'wk' ? current.wkCount + 1 : current.wkCount,
    batterCount:
      player.role === 'batter' ? current.batterCount + 1 : current.batterCount,
    bowlerCount:
      player.role === 'pacer' || player.role === 'spinner'
        ? current.bowlerCount + 1
        : current.bowlerCount,
    allRounderCount:
      player.role === 'allrounder'
        ? current.allRounderCount + 1
        : current.allRounderCount,
  };

  await redis.set(
    REDIS_KEYS.franchiseState(roomId, franchise),
    JSON.stringify(updated),
    'EX',
    FRANCHISE_STATE_TTL
  );

  return updated;
}

/**
 * Load all franchise states for a room (used in STATE_SYNC for reconnecting clients).
 */
export async function loadAllFranchiseStates(
  roomId: string
): Promise<Record<string, FranchiseState>> {
  const members = await getMembersForRoom(roomId);
  const states: Record<string, FranchiseState> = {};

  for (const member of members) {
    if (!member.franchise) continue;
    const state = await loadFranchiseState(
      roomId,
      member.franchise as FranchiseName
    );
    if (state) {
      states[member.franchise] = state;
    }
  }

  return states;
}

// ─── DB Rebuild Fallback ─────────────────────────────────────────────────────

async function rebuildFranchiseStateFromDB(
  roomId: string,
  franchise: FranchiseName
): Promise<FranchiseState | null> {
  // Get wallet from room_members
  const memberResult = await pool.query<{
    id: string;
    wallet_remaining_lakhs: number;
  }>(
    `SELECT id, wallet_remaining_lakhs FROM room_members WHERE room_id = $1 AND franchise = $2`,
    [roomId, franchise]
  );
  const member = memberResult.rows[0];
  if (!member) return null;

  // Count acquired players by category
  const squadResult = await pool.query<{
    count: string;
    role: string;
    nationality: string;
    is_capped: boolean;
    price_paid_lakhs: number;
  }>(
    `SELECT p.role, p.nationality, p.is_capped, sp.price_paid_lakhs
     FROM squad_players sp
     JOIN players p ON p.id = sp.player_id
     WHERE sp.room_member_id = $1`,
    [member.id]
  );

  // Rebuild counts from acquired players
  const state: FranchiseState = {
    franchise,
    walletRemainingLakhs: member.wallet_remaining_lakhs,
    squadCount: squadResult.rows.length,
    tier25PlusCount: squadResult.rows.filter((r) => r.price_paid_lakhs >= 2_500)
      .length,
    tier20to25Count: squadResult.rows.filter(
      (r) => r.price_paid_lakhs >= 2_000 && r.price_paid_lakhs < 2_500
    ).length,
    tier15to20Count: squadResult.rows.filter(
      (r) => r.price_paid_lakhs >= 1_500 && r.price_paid_lakhs < 2_000
    ).length,
    overseasCount: squadResult.rows.filter((r) => r.nationality === 'overseas')
      .length,
    uncappedCount: squadResult.rows.filter((r) => !r.is_capped).length,
    wkCount: squadResult.rows.filter((r) => r.role === 'wk').length,
    batterCount: squadResult.rows.filter((r) => r.role === 'batter').length,
    bowlerCount: squadResult.rows.filter(
      (r) => r.role === 'pacer' || r.role === 'spinner'
    ).length,
    allRounderCount: squadResult.rows.filter((r) => r.role === 'allrounder')
      .length,
  };

  // Re-cache the rebuilt state
  await redis.set(
    REDIS_KEYS.franchiseState(roomId, franchise),
    JSON.stringify(state),
    'EX',
    FRANCHISE_STATE_TTL
  );

  return state;
}
