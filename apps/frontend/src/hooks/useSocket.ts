'use client';

/**
 * apps/frontend/src/hooks/useSocket.ts
 *
 * MAJOR FUNCTION: React hook that manages the Socket.IO connection lifecycle.
 * Connects on mount, disconnects on unmount, exposes the typed socket instance.
 *
 * SYSTEM CONCEPT — Why connect/disconnect in a hook (not globally):
 *   If we connected globally (in socketClient.ts at module load), the socket
 *   would be open on EVERY page — including the dashboard, login, register.
 *   A WebSocket connection is a persistent TCP connection with keepalive packets.
 *   We only want it open when the user is in a ROOM (auction-active pages).
 *   The hook opens the connection on mount (entering the room page) and closes
 *   it on unmount (navigating away). This is the "resource lifecycle tied to UI lifecycle" pattern.
 *
 * SYSTEM CONCEPT — useEffect cleanup function:
 *   React's useEffect cleanup runs when:
 *     1. The component unmounts (user navigates away)
 *     2. The effect re-runs (dependency changes — doesn't apply here, deps = [])
 *   Without cleanup: socket stays open when navigating to a different page.
 *   With cleanup: socket.disconnect() called automatically on page exit.
 *   destroySocket() ensures the singleton is reset, so next time getSocket()
 *   creates a fresh connection with the current JWT.
 */
import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { getSocket, destroySocket } from '../lib/socketClient';

interface UseSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  connectionError: string | null;
}

export function useSocket(): UseSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const s = getSocket();
    setSocket(s);

    // Event handlers
    const onConnect = () => {
      setIsConnected(true);
      setConnectionError(null);
    };

    const onDisconnect = () => setIsConnected(false);

    const onConnectError = (err: Error) => {
      setConnectionError(err.message);
      setIsConnected(false);
    };

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('connect_error', onConnectError);

    // Connect (autoConnect is false — we connect explicitly here)
    s.connect();

    // Cleanup: disconnect when the component unmounts
    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('connect_error', onConnectError);
      destroySocket(); // Reset singleton so next visit gets a fresh connection
    };
  }, []); // Empty deps: runs once on mount, cleanup on unmount

  return { socket, isConnected, connectionError };
}
