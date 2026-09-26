import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { createRoom, updateRoomStatus, getRoomById } from '../apps/backend/src/db/queries/rooms';
import { HostDeadManService } from '../apps/backend/src/services/hostDeadManService';
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

describe("Host Dead Man's Switch Integration Tests", () => {
  let client: Client;
  let hostUserId: string;
  let participantUserId: string;
  let testRoomId: string;

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

    const h = await client.query(
      `INSERT INTO users (email, username, password_hash) VALUES ('deadman_host@test.com', 'DeadManHost', 'hash') RETURNING id`
    );
    const p = await client.query(
      `INSERT INTO users (email, username, password_hash) VALUES ('deadman_part@test.com', 'DeadManPart', 'hash') RETURNING id`
    );
    hostUserId = h.rows[0].id;
    participantUserId = p.rows[0].id;
  }, 30000);

  afterAll(async () => {
    if (client) {
      await client.query(`DELETE FROM bid_events WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'deadman_%')`);
      await client.query(`DELETE FROM rooms WHERE host_user_id IN (SELECT id FROM users WHERE email LIKE 'deadman_%')`);
      await client.query(`DELETE FROM users WHERE email LIKE 'deadman_%'`);
      await client.end();
    }
  }, 30000);

  it('should freeze timer and set room to waiting_host when host disconnects during active auction', async () => {
    const room = await createRoom(hostUserId);
    testRoomId = room.id;
    await updateRoomStatus(testRoomId, 'active');

    // Start a 30s timer
    const timerService = getTimerService(mockIo);
    await timerService.startTimer(testRoomId, 30, async () => {});

    const remainingBefore = await timerService.getRemainingSeconds(testRoomId);
    expect(remainingBefore).toBeGreaterThan(0);

    // Host disconnects
    await HostDeadManService.handleHostDisconnect(testRoomId, hostUserId, mockIo);

    // Verify room status changed to waiting_host
    const updatedRoom = await getRoomById(testRoomId);
    expect(updatedRoom?.status).toBe('waiting_host');

    // Verify recovery token set in Redis
    const token = await redis.get(REDIS_KEYS.hostDeadmanToken(testRoomId));
    expect(token).toBeDefined();

    // Verify timer is paused
    const pausedStr = await redis.get(`${REDIS_KEYS.timerDeadline(testRoomId)}:paused`);
    expect(pausedStr).toBeDefined();
    expect(parseInt(pausedStr!, 10)).toBeGreaterThan(0);
  }, 20000);

  it('should resume timer and restore active status when host reconnects within recovery window', async () => {
    // Reconnect host
    const reconnected = await HostDeadManService.handleHostReconnect(testRoomId, hostUserId, mockIo);
    expect(reconnected).toBe(true);

    // Verify room status back to active
    const activeRoom = await getRoomById(testRoomId);
    expect(activeRoom?.status).toBe('active');

    // Verify recovery token deleted from Redis
    const token = await redis.get(REDIS_KEYS.hostDeadmanToken(testRoomId));
    expect(token).toBeNull();

    // Verify paused timer cleared
    const pausedStr = await redis.get(`${REDIS_KEYS.timerDeadline(testRoomId)}:paused`);
    expect(pausedStr).toBeNull();
  }, 20000);

  it('should NOT trigger dead man switch if a non-host participant disconnects', async () => {
    const room = await createRoom(hostUserId);
    await updateRoomStatus(room.id, 'active');

    await HostDeadManService.handleHostDisconnect(room.id, participantUserId, mockIo);

    const checkRoom = await getRoomById(room.id);
    expect(checkRoom?.status).toBe('active'); // status remains active
  }, 20000);

  it('should terminate the room when host recovery window times out', async () => {
    const room = await createRoom(hostUserId);
    await updateRoomStatus(room.id, 'active');

    await HostDeadManService.handleHostDisconnect(room.id, hostUserId, mockIo);
    const token = (await redis.get(REDIS_KEYS.hostDeadmanToken(room.id)))!;

    // Trigger timeout with expected token
    await HostDeadManService.handleHostTimeout(room.id, token, mockIo);

    const terminatedRoom = await getRoomById(room.id);
    expect(terminatedRoom?.status).toBe('terminated');
  }, 20000);
});
