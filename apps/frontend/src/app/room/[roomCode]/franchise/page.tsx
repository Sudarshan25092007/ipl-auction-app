'use client';

/**
 * apps/frontend/src/app/room/[roomCode]/franchise/page.tsx
 *
 * MAJOR FUNCTION: Franchise selection page.
 * Shows the 10 IPL franchise cards. User clicks one → socket emits room:franchise_select.
 * Server responds with room:franchise_claimed (success) or room:franchise_claimed_error (taken).
 *
 * SYSTEM CONCEPT — Race condition UX:
 *   Two users click "Mumbai Indians" at the same moment.
 *   - User A: server responds with room:franchise_claimed (all clients update)
 *   - User B: server responds with room:franchise_claimed_error (only User B sees this)
 *   User B's UI shows an error toast: "Franchise just taken — please select another."
 *   User B sees MI is now claimed on the grid (via the broadcast to all clients).
 *   This UX teaches the exact race condition interview answer:
 *     "The DB UNIQUE constraint caught the race. We handle 23505 server-side and
 *      emit a private error event to the loser. The winner's success is broadcast."
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { SOCKET_EVENTS } from '@ipl-auction/shared';
import type { LobbyParticipant, FranchiseName } from '@ipl-auction/shared';
import { FranchiseGrid } from '@/components/room/FranchiseGrid';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function FranchisePage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { socket, isConnected } = useSocket();

  const [roomCode, setRoomCode] = useState<string>('');
  const [participants, setParticipants] = useState<LobbyParticipant[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Unwrap params
  useEffect(() => {
    params.then((p) => setRoomCode(p.roomCode));
  }, [params]);

  // Socket event listeners
  useEffect(() => {
    if (!socket || !roomCode || !isConnected) return;

    // Join the socket room channel
    socket.emit(SOCKET_EVENTS.JOIN_ROOM, { roomCode });

    const onFranchiseClaimed = (payload: {
      participants: LobbyParticipant[];
      claimedByUserId: string;
      franchise: FranchiseName;
    }) => {
      setParticipants(payload.participants);
      setIsPending(false);
      // If I claimed it — navigate to lobby to wait
      if (payload.claimedByUserId === user?.sub) {
        router.push(`/room/${roomCode}/lobby`);
      }
    };

    const onUserJoined = (payload: { participants: LobbyParticipant[] }) => {
      setParticipants(payload.participants);
    };

    const onFranchiseError = (payload: { message: string }) => {
      setErrorMsg(payload.message);
      setIsPending(false);
      // Auto-clear error after 4 seconds
      setTimeout(() => setErrorMsg(null), 4_000);
    };

    socket.on(SOCKET_EVENTS.FRANCHISE_CLAIMED, onFranchiseClaimed);
    socket.on(SOCKET_EVENTS.USER_JOINED, onUserJoined);
    socket.on('room:franchise_claimed_error', onFranchiseError);

    return () => {
      socket.off(SOCKET_EVENTS.FRANCHISE_CLAIMED, onFranchiseClaimed);
      socket.off(SOCKET_EVENTS.USER_JOINED, onUserJoined);
      socket.off('room:franchise_claimed_error', onFranchiseError);
    };
  }, [socket, roomCode, isConnected, user, router]);

  const handleSelectFranchise = useCallback(
    (franchise: FranchiseName) => {
      if (!socket || !roomCode || isPending) return;
      setIsPending(true);
      setErrorMsg(null);
      socket.emit(SOCKET_EVENTS.SELECT_FRANCHISE, { roomCode, franchise });
    },
    [socket, roomCode, isPending]
  );

  if (authLoading) return <LoadingSpinner message="Checking session..." />;
  if (!user) { router.push('/login'); return null; }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">Choose Your Franchise</h1>
          <p className="text-slate-400 mt-2 text-sm">
            Select the IPL team you'll manage during the auction. First come, first served.
          </p>
          <div className="flex items-center justify-center gap-2 mt-3">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            <span className="text-xs text-slate-500">
              {isConnected ? 'Live — selections update in real-time' : 'Connecting...'}
            </span>
          </div>
        </div>

        {/* Error toast */}
        {errorMsg && (
          <div
            role="alert"
            className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm animate-pulse"
          >
            <span className="shrink-0 text-base">⚡</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Franchise grid */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <FranchiseGrid
            participants={participants}
            myUserId={user.sub}
            onSelect={handleSelectFranchise}
            isPending={isPending}
          />
        </div>

        {/* Participants status strip */}
        {participants.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-xl px-5 py-4">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-3">
              Room Status ({participants.filter(p => p.franchise).length}/{participants.length} selected)
            </p>
            <div className="flex flex-wrap gap-2">
              {participants.map((p) => (
                <div
                  key={p.userId}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                    p.franchise
                      ? 'bg-green-500/10 border border-green-500/20 text-green-300'
                      : 'bg-white/5 border border-white/10 text-slate-400'
                  }`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${p.franchise ? 'bg-green-400' : 'bg-amber-400 animate-pulse'}`} />
                  {p.username}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
