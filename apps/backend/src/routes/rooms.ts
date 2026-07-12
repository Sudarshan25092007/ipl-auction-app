/**
 * apps/backend/src/routes/rooms.ts
 *
 * MAJOR FUNCTION: REST endpoints for room lifecycle management.
 *   POST /rooms       — Create a room (host flow)
 *   POST /rooms/join  — Join a room via invite code (participant flow)
 *   GET  /rooms/:code — Get room data + member list (lobby initial load)
 *
 * ALL routes are protected by jwtAuth middleware (registered in app.ts).
 * req.user.sub = the authenticated user's UUID from the JWT.
 *
 * DESIGN DECISION — REST for room creation/joining, Sockets for lobby state:
 *   Creating/joining a room is an infrequent, one-time action per session.
 *   REST is appropriate: it's stateless, cacheable, and returns a clear response.
 *   After joining, the lobby state (who's online, who claimed which franchise)
 *   is real-time and pushed via Socket.IO (room:user_joined events).
 *   Two transports, right tool for each job.
 *
 * STATUS CODE DECISIONS:
 *   201 Created for POST /rooms (new resource created)
 *   200 OK for POST /rooms/join (joining = membership update, not new room resource)
 *   409 Conflict for joining a non-lobby room (already active/completed)
 */
import { Router, type Router as ExpressRouter } from 'express';
import { jwtAuth } from '../middleware/auth';
import {
  createRoom,
  getRoomByCode,
  addMemberToRoom,
  getMembersForRoom,
  isRoomMember,
  type SquadPlayerRecord,
} from '../db/queries/rooms';
import type { LobbyParticipant, Player } from '@ipl-auction/shared';

export const roomsRouter: ExpressRouter = Router();

// All room routes require authentication
roomsRouter.use(jwtAuth);

// ─── POST /rooms — Create a new auction room ─────────────────────────────────
roomsRouter.post('/', async (req, res) => {
  try {
    const hostUserId = req.user!.sub; // jwtAuth guarantees req.user is set

    const room = await createRoom(hostUserId);

    console.info(
      `[Rooms] Room created: ${room.invite_code} by user ${hostUserId}`
    );

    res.status(201).json({
      roomId: room.id,
      roomCode: room.invite_code,
      status: room.status,
      hostUserId: room.host_user_id,
    });
  } catch (err) {
    console.error('[Rooms] Create room error:', err);
    res.status(500).json({ error: 'Failed to create room. Please try again.' });
  }
});

// ─── POST /rooms/join — Join a room via invite code ──────────────────────────
roomsRouter.post('/join', async (req, res) => {
  try {
    const userId = req.user!.sub;
    const { inviteCode } = req.body as { inviteCode: unknown };

    if (typeof inviteCode !== 'string' || inviteCode.trim().length !== 6) {
      res
        .status(400)
        .json({ error: 'Invite code must be exactly 6 characters.' });
      return;
    }

    const room = await getRoomByCode(inviteCode);

    if (!room) {
      res.status(404).json({
        error: 'Room not found. Check the invite code and try again.',
      });
      return;
    }

    // Can only join rooms in lobby state
    if (room.status !== 'lobby') {
      res.status(409).json({
        error: `Cannot join — this room's auction is already ${room.status}.`,
      });
      return;
    }

    // Check if already a member (idempotent join — not an error)
    const alreadyMember = await isRoomMember(room.id, userId);
    if (!alreadyMember) {
      await addMemberToRoom(room.id, userId);
    }

    console.info(`[Rooms] User ${userId} joined room ${room.invite_code}`);

    res.json({
      roomId: room.id,
      roomCode: room.invite_code,
      status: room.status,
      hostUserId: room.host_user_id,
      alreadyMember,
    });
  } catch (err) {
    console.error('[Rooms] Join room error:', err);
    res.status(500).json({ error: 'Failed to join room. Please try again.' });
  }
});

// ─── GET /rooms/:code — Get room data and member list ────────────────────────
roomsRouter.get('/:code', async (req, res) => {
  try {
    const userId = req.user!.sub;
    const { code } = req.params;

    const room = await getRoomByCode(code);

    if (!room) {
      res.status(404).json({ error: 'Room not found.' });
      return;
    }

    // Verify requester is a member of the room (access control)
    const isMember = await isRoomMember(room.id, userId);
    if (!isMember) {
      res.status(403).json({ error: 'You are not a member of this room.' });
      return;
    }

    const members = await getMembersForRoom(room.id);

    // Map DB rows to LobbyParticipant shape for the frontend
    const participants: LobbyParticipant[] = members.map((m) => ({
      userId: m.user_id,
      username: m.username,
      franchise: m.franchise as LobbyParticipant['franchise'],
      isHost: m.user_id === room.host_user_id,
    }));

    res.json({
      room: {
        id: room.id,
        roomCode: room.invite_code,
        status: room.status,
        hostUserId: room.host_user_id,
        currentQueuePosition: room.current_queue_position,
        createdAt: room.created_at,
      },
      participants,
    });
  } catch (err) {
    console.error('[Rooms] Get room error:', err);
    res.status(500).json({ error: 'Failed to load room data.' });
  }
});

// ─── GET /rooms/:code/squads — Get all squads for a room ──────────────────────
roomsRouter.get('/:code/squads', async (req, res) => {
  try {
    const userId = req.user!.sub;
    const { code } = req.params;

    const room = await getRoomByCode(code);
    if (!room) {
      res.status(404).json({ error: 'Room not found.' });
      return;
    }

    const isMember = await isRoomMember(room.id, userId);
    if (!isMember) {
      res.status(403).json({ error: 'You are not a member of this room.' });
      return;
    }

    const { getSquadPlayersForRoom } = await import('../db/queries/rooms');
    const records = await getSquadPlayersForRoom(room.id);

    // Group records by franchise
    interface SquadPlayerItem {
      pricePaidLakhs: number;
      player: Player;
    }
    const squads = {} as Record<string, SquadPlayerItem[]>;
    records.forEach((rec: SquadPlayerRecord) => {
      if (!squads[rec.franchise]) {
        squads[rec.franchise] = [];
      }
      squads[rec.franchise].push({
        pricePaidLakhs: rec.price_paid_lakhs,
        player: {
          id: rec.player_id,
          name: rec.player_name,
          category: rec.category,
          role: rec.role as Player['role'],
          nationality: rec.nationality as Player['nationality'],
          isMarquee: rec.is_marquee,
          isCapped: rec.is_capped,
          basePriceLakhs: rec.base_price_lakhs,
        },
      });
    });

    res.json({ squads });
  } catch (err) {
    console.error('[Rooms] Get squads error:', err);
    res.status(500).json({ error: 'Failed to load squads.' });
  }
});
