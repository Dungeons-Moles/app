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

  // Player (base stats before items)
  // NOTE: INITIAL_HP is for PvP / default fallback (campaign level 20+); PvP modes now start at 20 HP.
  // Campaign HP scales by level — use getBaseHp(campaignLevel) instead.
  INITIAL_HP: 20,
  INITIAL_ATK: 0,
  INITIAL_ARM: 0,
  INITIAL_SPD: 0,
  INITIAL_DIG: 1,
  INITIAL_GOLD: 0,

  // Inventory
  INITIAL_INVENTORY_SLOTS: 4,
  INVENTORY_SLOTS_PER_WEEK: 2,
  MAX_INVENTORY_SLOTS: 8,

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

/**
 * Get base HP for a campaign level.
 * Matches on-chain `base_hp()` in gameplay-state/constants.rs.
 * Levels 1-9: 25 HP, 10-19: 22 HP, 20+: 18 HP.
 * PvP modes always use level 20+ (20 HP).
 */
export function getBaseHp(campaignLevel: number): number {
  if (campaignLevel >= 1 && campaignLevel <= 9) return 25;
  if (campaignLevel >= 10 && campaignLevel <= 19) return 22;
  return 18;
}

export function getBaseGold(campaignLevel: number): number {
  if (campaignLevel >= 1 && campaignLevel <= 5) return 10;
  if (campaignLevel >= 6 && campaignLevel <= 10) return 8;
  if (campaignLevel >= 11 && campaignLevel <= 15) return 5;
  if (campaignLevel >= 16 && campaignLevel <= 20) return 3;
  if (campaignLevel >= 21 && campaignLevel <= 30) return 2;
  return 0;
}

export function getActForCampaignLevel(campaignLevel: number): 1 | 2 | 3 | 4 {
  if (campaignLevel <= 10) return 1;
  if (campaignLevel <= 20) return 2;
  if (campaignLevel <= 30) return 3;
  return 4;
}

export function getStageInAct(campaignLevel: number): number {
  return ((campaignLevel - 1) % 10) + 1;
}

// ============================================================================
// Time Phase Constants
// ============================================================================

export const PHASE_MOVES: Record<TimePhase, number> = {
  [TimePhase.Day]: 50,
  [TimePhase.Night]: 30,
  [TimePhase.Boss]: 0,
};

export const WEEK_PHASES: TimePhase[] = [
  TimePhase.Day, // Day 1
  TimePhase.Night, // Night 1
  TimePhase.Day, // Day 2
  TimePhase.Night, // Night 2
  TimePhase.Day, // Day 3
  TimePhase.Night, // Night 3
  TimePhase.Boss, // Boss fight
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

// Boss pools by week - Biome A for now (can expand to biome selection later)
export const BOSS_POOLS: Record<1 | 2 | 3, BossId[]> = {
  1: ['B-A-W1-01', 'B-A-W1-02', 'B-A-W1-03', 'B-A-W1-04', 'B-A-W1-05'],
  2: ['B-A-W2-01', 'B-A-W2-02', 'B-A-W2-03', 'B-A-W2-04', 'B-A-W2-05'],
  3: ['B-A-W3-01', 'B-A-W3-02'],
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
