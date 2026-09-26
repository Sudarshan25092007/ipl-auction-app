/**
 * packages/shared/src/constants/pool.constants.ts
 *
 * Scarcity-Calibrated Player Pool Configuration & Calculation.
 * Target formula: targetPlayers = N * 25 * 1.4, clamped to [50, 250].
 */

export const POOL_CONFIG = {
  playersPerManager: 25,
  scarcityMultiplier: 1.4,
  minPoolSize: 50,
  maxPoolSize: 250,
} as const;

/**
 * Calculates the exact scarcity-calibrated player pool size for a given manager count.
 *
 * @param participantCount - Number of participating managers in the room.
 * @returns Clamped target player pool count in [50, 250].
 */
export function calculatePoolSize(participantCount: number): number {
  const count = Math.max(1, participantCount || 1);
  const rawTarget = Math.round(
    count * POOL_CONFIG.playersPerManager * POOL_CONFIG.scarcityMultiplier
  );
  return Math.min(
    POOL_CONFIG.maxPoolSize,
    Math.max(POOL_CONFIG.minPoolSize, rawTarget)
  );
}
