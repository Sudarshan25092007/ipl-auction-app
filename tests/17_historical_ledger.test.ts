import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import request from 'supertest';
import { sign } from 'jsonwebtoken';
import app from '../apps/backend/src/app';
import { createRoom, addMemberToRoom, claimFranchise, updateRoomStatus } from '../apps/backend/src/db/queries/rooms';
import { recordPlayerSold } from '../apps/backend/src/db/queries/auction';
import { getHistoricalAuctions, getHistoricalAuctionDetail } from '../apps/backend/src/db/queries/history';

describe('Historical Ledger (/history) Integration Tests', () => {
  let client: Client;
  let userId: string;
  let authToken: string;
  let completedRoomId: string;
  let completedRoomCode: string;
  let testPlayerId: string;

  const testEmail = `history_test_${Date.now()}@test.com`;

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
      `INSERT INTO users (email, username, password_hash) VALUES ($1, 'HistoryUser', 'hash') RETURNING id`,
      [testEmail]
    );
    userId = u.rows[0].id;

    authToken = sign(
      { sub: userId, email: testEmail, username: 'HistoryUser' },
      process.env.JWT_SECRET!
    );

    // Get a player id
    const p = await client.query(`SELECT id FROM players LIMIT 1`);
    testPlayerId = p.rows[0].id;
  }, 30000);

  afterAll(async () => {
    if (client) {
      await client.query(`DELETE FROM bid_events WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [testEmail]);
      await client.query(`DELETE FROM rooms WHERE host_user_id IN (SELECT id FROM users WHERE email = $1)`, [testEmail]);
      await client.query(`DELETE FROM users WHERE email = $1`, [testEmail]);
      await client.end();
    }
  }, 30000);

  it('should query completed auctions and return correct summary', async () => {
    // Create a room and complete it
    const room = await createRoom(userId);
    completedRoomId = room.id;
    completedRoomCode = room.invite_code;

    await claimFranchise(completedRoomId, userId, 'Royal Challengers Bengaluru');

    // Get member id
    const mRes = await client.query<{ id: string }>(
      `SELECT id FROM room_members WHERE room_id = $1 AND user_id = $2`,
      [completedRoomId, userId]
    );
    const memberId = mRes.rows[0].id;

    // Record player sale
    await recordPlayerSold({
      roomId: completedRoomId,
      roomMemberId: memberId,
      playerId: testPlayerId,
      priceLakhs: 850,
      franchise: 'Royal Challengers Bengaluru',
    });

    // Mark completed
    await updateRoomStatus(completedRoomId, 'completed');

    // Query historical auctions
    const history = await getHistoricalAuctions(userId);
    const myAuction = history.find((h) => h.id === completedRoomId);

    expect(myAuction).toBeDefined();
    expect(myAuction?.roomCode).toBe(completedRoomCode);
    expect(myAuction?.status).toBe('completed');
    expect(myAuction?.myFranchise).toBe('Royal Challengers Bengaluru');
    expect(myAuction?.mySquadCount).toBe(1);
    expect(myAuction?.totalSpentLakhs).toBe(850);
  }, 20000);

  it('should retrieve full squad detail and roster breakdown for completed room', async () => {
    const detail = await getHistoricalAuctionDetail(completedRoomId, userId);

    expect(detail).toBeDefined();
    expect(detail?.roomCode).toBe(completedRoomCode);
    expect(detail?.teams.length).toBeGreaterThan(0);

    const rcbTeam = detail?.teams.find((t) => t.franchise === 'Royal Challengers Bengaluru');
    expect(rcbTeam).toBeDefined();
    expect(rcbTeam?.squad.length).toBe(1);
    expect(rcbTeam?.squad[0].pricePaidLakhs).toBe(850);
    expect(rcbTeam?.squad[0].playerId).toBe(testPlayerId);
  }, 20000);

  it('should return 401 on GET /history without auth token', async () => {
    const res = await request(app).get('/history');
    expect(res.status).toBe(401);
  });

  it('should return 200 and history list on GET /history with valid auth token', async () => {
    const res = await request(app)
      .get('/history')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.history)).toBe(true);
  });
});
