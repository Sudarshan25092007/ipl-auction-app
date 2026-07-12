'use client';

/**
 * apps/frontend/src/components/squad/SquadPanel.tsx
 *
 * MAJOR FUNCTION: Displays a detailed roster of players won by a specific franchise.
 * Groups players by role and shows active composition count constraints (Overseas, WK, Total).
 */

import { useMemo } from 'react';
import type { FranchiseName } from '@ipl-auction/shared';
import { useAuctionStore } from '../../stores/auctionStore';
import { WalletProgressBar } from './WalletProgressBar';
import { formatLakhs } from '../auction/PlayerCard';

interface SquadPanelProps {
  franchise: FranchiseName;
  showWallet?: boolean;
}

export function SquadPanel({ franchise, showWallet = true }: SquadPanelProps) {
  const squadPlayers = useAuctionStore((state) => state.squadPlayers);
  const squadSummaries = useAuctionStore((state) => state.squadSummaries);

  const players = squadPlayers[franchise] || [];
  const summary = squadSummaries[franchise];

  // Group players by role
  const groupedPlayers = useMemo(() => {
    const batters = players.filter((p) => p.player.role === 'batter');
    const bowlers = players.filter(
      (p) => p.player.role === 'pacer' || p.player.role === 'spinner'
    );
    const allrounders = players.filter((p) => p.player.role === 'allrounder');
    const wks = players.filter((p) => p.player.role === 'wk');

    return { batters, bowlers, allrounders, wks };
  }, [players]);

  // Compute composition limits
  const stats = useMemo(() => {
    const total = players.length;
    const overseas = players.filter(
      (p) => p.player.nationality === 'overseas'
    ).length;
    const wk = players.filter((p) => p.player.role === 'wk').length;

    return { total, overseas, wk };
  }, [players]);

  return (
    <div className="flex flex-col h-full bg-white/5 border border-white/10 rounded-2xl p-4 md:p-5 backdrop-blur-md shadow-lg space-y-5">
      {/* Franchise Name Header */}
      <div>
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
          {franchise}
        </h3>
        <p className="text-slate-500 text-[10px] uppercase font-bold mt-0.5 tracking-widest">
          Franchise Roster
        </p>
      </div>

      {/* Wallet progress bar */}
      {showWallet && summary && (
        <div className="bg-black/20 p-3.5 rounded-xl border border-white/5 shadow-inner">
          <WalletProgressBar
            walletRemainingLakhs={summary.walletRemainingLakhs}
          />
        </div>
      )}

      {/* Composition Stats Badges */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white/5 border border-white/5 rounded-xl p-2.5 text-center">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
            Squad
          </p>
          <p
            className={`text-base font-black font-mono mt-0.5 ${stats.total > 25 ? 'text-red-400' : 'text-slate-200'}`}
          >
            {stats.total}/25
          </p>
        </div>
        <div className="bg-white/5 border border-white/5 rounded-xl p-2.5 text-center">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
            Overseas
          </p>
          <p
            className={`text-base font-black font-mono mt-0.5 ${stats.overseas > 8 ? 'text-red-400' : 'text-slate-200'}`}
          >
            {stats.overseas}/8
          </p>
        </div>
        <div className="bg-white/5 border border-white/5 rounded-xl p-2.5 text-center">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
            WKs
          </p>
          <p
            className={`text-base font-black font-mono mt-0.5 ${stats.wk > 4 || stats.wk < 1 ? 'text-amber-400 animate-pulse' : 'text-slate-200'}`}
          >
            {stats.wk}/4
          </p>
        </div>
      </div>

      {/* Acquired Players List by Role */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar text-xs">
        {/* Batters */}
        <RoleSection title="Batters" list={groupedPlayers.batters} />

        {/* Wicketkeepers */}
        <RoleSection title="Wicketkeepers" list={groupedPlayers.wks} />

        {/* Allrounders */}
        <RoleSection title="All-Rounders" list={groupedPlayers.allrounders} />

        {/* Bowlers */}
        <RoleSection title="Bowlers" list={groupedPlayers.bowlers} />
      </div>
    </div>
  );
}

function RoleSection({ title, list }: { title: string; list: any[] }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between border-b border-white/5 pb-1">
        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
          {title}
        </span>
        <span className="text-[10px] font-bold text-slate-500 font-mono">
          ({list.length})
        </span>
      </div>

      {list.length === 0 ? (
        <p className="text-[10px] text-slate-600 font-medium italic pl-1 py-1">
          No players won yet
        </p>
      ) : (
        <div className="space-y-1 pl-1">
          {list.map(({ player, pricePaidLakhs }) => (
            <div
              key={player.id}
              className="flex items-center justify-between py-1 border-b border-white/5 last:border-0 hover:bg-white/5 px-1.5 rounded transition-all duration-200"
            >
              <div className="flex items-center gap-1.5 font-medium text-slate-300">
                <span>{player.nationality === 'overseas' ? '✈️' : '🇮🇳'}</span>
                <span className="truncate max-w-[120px]">{player.name}</span>
              </div>
              <span className="font-bold text-teal-400 font-mono">
                {formatLakhs(pricePaidLakhs)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
