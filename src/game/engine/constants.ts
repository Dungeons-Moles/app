/**
 * Game constants for PvE Dungeon Crawler
 * @see specs/001-pve-dungeon-crawler/data-model.md
 */

import type { ItemRarity, BossId } from './types';
import { TimePhase } from './types';

// ============================================================================
// Main Game Constants
// ============================================================================

export const GAME_CONSTANTS = {
  // Map
  MAP_WIDTH: 50,
  MAP_HEIGHT: 50,
  INITIAL_SIGHT_RADIUS: 6,

  // Player
  INITIAL_HP: 10,
  INITIAL_ATK: 0,
  INITIAL_ARM: 0,
  INITIAL_SPD: 0,
  INITIAL_DIG: 1,
  INITIAL_GOLD: 0,

  // Inventory
  INITIAL_INVENTORY_SLOTS: 4,
  INVENTORY_SLOTS_PER_WEEK: 2,
  MAX_INVENTORY_SLOTS: 12,

  // Time
  DAY_MOVES: 50,
  NIGHT_MOVES: 30,
  CYCLES_PER_WEEK: 3,
  TOTAL_WEEKS: 3,

  // Combat
  MAX_COMBAT_LOG_ENTRIES: 100,
  VICTORY_DISPLAY_MS: 3000,
  DEFEAT_DISPLAY_MS: 3000,

  // POI
  POI_MIN_SPACING: 10,

  // Performance
  TARGET_FPS: 60,
  FRAME_BUDGET_MS: 16,
} as const;

// ============================================================================
// Time Phase Constants
// ============================================================================

export const PHASE_MOVES: Record<TimePhase, number> = {
  [TimePhase.Day]: 50,
  [TimePhase.Night]: 30,
  [TimePhase.Boss]: 0,
};

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
// Sight Radius
// ============================================================================

export const SIGHT_RADIUS = {
  day: 4,
  night: 2,
} as const;

// ============================================================================
// Rarity Multipliers
// ============================================================================

export const RARITY_MULTIPLIER: Record<ItemRarity, number> = {
  COMMON: 1.0,
  GILDED: 2.0,
  DIAMOND: 4.0,
  RARE: 1.0,
  HEROIC: 1.0,
  MYTHIC: 1.0,
};

// ============================================================================
// Boss Pools
// ============================================================================

export const BOSS_POOLS: Record<1 | 2 | 3, BossId[]> = {
  1: ['BROODMOTHER', 'OBSIDIAN_GOLEM', 'GAS_ANOMALY', 'MAD_MINER'],
  2: ['DRILL_SERGEANT', 'CRYSTAL_MIMIC'],
  3: ['ELDRITCH_MOLE'],
};

// ============================================================================
// Wall Break
// ============================================================================

/**
 * Wall break cost calculation constants.
 * Formula: digMoves = max(2, 6 - DIG)
 * Minimum cost is 2 moves (reached at DIG >= 4)
 */
export const WALL_BREAK_BASE_COST = 6;
export const WALL_BREAK_MIN_COST = 2;
export const WALL_BREAK_MIN_DIG = 1;

// ============================================================================
// Spawn Zones
// ============================================================================

/**
 * Spawn placement zone radiuses (Manhattan distance from spawn).
 */
export const SPAWN_PROTECTION_RADIUS = 5;
export const MID_ZONE_RADIUS = 10;

/**
 * Enemy tier weights by zone.
 * Index 0 = T1 weight, Index 1 = T2 weight, Index 2 = T3 weight
 */
export const ZONE_TIER_WEIGHTS: Record<number, [number, number, number]> = {
  0: [1.0, 0.0, 0.0],
  1: [0.6, 0.4, 0.0],
  2: [0.3, 0.4, 0.3],
};
