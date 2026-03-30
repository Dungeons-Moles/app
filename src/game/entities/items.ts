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
  getTierFromRarity,
  resolveDescriptionForTier,
  resolveDescriptionAllTiers,
} from '../../data/gear';
import { getGearStatsAtTier } from '../../data/gear-effects';
import { getToolEffectsAtTier, TOOL_EFFECTS } from '../../data/tool-effects';

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
 * All tool definitions per current balance data (17 tools including starter)
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
    image: require('../../../assets/icons/stats/DIG.webp'),
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
    image: require('../../../assets/icons/items/stone/bulwark_shovel.webp'),
    rarity: 'COMMON',
    stats: { atk: 1, arm: 4 },
    tags: ['STONE'],
    effect: {
      timing: 'PASSIVE',
      description: 'While you have Armor, take 1 less weapon damage from each strike (min 1)',
    },
  },
  T2: {
    id: 'T2',
    name: 'Cragbreaker Hammer',
    emoji: '🔨',
    image: require('../../../assets/icons/items/stone/cragbreaker_hammer.webp'),
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
    image: require('../../../assets/icons/items/scout/twin_picks.webp'),
    rarity: 'COMMON',
    stats: { atk: 1 },
    tags: ['SCOUT'],
    effect: {
      timing: 'ON_HIT',
      description: 'Strike 2 times per turn; On Hit effects trigger on each strike separately',
    },
  },
  T4: {
    id: 'T4',
    name: 'Pneumatic Drill',
    emoji: '🌀',
    image: require('../../../assets/icons/items/scout/pneumatic_drill.webp'),
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
    image: require('../../../assets/icons/items/greed/glittering_pick.webp'),
    rarity: 'COMMON',
    stats: { atk: 1 },
    tags: ['GREED'],
    effect: {
      timing: 'ON_HIT',
      description: 'On Hit (once/turn): gain 1 Gold; Victory: gain +2 Gold',
    },
  },
  T6: {
    id: 'T6',
    name: 'Gemfinder Staff',
    emoji: '🔮',
    image: require('../../../assets/icons/items/greed/gemfinder_staff.webp'),
    rarity: 'HEROIC',
    stats: { atk: 2, arm: 2, dig: 1 },
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
    image: require('../../../assets/icons/items/blast/fuse_pick.webp'),
    rarity: 'COMMON',
    stats: { atk: 1 },
    tags: ['BLAST'],
    effect: {
      timing: 'ON_HIT',
      description: 'First hit each turn: deal 1/2/3 non-weapon damage',
    },
  },
  T8: {
    id: 'T8',
    name: 'Spark Pick',
    emoji: '⚡⛏️',
    image: require('../../../assets/icons/items/blast/spark_pick.webp'),
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
    image: require('../../../assets/icons/items/frost/rime_pike.webp'),
    rarity: 'COMMON',
    stats: { atk: 1 },
    tags: ['FROST'],
    effect: {
      timing: 'ON_HIT',
      description:
        'On Hit (once/turn): apply 1 Chill; if enemy has 2+ Chill, apply 1 additional Chill',
    },
  },
  T10: {
    id: 'T10',
    name: 'Glacier Fang',
    emoji: '🦷❄️',
    image: require('../../../assets/icons/items/frost/glacier_fang.webp'),
    rarity: 'RARE',
    stats: { atk: 2 },
    tags: ['FROST'],
    effect: {
      timing: 'ON_HIT',
      description:
        'On Hit (once/turn): apply 1 Chill; if enemy has Chill, gain +1 SPD this turn and deal +1 bonus damage',
    },
  },
  // ============================================================================
  // RUST (2 tools: T11, T12)
  // ============================================================================
  T11: {
    id: 'T11',
    name: 'Corrosive Pick',
    emoji: '☣️⛏️',
    image: require('../../../assets/icons/items/rust/corrosive_pick.webp'),
    rarity: 'COMMON',
    stats: { atk: 1 },
    tags: ['RUST'],
    effect: {
      timing: 'ON_HIT',
      description: 'On Hit (once/turn): apply 2 Rust',
    },
  },
  T12: {
    id: 'T12',
    name: 'Etched Burrowblade',
    emoji: '🗡️☣️',
    image: require('../../../assets/icons/items/rust/etched_burrowblade.webp'),
    rarity: 'HEROIC',
    stats: { atk: 2, spd: 2 },
    tags: ['RUST'],
    effect: {
      timing: 'ON_HIT',
      description: 'If enemy has Rust, your strikes ignore 2 Armor (ignore all Armor at 4+ Rust)',
    },
  },
  // ============================================================================
  // BLOOD (2 tools: T13, T14)
  // ============================================================================
  T13: {
    id: 'T13',
    name: 'Serrated Drill',
    emoji: '🩸⛏️',
    image: require('../../../assets/icons/items/blood/serrated_drill.webp'),
    rarity: 'COMMON',
    stats: { atk: 1 },
    tags: ['BLOOD'],
    effect: {
      timing: 'ON_HIT',
      description:
        'On Hit (once/turn): apply 1 Bleed; when enemy takes Bleed damage, heal 1/2/4 HP',
    },
  },
  T14: {
    id: 'T14',
    name: 'Reaper Pick',
    emoji: '💀⛏️',
    image: require('../../../assets/icons/items/blood/reaper_pick.webp'),
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
    image: require('../../../assets/icons/items/tempo/quickpick.webp'),
    rarity: 'COMMON',
    stats: { atk: 1, spd: 2 },
    tags: ['TEMPO'],
    effect: {
      timing: 'EVERY_OTHER_TURN',
      description: 'Every other turn: gain +1/2/4 SPD this battle',
    },
  },
  T16: {
    id: 'T16',
    name: 'Chrono Rapier',
    emoji: '⏰🗡️',
    image: require('../../../assets/icons/items/tempo/chrono_rapier.webp'),
    rarity: 'MYTHIC',
    stats: { atk: 2, spd: 3 },
    tags: ['TEMPO'],
    effect: {
      timing: 'FIRST_TURN',
      description: 'If you act first on Turn 1, gain +3 ATK (this battle)',
    },
  },
};

