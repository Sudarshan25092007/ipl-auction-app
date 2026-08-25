/**
 * apps/backend/src/socket/middleware/socketAuth.ts
 *
 * MAJOR FUNCTION: JWT guard for ALL Socket.IO connections.
 * Runs ONCE per connection handshake — before any event handler fires.
 * Invalid tokens cannot open a socket; they are rejected at the transport layer.
 * Attaches verified user to socket.data.user for the lifetime of the connection.
 *
 * SYSTEM CONCEPT — Socket.IO handshake auth vs HTTP headers:
 *   HTTP requests: auth in `Authorization: Bearer <token>` header (per-request).
 *   WebSockets:    auth ONLY in the initial HTTP Upgrade handshake.
 *                  After upgrade, the connection is raw WebSocket — no more headers.
 *   Socket.IO passes auth in the handshake object:
 *     Client: io(URL, { auth: { token: jwt } })
 *     Server: socket.handshake.auth.token  ← this field
 *
 * SYSTEM CONCEPT — io.use() middleware vs per-event handler:
 *   io.use(fn) runs for EVERY connection before any events are processed.
 *   Calling next(new Error(...)) rejects the entire connection — no socket opens.
 *   This is security at the TRANSPORT level, not the application level.
 *   Comparison:
 *     if (validated inside auctionHandler.ts) → socket is open, attacker CAN emit events
 *     if (validated in io.use()) → socket never opens, attacker CANNOT emit anything
 *
 * SYSTEM CONCEPT — socket.data as session storage:
 *   socket.data persists for the entire socket lifecycle (connect → disconnect).
 *   We store user identity here so every handler can access socket.data.user
 *   without re-running JWT verification on every event.
 */
import type { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import type { JwtPayload } from '@ipl-auction/shared';

// ─── Typed socket.data shape ──────────────────────────────────────────────────
// socket.data is `any` by default — we define its exact shape.
export interface SocketData {
  user: {
    id: string; // = JwtPayload.sub (UUID)
    email: string;
    username: string;
  };
  roomCode: string | null; // Set after room:join event (invite code)
  roomId: string | null; // Set after room:join event (database UUID)
  franchise: string | null; // Set after room:franchise_select event
}

// Extend Socket type for type-safe socket.data access in handlers
export type AuthenticatedSocket = Socket & { data: SocketData };

type NextFn = (err?: Error) => void;

/**
 * Socket.IO io.use() middleware.
 * Register with: io.use(socketAuthMiddleware)
 *
 * On success: attaches decoded user to socket.data, calls next()
 * On failure: calls next(new Error(...)) → Socket.IO auto-disconnects
 */
export function socketAuthMiddleware(socket: Socket, next: NextFn): void {
  // Extract token from handshake auth object
  // Client sends: io(URL, { auth: { token: localStorage.getItem('ipl_auction_jwt') } })
  const token = socket.handshake.auth?.token as string | undefined;

  if (!token) {
    next(
      new Error('Authentication error: No token provided in socket handshake.')
    );
    return;
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    // Verify signature + expiry in one call
    const decoded = jwt.verify(token, secret) as JwtPayload;

    // Attach to socket.data — this persists for the entire socket session.
    // All handlers (roomHandler, auctionHandler) access socket.data.user directly.
    // No re-verification overhead on every event.
    (socket as AuthenticatedSocket).data = {
      user: {
        id: decoded.sub,
        email: decoded.email,
        username: decoded.username,
      },
      roomCode: null,
      roomId: null,
      franchise: null,
    };

    next(); // ✅ Connection admitted
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      next(
        new Error(
          'Authentication error: Token has expired. Please log in again.'
        )
      );
    } else if (err instanceof jwt.JsonWebTokenError) {
      next(new Error('Authentication error: Invalid token.'));
    } else {
      console.error('[SocketAuth] Unexpected error:', err);
      next(new Error('Authentication error: Internal server error.'));
    }
  }
}
