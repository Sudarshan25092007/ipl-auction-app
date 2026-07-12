'use client';

/**
 * apps/frontend/src/components/room/FranchiseGrid.tsx
 *
 * MAJOR FUNCTION: Interactive grid of 10 franchise cards.
 * Used on the franchise selection page. Shows claimed/available/myPick state.
 * Emits room:franchise_select via socket on click.
 *
 * SYSTEM CONCEPT — Optimistic UI vs confirmed state:
 *   When user clicks a franchise, we don't wait for the server to confirm.
 *   We immediately show "Claiming..." visually. The server then emits
 *   room:franchise_claimed to all clients (including this one) which triggers
 *   the definitive state update. If the server emits room:franchise_claimed_error
 *   instead, we revert to available state.
 *   This makes the UI feel instant (~0ms perceived latency) vs waiting for
 *   round-trip (~50-200ms).
 */
import { FRANCHISES } from '@ipl-auction/shared';
import type { LobbyParticipant, FranchiseName } from '@ipl-auction/shared';

interface FranchiseGridProps {
  participants: LobbyParticipant[];
  myUserId: string;
  onSelect: (franchise: FranchiseName) => void;
  isPending: boolean;
}

export function FranchiseGrid({
  participants,
  myUserId,
  onSelect,
  isPending,
}: FranchiseGridProps) {
  const myParticipant = participants.find((p) => p.userId === myUserId);
  const myFranchise = myParticipant?.franchise;

  // Build a map: franchise → who claimed it
  const claimedMap = new Map<FranchiseName, LobbyParticipant>();
  participants.forEach((p) => {
    if (p.franchise) claimedMap.set(p.franchise, p);
  });

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {FRANCHISES.map((f) => {
        const claimer = claimedMap.get(f.name);
        const isMine = f.name === myFranchise;
        const isClaimed = !!claimer;
        const isAvailable = !isClaimed && !myFranchise;

        return (
          <button
            key={f.name}
            id={`franchise-${f.abbreviation}`}
            disabled={isClaimed || !!myFranchise || isPending}
            onClick={() => isAvailable && onSelect(f.name)}
            className={`
              relative group flex flex-col items-center gap-2 p-4 rounded-xl border-2
              transition-all duration-200 text-center
              ${
                isMine
                  ? 'border-green-400 bg-green-400/10 shadow-lg shadow-green-400/20 scale-105'
                  : isClaimed
                    ? 'border-white/10 bg-white/5 opacity-50 cursor-not-allowed'
                    : 'border-white/20 bg-white/5 hover:border-orange-400/50 hover:bg-white/10 hover:scale-105 cursor-pointer'
              }
            `}
            style={{
              ...(isMine || !isClaimed
                ? { borderColor: isMine ? undefined : undefined }
                : {}),
            }}
          >
            {/* Franchise color indicator */}
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm text-white shadow-md"
              style={{ backgroundColor: f.primaryColor }}
            >
              {f.abbreviation}
            </div>

            {/* Franchise name */}
            <span className="text-xs font-medium text-white leading-tight line-clamp-2">
              {f.name}
            </span>

            {/* Status badge */}
            {isMine && (
              <span className="absolute top-1.5 right-1.5 text-xs bg-green-500 text-white px-1.5 py-0.5 rounded-full font-semibold">
                You
              </span>
            )}
            {isClaimed && !isMine && (
              <span className="text-xs text-slate-400 truncate max-w-full">
                {claimer?.username}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
