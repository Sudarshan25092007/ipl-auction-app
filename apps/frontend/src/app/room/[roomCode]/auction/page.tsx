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

import { useState, useEffect } from 'react';
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
  const [activeTab, setActiveTab] = useState<FranchiseName>('Mumbai Indians');
  const [showPhaseInterstitial, setShowPhaseInterstitial] = useState(false);
  const [phaseTransitionData, setPhaseTransitionData] = useState<{
    from: string;
    to: string;
    remainingBudgetsSummary: Array<{
      franchise: FranchiseName;
      walletRemainingLakhs: number;
    }>;
  } | null>(null);

  // Unwrap params
  useEffect(() => {
    params.then((p) => setRoomCode(p.roomCode));
  }, [params]);

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

  // 2. Handle Phase Transition Interstitial
  useEffect(() => {
    if (!socket || !isConnected) return;

    const onPhaseTransition = (payload: any) => {
      setPhaseTransitionData(payload);
      setShowPhaseInterstitial(true);
      // Automatically hide the full-screen transition slide after 5 seconds
      setTimeout(() => {
        setShowPhaseInterstitial(false);
      }, 5000);
    };

    socket.on(SOCKET_EVENTS.PHASE_TRANSITION, onPhaseTransition);

    return () => {
      socket.off(SOCKET_EVENTS.PHASE_TRANSITION, onPhaseTransition);
    };
  }, [socket, isConnected]);

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
    action: 'pause' | 'resume' | 'skip' | 'extend'
  ) => {
    if (!socket || !isConnected || !isHost) return;
    socket.emit('host:control', { roomCode, action });
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

  // List of franchises for Tab selection
  const franchises: FranchiseName[] = [
    'Mumbai Indians',
    'Chennai Super Kings',
    'Royal Challengers Bengaluru',
    'Kolkata Knight Riders',
    'Sunrisers Hyderabad',
    'Delhi Capitals',
    'Rajasthan Royals',
    'Punjab Kings',
    'Lucknow Super Giants',
    'Gujarat Titans',
  ];

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

      {/* Main Panel Grid */}
      <main className="flex-1 p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
        {/* LEFT COLUMN: MY FRANCHISE ROSTER & PURSE (3/12 grid) */}
        <section className="lg:col-span-3 flex flex-col h-full overflow-hidden">
          {myFranchise ? (
            <div className="h-full flex flex-col bg-slate-900/40 border border-cyan-500/20 rounded-3xl overflow-hidden p-4">
              <div className="mb-3 flex justify-between items-center shrink-0">
                <h2 className="text-xs font-bold text-cyan-400 uppercase tracking-widest">
                  My Franchise Roster
                </h2>
                <span className="text-[10px] font-black text-slate-300 bg-white/10 border border-white/10 px-2 py-0.5 rounded-md">
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

        {/* CENTER COLUMN: LIVE BOARD (6/12 grid) */}
        <section className="lg:col-span-6 flex flex-col justify-center space-y-4 h-full">
          {auctionState === 'idle' ? (
            <div className="flex-1 flex flex-col items-center justify-center border border-white/5 bg-slate-900/30 rounded-3xl p-8 text-center space-y-6">
              <div className="relative">
                <span className="text-6xl">🏟️</span>
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-cyan-500"></span>
                </span>
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-white">
                  Preparing Draft Arena
                </h2>
                <p className="text-slate-400 text-xs max-w-md">
                  Shuffling player pool and syncing franchise wallets. The first player will be on the block in moments...
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 bg-cyan-500/10 px-4 py-2 rounded-xl border border-cyan-500/20">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                <span>Synchronizing live draft board...</span>
              </div>
            </div>
          ) : auctionState === 'complete' ? (
            <div className="flex-1 flex flex-col items-center justify-center border border-white/5 bg-slate-900/30 rounded-3xl p-8 text-center space-y-4">
              <span className="text-6xl">🏆</span>
              <h2 className="text-2xl font-black text-white font-mono">
                Auction Completed!
              </h2>
              <p className="text-slate-400 text-sm max-w-sm">
                The live draft queue has been fully resolved. Click below to see the final squads and spends.
              </p>
              <button
                onClick={() => router.push(`/room/${roomCode}/results`)}
                className="px-6 py-3 bg-gradient-to-r from-teal-400 to-emerald-500 font-bold rounded-2xl text-slate-900 hover:shadow-lg hover:shadow-teal-400/10 cursor-pointer transition-all active:scale-[0.98]"
              >
                View Final Roster Results
              </button>
            </div>
          ) : (
            /* Active Live Auction Block */
            <div className="flex-1 flex flex-col justify-between p-4 bg-slate-900/20 border border-white/5 rounded-3xl overflow-hidden">
              {/* Player Up Card */}
              {currentPlayer && <PlayerCard player={currentPlayer} />}

              {/* Countdown & Bidding controls */}
              <div className="flex flex-col sm:flex-row items-center gap-4 py-4 shrink-0">
                <div className="shrink-0 bg-white/5 border border-white/5 rounded-2xl p-2">
                  <CountdownRing />
                </div>
                <div className="flex-1 w-full">
                  <BidButton onBid={handlePlaceBid} />
                </div>
              </div>

              {/* Scrolling history logs */}
              <div className="flex-1 overflow-hidden">
                <BidHistoryFeed />
              </div>
            </div>
          )}

          {/* HOST CONTROL PANEL */}
          {isHost && auctionState !== 'complete' && (
            <div className="bg-slate-900/80 border border-amber-500/20 rounded-2xl p-3 flex flex-col space-y-2 shrink-0">
              <div className="flex items-center gap-2 text-amber-400 text-[11px] font-bold uppercase tracking-wider">
                <span>🛡️ Host Administration Dashboard</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {auctionState === 'paused' ? (
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
                  className="py-2 rounded-xl font-bold text-xs bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/35 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all text-center"
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
              </div>
            </div>
          )}
        </section>

        {/* RIGHT COLUMN: INSPECTOR FOR OPPONENT FRANCHISES (3/12 grid) */}
        <section className="lg:col-span-3 flex flex-col h-full overflow-hidden">
          <div className="flex-1 flex flex-col bg-slate-900/40 border border-white/5 rounded-3xl overflow-hidden p-4 space-y-3">
            <div>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                League Roster Inspector
              </h2>
              <p className="text-[10px] text-slate-600 font-semibold uppercase mt-0.5 tracking-wider">
                Click a franchise to inspect their roster
              </p>
            </div>

            {/* Selector Grid (Filter out local user's own franchise) */}
            <div className="grid grid-cols-2 gap-1.5 shrink-0">
              {franchises
                .filter((name) => name !== myFranchise)
                .map((name) => (
                  <button
                    key={name}
                    onClick={() => setActiveTab(name)}
                    className={`py-1.5 px-2.5 rounded-xl text-left text-[11px] font-bold truncate transition-all duration-200 cursor-pointer ${
                      activeTab === name
                        ? 'bg-white/10 text-white border border-white/15 shadow-sm'
                        : 'bg-white/5 text-slate-500 hover:text-slate-300 border border-transparent'
                    }`}
                  >
                    {name.split(' ').pop()}
                  </button>
                ))}
            </div>

            {/* Inspection Panel Display */}
            <div className="flex-1 overflow-hidden">
              <SquadPanel franchise={activeTab} showWallet={true} />
            </div>
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
