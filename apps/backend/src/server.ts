/**
 * apps/backend/src/server.ts
 *
 * MAJOR FUNCTION: The composition root. Wires HTTP server + Express + Socket.IO.
 * The ONLY file that calls httpServer.listen(). The ONLY file with side effects.
 * Never imported by tests — tests import app.ts directly via supertest.
 *
 * SYSTEM CONCEPT — One port, two protocols:
 *   http.createServer(app) creates a Node.js HTTP server with Express as handler.
 *   new Server(httpServer) attaches Socket.IO to the SAME server instance.
 *   When a WebSocket client connects, their HTTP request has header:
 *     `Upgrade: websocket`
 *   Socket.IO intercepts this and upgrades the TCP connection.
 *   REST and WebSocket traffic both flow through PORT — one port, two protocols.
 *   Without this: you'd need two servers on two ports (more complexity, more firewall rules).
 *
 * GRACEFUL SHUTDOWN — process.on('SIGTERM'):
 *   SIGTERM is sent by Railway/Docker when shutting down or redeploying.
 *   httpServer.close() stops accepting new connections but finishes in-flight requests.
 *   Without this: active auction bids could be dropped mid-processing during a deploy.
 *   With this: in-flight requests complete before the process exits.
 */
import http from 'http';
import 'dotenv/config';

import app from './app';
import { initSocketServer } from './socket';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

// Step 1: Create Node.js HTTP server, pass Express as the request handler
const httpServer = http.createServer(app);

// Step 2: Attach Socket.IO to the same HTTP server (same port, WebSocket upgrade)
// initSocketServer applies auth middleware and registers connection handlers
const _io = initSocketServer(httpServer);

// Step 3: Start listening
httpServer.listen(PORT, () => {
  console.info(`🚀 Backend running on   http://localhost:${PORT}`);
  console.info(`🔌 Socket.IO running on ws://localhost:${PORT}`);
  console.info(`❤️  Health check at     http://localhost:${PORT}/health`);
});

// ─── Graceful Shutdown ─────────────────────────────────────────────────────────
// SIGTERM: sent by Railway/Docker on deploy or scale-down
process.on('SIGTERM', () => {
  console.info('[Server] SIGTERM received — shutting down gracefully');
  httpServer.close(() => {
    console.info('[Server] All connections closed. Process exiting.');
    process.exit(0);
  });
});

// SIGINT: Ctrl+C during local development
process.on('SIGINT', () => {
  console.info('[Server] SIGINT received — shutting down gracefully');
  httpServer.close(() => {
    process.exit(0);
  });
});
