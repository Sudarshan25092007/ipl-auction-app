/**
 * server.ts — Backend Entry Point
 *
 * MAJOR FUNCTION: The composition root. Wires HTTP server + Express app + Socket.IO.
 * This file KNOWS about all layers but OWNS none of them.
 *
 * WHY ISOLATED:
 *   app.ts is fully testable via `supertest(app)` without binding to a port.
 *   server.ts is the only file that calls httpServer.listen().
 *   In tests, you never import server.ts — only app.ts.
 *
 * Phase 1: This file is a shell — it will be fully implemented in Phase 2+.
 */

// Placeholder — Phase 2 will implement full server initialization
export {};
