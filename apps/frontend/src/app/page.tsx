import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between overflow-x-hidden font-sans">
      {/* Background Gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[500px] bg-gradient-to-b from-cyan-500/10 via-indigo-500/5 to-transparent blur-3xl pointer-events-none -z-10" />

      {/* Top Navbar */}
      <header className="max-w-7xl mx-auto w-full px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏏</span>
          <span className="font-extrabold text-white text-lg tracking-tight uppercase">
            IPL <span className="text-cyan-400">Mock Auction</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-xs font-bold text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            Log In
          </Link>
          <Link
            href="/register"
            className="px-4 py-2 text-xs font-bold bg-white/10 hover:bg-white/15 border border-white/10 text-white rounded-xl transition-all cursor-pointer"
          >
            Register
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 flex flex-col items-center justify-center text-center py-12 md:py-20 space-y-10">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 animate-pulse">
          ⚡ Real-time WebSocket Draft Engine
        </div>

        {/* Headline */}
        <div className="space-y-4 max-w-3xl">
          <h1 className="text-4xl md:text-7xl font-black tracking-tight text-white leading-tight">
            The Ultimate Live <br />
            <span className="bg-gradient-to-r from-cyan-400 via-teal-400 to-indigo-400 bg-clip-text text-transparent">
              IPL Mock Auction Arena
            </span>
          </h1>
          <p className="text-slate-400 text-sm md:text-lg max-w-xl mx-auto leading-relaxed">
            Experience the adrenaline of a real-time IPL player draft. Claim
            your franchise, manage a ₹120 Crore wallet under strict caps, and
            outbid rival managers.
          </p>
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/dashboard"
            className="px-8 py-4 bg-gradient-to-r from-cyan-400 to-teal-400 font-bold rounded-2xl text-slate-950 hover:shadow-lg hover:shadow-cyan-400/10 cursor-pointer transition-all active:scale-[0.98] text-sm tracking-wide"
          >
            Enter Dashboard Lobby ➡️
          </Link>
          <Link
            href="/register"
            className="px-8 py-4 bg-slate-900 hover:bg-slate-850 border border-white/5 font-bold rounded-2xl text-slate-200 hover:text-white cursor-pointer transition-all active:scale-[0.98] text-sm tracking-wide"
          >
            Create Manager Account
          </Link>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full pt-12 md:pt-16">
          <div className="p-6 bg-slate-900/40 border border-white/5 rounded-3xl text-left space-y-3 hover:border-white/10 transition-all duration-300">
            <span className="text-2xl">⚡</span>
            <h3 className="text-white font-bold text-base">
              Real-time Bidding
            </h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Highly concurrent WebSocket system with a 300ms double-click bid
              lock preventing server exploits.
            </p>
          </div>

          <div className="p-6 bg-slate-900/40 border border-white/5 rounded-3xl text-left space-y-3 hover:border-white/10 transition-all duration-300">
            <span className="text-2xl">📊</span>
            <h3 className="text-white font-bold text-base">
              Salary Cap Engine
            </h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Dynamic verification verifies budgets against player composition
              limits, overseas bounds, and marquee caps.
            </p>
          </div>

          <div className="p-6 bg-slate-900/40 border border-white/5 rounded-3xl text-left space-y-3 hover:border-white/10 transition-all duration-300">
            <span className="text-2xl">👑</span>
            <h3 className="text-white font-bold text-base">
              238 Loaded Players
            </h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Seeded from your custom Excel sheet including elite marquee
              rounds, general drafts, uncapped players, and retired veterans.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-6 text-center text-xs text-slate-600 tracking-wider uppercase shrink-0">
        🏏 IPL Mock Auction Arena © {new Date().getFullYear()} Made by Sudarshan Patil H J
      </footer>
    </div>
  );
}
