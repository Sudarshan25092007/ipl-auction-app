'use client';

/**
 * apps/frontend/src/app/(auth)/login/page.tsx
 *
 * MAJOR FUNCTION: Login page — email/password form → POST /auth/login → store JWT → redirect.
 *
 * 'use client' DIRECTIVE:
 *   Without it: Next.js treats this as a React Server Component (runs on server at request time).
 *   Server Components cannot: useState, useEffect, handle DOM events, use browser APIs.
 *   Login forms need ALL of those → must be a client component.
 *
 * FORM STATE MANAGEMENT:
 *   Using React's built-in useState (not React Hook Form — keeping deps minimal for Phase 2).
 *   Phase 5 UI polish will add React Hook Form with Zod validation schemas.
 *
 * POST-LOGIN FLOW:
 *   fetchApi<LoginResponse>('/auth/login') → storeJwt(token) → router.push('/dashboard')
 *   storeJwt writes to BOTH localStorage (for JS) AND a cookie (for middleware).
 */
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchApi, storeJwt, ApiError } from '@/lib/api';

interface LoginResponse {
  token: string;
  user: { id: string; email: string; username: string };
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const data = await fetchApi<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      // Store JWT in localStorage + cookie (dual storage — see api.ts for why)
      storeJwt(data.token);

      // Navigate to protected area
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 shadow-2xl">
      <h2 className="text-xl font-semibold text-white mb-1">Welcome back</h2>
      <p className="text-slate-400 text-sm mb-6">
        Sign in to your account to continue
      </p>

      <form onSubmit={handleSubmit} className="space-y-4" id="login-form">
        {/* Email */}
        <div>
          <label
            htmlFor="login-email"
            className="block text-sm font-medium text-slate-300 mb-1.5"
          >
            Email address
          </label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-4 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition"
          />
        </div>

        {/* Password */}
        <div>
          <label
            htmlFor="login-password"
            className="block text-sm font-medium text-slate-300 mb-1.5"
          >
            Password
          </label>
          <input
            id="login-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-4 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition"
          />
        </div>

        {/* Error message */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm"
          >
            <span className="shrink-0">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Submit */}
        <button
          id="login-submit"
          type="submit"
          disabled={isLoading}
          className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-orange-500 to-yellow-500 text-white font-semibold text-sm hover:from-orange-600 hover:to-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-orange-500/25"
        >
          {isLoading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="relative flex py-5 items-center">
        <div className="flex-grow border-t border-white/10"></div>
        <span className="flex-shrink mx-4 text-slate-500 text-xs font-semibold uppercase">
          Or
        </span>
        <div className="flex-grow border-t border-white/10"></div>
      </div>

      <button
        onClick={() => {
          const apiBaseUrl =
            process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
          window.location.href = `${apiBaseUrl}/auth/google`;
        }}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-white font-semibold text-sm transition-all duration-200"
      >
        <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
          <path
            fill="currentColor"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="currentColor"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="currentColor"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="currentColor"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        Sign in with Google
      </button>

      <p className="text-center text-slate-400 text-sm mt-6">
        Don&apos;t have an account?{' '}
        <Link
          href="/register"
          className="text-orange-400 hover:text-orange-300 font-medium transition"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
