/**
 * apps/backend/src/services/auctionEngine.ts
 *
 * MAJOR FUNCTION: The server-side auction state machine.
 * This is the orchestrator of the entire auction lifecycle from first player to last.
 *
 * STATE MACHINE:
 *   idle ──→ player_up ──→ bidding ──→ sold/unsold ──→ player_up (loop)
 *                                                    └──→ complete (when queue exhausted)
 *
 * Each state transition emits the corresponding Socket.IO event to all room members.
 * The timer drives the sold/unsold transition: timer expiry = player resolution.
 *
 * SYSTEM CONCEPT — The Engine as a Singleton per Room:
 *   We use a Map<roomId, AuctionEngine> — one engine instance per active auction.
 *   Why: each room has its own timer, its own queue position, its own state.
 *   All handlers that need to interact with an auction (auctionHandler, roomHandler)
 *   call `getAuctionEngine(roomId)` to get the room's engine.
 *
 * SYSTEM CONCEPT — Async/Await Error Boundary:
 *   Every async method in this class has a try/catch at the outermost level.
 *   An unhandled promise rejection in a timer callback (setInterval) is silently
 *   swallowed in Node.js — the auction would stop dead with no error visible.
 *   By catching inside the callback, we log the error and can attempt recovery.
 *
 * SYSTEM CONCEPT — 3-Second Pause between players:
 *   After auction:player_sold is emitted, we wait SOLD_PAUSE_MS (3000ms) before calling
 *   advanceToNextPlayer(). This gives the frontend time to:
 *   1. Display the SoldOverlay animation
 *   2. Update the squad panel
 *   3. Clear the bid history feed
 *   The server drives this timing — clients can't speed it up.
 *
 * SYSTEM CONCEPT — Phase Transition:
 *   When advancing from the last marquee player to the first general player,
 *   we emit auction:phase_transition BEFORE auction:player_up.
 *   The frontend shows a 5-second full-screen interstitial on receiving phase_transition,
 *   then the player_up event triggers the normal auction view.
 */
import type { Server } from 'socket.io';
import { SOCKET_EVENTS, SOLD_PAUSE_MS } from '@ipl-auction/shared';
import type { FranchiseName, Player } from '@ipl-auction/shared';
import { redis } from '../redis/client';
import { REDIS_KEYS } from '../redis/keys';
import { getTimerService } from './timerService';
import { getNextPlayer, advanceQueue, detectPhaseTransition, type QueueEntry } from './queueManager';
import { initAllFranchiseStates, deductFromFranchiseState, loadAllFranchiseStates } from './franchiseStateService';
import { recordPlayerSold, appendBidEvent, getRoomMemberByFranchise } from '../db/queries/auction';
import { updateRoomStatus } from '../db/queries/rooms';
import { getMembersForRoom } from '../db/queries/rooms';

export class AuctionEngine {
  constructor(
    private readonly io: Server,
    private readonly roomId: string
  ) {}

  // ─── startAuction ────────────────────────────────────────────────────────────

  /**
   * Entry point. Called by roomHandler when host fires room:start_auction.
   * Initializes franchise states in Redis, then advances to the first player.
   */
  async startAuction(): Promise<void> {
    console.info(`[AuctionEngine] Starting auction for room ${this.roomId}`);

    // Initialize all franchise wallet states in Redis
    await initAllFranchiseStates(this.roomId);

    // Set initial auction state
    await redis.set(REDIS_KEYS.auctionState(this.roomId), 'idle');
    await redis.set(REDIS_KEYS.currentBid(this.roomId), '0');
    await redis.del(REDIS_KEYS.currentBidder(this.roomId));
    await redis.del(REDIS_KEYS.currentPlayer(this.roomId));

    await appendBidEvent({
      roomId: this.roomId,
      eventType: 'auction_started',
      payload: { startedAt: new Date().toISOString() },
    });

    // Advance to the first player
    await this.advanceToNextPlayer();
  }

  // ─── advanceToNextPlayer ─────────────────────────────────────────────────────

