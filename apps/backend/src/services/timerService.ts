/**
 * apps/backend/src/services/timerService.ts
 *
 * MAJOR FUNCTION: Manages per-room countdown timers for the auction.
 * Each room has one active timer at any time — counting down from 30s (initial)
 * or 10s (reset on bid). When it hits 0, the onExpiry callback fires.
 *
 * SYSTEM CONCEPT — Absolute Deadline vs Relative Countdown:
 *   WRONG approach: store `secondsLeft = 30` in Redis
 *     - Server crashes → Redis still has 30
 *     - On restart: timer appears to reset to 30 → cheat vector for strategic disconnects
 *
 *   RIGHT approach: store `timerDeadline = Date.now() + 30000` (Unix ms timestamp)
 *     - Server crashes → deadline is still in Redis
 *     - On restart: `secondsLeft = Math.max(0, (deadline - Date.now()) / 1000)` → correct remaining time
 *     - Reconnecting client gets the real remaining time, not 30s
 *
 * SYSTEM CONCEPT — Why setInterval for ticks (not setTimeout):
 *   We need to emit auction:timer_tick every second to all clients.
 *   `setTimeout` fires once — we'd need to reschedule it recursively (fragile).
 *   `setInterval(fn, 1000)` fires every 1000ms automatically until cleared.
 *   We DON'T use setInterval to drive the expiry — the deadline in Redis is authoritative.
 *   The interval just fires ticks. When `secondsLeft <= 0`, we call the onExpiry callback.
 *
 * SYSTEM CONCEPT — Duplicate Timer Guard:
 *   If startTimer is called twice for the same room (e.g., race condition in auction start),
 *   we MUST clear the old interval before starting a new one.
 *   Without this: two intervals fire concurrently → double expiry → double advanceToNextPlayer → corrupted queue.
 *   `this.timers.has(roomId)` check prevents this.
 *
 * SYSTEM CONCEPT — Why the timer lives on the SERVER:
 *   Client-side timers drift (CPU throttle on mobile, tab backgrounding).
 *   A client could manipulate their timer to extend bidding time.
 *   The server timer is the single source of truth. Clients display the tick
 *   from auction:timer_tick events — they display what the server tells them.
 */
import type { Server } from 'socket.io';
import { SOCKET_EVENTS, BID_RESET_TIMER_SECONDS } from '@ipl-auction/shared';
import { redis } from '../redis/client';
import { REDIS_KEYS } from '../redis/keys';

interface TimerHandle {
  interval: ReturnType<typeof setInterval>;
  deadlineMs: number;
}

export class TimerService {
  /** In-memory map: roomId → active interval handle */
  private timers = new Map<string, TimerHandle>();

  constructor(private io: Server) {}

  /**
   * Start a countdown timer for a room.
   * Stores absolute deadline in Redis. Emits timer_tick every second.
   * Calls onExpiry when secondsLeft <= 0.
   *
   * @param roomId         The auction room UUID
   * @param durationSeconds Total countdown seconds (30 for initial, 10 for bid reset)
   * @param onExpiry       Callback function invoked when timer reaches 0
   */
  async startTimer(
    roomId: string,
    durationSeconds: number,
    onExpiry: () => Promise<void>
  ): Promise<void> {
    // Guard: clear any existing timer for this room before starting a new one
    if (this.timers.has(roomId)) {
      this.clearTimer(roomId);
    }

    const deadlineMs = Date.now() + durationSeconds * 1_000;

    // Store absolute deadline in Redis — crash-safe
    await redis.set(
      REDIS_KEYS.timerDeadline(roomId),
      deadlineMs.toString(),
      'EX',
      durationSeconds + 60
    );

    // Emit first tick immediately (client shows full duration from the start)
    this.io.to(roomId).emit(SOCKET_EVENTS.TIMER_TICK, {
      roomId,
      secondsLeft: durationSeconds,
    });

    // setInterval fires the tick every second
    const interval = setInterval(async () => {
      const now = Date.now();
      const secondsLeft = Math.max(0, Math.ceil((deadlineMs - now) / 1_000));

      // Emit tick to all room members
      this.io
        .to(roomId)
        .emit(SOCKET_EVENTS.TIMER_TICK, { roomId, secondsLeft });

      if (secondsLeft <= 0) {
        // Timer expired — stop the interval and invoke the expiry callback
        this.clearTimer(roomId);
        await redis.del(REDIS_KEYS.timerDeadline(roomId));

        try {
          await onExpiry();
        } catch (err) {
          console.error(
            `[TimerService] onExpiry error for room ${roomId}:`,
            err
          );
        }
      }
    }, 1_000);

    this.timers.set(roomId, { interval, deadlineMs });
    console.info(
      `[TimerService] Started ${durationSeconds}s timer for room ${roomId}`
    );
  }

