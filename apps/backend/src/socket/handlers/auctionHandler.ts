/**
 * apps/backend/src/socket/handlers/auctionHandler.ts
 *
 * MAJOR FUNCTION: Handles the auction:bid_placed event.
 * This is the hottest code path in the entire system — it processes every single bid.
 *
 * THE 12-STEP BID PIPELINE:
 * (Read this like a flowchart — each step is a gate. Failure at any step = early return.)
 *
 *  1.  Get bidder's franchise from socket.data (set in roomHandler when franchise was claimed)
 *  2.  Load FranchiseState from Redis (hot path — ~0.3ms)
 *  3.  Load current player from Redis (hot path — ~0.3ms)
 *  4.  Pre-lock validation (auction state, bid amount, salary caps) — fast, no lock
 *  5.  ACQUIRE distributed lock (Redis SETNX — ~0.3ms) — MAY FAIL → reject with BID_REJECTED
 *  6.  Re-read current bid from Redis INSIDE the lock (state may have changed)
 *  7.  Re-validate bid is still higher than current (double-check under lock)
 *  8.  Write new bid to Redis atomically (SET currentBid + SET currentBidder)
 *  9.  Update auction state to 'bidding' (first bid changes state from 'player_up')
 * 10.  RELEASE lock (Lua script — atomic token check + delete)
 * 11.  Broadcast auction:bid_update to ALL room members
 * 12.  Reset timer to 10 seconds (each bid extends the countdown)
 *      Async: write bid to PostgreSQL audit trail (fire-and-forget)
 *
 * SYSTEM CONCEPT — Why Pre-lock Validation?
 *   The distributed lock (step 5) has a ~0.3ms overhead per acquisition.
 *   If we acquire the lock for EVERY bid attempt including obviously invalid ones
 *   (wrong player, exhausted wallet), we serialize ALL requests through Redis.
 *   Pre-lock validation rejects 90% of invalid bids BEFORE touching the lock.
 *   Only valid-looking bids get to compete for the lock.
 *
 * SYSTEM CONCEPT — Why Re-validate Under the Lock?
 *   Between pre-lock validation (step 4) and lock acquisition (step 5),
 *   another bid may have been accepted. The pre-lock check read `currentBid = 500`.
 *   By the time we acquired the lock, another process set `currentBid = 600`.
 *   Without re-reading: we'd accept a bid of 550 even though 600 is already recorded.
 *   The re-read under the lock (step 6-7) guarantees we see the absolute latest state.
 *
 * SYSTEM CONCEPT — STATE_SYNC for Reconnection Recovery:
 *   When a socket reconnects (tab reopen, network glitch), it has lost all Zustand state.
 *   The handler responds to 'auction:state_sync_request' by emitting a full snapshot
 *   PRIVATELY to the reconnecting socket (not broadcast to the room).
 *   The snapshot is read from Redis in ~0.5ms — the client "snaps back" instantly.
 */
import type { Server } from 'socket.io';
import type { AuthenticatedSocket } from '../middleware/socketAuth';
import { SOCKET_EVENTS, BID_LOCK_TTL_MS } from '@ipl-auction/shared';
import type { BidPlacedPayload, FranchiseName, Player } from '@ipl-auction/shared';
import { redis } from '../../redis/client';
import { REDIS_KEYS } from '../../redis/keys';
import { acquireLock, releaseLock } from '../../redis/lock';
import { loadFranchiseState } from '../../services/franchiseStateService';
import { validateBid } from '../../services/bidValidator';
import { getTimerService } from '../../services/timerService';
import { getAuctionEngine } from '../../services/auctionEngine';
import { getRoomByCode } from '../../db/queries/rooms';
import { insertBid } from '../../db/queries/auction';

