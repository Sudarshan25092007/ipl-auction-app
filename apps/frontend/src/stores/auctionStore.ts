'use client';

/**
 * apps/frontend/src/stores/auctionStore.ts
 *
 * MAJOR FUNCTION: The frontend client-side single source of truth for active auction state.
 * Replicates the server-side Redis hot lane state in browser memory.
 * Provides actions for socket handlers to update the UI reactively.
 *
 * SYSTEM CONCEPT — Zustand for fast-tick rendering:
 *   Socket events (timer ticks, bids) fire multiple times per second.
 *   Standard React state at the page level would cause full-page re-renders.
 *   Zustand allows individual components (e.g., CountdownRing, BidHistoryFeed) to
 *   subscribe to specific state slices (e.g., `secondsLeft`, `bidHistory`).
 *   Only the subscribed components re-render, keeping CPU usage low during high-tick bids.
 *
 * SYSTEM CONCEPT — Reconnection Recovery:
 *   When `syncState` is called, the store discards its current state and overwrites it
 *   with the server's snapshot. This resolves state drift when clients reconnect.
 */

import { create } from 'zustand';
import type {
  Player,
  FranchiseName,
  FranchiseState,
  BidUpdatePayload,
  PlayerSoldPayload,
  StateSyncPayload,
} from '@ipl-auction/shared';

export interface BidHistoryEntry {
  bidder: FranchiseName;
  amountLakhs: number;
  timestamp: number;
}

export interface SquadSummaryState {
  franchise: FranchiseName;
  totalPlayersAcquired: number;
  walletRemainingLakhs: number;
}

export interface SquadPlayerState {
  player: Player;
  pricePaidLakhs: number;
}

interface AuctionState {
  // ─── Core Auction State ──────────────────────────────────────────────────────
  currentPlayer: Player | null;
  currentBidLakhs: number;
  currentBidder: FranchiseName | null;
  secondsLeft: number;
  auctionPhase: 'marquee' | 'general';
  auctionState:
    | 'idle'
    | 'player_up'
    | 'bidding'
    | 'paused'
    | 'sold'
    | 'unsold'
    | 'complete';
  queuePosition: number;
  queueTotal: number;

  // ─── Local User's Franchise State ───────────────────────────────────────────
  myFranchiseState: FranchiseState | null;
  isHost: boolean;
  myFranchise: FranchiseName | null;

  // ─── Live UI Feed State ─────────────────────────────────────────────────────
  bidHistory: BidHistoryEntry[];
  squadSummaries: Record<FranchiseName, SquadSummaryState>;
  squadPlayers: Record<FranchiseName, SquadPlayerState[]>;

  // ─── Actions ────────────────────────────────────────────────────────────────
  setIsHost: (isHost: boolean) => void;
  setMyFranchise: (franchise: FranchiseName | null) => void;
  setPlayerUp: (payload: {
    player: Player;
    queuePosition: number;
    queueTotal: number;
    phase: 'marquee' | 'general';
    timerSeconds: number;
  }) => void;
  updateBid: (payload: BidUpdatePayload) => void;
  setTimerTick: (secondsLeft: number) => void;
  markPlayerSold: (payload: PlayerSoldPayload) => void;
  markPlayerUnsold: (player: Player) => void;
  syncState: (payload: StateSyncPayload) => void;
  setSquadPlayers: (squads: Record<FranchiseName, SquadPlayerState[]>) => void;
  resetStore: () => void;
}

const initialSquadPlayers = (): Record<FranchiseName, SquadPlayerState[]> => {
  const franchises: FranchiseName[] = [
    'Mumbai Indians',
    'Chennai Super Kings',
    'Royal Challengers Bengaluru',
    'Kolkata Knight Riders',
    'Sunrisers Hyderabad',
    'Delhi Capitals',
    'Rajasthan Royals',
    'Punjab Kings',
    'Lucknow Super Giants',
    'Gujarat Titans',
  ];
  const squads = {} as Record<FranchiseName, SquadPlayerState[]>;
  franchises.forEach((name) => {
    squads[name] = [];
  });
  return squads;
};

