/**
 * auction.ts
 *
 * MAJOR FUNCTION: The single source of truth for ALL auction business rules.
 * Every numeric limit in bidValidator.ts and bidEligibility.ts is imported from here.
 *
 * DESIGN DECISION — typed constants over hardcoded literals:
 *   BAD:  `if (franchiseState.wkCount >= 4)` — what does 4 mean? Where is it defined?
 *   GOOD: `if (franchiseState.wkCount >= WK_MAX)` — self-documenting, single source.
 *
 *   If the tournament changes the overseas limit from 8 to 6, you change one line
 *   here and both the frontend eligibility check and the backend validator update
 *   automatically. No grep-replace, no risk of missing a hardcoded 8 somewhere.
 *
 * `as const` assertions make each value a literal type (e.g., `12000`) not `number`.
 * This enables usage in type-level computations if needed.
 */

// ─── Wallet ────────────────────────────────────────────────────────────────────

/** Starting wallet for every franchise. ₹120 Crore = 12,000 Lakhs */
export const WALLET_TOTAL_LAKHS = 12_000 as const;

// ─── Squad Size ────────────────────────────────────────────────────────────────

/** Maximum total players a franchise can acquire */
export const SQUAD_MAX_SIZE = 25 as const;

// ─── Overseas Rules ────────────────────────────────────────────────────────────

/** Maximum overseas players per squad */
export const OVERSEAS_MAX = 8 as const;

// ─── Wicketkeeper Rules ────────────────────────────────────────────────────────

/** Maximum wicketkeepers per squad */
export const WK_MAX = 4 as const;

/** Minimum wicketkeepers required for a valid squad */
export const WK_MIN = 1 as const;

// ─── Price Tier Rules (Salary Cap) ────────────────────────────────────────────
// These tiers define how many players a franchise can acquire in each price band.
// The bid AMOUNT determines the tier, not the player's base price.

/** Bids at or above this amount (lakhs) count toward the Tier-25+ cap */
export const TIER_25_PLUS_THRESHOLD_LAKHS = 2_500 as const; // ₹25 Cr

/** Maximum players a franchise can acquire for ≥₹25 Cr */
export const TIER_25_PLUS_MAX = 1 as const;

/** Upper bound of the ₹20-25 Cr tier (inclusive) */
export const TIER_20_25_UPPER_LAKHS = 2_499 as const;
/** Lower bound of the ₹20-25 Cr tier (inclusive) */
export const TIER_20_25_LOWER_LAKHS = 2_000 as const;
/** Maximum players acquired in the ₹20-25 Cr tier */
export const TIER_20_25_MAX = 2 as const;

/** Upper bound of the ₹15-20 Cr tier (inclusive) */
export const TIER_15_20_UPPER_LAKHS = 1_999 as const;
/** Lower bound of the ₹15-20 Cr tier (inclusive) */
export const TIER_15_20_LOWER_LAKHS = 1_500 as const;
/** Maximum players acquired in the ₹15-20 Cr tier */
export const TIER_15_20_MAX = 3 as const;

// ─── Timer Settings ────────────────────────────────────────────────────────────

/** Initial countdown for each player (seconds) */
export const AUCTION_TIMER_SECONDS = 30 as const;

/**
 * Countdown reset on each accepted bid (seconds).
 * Shorter than the initial timer to maintain auction pace.
 * Every bid resets to 10 seconds, preventing a franchise from "sitting out" a bid.
 */
export const BID_RESET_TIMER_SECONDS = 10 as const;

/**
 * Pause between player_sold event and advancing to next player (milliseconds).
 * Gives clients time to display the SoldOverlay animation.
 * Must match the animation duration in SoldOverlay.tsx.
 */
export const SOLD_PAUSE_MS = 3_000 as const;

// ─── Rate Limiting ─────────────────────────────────────────────────────────────

/** Maximum bids per user per window */
export const RATE_LIMIT_BID_MAX = 10 as const;

/** Rate limit sliding window (milliseconds) */
export const RATE_LIMIT_WINDOW_MS = 5_000 as const;

// ─── Distributed Lock ──────────────────────────────────────────────────────────

/**
 * Maximum time a bid lock can be held (milliseconds).
 * If a server crashes while holding the lock, Redis auto-expires it after this TTL.
 * This prevents a "stuck lock" — a deadlock where no bids can be processed.
 * 5 seconds is generous — a successful bid validation takes <50ms.
 */
export const BID_LOCK_TTL_MS = 5_000 as const;
