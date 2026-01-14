/**
 * Gear item definitions (64 items: 8 per tag)
 * @see docs/gdd.md Section 9: Item System
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
 * All gear item definitions (64 items: 8 per tag)
 * Organized by tag to match GDD structure
 */
export const GEAR_DEFINITIONS: Record<GearId, GearDefinition> = {
  // ============================================================================
  // STONE (8 items: I1-I8)
  // ============================================================================
  I1: {
    id: 'I1',
    name: 'Miner Helmet',
    emoji: '🪖',
    baseRarity: 'COMMON',
    stats: { arm: 3 },
    tags: ['STONE'],
  },
  I2: {
    id: 'I2',
    name: 'Work Vest',
    emoji: '🦺',
    baseRarity: 'COMMON',
    stats: { hp: 4, arm: 1 },
    tags: ['STONE'],
  },
  I3: {
    id: 'I3',
    name: 'Spiked Bracers',
    emoji: '🧱',
    baseRarity: 'COMMON',
    stats: {},
    tags: ['STONE'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: gain 2 Shrapnel',
    },
  },
  I4: {
    id: 'I4',
    name: 'Reinforcement Plate',
    emoji: '🛡️',
    baseRarity: 'RARE',
    stats: {},
    tags: ['STONE'],
    effect: {
      timing: 'EVERY_OTHER_TURN',
      description: 'Every other turn: gain 1 Armor',
    },
  },
  I5: {
    id: 'I5',
    name: 'Rebar Carapace',
    emoji: '🏗️',
    baseRarity: 'RARE',
    stats: {},
    tags: ['STONE'],
    effect: {
      timing: 'EXPOSED',
      description: 'Exposed: gain 3 Armor',
    },
  },
  I6: {
    id: 'I6',
    name: 'Shrapnel Talisman',
    emoji: '📿',
    baseRarity: 'RARE',
    stats: {},
    tags: ['STONE'],
    effect: {
      timing: 'PASSIVE',
      description: 'Whenever you gain Shrapnel (once/turn): gain 1 Armor',
    },
  },
  I7: {
    id: 'I7',
    name: 'Crystal Crown',
    emoji: '👑',
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['STONE'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: gain Max HP equal to your starting Armor (cap 12)',
    },
  },
  I8: {
    id: 'I8',
    name: 'Stone Sigil',
    emoji: '🪨',
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['STONE'],
    effect: {
      timing: 'TURN_END',
      description: 'End of turn: if you have Armor, gain 1 Armor',
    },
  },

  // ============================================================================
  // SCOUT (8 items: I9-I16)
  // ============================================================================
  I9: {
    id: 'I9',
    name: 'Miner Boots',
    emoji: '🥾',
    baseRarity: 'COMMON',
    stats: { dig: 2 },
    tags: ['SCOUT'],
  },
  I10: {
    id: 'I10',
    name: 'Leather Gloves',
    emoji: '🧤',
    baseRarity: 'COMMON',
    stats: { atk: 1, dig: 1 },
    tags: ['SCOUT'],
  },
  I11: {
    id: 'I11',
    name: 'Tunnel Instinct',
    emoji: '🔍',
    baseRarity: 'RARE',
    stats: {},
    tags: ['SCOUT'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: if DIG > enemy DIG, gain +1 SPD (this battle)',
    },
  },
  I12: {
    id: 'I12',
    name: 'Tunneler Spurs',
    emoji: '🐎',
    baseRarity: 'RARE',
    stats: { spd: 1 },
    tags: ['SCOUT'],
    effect: {
      timing: 'FIRST_TURN',
      description: 'If you act first on Turn 1, gain +1 DIG (this battle)',
    },
  },
  I13: {
    id: 'I13',
    name: 'Wall-Sense Visor',
    emoji: '👓',
    baseRarity: 'RARE',
    stats: { dig: 1 },
    tags: ['SCOUT'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: if DIG > enemy DIG, gain +2 Armor',
    },
  },
  I14: {
    id: 'I14',
    name: 'Drill Servo',
    emoji: '⚙️',
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['SCOUT'],
    effect: {
      timing: 'WOUNDED',
      description: 'Wounded: gain +1 additional strikes (this battle)',
    },
  },
  I15: {
    id: 'I15',
    name: 'Weak-Point Manual',
    emoji: '📖',
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['SCOUT'],
    effect: {
      timing: 'PASSIVE',
      description: 'If DIG > enemy Armor: your strikes ignore 1 Armor (this battle)',
    },
  },
  I16: {
    id: 'I16',
    name: 'Gear-Link Medallion',
    emoji: '🔗',
    baseRarity: 'MYTHIC',
    stats: {},
    tags: ['SCOUT'],
    effect: {
      timing: 'ON_HIT',
      description: 'Your On Hit effects trigger twice (once/turn)',
    },
  },

  // ============================================================================
  // GREED (8 items: I17-I24)
  // ============================================================================
  I17: {
    id: 'I17',
    name: 'Loose Nuggets',
    emoji: '🪙',
    baseRarity: 'COMMON',
    stats: {},
    tags: ['GREED'],
    effect: {
      timing: 'DAY_START',
      description: 'Start of each Day: gain 3 Gold',
    },
  },
  I18: {
    id: 'I18',
    name: 'Lucky Coin',
    emoji: '🍀',
    baseRarity: 'COMMON',
    stats: {},
    tags: ['GREED'],
    effect: {
      timing: 'VICTORY',
      description: 'Victory: gain 2 Gold',
    },
  },
  I19: {
    id: 'I19',
    name: 'Gilded Band',
    emoji: '💍',
    baseRarity: 'RARE',
    stats: {},
    tags: ['GREED'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: gain Armor equal to floor(Gold/10) (cap 2)',
    },
  },
  I20: {
    id: 'I20',
    name: 'Royal Bracer',
    emoji: '👑',
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['GREED'],
    effect: {
      timing: 'TURN_START',
      description: 'Turn Start: convert 1 Gold -> 2 Armor',
    },
  },
  I21: {
    id: 'I21',
    name: 'Emerald Shard',
    emoji: '💚',
    baseRarity: 'COMMON',
    stats: {},
    tags: ['GREED'],
    effect: {
      timing: 'EVERY_OTHER_TURN',
      description: 'Every other turn (on first hit): heal 1 HP',
    },
  },
  I22: {
    id: 'I22',
    name: 'Ruby Shard',
    emoji: '❤️',
    baseRarity: 'COMMON',
    stats: {},
    tags: ['GREED'],
    effect: {
      timing: 'EVERY_OTHER_TURN',
      description: 'Every other turn (on first hit): deal 1 non-weapon damage',
    },
  },
  I23: {
    id: 'I23',
    name: 'Sapphire Shard',
    emoji: '💙',
    baseRarity: 'COMMON',
    stats: {},
    tags: ['GREED'],
    effect: {
      timing: 'EVERY_OTHER_TURN',
      description: 'Every other turn (on first hit): gain 1 Armor',
    },
  },
  I24: {
    id: 'I24',
    name: 'Citrine Shard',
    emoji: '💛',
    baseRarity: 'COMMON',
    stats: {},
    tags: ['GREED'],
    effect: {
      timing: 'EVERY_OTHER_TURN',
      description: 'Every other turn (on first hit): gain 1 Gold',
    },
  },

  // ============================================================================
  // BLAST (8 items: I25-I32)
  // ============================================================================
  I25: {
    id: 'I25',
    name: 'Small Charge',
    emoji: '🧨',
    baseRarity: 'COMMON',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'COUNTDOWN',
      description: 'Countdown(2): deal 8 to enemy and you (non-weapon)',
    },
  },
  I26: {
    id: 'I26',
    name: 'Blast Suit',
    emoji: '🦾',
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'PASSIVE',
      description: 'You ignore damage from your own BLAST items',
    },
  },
  I27: {
    id: 'I27',
    name: 'Explosive Powder',
    emoji: '💥',
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'PASSIVE',
      description: 'Your non-weapon damage deals +1',
    },
  },
  I28: {
    id: 'I28',
    name: 'Double Detonation',
    emoji: '💣',
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'PASSIVE',
      description: 'Second time you deal non-weapon damage each turn: deal +2 more',
    },
  },
  I29: {
    id: 'I29',
    name: 'Bomb Satchel',
    emoji: '🎒',
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: reduce Countdown of all your bomb items by 1 (min 0)',
    },
  },
  I30: {
    id: 'I30',
    name: 'Kindling Charge',
    emoji: '🔥',
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: deal 1; your next bomb this battle deals +3',
    },
  },
  I31: {
    id: 'I31',
    name: 'Time Charge',
    emoji: '⏳',
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'TURN_START',
      description:
        'Turn Start: gain +1 stored damage (this battle); when Exposed: deal stored damage',
    },
  },
  I32: {
    id: 'I32',
    name: 'Twin-Fuse Knot',
    emoji: '🧬',
    baseRarity: 'MYTHIC',
    stats: {},
    tags: ['BLAST'],
    effect: {
      timing: 'PASSIVE',
      description: 'Your bomb triggers happen twice',
    },
  },

  // ============================================================================
  // FROST (8 items: I33-I40)
  // ============================================================================
  I33: {
    id: 'I33',
    name: 'Frost Lantern',
    emoji: '🏮',
    baseRarity: 'COMMON',
    stats: {},
    tags: ['FROST'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: give enemy 1 Chill',
    },
  },
  I34: {
    id: 'I34',
    name: 'Frostguard Buckler',
    emoji: '🛡️❄️',
    baseRarity: 'RARE',
    stats: { arm: 6 },
    tags: ['FROST'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: if enemy has Chill, gain +2 Armor',
    },
  },
  I35: {
    id: 'I35',
    name: 'Cold Snap Charm',
    emoji: '❄️✨',
    baseRarity: 'RARE',
    stats: {},
    tags: ['FROST'],
    effect: {
      timing: 'FIRST_TURN',
      description: 'If you act first on Turn 1: apply 2 Chill',
    },
  },
  I36: {
    id: 'I36',
    name: 'Ice Skates',
    emoji: '⛸️',
    baseRarity: 'RARE',
    stats: { spd: 1 },
    tags: ['FROST'],
  },
  I37: {
    id: 'I37',
    name: 'Rime Cloak',
    emoji: '🧥❄️',
    baseRarity: 'RARE',
    stats: { arm: 3 },
    tags: ['FROST'],
    effect: {
      timing: 'ON_STRUCK',
      description: 'When struck (once/turn): apply 1 Chill to attacker',
    },
  },
  I38: {
    id: 'I38',
    name: 'Permafrost Core',
    emoji: '🧊',
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['FROST'],
    effect: {
      timing: 'TURN_START',
      description: 'Turn Start: if enemy has Chill, gain 1 Armor',
    },
  },
  I39: {
    id: 'I39',
    name: 'Cold Front Idol',
    emoji: '🗿❄️',
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['FROST'],
    effect: {
      timing: 'EVERY_OTHER_TURN',
      description:
        'Every other turn: apply 1 Chill; if enemy already has Chill, gain +1 SPD this turn',
    },
  },
  I40: {
    id: 'I40',
    name: 'Deep Freeze Charm',
    emoji: '🌨️',
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['FROST'],
    effect: {
      timing: 'WOUNDED',
      description: 'Wounded: apply 2 Chill and reduce enemy SPD by 1 (this battle)',
    },
  },

  // ============================================================================
  // RUST (8 items: I41-I48)
  // ============================================================================
  I41: {
    id: 'I41',
    name: 'Oxidizer Vial',
    emoji: '🧪',
    baseRarity: 'COMMON',
    stats: {},
    tags: ['RUST'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: apply 1 Rust (if enemy has Armor, apply +1 more)',
    },
  },
  I42: {
    id: 'I42',
    name: 'Rust Spike',
    emoji: '🪛',
    baseRarity: 'RARE',
    stats: {},
    tags: ['RUST'],
    effect: {
      timing: 'ON_HIT',
      description: 'On Hit (once/turn): apply 1 Rust',
    },
  },
  I43: {
    id: 'I43',
    name: 'Corroded Greaves',
    emoji: '🥾☣️',
    baseRarity: 'RARE',
    stats: { spd: 1 },
    tags: ['RUST'],
    effect: {
      timing: 'WOUNDED',
      description: 'Wounded: apply 2 Rust',
    },
  },
  I44: {
    id: 'I44',
    name: 'Acid Phial',
    emoji: '🧴',
    baseRarity: 'RARE',
    stats: {},
    tags: ['RUST'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: reduce enemy Armor by 2',
    },
  },
  I45: {
    id: 'I45',
    name: 'Flaking Plating',
    emoji: '🛡️☣️',
    baseRarity: 'RARE',
    stats: { arm: 6 },
    tags: ['RUST'],
    effect: {
      timing: 'EXPOSED',
      description: 'Exposed: apply 2 Rust to enemy',
    },
  },
  I46: {
    id: 'I46',
    name: 'Rust Engine',
    emoji: '⚙️☣️',
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['RUST'],
    effect: {
      timing: 'TURN_START',
      description: 'Turn Start: if enemy has Rust, deal 1 non-weapon damage',
    },
  },
  I47: {
    id: 'I47',
    name: 'Corrosion Loop',
    emoji: '🔄☣️',
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['RUST'],
    effect: {
      timing: 'ON_HIT',
      description: 'On Hit (once/turn): if enemy has Armor, apply +1 additional Rust',
    },
  },
  I48: {
    id: 'I48',
    name: 'Salvage Clamp',
    emoji: '🔧',
    baseRarity: 'COMMON',
    stats: {},
    tags: ['RUST'],
    effect: {
      timing: 'PASSIVE',
      description: 'Whenever you apply Rust (once/turn): gain 1 Gold',
    },
  },

  // ============================================================================
  // BLOOD (8 items: I49-I56)
  // ============================================================================
  I49: {
    id: 'I49',
    name: 'Last Breath Sigil',
    emoji: '💀',
    baseRarity: 'COMMON',
    stats: {},
    tags: ['BLOOD'],
    effect: {
      timing: 'ON_DEATH',
      description: 'One use: first time you would die in battle, prevent it and heal 2 HP',
    },
  },
  I50: {
    id: 'I50',
    name: 'Bloodletting Fang',
    emoji: '🦷🩸',
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLOOD'],
    effect: {
      timing: 'PASSIVE',
      description: 'Your attacks deal +1 damage to Bleeding enemies',
    },
  },
  I51: {
    id: 'I51',
    name: 'Leech Wraps',
    emoji: '🩹',
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLOOD'],
    effect: {
      timing: 'TURN_END',
      description: 'When enemy takes Bleed damage: heal 1 HP (once/turn)',
    },
  },
  I52: {
    id: 'I52',
    name: 'Blood Chalice',
    emoji: '🏆🩸',
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLOOD'],
    effect: {
      timing: 'VICTORY',
      description: 'Victory: heal 3 HP',
    },
  },
  I53: {
    id: 'I53',
    name: 'Hemorrhage Hook',
    emoji: '🪝🩸',
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['BLOOD'],
    effect: {
      timing: 'WOUNDED',
      description: 'Wounded: apply 2 Bleed',
    },
  },
  I54: {
    id: 'I54',
    name: 'Execution Emblem',
    emoji: '⚔️🩸',
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['BLOOD'],
    effect: {
      timing: 'ON_HIT',
      description: 'If enemy is Wounded, your first strike each turn deals +2 damage',
    },
  },
  I55: {
    id: 'I55',
    name: 'Gore Mantle',
    emoji: '🧥🩸',
    baseRarity: 'RARE',
    stats: {},
    tags: ['BLOOD'],
    effect: {
      timing: 'WOUNDED',
      description: 'First time you become Wounded in battle: gain 4 Armor',
    },
  },
  I56: {
    id: 'I56',
    name: 'Vampiric Tooth',
    emoji: '🧛',
    baseRarity: 'MYTHIC',
    stats: {},
    tags: ['BLOOD'],
    effect: {
      timing: 'ON_HIT',
      description: 'Your first hit each turn vs a Bleeding enemy heals 2 HP',
    },
  },

  // ============================================================================
  // TEMPO (8 items: I57-I64)
  // ============================================================================
  I57: {
    id: 'I57',
    name: 'Wind-Up Spring',
    emoji: '🌀',
    baseRarity: 'COMMON',
    stats: {},
    tags: ['TEMPO'],
    effect: {
      timing: 'FIRST_TURN',
      description: 'Turn 1: gain +1 SPD and +2 ATK (this battle)',
    },
  },
  I58: {
    id: 'I58',
    name: 'Ambush Charm',
    emoji: '🎯',
    baseRarity: 'RARE',
    stats: {},
    tags: ['TEMPO'],
    effect: {
      timing: 'FIRST_TURN',
      description: 'If you act first on Turn 1, your first strike deals +3 damage',
    },
  },
  I59: {
    id: 'I59',
    name: 'Counterweight Buckle',
    emoji: '⚖️',
    baseRarity: 'RARE',
    stats: {},
    tags: ['TEMPO'],
    effect: {
      timing: 'FIRST_TURN',
      description: 'If enemy acts first on Turn 1, gain 5 Armor before damage',
    },
  },
  I60: {
    id: 'I60',
    name: 'Hourglass Charge',
    emoji: '⏳',
    baseRarity: 'RARE',
    stats: {},
    tags: ['TEMPO'],
    effect: {
      timing: 'TURN_START',
      description: 'Turn 5: gain +2 ATK and +1 SPD (this battle)',
    },
  },
  I61: {
    id: 'I61',
    name: 'Initiative Lens',
    emoji: '🔭',
    baseRarity: 'RARE',
    stats: { spd: 1 },
    tags: ['TEMPO'],
    effect: {
      timing: 'BATTLE_START',
      description: 'Battle Start: if your SPD > enemy SPD, gain 3 Armor',
    },
  },
  I62: {
    id: 'I62',
    name: 'Backstep Buckle',
    emoji: '🔙',
    baseRarity: 'RARE',
    stats: {},
    tags: ['TEMPO'],
    effect: {
      timing: 'FIRST_TURN',
      description: 'If enemy acts first on Turn 1, your first strike deals +3 damage',
    },
  },
  I63: {
    id: 'I63',
    name: 'Tempo Battery',
    emoji: '🔋',
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['TEMPO'],
    effect: {
      timing: 'EVERY_OTHER_TURN',
      description: 'Every other turn: gain +1 SPD (this battle)',
    },
  },
  I64: {
    id: 'I64',
    name: 'Second Wind Clock',
    emoji: '🕐',
    baseRarity: 'HEROIC',
    stats: {},
    tags: ['TEMPO'],
    effect: {
      timing: 'TURN_START',
      description: 'Turn 5: heal 4 HP and gain +1 SPD (this battle)',
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
 * Item tier for tier-scaled effects (I, II, III)
 */
export type ItemTier = 1 | 2 | 3;

/**
 * Get scaled stat value based on item tier
 * Uses the pattern: base * tier for simple scaling
 * For items with tier arrays like [1, 2, 3], returns tierArray[tier - 1]
 */
export function getItemStats(
  gearId: GearId,
  tier: ItemTier = 1
): { stats: ItemStats; effectValue?: number } {
  const def = getGearDefinition(gearId);
  const multiplier = tier;

  // Scale base stats by tier
  const scaledStats: ItemStats = {};
  if (def.stats.atk !== undefined) scaledStats.atk = def.stats.atk * multiplier;
  if (def.stats.arm !== undefined) scaledStats.arm = def.stats.arm * multiplier;
  if (def.stats.spd !== undefined) scaledStats.spd = def.stats.spd * multiplier;
  if (def.stats.dig !== undefined) scaledStats.dig = def.stats.dig * multiplier;
  if (def.stats.hp !== undefined) scaledStats.hp = def.stats.hp * multiplier;

  // Effect value scales with tier (base value at tier 1)
  // Most effects use pattern: tier 1 = base, tier 2 = base+1 or base*1.5, tier 3 = base+2 or base*2
  const effectValue = tier;

  return {
    stats: scaledStats,
    effectValue,
  };
}

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
