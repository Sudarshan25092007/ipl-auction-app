import Image from 'next/image';
import Link from 'next/link';
import heroBg from '../../public/images/hero-bg.jpg';

export default function Home() {
  return (
    <div className="relative min-h-screen text-slate-100 flex flex-col justify-between overflow-x-hidden font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* ─── FULLSCREEN BACKGROUND CONTAINER (Vivid & Bright) ──────────────────────── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-slate-950">
        {/* Background Image: 100% opacity, enhanced brightness/contrast */}
        <Image
          src={heroBg}
          alt="Cricket Ball and Auction Gavel"
          fill
          priority
          placeholder="blur"
          className="object-cover object-right md:object-[85%_center] opacity-100 filter brightness-105 contrast-105"
        />

        {/* Minimal Gradient: Only softly shades behind the left-aligned text, leaving the ball & gavel 100% vivid */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-950/40 via-35% to-transparent" />
      </div>

      {/* ─── PAGE CONTENT (Rendered above background at z-10) ───────────────────────── */}
      <div className="relative z-10 flex flex-col min-h-screen justify-between">
        {/* ─── NAVIGATION BAR ───────────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-slate-950/50 backdrop-blur-md">
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

            <nav className="flex items-center gap-3 sm:gap-4">
              <Link
                href="/players"
                className="text-xs font-bold text-slate-200 hover:text-cyan-400 transition-colors px-3 py-2 drop-shadow-sm"
              >
                Player Pool
              </Link>
              <Link
                href="/login"
                className="text-xs font-bold text-slate-200 hover:text-white transition-colors px-3 py-2 drop-shadow-sm"
              >
                Log In
              </Link>
              <Link
                href="/register"
                className="px-4 py-2 text-xs font-black bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-500 hover:to-yellow-600 text-slate-950 rounded-xl transition-all shadow-md shadow-amber-500/20 active:scale-95 cursor-pointer"
              >
                Register
              </Link>
            </nav>
          </div>
        </header>

        {/* ─── MAIN CONTENT ─────────────────────────────────────────────────────────── */}
        <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-12 md:py-20 flex flex-col space-y-24 md:space-y-32">
          {/* HERO SECTION: Left-Aligned */}
          <section className="flex flex-col items-start max-w-3xl space-y-8 pt-4 md:pt-8">
            {/* Live Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest bg-amber-500/15 border border-amber-500/30 text-amber-300 shadow-sm backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>Multiplayer Auction Simulator</span>
            </div>

            {/* Split-Color Headline */}
            <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black text-white tracking-tight leading-[1.05] drop-shadow-lg">
              Build your <br />
              <span className="text-cyan-400 drop-shadow-[0_0_25px_rgba(34,211,238,0.4)]">
                dream squad.
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-slate-200 text-base sm:text-xl leading-relaxed max-w-2xl font-medium drop-shadow-md">
              Experience the adrenaline of a real-time IPL player draft. Claim your
              franchise, manage a ₹120 Crore wallet under strict caps, and outbid
              rival managers in live multiplayer rooms.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto pt-2">
              <Link
                href="/register"
                className="px-8 py-4 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-500 hover:to-yellow-500 text-slate-950 font-black text-base rounded-2xl shadow-xl shadow-amber-500/30 active:scale-95 transition-all text-center cursor-pointer flex items-center justify-center gap-2"
              >
                <span>⚡</span>
                <span>Create free account</span>
              </Link>

              <a
                href="#how-it-works"
                className="px-8 py-4 bg-slate-900/60 hover:bg-slate-800/80 border border-white/20 text-slate-100 hover:text-white font-bold text-base rounded-2xl backdrop-blur-md active:scale-95 transition-all text-center cursor-pointer flex items-center justify-center gap-2 shadow-lg"
              >
                <span>Explore how it works</span>
                <span>↓</span>
              </a>
            </div>

            {/* STATS ROW (4 Stats) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full pt-8 border-t border-white/10">
              <div className="p-4 rounded-2xl bg-slate-950/40 border border-white/10 backdrop-blur-md shadow-xl hover:border-amber-400/40 transition-colors">
                <span className="block text-2xl sm:text-3xl font-black text-white font-mono">
                  250+
                </span>
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  Active Players
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/40 border border-white/10 backdrop-blur-md shadow-xl hover:border-cyan-400/40 transition-colors">
                <span className="block text-2xl sm:text-3xl font-black text-cyan-400 font-mono">
                  10
                </span>
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  IPL Franchises
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/40 border border-white/10 backdrop-blur-md shadow-xl hover:border-amber-400/40 transition-colors">
                <span className="block text-2xl sm:text-3xl font-black text-amber-400 font-mono">
                  ₹120 Cr
                </span>
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  Purse / Team
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/40 border border-white/10 backdrop-blur-md shadow-xl hover:border-emerald-400/40 transition-colors">
                <span className="block text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
                  &lt;50ms
                </span>
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  Real-Time Sync
                </span>
              </div>
            </div>
          </section>

          {/* ─── HOW IT WORKS SECTION (3 Steps Horizontal Timeline) ──────────────────── */}
          <section id="how-it-works" className="space-y-8 scroll-mt-24">
            <div className="space-y-2 max-w-2xl">
              <span className="text-xs font-black uppercase tracking-widest text-cyan-400">
                Process
              </span>
              <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight drop-shadow-md">
                How the Live Auction Works
              </h2>
              <p className="text-slate-300 text-sm sm:text-base font-medium drop-shadow">
                Join or create a custom private room with friends, assign franchises,
                and start the bidding war.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Step 1 */}
              <div className="relative p-6 sm:p-8 rounded-3xl bg-slate-950/50 border border-white/10 backdrop-blur-md space-y-4 hover:border-cyan-400/50 transition-all duration-300 shadow-xl group">
                <div className="flex items-center justify-between">
                  <span className="text-3xl sm:text-4xl">🏛️</span>
                  <span className="text-xs font-black font-mono text-slate-400 group-hover:text-cyan-400 transition-colors uppercase tracking-widest">
                    Step 01
                  </span>
                </div>
                <h3 className="text-xl font-bold text-white group-hover:text-cyan-300 transition-colors">
                  Choose your team
                </h3>
                <p className="text-slate-300 text-sm leading-relaxed">
                  Claim your favorite franchise (CSK, RCB, MI, and more) in the
                  lobby. Each team starts with an identical ₹120 Cr wallet.
                </p>
              </div>

              {/* Step 2 */}
              <div className="relative p-6 sm:p-8 rounded-3xl bg-slate-950/50 border border-white/10 backdrop-blur-md space-y-4 hover:border-cyan-400/50 transition-all duration-300 shadow-xl group">
                <div className="flex items-center justify-between">
                  <span className="text-3xl sm:text-4xl">⏱️</span>
                  <span className="text-xs font-black font-mono text-slate-400 group-hover:text-cyan-400 transition-colors uppercase tracking-widest">
                    Step 02
                  </span>
                </div>
                <h3 className="text-xl font-bold text-white group-hover:text-cyan-300 transition-colors">
                  Bid in real time
                </h3>
                <p className="text-slate-300 text-sm leading-relaxed">
                  Players are brought to the auction hammer with 30-second clocks.
                  Place incremental bids against rivals before the hammer falls.
                </p>
              </div>

              {/* Step 3 */}
              <div className="relative p-6 sm:p-8 rounded-3xl bg-slate-950/50 border border-white/10 backdrop-blur-md space-y-4 hover:border-cyan-400/50 transition-all duration-300 shadow-xl group">
                <div className="flex items-center justify-between">
                  <span className="text-3xl sm:text-4xl">🏆</span>
                  <span className="text-xs font-black font-mono text-slate-400 group-hover:text-cyan-400 transition-colors uppercase tracking-widest">
                    Step 03
                  </span>
                </div>
                <h3 className="text-xl font-bold text-white group-hover:text-cyan-300 transition-colors">
                  Complete your squad
                </h3>
                <p className="text-slate-300 text-sm leading-relaxed">
                  Satisfy minimum squad limits, balance overseas stars and uncapped
                  gems, and inspect rival rosters on the live board.
                </p>
              </div>
            </div>
          </section>

          {/* ─── FEATURES GRID (4 Cards) ────────────────────────────────────────────── */}
          <section className="space-y-8">
            <div className="space-y-2 max-w-2xl">
              <span className="text-xs font-black uppercase tracking-widest text-amber-400">
                Engine Features
              </span>
              <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight drop-shadow-md">
                Engineered for Fairness
              </h2>
              <p className="text-slate-300 text-sm sm:text-base font-medium drop-shadow">
                Built with high-frequency WebSocket streams, distributed locks, and
                strict salary cap verifications.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="p-6 rounded-3xl bg-slate-950/50 border border-white/10 backdrop-blur-md space-y-3 hover:border-amber-400/40 transition-all duration-300 shadow-xl">
                <span className="text-3xl">💰</span>
                <h3 className="text-white font-bold text-base">₹120 Cr Budget Engine</h3>
                <p className="text-slate-300 text-xs leading-relaxed">
                  Real-time purse subtraction and reserve calculation to prevent
                  overspending and ensure mandatory roster fill.
                </p>
              </div>

              <div className="p-6 rounded-3xl bg-slate-950/50 border border-white/10 backdrop-blur-md space-y-3 hover:border-amber-400/40 transition-all duration-300 shadow-xl">
                <span className="text-3xl">📋</span>
                <h3 className="text-white font-bold text-base">Squad Limits & Rules</h3>
                <p className="text-slate-300 text-xs leading-relaxed">
                  Automated enforcement for 18–25 player roster sizes, maximum 8
                  overseas players, and role minimums.
                </p>
              </div>

              <div className="p-6 rounded-3xl bg-slate-950/50 border border-white/10 backdrop-blur-md space-y-3 hover:border-cyan-400/40 transition-all duration-300 shadow-xl">
                <span className="text-3xl">⚡</span>
                <h3 className="text-white font-bold text-base">Sub-Second Live Bidding</h3>
                <p className="text-slate-300 text-xs leading-relaxed">
                  Synchronized WebSocket streaming with atomic distributed locks to
                  eliminate race conditions and latency exploits.
                </p>
              </div>

              <div className="p-6 rounded-3xl bg-slate-950/50 border border-white/10 backdrop-blur-md space-y-3 hover:border-amber-400/40 transition-all duration-300 shadow-xl">
                <span className="text-3xl">👑</span>
                <h3 className="text-white font-bold text-base">Player Database</h3>
                <p className="text-slate-300 text-xs leading-relaxed">
                  250+ categorized players with base prices, marquee tags, roles,
                  and national designations ready for draft.
                </p>
              </div>
            </div>
          </section>

          {/* ─── BOTTOM CTA BANNER ─────────────────────────────────────────────────── */}
          <section className="p-8 sm:p-12 rounded-3xl bg-gradient-to-br from-slate-950/80 via-slate-900/70 to-amber-950/40 border border-amber-500/30 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-6 shadow-2xl">
            <div className="space-y-2 text-center sm:text-left">
              <h3 className="text-2xl sm:text-3xl font-black text-white drop-shadow">
                Ready to take the auction hammer?
              </h3>
              <p className="text-slate-300 text-sm max-w-lg font-medium">
                Create a custom room in seconds and invite your league mates.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="px-8 py-4 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-500 hover:to-yellow-500 text-slate-950 font-black text-sm rounded-2xl shadow-xl shadow-amber-500/25 active:scale-95 transition-all text-center cursor-pointer shrink-0"
            >
              Enter Dashboard Lobby ➡️
            </Link>
          </section>
        </main>

        {/* ─── FOOTER ───────────────────────────────────────────────────────────────── */}
        <footer className="border-t border-white/10 bg-slate-950/60 backdrop-blur-md py-8 text-center text-xs text-slate-400 tracking-wider uppercase shrink-0">
          <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <span>🏏 IPL Mock Auction Arena © {new Date().getFullYear()}</span>
            <span>Designed &amp; Built for Real-time Draft Battles</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