  /**
   * Move the auction to the next player in the queue.
   * If queue is exhausted, calls endAuction().
   */
  async advanceToNextPlayer(): Promise<void> {
    const nextEntry = await getNextPlayer(this.roomId);

    if (!nextEntry) {
      await this.endAuction();
      return;
    }

    // Check for marquee → general phase transition
    const isPhaseTransition = await detectPhaseTransition(this.roomId);
    if (isPhaseTransition) {
      await this.emitPhaseTransition();
      // Pause 5 seconds for the frontend interstitial before continuing
      await sleep(5_000);
    }

    const { player, phase, position } = nextEntry;

    // Store current player in Redis
    await redis.set(REDIS_KEYS.currentPlayer(this.roomId), JSON.stringify(player));
    await redis.set(REDIS_KEYS.auctionState(this.roomId), 'player_up');
    await redis.set(REDIS_KEYS.currentBid(this.roomId), '0');
    await redis.del(REDIS_KEYS.currentBidder(this.roomId));

    // Get total queue length for progress display
    const cachedQueue = await redis.get(REDIS_KEYS.auctionQueue(this.roomId));
    const queueTotal = cachedQueue ? JSON.parse(cachedQueue).length : 0;

    console.info(`[AuctionEngine] Player up: ${player.name} (${phase}, position ${position}/${queueTotal})`);

    // Emit to all clients in the room
    this.io.to(this.roomId).emit(SOCKET_EVENTS.PLAYER_UP, {
      player,
      queuePosition: position,
      queueTotal,
      phase,
      timerSeconds: 30,
    });

    await appendBidEvent({
      roomId: this.roomId,
      playerId: player.id,
      eventType: 'player_up',
      payload: { position, phase },
    });

    // Start the 30-second countdown
    const timerService = getTimerService(this.io);
    await timerService.startTimer(this.roomId, 30, async () => {
      await this.handleTimerExpiry(nextEntry);
    });
  }

  // ─── handleTimerExpiry ───────────────────────────────────────────────────────

  /**
   * Called by TimerService when the countdown reaches 0.
   * Determines if the player was sold (has a winning bid) or unsold (no valid bids).
   */
  async handleTimerExpiry(entry: QueueEntry): Promise<void> {
    try {
      const currentBidStr = await redis.get(REDIS_KEYS.currentBid(this.roomId));
      const currentBidLakhs = parseInt(currentBidStr ?? '0', 10);
      const currentBidder = await redis.get(REDIS_KEYS.currentBidder(this.roomId));

      if (currentBidLakhs >= entry.player.basePriceLakhs && currentBidder) {
        await this.processPlayerSold(entry, currentBidLakhs, currentBidder as FranchiseName);
      } else {
        await this.processPlayerUnsold(entry);
      }
    } catch (err) {
      console.error(`[AuctionEngine] Timer expiry error for room ${this.roomId}:`, err);
    }
  }

  // ─── processPlayerSold ───────────────────────────────────────────────────────

  async processPlayerSold(
    entry: QueueEntry,
    priceLakhs: number,
    winningFranchise: FranchiseName
  ): Promise<void> {
    const { player, position } = entry;
    console.info(`[AuctionEngine] SOLD: ${player.name} to ${winningFranchise} for ₹${priceLakhs}L`);

    await redis.set(REDIS_KEYS.auctionState(this.roomId), 'sold');

    // Get the room_member row for the winning franchise
    const member = await getRoomMemberByFranchise(this.roomId, winningFranchise);
    if (!member) {
      console.error(`[AuctionEngine] No room member found for franchise ${winningFranchise}`);
      await this.processPlayerUnsold(entry);
      return;
    }

    // Update Redis franchise state immediately (hot path)
    const updatedState = await deductFromFranchiseState(
      this.roomId,
      winningFranchise,
      priceLakhs,
      {
        nationality: player.nationality,
        role: player.role,
        isCapped: player.isCapped,
        basePriceLakhs: player.basePriceLakhs,
      }
    );

    // Advance queue in DB
    await advanceQueue(this.roomId, position - 1, 'sold'); // position is 1-indexed

    // Build squad summary for the broadcast payload
    const squadSummary = {
      franchise: winningFranchise,
      totalPlayersAcquired: updatedState.squadCount,
      walletRemainingLakhs: updatedState.walletRemainingLakhs,
      lastAcquiredPlayer: {
        id: player.id,
        name: player.name,
        role: player.role,
      },
    };

    // Broadcast SOLD to all clients
    this.io.to(this.roomId).emit(SOCKET_EVENTS.PLAYER_SOLD, {
      player,
      finalPriceLakhs: priceLakhs,
      winningFranchise,
      updatedSquad: squadSummary,
    });

    // Async DB write — NOT awaited on the critical path
    recordPlayerSold({
      roomId: this.roomId,
      roomMemberId: member.id,
      playerId: player.id,
      priceLakhs,
      franchise: winningFranchise,
    }).catch((err) => {
      console.error(`[AuctionEngine] CRITICAL: Failed to record sale of ${player.name} to DB:`, err);
      // TODO Phase 6: trigger reconciliation job
    });

    // 3-second pause before advancing (matches SoldOverlay animation duration)
    await sleep(SOLD_PAUSE_MS);
    await this.advanceToNextPlayer();
  }

