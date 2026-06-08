/**
 * apps/backend/src/services/bidValidator.ts
 *
 * MAJOR FUNCTION: Server-side authoritative bid validation.
 * The backend version of the bid validator — wraps the shared `canBid()` pure function
 * with server-specific additions (auction state check, current-bid check).
 *
 * SYSTEM CONCEPT — Shared vs Server Validation:
 *
 *   packages/shared/src/validators/bidEligibility.ts  (canBid)
 *     - Pure function (no I/O)
 *     - Checks: squad composition, wallet, tier caps
 *     - Used by: BOTH frontend (UX hints) AND backend (authoritative)
 *     - Runs in: Node.js, Browser, Edge Runtime
 *
 *   apps/backend/src/services/bidValidator.ts  (this file)
 *     - Wraps canBid() + adds server-only checks
 *     - Checks: auction state (is bidding active?), is bid > current bid?, is bid for CURRENT player?
 *     - Used by: auctionHandler.ts only
 *     - Cannot run on frontend (needs Redis to read auction state)
 *
 * Why not just use canBid() everywhere?
 *   canBid() checks wallet/composition rules. But a bid also needs to:
 *   - Be higher than the current bid (canBid doesn't know the current bid)
 *   - Be for the CURRENT player on the block (canBid doesn't know which player is active)
 *   - Be submitted when the auction is in 'bidding' state
 *   These checks require Redis access — they belong on the server only.
 */
import { canBid, getBidRejectionMessage } from '@ipl-auction/shared';
import type { FranchiseState, Player, BidValidationResult } from '@ipl-auction/shared';
import { redis } from '../redis/client';
import { REDIS_KEYS } from '../redis/keys';

export interface ServerBidValidationResult extends BidValidationResult {
  humanMessage: string;
}

/**
 * Full server-side bid validation.
 * Called by auctionHandler BEFORE acquiring the lock (pre-lock pre-filter).
 * If this fails, we reject immediately without touching the lock.
 *
 * @param roomId        Room being auctioned
 * @param playerId      Player the bid is for (must match current player)
 * @param amountLakhs   Proposed bid amount
 * @param franchiseState Current wallet/composition state for the bidding franchise
 * @param currentPlayer  The player currently on the block
 */
export async function validateBid(
  roomId: string,
  playerId: string,
  amountLakhs: number,
  franchiseState: FranchiseState,
  currentPlayer: Player
): Promise<ServerBidValidationResult> {

  // ── Check 1: Auction must be in 'bidding' or 'player_up' state ──────────────
  const auctionState = await redis.get(REDIS_KEYS.auctionState(roomId));
  if (auctionState !== 'player_up' && auctionState !== 'bidding') {
    return {
      valid: false,
      reason: 'AUCTION_NOT_ACTIVE',
      humanMessage: getBidRejectionMessage('AUCTION_NOT_ACTIVE'),
    };
  }

  // ── Check 2: Bid must be for the CURRENT player ──────────────────────────────
  if (playerId !== currentPlayer.id) {
    return {
      valid: false,
      reason: 'AUCTION_NOT_ACTIVE',
      humanMessage: 'This player is no longer up for auction.',
    };
  }

  // ── Check 3: Bid must be >= player's base price ─────────────────────────────
  if (amountLakhs < currentPlayer.basePriceLakhs) {
    return {
      valid: false,
      reason: 'BID_TOO_LOW',
      humanMessage: `Minimum bid is ₹${currentPlayer.basePriceLakhs}L (the base price).`,
    };
  }

  // ── Check 4: Bid must be > current highest bid ──────────────────────────────
  const currentBidStr = await redis.get(REDIS_KEYS.currentBid(roomId));
  const currentBidLakhs = parseInt(currentBidStr ?? '0', 10);

  if (amountLakhs <= currentBidLakhs) {
    return {
      valid: false,
      reason: 'BID_TOO_LOW',
      humanMessage: `Your bid (${amountLakhs}L) must exceed the current bid (${currentBidLakhs}L).`,
    };
  }

  // ── Check 5: Salary-cap rules via shared canBid() ───────────────────────────
  const eligibility = canBid(franchiseState, currentPlayer, amountLakhs);

  if (!eligibility.valid) {
    return {
      valid: false,
      reason: eligibility.reason,
      humanMessage: getBidRejectionMessage(eligibility.reason),
    };
  }

  return {
    valid: true,
    remainingAfterBid: eligibility.remainingAfterBid,
    humanMessage: '',
  };
}
