/**
 * bidEligibility.ts
 *
 * MAJOR FUNCTION: The shared, pure bid validation function imported by BOTH
 * the backend bidValidator.ts AND the frontend useBidEligibility hook.
 *
 * This is the linchpin of the DRY architecture:
 *   - Frontend uses it to DISABLE bid buttons before the user clicks (UX hint)
 *   - Backend re-runs it AFTER the click for authoritative security validation
 *   - Same logic. Same rules. Never diverges.
 *
 * PURITY CONSTRAINT — Zero dependencies on:
 *   - Node.js builtins (fs, path, crypto, etc.)
 *   - Browser APIs (window, document, localStorage, etc.)
 *   - Any I/O (no Redis reads, no DB queries, no network calls)
 *
 * This function must compile and run identically in:
 *   - Node.js 20+ (backend, bidValidator.ts)
 *   - Browser (frontend, useBidEligibility.ts hook)
 *   - Edge Runtime (if ever needed for Next.js middleware)
 *
 * TESTING: Because it's pure, unit tests need zero mocking:
 *   const result = canBid(mockState, mockPlayer, 300);
 *   expect(result.valid).toBe(true);
 *   No database setup, no Redis, no network required.
 */

import type { Player } from '../types/player.types';
import type { FranchiseState } from '../types/squad.types';
import type { BidValidationResult } from '../types/bid.types';

import {
  WALLET_TOTAL_LAKHS,
  SQUAD_MAX_SIZE,
  OVERSEAS_MAX,
  WK_MAX,
  TIER_25_PLUS_THRESHOLD_LAKHS,
  TIER_25_PLUS_MAX,
  TIER_20_25_UPPER_LAKHS,
  TIER_20_25_LOWER_LAKHS,
  TIER_20_25_MAX,
  TIER_15_20_UPPER_LAKHS,
  TIER_15_20_LOWER_LAKHS,
  TIER_15_20_MAX,
} from '../constants/auction';

/**
 * Determines the salary tier a proposed bid amount falls into.
 * Used internally to check tier-specific caps.
 */
function getBidTier(
  amountLakhs: number
): 'tier25Plus' | 'tier20to25' | 'tier15to20' | 'below15' {
  if (amountLakhs >= TIER_25_PLUS_THRESHOLD_LAKHS) return 'tier25Plus';
  if (
    amountLakhs >= TIER_20_25_LOWER_LAKHS &&
    amountLakhs <= TIER_20_25_UPPER_LAKHS
  )
    return 'tier20to25';
  if (
    amountLakhs >= TIER_15_20_LOWER_LAKHS &&
    amountLakhs <= TIER_15_20_UPPER_LAKHS
  )
    return 'tier15to20';
  return 'below15';
}

/**
 * canBid — the core eligibility function.
 *
 * @param state    The current FranchiseState snapshot (from Redis on BE, from Zustand on FE)
 * @param player   The player currently up for auction
 * @param amountLakhs   The proposed bid amount (integer lakhs)
 * @returns BidValidationResult — { valid: true } or { valid: false, reason }
 *
 * RULE EVALUATION ORDER (fail-fast — most common rejections checked first):
 *   1. Squad full check (O(1), no computation needed)
 *   2. Wallet check (can we afford this at all?)
 *   3. Price tier cap (salary cap rule — most distinctive rule of this system)
 *   4. Composition checks (overseas, WK limits)
 *   5. CANNOT_COMPLETE_VALID_SQUAD (most expensive — checked last)
 */
