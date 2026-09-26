/**
 * apps/backend/src/services/hostDeadManService.ts
 *
 * MAJOR FUNCTION: Host Dead Man's Switch service.
 * Manages the authoritative host disconnection recovery window.
 *
 * STATE MACHINE:
 *   ACTIVE
 *     | host disconnects during active auction
 *     v
 *   WAITING_HOST (60s timer starts, auction timer frozen)
 *     |
 *     +--> Host reconnects within 60s --> ACTIVE (timer resumed)
 *     |
 *     +--> 60s expires without host --> TERMINATED (clients -> /dashboard)
 *
 * RACE SAFETY:
 * Uses Redis tokens & timestamps to ensure reconnect vs timeout races are handled atomically.
 */
import type { Server } from 'socket.io';
import { randomUUID } from 'crypto';
import { redis } from '../redis/client';
import { REDIS_KEYS } from '../redis/keys';
import { getTimerService } from './timerService';
import { getAuctionEngine, removeAuctionEngine } from './auctionEngine';
import { getRoomById, updateRoomStatus } from '../db/queries/rooms';
import { appendBidEvent } from '../db/queries/auction';
import { SOCKET_EVENTS } from '@ipl-auction/shared';

const HOST_RECOVERY_WINDOW_MS = 60_000; // 60 seconds

// In-memory timer handles for host timeouts
const deadManTimers = new Map<string, ReturnType<typeof setTimeout>>();

export class HostDeadManService {
  /**
   * Called when the room host disconnects during an active auction.
   */
  static async handleHostDisconnect(
    roomId: string,
    hostUserId: string,
    io: Server
  ): Promise<void> {
    const room = await getRoomById(roomId);
    if (!room) return;

    // Only activate dead man switch if room was active and the departing user is indeed the host
    if (room.host_user_id !== hostUserId) return;
    if (room.status !== 'active') return;

    console.info(
      `[HostDeadMan] Host ${hostUserId} disconnected from active room ${room.invite_code} (${roomId}). Initiating 60s recovery window.`
    );

    // 1. Freeze the authoritative auction timer
    const timerService = getTimerService(io);
    const frozenRemainingSeconds = await timerService.pauseTimer(roomId);

    // 2. Transition room state to waiting_host in DB and Redis
    await updateRoomStatus(roomId, 'waiting_host');
    await redis.set(REDIS_KEYS.auctionState(roomId), 'waiting_host');

    // 3. Generate a unique deadman recovery token
    const token = randomUUID();
    const deadlineMs = Date.now() + HOST_RECOVERY_WINDOW_MS;

    await redis.set(
      REDIS_KEYS.hostDeadmanToken(roomId),
      token,
      'PX',
      HOST_RECOVERY_WINDOW_MS + 10_000
    );
    await redis.set(
      REDIS_KEYS.hostDeadmanDeadline(roomId),
      deadlineMs.toString(),
      'PX',
      HOST_RECOVERY_WINDOW_MS + 10_000
    );

    // 4. Clear any previous deadman timer
    if (deadManTimers.has(roomId)) {
      clearTimeout(deadManTimers.get(roomId)!);
      deadManTimers.delete(roomId);
    }

    // 5. Broadcast auction:waiting_host to all participants
    io.to(room.invite_code).to(roomId).emit(SOCKET_EVENTS.AUCTION_WAITING_HOST, {
      roomId,
      roomCode: room.invite_code,
      remainingRecoverySeconds: 60,
      recoveryDeadlineMs: deadlineMs,
      frozenTimerSeconds: frozenRemainingSeconds,
      message: 'Host disconnected. Auction paused. Waiting for host to reconnect (60s)...',
    });

    // 6. Schedule timeout callback
    const timeoutHandle = setTimeout(async () => {
      deadManTimers.delete(roomId);
      await HostDeadManService.handleHostTimeout(roomId, token, io);
    }, HOST_RECOVERY_WINDOW_MS);

    deadManTimers.set(roomId, timeoutHandle);
  }

