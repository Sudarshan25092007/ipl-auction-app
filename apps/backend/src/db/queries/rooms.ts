/**
 * apps/backend/src/db/queries/rooms.ts
 *
 * MAJOR FUNCTION: Repository for all SQL operations on rooms and room_members tables.
 * All room-related SQL lives here — routes and handlers call typed functions, not raw SQL.
 *
 * KEY DESIGN DECISIONS:
 *
 * 1. INVITE CODE GENERATION:
 *    We generate a 6-character uppercase alphanumeric code in application code (not SQL).
 *    Why: the DB has a UNIQUE constraint — if there's a collision (two rooms get same code),
 *    Postgres throws error 23505 which we catch and retry. Ultra-rare but handled.
 *
 * 2. ATOMIC FRANCHISE CLAIM (claimFranchise):
 *    The UPDATE only succeeds if franchise IS NULL for THIS user's row.
 *    The UNIQUE(room_id, franchise) DB constraint prevents another user from claiming
 *    the same franchise simultaneously. Race condition: two users click "Mumbai Indians":
 *      - User A: UPDATE ... → succeeds (franchise was NULL)
 *      - User B: INSERT violates UNIQUE → PostgreSQL error 23505
 *    roomHandler.ts catches 23505 → emits room:franchise_claimed_error to User B.
 *    This is the "belt AND suspenders" pattern — app logic + DB constraint.
 *
 * 3. getMembersForRoom uses LEFT JOIN to include room + user data in one query.
 *    Without JOIN: 1 query for members + N queries for usernames = N+1 problem.
 *    With JOIN: 1 query, O(1) round trips regardless of member count.
 */
import { pool } from '../client';
import type { RoomStatus } from '@ipl-auction/shared';

// ─── Types matching DB rows ────────────────────────────────────────────────────

export interface RoomRow {
  id: string;
  invite_code: string;
  host_user_id: string;
  status: RoomStatus;
  current_queue_position: number;
  created_at: Date;
  updated_at: Date;
}

export interface RoomMemberRow {
  id: string;
  room_id: string;
  user_id: string;
  username: string;        // Joined from users table
  franchise: string | null;
  wallet_remaining_lakhs: number;
  joined_at: Date;
}

// ─── Invite Code Generator ────────────────────────────────────────────────────

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 (ambiguous visually)

function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Create a new room. Retries on invite_code collision (extremely rare).
 * Returns the created room row.
 */
export async function createRoom(hostUserId: string): Promise<RoomRow> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const inviteCode = generateInviteCode();
    try {
      const result = await pool.query<RoomRow>(
        `INSERT INTO rooms (id, invite_code, host_user_id, status, current_queue_position, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'lobby', 0, NOW(), NOW())
         RETURNING *`,
        [inviteCode, hostUserId]
      );
      // Also add host as a room member automatically
      await pool.query(
        `INSERT INTO room_members (id, room_id, user_id, wallet_remaining_lakhs, joined_at)
         VALUES (gen_random_uuid(), $1, $2, 12000, NOW())`,
        [result.rows[0].id, hostUserId]
      );
      return result.rows[0];
    } catch (err: unknown) {
      if (isPostgresError(err) && err.code === '23505' && attempt < MAX_RETRIES - 1) {
        continue; // Invite code collision — retry with new code
      }
      throw err;
    }
  }
  throw new Error('Failed to generate a unique invite code after 3 attempts');
}

/**
 * Find a room by its invite code. Returns null if not found.
 * Used by: POST /rooms/join, socket room:join handler.
 */
export async function getRoomByCode(inviteCode: string): Promise<RoomRow | null> {
  const result = await pool.query<RoomRow>(
    `SELECT * FROM rooms WHERE invite_code = $1 LIMIT 1`,
    [inviteCode.toUpperCase().trim()]
  );
  return result.rows[0] ?? null;
}

/**
 * Find a room by its UUID. Used for host verification.
 */
export async function getRoomById(roomId: string): Promise<RoomRow | null> {
  const result = await pool.query<RoomRow>(
    `SELECT * FROM rooms WHERE id = $1 LIMIT 1`,
    [roomId]
  );
  return result.rows[0] ?? null;
}

/**
 * Update room status. Validates the transition is forward-only.
 * lobby → active → completed. Cannot go backwards.
 */
