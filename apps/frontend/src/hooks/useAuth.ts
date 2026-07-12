'use client';

/**
 * apps/frontend/src/hooks/useAuth.ts
 *
 * MAJOR FUNCTION: JWT decode + auth state hook for the entire frontend.
 * Reads JWT from localStorage, decodes payload (NOT verifies), returns typed user.
 *
 * SYSTEM CONCEPT — Decode vs Verify:
 *   VERIFY: Re-compute HMAC-SHA256 signature using the secret. ONLY the server can do this.
 *   DECODE: Base64url-decode the middle section of the JWT to read the payload.
 *           Anyone can decode — the JWT is NOT encrypted, just signed.
 *
 *   The frontend DECODES because:
 *   1. It doesn't have JWT_SECRET (that's a server-side secret)
 *   2. It doesn't need to verify — the server already verified when it issued the token
 *   3. The decoded data (username, email) is used only for UI display
 *
 *   Decoding: atob(token.split('.')[1])
 *   → JSON.parse(...) → JwtPayload shape
 *
 * EXPIRY CHECK:
 *   JwtPayload.exp is Unix seconds. Date.now() is Unix milliseconds.
 *   Comparison: decoded.exp * 1000 < Date.now()  ← multiply exp by 1000 to match units
 *   If expired: clear JWT, return unauthenticated state.
 *   This prevents using a visually "logged in" UI when the token has actually expired.
 *
 * HOOK PATTERN:
 *   useEffect on mount → reads localStorage → sets state once.
 *   No polling — JWT doesn't change while the app is open (7-day expiry).
 *   On logout: clearJwt() + redirect to /login.
 */
import { useState, useEffect } from 'react';
import type { JwtPayload } from '@ipl-auction/shared';
import { clearJwt, getJwt } from '../lib/api';

export interface AuthState {
  user: Pick<JwtPayload, 'sub' | 'email' | 'username'> | null;
  isAuthenticated: boolean;
  isLoading: boolean; // true until localStorage has been read (avoids flash of unauthenticated content)
  logout: () => void;
}

/** Decode JWT payload without verifying signature. Returns null if malformed. */
function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // Base64url → base64 (replace - with +, _ with /) → atob → JSON
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64)) as JwtPayload;
  } catch {
    return null;
  }
}

export function useAuth(): AuthState {
  const [state, setState] = useState<Omit<AuthState, 'logout'>>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    const token = getJwt();

    if (!token) {
      setState({ user: null, isAuthenticated: false, isLoading: false });
      return;
    }

    const decoded = decodeJwtPayload(token);

    // Check expiry: decoded.exp is seconds, Date.now() is ms → convert
    if (!decoded || decoded.exp * 1000 < Date.now()) {
      clearJwt(); // Clean up expired token
      setState({ user: null, isAuthenticated: false, isLoading: false });
      return;
    }

    setState({
      user: {
        sub: decoded.sub,
        email: decoded.email,
        username: decoded.username,
      },
      isAuthenticated: true,
      isLoading: false,
    });
  }, []); // Run once on mount

  const logout = () => {
    clearJwt();
    setState({ user: null, isAuthenticated: false, isLoading: false });
    window.location.href = '/login';
  };

  return { ...state, logout };
}
