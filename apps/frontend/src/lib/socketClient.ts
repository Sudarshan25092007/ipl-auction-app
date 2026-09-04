'use client';

/**
 * apps/frontend/src/lib/socketClient.ts
 *
 * MAJOR FUNCTION: Lazy-initialized Socket.IO client singleton.
 * getSocket() creates the connection ONCE. Every subsequent call returns the same instance.
 *
 * SYSTEM CONCEPT — Singleton pattern for WebSocket:
 *   If each component called io(URL), every React re-render / StrictMode double-mount
 *   would open a new WebSocket connection. With 3 components, that's 3 open sockets.
 *   With React StrictMode (dev mode), that's 6.
 *   The singleton guarantees exactly ONE WebSocket connection per browser session,
 *   regardless of how many times getSocket() is called.
 *
 * SYSTEM CONCEPT — autoConnect: false:
 *   The socket does NOT connect on creation. It connects when you call socket.connect().
 *   Why: at the time getSocket() runs, the user might not have navigated to a room yet.
 *   We connect explicitly when entering a room page (in useSocket hook, Phase 3).
 *   This prevents an idle WebSocket connection on every page, including the dashboard.
 *
 * SYSTEM CONCEPT — JWT in handshake auth:
 *   Socket.IO passes `auth` to the server in the WebSocket upgrade handshake.
 *   On the server: socket.handshake.auth.token → validated by socketAuthMiddleware.
 *   The token is read at creation time (getSocket()) — if the user logs in and then
 *   calls getSocket(), the new token is included. If the token changes (logout + re-login),
 *   destroySocket() must be called to force a fresh socket with the new token.
 *
 * IMPORTANT: NEVER import this file in a Server Component.
 * It imports 'socket.io-client' which uses browser APIs (WebSocket).
 * The 'use client' directive + window guard prevent server-side crashes.
 */
import { io, type Socket } from 'socket.io-client';
import { getJwt } from './api';

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';

// Module-level variable — lives for the entire browser session
let socket: Socket | null = null;

/**
 * Returns the singleton Socket.IO client.
 * Creates it on first call with the current JWT from localStorage.
 * Returns the existing instance on all subsequent calls.
 *
 * @throws Error if called in a Server Component context
 */
export function getSocket(): Socket {
  if (typeof window === 'undefined') {
    throw new Error(
      '[Socket] getSocket() was called in a Server Component. ' +
        'Move this call to a "use client" component.'
    );
  }

  if (!socket) {
    const token = getJwt();

    socket = io(BACKEND_URL, {
      // JWT passed in handshake auth → validated by socketAuthMiddleware on BE
      auth: { token: token ?? '' },
      // Support native WebSocket with HTTP long-polling fallback for edge proxies
      transports: ['websocket', 'polling'],
      // Don't connect until socket.connect() is explicitly called
      autoConnect: false,
      // Reconnection config — Socket.IO handles drops automatically
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1_000, // 1s initial delay
      reconnectionDelayMax: 5_000, // Max 5s between attempts (exponential backoff)
    });

    // Development-only logging — stripped in production build
    if (process.env.NODE_ENV === 'development') {
      socket.on('connect', () =>
        console.info('[Socket] Connected:', socket?.id)
      );
      socket.on('disconnect', (reason) =>
        console.info('[Socket] Disconnected:', reason)
      );
      socket.on('connect_error', (err) =>
        console.error('[Socket] Connection error:', err.message)
      );
    }
  }

  return socket;
}

/**
 * Disconnect and destroy the singleton socket instance.
 * Call this on LOGOUT to ensure the next login creates a fresh socket
 * with the new user's JWT — not the previous user's expired token.
 */
export function destroySocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    if (process.env.NODE_ENV === 'development') {
      console.info(
        '[Socket] Singleton destroyed — will reconnect on next getSocket() call'
      );
    }
  }
}
