/**
 * apps/backend/src/config/cors.ts
 *
 * MAJOR FUNCTION: Authoritative CORS configuration for HTTP Express and Socket.IO.
 *
 * SYSTEM CONCEPT — Cross-Origin Resource Sharing (CORS) in Live Deployments:
 *   When Next.js runs on Vercel (e.g., https://ipl-auction.vercel.app) and Node.js
 *   runs on Render/Railway (e.g., https://ipl-auction-backend.onrender.com), browsers
 *   enforce the Same-Origin Policy (SOP).
 *
 *   Without permissive CORS:
 *   1. All REST calls (fetchApi /auth/login, /rooms) are blocked with a 403/CORS error.
 *   2. Socket.IO WebSocket upgrade handshakes fail during the HTTP polling fallback.
 *
 * ALLOWLIST STRATEGY:
 *   1. process.env.FRONTEND_URL (supports comma-separated list for multi-domains/staging).
 *   2. Regex match for all Vercel preview URLs: /^https:\/\/.*\.vercel\.app$/.
 *   3. http://localhost:3000 & http://127.0.0.1:3000 for local development.
 *   4. Requests with no Origin header (e.g., server-to-server health probes, mobile apps, Postman).
 */

export function getAllowedOrigins(): string[] {
  const envOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map((url) =>
        url.trim().replace(/\/$/, '')
      )
    : [];

  return [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    ...envOrigins,
  ].filter(Boolean);
}

export function isOriginAllowed(origin: string | undefined): boolean {
  // Allow requests with no Origin header (health checks, server-to-server, Postman)
  if (!origin) return true;

  const cleanOrigin = origin.trim().replace(/\/$/, '');
  const allowed = getAllowedOrigins();

  // Exact match from allowed list
  if (allowed.includes(cleanOrigin)) return true;

  // Pattern match for Vercel preview deployments (*.vercel.app)
  if (/^https:\/\/([a-zA-Z0-9_-]+\.)*vercel\.app$/.test(cleanOrigin)) {
    return true;
  }

  return false;
}

/**
 * Express CORS delegate function.
 * Called dynamically on every incoming HTTP request.
 */
export const corsOriginDelegate = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
): void => {
  if (isOriginAllowed(origin)) {
    callback(null, true);
  } else {
    console.warn(`[CORS] Request blocked from unauthorized origin: ${origin}`);
    callback(new Error(`CORS policy does not allow access from ${origin}`));
  }
};
