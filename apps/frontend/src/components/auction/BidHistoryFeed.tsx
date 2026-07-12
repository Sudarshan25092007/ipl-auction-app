'use client';

/**
 * apps/frontend/src/components/auction/BidHistoryFeed.tsx
 *
 * MAJOR FUNCTION: Displays the chronological stream of bids placed on the current player.
 * Automatically scrolls to the bottom on new bids, highlighting team names with their themes.
 *
 * SYSTEM CONCEPT — Dom Mutation in React hooks:
 *   When a new bid comes in, we want the container to scroll down to reveal it.
 *   We use a `useRef` referencing the container element and a `useEffect` that listens to
 *   `bidHistory` changes. When the array changes, we call `scrollIntoView({ behavior: 'smooth' })`
 *   on a dummy anchor element placed at the bottom.
 */

import { useEffect, useRef } from 'react';
import { FRANCHISE_MAP } from '@ipl-auction/shared';
import { useAuctionStore } from '../../stores/auctionStore';
import { formatLakhs } from './PlayerCard';

export function BidHistoryFeed() {
  const bidHistory = useAuctionStore((state) => state.bidHistory);
  const currentPlayer = useAuctionStore((state) => state.currentPlayer);
  const auctionState = useAuctionStore((state) => state.auctionState);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll on new entries
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [bidHistory]);

  if (auctionState === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center h-48 border border-white/5 bg-white/5 rounded-2xl p-6 text-center text-slate-500">
        <span className="text-3xl mb-1">⏳</span>
        <span className="text-sm font-medium">
          Waiting for auction to begin...
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-64 border border-white/10 bg-black/20 rounded-2xl p-4 md:p-5 backdrop-blur-sm shadow-inner overflow-hidden">
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 shrink-0">
        Bid History Feed
      </h3>

      {bidHistory.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-center px-4 py-8">
          <span className="text-2xl mb-1">🎯</span>
          <p className="text-sm font-semibold">No bids yet</p>
          <p className="text-xs text-slate-600 mt-1">
            {currentPlayer
              ? `Start the bidding at ${formatLakhs(currentPlayer.basePriceLakhs)}!`
              : ''}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-2 custom-scrollbar">
          {/* Reverse order since new entries are unshifted at the top of Zustand array,
              but for vertical history we want chronological scroll-to-bottom.
              So we slice and reverse here. */}
          {bidHistory
            .slice()
            .reverse()
            .map((entry, index) => {
              const meta = FRANCHISE_MAP[entry.bidder];
              const badgeStyle = meta
                ? {
                    borderLeft: `4px solid ${meta.primaryColor}`,
                    background: `${meta.primaryColor}15`,
                  }
                : {};

              return (
                <div
                  key={`${entry.timestamp}-${index}`}
                  className="flex items-center justify-between p-3 rounded-xl border border-white/5 transition-all duration-300 hover:bg-white/5 animate-[fadeIn_0.3s_ease-out]"
                  style={badgeStyle}
                >
                  <div className="flex items-center gap-2.5">
                    {/* Small team dot */}
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: meta?.primaryColor ?? '#FFF' }}
                    />
                    <span className="text-sm font-bold text-white tracking-tight">
                      {entry.bidder}
                    </span>
                  </div>

                  <div className="text-right flex items-center gap-3">
                    <span className="text-sm font-black text-teal-400 font-mono">
                      {formatLakhs(entry.amountLakhs)}
                    </span>
                    <span className="text-[10px] text-slate-600 font-mono">
                      {new Date(entry.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              );
            })}
          {/* Scroll Target */}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
