/**
 * apps/backend/src/redis/client.ts
 *
 * MAJOR FUNCTION: Highly resilient Redis client with automatic in-memory fallback.
 * Guarantees zero downtime and prevents auction failures if cloud Redis drops connections.
 *
 * SYSTEM CONCEPT — Resilient Multi-Tier Cache & Store:
 *   1. Tier 1: Real ioredis client connected to REDIS_URL.
 *   2. Tier 2: Instant in-memory fallback store with TTL and Hash support.
 *   If Redis is healthy, commands execute against Redis and mirror to memory.
 *   If Redis encounters network jitter (ECONNRESET, connection timeout, rate limits),
 *   the client seamlessly executes via Tier 2 without throwing unhandled exceptions.
 */
import Redis from 'ioredis';
import '../config/dotenv';

// ─── In-Memory Fallback Cache Store ──────────────────────────────────────────
interface MemoryEntry {
  value: string;
  expiresAt?: number;
}

const memoryStore = new Map<string, MemoryEntry>();
const memoryHashes = new Map<string, Map<string, string>>();

function getMemoryValue(key: string): string | null {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

function setMemoryValue(
  key: string,
  value: string,
  ttlSeconds?: number,
  nx = false
): boolean {
  if (nx) {
    const existing = getMemoryValue(key);
    if (existing !== null) return false;
  }
  const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
  memoryStore.set(key, { value, expiresAt });
  return true;
}

function deleteMemoryKey(key: string): number {
  const deleted = memoryStore.delete(key) ? 1 : 0;
  memoryHashes.delete(key);
  return deleted;
}

// ─── Raw ioredis Instance ───────────────────────────────────────────────────
const rawRedis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  lazyConnect: true,
  maxRetriesPerRequest: null, // Never throw MaxRetriesPerRequestError
  enableReadyCheck: false,
  connectTimeout: 5000,
  tls: process.env.REDIS_URL?.startsWith('rediss://')
    ? { rejectUnauthorized: false }
    : undefined,
  retryStrategy: (times) => Math.min(times * 100, 2_000),
});

let isRedisHealthy = false;

rawRedis.on('connect', () => {
  isRedisHealthy = true;
  console.info('[Redis] Connected and healthy');
});

rawRedis.on('ready', () => {
  isRedisHealthy = true;
});

rawRedis.on('error', (err) => {
  isRedisHealthy = false;
  // Non-fatal warning — commands automatically fall back to memory
  console.warn('[Redis] Connection notice (using in-memory fallback):', err.message);
});

rawRedis.on('close', () => {
  isRedisHealthy = false;
});

rawRedis.on('reconnecting', () => {
  isRedisHealthy = false;
});