export function canBid(
  state: FranchiseState,
  player: Player,
  amountLakhs: number
): BidValidationResult {
  // ─── Rule 1: Squad Full ─────────────────────────────────────────────────────
  if (state.squadCount >= SQUAD_MAX_SIZE) {
    return { valid: false, reason: 'SQUAD_FULL' };
  }

  // ─── Rule 2: Wallet Check ───────────────────────────────────────────────────
  if (amountLakhs > state.walletRemainingLakhs) {
    return { valid: false, reason: 'WALLET_EXHAUSTED' };
  }

  // ─── Rule 3: Price Tier Caps ────────────────────────────────────────────────
  const tier = getBidTier(amountLakhs);

  if (tier === 'tier25Plus' && state.tier25PlusCount >= TIER_25_PLUS_MAX) {
    return { valid: false, reason: 'TIER_25_PLUS_LIMIT_REACHED' };
  }
  if (tier === 'tier20to25' && state.tier20to25Count >= TIER_20_25_MAX) {
    return { valid: false, reason: 'TIER_20_25_LIMIT_REACHED' };
  }
  if (tier === 'tier15to20' && state.tier15to20Count >= TIER_15_20_MAX) {
    return { valid: false, reason: 'TIER_15_20_LIMIT_REACHED' };
  }

  // ─── Rule 4: Squad Composition Caps ────────────────────────────────────────
  if (
    player.nationality === 'overseas' &&
    state.overseasCount >= OVERSEAS_MAX
  ) {
    return { valid: false, reason: 'OVERSEAS_LIMIT_REACHED' };
  }
  if (player.role === 'wk' && state.wkCount >= WK_MAX) {
    return { valid: false, reason: 'WK_LIMIT_REACHED' };
  }

  // ─── Rule 5: CANNOT_COMPLETE_VALID_SQUAD ────────────────────────────────────
  // The most complex rule: after spending `amountLakhs` on this player,
  // does the franchise have enough budget left to fill the remaining squad slots
  // with at minimum base-price players?
  //
  // Simplified check: remaining wallet after this bid must cover at least
  // (SQUAD_MAX_SIZE - squadCount - 1) more players at the minimum base price (20L).
  // A franchise that spends all its money early can't complete a 25-player squad.
  const walletAfterBid = state.walletRemainingLakhs - amountLakhs;
  const remainingSlots = SQUAD_MAX_SIZE - state.squadCount - 1; // -1 for this player
  const minimumBasePriceLakhs = 20; // Minimum base price any player can have

  if (
    remainingSlots > 0 &&
    walletAfterBid < remainingSlots * minimumBasePriceLakhs
  ) {
    return { valid: false, reason: 'CANNOT_COMPLETE_VALID_SQUAD' };
  }

  // ─── All rules passed ───────────────────────────────────────────────────────
  return {
    valid: true,
    remainingAfterBid: walletAfterBid,
  };
}

/**
 * Helper: generate a human-readable rejection message for UI display.
 * Used by the frontend to populate bid button tooltips and toast notifications.
 *
 * DESIGN DECISION — human messages in shared, not duplicated in FE and BE:
 *   The backend uses these to populate BidRejectedPayload.humanMessage.
 *   The frontend uses these for local tooltip text (before even sending the bid).
 *   One source, consistent UX messages.
 */
export function getBidRejectionMessage(
  reason: BidValidationResult['reason']
): string {
  switch (reason) {
    case 'WALLET_EXHAUSTED':
      return 'Insufficient funds. Your wallet cannot cover this bid.';
    case 'TIER_25_PLUS_LIMIT_REACHED':
      return 'You already have 1 player at ₹25 Cr+. Tier cap reached.';
    case 'TIER_20_25_LIMIT_REACHED':
      return 'You already have 2 players in the ₹20-25 Cr range. Tier cap reached.';
    case 'TIER_15_20_LIMIT_REACHED':
      return 'You already have 3 players in the ₹15-20 Cr range. Tier cap reached.';
    case 'OVERSEAS_LIMIT_REACHED':
      return 'You have the maximum 8 overseas players. Cannot bid on this player.';
    case 'SQUAD_FULL':
      return 'Your squad is full (25 players). No more bids allowed.';
    case 'WK_LIMIT_REACHED':
      return 'You already have 4 wicketkeepers in your squad.';
    case 'CANNOT_COMPLETE_VALID_SQUAD':
      return 'This bid would leave you unable to complete a full squad with your remaining budget.';
    case 'BID_TOO_LOW':
      return 'Your bid must be higher than the current bid.';
    case 'AUCTION_NOT_ACTIVE':
      return 'The auction is not currently active. Wait for the next player.';
    case 'RATE_LIMITED':
      return 'You are bidding too fast. Please wait a moment.';
    default:
      return 'Bid rejected. Please try again.';
  }
}
