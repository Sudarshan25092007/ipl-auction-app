'use client';

/**
 * apps/frontend/src/app/room/[roomCode]/lobby/page.tsx
 *
 * Locker Room Lobby (Item 6 Redesign)
 * Stadium tunnel / locker room command center with glassmorphic panels,
 * real-time ready toggles, host indicators, and teardown exit protocol.
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { fetchApi, ApiError } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { SOCKET_EVENTS } from '@ipl-auction/shared';
import type { LobbyParticipant } from '@ipl-auction/shared';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import authBg from '../../../../../public/images/auth-bg.jpg';

interface LobbyData {
  room: {
    id: string;
    roomCode: string;
    status: string;
    hostUserId: string;
  };
  participants: LobbyParticipant[];
  readyMap?: Record<string, string>;
}

export default function LobbyPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { socket, isConnected } = useSocket();

  const [roomCode, setRoomCode] = useState<string>('');
  const [lobbyData, setLobbyData] = useState<LobbyData | null>(null);
  const [participants, setParticipants] = useState<LobbyParticipant[]>([]);
  const [readyMap, setReadyMap] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Unwrap params Promise and update tab metadata
  useEffect(() => {
    params.then((p) => {
      setRoomCode(p.roomCode);
      document.title = p.roomCode ? `Room ${p.roomCode} | Lobby` : 'Locker Room | Lobby';
    });
  }, [params]);

  // ── Phase 1: REST initial load ──────────────────────────────────────────────
  useEffect(() => {
    if (!roomCode || authLoading) return;

    fetchApi<LobbyData>(`/rooms/${roomCode}`)
      .then((data) => {
        setLobbyData(data);
        setParticipants(data.participants);
        if (data.readyMap) {
          setReadyMap(data.readyMap);
        }
        setIsPageLoading(false);
      })
      .catch((err) => {
        setError(
          err instanceof ApiError ? err.message : 'Failed to load room.'
        );
        setIsPageLoading(false);
      });
  }, [roomCode, authLoading]);

  // ── Phase 2: Socket real-time updates ─────────────────────────────────────
  useEffect(() => {
    if (!socket || !roomCode || !isConnected || !lobbyData) return;

    // Emit room:join to subscribe to this room's Socket.IO channel
    socket.emit(SOCKET_EVENTS.JOIN_ROOM, { roomCode });

    const onUserJoined = (payload: { participants: LobbyParticipant[] }) => {
      if (payload?.participants) setParticipants(payload.participants);
    };

    const onUserLeft = (payload: { userId: string; username: string; newHostId?: string }) => {
      setParticipants((prev) => {
        const next = prev.filter((p) => p.userId !== payload.userId);
        if (payload.newHostId) {
          return next.map((p) => ({ ...p, isHost: p.userId === payload.newHostId }));
        }
        return next;
      });
      if (payload.newHostId && lobbyData) {
        setLobbyData({
          ...lobbyData,
          room: { ...lobbyData.room, hostUserId: payload.newHostId },
        });
      }
    };

    const onStateSync = (payload: { room: any; participants: LobbyParticipant[] }) => {
      if (payload?.participants) setParticipants(payload.participants);
      if (payload?.room) {
        setLobbyData((prev) => (prev ? { ...prev, room: payload.room } : null));
      }
    };

    const onFranchiseClaimed = (payload: { participants: LobbyParticipant[] }) => {
      if (payload?.participants) setParticipants(payload.participants);
    };

    const onReadyUpdate = (payload: { userId: string; isReady: boolean; allReady: Record<string, string> }) => {
      if (payload?.allReady) {
        setReadyMap(payload.allReady);
      } else if (payload?.userId) {
        setReadyMap((prev) => ({
          ...prev,
          [payload.userId]: payload.isReady ? '1' : '0',
        }));
      }
    };

    const onAuctionStarting = (payload?: { countdownSeconds?: number }) => {
      let currentSeconds = payload?.countdownSeconds ?? 3;
      setCountdown(currentSeconds);
      setIsStarting(true);

      const interval = setInterval(() => {
        currentSeconds -= 1;
        if (currentSeconds <= 0) {
          clearInterval(interval);
          setCountdown(null);
          router.push(`/room/${roomCode}/auction`);
        } else {
          setCountdown(currentSeconds);
        }
      }, 1000);
    };

    const onRoomError = (payload: { message: string }) => {
      setError(payload.message);
      setIsStarting(false);
      setCountdown(null);
    };

    socket.on(SOCKET_EVENTS.USER_JOINED, onUserJoined);
    socket.on(SOCKET_EVENTS.USER_LEFT, onUserLeft);
    socket.on(SOCKET_EVENTS.FRANCHISE_CLAIMED, onFranchiseClaimed);
    socket.on(SOCKET_EVENTS.READY_UPDATE, onReadyUpdate);
    socket.on('room:state_sync', onStateSync);
    socket.on('room:auction_starting', onAuctionStarting);
    socket.on('room:error', onRoomError);

    return () => {
      socket.off(SOCKET_EVENTS.USER_JOINED, onUserJoined);
      socket.off(SOCKET_EVENTS.USER_LEFT, onUserLeft);
      socket.off(SOCKET_EVENTS.FRANCHISE_CLAIMED, onFranchiseClaimed);
      socket.off(SOCKET_EVENTS.READY_UPDATE, onReadyUpdate);
      socket.off('room:state_sync', onStateSync);
      socket.off('room:auction_starting', onAuctionStarting);
      socket.off('room:error', onRoomError);
    };
  }, [socket, roomCode, isConnected, lobbyData, router]);

  // ── Copy invite code ────────────────────────────────────────────────────────
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2_000);
  }, [roomCode]);

  // ── Toggle ready status (instant optimistic update + socket emit) ──────────
  const isMyReady = user ? readyMap[user.sub] === '1' : false;
  const toggleReady = useCallback(() => {
    if (!socket || !roomCode || !user) return;
    const nextState = !isMyReady;
    setReadyMap((prev) => ({
      ...prev,
      [user.sub]: nextState ? '1' : '0',
    }));
    socket.emit(SOCKET_EVENTS.READY_TOGGLE, { roomCode, isReady: nextState });
  }, [socket, roomCode, user, isMyReady]);

  // ── Start auction (host only) ───────────────────────────────────────────────
  const handleStartAuction = useCallback(() => {
    if (!socket || !roomCode) return;
    setIsStarting(true);
    socket.emit(SOCKET_EVENTS.START_AUCTION, { roomCode });
  }, [socket, roomCode]);

  // ── Leave Arena (Authoritative Teardown) ─────────────────────────────────────
  const handleLeaveArena = useCallback(async () => {
    if (!roomCode || isLeaving) return;
    setIsLeaving(true);
    try {
      if (socket) {
        socket.emit(SOCKET_EVENTS.LEAVE_ROOM, { roomCode });
      }
      await fetchApi(`/rooms/${roomCode}/leave`, { method: 'POST' });
    } catch (err) {
      console.warn('Leave room request completed:', err);
    } finally {
      router.push('/dashboard');
    }
  }, [roomCode, isLeaving, socket, router]);

  // Redirect to login if unauthenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  if (authLoading || isPageLoading)
    return <LoadingSpinner message="Entering Locker Room Arena..." />;
  if (!user) return null;

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-8 text-center max-w-md space-y-4">
          <p className="text-4xl">⚠️</p>
          <p className="text-red-400 font-bold text-sm">{error}</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider transition-colors"
          >
            Back to Command Center
          </button>
        </div>
      </div>
    );
  }

  const isHost = user.sub === lobbyData?.room.hostUserId;
  const allHaveFranchise =
    participants.length > 0 && participants.every((p) => Boolean(p.franchise));
  const myParticipant = participants.find((p) => p.userId === user?.sub);
  const iHaveSelectedFranchise = Boolean(myParticipant?.franchise);

  const readyCount = participants.filter((p) => readyMap[p.userId] === '1').length;

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between overflow-hidden bg-[url('/images/auth-bg.jpg')] bg-cover bg-center bg-fixed selection:bg-cyan-500 selection:text-black">
      {/* Stadium Tunnel Background Overlay */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <Image
          src={authBg}
          alt="Stadium Tunnel Arena"
          fill
          priority
          placeholder="blur"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/95 via-slate-950/70 to-slate-950/95" />
      </div>

      {/* ─── Top Bar Header ────────────────────────────────────────────── */}
      <header className="relative z-10 border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-md px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-base shadow-md group-hover:scale-105 transition-transform">
              🏏
            </div>
            <span className="font-black text-white text-sm tracking-wide uppercase">
              IPL Mock <span className="text-cyan-400">Arena</span>
            </span>
          </Link>
          <span className="text-slate-600">|</span>
          <span className="text-xs font-bold text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Locker Room
          </span>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleLeaveArena}
            disabled={isLeaving}
            className="px-3.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5"
          >
            <span>🚪</span> Leave Arena
          </button>
        </div>
      </header>

      {/* ─── Main Lobby Arena Stage ────────────────────────────────────── */}
      <main className="relative z-10 flex-1 p-4 md:p-8 flex items-center justify-center">
        <div className="w-full max-w-4xl space-y-6">
          {/* Header Banner & Code Pod */}
          <div className="rounded-3xl bg-slate-900/60 border border-slate-800 backdrop-blur-lg p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl">
            <div className="space-y-1.5 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2.5">
                <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  Pre-Draft Chamber
                </span>
                {isHost && (
                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    👑 Host Control
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Locker Room Lobby
              </h1>
              <p className="text-xs text-slate-400 max-w-md">
                Claim your franchise, toggle ready status, and wait for the room host to initiate the draft.
              </p>
            </div>

            {/* Room Code Display Box */}
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center gap-4 shadow-inner shrink-0">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Room Invite Code
                </p>
                <p className="text-3xl font-mono font-black text-cyan-400 tracking-[0.25em] mt-0.5">
                  {roomCode}
                </p>
              </div>
              <button
                id="copy-invite-code"
                onClick={handleCopy}
                className={`px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 ${
                  copied
                    ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                    : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                }`}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Grid: Participants / Match Status */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Pod: Managers Roster (7/12) */}
            <div className="lg:col-span-7 rounded-3xl bg-slate-900/60 border border-slate-800 backdrop-blur-lg p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <h2 className="text-xs font-black text-slate-300 uppercase tracking-widest flex items-center gap-2">
                  <span>👥</span> Managers Present ({participants.length})
                </h2>
                <span className="text-[11px] font-bold text-slate-500">
                  {readyCount} / {participants.length} Ready
                </span>
              </div>

              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
                {participants.map((p) => {
                  const isReady = readyMap[p.userId] === '1';
                  const isMe = p.userId === user?.sub;

                  return (
                    <div
                      key={p.userId}
                      className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                        isMe
                          ? 'bg-cyan-500/5 border-cyan-500/30'
                          : 'bg-slate-950/40 border-slate-800/60 hover:bg-slate-900/40'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-slate-950 font-black text-sm flex items-center justify-center shadow-md uppercase">
                          {p.username[0]}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-white">
                              {p.username}
                            </span>
                            {p.isHost && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                Host
                              </span>
                            )}
                            {isMe && (
                              <span className="text-[10px] text-cyan-400 font-bold">
                                (You)
                              </span>
                            )}
                          </div>
                          <p className="text-xs mt-0.5">
                            {p.franchise ? (
                              <span className="text-emerald-400 font-semibold">
                                {p.franchise}
                              </span>
                            ) : (
                              <span className="text-slate-500 italic">
                                Claiming Franchise...
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                            isReady
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {isReady ? 'READY' : 'WAITING'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Pod: Match Readiness & Actions (5/12) */}
            <div className="lg:col-span-5 rounded-3xl bg-slate-900/60 border border-slate-800 backdrop-blur-lg p-6 space-y-5 shadow-2xl flex flex-col justify-between">
              <div>
                <h2 className="text-xs font-black text-slate-300 uppercase tracking-widest flex items-center gap-2 pb-3 border-b border-slate-800/80">
                  <span>⚡</span> Chamber Controls
                </h2>

                <div className="mt-4 space-y-3">
                  {/* Step 1: Franchise Selection Status */}
                  <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-bold uppercase">My Franchise:</span>
                      <span className="font-bold text-white">
                        {myParticipant?.franchise || 'None Selected'}
                      </span>
                    </div>
                    {!iHaveSelectedFranchise && (
                      <button
                        onClick={() => router.push(`/room/${roomCode}/franchise`)}
                        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-400 hover:to-blue-500 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-purple-500/20 transition-all"
                      >
                        🏏 Choose Franchise
                      </button>
                    )}
                  </div>

                  {/* Step 2: Ready Toggle Switch */}
                  <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-white">Readiness Status</p>
                      <p className="text-[10px] text-slate-400">Signal you are ready to draft</p>
                    </div>
                    <button
                      onClick={toggleReady}
                      className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                        isMyReady
                          ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {isMyReady ? '✓ READY' : 'STANDBY'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Host Action / Waiting Footer */}
              <div className="pt-4 border-t border-slate-800/80">
                {isHost ? (
                  <button
                    id="start-auction-btn"
                    onClick={handleStartAuction}
                    disabled={!allHaveFranchise || isStarting || !isConnected}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-sm uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2"
                  >
                    {isStarting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                        Initializing Arena...
                      </>
                    ) : (
                      <>
                        <span>🚀</span> Launch Live Auction
                      </>
                    )}
                  </button>
                ) : (
                  <div className="p-3 text-center rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-bold">
                    {allHaveFranchise
                      ? 'All franchises claimed. Waiting for host to launch...'
                      : 'Waiting for all managers to select franchises...'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ─── 3-Second Launch Transition Modal ─────────────────────────── */}
      {countdown !== null && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-6 animate-[fadeIn_0.2s_ease-out]">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-4xl shadow-2xl shadow-orange-500/30 animate-bounce">
            🏏
          </div>
          <div className="space-y-2">
            <h2 className="text-xs font-black text-amber-400 uppercase tracking-widest">
              Draft Arena Initializing
            </h2>
            <h1 className="text-4xl md:text-5xl font-black text-white">
              Starting in <span className="text-orange-400 font-mono">{countdown}</span>...
            </h1>
            <p className="text-slate-400 text-xs max-w-xs">
              Entering the live auction arena. Get your bidding paddles ready!
            </p>
          </div>
          <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-1000 ease-linear"
              style={{ width: `${((4 - countdown) / 3) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
