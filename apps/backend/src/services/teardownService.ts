/**
 * apps/backend/src/services/teardownService.ts
 *
 * MAJOR FUNCTION: Authoritative, idempotent manager teardown protocol.
 * Both explicit leave (HTTP / socket) and unexpected disconnect converge here.
 *
 * CORE INVARIANT:
 * "A disconnected manager cannot continue owning authoritative auction state."
 *
 * IDEMPOTENCY:
 * Safe against duplicate leave, disconnect + leave race, reconnect race.
 */
import type { Server } from 'socket.io';
import type { AuthenticatedSocket } from '../socket/middleware/socketAuth';
import { redis } from '../redis/client';
import { REDIS_KEYS } from '../redis/keys';
import {
  getRoomByIdOrCode,
  removeMemberFromRoom,
  getMembersForRoom,
} from '../db/queries/rooms';
import { HostDeadManService } from './hostDeadManService';
import { SOCKET_EVENTS } from '@ipl-auction/shared';

export interface TeardownResult {
  success: boolean;
  wasRemoved: boolean;
  wasHost: boolean;
  newHostUserId: string | null;
  remainingMemberCount: number;
}

export class TeardownService {
  /**
   * Single convergence point for all user departures.
   */
  static async teardownManager(
    roomIdOrCode: string,
    userId: string,
    io: Server,
    options?: {
      socket?: AuthenticatedSocket;
      username?: string;
      reason?: string;
    }
  ): Promise<TeardownResult> {
    // 1. Resolve room
    const room = await getRoomByIdOrCode(roomIdOrCode);
    if (!room) {
      return {
        success: false,
        wasRemoved: false,
        wasHost: false,
        newHostUserId: null,
        remainingMemberCount: 0,
      };
    }

    const roomId = room.id;
    const roomCode = room.invite_code;
    const username = options?.username || 'Participant';

    // 2. Idempotency lock via Redis (prevents concurrent double teardown)
    const lockKey = REDIS_KEYS.teardownLock(roomId, userId);
    let acquiredLock = false;
    try {
      const lockSet = await redis.set(lockKey, '1', 'PX', 3000, 'NX');
      acquiredLock = lockSet === 'OK';
    } catch {
      acquiredLock = true;
    }

    if (!acquiredLock) {
      console.info(
        `[TeardownService] Teardown already in progress for user ${userId} in room ${roomCode}`
      );
      return {
        success: true,
        wasRemoved: false,
        wasHost: room.host_user_id === userId,
        newHostUserId: null,
        remainingMemberCount: 0,
      };
    }

    try {
      console.info(
        `[TeardownService] Executing authoritative teardown for user ${userId} (${username}) in room ${roomCode} (${room.status})`
      );

      // 3. Remove/update DB membership
      const {
        wasRemoved,
        franchise,
        wasHost,
        newHostUserId,
        remainingMemberCount,
      } = await removeMemberFromRoom(roomId, userId);

      // 4. Update Redis presence
      try {
        await redis.hdel(REDIS_KEYS.presence(roomCode), userId);
      } catch (err) {
        console.warn('[TeardownService] Redis presence removal failed:', err);
      }

      // 5. If socket is provided, leave Socket.IO rooms
      if (options?.socket) {
        try {
          options.socket.leave(roomCode);
          options.socket.leave(roomId);
          delete options.socket.data.roomCode;
          delete options.socket.data.roomId;
          delete options.socket.data.franchise;
        } catch (err) {
          console.warn('[TeardownService] Error removing socket from room channels:', err);
        }
      }

      // 6. Handle active auction vs lobby state
      if (room.status === 'active' || room.status === 'waiting_host') {
        if (wasHost) {
          // Trigger Host Dead Man's Switch
          await HostDeadManService.handleHostDisconnect(roomId, userId, io);
        } else {
          // Normal participant exit in active auction — release any locks held
          try {
            await redis.del(REDIS_KEYS.bidLock(roomId));
          } catch {}
        }
      }

      // 7. Broadcast user_left event to all connected clients
      io.to(roomCode).to(roomId).emit(SOCKET_EVENTS.USER_LEFT, {
        userId,
        username,
        teamCode: franchise || undefined,
        newHostId: newHostUserId || undefined,
        memberCount: remainingMemberCount,
        message: `${username} has left the arena.`,
      });

      // 8. If in lobby state, broadcast updated participant list
      if (room.status === 'lobby') {
        const remainingMembers = await getMembersForRoom(roomId);
        const participants = remainingMembers.map((m) => ({
          userId: m.user_id,
          username: m.username,
          franchise: m.franchise as any,
          isHost: m.user_id === (newHostUserId || room.host_user_id),
        }));

        io.to(roomCode).to(roomId).emit('room:state_sync', {
          room: {
            id: room.id,
            roomCode: room.invite_code,
            status: room.status,
            hostUserId: newHostUserId || room.host_user_id,
          },
          participants,
        });
      }

      return {
        success: true,
        wasRemoved,
        wasHost,
        newHostUserId,
        remainingMemberCount,
      };
    } finally {
      try {
        await redis.del(lockKey);
      } catch {}
    }
  }
}
