'use client';

/**
 * apps/frontend/src/components/auction/CountdownRing.tsx
 *
 * MAJOR FUNCTION: Visualizes the remaining bidding time using an authoritative SVG circular progress bar.
 * Displays the real-time seconds in the center and shifts the ring color dynamically.
 *
 * SYSTEM CONCEPT — Declarative UI from state:
 *   The ring relies purely on the `secondsLeft` slice from the Zustand store.
 *   Whenever the server emits auction:timer_tick, this component updates reactively.
 *   CSS transitions handle the smooth animation between second ticks.
 */

import { useMemo } from 'react';
import { useAuctionStore } from '../../stores/auctionStore';

export function CountdownRing() {
  const secondsLeft = useAuctionStore((state) => state.secondsLeft);
  const auctionState = useAuctionStore((state) => state.auctionState);

  // Dynamic max seconds: 30s for initial player_up, 10s for bid resets
  const maxSeconds = useMemo(() => {
    return secondsLeft > 10 ? 30 : 10;
  }, [secondsLeft]);

  // Precise SVG geometry
  const radius = 54;
  const strokeWidth = 7;
  const circumference = 2 * Math.PI * radius; // ~339.29px

  const strokeDashoffset = useMemo(() => {
    const clampedSeconds = Math.max(0, Math.min(secondsLeft, maxSeconds));
    const progress = clampedSeconds / maxSeconds;
    return circumference - progress * circumference;
  }, [secondsLeft, maxSeconds, circumference]);

  // Dynamic color coding & urgency stage
  const colorStage = useMemo(() => {
    if (secondsLeft > 15) {
      return {
        textColor: 'text-emerald-400',
        strokeClass: 'stroke-emerald-400',
        glowStyle: { filter: 'drop-shadow(0px 0px 8px rgba(52, 211, 153, 0.45))' },
        bgGlow: 'bg-emerald-500/5',
        label: 'Active Bid Window',
      };
    }
    if (secondsLeft > 5) {
      return {
        textColor: 'text-amber-400',
        strokeClass: 'stroke-amber-400',
        glowStyle: { filter: 'drop-shadow(0px 0px 8px rgba(251, 191, 36, 0.45))' },
        bgGlow: 'bg-amber-500/5',
        label: 'Going Once...',
      };
    }
    return {
      textColor: 'text-rose-500 animate-pulse',
      strokeClass: 'stroke-rose-500',
      glowStyle: { filter: 'drop-shadow(0px 0px 12px rgba(244, 63, 94, 0.7))' },
      bgGlow: 'bg-rose-500/10',
      label: 'FINAL CALL',
    };
  }, [secondsLeft]);

  // If the auction is complete or idle, don't show the timer ring
  if (auctionState === 'idle' || auctionState === 'complete') {
    return null;
  }

  return (
    <div className="flex flex-col items-center justify-center p-3 select-none">
      <div
        className={`relative w-36 h-36 rounded-full flex items-center justify-center transition-colors duration-500 ${colorStage.bgGlow}`}
      >
        {/* SVG Progress Ring */}
        <svg
          className="w-full h-full transform -rotate-90"
          viewBox="0 0 140 140"
        >
          {/* Background Track Circle */}
          <circle
            className="stroke-white/10"
            fill="transparent"
            strokeWidth={strokeWidth}
            r={radius}
            cx="70"
            cy="70"
          />

          {/* Active Progress Circle */}
          <circle
            className={`transition-all duration-1000 ease-linear ${colorStage.strokeClass}`}
            fill="transparent"
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference} ${circumference}`}
            style={{
              strokeDashoffset,
              ...colorStage.glowStyle,
            }}
            r={radius}
            cx="70"
            cy="70"
            strokeLinecap="round"
          />
        </svg>

        {/* Center Numerical Display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span
            className={`text-4xl font-black tracking-tight font-mono transition-colors duration-300 ${colorStage.textColor}`}
          >
            {secondsLeft}
          </span>
          <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 mt-0.5">
            Seconds
          </span>
        </div>
      </div>

      {/* Urgency Badge */}
      <div className="mt-2">
        <span
          className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border transition-all duration-300 ${
            secondsLeft <= 5
              ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 animate-bounce'
              : secondsLeft <= 15
              ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
              : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
          }`}
        >
          {colorStage.label}
        </span>
      </div>
    </div>
  );
}
