'use client';

/**
 * apps/frontend/src/components/auction/SoldOverlay.tsx
 *
 * MAJOR FUNCTION: Displays a dramatic full-screen overlay when a player is resolved.
 * Shows either "SOLD!" with the winning team and price, or "UNSOLD".
 *
 * SYSTEM CONCEPT — Declarative Overlay dismissal:
 *   We don't need a local timer to hide the overlay.
 *   The server pauses for 3 seconds (SOLD_PAUSE_MS), then advances the state machine.
 *   When the server advances, it emits `auction:player_up` or `auction:complete`,
 *   which changes `auctionState` in the Zustand store. This triggers a re-render,
 *   unmounting this component automatically.
 */

import { FRANCHISE_MAP } from '@ipl-auction/shared';
import { useAuctionStore } from '../../stores/auctionStore';
import { formatLakhs } from './PlayerCard';

export function SoldOverlay() {
  const auctionState = useAuctionStore((state) => state.auctionState);
  const currentPlayer = useAuctionStore((state) => state.currentPlayer);
  const currentBidLakhs = useAuctionStore((state) => state.currentBidLakhs);
  const currentBidder = useAuctionStore((state) => state.currentBidder);

  if (auctionState !== 'sold' && auctionState !== 'unsold') {
    return null;
  }

  const isSold = auctionState === 'sold';
  const meta = currentBidder ? FRANCHISE_MAP[currentBidder] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md animate-[fadeIn_0.2s_ease-out]">
      <div className="relative text-center p-8 max-w-xl mx-auto space-y-6 transform animate-[scaleUp_0.4s_cubic-bezier(0.175,0.885,0.32,1.275)]">
        {/* SOLD state */}
        {isSold && currentPlayer && meta ? (
          <>
            {/* Glowing Ring Effect */}
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full blur-3xl pointer-events-none opacity-20"
              style={{ backgroundColor: meta.primaryColor }}
            />

            <div className="space-y-1 animate-pulse">
              <span className="text-5xl md:text-7xl font-black uppercase tracking-wider text-amber-400 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]">
                Sold!
              </span>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-lg shadow-2xl relative">
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">
                {currentPlayer.category}
              </p>
              <h2 className="text-2xl md:text-3xl font-extrabold text-white leading-tight">
                {currentPlayer.name}
              </h2>

              <div className="my-6 border-t border-white/5" />

              <div className="space-y-1.5">
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">
                  Acquired By
                </p>
                <div
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/5 font-black text-white text-base tracking-tight"
                  style={{
                    backgroundColor: `${meta.primaryColor}20`,
                    borderLeft: `4px solid ${meta.primaryColor}`,
                  }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: meta.primaryColor }}
                  />
                  {currentBidder}
                </div>
              </div>

              <div className="mt-5 space-y-0.5">
                <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">
                  Final Bid
                </p>
                <p className="text-3xl font-black text-teal-400 font-mono">
                  {formatLakhs(currentBidLakhs)}
                </p>
              </div>
            </div>
          </>
        ) : (
          /* UNSOLD state */
          currentPlayer && (
            <>
              <div className="space-y-1">
                <span className="text-5xl md:text-7xl font-black uppercase tracking-wider text-slate-400 drop-shadow-[0_0_10px_rgba(255,255,255,0.15)]">
                  Unsold
                </span>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-lg shadow-2xl">
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">
                  {currentPlayer.category}
                </p>
                <h2 className="text-2xl md:text-3xl font-extrabold text-slate-300 leading-tight">
                  {currentPlayer.name}
                </h2>

                <div className="my-5 border-t border-white/5" />

                <div className="space-y-1">
                  <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">
                    Base Price
                  </p>
                  <p className="text-2xl font-bold text-slate-400 font-mono">
                    {formatLakhs(currentPlayer.basePriceLakhs)}
                  </p>
                </div>

                <p className="text-xs text-slate-500 font-medium mt-4">
                  No bids met the player's base price.
                </p>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}
