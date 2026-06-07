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
      <p className="text-slate-400 text-sm mb-6">Sign in to your account to continue</p>

      <form onSubmit={handleSubmit} className="space-y-4" id="login-form">
        {/* Email */}
        <div>
          <label htmlFor="login-email" className="block text-sm font-medium text-slate-300 mb-1.5">
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
          <label htmlFor="login-password" className="block text-sm font-medium text-slate-300 mb-1.5">
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

      <p className="text-center text-slate-400 text-sm mt-6">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-orange-400 hover:text-orange-300 font-medium transition">
          Create one
        </Link>
      </p>
    </div>
  );
}
