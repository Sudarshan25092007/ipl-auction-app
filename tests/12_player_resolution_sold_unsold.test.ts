import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { Client } from 'pg';
import { redis } from '../apps/backend/src/redis/client';
import { REDIS_KEYS } from '../apps/backend/src/redis/keys';
import {
  SOCKET_EVENTS,
  type Player,
  type FranchiseName,
} from '../packages/shared/src';
import { AuctionEngine } from '../apps/backend/src/services/auctionEngine';
import { initAllFranchiseStates, loadFranchiseState } from '../apps/backend/src/services/franchiseStateService';
import { createRoom } from '../apps/backend/src/db/queries/rooms';
import { recordPlayerSold } from '../apps/backend/src/db/queries/auction';

describe('Phase 7: Player Resolution (Sold / Unsold) & Squad Hydration', () => {
  let client: Client;
  let testUserId: string;
  let testRoomId: string;
  let testRoomMemberId: string;
  let testPlayer: Player;

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

    // Query an actual player from DB for foreign key constraint safety
    const playerRes = await client.query('SELECT * FROM players LIMIT 1');
    if (playerRes.rows.length > 0) {
      const p = playerRes.rows[0];
      testPlayer = {
        id: p.id,
        name: p.name,
        category: p.category,
        role: p.role,
        nationality: p.nationality,
        isMarquee: p.is_marquee,
        isCapped: p.is_capped,
        basePriceLakhs: p.base_price_lakhs,
      };
    } else {
      testPlayer = {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'MS Dhoni',
        category: 'Marquee WK',
        role: 'wk',
        nationality: 'indian',
        isMarquee: true,
        isCapped: true,
        basePriceLakhs: 200,
      };
    }

    // Create test user
    const userRes = await client.query(`
      INSERT INTO users (id, email, username, password_hash, created_at)
      VALUES (gen_random_uuid(), 'resolution_test@example.com', 'resolution_tester', '$2a$12$dummyhash', NOW())
      ON CONFLICT (email) DO UPDATE SET username = 'resolution_tester'
      RETURNING id
    `);
    testUserId = userRes.rows[0].id;

    // Create test room
    const room = await createRoom(testUserId);
    testRoomId = room.id;

    // Assign franchise to room member
    const memberRes = await client.query(
      `UPDATE room_members SET franchise = 'Chennai Super Kings', wallet_remaining_lakhs = 12000
       WHERE room_id = $1 AND user_id = $2
       RETURNING id`,
      [testRoomId, testUserId]
    );
    testRoomMemberId = memberRes.rows[0].id;
  });

  afterAll(async () => {
    if (testRoomId) {
      await client.query('DELETE FROM bid_events WHERE room_id = $1', [testRoomId]);
      await client.query('DELETE FROM squad_players WHERE room_member_id IN (SELECT id FROM room_members WHERE room_id = $1)', [testRoomId]);
      await client.query('DELETE FROM auction_queue WHERE room_id = $1', [testRoomId]);
      await client.query('DELETE FROM room_members WHERE room_id = $1', [testRoomId]);
      await client.query('DELETE FROM rooms WHERE id = $1', [testRoomId]);
    }
    if (testUserId) {
      await client.query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
    await client.end();
  });

  beforeEach(async () => {
    emittedEvents.length = 0;
    // Clean up DB state for test room member
    await client.query('DELETE FROM squad_players WHERE room_member_id = $1', [testRoomMemberId]);
    await client.query('DELETE FROM bid_events WHERE room_id = $1', [testRoomId]);
    await client.query(
      `UPDATE room_members SET wallet_remaining_lakhs = 12000 WHERE id = $1`,
      [testRoomMemberId]
    );

    // Set up Redis state
    await initAllFranchiseStates(testRoomId);
    await redis.set(REDIS_KEYS.currentPlayer(testRoomId), JSON.stringify(testPlayer));
    await redis.set(REDIS_KEYS.auctionState(testRoomId), 'player_up');

    // Create dummy queue in DB and Redis
    await client.query(`DELETE FROM auction_queue WHERE room_id = $1`, [testRoomId]);
    await client.query(
      `INSERT INTO auction_queue (id, room_id, player_id, position, phase, status)
       VALUES (gen_random_uuid(), $1, $2, 1, 'marquee', 'active')`,
      [testRoomId, testPlayer.id]
    );

    const queueEntries = [
      {
        player: testPlayer,
        phase: 'marquee' as const,
        position: 1,
      },
    ];
    await redis.set(REDIS_KEYS.auctionQueue(testRoomId), JSON.stringify(queueEntries));
  });

  afterEach(async () => {
    await redis.del(REDIS_KEYS.currentPlayer(testRoomId));
    await redis.del(REDIS_KEYS.currentBid(testRoomId));
    await redis.del(REDIS_KEYS.currentBidder(testRoomId));
    await redis.del(REDIS_KEYS.auctionState(testRoomId));
    await redis.del(REDIS_KEYS.auctionQueue(testRoomId));
  });

  it('Sold Branch: should resolve winning bid, deduct wallet in Redis, update DB transaction, and broadcast PLAYER_SOLD', async () => {
    const winningPriceLakhs = 650;
    const winningFranchise: FranchiseName = 'Chennai Super Kings';

    // Set winning bid in Redis
    await redis.set(REDIS_KEYS.currentBid(testRoomId), winningPriceLakhs.toString());
    await redis.set(REDIS_KEYS.currentBidder(testRoomId), winningFranchise);

    const engine = new AuctionEngine(mockIo, testRoomId);

    // Mock sleep to run instantly
    vi.spyOn(engine as any, 'advanceToNextPlayer').mockImplementation(async () => {});

    // Trigger timer expiry with winning bid
    await engine.handleTimerExpiry({
      player: testPlayer,
      phase: 'marquee',
      position: 1,
    });

    // 1. Check Redis auctionState
    const state = await redis.get(REDIS_KEYS.auctionState(testRoomId));
    expect(state).toBe('sold');

    // 2. Check Redis FranchiseState wallet deduction
    const franchiseState = await loadFranchiseState(testRoomId, winningFranchise);
    expect(franchiseState).toBeDefined();
    expect(franchiseState?.walletRemainingLakhs).toBe(12000 - winningPriceLakhs);
    expect(franchiseState?.squadCount).toBe(1);

    // 3. Check broadcasted PLAYER_SOLD event
    const soldEvent = emittedEvents.find((e) => e.event === SOCKET_EVENTS.PLAYER_SOLD);
    expect(soldEvent).toBeDefined();
    expect(soldEvent?.payload).toMatchObject({
      finalPriceLakhs: winningPriceLakhs,
      winningFranchise: 'Chennai Super Kings',
      player: { id: testPlayer.id, name: testPlayer.name },
      updatedSquad: {
        franchise: 'Chennai Super Kings',
        totalPlayersAcquired: 1,
        walletRemainingLakhs: 12000 - winningPriceLakhs,
      },
    });

    // 4. Check DB queue status resolved to 'sold'
    const queueRes = await client.query(
      `SELECT status FROM auction_queue WHERE room_id = $1 AND position = 1`,
      [testRoomId]
    );
    expect(queueRes.rows[0]?.status).toBe('sold');
  }, 20000);

  it('Sold Branch DB Transaction: recordPlayerSold should atomically insert squad_players and deduct room_members wallet', async () => {
    const priceLakhs = 400;
    const franchise: FranchiseName = 'Chennai Super Kings';

    await recordPlayerSold({
      roomId: testRoomId,
      roomMemberId: testRoomMemberId,
      playerId: testPlayer.id,
      priceLakhs,
      franchise,
    });

    // Check squad_players row
    const squadRes = await client.query(
      `SELECT * FROM squad_players WHERE room_member_id = $1 AND player_id = $2`,
      [testRoomMemberId, testPlayer.id]
    );
    expect(squadRes.rows.length).toBe(1);
    expect(squadRes.rows[0].price_paid_lakhs).toBe(priceLakhs);

    // Check room_members wallet
    const memberRes = await client.query(
      `SELECT wallet_remaining_lakhs FROM room_members WHERE id = $1`,
      [testRoomMemberId]
    );
    expect(memberRes.rows[0].wallet_remaining_lakhs).toBe(12000 - priceLakhs);

    // Check bid_events audit entry
    const eventRes = await client.query(
      `SELECT * FROM bid_events WHERE room_id = $1 AND event_type = 'player_sold'`,
      [testRoomId]
    );
    expect(eventRes.rows.length).toBeGreaterThanOrEqual(1);
  }, 20000);

  it('Unsold Branch: should mark player unsold when no bids meet base price, broadcast PLAYER_UNSOLD, and leave wallet untouched', async () => {
    // Current bid is 0 / empty
    await redis.set(REDIS_KEYS.currentBid(testRoomId), '0');
    await redis.del(REDIS_KEYS.currentBidder(testRoomId));

    const engine = new AuctionEngine(mockIo, testRoomId);
    vi.spyOn(engine as any, 'advanceToNextPlayer').mockImplementation(async () => {});

    await engine.handleTimerExpiry({
      player: testPlayer,
      phase: 'marquee',
      position: 1,
    });

    // 1. Check Redis auctionState
    const state = await redis.get(REDIS_KEYS.auctionState(testRoomId));
    expect(state).toBe('unsold');

    // 2. Check broadcasted PLAYER_UNSOLD event
    const unsoldEvent = emittedEvents.find((e) => e.event === SOCKET_EVENTS.PLAYER_UNSOLD);
    expect(unsoldEvent).toBeDefined();
    expect(unsoldEvent?.payload.player.id).toBe(testPlayer.id);

    // 3. Check DB queue status resolved to 'unsold'
    const queueRes = await client.query(
      `SELECT status FROM auction_queue WHERE room_id = $1 AND position = 1`,
      [testRoomId]
    );
    expect(queueRes.rows[0]?.status).toBe('unsold');

    // 4. Franchise wallet must remain completely untouched
    const franchiseState = await loadFranchiseState(testRoomId, 'Chennai Super Kings');
    expect(franchiseState?.walletRemainingLakhs).toBe(12000);
    expect(franchiseState?.squadCount).toBe(0);
  }, 20000);

  it('Auction Completion: endAuction should mark room completed and emit AUCTION_COMPLETE with all franchise states', async () => {
    const engine = new AuctionEngine(mockIo, testRoomId);

    await engine.endAuction();

    // 1. Redis auctionState complete
    const state = await redis.get(REDIS_KEYS.auctionState(testRoomId));
    expect(state).toBe('complete');

    // 2. DB room status completed
    const roomRes = await client.query(`SELECT status FROM rooms WHERE id = $1`, [testRoomId]);
    expect(roomRes.rows[0]?.status).toBe('completed');

    // 3. AUCTION_COMPLETE event emitted
    const completeEvent = emittedEvents.find((e) => e.event === SOCKET_EVENTS.AUCTION_COMPLETE);
    expect(completeEvent).toBeDefined();
    expect(completeEvent?.payload.allFranchiseStates).toBeDefined();
  }, 20000);
});
