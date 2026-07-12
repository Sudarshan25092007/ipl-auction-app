'use client';

/**
 * apps/frontend/src/hooks/useAuction.ts
 *
 * MAJOR FUNCTION: Binds Socket.IO events to the Zustand store.
 * Listeners subscribe to incoming server updates (bids, timers, player changes)
 * and route them directly to Zustand actions.
 *
 * SYSTEM CONCEPT — Event Delegation & Cleanup:
 *   If individual components subscribed to `socket.on(EVENT)`, they would create
 *   multiple parallel handlers. On re-renders, they could register duplicate handlers.
 *   By centering all subscriptions in this single custom hook at the page-root level:
 *   1. Exactly one subscription per event exists.
 *   2. The cleanup function (`socket.off`) is called on unmount, preventing memory leaks.
 *
 * SYSTEM CONCEPT — Reconnection Handshake:
 *   On mount or reconnection, it emits `auction:state_sync_request` to pull the
 *   authoritative state from the server.
 */

import { useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import { SOCKET_EVENTS } from '@ipl-auction/shared';
import type {
  PlayerUpPayload,
  BidUpdatePayload,
  TimerTickPayload,
  PlayerSoldPayload,
  StateSyncPayload,
  Player,
} from '@ipl-auction/shared';
import { useAuctionStore } from '../stores/auctionStore';

export function useAuction(
  socket: Socket | null,
  roomCode: string,
  isConnected: boolean
) {
  const {
    setPlayerUp,
    updateBid,
    setTimerTick,
    markPlayerSold,
    markPlayerUnsold,
    syncState,
    resetStore,
  } = useAuctionStore();

  useEffect(() => {
    if (!socket || !roomCode || !isConnected) return;

    // 1. Initial State Sync Request
    socket.emit('auction:state_sync_request', { roomCode });

    // 2. Register Socket Listeners
    const handlePlayerUp = (payload: PlayerUpPayload) => {
      setPlayerUp(payload);
    };

    const handleBidUpdate = (payload: BidUpdatePayload) => {
      updateBid(payload);
    };

    const handleTimerTick = (payload: TimerTickPayload) => {
      setTimerTick(payload.secondsLeft);
    };

    const handlePlayerSold = (payload: PlayerSoldPayload) => {
      markPlayerSold(payload);
    };

    const handlePlayerUnsold = (payload: { player: Player }) => {
      markPlayerUnsold(payload.player);
    };

    const handleStateSync = (payload: StateSyncPayload) => {
      syncState(payload);
    };

    socket.on(SOCKET_EVENTS.PLAYER_UP, handlePlayerUp);
    socket.on(SOCKET_EVENTS.BID_UPDATE, handleBidUpdate);
    socket.on(SOCKET_EVENTS.TIMER_TICK, handleTimerTick);
    socket.on(SOCKET_EVENTS.PLAYER_SOLD, handlePlayerSold);
    socket.on(SOCKET_EVENTS.PLAYER_UNSOLD, handlePlayerUnsold);
    socket.on(SOCKET_EVENTS.STATE_SYNC, handleStateSync);

    // Re-request sync if socket disconnects and reconnects
    const handleReconnect = () => {
      socket.emit('auction:state_sync_request', { roomCode });
    };
    socket.on('connect', handleReconnect);

    // 3. Cleanup on Unmount / Change
    return () => {
      socket.off(SOCKET_EVENTS.PLAYER_UP, handlePlayerUp);
      socket.off(SOCKET_EVENTS.BID_UPDATE, handleBidUpdate);
      socket.off(SOCKET_EVENTS.TIMER_TICK, handleTimerTick);
      socket.off(SOCKET_EVENTS.PLAYER_SOLD, handlePlayerSold);
      socket.off(SOCKET_EVENTS.PLAYER_UNSOLD, handlePlayerUnsold);
      socket.off(SOCKET_EVENTS.STATE_SYNC, handleStateSync);
      socket.off('connect', handleReconnect);
      resetStore(); // reset store when leaving the auction view
    };
  }, [
    socket,
    roomCode,
    isConnected,
    setPlayerUp,
    updateBid,
    setTimerTick,
    markPlayerSold,
    markPlayerUnsold,
    syncState,
    resetStore,
  ]);
}