// ============================================================================
// Rarity Multipliers
// ============================================================================

/**
 * Get the stat multiplier for a given rarity
 * Only COMMON can be upgraded to SAPPHIRE (2.0x) or GOLDEN (4.0x)
 * RARE, HEROIC, MYTHIC are fixed rarities with no multiplier
 */
export function applyRarityMultiplier(rarity: ItemRarity): number {
  return RARITY_MULTIPLIER[rarity];
}

/**
 * Convert item rarity to tool tier (1/2/3).
 * Re-exports getTierFromRarity for convenience.
 */
export const rarityToToolTier = getTierFromRarity;

/**
 * Get tool stats at a specific tier using TOOL_EFFECTS (matching on-chain values).
 * Extracts BattleStart stat bonuses (GainAtk, GainArmor, GainSpd, GainDig, MaxHp)
 * from the tool's effect definitions.
 */
export function getToolStatsAtTier(toolId: ToolId, tier: 1 | 2 | 3): ItemStats {
  const effects = getToolEffectsAtTier(toolId, tier);
  const stats: ItemStats = {};

  for (const effect of effects) {
    if (effect.trigger.type !== 'BattleStart') continue;
    if (effect.condition.type !== 'None') continue;

    switch (effect.effectType) {
      case 'GainAtk':
        stats.atk = (stats.atk ?? 0) + effect.value;
        break;
      case 'GainArmor':
        stats.arm = (stats.arm ?? 0) + effect.value;
        break;
      case 'GainSpd':
        stats.spd = (stats.spd ?? 0) + effect.value;
        break;
      case 'GainDig':
        stats.dig = (stats.dig ?? 0) + effect.value;
        break;
      case 'MaxHp':
        stats.hp = (stats.hp ?? 0) + effect.value;
        break;
    }
  }

  return stats;
}

function mergeBakedStats(primary: ItemStats, derived: ItemStats): ItemStats {
  return {
    atk: Math.max(primary.atk ?? 0, derived.atk ?? 0),
    arm: Math.max(primary.arm ?? 0, derived.arm ?? 0),
    spd: Math.max(primary.spd ?? 0, derived.spd ?? 0),
    dig: Math.max(primary.dig ?? 0, derived.dig ?? 0),
    hp: Math.max(primary.hp ?? 0, derived.hp ?? 0),
  };
}

