/**
 * apps/backend/src/socket/handlers/roomHandler.ts
 *
 * MAJOR FUNCTION: Socket.IO event handlers for the room lifecycle.
 * Handles: room:join, room:franchise_select, room:start_auction.
 *
 * SYSTEM CONCEPT — Socket.IO Rooms (different from our auction rooms!):
 *   Socket.IO has its own concept of "rooms" — they're just named channels.
 *   socket.join('ABC123') adds this socket to the Socket.IO room named 'ABC123'.
 *   io.to('ABC123').emit('event') sends to ALL sockets in that Socket.IO room.
 *   Our auction room (invite code) maps 1:1 to a Socket.IO room name.
 *   This is the mechanism for broadcasting to all participants: join once, broadcast forever.
 *
 * SYSTEM CONCEPT — Belt-and-suspenders validation:
 *   The HTTP POST /rooms/join already verified membership.
 *   The socket room:join handler verifies AGAIN via DB query.
 *   Why: a bad actor could bypass the HTTP endpoint and emit room:join directly.
 *   The DB check in the socket handler ensures the user GENUINELY has a DB membership.
 *   Two independent checks, two different code paths — neither trusts the other.
 *
 * SYSTEM CONCEPT — Race condition in franchise selection:
 *   Two users simultaneously click "Mumbai Indians" (within the same millisecond).
 *   Node.js event loop processes them sequentially (not truly parallel).
 *   But BOTH read "franchise available" before either write completes.
 *   Without DB UNIQUE constraint: BOTH writes succeed → two users own MI (data corruption).
 *   With DB UNIQUE constraint: second write throws PostgreSQL error 23505.
 *   We catch 23505 specifically and emit room:franchise_claimed_error to the loser.
 *
 * SYSTEM CONCEPT — Presence via Redis HSET:
 *   Redis Hash `presence:{roomCode}` stores { userId: '1'|'0' }.
 *   1 = currently online, 0 = offline.
 *   On join: HSET presence:{roomCode} {userId} '1'
 *   On disconnect: HSET presence:{roomCode} {userId} '0'
 *   Why a Hash not individual keys: one HGETALL returns ALL presence data in one round trip.
 */
import type { Server } from 'socket.io';
import type { AuthenticatedSocket } from '../middleware/socketAuth';
import { SOCKET_EVENTS } from '@ipl-auction/shared';
import type {
  JoinRoomPayload,
  SelectFranchisePayload,
  StartAuctionPayload,
  LobbyParticipant,
} from '@ipl-auction/shared';
import {
  getRoomByCode,
  getMembersForRoom,
  isRoomMember,
  claimFranchise,
  allMembersHaveFranchise,
  updateRoomStatus,
} from '../../db/queries/rooms';
import { getAuctionEngine } from '../../services/auctionEngine';
import { redis } from '../../redis/client';
import { REDIS_KEYS } from '../../redis/keys';

/** Type guard for PostgreSQL 23505 unique violation errors */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === '23505'
  );
}

/**
 * Build a LobbyParticipant[] from DB members for broadcasting.
 * Used by both room:join and room:franchise_claimed handlers.
 */
async function buildParticipantList(
  roomId: string,
  hostUserId: string
): Promise<LobbyParticipant[]> {
  const members = await getMembersForRoom(roomId);
  return members.map((m) => ({
    userId: m.user_id,
    username: m.username,
    franchise: m.franchise as LobbyParticipant['franchise'],
    isHost: m.user_id === hostUserId,
  }));
}

/**
 * Register all room-related socket event handlers.
 * Called from socket/index.ts on every new authenticated connection.
 */
