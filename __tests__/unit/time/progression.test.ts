/**
 * Time Progression Tests (T060, T061)
 * Tests for time system including Day/Night cycles and boss selection
 * @see specs/001-pve-dungeon-crawler/spec.md - User Story 3
 * @see specs/001-pve-dungeon-crawler/data-model.md - TimeState
 */

import { SeededRNG } from '../../../src/game/engine/rng';
import { TimePhase, type TimeState, type BossId } from '../../../src/game/engine/types';
import { PHASE_MOVES, BOSS_POOLS, GAME_CONSTANTS } from '../../../src/game/engine/constants';
import {
  createInitialTimeState,
  consumeMove,
  advanceTimePhase,
  shouldTriggerBoss,
  selectWeekBoss,
  getCurrentSightRadius,
} from '../../../src/game/time/progression';

describe('Time Progression (T060)', () => {
  describe('createInitialTimeState', () => {
    it('creates Week 1 Day 1 state with correct moves', () => {
      const rng = new SeededRNG(12345);
      const time = createInitialTimeState(rng);

      expect(time.week).toBe(1);
      expect(time.phase).toBe(TimePhase.Day);
      expect(time.cycle).toBe(1);
      expect(time.movesRemaining).toBe(PHASE_MOVES[TimePhase.Day]);
    });

    it('selects a boss from Week 1 pool', () => {
      const rng = new SeededRNG(12345);
      const time = createInitialTimeState(rng);

      expect(BOSS_POOLS[1]).toContain(time.weekBoss);
    });

    it('produces deterministic boss selection with same seed', () => {
      const rng1 = new SeededRNG(42);
      const rng2 = new SeededRNG(42);

      const time1 = createInitialTimeState(rng1);
      const time2 = createInitialTimeState(rng2);

      expect(time1.weekBoss).toBe(time2.weekBoss);
    });
  });

  describe('consumeMove', () => {
    it('decrements movesRemaining by 1 for standard move', () => {
      const time: TimeState = {
        week: 1,
        phase: TimePhase.Day,
        cycle: 1,
        movesRemaining: 50,
        weekBoss: 'BROODMOTHER',
      };

      const result = consumeMove(time, 1);
      expect(result.movesRemaining).toBe(49);
    });

    it('decrements movesRemaining by 2 for Hard Rock move', () => {
      const time: TimeState = {
        week: 1,
        phase: TimePhase.Day,
        cycle: 1,
        movesRemaining: 50,
        weekBoss: 'BROODMOTHER',
      };

      const result = consumeMove(time, 2);
      expect(result.movesRemaining).toBe(48);
    });

    it('does not go below 0 moves', () => {
      const time: TimeState = {
        week: 1,
        phase: TimePhase.Day,
        cycle: 1,
        movesRemaining: 1,
        weekBoss: 'BROODMOTHER',
      };

      const result = consumeMove(time, 5);
      expect(result.movesRemaining).toBe(0);
    });
  });

  describe('advanceTimePhase', () => {
    it('transitions Day to Night in same cycle', () => {
      const time: TimeState = {
        week: 1,
        phase: TimePhase.Day,
        cycle: 1,
        movesRemaining: 0,
        weekBoss: 'BROODMOTHER',
      };

      const result = advanceTimePhase(time);

      expect(result.phase).toBe(TimePhase.Night);
      expect(result.cycle).toBe(1);
      expect(result.movesRemaining).toBe(PHASE_MOVES[TimePhase.Night]);
    });

    it('transitions Night to next Day (cycle 1 to 2)', () => {
      const time: TimeState = {
        week: 1,
        phase: TimePhase.Night,
        cycle: 1,
        movesRemaining: 0,
        weekBoss: 'BROODMOTHER',
      };

      const result = advanceTimePhase(time);

      expect(result.phase).toBe(TimePhase.Day);
      expect(result.cycle).toBe(2);
      expect(result.movesRemaining).toBe(PHASE_MOVES[TimePhase.Day]);
    });

    it('transitions Night 3 to Boss phase', () => {
      const time: TimeState = {
        week: 1,
        phase: TimePhase.Night,
        cycle: 3,
        movesRemaining: 0,
        weekBoss: 'BROODMOTHER',
      };

      const result = advanceTimePhase(time);

      expect(result.phase).toBe(TimePhase.Boss);
      expect(result.cycle).toBe(3);
      expect(result.movesRemaining).toBe(0);
    });

    it('does not advance if moves remain', () => {
      const time: TimeState = {
        week: 1,
        phase: TimePhase.Day,
        cycle: 1,
        movesRemaining: 25,
        weekBoss: 'BROODMOTHER',
      };

      const result = advanceTimePhase(time);
      expect(result).toEqual(time);
    });
  });

  describe('shouldTriggerBoss', () => {
    it('returns true after Night 3 ends', () => {
      const time: TimeState = {
        week: 1,
        phase: TimePhase.Night,
        cycle: 3,
        movesRemaining: 0,
        weekBoss: 'BROODMOTHER',
      };

      expect(shouldTriggerBoss(time)).toBe(true);
    });

    it('returns false during Day phase', () => {
      const time: TimeState = {
        week: 1,
        phase: TimePhase.Day,
        cycle: 3,
        movesRemaining: 0,
        weekBoss: 'BROODMOTHER',
      };

      expect(shouldTriggerBoss(time)).toBe(false);
    });

    it('returns false during Night 1 or 2', () => {
      const time1: TimeState = {
        week: 1,
        phase: TimePhase.Night,
        cycle: 1,
        movesRemaining: 0,
        weekBoss: 'BROODMOTHER',
      };

      const time2: TimeState = {
        week: 1,
        phase: TimePhase.Night,
        cycle: 2,
        movesRemaining: 0,
        weekBoss: 'BROODMOTHER',
      };

      expect(shouldTriggerBoss(time1)).toBe(false);
      expect(shouldTriggerBoss(time2)).toBe(false);
    });

    it('returns false if moves remaining', () => {
      const time: TimeState = {
        week: 1,
        phase: TimePhase.Night,
        cycle: 3,
        movesRemaining: 5,
        weekBoss: 'BROODMOTHER',
      };

      expect(shouldTriggerBoss(time)).toBe(false);
    });
  });

  describe('getCurrentSightRadius', () => {
    it('returns 5 during Day', () => {
      expect(getCurrentSightRadius(TimePhase.Day)).toBe(5);
    });

    it('returns 3 during Night', () => {
      expect(getCurrentSightRadius(TimePhase.Night)).toBe(3);
    });

    it('returns 0 during Boss phase', () => {
      expect(getCurrentSightRadius(TimePhase.Boss)).toBe(0);
    });
  });

  describe('full Day/Night cycle simulation', () => {
    it('completes 3 Day/Night cycles then triggers boss', () => {
      const rng = new SeededRNG(12345);
      let time = createInitialTimeState(rng);

      // Track phases we go through
      const phases: { phase: TimePhase; cycle: number }[] = [];

      // Simulate consuming all moves for each phase
      while (time.phase !== TimePhase.Boss) {
        phases.push({ phase: time.phase, cycle: time.cycle });

        // Consume all remaining moves
        while (time.movesRemaining > 0) {
          time = consumeMove(time, 1);
        }

        // Check if boss should trigger
        if (shouldTriggerBoss(time)) {
          time = advanceTimePhase(time);
          break;
        }

        time = advanceTimePhase(time);
      }

      // Should have gone through: Day1, Night1, Day2, Night2, Day3, Night3
      expect(phases).toEqual([
        { phase: TimePhase.Day, cycle: 1 },
        { phase: TimePhase.Night, cycle: 1 },
        { phase: TimePhase.Day, cycle: 2 },
        { phase: TimePhase.Night, cycle: 2 },
        { phase: TimePhase.Day, cycle: 3 },
        { phase: TimePhase.Night, cycle: 3 },
      ]);

      expect(time.phase).toBe(TimePhase.Boss);
    });
  });
});

