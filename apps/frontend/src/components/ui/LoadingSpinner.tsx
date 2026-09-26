/**
 * apps/frontend/src/components/ui/LoadingSpinner.tsx
 *
 * Modernized Loading UI matching the dark stadium glassmorphic design system.
 * Used during socket connections, page transitions, and data queries.
 */
export function LoadingSpinner({
  message = 'Loading Draft Chamber...',
  fullScreen = true,
}: {
  message?: string;
  fullScreen?: boolean;
}) {
  const containerClass = fullScreen
    ? 'fixed inset-0 z-50 min-h-screen bg-slate-950/85 backdrop-blur-xl flex flex-col items-center justify-center p-6'
    : 'w-full py-16 flex flex-col items-center justify-center p-6';

  return (
    <div className={containerClass}>
      <div className="relative flex items-center justify-center">
        {/* Soft Radial Ambient Glow */}
        <div className="absolute w-24 h-24 rounded-full bg-gradient-to-tr from-cyan-500/20 to-blue-600/20 blur-2xl pointer-events-none animate-pulse" />

        {/* Outer Orbit Ring */}
        <div className="w-16 h-16 rounded-full border-2 border-slate-800 border-t-cyan-400 border-r-blue-500 animate-spin" />

        {/* Inner Counter Orbit Ring */}
        <div className="absolute w-10 h-10 rounded-full border-2 border-slate-800/80 border-b-amber-400 animate-[spin_1.5s_linear_infinite_reverse]" />

        {/* Center Iconic Cricket Ball / Trophy */}
        <div className="absolute inset-0 flex items-center justify-center text-lg select-none drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]">
          🏏
        </div>
      </div>

      <div className="mt-5 flex flex-col items-center gap-1.5 text-center">
        <p className="font-mono text-xs font-bold tracking-widest text-slate-300 uppercase animate-pulse">
          {message}
        </p>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
            Synchronizing Arena
          </span>
        </div>
      </div>
    </div>
  );
}
