'use client';

/**
 * apps/frontend/src/app/room/[roomCode]/results/page.tsx
 *
 * MAJOR FUNCTION: Displays the final post-auction roster and spend results.
 * Fetches completed room data and franchise rosters via REST APIs.
 * Renders a grid showing rosters and expenditure totals ONLY for teams that participated in the auction.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { fetchApi } from '@/lib/api';
import { FRANCHISE_MAP } from '@ipl-auction/shared';
import type { FranchiseName, Player } from '@ipl-auction/shared';
import { formatLakhs } from '@/components/auction/PlayerCard';

interface RosterPlayer {
  pricePaidLakhs: number;
  player: Player;
}

export default function ResultsPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [roomCode, setRoomCode] = useState<string>('');
  const [squads, setSquads] = useState<Record<FranchiseName, RosterPlayer[]>>(
    {} as Record<FranchiseName, RosterPlayer[]>
  );
  const [participatingFranchises, setParticipatingFranchises] = useState<FranchiseName[]>([]);
  const [loading, setLoading] = useState(true);

  // Unwrap params
  useEffect(() => {
    params.then((p) => setRoomCode(p.roomCode));
  }, [params]);

  // Load squads & participating franchises list
  useEffect(() => {
    if (!roomCode || !user) return;

    const loadResultsData = async () => {
      try {
        setLoading(true);
        const [squadsRes, roomRes] = await Promise.all([
          fetchApi<{
            squads: Record<FranchiseName, RosterPlayer[]>;
            participatingFranchises?: FranchiseName[];
          }>(`/rooms/${roomCode}/squads`),
          fetchApi<{
            room: any;
            participants: Array<{ franchise?: FranchiseName | null; username: string }>;
          }>(`/rooms/${roomCode}`).catch(() => null),
        ]);

        if (squadsRes.squads) {
          setSquads(squadsRes.squads);
        }

        // Collect all franchises that actually participated (claimed or won players)
        const fromParticipants = (roomRes?.participants || [])
          .map((p) => p.franchise)
          .filter((f): f is FranchiseName => Boolean(f));

        const fromSquadsRes = (squadsRes.participatingFranchises || []) as FranchiseName[];
        const fromSquadKeys = Object.keys(squadsRes.squads || {}) as FranchiseName[];

        const uniqueFranchises = Array.from(
          new Set<FranchiseName>([...fromParticipants, ...fromSquadsRes, ...fromSquadKeys])
        );

        setParticipatingFranchises(uniqueFranchises);
      } catch (err) {
        console.error('[ResultsPage] Failed to fetch squads:', err);
      } finally {
        setLoading(false);
      }
    };

    loadResultsData();
  }, [roomCode, user]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  if (authLoading || loading)
    return <LoadingSpinner message="Loading final rosters..." />;
  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-black">
      {/* Header Bar */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md px-6 py-4 flex items-center justify-between shrink-0 sticky top-0 z-20 shadow-lg">
        <div className="flex items-center gap-4">
          <h1 className="font-black text-white text-lg tracking-tight flex items-center gap-2">
            <span>🏆</span> Final Roster & Draft Results
          </h1>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-800/80 border border-slate-700 text-slate-300">
            Room Code: <span className="font-mono text-cyan-400 font-black">{roomCode}</span>
          </span>
        </div>

        <button
          onClick={() => router.push('/dashboard')}
          className="px-4 py-2 border border-slate-700 hover:border-cyan-500/50 bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition-all shadow-sm"
        >
          ← Return to Dashboard
        </button>
      </header>

      {/* Main summary view */}
      <main className="flex-grow p-6 sm:p-8 space-y-8 max-w-7xl mx-auto w-full">
        {/* Results Page Info */}
        <div className="text-center max-w-lg mx-auto space-y-2">
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Draft Roster Summaries
          </h2>
          <p className="text-sm text-slate-400">
            {participatingFranchises.length > 0
              ? `${participatingFranchises.length} participating franchise ${
                  participatingFranchises.length === 1 ? 'squad' : 'squads'
                }, total budget spent, and final player acquisitions.`
              : 'Final franchise squads, total budget spent, and player acquisitions.'}
          </p>
        </div>

        {/* Participating Franchises Grid */}
        {participatingFranchises.length === 0 ? (
          <div className="text-center py-16 bg-slate-900/50 border border-slate-800 rounded-3xl backdrop-blur-md max-w-md mx-auto p-8 shadow-xl">
            <span className="text-4xl">🏟️</span>
            <h3 className="text-lg font-bold mt-4 text-white">No Participating Franchises</h3>
            <p className="text-slate-400 text-xs mt-1">
              No franchises were claimed in this auction room.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {participatingFranchises.map((name) => {
              const roster = squads[name] || [];
              const meta = FRANCHISE_MAP[name];

              // Spend math
              const totalSpend = roster.reduce(
                (sum, current) => sum + current.pricePaidLakhs,
                0
              );
              const remainingWallet = 12000 - totalSpend;

              return (
                <div
                  key={name}
                  className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 hover:border-slate-700 transition-all duration-300 backdrop-blur-md flex flex-col min-h-[400px] shadow-xl"
                >
                  {/* Team Header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-base text-white shadow-md"
                      style={{ backgroundColor: meta?.primaryColor ?? '#334155' }}
                    >
                      {meta?.abbreviation ?? 'T'}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white leading-tight">
                        {name}
                      </h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                        Roster count: <span className="text-slate-200">{roster.length}</span> / 25
                      </p>
                    </div>
                  </div>

                  {/* Spend Overview */}
                  <div className="grid grid-cols-2 gap-2 bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 mb-4 text-center shrink-0">
                    <div>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                        Total Spent
                      </p>
                      <p className="text-sm font-extrabold text-amber-400 mt-0.5 font-mono">
                        {formatLakhs(totalSpend)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                        Wallet Left
                      </p>
                      <p className="text-sm font-black text-cyan-400 mt-0.5 font-mono">
                        {formatLakhs(remainingWallet)}
                      </p>
                    </div>
                  </div>

                  {/* Acquired Players list */}
                  <div className="flex-1 overflow-y-auto space-y-2 max-h-60 pr-1 custom-scrollbar text-xs">
                    {roster.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-slate-500 font-medium italic py-10">
                        No players won by this team
                      </div>
                    ) : (
                      roster.map(({ player, pricePaidLakhs }) => (
                        <div
                          key={player.id}
                          className="flex items-center justify-between p-2.5 bg-slate-950/50 rounded-xl border border-slate-800/80 hover:bg-slate-800/60 transition-all duration-200"
                        >
                          <div className="flex items-center gap-1.5 font-medium text-slate-200">
                            <span>
                              {player.nationality === 'overseas' ? '✈️' : '🇮🇳'}
                            </span>
                            <span className="truncate max-w-[120px] font-semibold text-white">
                              {player.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 font-bold font-mono">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 uppercase tracking-wider">
                              {player.role}
                            </span>
                            <span className="text-amber-400">
                              {formatLakhs(pricePaidLakhs)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