describe('Boss Selection (T061)', () => {
  describe('selectWeekBoss', () => {
    it('selects from Week 1 pool (4 bosses)', () => {
      const week1Bosses = new Set<BossId>();

      // Run multiple seeds to see variety
      for (let seed = 0; seed < 100; seed++) {
        const rng = new SeededRNG(seed);
        const boss = selectWeekBoss(1, rng);
        week1Bosses.add(boss);
      }

      // Should only select from Week 1 pool
      week1Bosses.forEach(boss => {
        expect(BOSS_POOLS[1]).toContain(boss);
      });

      // With enough seeds, should see multiple bosses
      expect(week1Bosses.size).toBeGreaterThan(1);
    });

    it('selects from Week 2 pool (2 bosses)', () => {
      const week2Bosses = new Set<BossId>();

      for (let seed = 0; seed < 100; seed++) {
        const rng = new SeededRNG(seed);
        const boss = selectWeekBoss(2, rng);
        week2Bosses.add(boss);
      }

      week2Bosses.forEach(boss => {
        expect(BOSS_POOLS[2]).toContain(boss);
      });

      // Should see both Week 2 bosses
      expect(week2Bosses.size).toBe(2);
    });

    it('always selects ELDRITCH_MOLE for Week 3', () => {
      for (let seed = 0; seed < 50; seed++) {
        const rng = new SeededRNG(seed);
        const boss = selectWeekBoss(3, rng);
        expect(boss).toBe('ELDRITCH_MOLE');
      }
    });

    it('produces deterministic selection with same seed', () => {
      const rng1 = new SeededRNG(999);
      const rng2 = new SeededRNG(999);

      expect(selectWeekBoss(1, rng1)).toBe(selectWeekBoss(1, rng2));
    });
  });

  describe('boss selection distribution', () => {
    it('Week 1 bosses have roughly equal probability', () => {
      const counts: Record<BossId, number> = {
        BROODMOTHER: 0,
        OBSIDIAN_GOLEM: 0,
        GAS_ANOMALY: 0,
        MAD_MINER: 0,
        DRILL_SERGEANT: 0,
        CRYSTAL_MIMIC: 0,
        ELDRITCH_MOLE: 0,
      };

      const iterations = 1000;
      for (let seed = 0; seed < iterations; seed++) {
        const rng = new SeededRNG(seed);
        const boss = selectWeekBoss(1, rng);
        counts[boss]++;
      }

      // Each Week 1 boss should be selected roughly 25% of the time (250 +/- 100)
      BOSS_POOLS[1].forEach(boss => {
        expect(counts[boss]).toBeGreaterThan(150);
        expect(counts[boss]).toBeLessThan(350);
      });

      // Week 2 and 3 bosses should never be selected for Week 1
      expect(counts.DRILL_SERGEANT).toBe(0);
      expect(counts.CRYSTAL_MIMIC).toBe(0);
      expect(counts.ELDRITCH_MOLE).toBe(0);
    });
  });

  describe('week progression with boss selection', () => {
    it('selects new boss when advancing to next week', () => {
      const rng = new SeededRNG(42);

      const week1Boss = selectWeekBoss(1, rng);
      const week2Boss = selectWeekBoss(2, rng);
      const week3Boss = selectWeekBoss(3, rng);

      expect(BOSS_POOLS[1]).toContain(week1Boss);
      expect(BOSS_POOLS[2]).toContain(week2Boss);
      expect(week3Boss).toBe('ELDRITCH_MOLE');
    });
  });
});
