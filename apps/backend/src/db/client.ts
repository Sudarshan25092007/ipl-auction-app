/**
 * apps/backend/src/db/client.ts
 *
 * MAJOR FUNCTION: The single pg.Pool instance for ALL database queries.
 * Every query file in db/queries/ imports `pool` from here.
 * Creating a new Pool is expensive — this is done ONCE at startup.
 *
 * SYSTEM CONCEPT — Connection Pooling:
 *   pg.Pool maintains N open TCP connections to PostgreSQL (default: 10).
 *   When pool.query() is called:
 *     1. Check out an idle connection
 *     2. Execute the query over that connection
 *     3. Return the connection to the pool
 *
 *   Without pooling: each query creates a new TCP connection (~5-20ms overhead).
 *   Supabase free tier allows 60 max connections — without pooling, 10 concurrent
 *   requests would create 10 new connections, each taking 10-20ms just to open.
 *
 *   SINGLETON PATTERN: One pool import = one set of connections. If each module
 *   called `new Pool()`, you'd have multiple independent pools exhausting
 *   the connection limit.
 *
 *   connectionTimeoutMillis: 2000 = fail fast if pool exhausted.
 *   Without this, queries could hang indefinitely under load.
 */
import { Pool } from 'pg';
import '../config/dotenv';

if (!process.env.DATABASE_URL) {
  throw new Error(
    '[DB] DATABASE_URL is not set. Copy .env.example to .env and fill in the values.'
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,                       // Maximum open connections in the pool
  idleTimeoutMillis: 30_000,     // Close connections idle for 30s (frees resources)
  connectionTimeoutMillis: 2_000, // Throw if no connection available in 2s
});

// Crash immediately on unexpected pool-level errors (e.g., DB server gone).
// The alternative is silently serving 500s until someone notices.
pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
  process.exit(1);
});

console.info('[DB] PostgreSQL pool initialized (max: 10 connections)');
