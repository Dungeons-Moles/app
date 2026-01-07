/**
 * Gear item definitions (I1-I27)
 * @see specs/001-pve-dungeon-crawler/spec.md
 * @see specs/001-pve-dungeon-crawler/data-model.md
 */

import type { GearId, ItemRarity, ItemTag, ItemStats, EffectTiming } from '../game/engine/types';

export interface GearDefinition {
  id: GearId;
  name: string;
  emoji: string;
  baseRarity: ItemRarity;
  stats: ItemStats;
  tags: ItemTag[];
  effect?: {
    timing: EffectTiming;
    description: string;
  };
}

/**
 * All gear item definitions
 * Items are grouped by their itemset associations and themes
 */
export const GEAR_DEFINITIONS: Record<GearId, GearDefinition> = {
  // ============================================================================
  // Union Standard Set Items (I1, I2, I3) - Mining/Stone themed
  // Set Bonus: Battle Start: +4 Armor, +1 DIG
  // ============================================================================

  I1: {
    id: 'I1',
    name: 'Miner\'s Helmet',
    emoji: '⛑️',
    baseRarity: 'COMMON',
    stats: { arm: 2, dig: 1 },
    tags: ['STONE'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Gain +1 Armor',
    },
  },

  I2: {
    id: 'I2',
    name: 'Reinforced Gloves',
    emoji: '🧤',
    baseRarity: 'COMMON',
    stats: { atk: 1, arm: 1 },
    tags: ['STONE'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Gain +1 Armor',
    },
  },

  I3: {
    id: 'I3',
    name: 'Steel-Toed Boots',
    emoji: '🥾',
    baseRarity: 'COMMON',
    stats: { arm: 2, spd: 1 },
    tags: ['STONE'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Gain +2 Armor',
    },
  },

  // ============================================================================
  // Utility Items (I4, I7, I9, I15, I24, I26)
  // ============================================================================

  I4: {
    id: 'I4',
    name: 'Lantern',
    emoji: '🏮',
    baseRarity: 'COMMON',
    stats: { dig: 2 },
    tags: ['SCOUT'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Reveal enemy stats',
    },
  },

  I7: {
    id: 'I7',
    name: 'Lucky Charm',
    emoji: '🍀',
    baseRarity: 'COMMON',
    stats: { hp: 3 },
    tags: ['GREED'],
  },

  I9: {
    id: 'I9',
    name: 'Climbing Picks',
    emoji: '🪝',
    baseRarity: 'COMMON',
    stats: { atk: 1, dig: 1 },
    tags: ['SCOUT'],
  },

  I15: {
    id: 'I15',
    name: 'Canary Charm',
    emoji: '🐤',
    baseRarity: 'RARE',
    stats: { hp: 5 },
    tags: ['SCOUT'],
    effect: {
      timing: 'ON_WOUNDED',
      description: 'Once per run: Prevent death, revive at 1 HP (item breaks)',
    },
  },

  I24: {
    id: 'I24',
    name: 'Pocket Watch',
    emoji: '⏱️',
    baseRarity: 'RARE',
    stats: { spd: 2 },
    tags: ['SCOUT'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Gain +1 Speed',
    },
  },

  I26: {
    id: 'I26',
    name: 'Adrenaline Shot',
    emoji: '💉',
    baseRarity: 'HEROIC',
    stats: { atk: 3, spd: 2 },
    tags: ['SCOUT'],
    effect: {
      timing: 'ON_WOUNDED',
      description: 'When wounded: Gain +3 ATK for remainder of combat',
    },
  },

  // ============================================================================
  // Rust Ritual Set Items (I5, I22, I23) - Rust/Corrosion themed
  // Set Bonus: On Hit: apply +1 additional Rust
  // ============================================================================

  I5: {
    id: 'I5',
    name: 'Corroded Bracers',
    emoji: '🦾',
    baseRarity: 'COMMON',
    stats: { arm: 1 },
    tags: ['STONE'],
    effect: {
      timing: 'ON_HIT',
      description: 'Apply 1 Rust to enemy',
    },
  },

  I22: {
    id: 'I22',
    name: 'Rust Spreader',
    emoji: '🧫',
    baseRarity: 'RARE',
    stats: { atk: 2 },
    tags: ['STONE'],
    effect: {
      timing: 'ON_HIT',
      description: 'Apply 1 Rust to enemy',
    },
  },

  I23: {
    id: 'I23',
    name: 'Oxidation Flask',
    emoji: '🧪',
    baseRarity: 'RARE',
    stats: { dig: 1 },
    tags: ['STONE'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Apply 2 Rust to enemy',
    },
  },

  // ============================================================================
  // Shrapnel Harness Set Items (I6, I21) - Shrapnel themed
  // Set Bonus: Keep up to 3 Shrapnel at end of turn
  // ============================================================================

  I6: {
    id: 'I6',
    name: 'Spiked Vest',
    emoji: '🦔',
    baseRarity: 'COMMON',
    stats: { arm: 2 },
    tags: ['SHRAPNEL'],
    effect: {
      timing: 'ON_STRUCK',
      description: 'Gain 2 Shrapnel',
    },
  },

  I21: {
    id: 'I21',
    name: 'Shrapnel Cache',
    emoji: '💥',
    baseRarity: 'RARE',
    stats: { arm: 1 },
    tags: ['SHRAPNEL'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Gain 5 Shrapnel',
    },
  },

  // ============================================================================
  // Royal Extraction Set Items (I8, I25) - Gold/Greed themed
  // Set Bonus: Gold to Armor conversion becomes 1:4
  // ============================================================================

  I8: {
    id: 'I8',
    name: 'Gold Tooth',
    emoji: '🦷',
    baseRarity: 'COMMON',
    stats: { atk: 1 },
    tags: ['GREED'],
    effect: {
      timing: 'ON_HIT',
      description: 'Steal 1 Gold from enemy',
    },
  },

  I25: {
    id: 'I25',
    name: 'Golden Aegis',
    emoji: '🛡️',
    baseRarity: 'HEROIC',
    stats: { arm: 3 },
    tags: ['GREED'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Convert 2 Gold to 4 Armor',
    },
  },

  // ============================================================================
  // Demolition Permit Set Items (I10, I16, I18) - Bomb/Countdown themed
  // Set Bonus: Countdown items trigger 1 turn sooner
  // ============================================================================

  I10: {
    id: 'I10',
    name: 'Dynamite Bundle',
    emoji: '🧨',
    baseRarity: 'COMMON',
    stats: { atk: 2 },
    tags: ['STONE'],
    effect: {
      timing: 'TURN_START',
      description: 'After 3 turns: Deal 8 damage (ignores armor)',
    },
  },

  I16: {
    id: 'I16',
    name: 'Blasting Caps',
    emoji: '💣',
    baseRarity: 'RARE',
    stats: { atk: 1 },
    tags: ['STONE'],
    effect: {
      timing: 'TURN_START',
      description: 'After 2 turns: Deal 5 damage (ignores armor)',
    },
  },

  I18: {
    id: 'I18',
    name: 'Time Bomb',
    emoji: '⏰',
    baseRarity: 'RARE',
    stats: { dig: 2 },
    tags: ['STONE'],
    effect: {
      timing: 'TURN_START',
      description: 'After 4 turns: Deal 15 damage (ignores armor)',
    },
  },

  // ============================================================================
  // Shard Circuit Set Items (I11, I12, I13, I14) - Shard themed
  // Set Bonus: Shards trigger every turn
  // ============================================================================

  I11: {
    id: 'I11',
    name: 'Ruby Shard',
    emoji: '🔴',
    baseRarity: 'COMMON',
    stats: { atk: 2 },
    tags: ['SHARD'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Deal 3 damage (ignores armor)',
    },
  },

  I12: {
    id: 'I12',
    name: 'Sapphire Shard',
    emoji: '🔵',
    baseRarity: 'COMMON',
    stats: { arm: 2 },
    tags: ['SHARD', 'FROST'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Apply 2 Chill to enemy',
    },
  },

  I13: {
    id: 'I13',
    name: 'Emerald Shard',
    emoji: '🟢',
    baseRarity: 'COMMON',
    stats: { hp: 3 },
    tags: ['SHARD'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Heal 3 HP',
    },
  },

  I14: {
    id: 'I14',
    name: 'Topaz Shard',
    emoji: '🟡',
    baseRarity: 'COMMON',
    stats: { spd: 1, dig: 1 },
    tags: ['SHARD'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Gain +2 Speed this combat',
    },
  },

  // ============================================================================
  // Fuse Network Set Items (I17, I19, I20) - Non-weapon damage themed
  // Set Bonus: First non-weapon damage per turn deals +2
  // ============================================================================

  I17: {
    id: 'I17',
    name: 'Spark Coil',
    emoji: '⚡',
    baseRarity: 'RARE',
    stats: { atk: 1, spd: 1 },
    tags: ['SHARD'],
    effect: {
      timing: 'ON_HIT',
      description: 'Deal 2 bonus damage (ignores armor)',
    },
  },

  I19: {
    id: 'I19',
    name: 'Fire Trap',
    emoji: '🔥',
    baseRarity: 'RARE',
    stats: { atk: 2 },
    tags: ['SHARD'],
    effect: {
      timing: 'ON_STRUCK',
      description: 'Deal 3 damage to attacker (ignores armor)',
    },
  },

  I20: {
    id: 'I20',
    name: 'Shock Conduit',
    emoji: '🌩️',
    baseRarity: 'RARE',
    stats: { spd: 2 },
    tags: ['SHARD'],
    effect: {
      timing: 'TURN_END',
      description: 'Deal 2 damage to enemy (ignores armor)',
    },
  },

  // ============================================================================
  // Swift Digger Kit Item (I27) - DIG themed
  // Set Bonus: Battle Start: If DIG > enemy DIG, +2 strikes
  // ============================================================================

  I27: {
    id: 'I27',
    name: 'Tunnel Vision Goggles',
    emoji: '🥽',
    baseRarity: 'HEROIC',
    stats: { dig: 3, spd: 1 },
    tags: ['SCOUT'],
    effect: {
      timing: 'BATTLE_START',
      description: 'If your DIG > enemy DIG, gain +1 ATK',
    },
  },
};