export function registerRoomHandlers(
  io: Server,
  socket: AuthenticatedSocket
): void {
  const { id: userId, username } = socket.data.user;

  // ─── room:join ─────────────────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.JOIN_ROOM, async (payload: JoinRoomPayload) => {
    try {
      const { roomCode } = payload;

      // 1. Verify room exists
      const room = await getRoomByCode(roomCode);
      if (!room) {
        socket.emit('room:error', { message: 'Room not found.' });
        return;
      }

      // 2. Belt-and-suspenders: verify user has a DB membership
      //    (they should have HTTP-joined first via POST /rooms/join)
      const isMember = await isRoomMember(room.id, userId);
      if (!isMember) {
        socket.emit('room:error', {
          message: 'You are not a member of this room.',
        });
        return;
      }

      // 3. Join BOTH Socket.IO channels:
      //    a. roomCode (e.g. "ABC123" - human invite code for lobby broadcasts)
      //    b. room.id (UUID - internal database ID used by AuctionEngine & TimerService)
      await socket.join(roomCode);
      await socket.join(room.id);

      // 4. Store roomCode and roomId on socket.data for use in all handlers
      socket.data.roomCode = roomCode;
      socket.data.roomId = room.id;

      // 5. Mark user as online in Redis presence hash.
      //    CRITICAL: Wrapped in try/catch — presence is a UI nice-to-have (online dot).
      //    A Redis outage must NEVER block a user from joining the lobby.
      //    The Socket.IO join (step 3) already succeeded — the user IS in the room.
      try {
        await redis.hset(REDIS_KEYS.presence(roomCode), userId, '1');
        await redis.expire(REDIS_KEYS.presence(roomCode), 7_200); // 2 hour TTL
      } catch (redisErr) {
        // Degraded mode: online indicator unavailable, join still succeeds
        console.warn(
          `[RoomHandler] Redis presence update failed for ${username} — continuing without presence tracking:`,
          (redisErr as Error).message
        );
      }

      // 6. Build updated participant list and broadcast to EVERYONE in the room
      const participants = await buildParticipantList(
        room.id,
        room.host_user_id
      );

      io.to(roomCode).emit(SOCKET_EVENTS.USER_JOINED, {
        participants,
        joinedUserId: userId,
        joinedUsername: username,
      });

      console.info(`[Room] ${username} joined socket room ${roomCode}`);
    } catch (err) {
      console.error('[RoomHandler] room:join error:', err);
      socket.emit('room:error', { message: 'Failed to join room channel.' });
    }
  });

  // ─── room:franchise_select ─────────────────────────────────────────────────
  socket.on(
    SOCKET_EVENTS.SELECT_FRANCHISE,
    async (payload: SelectFranchisePayload) => {
      try {
        const { roomCode, franchise } = payload;

        const room = await getRoomByCode(roomCode);
        if (!room) {
          socket.emit('room:error', { message: 'Room not found.' });
          return;
        }

        // Can only select franchise in lobby
        if (room.status !== 'lobby') {
          socket.emit('room:error', {
            message: 'Franchise selection is only available in the lobby.',
          });
          return;
        }

        // Attempt atomic franchise claim — may throw 23505 if race condition
        const claimed = await claimFranchise(room.id, userId, franchise);

        if (!claimed) {
          // User already has a franchise — they can't change it
          socket.emit('room:franchise_claimed_error', {
            message: 'You have already selected a franchise.',
          });
          return;
        }

        // Store franchise on socket.data for disconnect handler
        socket.data.franchise = franchise;

        // Broadcast updated participant list to the entire room
        const participants = await buildParticipantList(
          room.id,
          room.host_user_id
        );

        io.to(roomCode).emit(SOCKET_EVENTS.FRANCHISE_CLAIMED, {
          participants,
          claimedByUserId: userId,
          claimedByUsername: username,
          franchise,
        });

        console.info(
          `[Room] ${username} claimed ${franchise} in room ${roomCode}`
        );
      } catch (err) {
        if (isUniqueViolation(err)) {
          // SYSTEM CONCEPT — The DB constraint fired: another user claimed this franchise
          // in the ~1ms between our read and write. Belt-and-suspenders working perfectly.
          socket.emit('room:franchise_claimed_error', {
            message:
              'This franchise was just claimed by another player. Please select another.',
          });
          return;
        }
        console.error('[RoomHandler] franchise_select error:', err);
        socket.emit('room:error', { message: 'Failed to claim franchise.' });
      }
    }
  );

  // ─── room:start_auction ────────────────────────────────────────────────────
  socket.on(
    SOCKET_EVENTS.START_AUCTION,
    async (payload: StartAuctionPayload) => {
      try {
        const { roomCode } = payload;

        const room = await getRoomByCode(roomCode);
        if (!room) {
          socket.emit('room:error', { message: 'Room not found.' });
          return;
        }

        // Only the host can start the auction
        if (room.host_user_id !== userId) {
          socket.emit('room:error', {
            message: 'Only the room host can start the auction.',
          });
          return;
        }

        // Only from lobby state
        if (room.status !== 'lobby') {
          socket.emit('room:error', {
            message: 'Auction is not in lobby state.',
          });
          return;
        }

        // All members must have selected a franchise
        const allReady = await allMembersHaveFranchise(room.id);
        if (!allReady) {
          socket.emit('room:error', {
            message:
              'All participants must select a franchise before the auction can start.',
          });
          return;
        }

        // Transition room to active
        await updateRoomStatus(room.id, 'active');

        // Notify all participants that the auction is starting (3s countdown)
        io.to(roomCode).to(room.id).emit('room:auction_starting', {
          roomCode,
          countdownSeconds: 3,
          message: 'The auction is starting in 3 seconds!',
        });

        // Brief countdown pause before the engine fires
        await new Promise((resolve) => setTimeout(resolve, 3_000));

        // Start the AuctionEngine — initializes queue, franchise states, fires first player_up
        const engine = getAuctionEngine(room.id, io);
        engine.startAuction().catch((err) => {
          console.error(
            `[RoomHandler] AuctionEngine.startAuction failed for room ${roomCode}:`,
            err
          );
          io.to(roomCode).to(room.id).emit('room:error', {
            message: 'Failed to start auction engine. Please try again.',
          });
        });

        console.info(
          `[Room] Auction engine started in room ${roomCode} by host ${username}`
        );
      } catch (err) {
        console.error('[RoomHandler] start_auction error:', err);
        socket.emit('room:error', { message: 'Failed to start auction.' });
      }
    }
  );
}