  /**
   * Reset the timer for a room (called when a bid is accepted).
   * Clears the existing interval and starts a new one at BID_RESET_TIMER_SECONDS (10s).
   */
  async resetTimer(
    roomId: string,
    onExpiry: () => Promise<void>
  ): Promise<void> {
    await this.startTimer(roomId, BID_RESET_TIMER_SECONDS, onExpiry);
    console.info(
      `[TimerService] Timer reset to ${BID_RESET_TIMER_SECONDS}s for room ${roomId} (bid accepted)`
    );
  }

  /**
   * Stop and remove the timer for a room.
   * Called when a player is resolved or auction ends.
   */
  clearTimer(roomId: string): void {
    const handle = this.timers.get(roomId);
    if (handle) {
      clearInterval(handle.interval);
      this.timers.delete(roomId);
      console.info(`[TimerService] Cleared timer for room ${roomId}`);
    }
  }

  /**
   * Get the remaining seconds for a room's timer.
   * Used by STATE_SYNC for reconnecting clients (reads from Redis, not in-memory).
   */
  async getRemainingSeconds(roomId: string): Promise<number> {
    const deadline = await redis.get(REDIS_KEYS.timerDeadline(roomId));
    if (!deadline) return 0;

    const remaining = (parseInt(deadline, 10) - Date.now()) / 1_000;
    return Math.max(0, Math.ceil(remaining));
  }

  /**
   * Pause the timer for a room.
   * Clears active interval, saves remaining time, emits paused events.
   */
  async pauseTimer(roomId: string): Promise<number> {
    const remainingSeconds = await this.getRemainingSeconds(roomId);
    this.clearTimer(roomId);
    if (remainingSeconds > 0) {
      await redis.set(
        `${REDIS_KEYS.timerDeadline(roomId)}:paused`,
        remainingSeconds.toString()
      );
      await redis.set(REDIS_KEYS.auctionState(roomId), 'paused');
      this.io.to(roomId).emit(SOCKET_EVENTS.TIMER_TICK, {
        roomId,
        secondsLeft: remainingSeconds,
      });
      this.io.to(roomId).emit('auction:paused', { secondsLeft: remainingSeconds });
    }
    return remainingSeconds;
  }

  /**
   * Resume a paused timer for a room.
   */
  async resumeTimer(
    roomId: string,
    onExpiry: () => Promise<void>
  ): Promise<void> {
    const pausedStr = await redis.get(
      `${REDIS_KEYS.timerDeadline(roomId)}:paused`
    );
    const remainingSeconds = pausedStr ? parseInt(pausedStr, 10) : 0;
    if (remainingSeconds > 0) {
      await redis.del(`${REDIS_KEYS.timerDeadline(roomId)}:paused`);
      await redis.set(REDIS_KEYS.auctionState(roomId), 'bidding');
      this.io.to(roomId).emit('auction:resumed', { secondsLeft: remainingSeconds });
      await this.startTimer(roomId, remainingSeconds, onExpiry);
    }
  }

  /**
   * Extend an active timer by extraSeconds (e.g. +15 seconds).
   */
  async extendTimer(
    roomId: string,
    extraSeconds: number,
    onExpiry: () => Promise<void>
  ): Promise<number> {
    const remainingSeconds = await this.getRemainingSeconds(roomId);
    const newDuration = remainingSeconds + extraSeconds;
    this.io.to(roomId).emit(SOCKET_EVENTS.TIMER_TICK, {
      roomId,
      secondsLeft: newDuration,
    });
    this.io.to(roomId).emit('auction:extended', { secondsLeft: newDuration });
    await this.startTimer(roomId, newDuration, onExpiry);
    return newDuration;
  }
}

/** Singleton timer service — ONE instance shared across all handlers */
let timerServiceInstance: TimerService | null = null;

export function getTimerService(io: Server): TimerService {
  if (!timerServiceInstance) {
    timerServiceInstance = new TimerService(io);
  }
  return timerServiceInstance;
}
