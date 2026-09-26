'use client';

/**
 * apps/frontend/src/app/room/[roomCode]/auction/page.tsx
 *
 * MAJOR FUNCTION: The live auction interface page.
 * Aggregates all live auction components into a three-column workspace layout.
 * Controls WebSocket bindings and REST API state hydration.
 *
 * SYSTEM CONCEPT — Three-Column Dashboard Grid:
 *   1. Left Column: Tabbed inspector to toggle and view other franchise squads.
 *   2. Center Column: Live player card, progress bar, countdown ring, bid button, bid feed,
 *      and host control buttons (pause/resume, skip, timer extension).
 *   3. Right Column: Dedicated panel showing the local user's claimed franchise roster.
 */

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { useAuction } from '@/hooks/useAuction';
import { useAuctionStore } from '@/stores/auctionStore';
import { PlayerCard, formatLakhs } from '@/components/auction/PlayerCard';
import { CountdownRing } from '@/components/auction/CountdownRing';
import { BidButton } from '@/components/auction/BidButton';
import { BidHistoryFeed } from '@/components/auction/BidHistoryFeed';
import { SoldOverlay } from '@/components/auction/SoldOverlay';
import { SquadPanel } from '@/components/squad/SquadPanel';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { fetchApi } from '@/lib/api';
import { SOCKET_EVENTS } from '@ipl-auction/shared';
import type { FranchiseName } from '@ipl-auction/shared';