export function registerAuctionHandlers(io: Server, socket: AuthenticatedSocket): void {
  const { username } = socket.data.user;

  // ─── auction:bid_placed ─────────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.BID_PLACED, async (payload: BidPlacedPayload) => {
    const { roomCode, playerId, amountLakhs } = payload;
    let lockToken: string | null = null;

    try {
      // ── Step 1: Get franchise from socket.data ─────────────────────────────
      const franchise = socket.data.franchise as FranchiseName | undefined;
      if (!franchise) {
        socket.emit(SOCKET_EVENTS.BID_REJECTED, {
          reason: 'AUCTION_NOT_ACTIVE',
          humanMessage: 'You have not selected a franchise.',
        });
        return;
      }

      // ── Step 2: Get room from code (need roomId for Redis keys) ───────────
      const room = await getRoomByCode(roomCode);
      if (!room) return;
      const roomId = room.id;

      // ── Step 3: Load FranchiseState from Redis ─────────────────────────────
      const franchiseState = await loadFranchiseState(roomId, franchise);
      if (!franchiseState) {
        socket.emit(SOCKET_EVENTS.BID_REJECTED, {
          reason: 'AUCTION_NOT_ACTIVE',
          humanMessage: 'Auction state not found. Please refresh.',
        });
        return;
      }

      // ── Step 4: Load current player from Redis ─────────────────────────────
      const playerJson = await redis.get(REDIS_KEYS.currentPlayer(roomId));
      if (!playerJson) {
        socket.emit(SOCKET_EVENTS.BID_REJECTED, {
          reason: 'AUCTION_NOT_ACTIVE',
          humanMessage: 'No player is currently up for auction.',
        });
        return;
      }
      const currentPlayer = JSON.parse(playerJson) as Player;

      // ── Step 5: Pre-lock validation (fast reject) ─────────────────────────
      const preValidation = await validateBid(roomId, playerId, amountLakhs, franchiseState, currentPlayer);
      if (!preValidation.valid) {
        socket.emit(SOCKET_EVENTS.BID_REJECTED, {
          reason: preValidation.reason,
          humanMessage: preValidation.humanMessage,
        });
        return;
      }

      // ── Step 6: Acquire distributed lock ─────────────────────────────────
      lockToken = await acquireLock(REDIS_KEYS.bidLock(roomId), BID_LOCK_TTL_MS);
      if (!lockToken) {
        // Lock is held by another bid processing concurrently — reject this one
        socket.emit(SOCKET_EVENTS.BID_REJECTED, {
          reason: 'AUCTION_NOT_ACTIVE',
          humanMessage: 'Another bid is being processed. Please try again.',
        });
        return;
      }

      // ── Step 7: Re-read current bid UNDER the lock ────────────────────────
      const freshBidStr = await redis.get(REDIS_KEYS.currentBid(roomId));
      const freshBidLakhs = parseInt(freshBidStr ?? '0', 10);

      if (amountLakhs <= freshBidLakhs) {
        // State changed while waiting for the lock — this bid is now too low
        socket.emit(SOCKET_EVENTS.BID_REJECTED, {
          reason: 'BID_TOO_LOW',
          humanMessage: `Bid accepted by another player. Current bid is now ₹${freshBidLakhs}L.`,
        });
        return; // Will release lock in finally block
      }

      // ── Step 8: Write new bid to Redis atomically ─────────────────────────
      const pipeline = redis.pipeline();
      pipeline.set(REDIS_KEYS.currentBid(roomId), amountLakhs.toString());
      pipeline.set(REDIS_KEYS.currentBidder(roomId), franchise);
      pipeline.set(REDIS_KEYS.auctionState(roomId), 'bidding');
      await pipeline.exec();

      // ── Step 9: Release lock (BEFORE broadcasting — minimize lock hold time) ─
      await releaseLock(REDIS_KEYS.bidLock(roomId), lockToken);
      lockToken = null; // Mark as released — finally block won't double-release

      // ── Step 10: Broadcast bid_update to ALL in the room ─────────────────
      io.to(roomCode).emit(SOCKET_EVENTS.BID_UPDATE, {
        playerId,
        newBidLakhs: amountLakhs,
        newBidder: franchise,
        timestamp: Date.now(),
      });

      console.info(`[Auction] Bid accepted: ${franchise} bids ₹${amountLakhs}L on ${currentPlayer.name}`);

      // ── Step 11: Reset timer to 10 seconds ────────────────────────────────
      const engine = getAuctionEngine(roomId, io);
      const timerService = getTimerService(io);
      await timerService.resetTimer(roomId, async () => {
        // Need a fresh entry for the expiry handler
        const { getNextPlayer } = await import('../../services/queueManager');
        const entry = await getNextPlayer(roomId);
        if (entry) {
          await engine.handleTimerExpiry(entry);
        }
      });

      // ── Step 12: Async write to PostgreSQL audit trail ────────────────────
      // getRoomMemberByFranchise + insertBid — fire-and-forget
      (async () => {
        try {
          const { getRoomMemberByFranchise } = await import('../../db/queries/auction');
          const member = await getRoomMemberByFranchise(roomId, franchise);
          if (member) {
            await insertBid({
              roomId,
              playerId,
              roomMemberId: member.id,
              amountLakhs,
              isWinningBid: false, // Will be updated to true if this bid wins
            });
          }
        } catch (dbErr) {
          console.error('[Auction] Non-critical: failed to write bid to DB audit log:', dbErr);
        }
      })();

    } catch (err) {
      console.error(`[AuctionHandler] Unhandled error in bid_placed for ${username}:`, err);
      socket.emit(SOCKET_EVENTS.BID_REJECTED, {
        reason: 'AUCTION_NOT_ACTIVE',
        humanMessage: 'An unexpected error occurred. Please try again.',
      });
    } finally {
      // Safety net: always release lock if we still hold it
      if (lockToken) {
        const room = await getRoomByCode(payload.roomCode);
        if (room) {
          await releaseLock(REDIS_KEYS.bidLock(room.id), lockToken).catch(() => {});
        }
      }
    }
  });

  // ─── auction:state_sync_request — Reconnection Recovery ─────────────────────
  socket.on('auction:state_sync_request', async ({ roomCode }: { roomCode: string }) => {
    try {
      const room = await getRoomByCode(roomCode);
      if (!room) return;
      const roomId = room.id;

      // Read entire auction state from Redis in parallel (~1ms total)
      const [
        playerJson,
        currentBidStr,
        currentBidder,
        auctionState,
      ] = await Promise.all([
        redis.get(REDIS_KEYS.currentPlayer(roomId)),
        redis.get(REDIS_KEYS.currentBid(roomId)),
        redis.get(REDIS_KEYS.currentBidder(roomId)),
        redis.get(REDIS_KEYS.auctionState(roomId)),
      ]);

      const timerService = getTimerService(io);
      const secondsLeft = await timerService.getRemainingSeconds(roomId);

      const currentPlayer = playerJson ? JSON.parse(playerJson) as Player : null;

      // Load my franchise state
      const franchise = socket.data.franchise as FranchiseName | undefined;
      const myFranchiseState = franchise
        ? await loadFranchiseState(roomId, franchise)
        : null;

      // Get queue info
      const cachedQueue = await redis.get(REDIS_KEYS.auctionQueue(roomId));
      const queue = cachedQueue ? JSON.parse(cachedQueue) : [];
      const currentPosition = currentPlayer
        ? queue.findIndex((e: { player: Player }) => e.player.id === currentPlayer.id) + 1
        : 0;

      // Emit STATE_SYNC privately to the reconnecting socket (not broadcast)
      socket.emit(SOCKET_EVENTS.STATE_SYNC, {
        currentPlayer,
        currentBidLakhs: parseInt(currentBidStr ?? '0', 10),
        currentBidder: (currentBidder as FranchiseName | null) ?? null,
        secondsLeft,
        auctionPhase: queue[currentPosition - 1]?.phase ?? 'general',
        auctionState: (auctionState as 'idle' | 'player_up' | 'bidding' | 'sold' | 'complete') ?? 'idle',
        myFranchiseState: myFranchiseState ?? undefined,
        queuePosition: currentPosition,
        queueTotal: queue.length,
      });

      console.info(`[Auction] State sync sent to ${username} for room ${roomCode}`);
    } catch (err) {
      console.error('[AuctionHandler] State sync error:', err);
    }
  });

  // ─── host:control ───────────────────────────────────────────────────────────
  socket.on('host:control', async (payload: { roomCode: string; action: 'pause' | 'resume' | 'skip' | 'extend' }) => {
    try {
      const { roomCode, action } = payload;
      const room = await getRoomByCode(roomCode);
      if (!room) return;

      // Verify user is the host of the room
      if (room.host_user_id !== socket.data.user.id) {
        socket.emit('host:control_error', { message: 'Only the host can control the auction.' });
        return;
      }

      const roomId = room.id;
      const engine = getAuctionEngine(roomId, io);
      const timerService = getTimerService(io);

      if (action === 'pause') {
        const remaining = await timerService.getRemainingSeconds(roomId);
        if (remaining > 0) {
          timerService.clearTimer(roomId);
          await redis.set(REDIS_KEYS.timerDeadline(roomId) + ':paused', remaining.toString());
          await redis.set(REDIS_KEYS.auctionState(roomId), 'paused');
          io.to(roomCode).emit(SOCKET_EVENTS.TIMER_TICK, { roomId, secondsLeft: remaining });
          io.to(roomCode).emit('auction:paused', { secondsLeft: remaining });
          console.info(`[HostControl] Auction paused by host for room ${roomCode}`);
        }
      } else if (action === 'resume') {
        const pausedStr = await redis.get(REDIS_KEYS.timerDeadline(roomId) + ':paused');
        const remaining = pausedStr ? parseInt(pausedStr, 10) : 0;
        if (remaining > 0) {
          await redis.del(REDIS_KEYS.timerDeadline(roomId) + ':paused');
          await redis.set(REDIS_KEYS.auctionState(roomId), 'bidding');
          io.to(roomCode).emit('auction:resumed', { secondsLeft: remaining });
          
          await timerService.startTimer(roomId, remaining, async () => {
            const { getNextPlayer } = await import('../../services/queueManager');
            const entry = await getNextPlayer(roomId);
            if (entry) {
              await engine.handleTimerExpiry(entry);
            }
          });
          console.info(`[HostControl] Auction resumed by host for room ${roomCode}`);
        }
      } else if (action === 'skip') {
        // Stop timer
        timerService.clearTimer(roomId);
        await redis.del(REDIS_KEYS.timerDeadline(roomId));
        await redis.del(REDIS_KEYS.timerDeadline(roomId) + ':paused');
        
        const { getNextPlayer } = await import('../../services/queueManager');
        const entry = await getNextPlayer(roomId);
        if (entry) {
          await engine.processPlayerUnsold(entry);
          console.info(`[HostControl] Player skipped by host for room ${roomCode}`);
        }
      } else if (action === 'extend') {
        const remaining = await timerService.getRemainingSeconds(roomId);
        const newDuration = remaining + 30;
        
        io.to(roomCode).emit(SOCKET_EVENTS.TIMER_TICK, { roomId, secondsLeft: newDuration });
        io.to(roomCode).emit('auction:extended', { secondsLeft: newDuration });
        
        await timerService.startTimer(roomId, newDuration, async () => {
          const { getNextPlayer } = await import('../../services/queueManager');
          const entry = await getNextPlayer(roomId);
          if (entry) {
            await engine.handleTimerExpiry(entry);
          }
        });
        console.info(`[HostControl] Timer extended (+30s) by host for room ${roomCode}`);
      }
    } catch (err) {
      console.error('[HostControl] Error in host:control:', err);
    }
  });
}

