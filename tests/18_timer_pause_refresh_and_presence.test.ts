import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import request from 'supertest';
import { sign } from 'jsonwebtoken';
import app from '../apps/backend/src/app';
import { createRoom, updateRoomStatus } from '../apps/backend/src/db/queries/rooms';
import { getTimerService } from '../apps/backend/src/services/timerService';
import { redis } from '../apps/backend/src/redis/client';
import { REDIS_KEYS } from '../apps/backend/src/redis/keys';

const mockIo = {
  to: (_channel: string) => ({
    to: (_secondChannel: string) => ({
      emit: (_event: string, _payload: any) => {},
    }),
    emit: (_event: string, _payload: any) => {},
  }),
} as any;

describe('Timer Pause Refresh Stability & Presence Alerts Tests', () => {
  let client: Client;
  let userId: string;
  let authToken: string;
  let testRoomId: string;
  let testRoomCode: string;
  const testEmail = `timer_test_${Date.now()}@test.com`;

  beforeAll(async () => {
    const dbUrl = process.env.DATABASE_URL;
    client = new Client({
      connectionString: dbUrl,
      ssl:
        dbUrl?.includes('supabase.co') || dbUrl?.includes('pooler.supabase.com')
          ? { rejectUnauthorized: false }
          : undefined,
    });
    await client.connect();

    const u = await client.query(
      `INSERT INTO users (email, username, password_hash) VALUES ($1, 'TimerTester', 'hash') RETURNING id`,
      [testEmail]
    );
    userId = u.rows[0].id;

    authToken = sign(
      { sub: userId, email: testEmail, username: 'TimerTester' },
      process.env.JWT_SECRET!
    );

    const room = await createRoom(userId);
    testRoomId = room.id;
    testRoomCode = room.invite_code;
  }, 30000);

  afterAll(async () => {
    if (client) {
      await client.query(`DELETE FROM bid_events WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [testEmail]);
      await client.query(`DELETE FROM rooms WHERE host_user_id IN (SELECT id FROM users WHERE email = $1)`, [testEmail]);
      await client.query(`DELETE FROM users WHERE email = $1`, [testEmail]);
      await client.end();
    }
  }, 30000);

  it('should maintain exact paused seconds across time/refresh without decaying', async () => {
    const timerService = getTimerService(mockIo);

    // 1. Start a 30s timer
    await timerService.startTimer(testRoomId, 30, async () => {});

    // 2. Pause timer
    const pausedSeconds = await timerService.pauseTimer(testRoomId);
    expect(pausedSeconds).toBeGreaterThanOrEqual(28);

    // Verify Redis paused key exists and decaying deadline key was removed
    const pausedKeyVal = await redis.get(`${REDIS_KEYS.timerDeadline(testRoomId)}:paused`);
    expect(pausedKeyVal).toBe(pausedSeconds.toString());

    const activeDeadline = await redis.get(REDIS_KEYS.timerDeadline(testRoomId));
    expect(activeDeadline).toBeNull();

    // 3. Simulate wall-clock time passing (e.g. 1.5 seconds)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // 4. Simulate client refresh requesting remaining seconds
    const remainingOnRefresh = await timerService.getRemainingSeconds(testRoomId);

    // The remaining seconds MUST NOT have decayed!
    expect(remainingOnRefresh).toBe(pausedSeconds);

    // 5. Resume timer
    await timerService.resumeTimer(testRoomId, async () => {});

    // Paused key should be cleared
    const pausedAfterResume = await redis.get(`${REDIS_KEYS.timerDeadline(testRoomId)}:paused`);
    expect(pausedAfterResume).toBeNull();

    // Active deadline should be recreated
    const newDeadline = await redis.get(REDIS_KEYS.timerDeadline(testRoomId));
    expect(newDeadline).not.toBeNull();

    timerService.clearTimer(testRoomId);
    await redis.del(REDIS_KEYS.timerDeadline(testRoomId));
  });

  it('should return readyMap in GET /rooms/:code for zero-latency lobby loading', async () => {
    // Set user ready in Redis
    const readyKey = `room:${testRoomCode}:ready`;
    await redis.hset(readyKey, userId, '1');

    const res = await request(app)
      .get(`/api/rooms/${testRoomCode}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.readyMap).toBeDefined();
    expect(res.body.readyMap[userId]).toBe('1');

    await redis.del(readyKey);
  });
});
