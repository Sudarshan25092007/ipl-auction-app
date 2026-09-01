import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { Client } from 'pg';
import { redis } from '../apps/backend/src/redis/client';
import { REDIS_KEYS } from '../apps/backend/src/redis/keys';
import {
  TimerService,
  resetTimerServiceInstance,
} from '../apps/backend/src/services/timerService';
import { AuctionEngine } from '../apps/backend/src/services/auctionEngine';
import { createRoom } from '../apps/backend/src/db/queries/rooms';
import { SOCKET_EVENTS } from '../packages/shared/src';

describe('Authoritative TimerService & AuctionEngine Initialization Integration Tests', () => {
  let client: Client;
  let testUserId: string;
  let testRoomId: string;

  // Mock Socket.IO server for tracking socket events
  const emittedEvents: Array<{ channel: string; event: string; payload: any }> = [];
  const mockIo = {
    to: (channel: string) => ({
      emit: (event: string, payload: any) => {
        emittedEvents.push({ channel, event, payload });
      },
    }),
  } as any;

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

    // Ensure a test user exists
    const userRes = await client.query(`
      INSERT INTO users (id, email, username, password_hash, created_at)
      VALUES (gen_random_uuid(), 'engine_test_host@example.com', 'engine_host', '$2a$12$dummyhash', NOW())
      ON CONFLICT (email) DO UPDATE SET username = 'engine_host'
      RETURNING id
    `);
    testUserId = userRes.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup created test room and user
    if (testRoomId) {
      await client.query('DELETE FROM auction_queue WHERE room_id = $1', [testRoomId]);
      await client.query('DELETE FROM room_members WHERE room_id = $1', [testRoomId]);
      await client.query('DELETE FROM bid_events WHERE room_id = $1', [testRoomId]);
      await client.query('DELETE FROM rooms WHERE id = $1', [testRoomId]);
    }
    if (testUserId) {
      await client.query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
    resetTimerServiceInstance();
    await client.end();
  });

  beforeEach(async () => {
    emittedEvents.length = 0;
    resetTimerServiceInstance();
  });

  // ─── TimerService Tests ───────────────────────────────────────────────────

  describe('Authoritative TimerService & Redis Crash Recovery', () => {
    const sampleRoomId = 'test-timer-room-123';

    afterEach(async () => {
      resetTimerServiceInstance();
      await redis.del(REDIS_KEYS.timerDeadline(sampleRoomId));
    });

    it('should store absolute deadline in Redis and emit immediate initial tick', async () => {
      const timerService = new TimerService(mockIo);
      const onExpiry = vi.fn().mockResolvedValue(undefined);

      const durationSeconds = 30;
      const startTime = Date.now();
      await timerService.startTimer(sampleRoomId, durationSeconds, onExpiry);

      // 1. Verify absolute deadline stored in Redis
      const storedDeadlineStr = await redis.get(REDIS_KEYS.timerDeadline(sampleRoomId));
      expect(storedDeadlineStr).toBeDefined();
      const storedDeadline = parseInt(storedDeadlineStr!, 10);
      expect(storedDeadline).toBeGreaterThanOrEqual(startTime + durationSeconds * 1000 - 100);
      expect(storedDeadline).toBeLessThanOrEqual(startTime + durationSeconds * 1000 + 1000);

      // 2. Verify immediate tick emitted
      expect(emittedEvents.length).toBeGreaterThanOrEqual(1);
      const firstTick = emittedEvents.find(
        (e) => e.event === SOCKET_EVENTS.TIMER_TICK && e.channel === sampleRoomId
      );
      expect(firstTick).toBeDefined();
      expect(firstTick?.payload).toEqual({
        roomId: sampleRoomId,
        secondsLeft: durationSeconds,
      });

      // 3. Verify isTimerActive is true
      expect(timerService.isTimerActive(sampleRoomId)).toBe(true);

      timerService.clearTimer(sampleRoomId);
      expect(timerService.isTimerActive(sampleRoomId)).toBe(false);
    });

    it('should recover accurate remaining seconds from Redis after simulated server reboot', async () => {
      const timerService1 = new TimerService(mockIo);
      const onExpiry = vi.fn().mockResolvedValue(undefined);

      // Start a 15-second timer
      await timerService1.startTimer(sampleRoomId, 15, onExpiry);

      // Simulate crash: destroy in-memory timer service instance
      timerService1.clearTimer(sampleRoomId);

      // Create a new TimerService instance (simulating server restart)
      const timerService2 = new TimerService(mockIo);

      // Read remaining seconds from Redis
      const remaining = await timerService2.getRemainingSeconds(sampleRoomId);
      expect(remaining).toBeGreaterThanOrEqual(14);
      expect(remaining).toBeLessThanOrEqual(15);
    });

    it('should replace previous timer instance when startTimer is called repeatedly (Duplicate Guard)', async () => {
      const timerService = new TimerService(mockIo);
      const onExpiry1 = vi.fn().mockResolvedValue(undefined);
      const onExpiry2 = vi.fn().mockResolvedValue(undefined);

      // First timer
      await timerService.startTimer(sampleRoomId, 30, onExpiry1);
      expect(timerService.isTimerActive(sampleRoomId)).toBe(true);

      // Second timer immediately replacing the first
      await timerService.startTimer(sampleRoomId, 10, onExpiry2);
      expect(timerService.isTimerActive(sampleRoomId)).toBe(true);

      // Verify Redis deadline reflects the new 10-second timer
      const remaining = await timerService.getRemainingSeconds(sampleRoomId);
      expect(remaining).toBeGreaterThanOrEqual(9);
      expect(remaining).toBeLessThanOrEqual(10);

      timerService.clearTimer(sampleRoomId);
    });
  });

  // ─── AuctionEngine Initialization Tests ───────────────────────────────────

  describe('AuctionEngine.startAuction() Pipeline Flow', () => {
    it('should initialize queue in DB and Redis, advance to player 1, and emit PLAYER_UP event', async () => {
      // 1. Create a fresh test room in PostgreSQL
      const room = await createRoom(testUserId);
      testRoomId = room.id;

      const engine = new AuctionEngine(mockIo, testRoomId);

      // 2. Start Auction
      await engine.startAuction();

      // 3. Verify PostgreSQL auction_queue table was populated (250 players)
      const queueDbRes = await client.query(
        'SELECT COUNT(*) as count FROM auction_queue WHERE room_id = $1',
        [testRoomId]
      );
      expect(parseInt(queueDbRes.rows[0].count, 10)).toBeGreaterThanOrEqual(250);

      // 4. Verify Redis cached queue exists and has 250 items
      const redisQueueStr = await redis.get(REDIS_KEYS.auctionQueue(testRoomId));
      expect(redisQueueStr).toBeDefined();
      const redisQueue = JSON.parse(redisQueueStr!);
      expect(redisQueue.length).toBeGreaterThanOrEqual(250);

      // 5. Verify Redis current player is set to player #1
      const currentPlayerStr = await redis.get(REDIS_KEYS.currentPlayer(testRoomId));
      expect(currentPlayerStr).toBeDefined();
      const currentPlayer = JSON.parse(currentPlayerStr!);
      expect(currentPlayer).toHaveProperty('id');
      expect(currentPlayer).toHaveProperty('name');
      expect(currentPlayer).toHaveProperty('basePriceLakhs');

      // 6. Verify PLAYER_UP socket event was broadcast to the roomId channel
      const playerUpEvent = emittedEvents.find(
        (e) => e.event === SOCKET_EVENTS.PLAYER_UP && e.channel === testRoomId
      );
      expect(playerUpEvent).toBeDefined();
      expect(playerUpEvent?.payload).toMatchObject({
        player: expect.objectContaining({ id: currentPlayer.id, name: currentPlayer.name }),
        queuePosition: 1,
        queueTotal: 250,
        phase: 'marquee',
        timerSeconds: 30,
      });

      // 7. Verify absolute deadline was written to Redis
      const timerDeadline = await redis.get(REDIS_KEYS.timerDeadline(testRoomId));
      expect(timerDeadline).toBeDefined();
      const deadlineNum = parseInt(timerDeadline!, 10);
      expect(deadlineNum).toBeGreaterThan(Date.now());

      // Clean up timer interval
      const timerService = new TimerService(mockIo);
      timerService.clearTimer(testRoomId);
      await redis.del(REDIS_KEYS.timerDeadline(testRoomId));
      await redis.del(REDIS_KEYS.auctionQueue(testRoomId));
      await redis.del(REDIS_KEYS.currentPlayer(testRoomId));
      await redis.del(REDIS_KEYS.auctionState(testRoomId));
      await redis.del(REDIS_KEYS.currentBid(testRoomId));
    });
  });
});
