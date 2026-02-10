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
// Boss Selection (T064) - Deterministic, matches on-chain boss-system logic
// ============================================================================

const LEVELS_PER_ACT = 10;

/**
 * Deterministic boss selection matching the on-chain boss-system crate.
 * Boss is determined by campaign_level and week — no RNG involved.
 *
 * On-chain logic (crates/boss-system/src/selection.rs):
 * - Week 1: boss_index = (stage_in_act - 1) % 5
 * - Week 2: boss_index = ((stage_in_act - 1) + 2) % 5
 * - Week 3: odd stages = index 0, even stages = index 1
 * - Biome: even acts (0,2) = A, odd acts (1,3) = B
 *
 * @param campaignLevel - Campaign level (1-40)
 * @param week - Week number (1, 2, or 3)
 * @returns Selected BossId
 */
export function selectWeekBossForLevel(campaignLevel: number, week: 1 | 2 | 3): BossId {
  const act = Math.floor((campaignLevel - 1) / LEVELS_PER_ACT);
  const stageInAct = ((campaignLevel - 1) % LEVELS_PER_ACT) + 1;
  const biome = act % 2 === 0 ? 'A' : 'B';

  let bossIndex: number;
  switch (week) {
    case 1:
      bossIndex = (stageInAct - 1) % 5;
      break;
    case 2:
      bossIndex = ((stageInAct - 1) + 2) % 5;
      break;
    case 3:
      bossIndex = stageInAct % 2 === 1 ? 0 : 1;
      break;
  }

  // Boss IDs follow pattern: B-{biome}-W{week}-{index+1 padded}
  const paddedIndex = String(bossIndex + 1).padStart(2, '0');
  return `B-${biome}-W${week}-${paddedIndex}` as BossId;
}

/**
 * Selects a boss for the given week using RNG (guest mode only).
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

/**
 * Calculates available moves for an action that can span phase transitions.
 * For actions like wall breaking, we allow spending moves from the current phase
 * plus moves from the next phase if needed.
 *
 * @param time - Current time state
 * @returns Total available moves (current + next phase if applicable)
 */
export function getAvailableMovesAcrossPhases(time: TimeState): number {
  // Boss phase has no moves
  if (time.phase === TimePhase.Boss) {
    return 0;
  }

  const currentMoves = time.movesRemaining;

  // Day can transition to Night (same cycle)
  if (time.phase === TimePhase.Day) {
    return currentMoves + PHASE_MOVES[TimePhase.Night];
  }

  // Night can transition to Day (next cycle) or Boss (after Night 3)
  if (time.phase === TimePhase.Night) {
    if (time.cycle === 3) {
      // Night 3 -> Boss, no additional moves available
      return currentMoves;
    }
    // Night 1 or 2 -> next Day
    return currentMoves + PHASE_MOVES[TimePhase.Day];
  }

  return currentMoves;
}

/**
 * Checks if a cost can be afforded, potentially spanning phase transitions.
 * Used for actions like wall breaking that should work across day/night boundaries.
 *
 * @param time - Current time state
 * @param cost - Number of moves required
 * @returns True if the cost can be afforded
 */
export function canAffordCostAcrossPhases(time: TimeState, cost: number): boolean {
  return getAvailableMovesAcrossPhases(time) >= cost;
}

/**
 * Consumes moves across phase transitions if needed.
 * If the cost exceeds current phase moves, the remainder is taken from the next phase.
 *
 * @param time - Current time state
 * @param cost - Number of moves to consume
 * @returns Updated time state after consuming moves (may be in a new phase)
 */
export function consumeMoveAcrossPhases(time: TimeState, cost: number): TimeState {
  // If we have enough moves in current phase, just consume normally
  if (time.movesRemaining >= cost) {
    return consumeMove(time, cost);
  }

  // Not enough in current phase - need to span across phases
  const remainingCost = cost - time.movesRemaining;

  // First, consume all remaining moves in current phase
  let newTime = consumeMove(time, time.movesRemaining);

  // Advance to next phase
  newTime = advanceTimePhase(newTime);

  // Then consume the remainder from the new phase
  return consumeMove(newTime, remainingCost);
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
  return time.phase === TimePhase.Night && time.cycle === 3 && time.movesRemaining === 0;
}

// ============================================================================
// Sight Radius
// ============================================================================

/**
 * Gets the current sight radius based on time phase.
 * Day: 4 tiles, Night: 2 tiles, Boss: 0 (not applicable)
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
export function advanceToNextWeek(time: TimeState, rng: SeededRNG): TimeState | null {
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
