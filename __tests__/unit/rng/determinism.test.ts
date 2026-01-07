/**
 * RNG Determinism Tests
 * Verifies that SeededRNG produces reproducible sequences
 * @see specs/001-pve-dungeon-crawler/plan.md - P04, P11
 */

import { SeededRNG } from '../../../src/game/engine/rng';

describe('SeededRNG', () => {
  describe('basic determinism', () => {
    it('same seed produces same sequence', () => {
      const rng1 = new SeededRNG(12345);
      const rng2 = new SeededRNG(12345);

      const sequence1 = Array.from({ length: 100 }, () => rng1.next());
      const sequence2 = Array.from({ length: 100 }, () => rng2.next());

      expect(sequence1).toEqual(sequence2);
    });

    it('different seeds produce different sequences', () => {
      const rng1 = new SeededRNG(12345);
      const rng2 = new SeededRNG(54321);

      const value1 = rng1.next();
      const value2 = rng2.next();

      expect(value1).not.toEqual(value2);
    });

    it('nextInt produces consistent integers in range', () => {
      const rng1 = new SeededRNG(42);
      const rng2 = new SeededRNG(42);

      const ints1 = Array.from({ length: 50 }, () => rng1.nextInt(1, 100));
      const ints2 = Array.from({ length: 50 }, () => rng2.nextInt(1, 100));

      expect(ints1).toEqual(ints2);
      ints1.forEach(n => {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(100);
      });
    });

    it('nextBool produces consistent booleans', () => {
      const rng1 = new SeededRNG(999);
      const rng2 = new SeededRNG(999);

      const bools1 = Array.from({ length: 50 }, () => rng1.nextBool(0.7));
      const bools2 = Array.from({ length: 50 }, () => rng2.nextBool(0.7));

      expect(bools1).toEqual(bools2);
    });
  });

  describe('state management', () => {
    it('getState/setState allows saving and restoring', () => {
      const rng = new SeededRNG(12345);

      // Advance RNG a few times
      rng.next();
      rng.next();
      rng.next();

      const savedState = rng.getState();
      const nextValues = [rng.next(), rng.next(), rng.next()];

      // Restore and verify same sequence
      rng.setState(savedState);
      const restoredValues = [rng.next(), rng.next(), rng.next()];

      expect(restoredValues).toEqual(nextValues);
    });

    it('fork creates independent copy at same state', () => {
      const rng1 = new SeededRNG(12345);
      rng1.next();
      rng1.next();

      const rng2 = rng1.fork();

      // Both should produce same next values
      expect(rng1.next()).toEqual(rng2.next());
      expect(rng1.next()).toEqual(rng2.next());
    });
  });

  describe('array operations', () => {
    it('pick selects same element with same seed', () => {
      const items = ['sword', 'shield', 'potion', 'key', 'gem'];

      const rng1 = new SeededRNG(777);
      const rng2 = new SeededRNG(777);

      const picks1 = Array.from({ length: 20 }, () => rng1.pick(items));
      const picks2 = Array.from({ length: 20 }, () => rng2.pick(items));

      expect(picks1).toEqual(picks2);
    });

    it('pick throws on empty array', () => {
      const rng = new SeededRNG(123);
      expect(() => rng.pick([])).toThrow('Cannot pick from empty array');
    });

    it('shuffle produces same order with same seed', () => {
      const rng1 = new SeededRNG(555);
      const rng2 = new SeededRNG(555);

      const arr1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const arr2 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      rng1.shuffle(arr1);
      rng2.shuffle(arr2);

      expect(arr1).toEqual(arr2);
    });
  });

  describe('combat determinism concept', () => {
    /**
     * Simulates combat damage calculation with RNG
     * This verifies the pattern used in actual combat resolution
     */
    function simulateCombatDamage(
      rng: SeededRNG,
      baseAtk: number,
      variance: number
    ): number {
      // Roll for damage variance (e.g., +/- 20%)
      const varianceMod = 1 + (rng.next() * variance * 2 - variance);
      return Math.floor(baseAtk * varianceMod);
    }

    it('combat damage is deterministic with same seed', () => {
      const seed = 42424242;
      const rng1 = new SeededRNG(seed);
      const rng2 = new SeededRNG(seed);

      // Simulate 10 rounds of combat
      const damages1: number[] = [];
      const damages2: number[] = [];

      for (let i = 0; i < 10; i++) {
        damages1.push(simulateCombatDamage(rng1, 10, 0.2));
        damages2.push(simulateCombatDamage(rng2, 10, 0.2));
      }

      expect(damages1).toEqual(damages2);
    });

    it('full combat sequence is deterministic', () => {
      const seed = 99999;

      function simulateCombat(combatSeed: number): { turns: number; playerWon: boolean; damageLog: number[] } {
        const rng = new SeededRNG(combatSeed);
        const damageLog: number[] = [];

        let playerHp = 20;
        let enemyHp = 15;
        let turn = 0;

        while (playerHp > 0 && enemyHp > 0 && turn < 100) {
          turn++;

          // Player attacks enemy
          const playerDmg = rng.nextInt(3, 7);
          enemyHp -= playerDmg;
          damageLog.push(playerDmg);

          if (enemyHp <= 0) break;

          // Enemy attacks player
          const enemyDmg = rng.nextInt(2, 5);
          playerHp -= enemyDmg;
          damageLog.push(enemyDmg);
        }

        return {
          turns: turn,
          playerWon: enemyHp <= 0,
          damageLog,
        };
      }

      const result1 = simulateCombat(seed);
      const result2 = simulateCombat(seed);

      expect(result1.turns).toEqual(result2.turns);
      expect(result1.playerWon).toEqual(result2.playerWon);
      expect(result1.damageLog).toEqual(result2.damageLog);
    });
  });

  describe('distribution properties', () => {
    it('next() returns values in [0, 1)', () => {
      const rng = new SeededRNG(12345);

      for (let i = 0; i < 1000; i++) {
        const value = rng.next();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });

    it('nextInt covers full range', () => {
      const rng = new SeededRNG(12345);
      const seen = new Set<number>();

      // With enough iterations, should see all values 1-10
      for (let i = 0; i < 1000; i++) {
        seen.add(rng.nextInt(1, 10));
      }

      for (let n = 1; n <= 10; n++) {
        expect(seen.has(n)).toBe(true);
      }
    });
  });
});
