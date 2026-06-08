/**
 * apps/backend/src/redis/client.ts
 *
 * MAJOR FUNCTION: The single ioredis client instance for the entire backend.
 * Phase 3 uses it for presence tracking (who is online in a room).
 * Phase 4 will use it for the distributed lock, auction hot state, and timer deadlines.
 *
 * SYSTEM CONCEPT — Redis as the "hot lane":
 *   PostgreSQL: durable, relational, ~1-5ms per query — the "cold lane" (source of truth)
 *   Redis:      in-memory, key-value, ~0.1-0.5ms per command — the "hot lane" (speed layer)
 *
 *   For data that changes every second (timer ticks, current bid, presence):
 *     Write to Redis immediately → broadcast to all clients → async write to Postgres.
 *   For data that needs to survive a Redis restart (squad history, bid audit):
 *     Write to Postgres synchronously.
 *
 * SINGLETON PATTERN: One redis instance, created once. All services import this.
 *   Multiple `new Redis()` calls would open multiple TCP connections — wasteful.
 *
 * SYSTEM CONCEPT — lazyConnect: true:
 *   Without it: ioredis connects immediately on module load, even during tests.
 *   With it: connection opens on first command. Tests that don't touch Redis don't
 *   need a live Redis server.
 */
import Redis from 'ioredis';
import 'dotenv/config';

if (!process.env.REDIS_URL) {
  console.warn('[Redis] REDIS_URL not set — Redis features (presence, locks, hot state) will fail.');
}

export const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  lazyConnect: true,          // Don't connect until first command
  maxRetriesPerRequest: 3,    // Retry failed commands up to 3 times
  enableReadyCheck: true,     // Wait for Redis to finish loading before accepting commands
  retryStrategy: (times) => {
    // Exponential backoff: 50ms, 100ms, 200ms, 400ms... up to 2s max
    return Math.min(times * 50, 2_000);
  },
});

redis.on('connect', () => console.info('[Redis] Connected'));
redis.on('error', (err) => console.error('[Redis] Error:', err.message));
redis.on('reconnecting', () => console.info('[Redis] Reconnecting...'));
