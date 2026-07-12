/**
 * room.types.ts
 *
 * MAJOR FUNCTION: Defines the Room session container and all its participants.
 * A Room is the top-level aggregate for one complete auction — it holds the invite code,
 * host identity, current state, and the queue position pointer.
 *
 * KEY TYPES:
 *   FranchiseName — the exhaustive allowlist of valid franchises (compile-time validation)
 *   RoomStatus    — the lifecycle state machine for an auction session
 *   Room          — the persistent room record (DB row)
 *   RoomMember    — the junction entity (user + room + franchise + wallet)
 *   LobbyParticipant — the lightweight presence record emitted over sockets
 */

/**
 * All 10 IPL 2025 franchises as string-literal union.
 *
 * DESIGN DECISION — Union type as allowlist:
 *   If `franchise` were typed as `string`, any arbitrary value would pass TypeScript's
 *   type checker. As a union, TypeScript rejects any value not in this exact set at
 *   compile time. The union IS the allowlist — no runtime check needed.
 *
 *   At runtime (for UI iteration), use the FRANCHISES array in constants/franchises.ts.
 *   These two constructs are complementary: union = compile-time safety, array = runtime data.
 */
export type FranchiseName =
  | 'Mumbai Indians'
  | 'Chennai Super Kings'
  | 'Royal Challengers Bengaluru'
  | 'Kolkata Knight Riders'
  | 'Sunrisers Hyderabad'
  | 'Delhi Capitals'
  | 'Rajasthan Royals'
  | 'Punjab Kings'
  | 'Lucknow Super Giants'
  | 'Gujarat Titans';

/**
 * Auction room lifecycle states.
 * Maps to the ENUM constraint in the `rooms` DB table.
 *
 * State machine (one-way, no backward transitions):
 *   lobby ──→ active ──→ completed
 *     │          │
 *   Participants  Auction engine
 *   join & pick   running
 *   franchise
 *
 * roomHandler.ts enforces: you cannot transition active → lobby.
 * This prevents re-opening an auction that has already started.
 */
export type RoomStatus = 'lobby' | 'active' | 'completed';

/**
 * The Room entity. Represents one auction session container.
 *
 * DESIGN DECISION — inviteCode as CHAR(6) not UUID:
 *   UUIDs are cryptographically secure but unreadable by humans.
 *   A user on a phone needs to type this code to join.
 *   6 alphanumeric chars = 36^6 ≈ 2.1 billion combinations.
 *   Collision probability for a typical app (<100 concurrent rooms) is negligible.
 *
 * currentQueuePosition is the primary pointer into the `auction_queue` table.
 * The auctionEngine increments this atomically after each player is resolved.
 */
export interface Room {
  readonly id: string; // UUID — Primary Key
  readonly inviteCode: string; // CHAR(6) — human-typeable join code
  readonly hostUserId: string; // FK → users.id — only host can start auction
  status: RoomStatus; // Mutable: changes as auction progresses
  currentQueuePosition: number; // Pointer into auction_queue. Starts at 0.
  readonly createdAt: Date;
  updatedAt: Date;
}

/**
 * RoomMember — the junction between a user and a room.
 * One user can join multiple rooms (as different franchises each time).
 * This entity holds the franchise selection and wallet state per room per user.
 *
 * walletRemainingLakhs starts at 12,000 (₹120 Cr) and decrements every time
 * this franchise wins a player. It is the primary balance sheet for bid validation.
 */
export interface RoomMember {
  readonly id: string; // UUID — Primary Key (room_members table)
  readonly roomId: string; // FK → rooms.id
  readonly userId: string; // FK → users.id
  readonly username: string; // Denormalized from users table for display speed
  franchise: FranchiseName | null; // null until franchise is selected in lobby
  walletRemainingLakhs: number; // Starts at 12000. Mutable — decrements on wins.
}

/**
 * Lightweight presence record emitted over sockets in the lobby.
 * Does NOT expose walletRemainingLakhs — that's private auction state.
 * Used by LobbyParticipants.tsx to render who's in the room.
 */
export interface LobbyParticipant {
  readonly userId: string;
  readonly username: string;
  franchise: FranchiseName | null;
  isHost: boolean;
}
