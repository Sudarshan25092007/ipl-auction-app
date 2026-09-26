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
import './config/dotenv';

import passport from 'passport';

import { corsOriginDelegate } from './config/cors';
import { authRouter } from './routes/auth';
import { roomsRouter } from './routes/rooms';
import { playersRouter } from './routes/players';
import { historyRouter } from './routes/history';
import { jwtAuth } from './middleware/auth';

const app: Express = express();

// Trust reverse proxy (Render / Railway load balancers) so secure cookies & HTTPS protocols work
app.set('trust proxy', 1);

// ─── Body Parsing Middleware ───────────────────────────────────────────────────
// Must be registered before any route that reads req.body
app.use(express.json({ limit: '10kb' })); // Cap payload at 10kb — prevents large-body DoS
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Restricts which origins can make cross-origin requests to this API.
// Allows configured FRONTEND_URL, all Vercel preview domains (*.vercel.app), and localhost.
// credentials: true allows cookies to be sent cross-origin (needed for Next.js middleware).
app.use(
  cors({
    origin: corsOriginDelegate,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ─── URL Normalization ───────────────────────────────────────────────────────
// Fixes potential double slashes from client base URLs (e.g. //auth/login -> /auth/login)
app.use((req, _res, next) => {
  if (req.url.startsWith('//')) {
    req.url = req.url.replace(/^\/+/, '/');
  }
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use(passport.initialize());

app.use('/auth', authRouter);
app.use('/api/auth', authRouter);

app.use('/rooms', roomsRouter); // jwtAuth is applied inside roomsRouter
app.use('/api/rooms', roomsRouter);

app.use('/players', jwtAuth, playersRouter);
app.use('/api/players', jwtAuth, playersRouter);

app.use('/history', historyRouter);
app.use('/api/history', historyRouter);

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