export async function updateRoomStatus(
  roomId: string,
  newStatus: RoomStatus
): Promise<void> {
  await pool.query(
    `UPDATE rooms SET status = $1, updated_at = NOW() WHERE id = $2`,
    [newStatus, roomId]
  );
}

/**
 * Add a user to a room as a member.
 * Idempotent: ON CONFLICT DO NOTHING means calling it twice doesn't error.
 * Returns the room_member row (existing or newly created).
 */
export async function addMemberToRoom(
  roomId: string,
  userId: string
): Promise<void> {
  await pool.query(
    `INSERT INTO room_members (id, room_id, user_id, wallet_remaining_lakhs, joined_at)
     VALUES (gen_random_uuid(), $1, $2, 12000, NOW())
     ON CONFLICT (room_id, user_id) DO NOTHING`,
    [roomId, userId]
  );
}

/**
 * Get all members of a room with their usernames.
 * LEFT JOIN on users table — one query, no N+1 problem.
 * Ordered by joined_at so the lobby list is stable.
 */
export async function getMembersForRoom(roomId: string): Promise<RoomMemberRow[]> {
  const result = await pool.query<RoomMemberRow>(
    `SELECT
       rm.id,
       rm.room_id,
       rm.user_id,
       u.username,
       rm.franchise,
       rm.wallet_remaining_lakhs,
       rm.joined_at
     FROM room_members rm
     JOIN users u ON u.id = rm.user_id
     WHERE rm.room_id = $1
     ORDER BY rm.joined_at ASC`,
    [roomId]
  );
  return result.rows;
}

/**
 * Check if a specific user is already a member of a room.
 * Used for belt-and-suspenders check in socket room:join handler.
 */
export async function isRoomMember(roomId: string, userId: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2
     ) AS exists`,
    [roomId, userId]
  );
  return result.rows[0]?.exists ?? false;
}

/**
 * Atomically claim a franchise for a user.
 * The DB-level UNIQUE(room_id, franchise) constraint makes this race-safe.
 *
 * HOW IT WORKS:
 *   UPDATE only runs if: user IS in this room AND user has NOT claimed a franchise yet.
 *   If two users simultaneously try to claim "Mumbai Indians":
 *     - First one: UPDATE succeeds → franchise set
 *     - Second one: tries to INSERT-via-UPDATE → UNIQUE constraint violation → PG error 23505
 *   Caller catches 23505 and emits room:franchise_claimed_error.
 *
 * Returns: true if claim was successful, false if user already has a franchise.
 */
export async function claimFranchise(
  roomId: string,
  userId: string,
  franchise: string
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE room_members
     SET franchise = $3
     WHERE room_id = $1
       AND user_id = $2
       AND franchise IS NULL`,
    [roomId, userId, franchise]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Check if all members in a room have selected a franchise.
 * Used by roomHandler before allowing the host to start the auction.
 */
export async function allMembersHaveFranchise(roomId: string): Promise<boolean> {
  const result = await pool.query<{ unselected: string }>(
    `SELECT COUNT(*) AS unselected
     FROM room_members
     WHERE room_id = $1 AND franchise IS NULL`,
    [roomId]
  );
  return parseInt(result.rows[0]?.unselected ?? '0', 10) === 0;
}

export interface SquadPlayerRecord {
  franchise: string;
  price_paid_lakhs: number;
  player_id: string;
  player_name: string;
  category: string;
  role: string;
  nationality: string;
  is_marquee: boolean;
  is_capped: boolean;
  base_price_lakhs: number;
}

export async function getSquadPlayersForRoom(roomId: string): Promise<SquadPlayerRecord[]> {
  const result = await pool.query<SquadPlayerRecord>(
    `SELECT rm.franchise, sp.price_paid_lakhs, p.id AS player_id, p.name AS player_name,
            p.category, p.role, p.nationality, p.is_marquee, p.is_capped, p.base_price_lakhs
     FROM squad_players sp
     JOIN room_members rm ON sp.room_member_id = rm.id
     JOIN players p ON sp.player_id = p.id
     WHERE rm.room_id = $1
     ORDER BY sp.acquired_at ASC`,
    [roomId]
  );
  return result.rows;
}

/** Type guard for PostgreSQL errors */
function isPostgresError(err: unknown): err is { code: string; message: string } {
  return typeof err === 'object' && err !== null && 'code' in err;
}
