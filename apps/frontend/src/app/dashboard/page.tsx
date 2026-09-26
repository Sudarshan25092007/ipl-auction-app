'use client';

/**
 * apps/frontend/src/app/dashboard/page.tsx
 *
 * Streamlined Manager Dashboard matching the IPL Auction glassmorphism design system.
 * Features:
 * - Sidebar + Main Content command center layout
 * - Dark stadium frosted glass background (/images/auth-bg.jpg)
 * - Quick Action Grid: Host an Auction (Amber) & Join an Auction (Cyan)
 * - Active / Recent Drafts roster with direct re-entry
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { fetchApi, ApiError } from '@/lib/api';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import authBg from '../../../public/images/auth-bg.jpg';

interface JoinRoomResponse {
  roomId: string;
  roomCode: string;
  status: string;
}

interface CreateRoomResponse {
  roomId: string;
  roomCode: string;
  status: string;
}

interface UserRoom {
  id: string;
  roomCode: string;
  status: 'lobby' | 'active' | 'completed';
  hostUserId: string;
  franchise: string | null;
  isHost: boolean;
  memberCount: number;
  createdAt: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();

  // Quick action state
  const [inviteCode, setInviteCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Active drafts state
  const [recentRooms, setRecentRooms] = useState<UserRoom[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);

  // Redirect to login if unauthenticated and set document title
  useEffect(() => {
    document.title = 'Manager Dashboard | IPL Mock Auction';
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  // Fetch user's active/recent drafts
  useEffect(() => {
    if (!user) return;
    async function loadRecentDrafts() {
      try {
        const data = await fetchApi<{ rooms: UserRoom[] }>('/rooms/my/recent');
        setRecentRooms(data.rooms || []);
      } catch (err) {
        // Fallback silently if no rooms or error
        setRecentRooms([]);
      } finally {
        setIsLoadingRooms(false);
      }
    }
    loadRecentDrafts();
  }, [user]);

  if (isLoading) return <LoadingSpinner message="Loading Manager Command Center..." />;
  if (!user) return null;

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (inviteCode.trim().length !== 6) return;
    setActionError(null);
    setIsJoining(true);
    try {
      const data = await fetchApi<JoinRoomResponse>('/rooms/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode: inviteCode.toUpperCase().trim() }),
      });
      router.push(`/room/${data.roomCode}/lobby`);
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Failed to join room. Please check code.'
      );
      setIsJoining(false);
    }
  }

  async function handleCreateRoom() {
    setActionError(null);
    setIsCreating(true);
    try {
      const data = await fetchApi<CreateRoomResponse>('/rooms', {
        method: 'POST',
      });
      router.push(`/room/${data.roomCode}/lobby`);
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Failed to create room. Please try again.'
      );
      setIsCreating(false);
    }
  }

  function getDestinationUrl(room: UserRoom): string {
    if (room.status === 'completed') {
      return `/room/${room.roomCode}/results`;
    }
    if (room.status === 'active') {
      return `/room/${room.roomCode}/auction`;
    }
    return `/room/${room.roomCode}/lobby`;
  }

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row overflow-hidden bg-[url('/images/auth-bg.jpg')] bg-cover bg-center bg-fixed selection:bg-cyan-500 selection:text-black">
      {/* Stadium Background with Heavy Frosted Glass Overlay */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <Image
          src={authBg}
          alt="Auction Arena Background"
          fill
          priority
          placeholder="blur"
          className="object-cover object-center"
        />
        {/* Heavy command center overlay */}
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-lg" />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/90 via-slate-950/70 to-slate-950/95" />
      </div>

      {/* ─── 1. Left Sidebar (Fixed / Desktop w-64) ────────────────────── */}
      <aside className="relative z-20 w-full md:w-64 md:min-h-screen bg-slate-900/50 border-b md:border-b-0 md:border-r border-slate-800 backdrop-blur-md flex flex-col justify-between shrink-0 p-5 md:p-6 shadow-2xl">
        <div>
          {/* Logo & Brand Header */}
          <Link href="/dashboard" className="flex items-center gap-3 mb-8 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-xl shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform">
              🏏
            </div>
            <div>
              <div className="text-white font-black text-sm tracking-wide uppercase leading-tight">
                IPL Mock <span className="text-cyan-400">Auction</span>
              </div>
              <div className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">
                Draft Command
              </div>
            </div>
          </Link>

          {/* Navigation Items */}
          <nav className="space-y-2">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-bold text-sm shadow-sm transition-all"
            >
              <span className="text-lg">⚡</span>
              <span>Dashboard</span>
            </Link>

            <Link
              href="/history"
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/50 hover:border-slate-700/60 border border-transparent font-semibold text-sm transition-all"
            >
              <span className="text-lg">📜</span>
              <span>History Ledger</span>
            </Link>

            <Link
              href="/players"
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/50 hover:border-slate-700/60 border border-transparent font-semibold text-sm transition-all"
            >
              <span className="text-lg">📋</span>
              <span>Player Pool</span>
            </Link>
          </nav>
        </div>

        {/* Sidebar Bottom: User Profile & Logout */}
        <div className="pt-6 mt-6 border-t border-slate-800/80 space-y-4">
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 text-slate-950 font-black text-sm flex items-center justify-center shadow-md uppercase">
              {user.username.charAt(0)}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white truncate">{user.username}</p>
              <p className="text-[10px] text-slate-400 truncate">{user.email || 'Manager'}</p>
            </div>
          </div>

          <button
            id="logout-btn"
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-bold tracking-wider uppercase transition-colors"
          >
            <span>⏻</span> Sign Out
          </button>
        </div>
      </aside>

      {/* ─── 2. Main Content Area ────────────────────────────────────── */}
      <main className="relative z-10 flex-1 min-h-screen overflow-y-auto p-5 sm:p-8 lg:p-10">
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Welcome Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800/60">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Welcome back,{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">
                  {user.username}
                </span>
              </h1>
              <p className="text-slate-400 text-sm mt-1">
                The auction arena is ready. Host a new draft room or enter an active auction.
              </p>
            </div>
          </div>

          {/* Action Notification Error Banner */}
          {actionError && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-sm flex items-center justify-between backdrop-blur-md shadow-lg"
            >
              <div className="flex items-center gap-2">
                <span>⚠️</span>
                <span>{actionError}</span>
              </div>
              <button
                type="button"
                onClick={() => setActionError(null)}
                className="text-rose-300 hover:text-white text-xs font-bold ml-4"
              >
                ✕
              </button>
            </div>
          )}

          {/* ─── 3. The Quick Action Grid (The Core UX) ───────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Card 1: Host an Auction */}
            <div className="bg-slate-900/60 border border-slate-800 backdrop-blur-md rounded-2xl p-6 sm:p-8 flex flex-col justify-between hover:border-amber-500/40 hover:bg-slate-800/60 transition-all duration-300 group shadow-2xl">
              <div>
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center text-2xl mb-5 shadow-inner group-hover:scale-105 transition-transform">
                  🏟️
                </div>
                <h2 className="text-xl font-black text-white tracking-tight mb-2">
                  Host an Auction
                </h2>
                <p className="text-slate-400 text-sm leading-relaxed mb-6">
                  Create a custom room and invite up to 10 managers to draft squads in real-time with an official 6-character room code.
                </p>
              </div>

              <button
                id="create-room-nav-btn"
                onClick={handleCreateRoom}
                disabled={isCreating}
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950/40 border-t-slate-950 rounded-full animate-spin" />
                    <span>Creating Room...</span>
                  </>
                ) : (
                  <>
                    <span>Create New Room</span>
                    <span>→</span>
                  </>
                )}
              </button>
            </div>

            {/* Card 2: Join an Auction */}
            <div className="bg-slate-900/60 border border-slate-800 backdrop-blur-md rounded-2xl p-6 sm:p-8 flex flex-col justify-between hover:border-cyan-500/40 hover:bg-slate-800/60 transition-all duration-300 group shadow-2xl">
              <div>
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center text-2xl mb-5 shadow-inner group-hover:scale-105 transition-transform">
                  🎟️
                </div>
                <h2 className="text-xl font-black text-white tracking-tight mb-2">
                  Join an Auction
                </h2>
                <p className="text-slate-400 text-sm leading-relaxed mb-4">
                  Enter the 6-character invite code provided by your league host to take your seat in the auction arena.
                </p>

                <form onSubmit={handleJoin} className="space-y-4" id="join-room-form">
                  <div>
                    <input
                      id="invite-code-input"
                      type="text"
                      value={inviteCode}
                      onChange={(e) => {
                        setInviteCode(e.target.value.toUpperCase());
                        setActionError(null);
                      }}
                      placeholder="e.g. XK7P2Q"
                      maxLength={6}
                      className="w-full px-4 py-3 bg-slate-950/50 border border-slate-700 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 text-white placeholder-slate-500 font-mono text-center text-lg tracking-widest uppercase rounded-xl transition shadow-inner"
                    />
                  </div>

                  <button
                    id="join-room-btn"
                    type="submit"
                    disabled={inviteCode.trim().length !== 6 || isJoining}
                    className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-sm uppercase tracking-wider shadow-lg shadow-cyan-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
                  >
                    {isJoining ? (
                      <>
                        <div className="w-4 h-4 border-2 border-slate-950/40 border-t-slate-950 rounded-full animate-spin" />
                        <span>Entering Room...</span>
                      </>
                    ) : (
                      <>
                        <span>Enter Room</span>
                        <span>→</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* ─── 4. Active/Recent Drafts (The Roster) ─────────────────── */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  Your Active Drafts
                </h2>
                {!isLoadingRooms && (
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 text-xs font-semibold">
                    {recentRooms.length}
                  </span>
                )}
              </div>
            </div>

            {isLoadingRooms ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[...Array(2)].map((_, i) => (
                  <div
                    key={i}
                    className="h-28 bg-slate-900/40 border border-slate-800/80 rounded-xl backdrop-blur-sm animate-pulse"
                  />
                ))}
              </div>
            ) : recentRooms.length === 0 ? (
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-8 text-center backdrop-blur-sm shadow-xl">
                <span className="text-3xl">🏟️</span>
                <h3 className="text-base font-bold text-slate-200 mt-2">
                  No active drafts found
                </h3>
                <p className="text-slate-400 text-xs mt-1 max-w-sm mx-auto">
                  Host a new room or join with a code above to start bidding on 250+ IPL players.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recentRooms.map((room) => {
                  const isLive = room.status === 'active';
                  const isCompleted = room.status === 'completed';
                  return (
                    <div
                      key={room.id}
                      className="bg-slate-900/60 border border-slate-800 backdrop-blur-sm rounded-xl p-5 hover:bg-slate-800/60 hover:border-slate-700 transition-all flex items-center justify-between gap-4 shadow-lg group"
                    >
                      <div>
                        <div className="flex items-center gap-2.5 mb-1.5">
                          <span className="font-mono text-base font-black text-white tracking-wider group-hover:text-cyan-400 transition-colors">
                            {room.roomCode}
                          </span>
                          {/* Status Badge */}
                          {isLive ? (
                            <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-black uppercase tracking-wider animate-pulse flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                              LIVE
                            </span>
                          ) : isCompleted ? (
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                              COMPLETED
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[10px] font-bold uppercase tracking-wider">
                              LOBBY
                            </span>
                          )}

                          {/* Host Tag */}
                          {room.isHost && (
                            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold uppercase tracking-wider">
                              HOST
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-400">
                          {room.franchise ? (
                            <span className="text-slate-300 font-medium">
                              Franchise: <strong className="text-white">{room.franchise}</strong>
                            </span>
                          ) : (
                            <span>{room.memberCount} {room.memberCount === 1 ? 'Manager' : 'Managers'} joined</span>
                          )}
                        </p>
                      </div>

                      <button
                        onClick={() => router.push(getDestinationUrl(room))}
                        className="px-4 py-2 rounded-lg bg-slate-800/80 hover:bg-cyan-500 hover:text-slate-950 text-slate-300 border border-slate-700/80 hover:border-cyan-400 font-bold text-xs uppercase tracking-wider transition-all duration-200 shadow-sm shrink-0"
                      >
                        Rejoin Arena →
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ─── 5. Arena Hub & Resource Directory ─────────────────────── */}
          <div className="space-y-4 pt-4 border-t border-slate-800/60">
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              Arena Hub & Resources
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Card A: Player Catalogue */}
              <div className="bg-slate-900/60 border border-slate-800 backdrop-blur-md rounded-2xl p-6 flex flex-col justify-between hover:border-cyan-500/30 transition-all shadow-xl group">
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center text-xl shadow-inner">
                    📋
                  </div>
                  <h3 className="text-base font-bold text-white group-hover:text-cyan-400 transition-colors">
                    Player Pool Catalogue
                  </h3>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    Inspect all 250+ players across Marquee, Batters, Pace, Spin, All-Rounders, and WKs with base prices.
                  </p>
                </div>
                <Link
                  href="/players"
                  className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors uppercase tracking-wider"
                >
                  Explore Pool <span>→</span>
                </Link>
              </div>

              {/* Card B: Historical Ledger */}
              <div className="bg-slate-900/60 border border-slate-800 backdrop-blur-md rounded-2xl p-6 flex flex-col justify-between hover:border-amber-500/30 transition-all shadow-xl group">
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center text-xl shadow-inner">
                    🏛️
                  </div>
                  <h3 className="text-base font-bold text-white group-hover:text-amber-400 transition-colors">
                    Historical Ledger
                  </h3>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    Review completed auctions, immutable squad snapshots, top marquee buys, and budget efficiency.
                  </p>
                </div>
                <Link
                  href="/history"
                  className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors uppercase tracking-wider"
                >
                  View Archives <span>→</span>
                </Link>
              </div>

              {/* Card C: League Rules & Engine */}
              <div className="bg-slate-900/60 border border-slate-800 backdrop-blur-md rounded-2xl p-6 flex flex-col justify-between hover:border-emerald-500/30 transition-all shadow-xl group">
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl shadow-inner">
                    ⚖️
                  </div>
                  <h3 className="text-base font-bold text-white group-hover:text-emerald-400 transition-colors">
                    Auction Regulations
                  </h3>
                  <p className="text-slate-400 text-xs leading-relaxed">
                    ₹120 Cr starting purse, dynamic scarcity pool sizing, 30s initial timer, and 10s reset on contested bids.
                  </p>
                </div>
                <div className="mt-5 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Authoritative Engine
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
