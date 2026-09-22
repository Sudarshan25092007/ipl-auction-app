'use client';

/**
 * apps/frontend/src/app/(auth)/login/page.tsx
 *
 * MAJOR FUNCTION: User Login page with glassmorphism UI.
 * Handles credential submission, JWT persistence, Google OAuth, and navigation.
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

      // Store JWT in localStorage + cookie
      storeJwt(data.token);

      // Navigate to protected dashboard
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

  function handleGoogleLogin() {
    const apiBaseUrl = (
      process.env.NEXT_PUBLIC_BACKEND_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      'http://localhost:3001'
    ).replace(/\/+$/, '');
    window.location.href = `${apiBaseUrl}/auth/google`;
  }

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-8 shadow-2xl shadow-black/50 text-slate-100">
      <div className="mb-6">
        <h2 className="text-2xl font-black text-white tracking-tight">
          Welcome back
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          Sign in to your manager account to enter the arena
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" id="login-form">
        {/* Email */}
        <div>
          <label
            htmlFor="login-email"
            className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5"
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
            className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition text-sm"
          />
        </div>

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="login-password"
              className="block text-xs font-bold uppercase tracking-wider text-slate-300"
            >
              Password
            </label>
          </div>
          <input
            id="login-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition text-sm"
          />
        </div>

        {/* Error Alert */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-semibold animate-fadeIn"
          >
            <span className="shrink-0 text-sm">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Primary Submit Button */}
        <button
          id="login-submit"
          type="submit"
          disabled={isLoading}
          className="w-full py-3.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 mt-2"
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              <span>Signing in…</span>
            </>
          ) : (
            <span>Sign In to Arena ⚡</span>
          )}
        </button>
      </form>

      {/* Subtle Divider */}
      <div className="relative flex py-6 items-center">
        <div className="flex-grow border-t border-slate-800"></div>
        <span className="flex-shrink mx-4 text-slate-500 text-xs font-bold uppercase tracking-wider">
          OR
        </span>
        <div className="flex-grow border-t border-slate-800"></div>
      </div>

      {/* Google OAuth Button */}
      <button
        type="button"
        onClick={handleGoogleLogin}
        className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white font-bold text-sm transition-all shadow-md active:scale-[0.98] cursor-pointer"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        <span>Continue with Google</span>
      </button>

      {/* Footer Link */}
      <p className="text-center text-slate-400 text-sm mt-6">
        New here?{' '}
        <Link
          href="/register"
          className="text-cyan-400 hover:text-cyan-300 font-bold transition-colors ml-1"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
