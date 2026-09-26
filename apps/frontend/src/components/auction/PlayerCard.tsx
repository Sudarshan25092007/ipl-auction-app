'use client';

/**
 * apps/frontend/src/components/auction/PlayerCard.tsx
 *
 * MAJOR FUNCTION: Displays the player currently up on the auction block.
 * Renders player photo placeholder, name, role, capping status, nationality, and base price.
 *
 * SYSTEM CONCEPT — Key-driven re-animation:
 *   When the active player changes, we want a dramatic entry animation (fade-in + slide-up).
 *   In React, we enforce this by using `key={player.id}` when mounting this component.
 *   This forces React to unmount the old player's DOM element and mount a new one,
 *   re-running the CSS entrance animation.
 *
 * DESIGN AESTHETIC: Premium glassmorphism, subtle gradients, and custom role badges.
 */

import type { Player } from '@ipl-auction/shared';

interface PlayerCardProps {
  player: Player;
}

export function formatLakhs(lakhs: number | undefined | null): string {
  if (lakhs === undefined || lakhs === null || isNaN(Number(lakhs))) {
    return '₹0 Lakhs';
  }
  const val = Number(lakhs);
  if (val >= 100) {
    const crores = val / 100;
    return `₹${crores.toFixed(2)} Cr`;
  }
  return `₹${val} Lakhs`;
}

export function getRoleBadgeStyle(role: Player['role']): {
  label: string;
  className: string;
} {
  switch (role) {
    case 'batter':
      return {
        label: 'Batter',
        className: 'from-orange-500 to-red-600 text-white shadow-orange-500/20',
      };
    case 'pacer':
      return {
        label: 'Pacer',
        className: 'from-blue-500 to-indigo-600 text-white shadow-blue-500/20',
      };
    case 'spinner':
      return {
        label: 'Spinner',
        className: 'from-teal-500 to-emerald-600 text-white shadow-teal-500/20',
      };
    case 'allrounder':
      return {
        label: 'All-Rounder',
        className:
          'from-purple-500 to-pink-600 text-white shadow-purple-500/20',
      };
    case 'wk':
      return {
        label: 'Wicketkeeper',
        className:
          'from-amber-400 to-yellow-600 text-slate-900 shadow-yellow-500/20',
      };
  }
}

import { useAuctionStore } from '../../stores/auctionStore';
import { FRANCHISE_MAP } from '@ipl-auction/shared';

export function PlayerCard({ player }: PlayerCardProps) {
  const currentBidLakhs = useAuctionStore((state) => state.currentBidLakhs);
  const currentBidder = useAuctionStore((state) => state.currentBidder);
  const roleStyle = getRoleBadgeStyle(player.role);
  const flagEmoji = player.nationality === 'overseas' ? '✈️' : '🇮🇳';

  const bidderMeta = currentBidder ? FRANCHISE_MAP[currentBidder] : null;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-slate-900/60 border border-slate-800 p-5 md:p-6 backdrop-blur-md shadow-2xl transition-all duration-300 hover:border-slate-700 animate-[slideUp_0.4s_ease-out]">
      {/* Background Ambient Glow */}
      <div className="absolute -top-20 -left-20 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Badges */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span
          className={`px-3 py-1 rounded-full text-xs font-black tracking-wide bg-gradient-to-r ${roleStyle.className} shadow-lg`}
        >
          {roleStyle.label}
        </span>

        {player.isMarquee && (
          <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-500/20 border border-amber-500/30 text-amber-300 shadow-md shadow-amber-500/10 uppercase tracking-wider animate-pulse flex items-center gap-1">
            ⭐ Marquee
          </span>
        )}

        <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-800/80 border border-slate-700 text-slate-300">
          {player.isCapped ? 'Capped' : 'Uncapped'}
        </span>

        <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-800/80 border border-slate-700 text-slate-300 flex items-center gap-1">
          {flagEmoji}{' '}
          {player.nationality === 'overseas' ? 'Overseas' : 'Indian'}
        </span>
      </div>

      {/* Player Main Info */}
      <div className="flex flex-col md:flex-row gap-5 items-center">
        {/* Avatar Graphic */}
        <div className="shrink-0 relative w-28 h-28 md:w-32 md:h-32 rounded-2xl bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 border border-slate-700 flex items-center justify-center shadow-xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-cyan-950/40 to-transparent" />
          <span className="text-5xl select-none filter drop-shadow-md">🏏</span>
        </div>

        {/* Player Name & Category */}
        <div className="text-center md:text-left space-y-1.5 flex-1 min-w-0">
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
            {player.category || 'General Pool'}
          </p>
          <h2 className="text-2xl md:text-4xl font-black text-white tracking-tight drop-shadow-sm leading-tight truncate">
            {player.name}
          </h2>
          <p className="text-slate-400 text-xs font-semibold">
            Base Floor:{' '}
            <span className="font-mono text-slate-200 font-bold">
              {formatLakhs(player.basePriceLakhs)}
            </span>
          </p>
        </div>

        {/* CURRENT HIGHEST BID DISPLAY */}
        <div className="shrink-0 p-4 rounded-2xl bg-slate-950/90 border border-cyan-500/30 text-center md:text-right min-w-[200px] shadow-lg shadow-cyan-950/20">
          <p className="text-[10px] text-cyan-400 font-black uppercase tracking-widest">
            Current Bid
          </p>
          <p className="text-2xl md:text-3xl font-black text-emerald-400 font-mono mt-0.5 tracking-tight">
            {currentBidLakhs > 0
              ? formatLakhs(currentBidLakhs)
              : formatLakhs(player.basePriceLakhs)}
          </p>
          <div className="mt-1 flex items-center justify-center md:justify-end gap-1.5">
            {currentBidder ? (
              <span
                className="text-[11px] font-bold px-2 py-0.5 rounded text-white inline-block max-w-[170px] truncate"
                style={{
                  backgroundColor: bidderMeta?.primaryColor
                    ? `${bidderMeta.primaryColor}35`
                    : '#0284c7',
                  borderLeft: `3px solid ${bidderMeta?.primaryColor || '#38bdf8'}`,
                }}
              >
                Holding: {currentBidder}
              </span>
            ) : (
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                Waiting for opening bid
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