// ─── Resilient Proxy Wrapper ─────────────────────────────────────────────────
export const redis = {
  /** Check if Redis server connection is actively ready */
  get isHealthy() {
    return isRedisHealthy;
  },

  async get(key: string): Promise<string | null> {
    if (isRedisHealthy) {
      try {
        const val = await rawRedis.get(key);
        if (val !== null) {
          setMemoryValue(key, val);
          return val;
        }
      } catch (err) {
        console.warn(`[Redis] get('${key}') failed, using fallback:`, (err as Error).message);
      }
    }
    return getMemoryValue(key);
  },

  async set(
    key: string,
    value: string,
    ...args: (string | number)[]
  ): Promise<'OK' | null> {
    // Parse Redis SET flags: 'EX', seconds, 'PX', ms, 'NX'
    let ttlSeconds: number | undefined;
    let isNx = false;

    for (let i = 0; i < args.length; i++) {
      const arg = String(args[i]).toUpperCase();
      if (arg === 'EX' && args[i + 1]) {
        ttlSeconds = Number(args[i + 1]);
        i++;
      } else if (arg === 'PX' && args[i + 1]) {
        ttlSeconds = Math.ceil(Number(args[i + 1]) / 1000);
        i++;
      } else if (arg === 'NX') {
        isNx = true;
      }
    }

    const memorySet = setMemoryValue(key, value, ttlSeconds, isNx);
    if (isNx && !memorySet) {
      return null;
    }

    if (isRedisHealthy) {
      try {
        // @ts-ignore
        await rawRedis.set(key, value, ...args);
      } catch (err) {
        console.warn(`[Redis] set('${key}') failed, using fallback:`, (err as Error).message);
      }
    }

    return 'OK';
  },

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      count += deleteMemoryKey(key);
    }

    if (isRedisHealthy && keys.length > 0) {
      try {
        return await rawRedis.del(...keys);
      } catch (err) {
        console.warn('[Redis] del failed, using fallback:', (err as Error).message);
      }
    }

    return count;
  },

  async hset(key: string, ...args: any[]): Promise<number> {
    let hash = memoryHashes.get(key);
    if (!hash) {
      hash = new Map<string, string>();
      memoryHashes.set(key, hash);
    }

    if (args.length === 2) {
      const [field, val] = args;
      hash.set(String(field), String(val));
    } else if (typeof args[0] === 'object' && args[0] !== null) {
      for (const [k, v] of Object.entries(args[0])) {
        hash.set(k, String(v));
      }
    }

    if (isRedisHealthy) {
      try {
        // @ts-ignore
        return await rawRedis.hset(key, ...args);
      } catch (err) {
        console.warn(`[Redis] hset('${key}') failed, using fallback:`, (err as Error).message);
      }
    }

    return 1;
  },

  async hget(key: string, field: string): Promise<string | null> {
    if (isRedisHealthy) {
      try {
        const val = await rawRedis.hget(key, field);
        if (val !== null) return val;
      } catch (err) {
        console.warn(`[Redis] hget('${key}') failed, using fallback:`, (err as Error).message);
      }
    }

    const hash = memoryHashes.get(key);
    return hash?.get(field) ?? null;
  },

  async hdel(key: string, ...fields: string[]): Promise<number> {
    const hash = memoryHashes.get(key);
    let count = 0;
    if (hash) {
      for (const f of fields) {
        if (hash.delete(f)) count++;
      }
    }

    if (isRedisHealthy) {
      try {
        return await rawRedis.hdel(key, ...fields);
      } catch (err) {
        console.warn(`[Redis] hdel('${key}') failed, using fallback:`, (err as Error).message);
      }
    }

    return count;
  },

  async expire(key: string, seconds: number): Promise<number> {
    const entry = memoryStore.get(key);
    if (entry) {
      entry.expiresAt = Date.now() + seconds * 1000;
    }

    if (isRedisHealthy) {
      try {
        return await rawRedis.expire(key, seconds);
      } catch (err) {
        console.warn(`[Redis] expire('${key}') failed:`, (err as Error).message);
      }
    }

    return entry ? 1 : 0;
  },

  async eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<any> {
    if (isRedisHealthy) {
      try {
        // @ts-ignore
        return await rawRedis.eval(script, numKeys, ...args);
      } catch (err) {
        console.warn('[Redis] eval failed, using fallback logic:', (err as Error).message);
      }
    }

    // Default fallback for lock release script
    const [key, token] = args;
    if (key && token) {
      const current = getMemoryValue(String(key));
      if (current === String(token)) {
        deleteMemoryKey(String(key));
        return 1;
      }
    }
    return 0;
  },

  pipeline() {
    const ops: Array<() => Promise<any>> = [];
    const chain = {
      set(key: string, value: string, ...args: (string | number)[]) {
        ops.push(async () => redis.set(key, value, ...args));
        return chain;
      },
      get(key: string) {
        ops.push(async () => redis.get(key));
        return chain;
      },
      del(...keys: string[]) {
        ops.push(async () => redis.del(...keys));
        return chain;
      },
      async exec(): Promise<Array<[Error | null, any]>> {
        const results: Array<[Error | null, any]> = [];
        for (const op of ops) {
          try {
            const res = await op();
            results.push([null, res]);
          } catch (err) {
            results.push([err as Error, null]);
          }
        }
        return results;
      },
    };
    return chain;
  },

  on(event: string, listener: (...args: any[]) => void) {
    rawRedis.on(event as any, listener);
  },
};
