import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { Client } from 'pg';
import { redis } from '../apps/backend/src/redis/client';
import { REDIS_KEYS } from '../apps/backend/src/redis/keys';
import {
  SOCKET_EVENTS,
  type Player,
  type FranchiseName,
} from '../packages/shared/src';
import {
  getTimerService,
  resetTimerServiceInstance,
} from '../apps/backend/src/services/timerService';
import {
  removeAuctionEngine,
} from '../apps/backend/src/services/auctionEngine';
import { createRoom } from '../apps/backend/src/db/queries/rooms';
import { registerAuctionHandlers } from '../apps/backend/src/socket/handlers/auctionHandler';
import type { AuthenticatedSocket } from '../apps/backend/src/socket/middleware/socketAuth';

describe('Phase 8: Host In-Auction Administration Controls', () => {
  let client: Client;
  let hostUserId: string;
  let nonHostUserId: string;
  let testRoomId: string;
  let testRoomCode: string;
  let testPlayer: Player;
  let testPlayer2: Player;

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

    // Query 2 actual players from DB for FK safety
    const playerRes = await client.query('SELECT * FROM players LIMIT 2');
    if (playerRes.rows.length >= 2) {
      const p1 = playerRes.rows[0];
      const p2 = playerRes.rows[1];
      testPlayer = {
        id: p1.id,
        name: p1.name,
        category: p1.category,
        role: p1.role,
        nationality: p1.nationality,
        isMarquee: p1.is_marquee,
        isCapped: p1.is_capped,
        basePriceLakhs: p1.base_price_lakhs,
      };
      testPlayer2 = {
        id: p2.id,
        name: p2.name,
        category: p2.category,
        role: p2.role,
        nationality: p2.nationality,
        isMarquee: p2.is_marquee,
        isCapped: p2.is_capped,
        basePriceLakhs: p2.base_price_lakhs,
      };
    } else {
      testPlayer = {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Rohit Sharma',
        category: 'Marquee Batter',
        role: 'batter',
        nationality: 'indian',
        isMarquee: true,
        isCapped: true,
        basePriceLakhs: 200,
      };
      testPlayer2 = {
        id: '00000000-0000-0000-0000-000000000002',
        name: 'Virat Kohli',
        category: 'Marquee Batter',
        role: 'batter',
        nationality: 'indian',
        isMarquee: true,
        isCapped: true,
        basePriceLakhs: 200,
      };
    }

    // Create host user
    const hostRes = await client.query(`
      INSERT INTO users (id, email, username, password_hash, created_at)
      VALUES (gen_random_uuid(), 'host_control_user@example.com', 'host_master', '$2a$12$dummyhash', NOW())
      ON CONFLICT (email) DO UPDATE SET username = 'host_master'
      RETURNING id
    `);
    hostUserId = hostRes.rows[0].id;

    // Create non-host user
    const nonHostRes = await client.query(`
      INSERT INTO users (id, email, username, password_hash, created_at)
      VALUES (gen_random_uuid(), 'non_host_user@example.com', 'guest_bidder', '$2a$12$dummyhash', NOW())
      ON CONFLICT (email) DO UPDATE SET username = 'guest_bidder'
      RETURNING id
    `);
    nonHostUserId = nonHostRes.rows[0].id;

    // Create room with host
    const room = await createRoom(hostUserId);
    testRoomId = room.id;
    testRoomCode = room.invite_code;

    // Claim host franchise
    await client.query(
      `UPDATE room_members SET franchise = 'Mumbai Indians' WHERE room_id = $1 AND user_id = $2`,
      [testRoomId, hostUserId]
    );
  }, 30000);

  afterAll(async () => {
    resetTimerServiceInstance();
    if (testRoomId) {
      removeAuctionEngine(testRoomId);
      await client.query('DELETE FROM bid_events WHERE room_id = $1', [testRoomId]);
      await client.query('DELETE FROM squad_players WHERE room_member_id IN (SELECT id FROM room_members WHERE room_id = $1)', [testRoomId]);
      await client.query('DELETE FROM auction_queue WHERE room_id = $1', [testRoomId]);
      await client.query('DELETE FROM room_members WHERE room_id = $1', [testRoomId]);
      await client.query('DELETE FROM rooms WHERE id = $1', [testRoomId]);
    }
    if (hostUserId) {
      await client.query('DELETE FROM users WHERE id = $1', [hostUserId]);
    }
    if (nonHostUserId) {
      await client.query('DELETE FROM users WHERE id = $1', [nonHostUserId]);
    }
    await client.end();
  }, 30000);

  beforeEach(async () => {
    resetTimerServiceInstance();
    removeAuctionEngine(testRoomId);

    // Initialize Redis state
    await redis.set(REDIS_KEYS.currentPlayer(testRoomId), JSON.stringify(testPlayer));
    await redis.set(REDIS_KEYS.auctionState(testRoomId), 'player_up');
    await redis.set(REDIS_KEYS.currentBid(testRoomId), '200');
    await redis.set(REDIS_KEYS.currentBidder(testRoomId), 'Mumbai Indians');

    // Create 2 queue entries
    await client.query(`DELETE FROM auction_queue WHERE room_id = $1`, [testRoomId]);
    await client.query(
      `INSERT INTO auction_queue (id, room_id, player_id, position, phase, status)
       VALUES 
        (gen_random_uuid(), $1, $2, 1, 'marquee', 'active'),
        (gen_random_uuid(), $1, $3, 2, 'marquee', 'pending')`,
      [testRoomId, testPlayer.id, testPlayer2.id]
    );

    const queueEntries = [
      {
        player: testPlayer,
        phase: 'marquee' as const,
        position: 1,
      },
      {
        player: testPlayer2,
        phase: 'marquee' as const,
        position: 2,
      },
    ];
    await redis.set(REDIS_KEYS.auctionQueue(testRoomId), JSON.stringify(queueEntries));
  });

  afterEach(async () => {
    resetTimerServiceInstance();
    removeAuctionEngine(testRoomId);
    await redis.del(REDIS_KEYS.currentPlayer(testRoomId));
    await redis.del(REDIS_KEYS.currentBid(testRoomId));
    await redis.del(REDIS_KEYS.currentBidder(testRoomId));
    await redis.del(REDIS_KEYS.auctionState(testRoomId));
    await redis.del(REDIS_KEYS.auctionQueue(testRoomId));
    await redis.del(REDIS_KEYS.timerDeadline(testRoomId));
    await redis.del(`${REDIS_KEYS.timerDeadline(testRoomId)}:paused`);
  });

  it('Security: should reject host actions from non-host participants', async () => {
    const emittedEvents: Array<{ channel: string; event: string; payload: any }> = [];
    const mockIo = {
      to: (channel: string) => ({
        emit: (event: string, payload: any) => {
          emittedEvents.push({ channel, event, payload });
        },
      }),
    } as any;

    const nonHostSocket = {
      data: {
        user: { id: nonHostUserId, username: 'guest_bidder', email: 'non_host_user@example.com' },
        roomCode: testRoomCode,
        roomId: testRoomId,
      },
      emit: (event: string, payload: any) => {
        emittedEvents.push({ channel: 'private', event, payload });
      },
      on: vi.fn(),
    } as unknown as AuthenticatedSocket;

    const listeners: Record<string, Function> = {};
    (nonHostSocket.on as any).mockImplementation((event: string, handler: Function) => {
      listeners[event] = handler;
    });

    registerAuctionHandlers(mockIo, nonHostSocket);

    // Non-host attempts pause
    await listeners['host:control']({
      roomCode: testRoomCode,
      action: 'pause',
    });

    const errorEvent = emittedEvents.find((e) => e.event === 'room:error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.payload.message).toContain('Unauthorized');
  }, 20000);

  it('Pause & Resume Controls: should freeze countdown, store paused state in Redis, and resume accurately', async () => {
    const emittedEvents: Array<{ channel: string; event: string; payload: any }> = [];
    const mockIo = {
      to: (channel: string) => ({
        emit: (event: string, payload: any) => {
          emittedEvents.push({ channel, event, payload });
        },
      }),
    } as any;

    const hostSocket = {
      data: {
        user: { id: hostUserId, username: 'host_master', email: 'host_control_user@example.com' },
        roomCode: testRoomCode,
        roomId: testRoomId,
      },
      emit: (event: string, payload: any) => {
        emittedEvents.push({ channel: 'private', event, payload });
      },
      on: vi.fn(),
    } as unknown as AuthenticatedSocket;

    const listeners: Record<string, Function> = {};
    (hostSocket.on as any).mockImplementation((event: string, handler: Function) => {
      listeners[event] = handler;
    });

    registerAuctionHandlers(mockIo, hostSocket);

    // Start 30s timer
    const timerService = getTimerService(mockIo);
    await timerService.startTimer(testRoomId, 30, async () => {});

    // 1. Host triggers pause
    await listeners['host:control']({
      roomCode: testRoomCode,
      action: 'pause',
    });

    // Check Redis state
    const statePaused = await redis.get(REDIS_KEYS.auctionState(testRoomId));
    expect(statePaused).toBe('paused');

    const pausedRemaining = await redis.get(`${REDIS_KEYS.timerDeadline(testRoomId)}:paused`);
    expect(pausedRemaining).toBeDefined();
    expect(parseInt(pausedRemaining!, 10)).toBeGreaterThan(25);

    const pausedEvent = emittedEvents.find((e) => e.event === 'auction:paused');
    expect(pausedEvent).toBeDefined();

    // 2. Host triggers resume
    await listeners['host:control']({
      roomCode: testRoomCode,
      action: 'resume',
    });

    const stateResumed = await redis.get(REDIS_KEYS.auctionState(testRoomId));
    expect(stateResumed).toBe('bidding');

    const pausedKeyDeleted = await redis.get(`${REDIS_KEYS.timerDeadline(testRoomId)}:paused`);
    expect(pausedKeyDeleted).toBeNull();

    const resumedEvent = emittedEvents.find((e) => e.event === 'auction:resumed');
    expect(resumedEvent).toBeDefined();

    timerService.clearTimer(testRoomId);
  }, 20000);

  it('Extend Control: should add +15 seconds buffer to active countdown and broadcast auction:extended', async () => {
    const emittedEvents: Array<{ channel: string; event: string; payload: any }> = [];
    const mockIo = {
      to: (channel: string) => ({
        emit: (event: string, payload: any) => {
          emittedEvents.push({ channel, event, payload });
        },
      }),
    } as any;

    const hostSocket = {
      data: {
        user: { id: hostUserId, username: 'host_master', email: 'host_control_user@example.com' },
        roomCode: testRoomCode,
        roomId: testRoomId,
      },
      emit: (event: string, payload: any) => {
        emittedEvents.push({ channel: 'private', event, payload });
      },
      on: vi.fn(),
    } as unknown as AuthenticatedSocket;

    const listeners: Record<string, Function> = {};
    (hostSocket.on as any).mockImplementation((event: string, handler: Function) => {
      listeners[event] = handler;
    });

    registerAuctionHandlers(mockIo, hostSocket);

    // Start 10s timer
    const timerService = getTimerService(mockIo);
    await timerService.startTimer(testRoomId, 10, async () => {});

    // Host extends by +15s
    await listeners['host:control']({
      roomCode: testRoomCode,
      action: 'extend',
    });

    const extendEvent = emittedEvents.find((e) => e.event === 'auction:extended');
    expect(extendEvent).toBeDefined();
    expect(extendEvent?.payload.secondsLeft).toBeGreaterThanOrEqual(24);

    timerService.clearTimer(testRoomId);
  }, 20000);

  it('Skip Control: should immediately clear timer and resolve current player', async () => {
    const emittedEvents: Array<{ channel: string; event: string; payload: any }> = [];
    const mockIo = {
      to: (channel: string) => ({
        emit: (event: string, payload: any) => {
          emittedEvents.push({ channel, event, payload });
        },
      }),
    } as any;

    const hostSocket = {
      data: {
        user: { id: hostUserId, username: 'host_master', email: 'host_control_user@example.com' },
        roomCode: testRoomCode,
        roomId: testRoomId,
      },
      emit: (event: string, payload: any) => {
        emittedEvents.push({ channel: 'private', event, payload });
      },
      on: vi.fn(),
    } as unknown as AuthenticatedSocket;

    const listeners: Record<string, Function> = {};
    (hostSocket.on as any).mockImplementation((event: string, handler: Function) => {
      listeners[event] = handler;
    });

    registerAuctionHandlers(mockIo, hostSocket);

    // Set current bid to 0 (will trigger unsold on skip)
    await redis.set(REDIS_KEYS.currentBid(testRoomId), '0');
    await redis.del(REDIS_KEYS.currentBidder(testRoomId));

    const timerService = getTimerService(mockIo);
    await timerService.startTimer(testRoomId, 30, async () => {});

    // Host triggers skip
    await listeners['host:control']({
      roomCode: testRoomCode,
      action: 'skip',
    });

    // Check unsold event was emitted
    const unsoldEvent = emittedEvents.find((e) => e.event === SOCKET_EVENTS.PLAYER_UNSOLD);
    expect(unsoldEvent).toBeDefined();
    expect(unsoldEvent?.payload.player.id).toBe(testPlayer.id);

    // Check DB queue status resolved to 'unsold'
    const queueRes = await client.query(
      `SELECT status FROM auction_queue WHERE room_id = $1 AND position = 1`,
      [testRoomId]
    );
    expect(queueRes.rows[0]?.status).toBe('unsold');

    timerService.clearTimer(testRoomId);
  }, 20000);
});
