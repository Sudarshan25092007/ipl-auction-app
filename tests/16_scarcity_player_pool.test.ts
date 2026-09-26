import { describe, it, expect } from 'vitest';
import { calculatePoolSize, POOL_CONFIG, type Player } from '../packages/shared/src';
import { generateCalibratedPlayerPool } from '../apps/backend/src/services/queueManager';

describe('Scarcity-Calibrated Player Pool Formula & Distribution Tests', () => {
  it('should correctly calculate clamped pool sizes for manager counts', () => {
    // 0/1 manager -> clamped to minPoolSize (50)
    expect(calculatePoolSize(0)).toBe(50);
    expect(calculatePoolSize(1)).toBe(50);

    // 2 managers -> 2 * 25 * 1.4 = 70
    expect(calculatePoolSize(2)).toBe(70);

    // 3 managers -> 3 * 25 * 1.4 = 105
    expect(calculatePoolSize(3)).toBe(105);

    // 4 managers -> 4 * 25 * 1.4 = 140
    expect(calculatePoolSize(4)).toBe(140);

    // 6 managers -> 6 * 25 * 1.4 = 210
    expect(calculatePoolSize(6)).toBe(210);

    // 8 managers -> 8 * 25 * 1.4 = 280 -> clamped to 250
    expect(calculatePoolSize(8)).toBe(250);

    // 10 managers -> 10 * 25 * 1.4 = 350 -> clamped to 250
    expect(calculatePoolSize(10)).toBe(250);
  });

  it('should maintain category diversity and produce zero duplicates', () => {
    // Generate dummy player database of 250 players
    const dummyMarquee: Player[] = Array.from({ length: 40 }, (_, i) => ({
      id: `m-${i}`,
      name: `Marquee Player ${i}`,
      category: 'Marquee A',
      role: (['batter', 'pacer', 'spinner', 'allrounder', 'wk'] as const)[i % 5],
      nationality: 'indian',
      isMarquee: true,
      isCapped: true,
      basePriceLakhs: 200,
    }));

    const dummyGeneral: Player[] = Array.from({ length: 210 }, (_, i) => ({
      id: `g-${i}`,
      name: `General Player ${i}`,
      category: 'General',
      role: (['batter', 'pacer', 'spinner', 'allrounder', 'wk'] as const)[i % 5],
      nationality: 'indian',
      isMarquee: false,
      isCapped: true,
      basePriceLakhs: 50,
    }));

    const allPlayers = { marquee: dummyMarquee, general: dummyGeneral };

    // Test for N=4 managers -> target = 140 players
    const result = generateCalibratedPlayerPool(allPlayers, 4);

    expect(result.targetCount).toBe(140);
    expect(result.orderedPlayers.length).toBe(140);

    // Verify all IDs are unique (zero duplicates)
    const ids = result.orderedPlayers.map((p) => p.player.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(140);

    // Verify marquee players come first
    const marqueePhase = result.orderedPlayers.filter((p) => p.phase === 'marquee');
    const generalPhase = result.orderedPlayers.filter((p) => p.phase === 'general');

    expect(marqueePhase.length).toBeGreaterThan(0);
    expect(generalPhase.length).toBeGreaterThan(0);

    // Verify first player is marquee
    expect(result.orderedPlayers[0].phase).toBe('marquee');
  });

  it('should degrade gracefully without error when a category has insufficient players', () => {
    // Only 3 marquee players available in DB
    const smallMarquee: Player[] = [
      { id: 'm-1', name: 'M1', category: 'Marquee', role: 'batter', nationality: 'indian', isMarquee: true, isCapped: true, basePriceLakhs: 200 },
      { id: 'm-2', name: 'M2', category: 'Marquee', role: 'pacer', nationality: 'indian', isMarquee: true, isCapped: true, basePriceLakhs: 200 },
      { id: 'm-3', name: 'M3', category: 'Marquee', role: 'spinner', nationality: 'indian', isMarquee: true, isCapped: true, basePriceLakhs: 200 },
    ];

    const largeGeneral: Player[] = Array.from({ length: 80 }, (_, i) => ({
      id: `g-${i}`,
      name: `General Player ${i}`,
      category: 'General',
      role: 'batter',
      nationality: 'indian',
      isMarquee: false,
      isCapped: true,
      basePriceLakhs: 50,
    }));

    const result = generateCalibratedPlayerPool({ marquee: smallMarquee, general: largeGeneral }, 2); // target 70

    expect(result.orderedPlayers.length).toBe(70);
    expect(result.marqueeCount).toBe(3); // took all 3 available marquee
    expect(result.generalCount).toBe(67); // filled remainder with general

    const ids = new Set(result.orderedPlayers.map((p) => p.player.id));
    expect(ids.size).toBe(70); // zero duplicates
  });
});
