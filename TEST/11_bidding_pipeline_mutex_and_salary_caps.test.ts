import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { Client } from 'pg';
import { redis } from '../apps/backend/src/redis/client';
import { REDIS_KEYS } from '../apps/backend/src/redis/keys';
import { acquireLock, releaseLock } from '../apps/backend/src/redis/lock';
import {
  canBid,
  getBidIncrement,
  getBidRejectionMessage,
  SOCKET_EVENTS,
  type Player,
  type FranchiseState,
} from '../packages/shared/src';
import { validateBid } from '../apps/backend/src/services/bidValidator';
import { initAllFranchiseStates } from '../apps/backend/src/services/franchiseStateService';
import { createRoom } from '../apps/backend/src/db/queries/rooms';
import { registerAuctionHandlers } from '../apps/backend/src/socket/handlers/auctionHandler';
import type { AuthenticatedSocket } from '../apps/backend/src/socket/middleware/socketAuth';

describe('Phase 6: Bidding Pipeline, Redis Mutex & Salary Cap Rules', () => {
  // ─── Suite 1: Pure Salary Cap & Increment Rules ─────────────────────────────
  describe('IPL Bid Increments & Pure Salary Cap Validator (canBid)', () => {
    const basePlayer: Player = {
      id: 'p-1',
      name: 'Jasprit Bumrah',
      category: 'Marquee Pacer',
      role: 'pacer',
      nationality: 'indian',
      isMarquee: true,
      isCapped: true,
      basePriceLakhs: 200,
    };

    const baseState: FranchiseState = {
      franchise: 'Mumbai Indians',
      walletRemainingLakhs: 12000,
      squadCount: 0,
      overseasCount: 0,
      uncappedCount: 0,
      wkCount: 0,
      batterCount: 0,
      bowlerCount: 0,
      allRounderCount: 0,
      tier25PlusCount: 0,
      tier20to25Count: 0,
      tier15to20Count: 0,
    };

    it('should calculate correct IPL bid increments across all price brackets', () => {
      // Under 50L -> +2L
      expect(getBidIncrement(20)).toBe(2);
      expect(getBidIncrement(48)).toBe(2);

      // 50L to 100L -> +5L
      expect(getBidIncrement(50)).toBe(5);
      expect(getBidIncrement(95)).toBe(5);

      // 100L to 200L -> +10L
      expect(getBidIncrement(100)).toBe(10);
      expect(getBidIncrement(190)).toBe(10);

      // 200L and above -> +20L
      expect(getBidIncrement(200)).toBe(20);
      expect(getBidIncrement(2480)).toBe(20);
    });

    it('should validate a standard legal bid', () => {
      const result = canBid(baseState, basePlayer, 300);
      expect(result.valid).toBe(true);
      expect(result.remainingAfterBid).toBe(11700);
    });

    it('Rule 1: should reject bid when squad is full (25 players)', () => {
      const fullSquadState: FranchiseState = { ...baseState, squadCount: 25 };
      const result = canBid(fullSquadState, basePlayer, 300);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('SQUAD_FULL');
      expect(getBidRejectionMessage(result.reason)).toContain('25 players');
    });

    it('Rule 2: should reject bid when wallet is exhausted', () => {
      const lowWalletState: FranchiseState = { ...baseState, walletRemainingLakhs: 250 };
      const result = canBid(lowWalletState, basePlayer, 300);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('WALLET_EXHAUSTED');
    });

    it('Rule 3: should enforce Tier 25+ Cr salary cap (max 1 player >= ₹25 Cr)', () => {
      const tier25State: FranchiseState = { ...baseState, tier25PlusCount: 1 };
      // Bidding ₹25 Cr (2500L)
      const result = canBid(tier25State, basePlayer, 2500);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('TIER_25_PLUS_LIMIT_REACHED');

      // But bidding ₹24.8 Cr (2480L) should still pass Tier 25+ check
      const resultUnder = canBid(tier25State, basePlayer, 2480);
      expect(resultUnder.valid).toBe(true);
    });

    it('Rule 4: should enforce Tier 20-25 Cr salary cap (max 2 players in ₹20-25 Cr)', () => {
      const tier20State: FranchiseState = { ...baseState, tier20to25Count: 2 };
      const result = canBid(tier20State, basePlayer, 2200);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('TIER_20_25_LIMIT_REACHED');
    });

    it('Rule 5: should enforce Tier 15-20 Cr salary cap (max 3 players in ₹15-20 Cr)', () => {
      const tier15State: FranchiseState = { ...baseState, tier15to20Count: 3 };
      const result = canBid(tier15State, basePlayer, 1700);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('TIER_15_20_LIMIT_REACHED');
    });

    it('Rule 6: should enforce Overseas player cap (max 8 overseas players)', () => {
      const overseasPlayer: Player = { ...basePlayer, nationality: 'overseas' };
      const maxOverseasState: FranchiseState = { ...baseState, overseasCount: 8 };

      const result = canBid(maxOverseasState, overseasPlayer, 300);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('OVERSEAS_LIMIT_REACHED');

      // Indian player should still be allowed
      const indianResult = canBid(maxOverseasState, basePlayer, 300);
      expect(indianResult.valid).toBe(true);
    });

    it('Rule 7: should enforce Wicketkeeper cap (max 4 wicketkeepers)', () => {
      const wkPlayer: Player = { ...basePlayer, role: 'wk' };
      const maxWkState: FranchiseState = { ...baseState, wkCount: 4 };

      const result = canBid(maxWkState, wkPlayer, 300);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('WK_LIMIT_REACHED');
    });

    it('Rule 8: should enforce CANNOT_COMPLETE_VALID_SQUAD solvency reserve check', () => {
      // Squad has 10 players, need 14 more players. Minimum base price is 20L each -> 14 * 20 = 280L reserve required.
      // Remaining wallet is 1000L. If bidding 800L, walletAfterBid = 200L (< 280L reserve) -> REJECT
      const lowPurseState: FranchiseState = {
        ...baseState,
        squadCount: 10,
        walletRemainingLakhs: 1000,
      };

      const result = canBid(lowPurseState, basePlayer, 800);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('CANNOT_COMPLETE_VALID_SQUAD');

      // Bidding 700L leaves 300L (> 280L reserve) -> ACCEPT
      const passResult = canBid(lowPurseState, basePlayer, 700);
      expect(passResult.valid).toBe(true);
    });
  });

  // ─── Suite 2: Redis SETNX Distributed Mutex Lock ──────────────────────────
  describe('Redis SETNX Distributed Mutex Lock (lock.ts)', () => {
    const lockKey = 'test:lock:room-xyz';

    afterEach(async () => {
      await redis.del(lockKey);
    });

    it('should acquire lock with UUID token and reject concurrent acquisition', async () => {
      const token1 = await acquireLock(lockKey, 5000);
      expect(token1).toBeDefined();
      expect(typeof token1).toBe('string');

      // Concurrent attempt should be rejected (return null)
      const token2 = await acquireLock(lockKey, 5000);
      expect(token2).toBeNull();

      // Release with token1
      const released = await releaseLock(lockKey, token1!);
      expect(released).toBe(true);

      // Now lock can be acquired again
      const token3 = await acquireLock(lockKey, 5000);
      expect(token3).toBeDefined();
      await releaseLock(lockKey, token3!);
    });

    it('should fail to release lock if wrong token is provided (Lua safety guard)', async () => {
      const token = await acquireLock(lockKey, 5000);
      expect(token).toBeDefined();

      // Try releasing with a bogus token
      const fakeRelease = await releaseLock(lockKey, 'bogus-token-123');
      expect(fakeRelease).toBe(false);

      // Lock should still be held in Redis with the original token
      const currentVal = await redis.get(lockKey);
      expect(currentVal).toBe(token);

      // Clean up with genuine token
      await releaseLock(lockKey, token!);
    });
  });

  // ─── Suite 3: Authoritative Bid Pipeline & Concurrency ────────────────────
  describe('Authoritative Bid Pipeline & Socket Handler Integration', () => {
    let client: Client;
    let testUserId: string;
    let testRoomId: string;
    let testRoomCode: string;

    let testPlayer: Player;

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

      // Get an existing player from DB for foreign-key valid bids
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
          name: 'Heinrich Klaasen',
          category: 'Marquee WK',
          role: 'wk',
          nationality: 'overseas',
          isMarquee: true,
          isCapped: true,
          basePriceLakhs: 200,
        };
      }

      // Create test user
      const userRes = await client.query(`
        INSERT INTO users (id, email, username, password_hash, created_at)
        VALUES (gen_random_uuid(), 'bid_pipeline_test@example.com', 'bid_tester', '$2a$12$dummyhash', NOW())
        ON CONFLICT (email) DO UPDATE SET username = 'bid_tester'
        RETURNING id
      `);
      testUserId = userRes.rows[0].id;

      // Create test room
      const room = await createRoom(testUserId);
      testRoomId = room.id;
      testRoomCode = room.invite_code;

      // Set host franchise claim
      await client.query(
        `UPDATE room_members SET franchise = 'Sunrisers Hyderabad' WHERE room_id = $1 AND user_id = $2`,
        [testRoomId, testUserId]
      );
    });

    afterAll(async () => {
      if (testRoomId) {
        await client.query('DELETE FROM bids WHERE room_id = $1', [testRoomId]);
        await client.query('DELETE FROM room_members WHERE room_id = $1', [testRoomId]);
        await client.query('DELETE FROM rooms WHERE id = $1', [testRoomId]);
      }
      if (testUserId) {
        await client.query('DELETE FROM users WHERE id = $1', [testUserId]);
      }
      await client.end();
    });

    beforeEach(async () => {
      // Initialize Redis state for the room
      await initAllFranchiseStates(testRoomId);
      await redis.set(REDIS_KEYS.currentPlayer(testRoomId), JSON.stringify(testPlayer));
      await redis.set(REDIS_KEYS.currentBid(testRoomId), '200');
      await redis.set(REDIS_KEYS.currentBidder(testRoomId), 'Chennai Super Kings');
      await redis.set(REDIS_KEYS.auctionState(testRoomId), 'player_up');
    });

    afterEach(async () => {
      await redis.del(REDIS_KEYS.currentPlayer(testRoomId));
      await redis.del(REDIS_KEYS.currentBid(testRoomId));
      await redis.del(REDIS_KEYS.currentBidder(testRoomId));
      await redis.del(REDIS_KEYS.auctionState(testRoomId));
      await redis.del(REDIS_KEYS.bidLock(testRoomId));
    });

    it('should validate and accept a higher bid via validateBid service', async () => {
      const franchiseState = {
        franchise: 'Sunrisers Hyderabad' as const,
        walletRemainingLakhs: 12000,
        squadCount: 2,
        overseasCount: 1,
        uncappedCount: 0,
        wkCount: 0,
        batterCount: 1,
        bowlerCount: 1,
        allRounderCount: 0,
        tier25PlusCount: 0,
        tier20to25Count: 0,
        tier15to20Count: 0,
      };

      // Bid 220L (> current 200L)
      const validation = await validateBid(
        testRoomId,
        testPlayer.id,
        220,
        franchiseState,
        testPlayer
      );

      expect(validation.valid).toBe(true);
      expect(validation.remainingAfterBid).toBe(11780);
    });

    it('should reject a bid lower than or equal to the current bid', async () => {
      const franchiseState = {
        franchise: 'Sunrisers Hyderabad' as const,
        walletRemainingLakhs: 12000,
        squadCount: 0,
        overseasCount: 0,
        uncappedCount: 0,
        wkCount: 0,
        batterCount: 0,
        bowlerCount: 0,
        allRounderCount: 0,
        tier25PlusCount: 0,
        tier20to25Count: 0,
        tier15to20Count: 0,
      };

      // Current bid is 200L. Trying to bid 200L or 190L should fail
      const validationEqual = await validateBid(
        testRoomId,
        testPlayer.id,
        200,
        franchiseState,
        testPlayer
      );
      expect(validationEqual.valid).toBe(false);
      expect(validationEqual.reason).toBe('BID_TOO_LOW');

      const validationLower = await validateBid(
        testRoomId,
        testPlayer.id,
        180,
        franchiseState,
        testPlayer
      );
      expect(validationLower.valid).toBe(false);
      expect(validationLower.reason).toBe('BID_TOO_LOW');
    });

    it('should process bid through socket handler, update Redis hot state, and broadcast BID_UPDATE', async () => {
      const emittedEvents: Array<{ channel: string; event: string; payload: any }> = [];
      const mockIo = {
        to: (channel: string) => ({
          emit: (event: string, payload: any) => {
            emittedEvents.push({ channel, event, payload });
          },
        }),
      } as any;

      const mockSocket = {
        data: {
          user: { id: testUserId, username: 'bid_tester', email: 'bid_pipeline_test@example.com' },
          roomCode: testRoomCode,
          roomId: testRoomId,
          franchise: 'Sunrisers Hyderabad',
        },
        emit: (event: string, payload: any) => {
          emittedEvents.push({ channel: 'private', event, payload });
        },
        on: vi.fn(),
      } as unknown as AuthenticatedSocket;

      // Capture registered listeners
      const listeners: Record<string, Function> = {};
      (mockSocket.on as any).mockImplementation((event: string, handler: Function) => {
        listeners[event] = handler;
      });

      registerAuctionHandlers(mockIo, mockSocket);

      // Invoke BID_PLACED with 250L
      expect(listeners[SOCKET_EVENTS.BID_PLACED]).toBeDefined();
      await listeners[SOCKET_EVENTS.BID_PLACED]({
        roomCode: testRoomCode,
        playerId: testPlayer.id,
        amountLakhs: 250,
      });

      // 1. Verify Redis hot state was updated
      const updatedBid = await redis.get(REDIS_KEYS.currentBid(testRoomId));
      expect(updatedBid).toBe('250');

      const updatedBidder = await redis.get(REDIS_KEYS.currentBidder(testRoomId));
      expect(updatedBidder).toBe('Sunrisers Hyderabad');

      const updatedState = await redis.get(REDIS_KEYS.auctionState(testRoomId));
      expect(updatedState).toBe('bidding');

      // 2. Verify BID_UPDATE was broadcast to the room channel
      const bidUpdateEvent = emittedEvents.find((e) => e.event === SOCKET_EVENTS.BID_UPDATE);
      expect(bidUpdateEvent).toBeDefined();
      expect(bidUpdateEvent?.payload).toMatchObject({
        playerId: testPlayer.id,
        newBidLakhs: 250,
        newBidder: 'Sunrisers Hyderabad',
      });
    });
  });
});
