'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getPlayers } from '@/lib/api';
import type { Player } from '@ipl-auction/shared';
import playersBg from '../../../public/images/players-bg.jpg';

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [selectedNationality, setSelectedNationality] = useState<string>('all');

  useEffect(() => {
    async function loadPlayers() {
      try {
        const data = await getPlayers();
        setPlayers(data.players);
        setFilteredPlayers(data.players);
      } catch (err: any) {
        setError(err.message || 'Failed to load players.');
      } finally {
        setIsLoading(false);
      }
    }
    loadPlayers();
  }, []);

  useEffect(() => {
    let result = players;

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      );
    }

    if (selectedRole !== 'all') {
      result = result.filter((p) => p.role === selectedRole);
    }

    if (selectedNationality !== 'all') {
      result = result.filter((p) => p.nationality === selectedNationality);
    }

    setFilteredPlayers(result);
  }, [searchQuery, selectedRole, selectedNationality, players]);

  function formatPrice(lakhs: number | undefined | null): string {
    const val = lakhs !== undefined && lakhs !== null && !isNaN(Number(lakhs)) ? Number(lakhs) : 0;
    if (val >= 100) {
      return `₹${(val / 100).toFixed(2)} Cr`;
    }
    return `₹${val} Lakhs`;
  }

  function getRoleBadge(role: Player['role']) {
    switch (role) {
      case 'batter':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
      case 'pacer':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'spinner':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'allrounder':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'wk':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  }

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 selection:bg-cyan-500 selection:text-black">
      {/* Stadium Background Image with Heavy Dark Overlay */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <Image
          src={playersBg}
          alt="IPL Stadium"
          fill
          priority
          placeholder="blur"
          className="object-cover object-center scale-105"
        />
        {/* Heavy Dark Overlay for text legibility */}
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-[2px]" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-slate-950/90" />
      </div>

      <main className="relative z-10 max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
          <div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors uppercase tracking-wider mb-2.5 group"
            >
              <span className="transition-transform group-hover:-translate-x-1">←</span> Back to Dashboard
            </Link>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
              Player Pool <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-200">Catalogue</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1 max-w-xl">
              Browse, filter, and inspect all registered players in the official auction pool.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3.5 py-1.5 bg-slate-900/80 border border-slate-800 rounded-xl text-xs font-semibold text-slate-300 backdrop-blur-md">
              Total: <strong className="text-white ml-1">{players.length}</strong>
            </span>
            <span className="px-3.5 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs font-semibold text-amber-400 backdrop-blur-md">
              Filtered: <strong className="text-amber-300 ml-1">{filteredPlayers.length}</strong>
            </span>
          </div>
        </div>

        {/* Sticky Search & Filter Glassmorphism Container */}
        <div className="sticky top-4 z-20 mb-8 bg-slate-900/70 border border-slate-800/80 backdrop-blur-md rounded-2xl p-5 shadow-2xl shadow-black/40">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search Input */}
            <div>
              <label
                htmlFor="search"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
              >
                Search Player or Category
              </label>
              <div className="relative">
                <input
                  id="search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. Virat Kohli, Batsmen Set 1..."
                  className="w-full px-4 py-2.5 bg-slate-950/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Role Filter */}
            <div>
              <label
                htmlFor="role-filter"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
              >
                Role
              </label>
              <select
                id="role-filter"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-950/50 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition cursor-pointer"
              >
                <option value="all" className="bg-slate-900 text-white">All Roles</option>
                <option value="batter" className="bg-slate-900 text-white">🏏 Batter</option>
                <option value="pacer" className="bg-slate-900 text-white">⚡ Pacer</option>
                <option value="spinner" className="bg-slate-900 text-white">🎯 Spinner</option>
                <option value="allrounder" className="bg-slate-900 text-white">⭐ All-Rounder</option>
                <option value="wk" className="bg-slate-900 text-white">🧤 Wicket-Keeper (WK)</option>
              </select>
            </div>

            {/* Nationality Filter */}
            <div>
              <label
                htmlFor="nationality-filter"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
              >
                Nationality
              </label>
              <select
                id="nationality-filter"
                value={selectedNationality}
                onChange={(e) => setSelectedNationality(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-950/50 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition cursor-pointer"
              >
                <option value="all" className="bg-slate-900 text-white">All Nationalities</option>
                <option value="indian" className="bg-slate-900 text-white">🇮🇳 Indian</option>
                <option value="overseas" className="bg-slate-900 text-white">✈️ Overseas</option>
              </select>
            </div>
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl p-4 text-center my-6 backdrop-blur-md">
            ⚠️ {error}
          </div>
        )}

        {/* Player Cards Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-48 bg-slate-900/60 border border-slate-800/80 rounded-xl backdrop-blur-sm animate-pulse"
              />
            ))}
          </div>
        ) : filteredPlayers.length === 0 ? (
          <div className="text-center py-16 bg-slate-900/60 border border-slate-800 rounded-2xl backdrop-blur-sm">
            <span className="text-4xl">🔍</span>
            <h3 className="text-lg font-bold mt-4 text-white">
              No players found
            </h3>
            <p className="text-slate-400 text-sm mt-1">
              Try adjusting your search terms or clearing your role filters.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPlayers.map((player) => {
              const isMarquee = Boolean(player.isMarquee);
              return (
                <div
                  key={player.id}
                  className={`group relative flex flex-col justify-between rounded-xl p-5 sm:p-6 transition-all duration-300 backdrop-blur-sm overflow-hidden ${
                    isMarquee
                      ? 'bg-slate-900/75 border border-amber-500/40 shadow-[0_0_20px_-5px_rgba(245,158,11,0.2)] hover:border-amber-400/70 hover:bg-slate-800/75'
                      : 'bg-slate-900/60 border border-slate-800 hover:bg-slate-800/60 hover:border-cyan-500/40'
                  }`}
                >
                  {/* Marquee decorative glow */}
                  {isMarquee && (
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-2xl rounded-full -mr-12 -mt-12 pointer-events-none" />
                  )}

                  <div>
                    {/* Card Top Category & Marquee Badge */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="text-[11px] font-semibold tracking-wider uppercase px-2.5 py-0.5 rounded-md bg-slate-950/60 border border-slate-800 text-slate-400 truncate max-w-[70%]">
                        {player.category}
                      </span>
                      {isMarquee && (
                        <span className="text-[10px] font-black tracking-widest uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-[0_0_8px_rgba(245,158,11,0.3)] animate-pulse">
                          ★ MARQUEE
                        </span>
                      )}
                    </div>

                    {/* Player Name */}
                    <h3 className="text-lg font-bold text-white group-hover:text-cyan-400 transition-colors duration-200 truncate">
                      {player.name}
                    </h3>

                    {/* Role / Nationality / Capped Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-3">
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${getRoleBadge(
                          player.role
                        )}`}
                      >
                        {player.role === 'wk' ? 'Wicket Keeper' : player.role.toUpperCase()}
                      </span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-950/40 border border-slate-800 text-slate-400 font-medium">
                        {player.nationality === 'indian' ? '🇮🇳 Indian' : '✈️ Overseas'}
                      </span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-950/40 border border-slate-800 text-slate-400 font-medium">
                        {player.isCapped ? '🎓 Capped' : '🌱 Uncapped'}
                      </span>
                    </div>
                  </div>

                  {/* Base Price Footer */}
                  <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Base Price
                    </span>
                    <span className="text-sm sm:text-base font-extrabold text-amber-400 bg-amber-500/10 px-3 py-1 rounded-lg border border-amber-500/20 font-mono tracking-tight">
                      {formatPrice(player.basePriceLakhs ?? (player as any).base_price_lakhs)}
                    </span>
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
