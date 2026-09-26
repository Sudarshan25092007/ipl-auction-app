'use client';

/**
 * apps/frontend/src/components/auction/BidHistoryFeed.tsx
 *
 * Compact Scrolling Terminal-Style Bid Feed.
 * Format: HH:MM:SS  FRANCHISE_CODE → ₹X.XX Cr
 */
import { useEffect, useRef } from 'react';
import { FRANCHISE_MAP } from '@ipl-auction/shared';
import { useAuctionStore } from '../../stores/auctionStore';
import { formatLakhs } from './PlayerCard';

function formatTimestamp(timestamp: number): string {
  try {
    const d = new Date(timestamp);
    return d.toTimeString().split(' ')[0]; // HH:MM:SS
  } catch {
    return '--:--:--';
  }
}

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
      <div className="flex flex-col items-center justify-center h-28 border border-slate-800 bg-slate-950/60 rounded-2xl p-4 text-center text-slate-500 font-mono text-xs">
        <span className="text-xl mb-1">⏳</span>
        <span>TERMINAL IDLE — WAITING FOR AUCTION START</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-44 border border-slate-800/90 bg-slate-950/90 rounded-2xl p-3.5 backdrop-blur-md shadow-inner overflow-hidden font-mono">
      {/* Terminal Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500/80" />
            <span className="w-2 h-2 rounded-full bg-amber-500/80" />
            <span className="w-2 h-2 rounded-full bg-emerald-500/80" />
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
            LIVE BID TERMINAL
          </span>
        </div>
        <span className="text-[10px] text-cyan-400 font-bold">
          {bidHistory.length} {bidHistory.length === 1 ? 'BID' : 'BIDS'}
        </span>
      </div>

      {bidHistory.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-center px-4">
          <p className="text-xs text-slate-400">⚡ NO BIDS RECORDED</p>
          <p className="text-[10px] text-slate-500 mt-1">
            {currentPlayer
              ? `Base price on the floor: ${formatLakhs(currentPlayer.basePriceLakhs)}`
              : ''}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1.5 scrollbar-thin text-xs">
          {bidHistory
            .slice()
            .reverse()
            .map((entry, index) => {
              const meta = FRANCHISE_MAP[entry.bidder];
              const isLatest = index === bidHistory.length - 1;

              return (
                <div
                  key={`${entry.timestamp}-${index}`}
                  className={`flex items-center justify-between py-1 px-2.5 rounded-lg border transition-all ${
                    isLatest
                      ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-200'
                      : 'bg-slate-900/50 border-slate-800/60 text-slate-300 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-[10px] text-slate-500">
                      {formatTimestamp(entry.timestamp)}
                    </span>
                    <span
                      className="font-black text-xs px-1.5 py-0.5 rounded text-white"
                      style={{
                        backgroundColor: meta?.primaryColor
                          ? `${meta.primaryColor}30`
                          : '#334155',
                        borderLeft: `3px solid ${meta?.primaryColor || '#FFF'}`,
                      }}
                    >
                      {entry.bidder}
                    </span>
                    <span className="text-slate-500">→</span>
                  </div>

                  <span className="font-black text-emerald-400">
                    {formatLakhs(entry.amountLakhs)}
                  </span>
                </div>
              );
            })}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
