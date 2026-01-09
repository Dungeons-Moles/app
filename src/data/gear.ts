/**
 * Gear item definitions (I1-I29)
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
  // Common Gear
  I1: {
    id: 'I1',
    name: 'Miner\'s Boots',
    emoji: '🥾',
    baseRarity: 'COMMON',
    stats: { dig: 2 },
    tags: ['SCOUT'],
  },
  I2: {
    id: 'I2',
    name: 'Miner\'s Helmet',
    emoji: '🪖',
    baseRarity: 'COMMON',
    stats: { arm: 2 },
    tags: ['STONE'],
  },
  I3: {
    id: 'I3',
    name: 'Work Vest',
    emoji: '🦺',
    baseRarity: 'COMMON',
    stats: { hp: 4, arm: 1 },
    tags: ['STONE'],
  },
  I4: {
    id: 'I4',
    name: 'Leather Gloves',
    emoji: '🧤',
    baseRarity: 'COMMON',
    stats: { atk: 2, dig: 1 },
    tags: ['SCOUT'],
  },
  I5: {
    id: 'I5',
    name: 'Cracked Whetstone',
    emoji: '🪨',
    baseRarity: 'COMMON',
    stats: {},
    tags: ['STONE'],
    effect: {
      timing: 'TURN_START',
      description: 'First Turn: gain +2 / +4 / +8 ATK (temporary).',
    },
  },
  I6: {
    id: 'I6',
    name: 'Spiked Bracers',
    emoji: '🧱',
    baseRarity: 'COMMON',
    stats: {},
    tags: ['STONE'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: gain 1 / 2 / 4 Shrapnel.',
    },
  },
  I7: {
    id: 'I7',
    name: 'Frost Lantern',
    emoji: '🏮',
    baseRarity: 'COMMON',
    stats: {},
    tags: ['FROST'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: give enemy 1 / 2 / 4 Chill.',
    },
  },
  I8: {
    id: 'I8',
    name: 'Loose Nuggets',
    emoji: '🪙',
    baseRarity: 'COMMON',
    stats: {},
    tags: ['GREED'],
    effect: {
      timing: 'DAY_START',
      description: 'Start of each Day: gain 3 / 6 / 12 Gold.',
    },
  },
  I9: {
    id: 'I9',
    name: 'Canary Charm',
    emoji: '🐦',
    baseRarity: 'COMMON',
    stats: {},
    tags: ['SCOUT'],
    effect: {
      timing: 'ON_DEATH',
      description: 'One Use: first time you would die, revive at 1 HP, then break.',
    },
  },
  I10: {
    id: 'I10',
    name: 'Small Charge',
    emoji: '🧨',
    baseRarity: 'COMMON',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'TURN_END',
      description: 'Countdown (2): deal 10 damage to enemy and you (non-weapon).',
    },
  },

  // Shards (Common)
  I11: {
    id: 'I11',
    name: 'Emerald Shard',
    emoji: '💎',
    baseRarity: 'COMMON',
    stats: {},
    tags: ['SHARD'],
    effect: {
      timing: 'TURN_START',
      description: 'Every other turn: restore 1 HP.',
    },
  },
  I12: {
    id: 'I12',
    name: 'Ruby Shard',
    emoji: '💎',
    baseRarity: 'COMMON',
    stats: {},
    tags: ['SHARD'],
    effect: {
      timing: 'TURN_START',
      description: 'Every other turn: deal 1 non-weapon damage.',
    },
  },
  I13: {
    id: 'I13',
    name: 'Sapphire Shard',
    emoji: '💎',
    baseRarity: 'COMMON',
    stats: {},
    tags: ['SHARD'],
    effect: {
      timing: 'TURN_START',
      description: 'Every other turn: gain 1 Armor.',
    },
  },
  I14: {
    id: 'I14',
    name: 'Citrine Shard',
    emoji: '💎',
    baseRarity: 'COMMON',
    stats: {},
    tags: ['SHARD'],
    effect: {
      timing: 'TURN_START',
      description: 'Every other turn: gain 1 DIG.',
    },
  },

  // Rare Gear
  I15: {
    id: 'I15',
    name: 'Frostguard Buckler',
    emoji: '🛡️',
    baseRarity: 'RARE',
    stats: { arm: 8 },
    tags: ['FROST'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: gain 2 Chill (on you).',
    },
  },
  I16: {
    id: 'I16',
    name: 'Blast Suit',
    emoji: '🦾',
    baseRarity: 'RARE',
    stats: { arm: 10 },
    tags: ['BLAST'],
    effect: {
      timing: 'PASSIVE',
      description: 'Ignore damage from your own BLAST items.',
    },
  },
  I17: {
    id: 'I17',
    name: 'Bomb Satchel',
    emoji: '🎒',
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'PASSIVE',
      description: 'Battle Start / Exposed / Wounded: spend 3 DIG to retrigger a random bomb.',
    },
  },
  I18: {
    id: 'I18',
    name: 'Explosive Powder',
    emoji: '💥',
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'PASSIVE',
      description: 'All bomb damage is increased by +1.',
    },
  },
  I19: {
    id: 'I19',
    name: 'Kindling Charge',
    emoji: '🔥',
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: deal 1 damage. Next bomb deals +3 damage.',
    },
  },
  I20: {
    id: 'I20',
    name: 'Double Detonation',
    emoji: '💣',
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'PASSIVE',
      description: 'Second non-weapon damage each turn deals +3.',
    },
  },
  I21: {
    id: 'I21',
    name: 'Shrapnel Talisman',
    emoji: '📿',
    baseRarity: 'RARE',
    stats: {},
    tags: ['STONE'],
    effect: {
      timing: 'PASSIVE',
      description: 'Whenever you gain Shrapnel, also gain +1 Armor.',
    },
  },
  I22: {
    id: 'I22',
    name: 'Rust Spike',
    emoji: '🪛',
    baseRarity: 'RARE',
    stats: {},
    tags: ['RUST'],
    effect: {
      timing: 'ON_HIT',
      description: 'On Hit: apply 1 Rust.',
    },
  },
  I23: {
    id: 'I23',
    name: 'Corroded Greaves',
    emoji: '🥾',
    baseRarity: 'RARE',
    stats: { dig: -1 },
    tags: ['RUST'],
    effect: {
      timing: 'ON_WOUNDED',
      description: 'Wounded: apply 3 Rust to enemy.',
    },
  },

  // Heroic Gear
  I24: {
    id: 'I24',
    name: 'Crystal Crown',
    emoji: '👑',
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['STONE'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: gain Max HP equal to Base Armor.',
    },
  },
  I25: {
    id: 'I25',
    name: 'Royal Bracer',
    emoji: '💍',
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['GREED'],
    effect: {
      timing: 'TURN_START',
      description: 'Turn Start: convert 1 Gold → 3 Armor.',
    },
  },
  I26: {
    id: 'I26',
    name: 'Time Charge',
    emoji: '⏳',
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'TURN_START',
      description: 'Exposed: deal 1 damage. Turn Start: gain +2 damage (this battle).',
    },
  },
  I27: {
    id: 'I27',
    name: 'Drill Servo',
    emoji: '⚙️',
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['SCOUT'],
    effect: {
      timing: 'ON_WOUNDED',
      description: 'Wounded: gain +2 additional strikes this battle.',
    },
  },

  // Mythic Gear
  I28: {
    id: 'I28',
    name: 'Gear-Link Medallion',
    emoji: '🔗',
    baseRarity: 'MYTHIC',
    stats: {},
    tags: ['SCOUT'],
    effect: {
      timing: 'ON_HIT',
      description: 'Your On-Hit effects trigger twice.',
    },
  },
  I29: {
    id: 'I29',
    name: 'Twin-Fuse Knot',
    emoji: '🧬',
    baseRarity: 'MYTHIC',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'PASSIVE',
      description: 'Your bomb items trigger twice.',
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
  GILDED: 2.0,
  DIAMOND: 4.0,
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
