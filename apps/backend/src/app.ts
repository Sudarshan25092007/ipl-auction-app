/**
 * apps/backend/src/app.ts
 *
 * MAJOR FUNCTION: Express application factory.
 * Registers all middleware and routes. Exports the Express `app` object.
 * Does NOT call listen(). Does NOT create an HTTP server. Zero side effects.
 *
 * DESIGN PATTERN — App/Server separation:
 *   app.ts  = pure request handler factory  → importable in tests via supertest(app)
 *   server.ts = composition root that calls listen() → NEVER imported in tests
 *
 *   This separation is why backend unit tests are fast:
 *     import app from './app'          ← no port, no network binding
 *     supertest(app).post('/auth/login') ← sends a real HTTP request in-process
 *   Tests run in milliseconds, not seconds.
 *
 * CORS CONFIGURATION:
 *   In development: allows localhost:3000 (Next.js dev server)
 *   In production (Phase 6): restrict to FRONTEND_URL env var
 *   credentials: true is required for cookies (used by Next.js middleware in Phase 2.7)
 *
 * ROUTE REGISTRATION ORDER:
 *   1. cors + json parsing (must be first — all routes need these)
 *   2. Feature routes (/auth, /rooms, /players)
 *   3. Health check (operational, not business logic)
 *   4. 404 handler (MUST be last — catches all unmatched routes)
 */
import express, { type Express } from 'express';
import cors from 'cors';
import 'dotenv/config';

import { authRouter } from './routes/auth';
import { roomsRouter } from './routes/rooms';

const app: Express = express();

// ─── Body Parsing Middleware ───────────────────────────────────────────────────
// Must be registered before any route that reads req.body
app.use(express.json({ limit: '10kb' }));          // Cap payload at 10kb — prevents large-body DoS
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Restricts which origins can make cross-origin requests to this API.
// In production: origin should be the Vercel deployment URL (Phase 6).
// credentials: true allows cookies to be sent cross-origin (needed for Next.js middleware).
app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/auth', authRouter);
app.use('/rooms', roomsRouter);  // jwtAuth is applied inside roomsRouter
// Phase 4 will add: app.use('/players', jwtAuth, playersRouter);

// ─── Health Check ─────────────────────────────────────────────────────────────
// Used by Railway's health check probe and load balancers.
// Returns 200 as long as the process is alive — DB connectivity check in Phase 6.
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: '@ipl-auction/backend',
    timestamp: new Date().toISOString(),
  });
});

// ─── 404 Handler — MUST be last ──────────────────────────────────────────────
// Any request that reaches here didn't match a registered route.
// Without this, Express returns an HTML error page — not appropriate for a JSON API.
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

export default app;