  /**
   * Called when host reconnects to a room in waiting_host status.
   * Restores authoritative state, resumes auction timer, broadcasts auction:resumed.
   */
  static async handleHostReconnect(
    roomId: string,
    hostUserId: string,
    io: Server
  ): Promise<boolean> {
    const room = await getRoomById(roomId);
    if (!room) return false;

    // Verify user is the host
    if (room.host_user_id !== hostUserId) return false;

    // Check if room is waiting for host
    if (room.status !== 'waiting_host') return false;

    console.info(
      `[HostDeadMan] Host ${hostUserId} reconnected to room ${room.invite_code} (${roomId}). Restoring auction state.`
    );

    // Cancel in-memory timer
    if (deadManTimers.has(roomId)) {
      clearTimeout(deadManTimers.get(roomId)!);
      deadManTimers.delete(roomId);
    }

    // Clear Redis tokens
    await redis.del(REDIS_KEYS.hostDeadmanToken(roomId));
    await redis.del(REDIS_KEYS.hostDeadmanDeadline(roomId));

    // Transition back to active
    await updateRoomStatus(roomId, 'active');

    // Resume the auction timer
    const timerService = getTimerService(io);
    const engine = getAuctionEngine(roomId, io);

    const expiryCallback = async () => {
      const { getNextPlayer } = await import('./queueManager');
      const entry = await getNextPlayer(roomId);
      if (entry) {
        await engine.handleTimerExpiry(entry);
      }
    };

    await timerService.resumeTimer(roomId, expiryCallback);

    // Broadcast resumption
    const remainingSeconds = await timerService.getRemainingSeconds(roomId);
    io.to(room.invite_code).to(roomId).emit(SOCKET_EVENTS.AUCTION_RESUMED, {
      roomId,
      roomCode: room.invite_code,
      secondsLeft: remainingSeconds,
      message: 'Host reconnected! Auction resumed.',
    });

    return true;
  }

  /**
   * Called when 60s recovery window expires without host reconnection.
   * Race-safe against reconnect via Redis token matching.
   */
  static async handleHostTimeout(
    roomId: string,
    expectedToken: string,
    io: Server
  ): Promise<void> {
    const currentToken = await redis.get(REDIS_KEYS.hostDeadmanToken(roomId));
    if (!currentToken || currentToken !== expectedToken) {
      // Host reconnected in time and token was cleared or replaced
      console.info(
        `[HostDeadMan] Timeout triggered for ${roomId}, but token was already invalidated (host reconnected).`
      );
      return;
    }

    console.warn(
      `[HostDeadMan] Host recovery window expired for room ${roomId}. Terminating auction.`
    );

    // Invalidate token
    await redis.del(REDIS_KEYS.hostDeadmanToken(roomId));
    await redis.del(REDIS_KEYS.hostDeadmanDeadline(roomId));

    const room = await getRoomById(roomId);
    const roomCode = room?.invite_code ?? '';

    // Mark room terminated in DB & Redis
    await updateRoomStatus(roomId, 'terminated');
    await redis.set(REDIS_KEYS.auctionState(roomId), 'complete');

    // Clear all timers and engines
    const timerService = getTimerService(io);
    timerService.clearTimer(roomId);
    await redis.del(REDIS_KEYS.timerDeadline(roomId));
    await redis.del(`${REDIS_KEYS.timerDeadline(roomId)}:paused`);

    removeAuctionEngine(roomId);

    // Audit trail record
    try {
      await appendBidEvent({
        roomId,
        eventType: 'auction_completed', // recorded in bid_events
        payload: {
          terminated: true,
          reason: 'host_timeout',
          terminatedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error('[HostDeadMan] Error writing termination audit:', err);
    }

    // Broadcast auction:terminated
    io.to(roomCode).to(roomId).emit(SOCKET_EVENTS.AUCTION_TERMINATED, {
      roomId,
      roomCode,
      reason: 'host_timeout',
      message: 'Host failed to reconnect within 60 seconds. The auction has been terminated.',
    });
  }

  /**
   * Get remaining recovery seconds if room is waiting for host.
   */
  static async getRecoveryTimeRemaining(roomId: string): Promise<number> {
    const deadlineStr = await redis.get(REDIS_KEYS.hostDeadmanDeadline(roomId));
    if (!deadlineStr) return 0;
    const remainingMs = parseInt(deadlineStr, 10) - Date.now();
    return Math.max(0, Math.ceil(remainingMs / 1000));
  }
}
