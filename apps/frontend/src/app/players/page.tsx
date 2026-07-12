'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getPlayers } from '@/lib/api';
import type { Player } from '@ipl-auction/shared';

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

  function formatPrice(lakhs: number): string {
    if (lakhs >= 100) {
      return `₹${(lakhs / 100).toFixed(2)} Cr`;
    }
    return `₹${lakhs} Lakhs`;
  }

  function getRoleColor(role: Player['role']) {
    switch (role) {
      case 'batter':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      case 'pacer':
        return 'bg-red-500/10 text-red-400 border border-red-500/20';
      case 'spinner':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'allrounder':
        return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
      case 'wk':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
          <div>
            <Link
              href="/dashboard"
              className="text-orange-400 hover:text-orange-300 text-sm font-medium transition flex items-center gap-1.5 mb-2"
            >
              ← Back to Dashboard
            </Link>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-orange-400 via-yellow-400 to-orange-500 bg-clip-text text-transparent">
              IPL Player Pool
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Browse and search through all 250+ players registered in the
              auction pool.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs font-semibold text-slate-300">
              Total Players: {players.length}
            </span>
            <span className="px-3 py-1 bg-orange-500/10 border border-orange-500/20 rounded-full text-xs font-semibold text-orange-400">
              Filtered: {filteredPlayers.length}
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8 backdrop-blur-md">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Search Input */}
            <div>
              <label
                htmlFor="search"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2"
              >
                Search Player or Category
              </label>
              <input
                id="search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g. Virat Kohli, Allrounders..."
                className="w-full px-4 py-2 bg-slate-900/60 border border-white/15 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition text-sm"
              />
            </div>

            {/* Role Select */}
            <div>
              <label
                htmlFor="role-filter"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2"
              >
                Role
              </label>
              <select
                id="role-filter"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="w-full px-4 py-2 bg-slate-900/60 border border-white/15 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition text-sm"
              >
                <option value="all">All Roles</option>
                <option value="batter">Batter</option>
                <option value="pacer">Pacer</option>
                <option value="spinner">Spinner</option>
                <option value="allrounder">All-Rounder</option>
                <option value="wk">Wicket-Keeper (WK)</option>
              </select>
            </div>

            {/* Nationality Select */}
            <div>
              <label
                htmlFor="nationality-filter"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2"
              >
                Nationality
              </label>
              <select
                id="nationality-filter"
                value={selectedNationality}
                onChange={(e) => setSelectedNationality(e.target.value)}
                className="w-full px-4 py-2 bg-slate-900/60 border border-white/15 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition text-sm"
              >
                <option value="all">All Nationalities</option>
                <option value="indian">🇮🇳 Indian</option>
                <option value="overseas">✈️ Overseas</option>
              </select>
            </div>
          </div>
        </div>

        {/* Error handling */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-300 rounded-xl p-4 text-center my-6">
            ⚠️ {error}
          </div>
        )}

        {/* Grid/Table content */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="h-44 bg-white/5 border border-white/10 rounded-2xl"
              ></div>
            ))}
          </div>
        ) : filteredPlayers.length === 0 ? (
          <div className="text-center py-16 bg-white/5 border border-white/10 rounded-2xl">
            <span className="text-4xl">🔍</span>
            <h3 className="text-lg font-semibold mt-4 text-slate-300">
              No players found
            </h3>
            <p className="text-slate-500 text-sm mt-1">
              Try adjusting your filters or search terms.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPlayers.map((player) => (
              <div
                key={player.id}
                className={`relative group bg-slate-900/40 border transition-all duration-300 hover:scale-[1.02] hover:border-orange-500/30 rounded-2xl p-6 backdrop-blur-sm flex flex-col justify-between overflow-hidden ${
                  player.isMarquee
                    ? 'border-yellow-500/30 shadow-[0_0_15px_-3px_rgba(234,179,8,0.15)] bg-gradient-to-b from-yellow-500/5 to-slate-900/40'
                    : 'border-white/10'
                }`}
              >
                {/* Marquee glowing effect */}
                {player.isMarquee && (
                  <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-500/10 blur-2xl rounded-full -mr-8 -mt-8 pointer-events-none"></div>
                )}

                <div>
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <span className="text-xs font-semibold tracking-wide uppercase px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400 max-w-[70%] truncate">
                      {player.category}
                    </span>
                    {player.isMarquee && (
                      <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 shadow-[0_0_8px_rgba(234,179,8,0.3)] animate-pulse">
                        🌟 MARQUEE
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-white group-hover:text-orange-400 transition duration-200 truncate">
                    {player.name}
                  </h3>

                  <div className="flex flex-wrap items-center gap-2 mt-4">
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full uppercase font-medium ${getRoleColor(player.role)}`}
                    >
                      {player.role === 'wk' ? 'Wicket Keeper' : player.role}
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300">
                      {player.nationality === 'indian'
                        ? '🇮🇳 Indian'
                        : '✈️ Overseas'}
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300">
                      {player.isCapped ? '🎓 Capped' : '🌱 Uncapped'}
                    </span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Base Price
                  </span>
                  <span className="text-base font-extrabold text-orange-400 bg-orange-500/5 px-3 py-1 rounded-lg border border-orange-500/10">
                    {formatPrice(player.basePriceLakhs)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