export default function AuctionPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { socket, isConnected } = useSocket();

  const [roomCode, setRoomCode] = useState<string>('');
  const [hostUserId, setHostUserId] = useState<string | null>(null);
  const [roomParticipants, setRoomParticipants] = useState<
    Array<{ userId: string; franchise: FranchiseName | null }>
  >([]);
  const [activeTab, setActiveTab] = useState<FranchiseName>('Mumbai Indians');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPhaseInterstitial, setShowPhaseInterstitial] = useState(false);
  const [phaseTransitionData, setPhaseTransitionData] = useState<{
    from: string;
    to: string;
    remainingBudgetsSummary: Array<{
      franchise: FranchiseName;
      walletRemainingLakhs: number;
    }>;
  } | null>(null);

  // Presence alerts queue & away status map (Tab switch / Disconnect notifications)
  const [presenceAlerts, setPresenceAlerts] = useState<
    Array<{ id: string; message: string; type: 'warning' | 'info' | 'success' }>
  >([]);
  const [awayManagers, setAwayManagers] = useState<
    Record<string, { isAway: boolean; reason: string }>
  >({});

  // Unwrap params and set tab metadata
  useEffect(() => {
    params.then((p) => {
      setRoomCode(p.roomCode);
      document.title = p.roomCode ? `Live Auction | ${p.roomCode}` : 'Live Auction | IPL Mock Arena';
    });
  }, [params]);

  // Track tab visibility and online/offline status to notify other participants
  useEffect(() => {
    if (!socket || !isConnected || !roomCode) return;

    const handleVisibilityChange = () => {
      const isHidden = document.hidden;
      socket.emit('auction:manager_presence', {
        roomCode,
        isAway: isHidden,
        reason: isHidden ? 'tab_switched' : 'active',
      });
    };

    const handleOffline = () => {
      socket.emit('auction:manager_presence', {
        roomCode,
        isAway: true,
        reason: 'offline',
      });
    };

    const handleOnline = () => {
      socket.emit('auction:manager_presence', {
        roomCode,
        isAway: false,
        reason: 'online',
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [socket, isConnected, roomCode]);

  // Bind WebSocket events to Zustand store
  useAuction(socket, roomCode, isConnected);

  // Read state from Zustand store
  const {
    currentPlayer,
    auctionState,
    auctionPhase,
    queuePosition,
    queueTotal,
    myFranchiseState,
    setIsHost: setStoreIsHost,
    setMyFranchise: setStoreMyFranchise,
    setSquadPlayers,
  } = useAuctionStore();

  const isHost = Boolean(user && hostUserId && user.sub === hostUserId);
  const storeFranchise = useAuctionStore((state) => state.myFranchise);
  const myFranchise = myFranchiseState?.franchise ?? storeFranchise ?? null;

  // Sync isHost and myFranchise to store
  useEffect(() => {
    setStoreIsHost(isHost);
    if (myFranchise) {
      setStoreMyFranchise(myFranchise);
    }
  }, [isHost, myFranchise, setStoreIsHost, setStoreMyFranchise]);

  // 1. Initial Load: Fetch room data to check host & participants, and load all squad players won so far
  useEffect(() => {
    if (!roomCode || !user) return;

    const loadInitialData = async () => {
      try {
        // Fetch room info to identify host and participant franchise claims
        const roomRes = await fetchApi<{
          room: { hostUserId: string; status: string };
          participants: Array<{ userId: string; franchise: FranchiseName | null }>;
        }>(`/rooms/${roomCode}`);
        setHostUserId(roomRes.room.hostUserId);
        if (roomRes.participants) {
          setRoomParticipants(roomRes.participants);
        }

        // Immediate fallback: hydrate user franchise from participants list
        const me = roomRes.participants?.find((p) => p.userId === user.sub);
        if (me?.franchise) {
          setStoreMyFranchise(me.franchise);
        }

        // Fetch squad won players list for state sync
        const squadRes = await fetchApi<{
          squads: Record<FranchiseName, any[]>;
        }>(`/rooms/${roomCode}/squads`);

        if (squadRes.squads) {
          setSquadPlayers(squadRes.squads);
        }
      } catch (err) {
        console.error('[AuctionPage] Failed to fetch initial data:', err);
      }
    };

    loadInitialData();
  }, [roomCode, user, setSquadPlayers, setStoreMyFranchise]);

  // Compute claimed opponent franchises present specifically in THIS room
  const opponentFranchises = useMemo(() => {
    const claimed = roomParticipants
      .map((p) => p.franchise)
      .filter((f): f is FranchiseName => Boolean(f));
    const unique = Array.from(new Set(claimed));
    return unique.filter((name) => name !== myFranchise);
  }, [roomParticipants, myFranchise]);

  // Auto-select first available opponent franchise tab
  useEffect(() => {
    if (opponentFranchises.length > 0 && !opponentFranchises.includes(activeTab)) {
      setActiveTab(opponentFranchises[0]);
    }
  }, [opponentFranchises, activeTab]);

  // 2. Listen for real-time room events (error handling & participant syncing)
  useEffect(() => {
    if (!socket || !isConnected) return;

    const onRoomError = (payload: { message?: string }) => {
      if (payload?.message) {
        setErrorMessage(payload.message);
        setTimeout(() => setErrorMessage(null), 5000);
      }
    };

    const onUserJoined = (payload: { participants: Array<{ userId: string; franchise: FranchiseName | null }> }) => {
      if (payload?.participants) setRoomParticipants(payload.participants);
    };

    const onFranchiseClaimed = (payload: { participants: Array<{ userId: string; franchise: FranchiseName | null }> }) => {
      if (payload?.participants) setRoomParticipants(payload.participants);
    };

    const onPhaseTransition = (payload: any) => {
      setPhaseTransitionData(payload);
      setShowPhaseInterstitial(true);
      setTimeout(() => {
        setShowPhaseInterstitial(false);
      }, 5000);
    };

    const onPresenceAlert = (payload: {
      userId: string;
      username: string;
      franchise: FranchiseName | null;
      isAway: boolean;
      reason: string;
      timestamp: number;
    }) => {
      if (!payload?.userId) return;

      // Update away status in state
      setAwayManagers((prev) => ({
        ...prev,
        [payload.userId]: { isAway: payload.isAway, reason: payload.reason },
      }));

      // Don't toast for self
      if (user && payload.userId === user.sub) return;

      const franchiseLabel = payload.franchise ? ` (${payload.franchise})` : '';
      let message = '';
      let alertType: 'warning' | 'info' | 'success' = 'info';

      if (payload.isAway) {
        alertType = 'warning';
        if (payload.reason === 'tab_switched') {
          message = `👁️ Manager "${payload.username}"${franchiseLabel} switched tabs / stepped out of auction.`;
        } else {
          message = `🔌 Manager "${payload.username}"${franchiseLabel} went offline / disconnected.`;
        }
      } else {
        alertType = 'success';
        message = `🟢 Manager "${payload.username}"${franchiseLabel} returned to the auction arena.`;
      }

      const alertId = `${payload.userId}_${Date.now()}`;
      setPresenceAlerts((prev) => [...prev.slice(-3), { id: alertId, message, type: alertType }]);

      // Auto dismiss after 6 seconds
      setTimeout(() => {
        setPresenceAlerts((prev) => prev.filter((a) => a.id !== alertId));
      }, 6000);
    };

    socket.on('room:error', onRoomError);
    socket.on(SOCKET_EVENTS.USER_JOINED, onUserJoined);
    socket.on(SOCKET_EVENTS.FRANCHISE_CLAIMED, onFranchiseClaimed);
    socket.on(SOCKET_EVENTS.PHASE_TRANSITION, onPhaseTransition);
    socket.on('auction:presence_alert', onPresenceAlert);

    return () => {
      socket.off('room:error', onRoomError);
      socket.off(SOCKET_EVENTS.USER_JOINED, onUserJoined);
      socket.off(SOCKET_EVENTS.FRANCHISE_CLAIMED, onFranchiseClaimed);
      socket.off(SOCKET_EVENTS.PHASE_TRANSITION, onPhaseTransition);
      socket.off('auction:presence_alert', onPresenceAlert);
    };
  }, [socket, isConnected, user]);

  // 3. Handle Bid Placement click
  const handlePlaceBid = (amountLakhs: number) => {
    if (!socket || !isConnected || !currentPlayer) return;
    socket.emit(SOCKET_EVENTS.BID_PLACED, {
      roomCode,
      playerId: currentPlayer.id,
      amountLakhs,
    });
  };

  // 4. Handle Host control commands
  const handleHostControl = (
    action: 'pause' | 'resume' | 'skip' | 'extend' | 'end'
  ) => {
    if (!socket || !isConnected || !isHost) return;
    if (action === 'end') {
      const confirmed = window.confirm(
        'Are you sure you want to end the auction early?'
      );
      if (!confirmed) return;
    }
    socket.emit('host:control', { roomCode, action });
  };

  // 5. Handle Start Auction (Host action from idle state)
  const handleStartAuction = () => {
    if (!socket || !isConnected || !isHost || !roomCode) return;
    socket.emit(SOCKET_EVENTS.START_AUCTION, { roomCode });
  };

  // Redirect to login if not authenticated (avoid render-time side effects)
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Auth Redirects
  if (authLoading) return <LoadingSpinner message="Validating connection..." />;
  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Bar Header */}
      <header className="border-b border-white/5 bg-slate-900/50 backdrop-blur px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="font-extrabold text-white text-lg tracking-tight flex items-center gap-2">
            🏏 IPL Live Auction Board
          </h1>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-white/5 border border-white/10 text-slate-400">
            Room:{' '}
            <span className="font-mono text-cyan-400 select-all">
              {roomCode}
            </span>
          </span>
          {isHost && (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/10 border border-amber-500/30 text-amber-400">
              👑 Room Host
            </span>
          )}
        </div>

        {/* Phase Badge & Progress */}
        {currentPlayer && (
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              {auctionPhase === 'marquee'
                ? '👑 Marquee Tier'
                : '⚡ General Draft'}
            </span>
            <span className="text-xs text-slate-400 font-bold font-mono">
              Queue: {queuePosition}/{queueTotal}
            </span>
          </div>
        )}

        {/* Connection status */}
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}
          />
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
            {isConnected ? 'Connected' : 'Reconnecting...'}
          </span>
        </div>
      </header>

      {/* Error Alert Toast */}
      {errorMessage && (
        <div className="mx-6 mt-4 p-3 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-semibold flex items-center justify-between animate-[fadeIn_0.2s_ease-out]">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-400 hover:text-red-200 text-xs font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Real-time Presence Alerts Toasts (Tab Switch, Disconnect, Offline) */}
      {presenceAlerts.length > 0 && (
        <div className="fixed top-20 right-6 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
          {presenceAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-3.5 rounded-2xl border text-xs font-semibold shadow-2xl backdrop-blur-md flex items-center justify-between pointer-events-auto transition-all animate-[slideIn_0.2s_ease-out] ${
                alert.type === 'warning'
                  ? 'bg-amber-950/90 border-amber-500/50 text-amber-200 shadow-amber-950/50'
                  : alert.type === 'success'
                  ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200 shadow-emerald-950/50'
                  : 'bg-slate-900/90 border-slate-700 text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-sm">{alert.type === 'warning' ? '⚠️' : '⚡'}</span>
                <span className="leading-snug">{alert.message}</span>
              </div>
              <button
                onClick={() => setPresenceAlerts((prev) => prev.filter((a) => a.id !== alert.id))}
                className="text-slate-400 hover:text-white text-xs font-bold ml-2 cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Panel Grid */}
      <main className="flex-1 p-4 sm:p-5 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 overflow-hidden">
        {/* LEFT COLUMN: MY FRANCHISE ROSTER & PURSE (3/12 grid - balanced sidebar) */}
        <section className="lg:col-span-3 xl:col-span-3 flex flex-col h-full overflow-hidden">
          {myFranchise ? (
            <div className="h-full flex flex-col bg-slate-900/50 border border-cyan-500/20 rounded-3xl overflow-hidden p-4 backdrop-blur-md shadow-xl">
              <div className="mb-3 flex justify-between items-center shrink-0">
                <h2 className="text-[11px] font-black text-cyan-400 uppercase tracking-widest">
                  My Franchise
                </h2>
                <span className="text-[10px] font-black text-slate-300 bg-white/10 border border-white/10 px-2.5 py-0.5 rounded-md truncate max-w-[140px]">
                  {myFranchise}
                </span>
              </div>
              <div className="flex-1 overflow-hidden">
                <SquadPanel franchise={myFranchise} showWallet={true} />
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center border border-dashed border-white/10 bg-slate-900/20 rounded-3xl p-6 text-center text-slate-500">
              <span className="text-3xl mb-2">👀</span>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Spectator View
              </p>
              <p className="text-[11px] text-slate-600 mt-1">
                No franchise claimed in lobby.
              </p>
            </div>
          )}
        </section>

        {/* CENTER COLUMN: LIVE ARENA STAGE (6/12 grid - focused stage) */}
        <section className="lg:col-span-6 xl:col-span-6 flex flex-col justify-between space-y-4 h-full relative">
          {/* Waiting Host Paused Overlay */}
          {auctionState === 'waiting_host' && (
            <div className="absolute inset-0 z-40 rounded-3xl bg-slate-950/90 border border-amber-500/40 backdrop-blur-lg flex flex-col items-center justify-center p-8 text-center space-y-4 animate-[fadeIn_0.3s_ease-out]">
              <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-3xl animate-pulse">
                ⏳
              </div>
              <div className="space-y-1 max-w-md">
                <h3 className="text-xl font-black text-amber-400 uppercase tracking-wide">
                  Auction Paused · Host Disconnected
                </h3>
                <p className="text-xs text-slate-300">
                  The authoritative auction timer is frozen. Waiting for the room host to reconnect within the 60-second recovery window.
                </p>
              </div>
              <div className="p-3 px-6 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono font-black text-sm">
                RECOVERY WINDOW ACTIVE
              </div>
            </div>
          )}

          {auctionState === 'idle' ? (
            <div className="flex-1 flex flex-col items-center justify-center border border-white/5 bg-slate-900/40 rounded-3xl p-8 text-center space-y-6 backdrop-blur-md shadow-2xl">
              <div className="relative">
                <span className="text-6xl">🏟️</span>
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-cyan-500"></span>
                </span>
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-white">
                  {isHost ? 'Draft Arena Ready' : 'Preparing Draft Arena'}
                </h2>
                <p className="text-slate-400 text-xs max-w-md">
                  {isHost
                    ? 'All systems ready. Click below to launch the live player auction for all participants.'
                    : 'Shuffling player pool and syncing franchise wallets. Waiting for the room host to launch the draft...'}
                </p>
              </div>

              {isHost ? (
                <button
                  id="start-auction-live-btn"
                  onClick={handleStartAuction}
                  disabled={!isConnected}
                  className="px-8 py-4 bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-black text-base rounded-2xl shadow-xl shadow-orange-500/20 active:scale-95 transition-all cursor-pointer flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>🚀</span> Start Live Auction
                </button>
              ) : (
                <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 bg-cyan-500/10 px-4 py-2 rounded-xl border border-cyan-500/20">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  <span>Waiting for host to start auction...</span>
                </div>
              )}
            </div>
          ) : auctionState === 'complete' ? (
            <div className="flex-1 flex flex-col items-center justify-center border border-white/5 bg-slate-900/40 rounded-3xl p-8 text-center space-y-4 backdrop-blur-md shadow-2xl">
              <span className="text-6xl">🏆</span>
              <h2 className="text-2xl font-black text-white font-mono">
                Auction Completed!
              </h2>
              <p className="text-slate-400 text-sm max-w-sm">
                The live draft queue has been fully resolved. Click below to view the final squads and historical records.
              </p>
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => router.push(`/room/${roomCode}/results`)}
                  className="px-6 py-3 bg-gradient-to-r from-teal-400 to-emerald-500 font-bold rounded-2xl text-slate-900 hover:shadow-lg hover:shadow-teal-400/10 cursor-pointer transition-all active:scale-[0.98]"
                >
                  View Final Results
                </button>
                <button
                  onClick={() => router.push('/history')}
                  className="px-6 py-3 bg-slate-800 hover:bg-slate-700 font-bold rounded-2xl text-white border border-slate-700 transition-all active:scale-[0.98]"
                >
                  View History Ledger
                </button>
              </div>
            </div>
          ) : (
            /* Active Live Auction Block */
            <div className="flex-1 flex flex-col justify-between p-4 bg-slate-900/30 border border-slate-800/80 rounded-3xl overflow-hidden backdrop-blur-md shadow-2xl space-y-4">
              {/* 1. DOMINANT ACTIVE PLAYER CARD */}
              {currentPlayer && <PlayerCard player={currentPlayer} />}

              {/* 2. BID ACTION & SVG COUNTDOWN RING */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 shrink-0">
                <div className="sm:col-span-4 flex justify-center">
                  <CountdownRing />
                </div>
                <div className="sm:col-span-8 w-full">
                  <BidButton onBid={handlePlaceBid} />
                </div>
              </div>

              {/* 3. COMPACT SCROLLING TERMINAL BID FEED */}
              <div className="shrink-0">
                <BidHistoryFeed />
              </div>
            </div>
          )}

          {/* HOST CONTROL PANEL */}
          {isHost && auctionState !== 'complete' && (
            <div className="bg-slate-900/90 border border-amber-500/20 rounded-2xl p-3 flex flex-col space-y-2 shrink-0 backdrop-blur-md shadow-lg">
              <div className="flex items-center justify-between text-amber-400 text-[11px] font-bold uppercase tracking-wider">
                <span>🛡️ Host Auction Control</span>
                <span className="text-[10px] text-slate-500 font-mono">Status: {auctionState}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {auctionState === 'paused' || auctionState === 'waiting_host' ? (
                  <button
                    onClick={() => handleHostControl('resume')}
                    className="py-2 rounded-xl text-slate-950 font-bold text-xs bg-green-400 hover:bg-green-500 cursor-pointer active:scale-95 transition-all text-center"
                  >
                    ▶ Resume Timer
                  </button>
                ) : (
                  <button
                    onClick={() => handleHostControl('pause')}
                    disabled={auctionState === 'idle'}
                    className="py-2 rounded-xl font-bold text-xs bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/35 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all text-center"
                  >
                    ⏸ Pause Timer
                  </button>
                )}

                <button
                  onClick={() => handleHostControl('skip')}
                  disabled={auctionState === 'idle'}
                  className="py-2 rounded-xl font-bold text-xs bg-orange-500/20 border border-orange-500/30 text-orange-300 hover:bg-orange-500/35 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all text-center"
                >
                  ⏭ Skip Player
                </button>

                <button
                  onClick={() => handleHostControl('extend')}
                  disabled={
                    auctionState === 'idle' || auctionState === 'paused'
                  }
                  className="py-2 rounded-xl font-bold text-xs bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/35 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all text-center"
                >
                  ⏳ Extend +15s
                </button>

                <button
                  id="end-auction-early-btn"
                  onClick={() => handleHostControl('end')}
                  className="py-2 rounded-xl font-bold text-xs bg-red-600/30 border border-red-500/50 text-red-300 hover:bg-red-600/50 cursor-pointer active:scale-95 transition-all text-center"
                >
                  🛑 End Auction
                </button>
              </div>
            </div>
          )}
        </section>

        {/* RIGHT COLUMN: INSPECTOR FOR OPPONENT FRANCHISES (3/12 grid - balanced sidebar) */}
        <section className="lg:col-span-3 xl:col-span-3 flex flex-col h-full overflow-hidden">
          <div className="flex-1 flex flex-col bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden p-4 space-y-3.5 backdrop-blur-md shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[11px] font-black text-slate-300 uppercase tracking-widest">
                  League Roster
                </h2>
                <p className="text-[10px] text-slate-500 font-semibold uppercase mt-0.5 tracking-wider">
                  Opponent Teams ({opponentFranchises.length})
                </p>
              </div>
            </div>

            {opponentFranchises.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-white/10 bg-slate-900/20 rounded-2xl p-4 text-center text-slate-500 space-y-2">
                <span className="text-3xl">👥</span>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Solo / No Opponents
                </p>
                <p className="text-[11px] text-slate-600 max-w-[180px]">
                  Other participants' claimed squads in this room will appear here.
                </p>
              </div>
            ) : (
              <>
                {/* Selector Grid with Active / Away Presence Badges */}
                <div className="grid grid-cols-2 gap-2 shrink-0">
                  {opponentFranchises.map((name) => {
                    const participant = roomParticipants.find((p) => p.franchise === name);
                    const awayInfo = participant ? awayManagers[participant.userId] : null;
                    const isAway = awayInfo?.isAway;

                    return (
                      <button
                        key={name}
                        onClick={() => setActiveTab(name)}
                        className={`py-2 px-2.5 rounded-xl text-left text-xs font-bold truncate transition-all duration-200 cursor-pointer flex items-center justify-between ${
                          activeTab === name
                            ? 'bg-white/15 text-white border border-white/20 shadow-sm'
                            : 'bg-white/5 text-slate-400 hover:text-slate-200 border border-transparent hover:bg-white/10'
                        }`}
                      >
                        <span className="truncate">{name.split(' ').pop()}</span>
                        {isAway ? (
                          <span
                            title={awayInfo?.reason === 'tab_switched' ? 'Tab switched / Stepped away' : 'Offline / Disconnected'}
                            className="inline-flex items-center gap-1 text-[8px] font-black uppercase text-amber-300 bg-amber-500/20 px-1 py-0.5 rounded border border-amber-500/30"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            Away
                          </span>
                        ) : (
                          <span
                            title="Active in auction arena"
                            className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Inspection Panel Display */}
                <div className="flex-1 overflow-hidden">
                  <SquadPanel franchise={activeTab} showWallet={true} />
                </div>
              </>
            )}
          </div>
        </section>
      </main>

      {/* OVERLAY ELEMENTS */}
      <SoldOverlay />

      {/* PHASE TRANSITION FULLSCREEN INTERSTITIAL */}
      {showPhaseInterstitial && phaseTransitionData && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 p-6 text-center space-y-8 animate-[fadeIn_0.3s_ease-out]">
          <div className="space-y-2 animate-pulse">
            <h2 className="text-sm font-black text-amber-400 uppercase tracking-widest">
              Draft Progress Update
            </h2>
            <h1 className="text-4xl md:text-6xl font-black text-white uppercase tracking-tight">
              Marquee Round Complete!
            </h1>
          </div>

          <div className="max-w-2xl w-full bg-white/5 border border-white/10 rounded-3xl p-6 text-left space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-white/5 pb-2">
              Franchise Remaining Budgets
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
              {phaseTransitionData.remainingBudgetsSummary.map((sum) => (
                <div
                  key={sum.franchise}
                  className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5"
                >
                  <span className="text-xs font-bold text-slate-300">
                    {sum.franchise}
                  </span>
                  <span className="text-xs font-black text-teal-400 font-mono">
                    {formatLakhs(sum.walletRemainingLakhs)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 text-slate-500 font-semibold text-xs animate-bounce mt-4">
            <span>⚡ Open Draft Round Starts in 5 Seconds...</span>
          </div>
        </div>
      )}
    </div>
  );
}
