import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { createRoom, addMemberToRoom, claimFranchise, getMembersForRoom, getRoomById } from '../apps/backend/src/db/queries/rooms';
import { TeardownService } from '../apps/backend/src/services/teardownService';
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

describe('Player Exit & Teardown Protocol Integration Tests', () => {
  let client: Client;
  let user1Id: string;
  let user2Id: string;
  let user3Id: string;
  let testRoomId: string;
  let testRoomCode: string;

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

    // Create 3 test users
    const u1 = await client.query(
      `INSERT INTO users (email, username, password_hash) VALUES ('teardown_u1@test.com', 'TeardownU1', 'hash') RETURNING id`
    );
    const u2 = await client.query(
      `INSERT INTO users (email, username, password_hash) VALUES ('teardown_u2@test.com', 'TeardownU2', 'hash') RETURNING id`
    );
    const u3 = await client.query(
      `INSERT INTO users (email, username, password_hash) VALUES ('teardown_u3@test.com', 'TeardownU3', 'hash') RETURNING id`
    );

    user1Id = u1.rows[0].id;
    user2Id = u2.rows[0].id;
    user3Id = u3.rows[0].id;
  }, 30000);

  afterAll(async () => {
    if (client) {
      await client.query(`DELETE FROM bid_events WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'teardown_u%')`);
      await client.query(`DELETE FROM rooms WHERE host_user_id IN (SELECT id FROM users WHERE email LIKE 'teardown_u%')`);
      await client.query(`DELETE FROM users WHERE email LIKE 'teardown_u%'`);
      await client.end();
    }
  }, 30000);

  it('should remove a member from the room and free up their claimed franchise in lobby', async () => {
    const room = await createRoom(user1Id);
    testRoomId = room.id;
    testRoomCode = room.invite_code;

    await addMemberToRoom(testRoomId, user2Id);
    await claimFranchise(testRoomId, user2Id, 'Chennai Super Kings');

    const membersBefore = await getMembersForRoom(testRoomId);
    expect(membersBefore.length).toBe(2);
    expect(membersBefore.find((m) => m.user_id === user2Id)?.franchise).toBe('Chennai Super Kings');

    // Execute teardown for User 2
    const result = await TeardownService.teardownManager(testRoomId, user2Id, mockIo, {
      username: 'TeardownU2',
      reason: 'explicit_leave',
    });

    expect(result.success).toBe(true);
    expect(result.wasRemoved).toBe(true);
    expect(result.remainingMemberCount).toBe(1);

    const membersAfter = await getMembersForRoom(testRoomId);
    expect(membersAfter.length).toBe(1);
    expect(membersAfter.find((m) => m.user_id === user2Id)).toBeUndefined();

    // Another user should now be able to join and claim Chennai Super Kings
    await addMemberToRoom(testRoomId, user3Id);
    const claimed = await claimFranchise(testRoomId, user3Id, 'Chennai Super Kings');
    expect(claimed).toBe(true);
  }, 20000);

  it('should transfer room host to the next member when host leaves in lobby', async () => {
    const room = await createRoom(user1Id); // user1 is host
    await addMemberToRoom(room.id, user2Id); // user2 joined second

    const initialRoom = await getRoomById(room.id);
    expect(initialRoom?.host_user_id).toBe(user1Id);

    // Host user1 leaves
    const result = await TeardownService.teardownManager(room.id, user1Id, mockIo, {
      username: 'TeardownU1',
      reason: 'host_left',
    });

    expect(result.wasHost).toBe(true);
    expect(result.newHostUserId).toBe(user2Id);
    expect(result.remainingMemberCount).toBe(1);

    const updatedRoom = await getRoomById(room.id);
    expect(updatedRoom?.host_user_id).toBe(user2Id);
  }, 20000);

  it('should be idempotent and safe when called multiple times concurrently', async () => {
    const room = await createRoom(user1Id);
    await addMemberToRoom(room.id, user2Id);

    // Call teardown twice in parallel
    const [res1, res2] = await Promise.all([
      TeardownService.teardownManager(room.id, user2Id, mockIo, { username: 'TeardownU2' }),
      TeardownService.teardownManager(room.id, user2Id, mockIo, { username: 'TeardownU2' }),
    ]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);

    const members = await getMembersForRoom(room.id);
    expect(members.length).toBe(1);
    expect(members[0].user_id).toBe(user1Id);
  }, 20000);

  it('should clean up Redis presence on teardown', async () => {
    const room = await createRoom(user1Id);
    await addMemberToRoom(room.id, user2Id);

    // Set online presence
    await redis.hset(REDIS_KEYS.presence(room.invite_code), user2Id, '1');
    const beforePresence = await redis.hget(REDIS_KEYS.presence(room.invite_code), user2Id);
    expect(beforePresence).toBe('1');

    // Teardown
    await TeardownService.teardownManager(room.id, user2Id, mockIo, { username: 'TeardownU2' });

    const afterPresence = await redis.hget(REDIS_KEYS.presence(room.invite_code), user2Id);
    expect(afterPresence).toBeNull();
  }, 20000);
});
