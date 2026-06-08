/**
 * apps/backend/src/redis/keys.ts
 *
 * MAJOR FUNCTION: The single registry for ALL Redis key templates in the system.
 * No code outside this file is allowed to construct a Redis key string by hand.
 *
 * SYSTEM CONCEPT — Why centralize keys:
 *   The most insidious Redis bug is a KEY COLLISION — two different concerns
 *   accidentally reading/writing the same key. Example:
 *     timerService writes: `auction:${roomId}:state`     (auction state)
 *     roomHandler  writes: `auction:${roomId}:state`     (OOPS — overwrites timer!)
 *
 *   By centralizing ALL key templates here, you get a complete audit of the
 *   entire Redis keyspace in one file. Any collision is immediately visible.
 *   If you want to add a new Redis key, you MUST add it here first.
 *
 * `as const`: Makes the return types literal strings (not generic `string`).
 *   This lets TypeScript catch typos in key names at compile time.
 *
 * TTL GUIDELINES (documented next to each key):
 *   auction state keys: TTL = auction duration + 1 hour buffer
 *   lock keys:          TTL = 5 seconds max (prevents deadlock)
 *   presence keys:      TTL = 2 hours (after which user is considered gone)
 *   rate limit keys:    TTL = sliding window duration (5 seconds)
 */
export const REDIS_KEYS = {
  // ─── Presence (Phase 3) ─────────────────────────────────────────────────────
  // Hash: { userId: '1' | '0' } — 1 = online, 0 = offline
  // TTL: 2 hours after last update
  presence: (roomCode: string) => `presence:${roomCode}` as const,

  // ─── Auction Hot State (Phase 4) ────────────────────────────────────────────
  // String: 'idle' | 'player_up' | 'bidding' | 'sold' | 'complete'
  auctionState:   (roomId: string) => `auction:${roomId}:state` as const,
  // String: JSON-serialized Player object
  currentPlayer:  (roomId: string) => `auction:${roomId}:current_player` as const,
  // String: Integer lakhs (e.g., "500")
  currentBid:     (roomId: string) => `auction:${roomId}:current_bid` as const,
  // String: FranchiseName (e.g., "Mumbai Indians")
  currentBidder:  (roomId: string) => `auction:${roomId}:current_bidder` as const,
  // String: JSON-serialized Player[] — the entire ordered auction queue
  auctionQueue:   (roomId: string) => `auction:${roomId}:queue` as const,

  // ─── Timer (Phase 4) ────────────────────────────────────────────────────────
  // String: Unix ms timestamp when current timer expires
  // Storing absolute deadline (not relative countdown) = crash-safe recovery
  timerDeadline:  (roomId: string) => `auction:${roomId}:timer_deadline` as const,

  // ─── Distributed Lock (Phase 4) ────────────────────────────────────────────
  // String: UUID token — the "key" that proves lock ownership
  // TTL: 5 seconds max — Redis auto-expires stuck locks (deadlock prevention)
  bidLock:        (roomId: string) => `auction:${roomId}:bid_lock` as const,

  // ─── Franchise State (Phase 4) ──────────────────────────────────────────────
  // String: JSON-serialized FranchiseState (wallet, squad counts, tier counts)
  franchiseState: (roomId: string, franchise: string) =>
    `auction:${roomId}:franchise:${franchise}` as const,

  // ─── Rate Limiting (Phase 6) ────────────────────────────────────────────────
  // Sorted set: member=timestamp, score=timestamp (sliding window)
  bidRateLimit:   (userId: string) => `ratelimit:bid:${userId}` as const,
} as const;
