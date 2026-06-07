/**
 * apps/frontend/src/middleware.ts
 *
 * MAJOR FUNCTION: Next.js Edge Middleware — protects routes before page renders.
 * Runs at CDN edge (V8 isolates) — ~1ms overhead. Much faster than server-side checks.
 *
 * SYSTEM CONCEPT — Edge Middleware vs Server Components:
 *   Server Components: run on the Node.js server (can do I/O — DB queries, etc.)
 *   Edge Middleware:   run in V8 isolates at CDN level (NO I/O, NO Node.js APIs)
 *
 *   V8 isolates start in ~1ms (vs ~100-500ms cold start for Lambda).
 *   The tradeoff: very limited runtime (no native modules, no file system access).
 *   But for "check if cookie exists → redirect" this is PERFECT.
 *
 * SYSTEM CONCEPT — Why the JWT must be in a cookie (not localStorage) for middleware:
 *   Middleware runs on the server/edge BEFORE the page loads in the browser.
 *   localStorage is browser-only — the server cannot read it.
 *   Cookies are sent by the browser on every request in the HTTP Cookie header.
 *   The server can read the Cookie header → middleware can check for the JWT.
 *
 *   In login/register: storeJwt() writes to BOTH localStorage AND cookie.
 *   Middleware reads: request.cookies.get('ipl_auction_jwt')
 *
 * SECURITY NOTE:
 *   We do NOT verify the JWT signature here (no secret in Edge runtime + it's unnecessary).
 *   The backend verifies the signature on every API/socket call.
 *   Middleware only checks PRESENCE — "is there a token at all?"
 *   If someone manually sets a fake cookie, they'll get past middleware but fail on the backend.
 *   This is acceptable — the middleware is a UX guard, not a security boundary.
 *   The security boundary is the backend.
 *
 * `config.matcher`:
 *   Next.js runs this middleware ONLY on paths matching the pattern.
 *   The negative lookahead `(?!_next/...)` skips internal Next.js assets.
 *   Without this, middleware would run on every static file request (very slow).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const JWT_COOKIE_KEY = 'ipl_auction_jwt';

// Routes that require authentication
const PROTECTED_PREFIXES = ['/dashboard', '/room'];

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Check if this path is protected
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  // Unprotected route — let it through without touching it
  if (!isProtected) {
    return NextResponse.next();
  }

  const token = request.cookies.get(JWT_COOKIE_KEY)?.value;

  if (!token) {
    // No token → redirect to /login, preserving the intended destination
    const loginUrl = new URL('/login', request.url);
    // Add `from` param so the login page can redirect back after successful auth
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Token exists — allow the request through
  // Backend will verify the signature on the actual API call
  return NextResponse.next();
}

// Matcher: run middleware on all routes EXCEPT Next.js internals and static assets
export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static  (static files)
     * - _next/image   (optimized images)
     * - favicon.ico
     * - Public files (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
