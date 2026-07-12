'use client';

/**
 * apps/frontend/src/app/room/[roomCode]/results/page.tsx
 *
 * MAJOR FUNCTION: Displays the final post-auction roster and spend results.
 * Fetches completed room data and franchise rosters via REST APIs.
 * Renders a grid showing rosters and expenditure totals for all 10 teams.
 *
 * SYSTEM CONCEPT — Static Hydration after Completion:
 *   Once the room moves to 'completed', the live socket connections are closed.
 *   The results page relies purely on standard stateless REST fetches,
 *   rendering static components that don't need real-time socket updates.
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
  const [loading, setLoading] = useState(true);

  // Unwrap params
  useEffect(() => {
    params.then((p) => setRoomCode(p.roomCode));
  }, [params]);

  // Load squads list
  useEffect(() => {
    if (!roomCode || !user) return;

    const loadResultsData = async () => {
      try {
        setLoading(true);
        const res = await fetchApi<{
          squads: Record<FranchiseName, RosterPlayer[]>;
        }>(`/rooms/${roomCode}/squads`);

        if (res.squads) {
          setSquads(res.squads);
        }
      } catch (err) {
        console.error('[ResultsPage] Failed to fetch squads:', err);
      } finally {
        setLoading(false);
      }
    };

    loadResultsData();
  }, [roomCode, user]);

  // Redirect to login if not authenticated (avoid render-time side effects)
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  if (authLoading || loading)
    return <LoadingSpinner message="Loading final rosters..." />;
  if (!user) return null;

  // franchises list
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
      {/* Header Bar */}
      <header className="border-b border-white/5 bg-slate-900/50 backdrop-blur px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="font-extrabold text-white text-lg tracking-tight">
            🏆 Final Roster & Draft Results
          </h1>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-white/5 border border-white/10 text-slate-400">
            Room Code:{' '}
            <span className="font-mono text-cyan-400">{roomCode}</span>
          </span>
        </div>

        <button
          onClick={() => router.push('/dashboard')}
          className="px-4 py-2 border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold transition-all cursor-pointer"
        >
          Return to Dashboard
        </button>
      </header>

      {/* Main summary view */}
      <main className="flex-grow p-6 space-y-8 max-w-7xl mx-auto w-full">
        {/* Results Page Info */}
        <div className="text-center max-w-md mx-auto space-y-2">
          <h2 className="text-3xl font-extrabold text-white">
            Draft Roster Summaries
          </h2>
          <p className="text-sm text-slate-500">
            All 10 IPL franchise squads, total cash spent, and full player
            acquisitions.
          </p>
        </div>

        {/* 10 Franchises Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {franchises.map((name) => {
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
                className="bg-slate-900/40 border border-white/5 rounded-3xl p-5 hover:border-white/10 transition-all duration-300 backdrop-blur flex flex-col min-h-[400px]"
              >
                {/* Team Header */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center font-extrabold text-lg text-white shadow-inner"
                    style={{ backgroundColor: meta?.primaryColor ?? '#FFF' }}
                  >
                    {meta?.abbreviation ?? 'T'}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white leading-tight">
                      {name}
                    </h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                      Roster count: {roster.length} / 25
                    </p>
                  </div>
                </div>

                {/* Spend Overview */}
                <div className="grid grid-cols-2 gap-2 bg-black/20 border border-white/5 rounded-2xl p-3 mb-4 text-center shrink-0">
                  <div>
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                      Total Spent
                    </p>
                    <p className="text-sm font-extrabold text-slate-200 mt-0.5 font-mono">
                      {formatLakhs(totalSpend)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                      Wallet Left
                    </p>
                    <p className="text-sm font-black text-teal-400 mt-0.5 font-mono">
                      {formatLakhs(remainingWallet)}
                    </p>
                  </div>
                </div>

                {/* Acquired Players list */}
                <div className="flex-1 overflow-y-auto space-y-2 max-h-60 pr-1 custom-scrollbar text-xs">
                  {roster.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-slate-600 font-medium italic py-10">
                      No players won by this team
                    </div>
                  ) : (
                    roster.map(({ player, pricePaidLakhs }) => (
                      <div
                        key={player.id}
                        className="flex items-center justify-between p-2 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-all duration-200"
                      >
                        <div className="flex items-center gap-1.5 font-medium text-slate-300">
                          <span>
                            {player.nationality === 'overseas' ? '✈️' : '🇮🇳'}
                          </span>
                          <span className="truncate max-w-[120px]">
                            {player.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 font-bold font-mono">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/5 text-slate-500 uppercase tracking-wider">
                            {player.role}
                          </span>
                          <span className="text-teal-400">
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
      </main>
    </div>
  );
}