const initialSquadSummaries = (): Record<FranchiseName, SquadSummaryState> => {
  const franchises: FranchiseName[] = [
    'Mumbai Indians',
    'Chennai Super Kings',
    'Royal Challengers Bengaluru',
    'Kolkata Knight Riders',
    'Sunrisers Hyderabad',
    'Delhi Capitals',
    'Rajasthan Royals',
    'Punjab Kings',
    'Lucknow Super Giants',
    'Gujarat Titans',
  ];
  const summaries = {} as Record<FranchiseName, SquadSummaryState>;
  franchises.forEach((name) => {
    summaries[name] = {
      franchise: name,
      totalPlayersAcquired: 0,
      walletRemainingLakhs: 12000, // starting ₹120 Cr
    };
  });
  return summaries;
};

const initialState = {
  currentPlayer: null,
  currentBidLakhs: 0,
  currentBidder: null,
  secondsLeft: 30,
  auctionPhase: 'marquee' as const,
  auctionState: 'idle' as const,
  queuePosition: 0,
  queueTotal: 0,
  myFranchiseState: null,
  isHost: false,
  myFranchise: null as FranchiseName | null,
  bidHistory: [],
  squadSummaries: initialSquadSummaries(),
  squadPlayers: initialSquadPlayers(),
};

