'use client';

/**
 * apps/frontend/src/app/(auth)/register/page.tsx
 *
 * MAJOR FUNCTION: User Registration page with glassmorphism UI.
 * Handles new account creation, client-side validation, JWT storage, and redirect.
 */
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchApi, storeJwt, ApiError } from '@/lib/api';

interface RegisterResponse {
  token: string;
  user: { id: string; email: string; username: string };
}

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // Client-side password confirmation
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    try {
      const data = await fetchApi<RegisterResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, username, password }),
      });

      // Register returns JWT too — auto-logged in
      storeJwt(data.token);
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
          Create manager account
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          Join the live IPL auction arena in seconds
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" id="register-form">
        {/* Email */}
        <div>
          <label
            htmlFor="reg-email"
            className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5"
          >
            Email address
          </label>
          <input
            id="reg-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            placeholder="you@example.com"
            className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition text-sm"
          />
        </div>

        {/* Username */}
        <div>
          <label
            htmlFor="reg-username"
            className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5"
          >
            Manager Username
          </label>
          <input
            id="reg-username"
            type="text"
            required
            minLength={3}
            autoComplete="username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setError(null);
            }}
            placeholder="e.g. Captain_Dhoni"
            className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition text-sm"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Displayed to other managers in the auction room
          </p>
        </div>

        {/* Password */}
        <div>
          <label
            htmlFor="reg-password"
            className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5"
          >
            Password
          </label>
          <input
            id="reg-password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            placeholder="At least 6 characters"
            className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition text-sm"
          />
        </div>

        {/* Confirm Password */}
        <div>
          <label
            htmlFor="reg-confirm-password"
            className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5"
          >
            Confirm password
          </label>
          <input
            id="reg-confirm-password"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setError(null);
            }}
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
          id="register-submit"
          type="submit"
          disabled={isLoading}
          className="w-full py-3.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 mt-2"
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              <span>Creating account…</span>
            </>
          ) : (
            <span>Create Manager Account 🚀</span>
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
        <span>Sign up with Google</span>
      </button>

      {/* Footer Link */}
      <p className="text-center text-slate-400 text-sm mt-6">
        Already have an account?{' '}
        <Link
          href="/login"
          className="text-cyan-400 hover:text-cyan-300 font-bold transition-colors ml-1"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
