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

export const metadata: Metadata = {
  title: 'IPL Mock Auction — Sign In',
  description: 'Sign in or create an account to join the IPL Mock Auction platform.',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 mb-4 shadow-lg shadow-orange-500/30">
            <span className="text-3xl">🏏</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">IPL Mock Auction</h1>
          <p className="text-slate-400 text-sm mt-1">Real-time franchise bidding platform</p>
        </div>
        {children}
      </div>
    </div>
  );
}
