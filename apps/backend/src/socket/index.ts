/**
 * apps/backend/src/socket/index.ts
 *
 * MAJOR FUNCTION: Socket.IO server factory.
 * Creates the io instance, applies the JWT auth middleware, wires connection handlers.
 * Returns io to server.ts so it can be passed to the AuctionEngine (Phase 4).
 *
 * PATTERN: Factory function (not a module-level singleton).
 *   initSocketServer(httpServer) is called ONCE from server.ts.
 *   io is returned and stored at the composition root.
 *   This avoids circular imports: auctionEngine needs io, io needs auctionEngine.
 *   The composition root (server.ts) holds both and wires them together.
 *
 * SYSTEM CONCEPT — WebSocket upgrade on same HTTP server:
 *   http.createServer(app) creates a Node.js HTTP server.
 *   new Server(httpServer) attaches Socket.IO to that server.
 *   When a client sends an HTTP request with `Upgrade: websocket` header,
 *   Socket.IO intercepts it and upgrades the TCP connection to WebSocket.
 *   Result: ONE port handles both REST (HTTP) and real-time (WebSocket) traffic.
 *
 * SYSTEM CONCEPT — pingTimeout / pingInterval:
 *   Socket.IO sends a ping frame every `pingInterval` ms (25s).
 *   If no pong received within `pingTimeout` ms (5s), the socket is disconnected.
 *   This detects "ghost connections" — phones that switch to airplane mode
 *   without a clean TCP close. Without this, stale connections accumulate.
 */
import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { socketAuthMiddleware, type AuthenticatedSocket } from './middleware/socketAuth';
import { registerRoomHandlers } from './handlers/roomHandler';
import { registerDisconnectHandler } from './handlers/disconnectHandler';
import { registerAuctionHandlers } from './handlers/auctionHandler';

export function initSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
      credentials: true,
    },
    pingTimeout: 5_000,    // Disconnect if no pong in 5s
    pingInterval: 25_000,  // Ping every 25s
  });

  // ─── Global Auth Middleware ─────────────────────────────────────────────────
  // Runs for EVERY connection before any event handler is registered.
  // next(new Error()) → connection rejected, socket never opens.
  io.use(socketAuthMiddleware);

  // ─── Connection Handler ─────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const authedSocket = socket as AuthenticatedSocket;
    const { username, id } = authedSocket.data.user;

    console.info(`[Socket] Connected: ${socket.id} | user: ${username} (${id})`);

    // ── Phase 3: Room lifecycle handlers (join, franchise_select, start_auction)
    registerRoomHandlers(io, authedSocket);

    // ── Phase 3: Disconnect / presence handler
    registerDisconnectHandler(io, authedSocket);

    // ── Phase 4: Auction bid pipeline + state sync
    registerAuctionHandlers(io, authedSocket);

    // Forward auth errors to client (visible in browser devtools)
    socket.on('error', (err) => {
      console.error(`[Socket] Error on ${socket.id}:`, err.message);
    });
  });

  console.info('[Socket] Socket.IO server initialized');
  return io;
}