export const useAuctionStore = create<AuctionState>((set, get) => ({
  ...initialState,

  setIsHost: (isHost) => set({ isHost }),
  setMyFranchise: (myFranchise) => set({ myFranchise }),

  // ─── setPlayerUp ─────────────────────────────────────────────────────────────
  setPlayerUp: (payload) =>
    set({
      currentPlayer: payload.player,
      currentBidLakhs: 0, // starts at 0 (or base price, we treat it as 0 bids placed yet)
      currentBidder: null,
      secondsLeft: payload.timerSeconds,
      queuePosition: payload.queuePosition,
      queueTotal: payload.queueTotal,
      auctionPhase: payload.phase,
      auctionState: 'player_up',
      bidHistory: [], // clear list for the new player
    }),

  // ─── updateBid ───────────────────────────────────────────────────────────────
  updateBid: (payload) =>
    set((state) => {
      const newEntry: BidHistoryEntry = {
        bidder: payload.newBidder,
        amountLakhs: payload.newBidLakhs,
        timestamp: payload.timestamp,
      };

      return {
        currentBidLakhs: payload.newBidLakhs,
        currentBidder: payload.newBidder,
        auctionState: 'bidding',
        // Sort newest bids at the top
        bidHistory: [newEntry, ...state.bidHistory],
      };
    }),

  // ─── setTimerTick ────────────────────────────────────────────────────────────
  setTimerTick: (secondsLeft) =>
    set({
      secondsLeft,
    }),

  // ─── markPlayerSold ──────────────────────────────────────────────────────────
  markPlayerSold: (payload) =>
    set((state) => {
      const { winningFranchise, finalPriceLakhs } = payload;

      // Update global franchise summaries
      const updatedSummaries = { ...state.squadSummaries };
      if (winningFranchise && updatedSummaries[winningFranchise]) {
        updatedSummaries[winningFranchise] = {
          franchise: winningFranchise,
          totalPlayersAcquired: payload.updatedSquad.totalPlayersAcquired,
          walletRemainingLakhs: payload.updatedSquad.walletRemainingLakhs,
        };
      }

      // Update the squad players array
      const updatedSquadPlayers = { ...state.squadPlayers };
      if (winningFranchise) {
        updatedSquadPlayers[winningFranchise] = [
          ...(updatedSquadPlayers[winningFranchise] || []),
          { player: payload.player, pricePaidLakhs: finalPriceLakhs },
        ];
      }

      // If the local user claimed this franchise, update their detailed state too
      let myFranchiseState = state.myFranchiseState;
      if (
        winningFranchise &&
        myFranchiseState &&
        myFranchiseState.franchise === winningFranchise
      ) {
        myFranchiseState = {
          ...myFranchiseState,
          walletRemainingLakhs: payload.updatedSquad.walletRemainingLakhs,
          squadCount: payload.updatedSquad.totalPlayersAcquired,
          // Update corresponding counts based on player role & metadata
          overseasCount:
            payload.player.nationality === 'overseas'
              ? myFranchiseState.overseasCount + 1
              : myFranchiseState.overseasCount,
          uncappedCount: !payload.player.isCapped
            ? myFranchiseState.uncappedCount + 1
            : myFranchiseState.uncappedCount,
          wkCount:
            payload.player.role === 'wk'
              ? myFranchiseState.wkCount + 1
              : myFranchiseState.wkCount,
          batterCount:
            payload.player.role === 'batter'
              ? myFranchiseState.batterCount + 1
              : myFranchiseState.batterCount,
          bowlerCount:
            payload.player.role === 'pacer' || payload.player.role === 'spinner'
              ? myFranchiseState.bowlerCount + 1
              : myFranchiseState.bowlerCount,
          allRounderCount:
            payload.player.role === 'allrounder'
              ? myFranchiseState.allRounderCount + 1
              : myFranchiseState.allRounderCount,
          tier25PlusCount:
            finalPriceLakhs >= 2500
              ? myFranchiseState.tier25PlusCount + 1
              : myFranchiseState.tier25PlusCount,
          tier20to25Count:
            finalPriceLakhs >= 2000 && finalPriceLakhs < 2500
              ? myFranchiseState.tier20to25Count + 1
              : myFranchiseState.tier20to25Count,
          tier15to20Count:
            finalPriceLakhs >= 1500 && finalPriceLakhs < 2000
              ? myFranchiseState.tier15to20Count + 1
              : myFranchiseState.tier15to20Count,
        };
      }

      return {
        auctionState: 'sold',
        squadSummaries: updatedSummaries,
        squadPlayers: updatedSquadPlayers,
        myFranchiseState,
      };
    }),

  // ─── markPlayerUnsold ────────────────────────────────────────────────────────
  markPlayerUnsold: () =>
    set({
      auctionState: 'unsold',
    }),

  // ─── syncState ───────────────────────────────────────────────────────────────
  syncState: (payload) =>
    set((state) => {
      // Rebuild the squad summary for the user's franchise if synced
      const updatedSummaries = { ...state.squadSummaries };
      let myFranchise = state.myFranchise;
      if (payload.myFranchiseState) {
        const name = payload.myFranchiseState.franchise;
        myFranchise = name;
        updatedSummaries[name] = {
          franchise: name,
          totalPlayersAcquired: payload.myFranchiseState.squadCount,
          walletRemainingLakhs: payload.myFranchiseState.walletRemainingLakhs,
        };
      }

      return {
        currentPlayer: payload.currentPlayer,
        currentBidLakhs: payload.currentBidLakhs,
        currentBidder: payload.currentBidder,
        secondsLeft: payload.secondsLeft,
        auctionPhase: payload.auctionPhase,
        auctionState: payload.auctionState,
        myFranchiseState: payload.myFranchiseState ?? null,
        myFranchise,
        queuePosition: payload.queuePosition,
        queueTotal: payload.queueTotal,
        squadSummaries: updatedSummaries,
      };
    }),

  // ─── setSquadPlayers ─────────────────────────────────────────────────────────
  setSquadPlayers: (squads) =>
    set({
      squadPlayers: squads,
    }),

  // ─── resetStore ──────────────────────────────────────────────────────────────
  resetStore: () =>
    set({
      ...initialState,
      squadSummaries: initialSquadSummaries(),
      squadPlayers: initialSquadPlayers(),
    }),
}));