export function calculateCombatBakedItemStats(tool: Tool | null, gear: Gear[]): ItemStats {
  const result: ItemStats = {
    atk: 0,
    arm: 0,
    spd: 0,
    dig: 0,
    hp: 0,
  };

  if (tool) {
    const directStats: ItemStats = {
      atk: tool.stats.atk ?? 0,
      arm: tool.stats.arm ?? 0,
      spd: tool.stats.spd ?? 0,
      dig: tool.stats.dig ?? 0,
      hp: tool.stats.hp ?? 0,
    };
    const derivedStats = getToolStatsAtTier(tool.id, rarityToToolTier(tool.rarity));
    const mergedToolStats = mergeBakedStats(directStats, derivedStats);

    result.atk = (result.atk ?? 0) + (mergedToolStats.atk ?? 0);
    result.arm = (result.arm ?? 0) + (mergedToolStats.arm ?? 0);
    result.spd = (result.spd ?? 0) + (mergedToolStats.spd ?? 0);
    result.dig = (result.dig ?? 0) + (mergedToolStats.dig ?? 0);
    result.hp = (result.hp ?? 0) + (mergedToolStats.hp ?? 0);

    if (tool.oil === 'ATK') result.atk = (result.atk ?? 0) + 1;
    if (tool.oil === 'ARM') result.arm = (result.arm ?? 0) + 1;
    if (tool.oil === 'SPD') result.spd = (result.spd ?? 0) + 1;
    if (tool.oil === 'DIG') result.dig = (result.dig ?? 0) + 1;
  }

  for (const item of gear) {
    const directStats: ItemStats = {
      atk: item.stats.atk ?? 0,
      arm: item.stats.arm ?? 0,
      spd: item.stats.spd ?? 0,
      dig: item.stats.dig ?? 0,
      hp: item.stats.hp ?? 0,
    };
    const derivedStats = getGearStatsAtTier(item.id, getTierFromRarity(item.currentRarity));
    const mergedGearStats = mergeBakedStats(directStats, derivedStats);

    result.atk = (result.atk ?? 0) + (mergedGearStats.atk ?? 0);
    result.arm = (result.arm ?? 0) + (mergedGearStats.arm ?? 0);
    result.spd = (result.spd ?? 0) + (mergedGearStats.spd ?? 0);
    result.dig = (result.dig ?? 0) + (mergedGearStats.dig ?? 0);
    result.hp = (result.hp ?? 0) + (mergedGearStats.hp ?? 0);
  }

  return result;
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
    image: result.image,
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
    const directStats: ItemStats = {
      atk: tool.stats.atk ?? 0,
      arm: tool.stats.arm ?? 0,
      spd: tool.stats.spd ?? 0,
      dig: tool.stats.dig ?? 0,
      hp: tool.stats.hp ?? 0,
    };
    const derivedStats = getToolStatsAtTier(tool.id, rarityToToolTier(tool.rarity));
    const mergedToolStats = mergeBakedStats(directStats, derivedStats);

    result.atk = (result.atk ?? 0) + (mergedToolStats.atk ?? 0);
    result.arm = (result.arm ?? 0) + (mergedToolStats.arm ?? 0);
    result.spd = (result.spd ?? 0) + (mergedToolStats.spd ?? 0);
    result.dig = (result.dig ?? 0) + (mergedToolStats.dig ?? 0);
    result.hp = (result.hp ?? 0) + (mergedToolStats.hp ?? 0);

    // Add tool oil bonus (+1 to corresponding stat)
    if (tool.oil) {
      switch (tool.oil) {
        case 'ATK':
          result.atk = (result.atk ?? 0) + 1;
          break;
        case 'SPD':
          result.spd = (result.spd ?? 0) + 1;
          break;
        case 'DIG':
          result.dig = (result.dig ?? 0) + 1;
          break;
        case 'ARM':
          result.arm = (result.arm ?? 0) + 1;
          break;
      }
    }
  }

  // Add gear stats
  for (const item of gear) {
    const directStats: ItemStats = {
      atk: item.stats.atk ?? 0,
      arm: item.stats.arm ?? 0,
      spd: item.stats.spd ?? 0,
      dig: item.stats.dig ?? 0,
      hp: item.stats.hp ?? 0,
    };
    const derivedStats = getGearStatsAtTier(item.id, getTierFromRarity(item.currentRarity));
    const mergedGearStats = mergeBakedStats(directStats, derivedStats);

    result.atk = (result.atk ?? 0) + (mergedGearStats.atk ?? 0);
    result.arm = (result.arm ?? 0) + (mergedGearStats.arm ?? 0);
    result.spd = (result.spd ?? 0) + (mergedGearStats.spd ?? 0);
    result.dig = (result.dig ?? 0) + (mergedGearStats.dig ?? 0);
    result.hp = (result.hp ?? 0) + (mergedGearStats.hp ?? 0);
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

/**
 * Get the tool effect description scaled to the current tier.
 */
export function getToolScaledEffectDescription(toolId: ToolId, rarity: ItemRarity): string | null {
  const def = TOOL_DEFINITIONS[toolId];
  if (!def.effect) return null;

  const tier = getTierFromRarity(rarity);
  const toolEffects = TOOL_EFFECTS[toolId];

  return resolveDescriptionForTier(def.effect.description, toolEffects?.effects ?? [], tier);
}

/**
 * Get the tool effect description showing all tier values in X/Y/Z notation.
 */
export function getToolEffectDescriptionAllTiers(toolId: ToolId): string | null {
  const def = TOOL_DEFINITIONS[toolId];
  if (!def.effect) return null;

  const toolEffects = TOOL_EFFECTS[toolId];
  if (!toolEffects || toolEffects.effects.length === 0) return def.effect.description;

  return resolveDescriptionAllTiers(def.effect.description, toolEffects.effects);
}
