'use client';

/**
 * apps/frontend/src/components/squad/WalletProgressBar.tsx
 *
 * MAJOR FUNCTION: Displays the remaining salary cap budget visually.
 * Shows the exact crores left and renders a color-coded bar (Green, Amber, Red).
 */

import { useMemo } from 'react';
import { WALLET_TOTAL_LAKHS } from '@ipl-auction/shared';
import { formatLakhs } from '../auction/PlayerCard';

interface WalletProgressBarProps {
  walletRemainingLakhs: number;
}

export function WalletProgressBar({
  walletRemainingLakhs,
}: WalletProgressBarProps) {
  const percentage = useMemo(() => {
    return Math.min(
      100,
      Math.max(0, (walletRemainingLakhs / WALLET_TOTAL_LAKHS) * 100)
    );
  }, [walletRemainingLakhs]);

  const barColor = useMemo(() => {
    if (percentage > 50)
      return 'bg-gradient-to-r from-emerald-500 to-green-500 shadow-green-500/20';
    if (percentage > 20)
      return 'bg-gradient-to-r from-amber-500 to-yellow-500 shadow-yellow-500/20';
    return 'bg-gradient-to-r from-rose-500 to-red-600 shadow-red-500/20';
  }, [percentage]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-bold">
        <span className="text-slate-400 uppercase tracking-widest">
          Salary Cap Wallet
        </span>
        <span className="text-white font-mono text-sm">
          {formatLakhs(walletRemainingLakhs)} /{' '}
          {formatLakhs(WALLET_TOTAL_LAKHS)}
        </span>
      </div>

      {/* Progress Track */}
      <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden border border-white/5 relative p-0.5">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out shadow ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
        <span>{percentage.toFixed(1)}% Remaining</span>
        <span>Min Squad Required: 20L/slot</span>
      </div>
    </div>
  );
}
