/**
 * Item Entity Logic - T075
 * Tool and Gear definitions, stat calculations, and instance creation
 * @see specs/001-pve-dungeon-crawler/data-model.md
 * @see specs/001-pve-dungeon-crawler/spec.md Appendix C, D
 */

import type {
  Tool,
  Gear,
  ToolId,
  GearId,
  ItemRarity,
  ItemStats,
  ItemTag,
  EffectTiming,
} from '../engine/types';
import { GEAR_DEFINITIONS, RARITY_MULTIPLIER, createGearInstance as createGearFromData } from '../../data/gear';

// ============================================================================
// Tool Definitions (per spec.md Appendix C)
// ============================================================================

export interface ToolDefinition {
  id: ToolId;
  name: string;
  emoji: string;
  rarity: ItemRarity;
  stats: ItemStats;
  tags: ItemTag[];
  effect?: {
    timing: EffectTiming;
    description: string;
  };
}

/**
 * All tool definitions per spec.md Appendix C
 */
export const TOOL_DEFINITIONS: Record<ToolId, ToolDefinition> = {
  T1: {
    id: 'T1',
    name: 'Rusty Pickaxe',
    emoji: '⛏️',
    rarity: 'COMMON',
    stats: { atk: 3 },
    tags: ['STONE'],
  },
  T2: {
    id: 'T2',
    name: 'Reinforced Shovel',
    emoji: '🛠️',
    rarity: 'COMMON',
    stats: { atk: 1, arm: 6 },
    tags: ['STONE'],
  },
  T3: {
    id: 'T3',
    name: 'Twin Picks',
    emoji: '⛏️⛏️',
    rarity: 'COMMON',
    stats: { atk: 1 },
    tags: ['SCOUT'],
    effect: {
      timing: 'ON_HIT',
      description: 'Strike twice each turn',
    },
  },
  T4: {
    id: 'T4',
    name: "Prospector's Pike",
    emoji: '🗡️',
    rarity: 'COMMON',
    stats: { atk: 2, dig: 2 },
    tags: ['SCOUT'],
  },
  T5: {
    id: 'T5',
    name: 'Pneumatic Drill',
    emoji: '🌀',
    rarity: 'RARE',
    stats: { atk: 1 },
    tags: ['SCOUT'],
    effect: {
      timing: 'ON_HIT',
      description: 'Strike 3 times each turn',
    },
  },
  T6: {
    id: 'T6',
    name: 'Shadow Burrowblade',
    emoji: '🗡️',
    rarity: 'RARE',
    stats: { atk: 2 },
    tags: ['SCOUT'],
    effect: {
      timing: 'ON_HIT',
      description: 'On Hit: strikes ignore Armor',
    },
  },
  T7: {
    id: 'T7',
    name: 'Gemfinder Staff',
    emoji: '🔮',
    rarity: 'HEROIC',
    stats: { atk: 1, arm: 1, dig: 1 },
    tags: ['GREED'],
    effect: {
      timing: 'ON_HIT',
      description: 'Gains On-Hit effects from Shards',
    },
  },
  T8: {
    id: 'T8',
    name: 'Tempest Drill',
    emoji: '🌪️',
    rarity: 'MYTHIC',
    stats: {},
    tags: ['SCOUT'],
    effect: {
      timing: 'BEFORE_ATTACK',
      description: 'Attack equals your DIG',
    },
  },
};

// ============================================================================
// Rarity Multipliers
// ============================================================================

/**
 * Get the stat multiplier for a given rarity
 * Only COMMON can be upgraded to GILDED (1.5x) or DIAMOND (2.0x)
 * RARE, HEROIC, MYTHIC are fixed rarities with no multiplier
 */
export function applyRarityMultiplier(rarity: ItemRarity): number {
  return RARITY_MULTIPLIER[rarity];
}

// ============================================================================
// Tool Functions
// ============================================================================

/**
 * Get tool definition by ID
 */
export function getToolDefinition(id: ToolId): ToolDefinition {
  return TOOL_DEFINITIONS[id];
}

/**
 * Get all tool definitions as an array
 */
export function getAllToolDefinitions(): ToolDefinition[] {
  return Object.values(TOOL_DEFINITIONS);
}

/**
 * Create a tool instance from a definition
 */
export function createToolInstance(id: ToolId): Tool {
  const def = getToolDefinition(id);
  return {
    id: def.id,
    name: def.name,
    emoji: def.emoji,
    rarity: def.rarity,
    stats: { ...def.stats },
    tags: [...def.tags],
  };
}

// ============================================================================
// Gear Functions (re-export from data/gear.ts with additions)
// ============================================================================

export { GEAR_DEFINITIONS } from '../../data/gear';

/**
 * Get gear definition by ID
 */
export function getGearDefinition(id: GearId) {
  return GEAR_DEFINITIONS[id];
}

/**
 * Get all gear definitions as an array
 */
export function getAllGearDefinitions() {
  return Object.values(GEAR_DEFINITIONS);
}

/**
 * Create a gear instance from a definition with optional rarity upgrade
 */
export function createGearInstance(
  id: GearId,
  currentRarity?: ItemRarity
): Gear {
  const result = createGearFromData(id, currentRarity);
  return {
    id: result.id,
    name: result.name,
    emoji: result.emoji,
    baseRarity: result.baseRarity,
    currentRarity: result.currentRarity,
    stats: result.stats,
    tags: result.tags,
  };
}

// ============================================================================
// Stat Calculation Functions
// ============================================================================

/**
 * Calculate combined stats from equipped tool and gear
 * Returns total bonuses from all equipment
 */
export function calculateItemStats(
  tool: Tool | null,
  gear: Gear[]
): ItemStats {
  const result: ItemStats = {
    atk: 0,
    arm: 0,
    spd: 0,
    dig: 0,
    hp: 0,
  };

  // Add tool stats
  if (tool) {
    result.atk = (result.atk ?? 0) + (tool.stats.atk ?? 0);
    result.arm = (result.arm ?? 0) + (tool.stats.arm ?? 0);
    result.spd = (result.spd ?? 0) + (tool.stats.spd ?? 0);
    result.dig = (result.dig ?? 0) + (tool.stats.dig ?? 0);
    result.hp = (result.hp ?? 0) + (tool.stats.hp ?? 0);
  }

  // Add gear stats
  for (const item of gear) {
    result.atk = (result.atk ?? 0) + (item.stats.atk ?? 0);
    result.arm = (result.arm ?? 0) + (item.stats.arm ?? 0);
    result.spd = (result.spd ?? 0) + (item.stats.spd ?? 0);
    result.dig = (result.dig ?? 0) + (item.stats.dig ?? 0);
    result.hp = (result.hp ?? 0) + (item.stats.hp ?? 0);
  }

  return result;
}

/**
 * Get tools by rarity
 */
export function getToolsByRarity(rarity: ItemRarity): ToolDefinition[] {
  return getAllToolDefinitions().filter((tool) => tool.rarity === rarity);
}

/**
 * Get tools by tag
 */
export function getToolsByTag(tag: ItemTag): ToolDefinition[] {
  return getAllToolDefinitions().filter((tool) => tool.tags.includes(tag));
}
