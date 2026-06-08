/**
 * apps/backend/src/redis/lock.ts
 *
 * MAJOR FUNCTION: Distributed mutex lock using Redis SETNX + Lua script.
 * Used by auctionHandler to guarantee that only ONE bid per room is processed at a time.
 *
 * SYSTEM CONCEPT — Why a Distributed Lock?
 * Node.js is single-threaded BUT:
 *   1. You will eventually scale to multiple backend instances (2+ Railway containers).
 *   2. Even on ONE instance, async/await yields the event loop between awaits.
 *
 * Consider two bids arriving 1ms apart without a lock:
 *   Bid A: reads currentBid = 500 from Redis
 *   Bid B: reads currentBid = 500 from Redis  ← reads BEFORE A writes
 *   Bid A: validates 600 > 500 ✅ → writes 600
 *   Bid B: validates 600 > 500 ✅ → writes 600 ← BOTH ACCEPTED at same amount!
 *
 * With the lock:
 *   Bid A: acquireLock → SUCCESS → reads 500, validates, writes 600, releases lock
 *   Bid B: acquireLock → FAIL (A holds it) → returns null → bid rejected
 *   Total time: ~2ms. Zero duplicate bids.
 *
 * SYSTEM CONCEPT — Why a Lua Script (not SET + GET separately)?
 *   The lock must be acquired ATOMICALLY. Two operations:
 *     1. SET the key only if it doesn't exist (SETNX)
 *     2. SET the expiry (EXPIRE)
 *
 *   If we do them separately: process crashes between SET and EXPIRE → key exists forever
 *   → DEADLOCK: no bid can ever be processed again in this room.
 *
 *   Redis SETNX with EX in one command solves this:
 *     SET key token NX EX 5
 *     NX = "only if Not eXists"
 *     EX = "set expiry to 5 seconds"
 *     ATOMIC: either BOTH happen or NEITHER happens.
 *
 *   Lua scripts run ATOMICALLY on the Redis server — no interleaving possible.
 *   The RELEASE script uses Lua to check-then-delete: "only delete if the token matches".
 *   This prevents a process from releasing a lock it doesn't own (e.g., after its TTL expired
 *   and another process acquired it).
 *
 * SYSTEM CONCEPT — Lock Token (UUID):
 *   Each `acquireLock` call generates a random UUID token.
 *   The token is stored AS the Redis value.
 *   `releaseLock` only deletes the key if the current value === this token.
 *   Without token: Process A acquires lock (TTL=5s), hangs for 6s, lock auto-expires,
 *   Process B acquires lock, then Process A wakes up and releases lock —
 *   BUT it just released B's lock! With tokens: A's release fails (wrong token), B keeps the lock.
 */
import { randomUUID } from 'crypto';
import { redis } from './client';

/**
 * Acquire a distributed lock.
 * @param key   The Redis key to use as the lock (e.g., REDIS_KEYS.bidLock(roomId))
 * @param ttlMs Maximum time to hold the lock before Redis auto-expires it (deadlock prevention)
 * @returns     A lock token string if acquired, or null if the lock is already held.
 */
export async function acquireLock(key: string, ttlMs: number): Promise<string | null> {
  const token = randomUUID();
  const ttlSeconds = Math.ceil(ttlMs / 1000);

  // SET key token NX EX ttlSeconds
  // NX = only set if key does NOT exist
  // Returns 'OK' on success, null if key already exists (lock held by another process)
  const result = await redis.set(key, token, 'EX', ttlSeconds, 'NX');

  return result === 'OK' ? token : null;
}

/**
 * The Lua script for atomic release.
 *
 * KEYS[1] = the lock key
 * ARGV[1] = the expected token (the one we got when acquiring)
 *
 * If the key's current value matches our token → DELETE the key → return 1
 * If the value doesn't match (expired + re-acquired) → do nothing → return 0
 *
 * The entire script runs as ONE atomic Redis operation.
 * No other command can interleave between the GET and the DEL.
 */
const RELEASE_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  else
    return 0
  end
`;

/**
 * Release a distributed lock.
 * @param key   The same Redis key used in acquireLock
 * @param token The token returned by acquireLock (proves we own the lock)
 * @returns     true if the lock was released, false if it had already expired or was taken by another process
 */
export async function releaseLock(key: string, token: string): Promise<boolean> {
  const result = await redis.eval(RELEASE_SCRIPT, 1, key, token) as number;
  return result === 1;
}
