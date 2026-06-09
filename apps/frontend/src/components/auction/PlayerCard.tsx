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

export function formatLakhs(lakhs: number): string {
  if (lakhs >= 100) {
    const crores = lakhs / 100;
    return `₹${crores.toFixed(2)} Cr`;
  }
  return `₹${lakhs} Lakhs`;
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
        className: 'from-purple-500 to-pink-600 text-white shadow-purple-500/20',
      };
    case 'wk':
      return {
        label: 'Wicketkeeper',
        className: 'from-amber-400 to-yellow-600 text-slate-900 shadow-yellow-500/20',
      };
  }
}

export function PlayerCard({ player }: PlayerCardProps) {
  const roleStyle = getRoleBadgeStyle(player.role);
  const flagEmoji = player.nationality === 'overseas' ? '✈️' : '🇮🇳';

  return (
    <div className="relative overflow-hidden rounded-3xl bg-white/5 border border-white/10 p-6 md:p-8 backdrop-blur-md shadow-2xl transition-all duration-300 hover:border-white/20 hover:shadow-cyan-500/5 animate-[slideUp_0.5s_ease-out]">
      {/* Background Glow */}
      <div className="absolute -top-20 -left-20 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top badges */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span
          className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide bg-gradient-to-r ${roleStyle.className} shadow-lg`}
        >
          {roleStyle.label}
        </span>

        {player.isMarquee && (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 border border-amber-500/30 text-amber-300 shadow-md shadow-amber-500/5 uppercase tracking-wider animate-pulse">
            👑 Marquee
          </span>
        )}

        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/5 border border-white/10 text-slate-300">
          {player.isCapped ? 'Capped' : 'Uncapped'}
        </span>

        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/5 border border-white/10 text-slate-300 flex items-center gap-1">
          {flagEmoji} {player.nationality === 'overseas' ? 'Overseas' : 'Indian'}
        </span>
      </div>

      {/* Player Meta Grid */}
      <div className="flex flex-col md:flex-row gap-6 items-center">
        {/* Mock Avatar Card */}
        <div className="shrink-0 relative w-32 h-32 md:w-36 md:h-36 rounded-2xl bg-gradient-to-tr from-slate-800 to-slate-700 border border-white/10 flex items-center justify-center shadow-inner overflow-hidden">
          <div className="absolute inset-0 bg-slate-900/30" />
          <span className="text-5xl select-none filter drop-shadow-md">👤</span>
        </div>

        {/* Player Name & Category details */}
        <div className="text-center md:text-left space-y-3 flex-1">
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
            {player.category || 'General List'}
          </p>
          <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight drop-shadow-sm leading-tight">
            {player.name}
          </h2>

          <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-4 justify-center md:justify-start">
            <div>
              <p className="text-slate-500 text-xs uppercase font-medium tracking-wider">
                Base Price
              </p>
              <p className="text-2xl font-bold text-teal-400 mt-0.5">
                {formatLakhs(player.basePriceLakhs)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
