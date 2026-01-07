/**
 * Time Progression Logic (T062-T065)
 * Handles Day/Night cycles, move consumption, and boss triggers
 * @see specs/001-pve-dungeon-crawler/spec.md - User Story 3
 * @see specs/001-pve-dungeon-crawler/data-model.md - TimeState
 */

import type { TimeState, BossId } from '../engine/types';
import { TimePhase } from '../engine/types';
import { PHASE_MOVES, BOSS_POOLS, SIGHT_RADIUS, GAME_CONSTANTS } from '../engine/constants';
import type { SeededRNG } from '../engine/rng';

// ============================================================================
// Time State Factory
// ============================================================================

/**
 * Creates the initial time state for a new game (Week 1, Day 1).
 * Selects the week's boss using the provided RNG.
 *
 * @param rng - Seeded RNG for deterministic boss selection
 * @returns Initial TimeState for Week 1
 */
export function createInitialTimeState(rng: SeededRNG): TimeState {
  return {
    week: 1,
    phase: TimePhase.Day,
    cycle: 1,
    movesRemaining: PHASE_MOVES[TimePhase.Day],
    weekBoss: selectWeekBoss(1, rng),
  };
}

/**
 * Creates time state for a specific week (used when advancing weeks).
 *
 * @param week - Week number (1, 2, or 3)
 * @param rng - Seeded RNG for boss selection
 * @returns TimeState for the start of the specified week
 */
export function createWeekTimeState(week: 1 | 2 | 3, rng: SeededRNG): TimeState {
  return {
    week,
    phase: TimePhase.Day,
    cycle: 1,
    movesRemaining: PHASE_MOVES[TimePhase.Day],
    weekBoss: selectWeekBoss(week, rng),
  };
}

// ============================================================================
// Boss Selection (T064)
// ============================================================================

/**
 * Selects a boss for the given week from the appropriate pool.
 * Week 1: Random from 4 Gatekeepers
 * Week 2: Random from 2 Filters
 * Week 3: Always The Eldritch Mole
 *
 * @param week - Week number (1, 2, or 3)
 * @param rng - Seeded RNG for deterministic selection
 * @returns Selected BossId
 */
export function selectWeekBoss(week: 1 | 2 | 3, rng: SeededRNG): BossId {
  const pool = BOSS_POOLS[week];
  return rng.pick(pool);
}

// ============================================================================
// Move Consumption (T066)
// ============================================================================

/**
 * Consumes moves from the time state.
 * Used when the player moves through the dungeon.
 *
 * @param time - Current time state
 * @param cost - Number of moves to consume (1 for normal tiles, 2 for Hard Rock)
 * @returns Updated time state with decremented moves
 */
export function consumeMove(time: TimeState, cost: number): TimeState {
  const newMoves = Math.max(0, time.movesRemaining - cost);
  return {
    ...time,
    movesRemaining: newMoves,
  };
}

// ============================================================================
// Time Phase Transitions (T063)
// ============================================================================

/**
 * Advances the time phase if moves have been exhausted.
 * Handles Day->Night, Night->Day, and Night 3->Boss transitions.
 *
 * @param time - Current time state
 * @returns Updated time state (or same state if moves remain)
 */
export function advanceTimePhase(time: TimeState): TimeState {
  // Don't advance if moves remain
  if (time.movesRemaining > 0) {
    return time;
  }

  // Already in Boss phase - no further advancement
  if (time.phase === TimePhase.Boss) {
    return time;
  }

  // Day -> Night transition (same cycle)
  if (time.phase === TimePhase.Day) {
    return {
      ...time,
      phase: TimePhase.Night,
      movesRemaining: PHASE_MOVES[TimePhase.Night],
    };
  }

  // Night -> Day or Night 3 -> Boss transition
  if (time.phase === TimePhase.Night) {
    // Night 3 ends -> Boss fight
    if (time.cycle === 3) {
      return {
        ...time,
        phase: TimePhase.Boss,
        movesRemaining: 0,
      };
    }

    // Night 1 or 2 -> Next Day
    const nextCycle = (time.cycle + 1) as 1 | 2 | 3;
    return {
      ...time,
      phase: TimePhase.Day,
      cycle: nextCycle,
      movesRemaining: PHASE_MOVES[TimePhase.Day],
    };
  }

  return time;
}

