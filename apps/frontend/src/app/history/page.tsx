'use client';

/**
 * apps/frontend/src/app/history/page.tsx
 *
 * Historical Ledger Page (/history)
 * Displays immutable records of all completed and past auction events with squad snapshots.
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { fetchApi } from '@/lib/api';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import authBg from '../../../public/images/auth-bg.jpg';

interface HistoricalAuctionSummary {
  id: string;
  roomCode: string;
  status: 'completed' | 'terminated';
  completedAt: string;
  managerCount: number;
  myFranchise: string | null;
  myFinalPurseLakhs: number;
  mySquadCount: number;
  totalSpentLakhs: number;
  rank: number;
}

interface HistoricalSquadPlayer {
  playerId: string;
  playerName: string;
  category: string;
  role: string;
  nationality: string;
  isMarquee: boolean;
  isCapped: boolean;
  basePriceLakhs: number;
  pricePaidLakhs: number;
  acquiredAt: string;
}

interface HistoricalTeamRecord {
  franchise: string;
  managerUsername: string;
  walletRemainingLakhs: number;
  totalSpentLakhs: number;
  squadCount: number;
  squad: HistoricalSquadPlayer[];
}

interface HistoricalAuctionDetail {
  id: string;
  roomCode: string;
  status: 'completed' | 'terminated';
  hostUsername: string;
  createdAt: string;
  completedAt: string;
  teams: HistoricalTeamRecord[];
  topBuys: Array<{
    playerName: string;
    role: string;
    pricePaidLakhs: number;
    franchise: string;
  }>;
}

function formatPrice(lakhs: number): string {
  if (lakhs >= 100) {
    return `₹${(lakhs / 100).toFixed(2)} Cr`;
  }
  return `₹${lakhs}L`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Recent';
  }
}

export default function HistoryPage() {
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();

  const [historyList, setHistoryList] = useState<HistoricalAuctionSummary[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [selectedAuctionId, setSelectedAuctionId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<HistoricalAuctionDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [selectedTeamTab, setSelectedTeamTab] = useState<string | null>(null);

  // Redirect if unauthenticated and set dynamic metadata
  useEffect(() => {
    document.title = 'Historical Ledger | IPL Mock Auction';
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  // Load history list
  useEffect(() => {
    if (!user) return;
    async function loadHistory() {
      try {
        const data = await fetchApi<{ history: HistoricalAuctionSummary[] }>('/history');
        setHistoryList(data.history || []);
      } catch (err) {
        console.error('Failed to load history:', err);
        setHistoryList([]);
      } finally {
        setIsLoadingHistory(false);
      }
    }
    loadHistory();
  }, [user]);

  // Load detail when modal is opened
  async function openDetailModal(auctionId: string) {
    setSelectedAuctionId(auctionId);
    setIsLoadingDetail(true);
    try {
      const data = await fetchApi<{ detail: HistoricalAuctionDetail }>(`/history/${auctionId}`);
      setDetailData(data.detail);
      if (data.detail?.teams?.length > 0) {
        setSelectedTeamTab(data.detail.teams[0].franchise);
      }
    } catch (err) {
      console.error('Failed to load auction detail:', err);
    } finally {
      setIsLoadingDetail(false);
    }
  }

  function closeDetailModal() {
    setSelectedAuctionId(null);
    setDetailData(null);
    setSelectedTeamTab(null);
  }

  if (isLoading) return <LoadingSpinner message="Loading Historical Records..." />;
  if (!user) return null;

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row overflow-hidden bg-[url('/images/auth-bg.jpg')] bg-cover bg-center bg-fixed selection:bg-cyan-500 selection:text-black">
      {/* Stadium Background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <Image
          src={authBg}
          alt="Arena Background"
          fill
          priority
          placeholder="blur"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-lg" />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/90 via-slate-950/70 to-slate-950/95" />
      </div>

      {/* ─── 1. Left Sidebar ────────────────────────────────────────────── */}
      <aside className="relative z-20 w-full md:w-64 md:min-h-screen bg-slate-900/50 border-b md:border-b-0 md:border-r border-slate-800 backdrop-blur-md flex flex-col justify-between shrink-0 p-5 md:p-6 shadow-2xl">
        <div>
          {/* Logo & Header */}
          <Link href="/dashboard" className="flex items-center gap-3 mb-8 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-xl shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform">
              🏏
            </div>
            <div>
              <div className="text-white font-black text-sm tracking-wide uppercase leading-tight">
                IPL Mock <span className="text-cyan-400">Auction</span>
              </div>
              <div className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">
                Ledger / History
              </div>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="space-y-2">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent font-semibold text-sm transition-all"
            >
              <span className="text-lg">⚡</span>
              <span>Dashboard</span>
            </Link>

            <Link
              href="/history"
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-bold text-sm shadow-sm transition-all"
            >
              <span className="text-lg">📜</span>
              <span>History Ledger</span>
            </Link>

            <Link
              href="/players"
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent font-semibold text-sm transition-all"
            >
              <span className="text-lg">📋</span>
              <span>Player Pool</span>
            </Link>
          </nav>
        </div>

        {/* User Info & Logout */}
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
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-bold tracking-wider uppercase transition-colors"
          >
            <span>⏻</span> Sign Out
          </button>
        </div>
      </aside>

      {/* ─── 2. Main Content ────────────────────────────────────────────── */}
      <main className="relative z-10 flex-1 min-h-screen overflow-y-auto p-5 sm:p-8 lg:p-10">
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800/60">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
                <span>📜 Historical Auction Ledger</span>
              </h1>
              <p className="text-slate-400 text-sm mt-1">
                Durable, permanent records of completed mock auctions and final rosters.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 text-xs font-bold uppercase tracking-wider border border-slate-700 transition-colors w-fit"
            >
              ← Back to Dashboard
            </Link>
          </div>

          {/* Ledger Cards Grid */}
          {isLoadingHistory ? (
            <div className="p-8 text-center text-slate-400">
              <LoadingSpinner message="Querying historical auctions..." fullScreen={false} />
            </div>
          ) : historyList.length === 0 ? (
            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-md p-12 text-center space-y-4">
              <div className="text-5xl">🏟️</div>
              <h3 className="text-xl font-bold text-white">No Completed Auctions Yet</h3>
              <p className="text-slate-400 text-sm max-w-md mx-auto">
                Participate in or host an auction room until completion. All final team squads, purchase prices, and stats will be archived here.
              </p>
              <Link
                href="/dashboard"
                className="inline-block mt-4 px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-cyan-500/20"
              >
                Go to Arena
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {historyList.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 backdrop-blur-md p-6 space-y-5 transition-all hover:shadow-xl hover:shadow-cyan-950/20 group"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-cyan-400 font-black text-base tracking-wider">
                          ROOM #{item.roomCode}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                            item.status === 'completed'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p className="text-slate-400 text-xs mt-1">
                        {formatDate(item.completedAt)} · {item.managerCount} {item.managerCount === 1 ? 'Manager' : 'Managers'}
                      </p>
                    </div>

                    {item.myFranchise && (
                      <span className="px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold truncate max-w-[130px]">
                        {item.myFranchise}
                      </span>
                    )}
                  </div>

                  {/* Summary Metric Strip */}
                  <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-center">
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Remaining</p>
                      <p className="text-sm font-black text-emerald-400 mt-0.5">
                        {formatPrice(item.myFinalPurseLakhs)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Squad</p>
                      <p className="text-sm font-black text-white mt-0.5">
                        {item.mySquadCount} Players
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Spent</p>
                      <p className="text-sm font-black text-cyan-400 mt-0.5">
                        {formatPrice(item.totalSpentLakhs)}
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={() => openDetailModal(item.id)}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-md shadow-cyan-500/10 transition-all text-center"
                    >
                      View Squad & Ledger
                    </button>
                    <Link
                      href={`/room/${item.roomCode}/results`}
                      className="py-2.5 px-4 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white font-bold text-xs uppercase tracking-wider border border-slate-700 transition-all text-center"
                    >
                      Results Summary
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ─── Detail Modal ──────────────────────────────────────────────── */}
      {selectedAuctionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-4xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 shrink-0">
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-3">
                  <span>AUCTION #{detailData?.roomCode || 'LEDGER'}</span>
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    {detailData?.status || 'Archived'}
                  </span>
                </h3>
                <p className="text-slate-400 text-xs mt-1">
                  Host: <span className="text-slate-200">{detailData?.hostUsername}</span> · Completed: {detailData && formatDate(detailData.completedAt)}
                </p>
              </div>
              <button
                onClick={closeDetailModal}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-sm font-bold transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {isLoadingDetail ? (
                <div className="py-6 text-center">
                  <LoadingSpinner message="Loading full squad breakdown..." fullScreen={false} />
                </div>
              ) : !detailData ? (
                <div className="py-12 text-center text-slate-400">Failed to load auction data.</div>
              ) : (
                <>
                  {/* Top Buys Banner */}
                  {detailData.topBuys?.length > 0 && (
                    <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-3">
                      <p className="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
                        <span>🏆</span> Top Marquee Acquisitions
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {detailData.topBuys.map((buy, idx) => (
                          <div key={idx} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-center">
                            <p className="text-xs font-bold text-white truncate">{buy.playerName}</p>
                            <p className="text-xs font-black text-amber-400 mt-0.5">{formatPrice(buy.pricePaidLakhs)}</p>
                            <p className="text-[10px] text-slate-400 truncate mt-0.5">{buy.franchise}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Team Selector Tabs */}
                  {detailData.teams?.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800 scrollbar-thin">
                        {detailData.teams.map((t) => (
                          <button
                            key={t.franchise}
                            onClick={() => setSelectedTeamTab(t.franchise)}
                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all ${
                              selectedTeamTab === t.franchise
                                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                                : 'bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            {t.franchise} ({t.squadCount})
                          </button>
                        ))}
                      </div>

                      {/* Selected Team Roster */}
                      {(() => {
                        const team = detailData.teams.find((t) => t.franchise === selectedTeamTab);
                        if (!team) return null;

                        return (
                          <div className="mt-4 space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-4 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                              <div>
                                <span className="text-xs text-slate-400">Manager: </span>
                                <span className="text-xs font-bold text-white">{team.managerUsername}</span>
                              </div>
                              <div className="flex items-center gap-4 text-xs">
                                <div>
                                  <span className="text-slate-400">Spent: </span>
                                  <span className="font-bold text-cyan-400">{formatPrice(team.totalSpentLakhs)}</span>
                                </div>
                                <div>
                                  <span className="text-slate-400">Purse Left: </span>
                                  <span className="font-bold text-emerald-400">{formatPrice(team.walletRemainingLakhs)}</span>
                                </div>
                              </div>
                            </div>

                            {team.squad.length === 0 ? (
                              <p className="text-center py-6 text-slate-400 text-xs">No players acquired by this franchise.</p>
                            ) : (
                              <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950/40">
                                <table className="w-full text-left text-xs">
                                  <thead className="bg-slate-900/80 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-800">
                                    <tr>
                                      <th className="py-3 px-4">Player</th>
                                      <th className="py-3 px-3">Role</th>
                                      <th className="py-3 px-3">Category</th>
                                      <th className="py-3 px-3">Base Price</th>
                                      <th className="py-3 px-4 text-right">Sold For</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-800/60">
                                    {team.squad.map((p) => (
                                      <tr key={p.playerId} className="hover:bg-slate-800/30 transition-colors">
                                        <td className="py-3 px-4 font-bold text-white flex items-center gap-2">
                                          {p.isMarquee && <span className="text-amber-400" title="Marquee">⭐</span>}
                                          <span>{p.playerName}</span>
                                        </td>
                                        <td className="py-3 px-3 uppercase text-[11px] font-bold text-slate-300">
                                          {p.role}
                                        </td>
                                        <td className="py-3 px-3 text-slate-400 text-[11px]">
                                          {p.category}
                                        </td>
                                        <td className="py-3 px-3 text-slate-400 font-mono">
                                          {formatPrice(p.basePriceLakhs)}
                                        </td>
                                        <td className="py-3 px-4 text-right font-black text-amber-400 font-mono">
                                          {formatPrice(p.pricePaidLakhs)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-end shrink-0">
              <button
                onClick={closeDetailModal}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
