import { describe, it, expect, beforeEach } from 'vitest';
import { useAuctionStore } from '../apps/frontend/src/stores/auctionStore';
import type { Player, FranchiseState, StateSyncPayload } from '../packages/shared/src';

describe('Frontend Zustand Auction Store & State Sync Unit Tests', () => {
  const dummyPlayer: Player = {
    id: 'p1-uuid',
    name: 'Virat Kohli',
    category: 'Marquee Batter',
    role: 'batter',
    nationality: 'indian',
    isMarquee: true,
    isCapped: true,
    basePriceLakhs: 200,
  };

  const dummyFranchiseState: FranchiseState = {
    franchise: 'Royal Challengers Bengaluru',
    walletRemainingLakhs: 11800,
    squadCount: 1,
    overseasCount: 0,
    uncappedCount: 0,
    wkCount: 0,
    batterCount: 1,
    bowlerCount: 0,
    allRounderCount: 0,
    tier25PlusCount: 0,
    tier20to25Count: 0,
    tier15to20Count: 0,
  };

  beforeEach(() => {
    useAuctionStore.getState().resetStore();
  });

  it('should initialize with default idle state', () => {
    const state = useAuctionStore.getState();
    expect(state.auctionState).toBe('idle');
    expect(state.currentPlayer).toBeNull();
    expect(state.currentBidLakhs).toBe(0);
    expect(state.secondsLeft).toBe(30);
    expect(state.myFranchise).toBeNull();
  });

  it('should update secondsLeft when setTimerTick is called', () => {
    useAuctionStore.getState().setTimerTick(18);
    expect(useAuctionStore.getState().secondsLeft).toBe(18);

    useAuctionStore.getState().setTimerTick(4);
    expect(useAuctionStore.getState().secondsLeft).toBe(4);
  });

  it('should update state and bidHistory when updateBid is called', () => {
    useAuctionStore.getState().updateBid({
      playerId: dummyPlayer.id,
      newBidLakhs: 350,
      newBidder: 'Royal Challengers Bengaluru',
      timestamp: 1700000000000,
    });

    const state = useAuctionStore.getState();
    expect(state.currentBidLakhs).toBe(350);
    expect(state.currentBidder).toBe('Royal Challengers Bengaluru');
    expect(state.auctionState).toBe('bidding');
    expect(state.bidHistory.length).toBe(1);
    expect(state.bidHistory[0].amountLakhs).toBe(350);
  });

  it('should fully hydrate state and restore myFranchise on STATE_SYNC (Reconnect Recovery)', () => {
    const syncPayload: StateSyncPayload = {
      currentPlayer: dummyPlayer,
      currentBidLakhs: 1450,
      currentBidder: 'Mumbai Indians',
      secondsLeft: 7,
      auctionPhase: 'marquee',
      auctionState: 'bidding',
      myFranchiseState: dummyFranchiseState,
      queuePosition: 3,
      queueTotal: 250,
    };

    useAuctionStore.getState().syncState(syncPayload);

    const state = useAuctionStore.getState();
    expect(state.currentPlayer?.name).toBe('Virat Kohli');
    expect(state.currentBidLakhs).toBe(1450);
    expect(state.currentBidder).toBe('Mumbai Indians');
    expect(state.secondsLeft).toBe(7);
    expect(state.auctionState).toBe('bidding');
    expect(state.queuePosition).toBe(3);
    expect(state.queueTotal).toBe(250);

    // CRITICAL: Verify myFranchise identity and franchise state are restored to prevent Spectator View
    expect(state.myFranchise).toBe('Royal Challengers Bengaluru');
    expect(state.myFranchiseState).toMatchObject({
      franchise: 'Royal Challengers Bengaluru',
      walletRemainingLakhs: 11800,
      squadCount: 1,
    });
    expect(state.squadSummaries['Royal Challengers Bengaluru'].walletRemainingLakhs).toBe(11800);
  });
});