// ============================================================================
// Boss Trigger Detection (T065)
// ============================================================================

/**
 * Checks if the boss fight should be triggered.
 * Returns true after Night 3 ends (moves = 0).
 *
 * @param time - Current time state
 * @returns True if boss should be triggered
 */
export function shouldTriggerBoss(time: TimeState): boolean {
  return (
    time.phase === TimePhase.Night &&
    time.cycle === 3 &&
    time.movesRemaining === 0
  );
}

// ============================================================================
// Sight Radius
// ============================================================================

/**
 * Gets the current sight radius based on time phase.
 * Day: 5 tiles, Night: 3 tiles, Boss: 0 (not applicable)
 *
 * @param phase - Current time phase
 * @returns Sight radius in tiles
 */
export function getCurrentSightRadius(phase: TimePhase): number {
  switch (phase) {
    case TimePhase.Day:
      return SIGHT_RADIUS.day;
    case TimePhase.Night:
      return SIGHT_RADIUS.night;
    case TimePhase.Boss:
      return 0;
    default:
      return SIGHT_RADIUS.day;
  }
}

// ============================================================================
// Week Advancement
// ============================================================================

/**
 * Advances to the next week after defeating the boss.
 * Creates new time state for the next week with a new boss.
 *
 * @param time - Current time state (should be in Boss phase after victory)
 * @param rng - Seeded RNG for boss selection
 * @returns New time state for next week, or null if Week 3 completed
 */
export function advanceToNextWeek(
  time: TimeState,
  rng: SeededRNG
): TimeState | null {
  if (time.week === 3) {
    // Game victory - no more weeks
    return null;
  }

  const nextWeek = (time.week + 1) as 1 | 2 | 3;
  return createWeekTimeState(nextWeek, rng);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Gets a human-readable description of the current time.
 *
 * @param time - Current time state
 * @returns Description like "Week 1, Day 2" or "Week 2, Night 3"
 */
export function getTimeDescription(time: TimeState): string {
  if (time.phase === TimePhase.Boss) {
    return `Week ${time.week}, Boss Fight`;
  }
  return `Week ${time.week}, ${time.phase === TimePhase.Day ? 'Day' : 'Night'} ${time.cycle}`;
}

/**
 * Calculates the total progress through the current week (0-1).
 * Used for progress bar display.
 *
 * @param time - Current time state
 * @returns Progress value from 0 (start of Day 1) to 1 (Boss phase)
 */
export function getWeekProgress(time: TimeState): number {
  if (time.phase === TimePhase.Boss) {
    return 1;
  }

  // Total phases in a week: Day1, Night1, Day2, Night2, Day3, Night3 = 6 phases
  // Each phase counts as 1/7th (with Boss being the 7th)
  const cycleIndex = (time.cycle - 1) * 2; // 0, 2, 4
  const phaseOffset = time.phase === TimePhase.Night ? 1 : 0;
  const currentPhaseIndex = cycleIndex + phaseOffset;

  const totalMoves = PHASE_MOVES[time.phase];
  const movesUsed = totalMoves - time.movesRemaining;
  const phaseProgress = movesUsed / totalMoves;

  // Progress: (currentPhaseIndex + phaseProgress) / 7
  return (currentPhaseIndex + phaseProgress) / 7;
}

/**
 * Checks if it's currently night time.
 *
 * @param time - Current time state
 * @returns True if in Night phase
 */
export function isNightTime(time: TimeState): boolean {
  return time.phase === TimePhase.Night;
}

/**
 * Checks if it's currently day time.
 *
 * @param time - Current time state
 * @returns True if in Day phase
 */
export function isDayTime(time: TimeState): boolean {
  return time.phase === TimePhase.Day;
}
