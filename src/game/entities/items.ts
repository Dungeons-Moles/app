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
import {
  GEAR_DEFINITIONS,
  RARITY_MULTIPLIER,
  createGearInstance as createGearFromData,
} from '../../data/gear';

// ============================================================================
// Tool Definitions (per spec.md Appendix C)
// ============================================================================

export interface ToolDefinition {
  id: ToolId;
  name: string;
  emoji: string;
  image?: any;
  rarity: ItemRarity;
  stats: ItemStats;
  tags: ItemTag[];
  effect?: {
    timing: EffectTiming;
    description: string;
  };
}

/**
 * All tool definitions per GDD (16 tools: 2 per tag)
 * @see docs/gdd.md Section 9: Item System
 */
export const TOOL_DEFINITIONS: Record<ToolId, ToolDefinition> = {
  // ============================================================================
  // STARTER (1 tool: T0)
  // ============================================================================
  T0: {
    id: 'T0',
    name: 'Basic Pickaxe',
    emoji: '⛏️',
    image: require('../../../assets/icons/stats/DIG.png'),
    rarity: 'COMMON',
    stats: { atk: 1 },
    tags: [],
  },
  // ============================================================================
  // STONE (2 tools: T1, T2)
  // ============================================================================
  T1: {
    id: 'T1',
    name: 'Bulwark Shovel',
    emoji: '🛠️',
    image: require('../../../assets/icons/items/stone/bulwark_shovel.png'),
    rarity: 'COMMON',
    stats: { atk: 1, arm: 4 },
    tags: ['STONE'],
  },
  T2: {
    id: 'T2',
    name: 'Cragbreaker Hammer',
    emoji: '🔨',
    image: require('../../../assets/icons/items/stone/cragbreaker_hammer.png'),
    rarity: 'RARE',
    stats: { atk: 2, arm: 3 },
    tags: ['STONE'],
    effect: {
      timing: 'ON_HIT',
      description: 'First strike each turn removes 1 enemy Armor before damage',
    },
  },
  // ============================================================================
  // SCOUT (2 tools: T3, T4)
  // ============================================================================
  T3: {
    id: 'T3',
    name: 'Twin Picks',
    emoji: '⛏️⛏️',
    image: require('../../../assets/icons/items/scout/twin_picks.png'),
    rarity: 'COMMON',
    stats: { atk: 1 },
    tags: ['SCOUT'],
    effect: {
      timing: 'ON_HIT',
      description: 'Strike 2 times per turn',
    },
  },
  T4: {
    id: 'T4',
    name: 'Pneumatic Drill',
    emoji: '🌀',
    image: require('../../../assets/icons/items/scout/pneumatic_drill.png'),
    rarity: 'RARE',
    stats: { atk: 1 },
    tags: ['SCOUT'],
    effect: {
      timing: 'ON_HIT',
      description: 'Strike 3 times per turn',
    },
  },
  // ============================================================================
  // GREED (2 tools: T5, T6)
  // ============================================================================
  T5: {
    id: 'T5',
    name: 'Glittering Pick',
    emoji: '✨⛏️',
    image: require('../../../assets/icons/items/greed/glittering_pick.png'),
    rarity: 'COMMON',
    stats: { atk: 1 },
    tags: ['GREED'],
    effect: {
      timing: 'ON_HIT',
      description: 'On Hit (once/turn): gain 1 Gold',
    },
  },
  T6: {
    id: 'T6',
    name: 'Gemfinder Staff',
    emoji: '🔮',
    image: require('../../../assets/icons/items/greed/gemfinder_staff.png'),
    rarity: 'HEROIC',
    stats: { atk: 1, arm: 1, dig: 1 },
    tags: ['GREED'],
    effect: {
      timing: 'ON_HIT',
      description: 'First hit each turn triggers all your Shard effects',
    },
  },
  // ============================================================================
  // BLAST (2 tools: T7, T8)
  // ============================================================================
  T7: {
    id: 'T7',
    name: 'Fuse Pick',
    emoji: '🔥⛏️',
    image: require('../../../assets/icons/items/blast/fuse_pick.png'),
    rarity: 'COMMON',
    stats: { atk: 1 },
    tags: ['BLAST'],
    effect: {
      timing: 'ON_HIT',
      description: 'First hit each turn: deal 1 non-weapon damage',
    },
  },
  T8: {
    id: 'T8',
    name: 'Spark Pick',
    emoji: '⚡⛏️',
    image: require('../../../assets/icons/items/blast/spark_pick.png'),
    rarity: 'RARE',
    stats: { atk: 1 },
    tags: ['BLAST'],
    effect: {
      timing: 'ON_HIT',
      description: 'On Hit (once/turn): reduce your highest Countdown by 1',
    },
  },
  // ============================================================================
  // FROST (2 tools: T9, T10)
  // ============================================================================
  T9: {
    id: 'T9',
    name: 'Rime Pike',
    emoji: '❄️🗡️',
    image: require('../../../assets/icons/items/frost/rime_pike.png'),
    rarity: 'COMMON',
    stats: { atk: 2 },
    tags: ['FROST'],
    effect: {
      timing: 'ON_HIT',
      description: 'On Hit (once/turn): apply 1 Chill',
    },
  },
  T10: {
    id: 'T10',
    name: 'Glacier Fang',
    emoji: '🦷❄️',
    image: require('../../../assets/icons/items/frost/glacier_fang.png'),
    rarity: 'RARE',
    stats: { atk: 2 },
    tags: ['FROST'],
    effect: {
      timing: 'ON_HIT',
      description: 'On Hit (once/turn): apply 1 Chill; if enemy has Chill, gain +1 SPD this turn',
    },
  },
  // ============================================================================
  // RUST (2 tools: T11, T12)
  // ============================================================================
  T11: {
    id: 'T11',
    name: 'Corrosive Pick',
    emoji: '☣️⛏️',
    image: require('../../../assets/icons/items/rust/corrosive_pick.png'),
    rarity: 'COMMON',
    stats: { atk: 1 },
    tags: ['RUST'],
    effect: {
      timing: 'ON_HIT',
      description: 'On Hit (once/turn): apply 1 Rust',
    },
  },
  T12: {
    id: 'T12',
    name: 'Etched Burrowblade',
    emoji: '🗡️☣️',
    image: require('../../../assets/icons/items/rust/etched_burrowblade.png'),
    rarity: 'RARE',
    stats: { atk: 2, spd: 1 },
    tags: ['RUST'],
    effect: {
      timing: 'ON_HIT',
      description: 'If enemy has Rust, your strikes ignore 1 Armor',
    },
  },
  // ============================================================================
  // BLOOD (2 tools: T13, T14)
  // ============================================================================
  T13: {
    id: 'T13',
    name: 'Serrated Drill',
    emoji: '🩸⛏️',
    image: require('../../../assets/icons/items/blood/serrated_drill.png'),
    rarity: 'COMMON',
    stats: { atk: 1 },
    tags: ['BLOOD'],
    effect: {
      timing: 'ON_HIT',
      description: 'On Hit (once/turn): apply 1 Bleed',
    },
  },
  T14: {
    id: 'T14',
    name: 'Reaper Pick',
    emoji: '💀⛏️',
    image: require('../../../assets/icons/items/blood/reaper_pick.png'),
    rarity: 'RARE',
    stats: { atk: 2 },
    tags: ['BLOOD'],
    effect: {
      timing: 'ON_HIT',
      description: 'On Hit (once/turn): apply 1 Bleed (if enemy is Wounded, apply +1 Bleed)',
    },
  },
  // ============================================================================
  // TEMPO (2 tools: T15, T16)
  // ============================================================================
  T15: {
    id: 'T15',
    name: 'Quickpick',
    emoji: '⚡⛏️',
    image: require('../../../assets/icons/items/tempo/quickpick.png'),
    rarity: 'COMMON',
    stats: { atk: 1, spd: 1 },
    tags: ['TEMPO'],
  },
  T16: {
    id: 'T16',
    name: 'Chrono Rapier',
    emoji: '⏰🗡️',
    image: require('../../../assets/icons/items/tempo/chrono_rapier.png'),
    rarity: 'HEROIC',
    stats: { atk: 1, spd: 2 },
    tags: ['TEMPO'],
    effect: {
      timing: 'FIRST_TURN',
      description: 'If you act first on Turn 1, gain +2 ATK (this battle)',
    },
  },
};

// ============================================================================
// Rarity Multipliers
// ============================================================================

/**
 * Get the stat multiplier for a given rarity
 * Only COMMON can be upgraded to GILDED (2.0x) or DIAMOND (4.0x)
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
    image: def.image,
    rarity: def.rarity,
    stats: { ...def.stats },
    tags: [...def.tags],
    oil: null,
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
export function createGearInstance(id: GearId, currentRarity?: ItemRarity): Gear {
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
export function calculateItemStats(tool: Tool | null, gear: Gear[]): ItemStats {
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
