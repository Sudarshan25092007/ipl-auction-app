'use client';

/**
 * apps/frontend/src/hooks/useBidEligibility.ts
 *
 * MAJOR FUNCTION: Hook for local client-side bid eligibility checking.
 * Re-runs the pure shared `canBid()` function on every Zustand state change.
 * Determines if the user is allowed to click the BidButton and shows tooltips/reasons.
 *
 * SYSTEM CONCEPT — Instant UI Feedback:
 *   If we validated bids only on the server, the user could click "Bid", wait for the
 *   socket round trip (~10-100ms), and then see "Wallet exhausted". This is poor UX.
 *   By running the exact same validation rules locally in this hook, we can disable
 *   the button or show the rejection reason *before* they even try to click it.
 *
 * IPL BID INCREMENT RULES:
 *   - Under ₹50 Lakhs (50L): increment is +₹2 Lakhs (2L)
 *   - ₹50L to ₹100L: increment is +₹5 Lakhs (5L)
 *   - ₹100L to ₹200L: increment is +₹10 Lakhs (10L)
 *   - ₹200L and above: increment is +₹20 Lakhs (20L)
 */

import { useMemo } from 'react';
import { canBid, getBidRejectionMessage } from '@ipl-auction/shared';
import type { BidRejectionReason } from '@ipl-auction/shared';
import { useAuctionStore } from '../stores/auctionStore';

/**
 * Standard IPL bidding increments (in Lakhs).
 */
export function getBidIncrement(currentBidLakhs: number): number {
  if (currentBidLakhs < 50) return 2;
  if (currentBidLakhs < 100) return 5;
  if (currentBidLakhs < 200) return 10;
  return 20;
}

export function useBidEligibility() {
  const { currentPlayer, currentBidLakhs, myFranchiseState, auctionState } =
    useAuctionStore();

  const nextBidAmount = useMemo(() => {
    if (!currentPlayer) return 0;
    // First bid must be at least the player's base price.
    // Subsequent bids must be higher than the current bid by the standard increment.
    if (currentBidLakhs === 0) {
      return currentPlayer.basePriceLakhs;
    }
    return currentBidLakhs + getBidIncrement(currentBidLakhs);
  }, [currentPlayer, currentBidLakhs]);

  const eligibility = useMemo(() => {
    // 1. If auction is not in bidding or player_up states, nobody can bid
    if (auctionState !== 'player_up' && auctionState !== 'bidding') {
      return {
        canBid: false,
        reason: 'AUCTION_NOT_ACTIVE' as BidRejectionReason,
        humanMessage: getBidRejectionMessage('AUCTION_NOT_ACTIVE'),
        nextBidAmount,
      };
    }

    // 2. If no player is active or the local user has no selected franchise
    if (!currentPlayer || !myFranchiseState) {
      return {
        canBid: false,
        reason: 'AUCTION_NOT_ACTIVE' as BidRejectionReason,
        humanMessage: 'You are not active in this auction.',
        nextBidAmount,
      };
    }

    // 3. Evaluate rules using the shared pure function
    const validation = canBid(myFranchiseState, currentPlayer, nextBidAmount);

    return {
      canBid: validation.valid,
      reason: (validation.reason ?? null) as BidRejectionReason | null,
      humanMessage: validation.reason
        ? getBidRejectionMessage(validation.reason)
        : '',
      nextBidAmount,
    };
  }, [auctionState, currentPlayer, myFranchiseState, nextBidAmount]);

  return eligibility;
}
