import Image from 'next/image';
import Link from 'next/link';
import heroBg from '../../public/images/hero-bg.jpg';

export default function Home() {
  return (
    <div className="relative min-h-screen text-slate-100 flex flex-col justify-between overflow-x-hidden font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* ─── FULLSCREEN BACKGROUND CONTAINER ──────────────────────── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-slate-950">
        <Image
          src={heroBg}
          alt="Cricket Ball and Auction Gavel"
          fill
          priority
          placeholder="blur"
          className="object-cover object-right md:object-[85%_center] opacity-100 filter brightness-105 contrast-105"
        />
        {/* Subtle Dark Gradient Overlay for Crisp Text Readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-950/40 via-35% to-transparent" />
      </div>

      {/* ─── PAGE CONTENT ─────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col min-h-screen justify-between">
        {/* ─── NAVIGATION BAR WITH TOP DASHBOARD BUTTON ────────────── */}
        <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-slate-950/60 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <span className="text-3xl transition-transform duration-300 group-hover:scale-110">
                🏏
              </span>
              <div className="flex flex-col">
                <span className="font-black text-white text-base tracking-wider uppercase leading-none">
                  IPL <span className="text-cyan-400">Mock Auction</span>
                </span>
                <span className="text-[10px] text-amber-400 font-bold tracking-widest uppercase mt-0.5">
                  Live Draft Arena
                </span>
              </div>
            </Link>

            <nav className="flex items-center gap-2.5 sm:gap-3.5">
              <Link
                href="/players"
                className="hidden sm:inline-block text-xs font-bold text-slate-200 hover:text-cyan-400 transition-colors px-3 py-2"
              >
                Player Pool
              </Link>
              <Link
                href="/login"
                className="text-xs font-bold text-slate-200 hover:text-white transition-colors px-3 py-2"
              >
                Log In
              </Link>
              {/* Prominent Enter Dashboard Button at the very top */}
              <Link
                href="/dashboard"
                id="top-enter-dashboard-btn"
                className="px-4 py-2 text-xs font-black bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 rounded-xl transition-all shadow-md shadow-cyan-500/25 active:scale-95 cursor-pointer uppercase tracking-wider flex items-center gap-1.5"
              >
                <span>⚡</span>
                <span>Enter Dashboard</span>
              </Link>
            </nav>
          </div>
        </header>

        {/* ─── MAIN MINIMAL CONTENT ─────────────────────────────────── */}
        <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-12 md:py-16 flex flex-col space-y-20 md:space-y-24">
          {/* HERO SECTION */}
          <section className="flex flex-col items-start max-w-3xl space-y-6 pt-2 md:pt-4">
            {/* Live Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest bg-amber-500/15 border border-amber-500/30 text-amber-300 shadow-sm backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>Multiplayer Auction Simulator</span>
            </div>

            {/* Split-Color Headline */}
            <h1 className="text-5xl sm:text-7xl font-black text-white tracking-tight leading-[1.05] drop-shadow-lg">
              Build your <br />
              <span className="text-cyan-400 drop-shadow-[0_0_25px_rgba(34,211,238,0.4)]">
                dream squad.
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-slate-200 text-base sm:text-lg leading-relaxed max-w-2xl font-medium drop-shadow-md">
              Experience the adrenaline of a real-time IPL player draft. Claim your
              franchise, manage a ₹120 Crore wallet under strict squad rules, and outbid
              rival managers in live multiplayer rooms.
            </p>

            {/* Top Primary CTAs */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 w-full sm:w-auto pt-2">
              <Link
                href="/dashboard"
                className="px-8 py-4 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-500 hover:to-yellow-500 text-slate-950 font-black text-base rounded-2xl shadow-xl shadow-amber-500/30 active:scale-95 transition-all text-center cursor-pointer flex items-center justify-center gap-2"
              >
                <span>⚡</span>
                <span>Enter Dashboard</span>
                <span>→</span>
              </Link>

              <Link
                href="/players"
                className="px-7 py-4 bg-slate-900/60 hover:bg-slate-800/80 border border-white/20 text-slate-100 hover:text-white font-bold text-base rounded-2xl backdrop-blur-md active:scale-95 transition-all text-center cursor-pointer flex items-center justify-center gap-2 shadow-lg"
              >
                <span>📋</span>
                <span>View Player Pool</span>
              </Link>
            </div>

            {/* STATS ROW (4 Key Stats) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 w-full pt-6 border-t border-white/10">
              <div className="p-4 rounded-2xl bg-slate-950/40 border border-white/10 backdrop-blur-md shadow-xl">
                <span className="block text-2xl sm:text-3xl font-black text-white font-mono">
                  250+
                </span>
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  Active Players
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/40 border border-white/10 backdrop-blur-md shadow-xl">
                <span className="block text-2xl sm:text-3xl font-black text-cyan-400 font-mono">
                  10
                </span>
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  Franchises
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/40 border border-white/10 backdrop-blur-md shadow-xl">
                <span className="block text-2xl sm:text-3xl font-black text-amber-400 font-mono">
                  ₹120 Cr
                </span>
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  Purse / Team
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/40 border border-white/10 backdrop-blur-md shadow-xl">
                <span className="block text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
                  &lt;50ms
                </span>
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  Live Socket Sync
                </span>
              </div>
            </div>
          </section>

          {/* ─── HOW IT WORKS (3 Simple Steps) ────────────────────── */}
          <section className="space-y-6">
            <div className="space-y-1">
              <span className="text-xs font-black uppercase tracking-widest text-cyan-400">
                Simple Workflow
              </span>
              <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight drop-shadow-md">
                How It Works
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="p-6 rounded-2xl bg-slate-950/50 border border-white/10 backdrop-blur-md space-y-3 hover:border-cyan-400/40 transition-all shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-3xl">🏛️</span>
                  <span className="text-xs font-black font-mono text-slate-400 uppercase">Step 01</span>
                </div>
                <h3 className="text-lg font-bold text-white">Create or Join Room</h3>
                <p className="text-slate-300 text-xs leading-relaxed">
                  Host an auction room or enter a 6-character code with up to 10 friends.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-slate-950/50 border border-white/10 backdrop-blur-md space-y-3 hover:border-cyan-400/40 transition-all shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-3xl">⚡</span>
                  <span className="text-xs font-black font-mono text-slate-400 uppercase">Step 02</span>
                </div>
                <h3 className="text-lg font-bold text-white">Bid in Real-Time</h3>
                <p className="text-slate-300 text-xs leading-relaxed">
                  Fast 30-second timers per player with live bids, automatic increments, and hammer warnings.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-slate-950/50 border border-white/10 backdrop-blur-md space-y-3 hover:border-cyan-400/40 transition-all shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-3xl">🏆</span>
                  <span className="text-xs font-black font-mono text-slate-400 uppercase">Step 03</span>
                </div>
                <h3 className="text-lg font-bold text-white">Inspect Completed Squads</h3>
                <p className="text-slate-300 text-xs leading-relaxed">
                  Review final rosters, spend analytics, and overseas player balances across all active teams.
                </p>
              </div>
            </div>
          </section>

          {/* ─── BOTTOM QUICK CTA ──────────────────────────────────── */}
          <section className="p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-slate-950/90 via-slate-900/80 to-amber-950/40 border border-amber-500/30 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
            <div>
              <h3 className="text-xl font-black text-white">Ready to start drafting?</h3>
              <p className="text-slate-300 text-xs mt-0.5">Jump directly into your auction command center.</p>
            </div>
            <Link
              href="/dashboard"
              className="px-6 py-3 bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-500 hover:to-yellow-600 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-amber-500/20 active:scale-95 transition-all text-center cursor-pointer shrink-0"
            >
              Enter Dashboard →
            </Link>
          </section>
        </main>

        {/* ─── FOOTER ───────────────────────────────────────────────── */}
        <footer className="border-t border-white/10 bg-slate-950/60 backdrop-blur-md py-6 text-center text-xs text-slate-400 tracking-wider uppercase shrink-0">
          <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <span>🏏 IPL Mock Auction Arena © {new Date().getFullYear()}</span>
            <span>Real-time Multiplayer Drafts</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
