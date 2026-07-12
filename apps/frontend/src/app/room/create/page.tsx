'use client';

/**
 * apps/frontend/src/app/room/create/page.tsx
 *
 * MAJOR FUNCTION: Room creation page. Host clicks "Create Room" →
 * POST /rooms → receives roomCode → redirects to /room/[roomCode]/lobby.
 *
 * WHY THIS IS A REST CALL (not a socket event):
 *   Creating a room is a ONE-TIME action per session.
 *   It's not real-time. REST is perfect: stateless request → resource created → redirect.
 *   The lobby page opens the socket connection AFTER the room exists.
 *
 * URL DESIGN — /room/create (not /rooms/create):
 *   URL is from the user's mental model ("I'm in a room") not the API resource name.
 *   The API uses /rooms (plural, REST convention).
 *   The UI uses /room (singular, user-facing).
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi, ApiError } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface CreateRoomResponse {
  roomId: string;
  roomCode: string;
  status: string;
}

export default function CreateRoomPage() {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect to login if not authenticated (using useEffect to avoid render-time side effects)
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) return <LoadingSpinner message="Checking session..." />;
  if (!isAuthenticated) return null;

  async function handleCreate() {
    setError(null);
    setIsCreating(true);
    try {
      const data = await fetchApi<CreateRoomResponse>('/rooms', {
        method: 'POST',
      });
      router.push(`/room/${data.roomCode}/lobby`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to create room.'
      );
      setIsCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 mb-4 shadow-lg shadow-orange-500/30">
            <span className="text-3xl">🏟️</span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            IPL Mock Auction
          </h1>
          <p className="text-slate-400 mt-2">
            Host a live franchise auction with friends
          </p>
        </div>

        {/* Action card */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 shadow-2xl space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-white">
              Start a new auction
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              A 6-character invite code will be generated. Share it with up to
              10 friends.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="flex gap-2.5 items-start px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm"
            >
              <span className="shrink-0">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <button
            id="create-room-btn"
            onClick={handleCreate}
            disabled={isCreating}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-yellow-500 text-white font-bold text-base hover:from-orange-600 hover:to-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2"
          >
            {isCreating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating room...
              </>
            ) : (
              <> 🏏 Create Auction Room</>
            )}
          </button>

          <p className="text-center text-slate-500 text-xs">
            Already have a code?{' '}
            <button
              onClick={() => router.push('/dashboard')}
              className="text-orange-400 hover:text-orange-300 transition"
            >
              Join a room instead
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
