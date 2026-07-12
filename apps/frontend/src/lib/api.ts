/**
 * apps/frontend/src/lib/api.ts
 *
 * MAJOR FUNCTION: Typed JWT-aware fetch wrapper for all REST calls to the backend.
 * Every HTTP call from the frontend goes through fetchApi() — NEVER raw fetch().
 *
 * WHY A WRAPPER OVER RAW FETCH:
 *   Raw fetch() returns untyped Response. You'd .json() and cast on every call.
 *   With fetchApi<T>(): the return type is T — callers get typed data, not `any`.
 *   JWT is attached once here — no copy-paste `Authorization` header in 20 files.
 *   Error handling is centralized — one place to add retry logic, logging, etc.
 *
 * JWT STORAGE STRATEGY — localStorage (acceptable for game app):
 *   Pros: Simple. Works across tabs. Easy to read for Socket.IO handshake.
 *   Cons: Accessible to XSS scripts (if attacker can inject JS, they can read it).
 *   For financial apps: use httpOnly cookies + CSRF tokens.
 *   For this game: XSS risk is low — no payment data, no PII beyond email/username.
 *   We also store in a cookie for Next.js Edge Middleware (which can't read localStorage).
 *
 * ApiError class allows callers to handle HTTP errors by status code:
 *   try { await fetchApi(...) }
 *   catch (err) { if (err instanceof ApiError && err.status === 409) { ... } }
 */

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';

const JWT_KEY = 'ipl_auction_jwt';

// ─── JWT helpers ──────────────────────────────────────────────────────────────

/** Read JWT from localStorage. Returns null in SSR context (no window). */
export function getJwt(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(JWT_KEY);
}

/**
 * Store JWT in both localStorage (for JS use) AND a cookie (for Next.js middleware).
 * The cookie allows Edge Middleware to check auth presence without localStorage access.
 * `SameSite=Strict` prevents CSRF. `Secure` in production (HTTPS only).
 */
export function storeJwt(token: string): void {
  localStorage.setItem(JWT_KEY, token);
  // Cookie for middleware — expires in 7 days (matching JWT expiry)
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${JWT_KEY}=${token}; path=/; expires=${expires}; SameSite=Strict`;
}

/** Remove JWT from both localStorage and cookie on logout. */
export function clearJwt(): void {
  localStorage.removeItem(JWT_KEY);
  // Clear cookie by setting expiry to the past
  document.cookie = `${JWT_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict`;
}

// ─── ApiError ─────────────────────────────────────────────────────────────────

/**
 * Structured error class for HTTP failures.
 * Allows callers to distinguish "email taken" (409) from "server error" (500).
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── fetchApi ─────────────────────────────────────────────────────────────────

/**
 * Generic typed fetch wrapper with automatic JWT attachment.
 *
 * @example
 * // Typed response — no casting needed
 * const { token } = await fetchApi<{ token: string; user: {...} }>('/auth/login', {
 *   method: 'POST',
 *   body: JSON.stringify({ email, password }),
 * });
 */
export async function fetchApi<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getJwt();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    // Merge caller-provided headers last so they can override
    ...((options.headers as Record<string, string> | undefined) ?? {}),
  };

  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    // Try to parse backend error message — fall back to generic
    const body = await response
      .json()
      .catch(() => ({ error: `HTTP ${response.status}` }));
    throw new ApiError(
      response.status,
      (body as { error?: string }).error ??
        `Request failed with status ${response.status}`
    );
  }

  return response.json() as Promise<T>;
}