/**
 * Get gear definition by ID
 */
export function getGearDefinition(id: GearId): GearDefinition {
  return GEAR_DEFINITIONS[id];
}

/**
 * Get all gear definitions as an array
 */
export function getAllGearDefinitions(): GearDefinition[] {
  return Object.values(GEAR_DEFINITIONS);
}

/**
 * Get gear definitions by tag
 */
export function getGearByTag(tag: ItemTag): GearDefinition[] {
  return getAllGearDefinitions().filter((gear) => gear.tags.includes(tag));
}

/**
 * Get gear definitions by rarity
 */
export function getGearByRarity(rarity: ItemRarity): GearDefinition[] {
  return getAllGearDefinitions().filter((gear) => gear.baseRarity === rarity);
}

/**
 * Rarity stat multipliers for gear upgrades
 */
export const RARITY_MULTIPLIER: Record<ItemRarity, number> = {
  COMMON: 1.0,
  GILDED: 1.5,
  DIAMOND: 2.0,
  RARE: 1.0,
  HEROIC: 1.0,
  MYTHIC: 1.0,
};

/**
 * Create a gear instance from a definition with optional rarity upgrade
 */
export function createGearInstance(
  id: GearId,
  currentRarity?: ItemRarity
): {
  id: GearId;
  name: string;
  emoji: string;
  baseRarity: ItemRarity;
  currentRarity: ItemRarity;
  stats: ItemStats;
  tags: ItemTag[];
} {
  const def = getGearDefinition(id);
  const rarity = currentRarity ?? def.baseRarity;
  const multiplier = RARITY_MULTIPLIER[rarity];

  // Scale numeric stats by rarity multiplier
  const scaledStats: ItemStats = {};
  if (def.stats.atk !== undefined) scaledStats.atk = Math.floor(def.stats.atk * multiplier);
  if (def.stats.arm !== undefined) scaledStats.arm = Math.floor(def.stats.arm * multiplier);
  if (def.stats.spd !== undefined) scaledStats.spd = Math.floor(def.stats.spd * multiplier);
  if (def.stats.dig !== undefined) scaledStats.dig = Math.floor(def.stats.dig * multiplier);
  if (def.stats.hp !== undefined) scaledStats.hp = Math.floor(def.stats.hp * multiplier);

  return {
    id: def.id,
    name: def.name,
    emoji: def.emoji,
    baseRarity: def.baseRarity,
    currentRarity: rarity,
    stats: scaledStats,
    tags: [...def.tags],
  };
}
