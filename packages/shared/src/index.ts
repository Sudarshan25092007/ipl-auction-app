/**
 * index.ts — The Public API Barrel for @ipl-auction/shared
 *
 * MAJOR FUNCTION: Single entry point for all shared types, constants, and validators.
 * Consumers import from '@ipl-auction/shared' — never from deep file paths.
 *
 * WHY A BARREL:
 *   Without barrel: import { Player } from '@ipl-auction/shared/src/types/player.types'
 *   With barrel:    import { Player } from '@ipl-auction/shared'
 *
 *   The barrel is the PUBLIC API. Internal file structure can be refactored
 *   without breaking any consumer — only the barrel needs to update.
 *   This is the "interface segregation" principle at the module level.
 */

// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  Player,
  PlayerRole,
  PlayerNationality,
  PlayerCategory,
} from './types/player.types';

// Auth types — JWT payload contract shared between backend (signing) and frontend (decoding)
export type { JwtPayload, AuthenticatedUser } from './types/auth.types';

export type {
  FranchiseName,
  RoomStatus,
  Room,
  RoomMember,
  LobbyParticipant,
} from './types/room.types';

export type {
  BidRejectionReason,
  Bid,
  BidValidationResult,
  BidIntent,
} from './types/bid.types';

export type {
  FranchiseState,
  SquadPlayer,
  Squad,
  SquadSummary,
} from './types/squad.types';

export { SOCKET_EVENTS } from './types/socket.events';
export type {
  SocketEventName,
  BidPlacedPayload,
  JoinRoomPayload,
  SelectFranchisePayload,
  StartAuctionPayload,
  PlayerUpPayload,
  BidUpdatePayload,
  TimerTickPayload,
  PlayerSoldPayload,
  BidRejectedPayload,
  PhaseTransitionPayload,
  StateSyncPayload,
} from './types/socket.events';

// ─── Constants ────────────────────────────────────────────────────────────────
export { FRANCHISES, FRANCHISE_MAP } from './constants/franchises';
export type { FranchiseMeta } from './constants/franchises';

export {
  WALLET_TOTAL_LAKHS,
  SQUAD_MAX_SIZE,
  OVERSEAS_MAX,
  WK_MAX,
  WK_MIN,
  TIER_25_PLUS_THRESHOLD_LAKHS,
  TIER_25_PLUS_MAX,
  TIER_20_25_UPPER_LAKHS,
  TIER_20_25_LOWER_LAKHS,
  TIER_20_25_MAX,
  TIER_15_20_UPPER_LAKHS,
  TIER_15_20_LOWER_LAKHS,
  TIER_15_20_MAX,
  AUCTION_TIMER_SECONDS,
  BID_RESET_TIMER_SECONDS,
  SOLD_PAUSE_MS,
  RATE_LIMIT_BID_MAX,
  RATE_LIMIT_WINDOW_MS,
  BID_LOCK_TTL_MS,
} from './constants/auction';

// ─── Validators ───────────────────────────────────────────────────────────────
export {
  canBid,
  getBidRejectionMessage,
  getBidIncrement,
} from './validators/bidEligibility';
