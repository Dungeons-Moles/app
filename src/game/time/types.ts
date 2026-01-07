/**
 * Time types for PvE Dungeon Crawler
 * Re-exports from engine/types.ts with additional time-specific constants
 * @see specs/001-pve-dungeon-crawler/data-model.md
 */

// Re-export time types from engine
export { TimePhase, TimeState, BossId } from '../engine/types';

import { TimePhase } from '../engine/types';

// ============================================================================
// Phase Move Limits
// ============================================================================

export const PHASE_MOVES: Record<TimePhase, number> = {
  [TimePhase.Day]: 50,
  [TimePhase.Night]: 30,
  [TimePhase.Boss]: 0,
};

// ============================================================================
// Week Structure
// ============================================================================

export const WEEK_PHASES: TimePhase[] = [
  TimePhase.Day,   // Day 1
  TimePhase.Night, // Night 1
  TimePhase.Day,   // Day 2
  TimePhase.Night, // Night 2
  TimePhase.Day,   // Day 3
  TimePhase.Night, // Night 3
  TimePhase.Boss,  // Boss fight
];

// ============================================================================
// Sight Radius by Time Phase
// ============================================================================

export const SIGHT_RADIUS: Record<'day' | 'night', number> = {
  day: 5,
  night: 3,
};
