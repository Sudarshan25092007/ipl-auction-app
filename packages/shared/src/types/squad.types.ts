/**
 * squad.types.ts
 *
 * MAJOR FUNCTION: Defines the live franchise wallet + squad composition state.
 * FranchiseState is the PRIMARY INPUT to the bid validator on every single bid.
 *
 * SYSTEM CONCEPT — FranchiseState lives in Redis, not just PostgreSQL:
 *   This struct is serialized as JSON and stored at:
 *     Redis key: `auction:{roomId}:franchise:{franchiseName}`
 *
 *   Why Redis and not just the DB?
 *     - PostgreSQL read: ~1-5ms (network roundtrip to Supabase)
 *     - Redis read: ~0.1-0.5ms (in-memory, co-located)
 *     - In a live auction with 3-5 bids/second, every bid triggers a FranchiseState read.
 *     - The bid validation path is synchronous inside a distributed lock — every ms counts.
 *     - FranchiseState is hot-path data: Redis is the correct tier.
 *     - PostgreSQL has the authoritative copy, updated async after each player sale.
 */

import type { Player } from './player.types';
import type { FranchiseName } from './room.types';

/**
 * FranchiseState — the live salary cap and squad composition snapshot.
 * Read on EVERY bid to validate against salary cap rules.
 *
 * All numeric fields are integers (integer arithmetic only — no floating-point).
 * Tier counts track how many players were ACQUIRED at each price bracket,
 * not a player's base price category.
 */
export interface FranchiseState {
  franchise: FranchiseName;

  /** Starts at 12,000. Decremented by winning bid amount on each player sold. */
  walletRemainingLakhs: number;

  /** Total players acquired. Maximum: SQUAD_MAX_SIZE (25) */
  squadCount: number;

  // ─── Price Tier Counts ───────────────────────────────────────────────────────
  // These count acquisitions at each PRICE BRACKET, not player category.
  // A "₹5L base price" player bought for ₹2600L goes into tier25Plus.

  /** Players acquired for ≥2,500 lakhs (₹25 Cr). Cap: TIER_25_PLUS_MAX (1) */
  tier25PlusCount: number;

  /** Players acquired for 2,000–2,499 lakhs (₹20-24.99 Cr). Cap: TIER_20_25_MAX (2) */
  tier20to25Count: number;

  /** Players acquired for 1,500–1,999 lakhs (₹15-19.99 Cr). Cap: TIER_15_20_MAX (3) */
  tier15to20Count: number;

  // ─── Composition Counts ─────────────────────────────────────────────────────

  /** Maximum 8 overseas players per squad. */
  overseasCount: number;

  /** No hard cap, but affects CANNOT_COMPLETE_VALID_SQUAD calculation. */
  uncappedCount: number;

  /** Maximum 4 wicketkeepers. Minimum 1 required for a valid squad. */
  wkCount: number;

  /** Running count for squad composition checks. */
  batterCount: number;

  /** Covers both pacers and spinners for broad composition validation. */
  bowlerCount: number;

  /** All-rounders count. */
  allRounderCount: number;
}

/**
 * A player that has been won at auction by a franchise.
 * Persisted in the `squad_players` table.
 *
 * Differs from `Player`: includes WHO owns them and HOW MUCH was paid.
 * The `pricePaidLakhs` is the final winning bid — immutable once the player is sold.
 */
export interface SquadPlayer {
  readonly roomMemberId: string; // FK → room_members.id
  readonly player: Player; // Full player details (joined from players table)
  readonly pricePaidLakhs: number; // Winning bid amount. Never changes after sale.
  readonly acquiredAt: Date;
}

/**
 * A full squad: franchise identity + all acquired players + wallet summary.
 * Used on the results page and in the squad sidebar.
 * Not stored as-is in Redis — assembled from SquadPlayer list + FranchiseState.
 */
export interface Squad {
  franchise: FranchiseName;
  members: SquadPlayer[];
  walletSpentLakhs: number; // 12000 - walletRemainingLakhs
  walletRemainingLakhs: number;
}

/**
 * SquadSummary — lean version for socket event payloads.
 * Socket events should carry only delta data, not full squad arrays.
 * Full squad data is available via REST: GET /rooms/:code/squads
 *
 * This is emitted in PlayerSoldPayload to update all clients' squad sidebars
 * without sending the entire squad array on every sale.
 */
export interface SquadSummary {
  franchise: FranchiseName;
  totalPlayersAcquired: number;
  walletRemainingLakhs: number;
  lastAcquiredPlayer: Pick<Player, 'id' | 'name' | 'role'>;
}
