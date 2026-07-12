/**
 * apps/frontend/src/components/ui/LoadingSpinner.tsx
 *
 * MAJOR FUNCTION: Reusable full-page loading spinner.
 * Used during socket connection, initial data load, and transitions.
 */
export function LoadingSpinner({
  message = 'Loading...',
}: {
  message?: string;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 flex flex-col items-center justify-center gap-4">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-4 border-white/10 border-t-orange-500 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl">🏏</span>
        </div>
      </div>
      <p className="text-slate-400 text-sm animate-pulse">{message}</p>
    </div>
  );
}
