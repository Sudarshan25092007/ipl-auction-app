/**
 * socket.events.ts
 *
 * MAJOR FUNCTION: The complete Socket.IO API contract for the entire system.
 * Every event name and every payload shape is defined here.
 *
 * SYSTEM CONCEPT — No magic strings, ever:
 *   Without this file, a developer writes: socket.emit('auction:bid_palced', ...)
 *   (note the typo). The backend listens on 'auction:bid_placed'. The event is
 *   silently dropped — no error, no feedback. Classic distributed system silent failure.
 *
 *   With SOCKET_EVENTS constants: socket.emit(SOCKET_EVENTS.BID_PLACED, ...)
 *   A typo in the constant name → TypeScript compile error. Caught immediately.
 *
 * SYSTEM CONCEPT — `as const` for literal types:
 *   Without `as const`: SOCKET_EVENTS.BID_PLACED has type `string`
 *   With `as const`:    SOCKET_EVENTS.BID_PLACED has type `'auction:bid_placed'`
 *   The literal type allows TypeScript to do exhaustive checks on switch statements
 *   over event names — missing a case is a compile error, not a runtime bug.
 *
 * CONVENTION:
 *   Client → Server: describe the action (bid_placed, franchise_select)
 *   Server → Client: describe what changed (bid_update, player_sold)
 */

import type { Player } from './player.types';
import type { FranchiseName } from './room.types';
import type { BidRejectionReason } from './bid.types';
import type { SquadSummary, FranchiseState } from './squad.types';

// ─── Event Name Constants ──────────────────────────────────────────────────────

export const SOCKET_EVENTS = {
  // ─── Client → Server ──────────────────────────────────────────────────────
  BID_PLACED:         'auction:bid_placed',    // Bidder sends a bid attempt
  JOIN_ROOM:          'room:join',              // Client joins a room socket channel
  SELECT_FRANCHISE:   'room:franchise_select',  // Participant claims a franchise
  START_AUCTION:      'room:start_auction',     // Host-only: begins the auction

  // ─── Server → Room (broadcast to all members) ─────────────────────────────
  PLAYER_UP:          'auction:player_up',      // New player on the block
  BID_UPDATE:         'auction:bid_update',     // A bid was accepted — new leader
  TIMER_TICK:         'auction:timer_tick',     // Countdown tick (every 1 second)
  PLAYER_SOLD:        'auction:player_sold',    // Timer expired, player has a winner
  PLAYER_UNSOLD:      'auction:player_unsold',  // Timer expired, no valid bids
  USER_JOINED:        'room:user_joined',       // Someone connected to lobby
  FRANCHISE_CLAIMED:  'room:franchise_claimed', // Someone picked a franchise
  PHASE_TRANSITION:   'auction:phase_transition', // Marquee → General round
  AUCTION_COMPLETE:   'auction:complete',       // All players processed

  // ─── Server → Client (private — emitted to one specific socket) ───────────
  BID_REJECTED:       'auction:bid_rejected',  // Validation failed — only bidder sees this
  STATE_SYNC:         'auction:state_sync',    // Full state snapshot for reconnecting clients
} as const;

/** Helper: derive the union of all socket event name string values */
export type SocketEventName = typeof SOCKET_EVENTS[keyof typeof SOCKET_EVENTS];

// ─── Client → Server Payloads ──────────────────────────────────────────────────

export interface BidPlacedPayload {
  roomCode: string;
  playerId: string;
  /**
   * Integer lakhs. Validated server-side:
   *   - Must be > currentBidLakhs (to beat the current leader)
   *   - Must be >= player.basePriceLakhs (no bids below floor)
   */
  amountLakhs: number;
}

export interface JoinRoomPayload {
  roomCode: string;
}

export interface SelectFranchisePayload {
  roomCode: string;
  franchise: FranchiseName;
}

export interface StartAuctionPayload {
  roomCode: string;
}

// ─── Server → Client Payloads ──────────────────────────────────────────────────

/**
 * Emitted when the auction engine advances to a new player.
 * Frontend: renders PlayerCard, starts CountdownRing, clears BidHistoryFeed.
 */
export interface PlayerUpPayload {
  player: Player;
  queuePosition: number;     // e.g., 3 → "Player 3 of 94"
  queueTotal: number;        // Total players in the queue
  phase: 'marquee' | 'general';
  timerSeconds: number;      // Initial countdown value
}

/**
 * Emitted when a bid passes ALL validation checks.
 * ALL clients update their UI to show the new bid leader.
 * `timestamp` is unix ms — used by BidHistoryFeed to order entries.
 */
export interface BidUpdatePayload {
  playerId: string;
  newBidLakhs: number;
  newBidder: FranchiseName;
  timestamp: number;         // Date.now() at moment of bid acceptance
}

/**
 * Emitted every second by timerService.
 * Frontend CountdownRing and SoldOverlay subscribe to this.
 */
export interface TimerTickPayload {
  roomId: string;
  secondsLeft: number;
}

/**
 * Emitted when timer hits 0 and a winning bid exists.
 * winningFranchise is null if no bids met the base price (player unsold).
 * updatedSquad is a lean summary — full squad via REST.
 */
export interface PlayerSoldPayload {
  player: Player;
  finalPriceLakhs: number;
  winningFranchise: FranchiseName | null;  // null = player went unsold
  updatedSquad: SquadSummary;
}

/**
 * Emitted PRIVATELY to the socket that placed the failing bid.
 * Other clients do NOT see this — they only see the absence of a BidUpdatePayload.
 * `humanMessage` is display-ready for a toast notification.
 */
export interface BidRejectedPayload {
  reason: BidRejectionReason;
  humanMessage: string;
}

/**
 * Emitted when all marquee players are sold and the general round begins.
 * Frontend shows a 5-second full-screen interstitial before continuing.
 */
export interface PhaseTransitionPayload {
  from: 'marquee';
  to: 'general';
  remainingBudgetsSummary: Array<{
    franchise: FranchiseName;
    walletRemainingLakhs: number;
  }>;
}

/**
 * SYSTEM CONCEPT — Reconnection Recovery via State Sync:
 *   When a client disconnects and reconnects, it has lost all Zustand store state.
 *   The sequence:
 *     1. Socket reconnects → backend receives 'connect' event
 *     2. Backend reads FULL auction state from Redis (~0.3ms)
 *     3. Backend emits STATE_SYNC privately to the reconnecting socket
 *     4. Frontend's useAuction hook receives it → calls store.syncState(payload)
 *     5. Zustand replaces entire state with the snapshot
 *   From the user's perspective, they "snap back" instantly.
 *
 *   CRITICAL: The timer deadline is stored as an absolute Unix timestamp in Redis
 *   (not a relative countdown). So `secondsLeft` is computed as:
 *     (timerDeadline - Date.now()) / 1000
 *   This means the server crashes and restarts → timer resumes from correct position.
 *   Storing `secondsLeft = 15` would reset to 15 on every reconnect (cheat vector).
 */
export interface StateSyncPayload {
  currentPlayer: Player | null;
  currentBidLakhs: number;
  currentBidder: FranchiseName | null;
  secondsLeft: number;
  auctionPhase: 'marquee' | 'general';
  auctionState: 'idle' | 'player_up' | 'bidding' | 'sold' | 'complete';
  myFranchiseState: FranchiseState;
  queuePosition: number;
  queueTotal: number;
}
