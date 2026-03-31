/**
 * T046-T048: Enemy spawn balance tests.
 * @see specs/002-qol-balance-batch/contracts/spawn-balance.md
 */

import { generateMap } from '../../src/game/map/generator';
import { SeededRNG } from '../../src/game/engine/rng';
import { getSpawnZone, selectTierForZone } from '../../src/game/map/spawn-zones';

describe('Spawn Balance', () => {
  describe('Zone Classification', () => {
    it('classifies positions within 5 tiles as Zone 0', () => {
      const spawn = { x: 10, y: 10 };
      expect(getSpawnZone({ x: 10, y: 10 }, spawn)).toBe(0);
      expect(getSpawnZone({ x: 12, y: 13 }, spawn)).toBe(0);
      expect(getSpawnZone({ x: 15, y: 10 }, spawn)).toBe(0);
    });

    it('classifies positions 6-10 tiles as Zone 1', () => {
      const spawn = { x: 10, y: 10 };
      expect(getSpawnZone({ x: 16, y: 10 }, spawn)).toBe(1);
      expect(getSpawnZone({ x: 15, y: 15 }, spawn)).toBe(1);
    });

    it('classifies positions beyond 10 tiles as Zone 2', () => {
      const spawn = { x: 10, y: 10 };
      expect(getSpawnZone({ x: 16, y: 15 }, spawn)).toBe(2);
      expect(getSpawnZone({ x: 25, y: 20 }, spawn)).toBe(2);
    });
  });

  describe('Tier Selection', () => {
    it('only selects T1 in Zone 0', () => {
      const rng = new SeededRNG(12345);
      for (let i = 0; i < 100; i += 1) {
        expect(selectTierForZone(0, rng)).toBe(1);
      }
    });

    it('never selects T3 in Zone 1', () => {
      const rng = new SeededRNG(12345);
      const tiers = Array.from({ length: 100 }, () => selectTierForZone(1, rng));
      expect(tiers.every((tier) => tier === 1 || tier === 2)).toBe(true);
      expect(tiers.some((tier) => tier === 3)).toBe(false);
    });

    it('can select all tiers in Zone 2', () => {
      const rng = new SeededRNG(12345);
      const tiers = Array.from({ length: 1000 }, () => selectTierForZone(2, rng));
      expect(tiers.some((tier) => tier === 1)).toBe(true);
      expect(tiers.some((tier) => tier === 2)).toBe(true);
      expect(tiers.some((tier) => tier === 3)).toBe(true);
    });
  });

  describe('Statistical Verification', () => {
    it('enforces spawn protection radius (no enemies within 5 Chebyshev tiles of spawn)', () => {
      for (let seed = 1; seed <= 100; seed += 1) {
        const map = generateMap({ seed, width: 50, height: 50 });
        const spawn = map.spawn;

        for (const enemy of map.enemies) {
          const chebyshev = Math.max(
            Math.abs(enemy.position.x - spawn.x),
            Math.abs(enemy.position.y - spawn.y)
          );
          expect(chebyshev).toBeGreaterThan(5);
        }
      }
    });

    it('near enemies are mostly T1 across 100 seeds', () => {
      let nearT1 = 0;
      let nearTotal = 0;

      for (let seed = 1; seed <= 100; seed += 1) {
        const map = generateMap({ seed, width: 50, height: 50 });
        const spawn = map.spawn;
        const maxDistance = 49 + 49; // MAP_WIDTH-1 + MAP_HEIGHT-1

        for (const enemy of map.enemies) {
          const manhattan =
            Math.abs(enemy.position.x - spawn.x) + Math.abs(enemy.position.y - spawn.y);
          const distPercent = Math.floor((manhattan * 100) / maxDistance);
          if (distPercent <= 33) {
            nearTotal += 1;
            if (enemy.tier === 1) nearT1 += 1;
          }
        }
      }

      // NEAR_TIER_WEIGHTS = [80, 15, 5] — at least 70% T1 near spawn
      expect(nearTotal).toBeGreaterThan(0);
      expect(nearT1 / nearTotal).toBeGreaterThanOrEqual(0.7);
    });
  });
});
