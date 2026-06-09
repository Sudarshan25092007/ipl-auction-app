'use client';

/**
 * apps/frontend/src/app/dashboard/page.tsx
 *
 * MAJOR FUNCTION: The main landing page after login.
 * Shows options: Create Room (host) or Join Room (participant via invite code).
 *
 * POST /rooms/join takes the invite code and returns the room data.
 * On success: redirect to /room/[roomCode]/lobby.
 * The lobby page then handles the socket connection and franchise selection redirect.
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { fetchApi, ApiError } from '@/lib/api';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface JoinRoomResponse {
  roomId: string;
  roomCode: string;
  status: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();

  const [inviteCode, setInviteCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Redirect to login if not authenticated (using useEffect to avoid render-time side effects)
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) return <LoadingSpinner message="Loading..." />;
  if (!user) return null;

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setJoinError(null);
    setIsJoining(true);
    try {
      const data = await fetchApi<JoinRoomResponse>('/rooms/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode: inviteCode.toUpperCase().trim() }),
      });
      router.push(`/room/${data.roomCode}/lobby`);
    } catch (err) {
      setJoinError(err instanceof ApiError ? err.message : 'Failed to join room.');
      setIsJoining(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">

        {/* Nav */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-xl shadow-lg">
              🏏
            </div>
            <div>
              <p className="text-white font-semibold text-sm leading-tight">IPL Mock Auction</p>
              <p className="text-slate-400 text-xs">Welcome, {user.username}</p>
            </div>
          </div>
          <button
            id="logout-btn"
            onClick={logout}
            className="text-slate-400 hover:text-white text-sm transition"
          >
            Sign out
          </button>
        </div>

        {/* Cards */}
        <div className="grid gap-4 sm:grid-cols-2">

          {/* Create Room */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-orange-500/30 transition-all group">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center text-2xl mb-4 shadow-lg shadow-orange-500/25 group-hover:scale-110 transition-transform">
              🏟️
            </div>
            <h2 className="text-white font-bold text-lg">Host an Auction</h2>
            <p className="text-slate-400 text-sm mt-1 mb-5">
              Create a room and invite up to 10 friends with a shareable code.
            </p>
            <button
              id="create-room-nav-btn"
              onClick={() => router.push('/room/create')}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-yellow-500 text-white font-semibold text-sm hover:from-orange-600 hover:to-yellow-600 transition-all shadow-lg shadow-orange-500/20"
            >
              Create Room →
            </button>
          </div>

          {/* Join Room */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-purple-500/30 transition-all group">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-2xl mb-4 shadow-lg shadow-purple-500/25 group-hover:scale-110 transition-transform">
              🎟️
            </div>
            <h2 className="text-white font-bold text-lg">Join an Auction</h2>
            <p className="text-slate-400 text-sm mt-1 mb-4">
              Enter the 6-character invite code from your host.
            </p>

            <form onSubmit={handleJoin} className="space-y-3" id="join-room-form">
              <input
                id="invite-code-input"
                type="text"
                value={inviteCode}
                onChange={(e) => {
                  setInviteCode(e.target.value.toUpperCase());
                  setJoinError(null);
                }}
                placeholder="Enter code (e.g. XK7P2Q)"
                maxLength={6}
                className="w-full px-4 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 font-mono text-center text-lg tracking-widest uppercase transition"
              />
              {joinError && (
                <p role="alert" className="text-red-300 text-xs text-center">{joinError}</p>
              )}
              <button
                id="join-room-btn"
                type="submit"
                disabled={inviteCode.length !== 6 || isJoining}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:from-purple-600 hover:to-blue-600 transition-all shadow-lg shadow-purple-500/20"
              >
                {isJoining ? 'Joining...' : 'Join Room →'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
