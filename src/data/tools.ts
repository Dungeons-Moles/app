/**
 * Tool Item Data Definitions
 * @see specs/001-pve-dungeon-crawler/spec.md Appendix C
 */

import type {
  ToolId,
  ItemRarity,
  ItemStats,
  ItemTag,
  EffectTiming,
} from '../game/engine/types';

// ============================================================================
// Tool Types
// ============================================================================

export interface ToolEffect {
  timing: EffectTiming;
  description: string;
}

export interface ToolDefinition {
  id: ToolId;
  name: string;
  emoji: string;
  rarity: ItemRarity;
  stats: ItemStats;
  tags: ItemTag[];
  effect?: ToolEffect;
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const TOOLS: Record<ToolId, ToolDefinition> = {
  T1: {
    id: 'T1',
    name: 'Rusty Pickaxe',
    emoji: '⛏️',
    rarity: 'COMMON',
    stats: {
      atk: 3,
    },
    tags: ['STONE'],
  },

  T2: {
    id: 'T2',
    name: 'Reinforced Shovel',
    emoji: '🛠️',
    rarity: 'COMMON',
    stats: {
      atk: 1,
      arm: 6,
    },
    tags: ['STONE'],
  },

  T3: {
    id: 'T3',
    name: 'Twin Picks',
    emoji: '⛏️⛏️',
    rarity: 'COMMON',
    stats: {
      atk: 1,
    },
    tags: ['SCOUT'],
    effect: {
      timing: 'TURN_START',
      description: 'Strike twice each turn',
    },
  },

  T4: {
    id: 'T4',
    name: "Prospector's Pike",
    emoji: '🗡️',
    rarity: 'COMMON',
    stats: {
      atk: 2,
      dig: 2,
    },
    tags: ['SCOUT'],
  },

  T5: {
    id: 'T5',
    name: 'Pneumatic Drill',
    emoji: '🌀',
    rarity: 'RARE',
    stats: {
      atk: 1,
    },
    tags: ['SCOUT'],
    effect: {
      timing: 'TURN_START',
      description: 'Strike 3 times each turn',
    },
  },

  T6: {
    id: 'T6',
    name: 'Shadow Burrowblade',
    emoji: '🗡️',
    rarity: 'RARE',
    stats: {
      atk: 2,
    },
    tags: ['SCOUT'],
    effect: {
      timing: 'ON_HIT',
      description: 'On Hit: Strikes ignore Armor',
    },
  },

  T7: {
    id: 'T7',
    name: 'Gemfinder Staff',
    emoji: '🔮',
    rarity: 'HEROIC',
    stats: {
      atk: 1,
      arm: 1,
      dig: 1,
    },
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
// Helper Functions
// ============================================================================

export function getTool(id: ToolId): ToolDefinition {
  return TOOLS[id];
}

export function getAllToolIds(): ToolId[] {
  return Object.keys(TOOLS) as ToolId[];
}

export function getToolsByRarity(rarity: ItemRarity): ToolDefinition[] {
  return Object.values(TOOLS).filter((tool) => tool.rarity === rarity);
}

export function getToolsByTag(tag: ItemTag): ToolDefinition[] {
  return Object.values(TOOLS).filter((tool) => tool.tags.includes(tag));
}

export function getCommonTools(): ToolDefinition[] {
  return getToolsByRarity('COMMON');
}

export function getRareTools(): ToolDefinition[] {
  return getToolsByRarity('RARE');
}

export function getHeroicTools(): ToolDefinition[] {
  return getToolsByRarity('HEROIC');
}

export function getMythicTools(): ToolDefinition[] {
  return getToolsByRarity('MYTHIC');
}

export function hasEffect(id: ToolId): boolean {
  return TOOLS[id].effect !== undefined;
}

export function getToolStats(id: ToolId): ItemStats {
  return TOOLS[id].stats;
}
