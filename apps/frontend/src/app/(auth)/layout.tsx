/**
 * apps/frontend/src/app/(auth)/layout.tsx
 *
 * MAJOR FUNCTION: Layout for the (auth) route group.
 * The parentheses in "(auth)" make this a route GROUP — it creates a namespace
 * without affecting the URL. `/login` not `/(auth)/login`.
 *
 * WHY A SEPARATE LAYOUT:
 *   The main app layout (app/layout.tsx) has: navbar, sidebar, user menu, socket provider.
 *   Auth pages (login, register) should have NONE of that — just centered card UI.
 *   Route groups allow separate layouts without affecting URLs.
 *   An auth page sees this layout, not the root layout's nav/sidebar.
 *   (Actually it composes with the root layout — root layout wraps everything including this.)
 */
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import authBg from '../../../public/images/auth-bg.jpg';

export const metadata: Metadata = {
  title: 'IPL Mock Auction — Authentication',
  description:
    'Sign in or create an account to join the IPL Mock Auction platform.',
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 selection:bg-cyan-500 selection:text-slate-950 overflow-x-hidden font-sans">
      {/* ─── FULLSCREEN BACKGROUND (Fixed, Cinematic Stadium with Central Podium) ── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-slate-950">
        <Image
          src={authBg}
          alt="IPL Auction Stadium"
          fill
          priority
          placeholder="blur"
          className="object-cover object-center opacity-90 filter brightness-105"
        />
        {/* Subtle Dark Overlay to make the Glassmorphism Auth Card pop */}
        <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px]" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/60" />
      </div>

      {/* ─── CENTERED CARD WRAPPER ─────────────────────────────────────────────────── */}
      <div className="relative z-10 w-full max-w-md my-8">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <Link href="/" className="inline-flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform duration-200">
              <span className="text-2xl">🏏</span>
            </div>
            <div className="text-left">
              <span className="font-black text-white text-lg tracking-wider uppercase leading-none block">
                IPL <span className="text-cyan-400">Mock Auction</span>
              </span>
              <span className="text-[10px] text-amber-400 font-bold tracking-widest uppercase mt-0.5 block">
                Live Draft Arena
              </span>
            </div>
          </Link>
        </div>

        {/* Auth Page Content */}
        {children}
      </div>
    </div>
  );
}
