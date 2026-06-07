'use client';

/**
 * apps/frontend/src/app/(auth)/register/page.tsx
 *
 * MAJOR FUNCTION: Registration page — creates a new account → gets JWT → redirects.
 * Mirrors login page pattern but POSTs to /auth/register with email + username + password.
 *
 * UX DECISIONS:
 *   - Confirm password field: client-side check only (not sent to server — no value in sending it)
 *   - Real-time error clearing on input change (avoids stale error messages confusing users)
 *   - On success: auto-login (register returns a JWT too — no need to redirect to login first)
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

    // Client-side password confirmation — server doesn't receive confirmPassword
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

      // Register returns a JWT too — user is auto-logged in
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

  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 shadow-2xl">
      <h2 className="text-xl font-semibold text-white mb-1">Create your account</h2>
      <p className="text-slate-400 text-sm mb-6">Join the auction in seconds</p>

      <form onSubmit={handleSubmit} className="space-y-4" id="register-form">
        {/* Email */}
        <div>
          <label htmlFor="reg-email" className="block text-sm font-medium text-slate-300 mb-1.5">
            Email address
          </label>
          <input
            id="reg-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null); }}
            placeholder="you@example.com"
            className="w-full px-4 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition"
          />
        </div>

        {/* Username */}
        <div>
          <label htmlFor="reg-username" className="block text-sm font-medium text-slate-300 mb-1.5">
            Username
          </label>
          <input
            id="reg-username"
            type="text"
            required
            minLength={3}
            autoComplete="username"
            value={username}
            onChange={(e) => { setUsername(e.target.value); setError(null); }}
            placeholder="e.g. darshan_mk"
            className="w-full px-4 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition"
          />
          <p className="text-xs text-slate-500 mt-1">Visible to other players in the auction room</p>
        </div>

        {/* Password */}
        <div>
          <label htmlFor="reg-password" className="block text-sm font-medium text-slate-300 mb-1.5">
            Password
          </label>
          <input
            id="reg-password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            placeholder="At least 8 characters"
            className="w-full px-4 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition"
          />
        </div>

        {/* Confirm Password */}
        <div>
          <label htmlFor="reg-confirm-password" className="block text-sm font-medium text-slate-300 mb-1.5">
            Confirm password
          </label>
          <input
            id="reg-confirm-password"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
            placeholder="••••••••"
            className="w-full px-4 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition"
          />
        </div>

        {/* Error */}
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
          id="register-submit"
          type="submit"
          disabled={isLoading}
          className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-orange-500 to-yellow-500 text-white font-semibold text-sm hover:from-orange-600 hover:to-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-orange-500/25"
        >
          {isLoading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="text-center text-slate-400 text-sm mt-6">
        Already have an account?{' '}
        <Link href="/login" className="text-orange-400 hover:text-orange-300 font-medium transition">
          Sign in
        </Link>
      </p>
    </div>
  );
}