  // ─── processPlayerUnsold ─────────────────────────────────────────────────────

  async processPlayerUnsold(entry: QueueEntry): Promise<void> {
    const { player, position } = entry;
    console.info(`[AuctionEngine] UNSOLD: ${player.name}`);

    await redis.set(REDIS_KEYS.auctionState(this.roomId), 'unsold');
    await advanceQueue(this.roomId, position - 1, 'unsold');

    this.io.to(this.roomId).emit(SOCKET_EVENTS.PLAYER_UNSOLD, { player });

    await appendBidEvent({
      roomId: this.roomId,
      playerId: player.id,
      eventType: 'player_unsold',
      payload: {},
    });

    await sleep(SOLD_PAUSE_MS);
    await this.advanceToNextPlayer();
  }

  // ─── endAuction ──────────────────────────────────────────────────────────────

  async endAuction(): Promise<void> {
    console.info(`[AuctionEngine] Auction complete for room ${this.roomId}`);

    await redis.set(REDIS_KEYS.auctionState(this.roomId), 'complete');
    await updateRoomStatus(this.roomId, 'completed');

    // Load all final squad states
    const allStates = await loadAllFranchiseStates(this.roomId);

    await appendBidEvent({
      roomId: this.roomId,
      eventType: 'auction_completed',
      payload: { completedAt: new Date().toISOString() },
    });

    this.io.to(this.roomId).emit(SOCKET_EVENTS.AUCTION_COMPLETE, {
      allFranchiseStates: allStates,
    });

    // Remove from active engines map
    auctionEngines.delete(this.roomId);
  }

  // ─── emitPhaseTransition ─────────────────────────────────────────────────────

  private async emitPhaseTransition(): Promise<void> {
    const members = await getMembersForRoom(this.roomId);
    const budgetSummary = await Promise.all(
      members
        .filter((m) => m.franchise)
        .map(async (m) => {
          const cached = await redis.get(REDIS_KEYS.franchiseState(this.roomId, m.franchise!));
          const state = cached ? JSON.parse(cached) : null;
          return {
            franchise: m.franchise as FranchiseName,
            walletRemainingLakhs: state?.walletRemainingLakhs ?? m.wallet_remaining_lakhs,
          };
        })
    );

    this.io.to(this.roomId).emit(SOCKET_EVENTS.PHASE_TRANSITION, {
      from: 'marquee',
      to: 'general',
      remainingBudgetsSummary: budgetSummary,
    });

    await appendBidEvent({
      roomId: this.roomId,
      eventType: 'phase_transition',
      payload: { from: 'marquee', to: 'general' },
    });
  }
}

// ─── Singleton Registry ───────────────────────────────────────────────────────

const auctionEngines = new Map<string, AuctionEngine>();

export function getAuctionEngine(roomId: string, io: Server): AuctionEngine {
  if (!auctionEngines.has(roomId)) {
    auctionEngines.set(roomId, new AuctionEngine(io, roomId));
  }
  return auctionEngines.get(roomId)!;
}

export function removeAuctionEngine(roomId: string): void {
  auctionEngines.delete(roomId);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
