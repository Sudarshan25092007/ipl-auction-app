/**
 * apps/backend/src/socket/handlers/disconnectHandler.ts
 *
 * MAJOR FUNCTION: Handles socket disconnect events — marks user offline in Redis presence,
 * and emits room:user_left to the room if the user stays offline for 60 seconds.
 *
 * SYSTEM CONCEPT — Graceful disconnect vs Permanent leave:
 *   Mobile users frequently lose signal, close the tab, or switch apps.
 *   A transient disconnect should NOT remove them from the room or the auction.
 *   They might reconnect in 5 seconds.
 *   ONLY after 60 seconds of absence do we emit room:user_left (UI shows them as gone).
 *   The DB membership is NEVER deleted on disconnect — only on explicit "leave room" action.
 *
 * SYSTEM CONCEPT — Redis presence vs DB membership:
 *   DB (room_members table): permanent membership record. Never deleted on disconnect.
 *   Redis (presence hash): ephemeral online/offline status. Cheap to update (~0.1ms).
 *   UI uses presence: show green dot for online, grey for offline.
 *   Auction uses DB: bid validation reads room_members.wallet_remaining_lakhs from DB.
 *
 * SYSTEM CONCEPT — setTimeout + Redis for delayed emit:
 *   On disconnect, we set a 60-second timer.
 *   If the user reconnects within 60s → they call room:join → Redis marks them online again.
 *   When the timer fires → we check Redis: still offline? → emit room:user_left.
 *   This is "delayed consequence" — the event is deferred, not immediate.
 *   Production systems use Redis keyspace notifications or a job queue for this.
 *   For simplicity: Node.js setTimeout (acceptable for single-server Phase 3).
 *
 * PHASE 4 NOTE:
 *   If a user disconnects while holding the bid lock, the lock auto-expires after
 *   5 seconds (BID_LOCK_TTL_MS). The SETNX pattern's TTL prevents stuck locks.
 */
import type { Server } from 'socket.io';
import type { AuthenticatedSocket } from '../middleware/socketAuth';
import { redis } from '../../redis/client';
import { REDIS_KEYS } from '../../redis/keys';

const OFFLINE_GRACE_MS = 60_000; // 60 seconds before emitting user_left

/**
 * Register the disconnect handler for a specific socket.
 * Called from socket/index.ts inside io.on('connection').
 */
export function registerDisconnectHandler(io: Server, socket: AuthenticatedSocket): void {
  const { id: userId, username } = socket.data.user;

  socket.on('disconnect', async (reason) => {
    const roomCode = socket.data.roomCode;

    console.info(`[Disconnect] ${username} disconnected. Reason: ${reason}. Room: ${roomCode ?? 'none'}`);

    if (!roomCode) return; // User disconnected before joining a room

    // Mark user as offline in Redis presence hash.
    // Wrapped in try/catch — Redis outage must never throw in the disconnect path.
    try {
      await redis.hset(REDIS_KEYS.presence(roomCode), userId, '0');
    } catch (redisErr) {
      console.warn('[DisconnectHandler] Redis presence offline mark failed — skipping:', (redisErr as Error).message);
    }

    // Deferred emit: only announce user_left if still offline after 60s
    setTimeout(async () => {
      try {
        // Check current presence status
        const presenceValue = await redis.hget(REDIS_KEYS.presence(roomCode), userId);

        // presenceValue === '1' means they reconnected — do nothing
        if (presenceValue !== '0') return;

        // Still offline after 60s — broadcast to room
        io.to(roomCode).emit('room:user_left', {
          userId,
          username,
          message: `${username} has left the room.`,
        });

        console.info(`[Disconnect] ${username} confirmed offline after 60s grace period.`);
      } catch (err) {
        console.warn('[DisconnectHandler] Delayed user_left Redis check failed — skipping:', (err as Error).message);
      }
    }, OFFLINE_GRACE_MS);
  });
}
