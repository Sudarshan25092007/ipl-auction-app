/**
 * bid.types.ts
 *
 * MAJOR FUNCTION: Defines the complete vocabulary for the bid lifecycle.
 * Every bid attempt flows through these types:
 *   BidIntent → BidValidationResult → (if valid) Bid persisted to DB
 *
 * The `BidRejectionReason` union is the key type — it is the exhaustive list of
 * every way a bid can fail. Adding a new reason here forces TypeScript to flag
 * every unhandled case in switch statements across the codebase.
 */

import type { FranchiseName } from './room.types';

/**
 * All possible reasons a bid can be rejected.
 *
 * SYSTEM CONCEPT — Exhaustive union for compiler-enforced completeness:
 *   Every switch/if-else on BidRejectionReason is checked by TypeScript.
 *   If you add a new rejection reason, the compiler flags every switch that
 *   doesn't handle it. This is "make invalid states unrepresentable" — the
 *   compiler, not runtime testing, enforces completeness.
 *
 *   The frontend's useBidEligibility hook switches on this to render the
 *   correct tooltip text. The backend's bidValidator returns this to emit
 *   the correct humanMessage in BidRejectedPayload.
 */
export type BidRejectionReason =
  | 'WALLET_EXHAUSTED'              // Proposed bid > walletRemainingLakhs
  | 'TIER_25_PLUS_LIMIT_REACHED'    // Already have 1 player acquired at ≥₹25 Cr
  | 'TIER_20_25_LIMIT_REACHED'      // Already have 2 players in ₹20-25 Cr range
  | 'TIER_15_20_LIMIT_REACHED'      // Already have 3 players in ₹15-20 Cr range
  | 'OVERSEAS_LIMIT_REACHED'        // 8 overseas players already in squad
  | 'SQUAD_FULL'                    // 25 players already acquired
  | 'WK_LIMIT_REACHED'              // 4 wicketkeepers already in squad
  | 'CANNOT_COMPLETE_VALID_SQUAD'   // Budget too low to fill minimum squad requirements
  | 'BID_TOO_LOW'                   // Proposed amount <= current highest bid
  | 'AUCTION_NOT_ACTIVE'            // Auction state machine is not in 'bidding' state
  | 'RATE_LIMITED';                 // Exceeded 10 bids per 5-second window

/**
 * A persisted bid record. Maps to a row in the `bids` table.
 * Created after a bid passes validation and the distributed lock is acquired.
 *
 * isWinningBid starts as false and is updated to true when the player is sold.
 * Only one bid per (roomId, playerId) combination can have isWinningBid = true.
 */
export interface Bid {
  readonly id: string;              // UUID — Primary Key
  readonly roomId: string;          // FK → rooms.id
  readonly playerId: string;        // FK → players.id
  readonly roomMemberId: string;    // FK → room_members.id (identifies franchise in room)
  readonly franchise: FranchiseName;
  readonly amountLakhs: number;     // Integer — no floats. Enforced by DB column type INT.
  isWinningBid: boolean;            // Updated async when player sold. Default: false.
  readonly placedAt: Date;
}

/**
 * The result returned by bidValidator.canBid() (backend) and
 * canBid() from bidEligibility.ts (shared/frontend).
 *
 * DESIGN DECISION — optional fields on a flat interface vs discriminated union:
 *   A discriminated union would be: { valid: true; remainingAfterBid: number } | { valid: false; reason: BidRejectionReason }
 *   This is more type-safe but more verbose for consumers.
 *   Flat interface with optionals is used here for simplicity — the caller
 *   always checks `if (result.valid)` before accessing remainingAfterBid.
 */
export interface BidValidationResult {
  valid: boolean;
  reason?: BidRejectionReason;      // Present only when valid === false
  remainingAfterBid?: number;       // Present only when valid === true (lakhs)
}

/**
 * The client-submitted bid payload.
 * Sent from frontend → backend via Socket.IO as BidPlacedPayload.
 * Re-typed here for use in the validation layer.
 */
export interface BidIntent {
  readonly roomCode: string;
  readonly playerId: string;
  readonly amountLakhs: number;     // Must be > currentBid AND >= player.basePriceLakhs
}
