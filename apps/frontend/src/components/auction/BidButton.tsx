'use client';

/**
 * apps/frontend/src/components/auction/BidButton.tsx
 *
 * MAJOR FUNCTION: The primary interactive control for placing bids.
 * Displays the next bid amount, manages the click action with debouncing,
 * and handles all disabled states (already high bidder, wallet exhausted, etc.).
 *
 * SYSTEM CONCEPT — Double-tap Protection (Debounce):
 *   During high-intensity auctions, a user might spam click the bid button.
 *   This is double-spend protection at the UI level. We lock the button for 300ms
 *   after click, disabling further clicks while the socket roundtrip completes.
 *
 * DESIGN AESTHETIC: Vibrant gradients, glowing shadows when active, and clear tooltips.
 */

import { useState, useEffect } from 'react';
import { useAuctionStore } from '../../stores/auctionStore';
import { useBidEligibility } from '../../hooks/useBidEligibility';
import { formatLakhs } from './PlayerCard';

interface BidButtonProps {
  onBid: (amountLakhs: number) => void;
}

export function BidButton({ onBid }: BidButtonProps) {
  const currentBidder = useAuctionStore((state) => state.currentBidder);
  const myFranchiseState = useAuctionStore((state) => state.myFranchiseState);
  const auctionState = useAuctionStore((state) => state.auctionState);

  const { canBid, humanMessage, nextBidAmount } = useBidEligibility();
  
  const [isThrottled, setIsThrottled] = useState(false);

  // Check if I am already the highest bidder
  const isHighestBidder =
    myFranchiseState && currentBidder === myFranchiseState.franchise;

  const handleClick = () => {
    if (!canBid || isHighestBidder || isThrottled || nextBidAmount === 0) return;

    setIsThrottled(true);
    onBid(nextBidAmount);

    // Throttle for 300ms to prevent double-clicks
    setTimeout(() => {
      setIsThrottled(false);
    }, 300);
  };

  // Determine button state
  const isDisabled = !canBid || isHighestBidder || isThrottled;

  let buttonText = `Bid ${formatLakhs(nextBidAmount)}`;
  let statusMessage = '';
  let borderGlowClass = '';

  if (auctionState === 'idle') {
    buttonText = 'Waiting for Host';
    statusMessage = 'Auction has not started yet.';
  } else if (auctionState === 'complete') {
    buttonText = 'Auction Complete';
    statusMessage = 'The room auction has finished!';
  } else if (isHighestBidder) {
    buttonText = 'Highest Bidder';
    statusMessage = 'Your franchise holds the highest bid!';
    borderGlowClass = 'shadow-[0_0_15px_rgba(34,197,94,0.2)] border-green-500/30';
  } else if (!canBid && humanMessage) {
    statusMessage = humanMessage;
    borderGlowClass = 'border-red-500/10';
  } else if (isThrottled) {
    buttonText = 'Processing...';
  } else {
    // Active bidding state
    borderGlowClass = 'shadow-[0_0_20px_rgba(6,182,212,0.35)] hover:shadow-[0_0_25px_rgba(6,182,212,0.5)] border-cyan-500/30 hover:border-cyan-400/50';
  }

  return (
    <div className="w-full flex flex-col items-center gap-3">
      <button
        onClick={handleClick}
        disabled={isDisabled}
        className={`w-full py-4 px-6 rounded-2xl font-black text-lg md:text-xl tracking-wide uppercase transition-all duration-200 cursor-pointer select-none active:scale-[0.98] ${
          isDisabled
            ? 'bg-slate-800 border border-slate-700 text-slate-500 cursor-not-allowed shadow-none'
            : isHighestBidder
            ? 'bg-gradient-to-r from-emerald-500 to-green-600 border border-green-500/40 text-white shadow-lg'
            : 'bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 border border-cyan-500/40 text-white shadow-lg'
        } ${borderGlowClass}`}
      >
        {buttonText}
      </button>

      {statusMessage && (
        <p
          className={`text-xs text-center font-medium px-4 py-1.5 rounded-full border bg-black/25 backdrop-blur-sm ${
            isHighestBidder
              ? 'text-green-400 border-green-500/10'
              : !canBid
              ? 'text-red-400 border-red-500/10'
              : 'text-slate-400 border-white/5'
          }`}
        >
          {isHighestBidder ? '✓ ' : '⚠️ '}
          {statusMessage}
        </p>
      )}
    </div>
  );
}
