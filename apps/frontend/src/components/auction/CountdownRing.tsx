'use client';

/**
 * apps/frontend/src/components/auction/CountdownRing.tsx
 *
 * MAJOR FUNCTION: Visualizes the remaining bidding time using an SVG circular progress bar.
 * Displays the absolute number of seconds in the center and colors the ring dynamically.
 *
 * SYSTEM CONCEPT — Declarative UI from state:
 *   Instead of running a local setInterval that drifts, the ring relies purely on
 *   the `secondsLeft` slice from the Zustand store. Whenever the server ticks, this
 *   component updates. The CSS transition handles the smooth animation between ticks.
 */

import { useMemo } from 'react';
import { useAuctionStore } from '../../stores/auctionStore';

export function CountdownRing() {
  const secondsLeft = useAuctionStore((state) => state.secondsLeft);
  const auctionState = useAuctionStore((state) => state.auctionState);

  // Dynamic max seconds: if it is above 10, it must be the initial player_up timer (30s).
  // If a bid is placed, the timer resets to 10s, so the limit becomes 10s.
  const maxSeconds = useMemo(() => {
    return secondsLeft > 10 ? 30 : 10;
  }, [secondsLeft]);

  // SVG parameters
  const radius = 60;
  const stroke = 8;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;

  const strokeDashoffset = useMemo(() => {
    const progress = Math.min(1, Math.max(0, secondsLeft / maxSeconds));
    return circumference - progress * circumference;
  }, [secondsLeft, maxSeconds, circumference]);

  // Dynamic color coding
  const timerColor = useMemo(() => {
    if (secondsLeft > 15) {
      return 'text-green-500 stroke-green-500 drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]';
    }
    if (secondsLeft >= 8) {
      return 'text-amber-500 stroke-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.3)]';
    }
    return 'text-red-500 stroke-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse';
  }, [secondsLeft]);

  // If the auction is complete or idle, don't show the timer ring
  if (auctionState === 'idle' || auctionState === 'complete') {
    return null;
  }

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="relative w-36 h-36 flex items-center justify-center">
        {/* SVG Progress Ring */}
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
          {/* Background Track */}
          <circle
            className="stroke-white/5"
            fill="transparent"
            strokeWidth={stroke}
            r={normalizedRadius}
            cx="60"
            cy="60"
          />
          {/* Active Progress */}
          <circle
            className={`transition-all duration-1000 ease-linear ${timerColor}`}
            fill="transparent"
            strokeWidth={stroke}
            strokeDasharray={circumference + ' ' + circumference}
            style={{ strokeDashoffset }}
            r={normalizedRadius}
            cx="60"
            cy="60"
            strokeLinecap="round"
          />
        </svg>

        {/* Center Text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className={`text-4xl font-black tracking-tight font-mono ${timerColor.split(' ')[0]}`}>
            {secondsLeft}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">
            Seconds
          </span>
        </div>
      </div>
    </div>
  );
}
