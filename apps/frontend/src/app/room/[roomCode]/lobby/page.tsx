'use client';

/**
 * apps/frontend/src/app/room/[roomCode]/lobby/page.tsx
 *
 * MAJOR FUNCTION: The real-time lobby. Shows all participants, their franchise selections,
 * the invite code to share, and the "Start Auction" button (host only).
 *
 * SYSTEM CONCEPT — Two-phase data loading (REST then Socket):
 *   Phase 1 — Mount: GET /rooms/:code via fetchApi → gets initial participant list.
 *   Phase 2 — Socket: socket.connect() → emit room:join → listen for room:user_joined.
 *   Why not ONLY socket? On page refresh, the socket hasn't connected yet.
 *   We need the initial state immediately from REST while the socket connects.
 *   Once connected, socket events provide real-time updates on top of the initial snapshot.
 *   This is the "REST for initial state, WebSocket for delta updates" pattern.
 *
 * SYSTEM CONCEPT — params is a Promise in Next.js 15:
 *   In Next.js 14+ App Router, dynamic route params ([roomCode]) are passed as a
 *   Promise. We use React.use(params) to unwrap them synchronously in RSCs,
 *   or receive them directly in 'use client' pages via the `params` prop.
 *
 * INVITE CODE COPY BUTTON:
 *   navigator.clipboard.writeText() is an async Permissions API.
 *   We show "Copied!" feedback for 2 seconds then reset.
 *   Fallback: if clipboard is unavailable (non-HTTPS), we select the text visually.
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi, ApiError } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { SOCKET_EVENTS } from '@ipl-auction/shared';
import type { LobbyParticipant } from '@ipl-auction/shared';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface LobbyData {
  room: {
    id: string;
    roomCode: string;
    status: string;
    hostUserId: string;
  };
  participants: LobbyParticipant[];
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
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);

  // Unwrap params Promise
  useEffect(() => {
    params.then((p) => setRoomCode(p.roomCode));
  }, [params]);

  // ── Phase 1: REST initial load ──────────────────────────────────────────────
  useEffect(() => {
    if (!roomCode || authLoading) return;

    fetchApi<LobbyData>(`/rooms/${roomCode}`)
      .then((data) => {
        setLobbyData(data);
        setParticipants(data.participants);
        setIsPageLoading(false);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Failed to load room.');
        setIsPageLoading(false);
      });
  }, [roomCode, authLoading]);

  // ── Phase 2: Socket real-time updates ─────────────────────────────────────
  useEffect(() => {
    if (!socket || !roomCode || !isConnected || !lobbyData) return;

    // Emit room:join to subscribe to this room's Socket.IO channel
    socket.emit(SOCKET_EVENTS.JOIN_ROOM, { roomCode });

    // Listen for participant updates (someone joined or claimed franchise)
    const onUserJoined = (payload: { participants: LobbyParticipant[] }) => {
      setParticipants(payload.participants);
    };
    const onFranchiseClaimed = (payload: { participants: LobbyParticipant[] }) => {
      setParticipants(payload.participants);
    };
    const onAuctionStarting = () => {
      // Auction has started — go to the live auction board, NOT back to franchise selection.
      // Franchise selection happens BEFORE the host starts; this event fires AFTER.
      router.push(`/room/${roomCode}/auction`);
    };
    const onRoomError = (payload: { message: string }) => {
      setError(payload.message);
    };

    socket.on(SOCKET_EVENTS.USER_JOINED, onUserJoined);
    socket.on(SOCKET_EVENTS.FRANCHISE_CLAIMED, onFranchiseClaimed);
    socket.on('room:auction_starting', onAuctionStarting);
    socket.on('room:error', onRoomError);

    return () => {
      socket.off(SOCKET_EVENTS.USER_JOINED, onUserJoined);
      socket.off(SOCKET_EVENTS.FRANCHISE_CLAIMED, onFranchiseClaimed);
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

  // ── Start auction (host only) ───────────────────────────────────────────────
  const handleStartAuction = useCallback(() => {
    if (!socket || !roomCode) return;
    setIsStarting(true);
    socket.emit(SOCKET_EVENTS.START_AUCTION, { roomCode });
  }, [socket, roomCode]);

  // ── Redirect to login if not authenticated (avoid render-time side effects) ─
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  if (authLoading || isPageLoading) return <LoadingSpinner message="Loading lobby..." />;
  if (!user) return null;
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-2xl mb-2">⚠️</p>
          <p className="text-red-300">{error}</p>
          <button onClick={() => router.push('/dashboard')} className="mt-4 text-orange-400 hover:text-orange-300">
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const isHost = user.sub === lobbyData?.room.hostUserId;
  const allHaveFranchise = participants.length > 0 && participants.every((p) => p.franchise);
  // Derive current user's participant record to know if THEY have selected a franchise
  const myParticipant = participants.find((p) => p.userId === user?.sub);
  const iHaveSelectedFranchise = Boolean(myParticipant?.franchise);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Auction Lobby</h1>
            <div className="flex items-center gap-2 mt-1">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
              <span className="text-xs text-slate-400">
                {isConnected ? 'Live' : 'Connecting...'}
              </span>
            </div>
          </div>
          {isHost && (
            <span className="px-3 py-1 rounded-full bg-orange-500/20 border border-orange-500/30 text-orange-300 text-xs font-semibold">
              👑 Host
            </span>
          )}
        </div>

        {/* Invite code card */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <p className="text-slate-400 text-sm mb-2">Room Invite Code</p>
          <div className="flex items-center gap-3">
            <span
              id="invite-code"
              className="text-4xl font-mono font-bold text-white tracking-[0.3em] flex-1"
            >
              {roomCode}
            </span>
            <button
              id="copy-invite-code"
              onClick={handleCopy}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                copied
                  ? 'bg-green-500/20 border border-green-500/30 text-green-300'
                  : 'bg-white/10 border border-white/20 text-white hover:bg-white/20'
              }`}
            >
              {copied ? '✓ Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-slate-500 text-xs mt-2">
            Share this code for others to join via the dashboard
          </p>
        </div>

        {/* Participants */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
            Participants ({participants.length})
          </h2>
          <div className="space-y-2">
            {participants.map((p) => (
              <div
                key={p.userId}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/5"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-yellow-500 flex items-center justify-center text-sm font-bold text-white">
                  {p.username[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium text-sm truncate">{p.username}</span>
                    {p.isHost && <span className="text-xs text-orange-400">Host</span>}
                    {p.userId === user?.sub && <span className="text-xs text-slate-500">(you)</span>}
                  </div>
                  {p.franchise ? (
                    <span className="text-xs text-green-400 truncate block">{p.franchise}</span>
                  ) : (
                    <span className="text-xs text-slate-500">Selecting franchise...</span>
                  )}
                </div>
                <div className={`w-2 h-2 rounded-full ${p.franchise ? 'bg-green-400' : 'bg-amber-400 animate-pulse'}`} />
              </div>
            ))}
          </div>
        </div>

        {/* CTA — two possible states per user */}
        <div className="space-y-3">

          {/* Step 1 — Franchise Selection (shown to EVERYONE who hasn't picked yet) */}
          {!iHaveSelectedFranchise && (
            <button
              id="select-franchise-btn"
              onClick={() => router.push(`/room/${roomCode}/franchise`)}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-500 to-blue-500 text-white font-bold text-lg hover:from-purple-600 hover:to-blue-600 transition-all duration-200 shadow-xl shadow-purple-500/25 flex items-center justify-center gap-2 animate-pulse"
            >
              🏏 Select Your Franchise
            </button>
          )}

          {/* Step 2 — Start Auction (host only, shown after franchise selected) */}
          {isHost ? (
            <button
              id="start-auction-btn"
              onClick={handleStartAuction}
              disabled={!allHaveFranchise || isStarting || !isConnected}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-yellow-500 text-white font-bold text-lg disabled:opacity-40 disabled:cursor-not-allowed hover:from-orange-600 hover:to-yellow-600 transition-all duration-200 shadow-xl shadow-orange-500/25 flex items-center justify-center gap-2"
            >
              {isStarting ? (
                <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Starting...</>
              ) : (
                <>🚀 Start Auction {!allHaveFranchise && `(${participants.filter(p => p.franchise).length}/${participants.length} ready)`}</>
              )}
            </button>
          ) : iHaveSelectedFranchise ? (
            <div className="text-center py-3 text-slate-400 text-sm bg-white/5 border border-white/10 rounded-2xl">
              ✅ Franchise selected — waiting for the host to start the auction...
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
