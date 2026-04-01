/**
 * Boss Definitions for PvE Dungeon Crawler
 * @see docs/gdd.md Section 13 - Bosses
 * @see specs/003-gdd-mechanics-update/data-model.md - Boss Entities
 */

import type { BossId, ItemTag, EffectTiming } from '../game/engine/types';

// ============================================================================
// Boss Definition Interface
// ============================================================================

export type BiomeType = 'A' | 'B';

export interface BossAbility {
  name: string;
  timing: EffectTiming;
  description: string;
  params?: Record<string, number | string>;
}

export interface BossDefinition {
  id: BossId;
  name: string;
  emoji: string;
  biome: BiomeType;
  week: 1 | 2 | 3;
  stats: {
    hp: number;
    atk: number;
    arm: number;
    spd: number;
    dig: number;
  };
  weaknessTags: [ItemTag, ItemTag];
  abilities: BossAbility[];
}

// ============================================================================
// Boss Definitions - Biome A
// ============================================================================

export const BOSSES: Record<BossId, BossDefinition> = {
  // Biome A - Week 1 (5 bosses)
  'B-A-W1-01': {
    id: 'B-A-W1-01',
    name: 'The Broodmother',
    emoji: '\u{1F577}\uFE0F', // Spider
    biome: 'A',
    week: 1,
    stats: { hp: 24, atk: 2, arm: 1, spd: 2, dig: 1 },
    weaknessTags: ['STONE', 'FROST'],
    abilities: [
      {
        name: 'Swarm Queen',
        timing: 'PASSIVE',
        description: 'Attacks 2 times per turn',
        params: { strikes: 2 },
      },
      {
        name: 'Webbed Strikes',
        timing: 'EVERY_OTHER_TURN',
        description: 'Every other turn, first strike applies 1 Chill',
        params: { chill: 1 },
      },
    ],
  },

  'B-A-W1-02': {
    id: 'B-A-W1-02',
    name: 'Obsidian Golem',
    emoji: '\u{1F5FF}', // Moyai
    biome: 'A',
    week: 1,
    stats: { hp: 28, atk: 2, arm: 8, spd: 0, dig: 3 },
    weaknessTags: ['RUST', 'BLAST'],
    abilities: [
      {
        name: 'Hardened Core',
        timing: 'TURN_START',
        description: 'Turn Start: +2 Armor',
        params: { armor: 2 },
      },
      {
        name: 'Cracked Shell',
        timing: 'ON_STRUCK',
        description: 'Taking non-weapon damage removes 2 Armor after damage',
        params: { armorLoss: 2 },
      },
    ],
  },

  'B-A-W1-03': {
    id: 'B-A-W1-03',
    name: 'Gas Anomaly',
    emoji: '\u2601\uFE0F', // Cloud
    biome: 'A',
    week: 1,
    stats: { hp: 26, atk: 2, arm: 0, spd: 1, dig: 2 },
    weaknessTags: ['BLOOD', 'TEMPO'],
    abilities: [
      {
        name: 'Toxic Seep',
        timing: 'TURN_START',
        description: 'Turn Start: Deal 1 damage ignoring Armor',
        params: { damage: 1 },
      },
      {
        name: 'Fume Panic',
        timing: 'WOUNDED',
        description: 'Wounded: gain +1 SPD this battle',
        params: { spd: 1 },
      },
    ],
  },

  'B-A-W1-04': {
    id: 'B-A-W1-04',
    name: 'Mad Miner',
    emoji: '\u26CF\uFE0F', // Pick
    biome: 'A',
    week: 1,
    stats: { hp: 26, atk: 2, arm: 3, spd: 2, dig: 3 },
    weaknessTags: ['SCOUT', 'GREED'],
    abilities: [
      {
        name: 'Undermine',
        timing: 'BATTLE_START',
        description: 'Battle Start: if your DIG < boss DIG, you are Exposed for Turn 1 only',
      },
      {
        name: 'Claim Jump',
        timing: 'FIRST_TURN',
        description: 'First Turn: if you are Exposed, boss gains +1 strike',
        params: { strikes: 1 },
      },
    ],
  },

  'B-A-W1-05': {
    id: 'B-A-W1-05',
    name: 'Shard Colossus',
    emoji: '\u{1FAB2}', // Beetle
    biome: 'A',
    week: 1,
    stats: { hp: 26, atk: 2, arm: 3, spd: 1, dig: 2 },
    weaknessTags: ['STONE', 'BLOOD'],
    abilities: [
      {
        name: 'Prismatic Spines',
        timing: 'BATTLE_START',
        description: 'Battle Start: gain 4 Shrapnel',
        params: { shrapnel: 4 },
      },
      {
        name: 'Refracting Hide',
        timing: 'EVERY_OTHER_TURN',
        description: 'Every other turn: gain +2 Shrapnel',
        params: { shrapnel: 2 },
      },
    ],
  },

  // Biome A - Week 2 (5 bosses)
  'B-A-W2-01': {
    id: 'B-A-W2-01',
    name: 'Drill Sergeant',
    emoji: '\u{1FA96}', // Military Helmet
    biome: 'A',
    week: 2,
    stats: { hp: 34, atk: 2, arm: 6, spd: 2, dig: 3 },
    weaknessTags: ['FROST', 'TEMPO'],
    abilities: [
      {
        name: 'Rev Up',
        timing: 'TURN_START',
        description: 'Turn Start: +1 ATK and +1 SPD this battle (max +4 each)',
        params: { atk: 1, spd: 1, maxStacks: 4 },
      },
      {
        name: 'Formation',
        timing: 'EVERY_OTHER_TURN',
        description: 'Every other turn: +1 Armor',
        params: { armor: 1 },
      },
    ],
  },

  'B-A-W2-02': {
    id: 'B-A-W2-02',
    name: 'Crystal Mimic',
    emoji: '\u{1F48E}', // Gem
    biome: 'A',
    week: 2,
    stats: { hp: 36, atk: 3, arm: 5, spd: 2, dig: 2 },
    weaknessTags: ['BLAST', 'SCOUT'],
    abilities: [
      {
        name: 'Prismatic Reflection',
        timing: 'PASSIVE',
        description: '2 reflection stacks (first 2 status applications reflect to you)',
        params: { reflectionStacks: 2 },
      },
      {
        name: 'Glass Heart',
        timing: 'PASSIVE',
        description: 'After reflection is gone, takes +2 non-weapon damage',
        params: { bonusDamage: 2 },
      },
    ],
  },

  'B-A-W2-03': {
    id: 'B-A-W2-03',
    name: 'Rust Regent',
    emoji: '\u{1F451}\u2623\uFE0F', // Crown + Biohazard
    biome: 'A',
    week: 2,
    stats: { hp: 36, atk: 2, arm: 5, spd: 2, dig: 3 },
    weaknessTags: ['BLOOD', 'TEMPO'],
    abilities: [
      {
        name: 'Corroding Edict',
        timing: 'ON_HIT',
        description: 'On Hit (once/turn): apply 1 Rust',
        params: { rust: 1 },
      },
      {
        name: 'Execution Tax',
        timing: 'TURN_START',
        description: 'If you are Exposed at Turn Start, take 1 damage ignoring Armor',
        params: { damage: 1 },
      },
    ],
  },

  'B-A-W2-04': {
    id: 'B-A-W2-04',
    name: 'Powder Keg Baron',
    emoji: '\u{1F9E8}', // Firecracker
    biome: 'A',
    week: 2,
    stats: { hp: 32, atk: 2, arm: 4, spd: 2, dig: 2 },
    weaknessTags: ['STONE', 'FROST'],
    abilities: [
      {
        name: 'Volatile Countdown',
        timing: 'COUNTDOWN',
        description: 'Countdown(3): deal 8 damage to you and self (non-weapon)',
        params: { countdown: 3, damage: 8 },
      },
      {
        name: 'Short Fuse',
        timing: 'WOUNDED',
        description: 'When Wounded, reduce its Countdown by 1',
        params: { countdownReduction: 1 },
      },
    ],
  },

  'B-A-W2-05': {
    id: 'B-A-W2-05',
    name: 'Greedkeeper',
    emoji: '\u{1FA99}\u{1F5DD}\uFE0F', // Coin + Key
    biome: 'A',
    week: 2,
    stats: { hp: 38, atk: 2, arm: 6, spd: 1, dig: 2 },
    weaknessTags: ['GREED', 'RUST'],
    abilities: [
      {
        name: 'Toll Collector',
        timing: 'BATTLE_START',
        description: 'Battle Start: steal 16 Gold (or all)',
        params: { goldSteal: 16 },
      },
      {
        name: 'Gilded Barrier',
        timing: 'BATTLE_START',
        description: 'Gain Armor equal to stolenGold/4 (cap 4)',
        params: { armorPerGold: 4, armorCap: 4 },
      },
    ],
  },

  // Biome A - Week 3 Finals (2 bosses)
  'B-A-W3-01': {
    id: 'B-A-W3-01',
    name: 'The Eldritch Mole',
    emoji: '\u{1F409}', // Dragon
    biome: 'A',
    week: 3,
    stats: { hp: 50, atk: 4, arm: 8, spd: 3, dig: 4 },
    weaknessTags: ['RUST', 'TEMPO'],
    abilities: [
      {
        name: 'Three Phases',
        timing: 'PASSIVE',
      description: '75% HP: +6 Armor; 50%: attacks twice/turn; 25%: Turn Start apply 2 Bleed to you',
      params: { phase1Armor: 6, phase2Strikes: 2, phase3Bleed: 2 },
      },
      {
        name: 'Deep Dig',
        timing: 'BATTLE_START',
      description: 'Battle Start: if your DIG > boss DIG, Phase 1 armor gain reduced by 6',
      params: { armorReduction: 6 },
      },
    ],
  },

  'B-A-W3-02': {
    id: 'B-A-W3-02',
    name: 'The Gilded Devourer',
    emoji: '\u{1F40D}\u{1F3E6}', // Snake + Bank
    biome: 'A',
    week: 3,
    stats: { hp: 46, atk: 3, arm: 6, spd: 2, dig: 3 },
    weaknessTags: ['GREED', 'BLOOD'],
    abilities: [
      {
        name: 'Tax Feast',
        timing: 'BATTLE_START',
        description: 'Battle Start: convert your Gold into Armor (+1 per 3 Gold, cap 12)',
        params: { goldPerArmor: 3, armorCap: 12 },
      },
      {
        name: 'Hunger',
        timing: 'WOUNDED',
        description: 'Wounded: apply 2 Bleed to you',
        params: { bleed: 2 },
      },
    ],
  },

  // Biome B - Week 1 (5 bosses) - Same archetypes as Biome A with +1 SPD (capped at 3)
  'B-B-W1-01': {
    id: 'B-B-W1-01',
    name: 'The Broodmother',
    emoji: '\u{1F577}\uFE0F',
    biome: 'B',
    week: 1,
    stats: { hp: 24, atk: 2, arm: 1, spd: 3, dig: 1 },
    weaknessTags: ['STONE', 'FROST'],
    abilities: [
      {
        name: 'Swarm Queen',
        timing: 'PASSIVE',
        description: 'Attacks 2 times per turn',
        params: { strikes: 2 },
      },
      {
        name: 'Webbed Strikes',
        timing: 'EVERY_OTHER_TURN',
        description: 'Every other turn, first strike applies 1 Chill',
        params: { chill: 1 },
      },
    ],
  },

  'B-B-W1-02': {
    id: 'B-B-W1-02',
    name: 'Obsidian Golem',
    emoji: '\u{1F5FF}',
    biome: 'B',
    week: 1,
    stats: { hp: 28, atk: 2, arm: 8, spd: 1, dig: 3 },
    weaknessTags: ['RUST', 'BLAST'],
    abilities: [
      {
        name: 'Hardened Core',
        timing: 'TURN_START',
        description: 'Turn Start: +2 Armor',
        params: { armor: 2 },
      },
      {
        name: 'Cracked Shell',
        timing: 'ON_STRUCK',
        description: 'Taking non-weapon damage removes 2 Armor after damage',
        params: { armorLoss: 2 },
      },
    ],
  },

  'B-B-W1-03': {
    id: 'B-B-W1-03',
    name: 'Gas Anomaly',
    emoji: '\u2601\uFE0F',
    biome: 'B',
    week: 1,
    stats: { hp: 26, atk: 2, arm: 0, spd: 2, dig: 2 },
    weaknessTags: ['BLOOD', 'TEMPO'],
    abilities: [
      {
        name: 'Toxic Seep',
        timing: 'TURN_START',
        description: 'Turn Start: Deal 1 damage ignoring Armor',
        params: { damage: 1 },
      },
      {
        name: 'Fume Panic',
        timing: 'WOUNDED',
        description: 'Wounded: gain +1 SPD this battle',
        params: { spd: 1 },
      },
    ],
  },

  'B-B-W1-04': {
    id: 'B-B-W1-04',
    name: 'Mad Miner',
    emoji: '\u26CF\uFE0F',
    biome: 'B',
    week: 1,
    stats: { hp: 26, atk: 2, arm: 3, spd: 3, dig: 3 },
    weaknessTags: ['SCOUT', 'GREED'],
    abilities: [
      {
        name: 'Undermine',
        timing: 'BATTLE_START',
        description: 'Battle Start: if your DIG < boss DIG, you are Exposed for Turn 1 only',
      },
      {
        name: 'Claim Jump',
        timing: 'FIRST_TURN',
        description: 'First Turn: if you are Exposed, boss gains +1 strike',
        params: { strikes: 1 },
      },
    ],
  },

  'B-B-W1-05': {
    id: 'B-B-W1-05',
    name: 'Shard Colossus',
    emoji: '\u{1FAB2}',
    biome: 'B',
    week: 1,
    stats: { hp: 26, atk: 2, arm: 3, spd: 2, dig: 2 },
    weaknessTags: ['STONE', 'BLOOD'],
    abilities: [
      {
        name: 'Prismatic Spines',
        timing: 'BATTLE_START',
        description: 'Battle Start: gain 4 Shrapnel',
        params: { shrapnel: 4 },
      },
      {
        name: 'Refracting Hide',
        timing: 'EVERY_OTHER_TURN',
        description: 'Every other turn: gain +2 Shrapnel',
        params: { shrapnel: 2 },
      },
    ],
  },

  // Biome B - Week 2 (5 bosses) - Same archetypes as Biome A with +1 SPD (capped at 3)
  'B-B-W2-01': {
    id: 'B-B-W2-01',
    name: 'Drill Sergeant',
    emoji: '\u{1FA96}',
    biome: 'B',
    week: 2,
    stats: { hp: 34, atk: 2, arm: 6, spd: 3, dig: 3 },
    weaknessTags: ['FROST', 'TEMPO'],
    abilities: [
      {
        name: 'Rev Up',
        timing: 'TURN_START',
        description: 'Turn Start: +1 ATK and +1 SPD this battle (max +4 each)',
        params: { atk: 1, spd: 1, maxStacks: 4 },
      },
      {
        name: 'Formation',
        timing: 'EVERY_OTHER_TURN',
        description: 'Every other turn: +1 Armor',
        params: { armor: 1 },
      },
    ],
  },

  'B-B-W2-02': {
    id: 'B-B-W2-02',
    name: 'Crystal Mimic',
    emoji: '\u{1F48E}',
    biome: 'B',
    week: 2,
    stats: { hp: 36, atk: 3, arm: 5, spd: 3, dig: 2 },
    weaknessTags: ['BLAST', 'SCOUT'],
    abilities: [
      {
        name: 'Prismatic Reflection',
        timing: 'PASSIVE',
        description: '2 reflection stacks (first 2 status applications reflect to you)',
        params: { reflectionStacks: 2 },
      },
      {
        name: 'Glass Heart',
        timing: 'PASSIVE',
        description: 'After reflection is gone, takes +2 non-weapon damage',
        params: { bonusDamage: 2 },
      },
    ],
  },

  'B-B-W2-03': {
    id: 'B-B-W2-03',
    name: 'Rust Regent',
    emoji: '\u{1F451}\u2623\uFE0F',
    biome: 'B',
    week: 2,
    stats: { hp: 36, atk: 2, arm: 5, spd: 3, dig: 3 },
    weaknessTags: ['BLOOD', 'TEMPO'],
    abilities: [
      {
        name: 'Corroding Edict',
        timing: 'ON_HIT',
        description: 'On Hit (once/turn): apply 1 Rust',
        params: { rust: 1 },
      },
      {
        name: 'Execution Tax',
        timing: 'TURN_START',
        description: 'If you are Exposed at Turn Start, take 1 damage ignoring Armor',
        params: { damage: 1 },
      },
    ],
  },

  'B-B-W2-04': {
    id: 'B-B-W2-04',
    name: 'Powder Keg Baron',
    emoji: '\u{1F9E8}',
    biome: 'B',
    week: 2,
    stats: { hp: 32, atk: 2, arm: 4, spd: 3, dig: 2 },
    weaknessTags: ['STONE', 'FROST'],
    abilities: [
      {
        name: 'Volatile Countdown',
        timing: 'COUNTDOWN',
        description: 'Countdown(3): deal 8 damage to you and self (non-weapon)',
        params: { countdown: 3, damage: 8 },
      },
      {
        name: 'Short Fuse',
        timing: 'WOUNDED',
        description: 'When Wounded, reduce its Countdown by 1',
        params: { countdownReduction: 1 },
      },
    ],
  },

  'B-B-W2-05': {
    id: 'B-B-W2-05',
    name: 'Greedkeeper',
    emoji: '\u{1FA99}\u{1F5DD}\uFE0F',
    biome: 'B',
    week: 2,
    stats: { hp: 38, atk: 2, arm: 6, spd: 2, dig: 2 },
    weaknessTags: ['GREED', 'RUST'],
    abilities: [
      {
        name: 'Toll Collector',
        timing: 'BATTLE_START',
        description: 'Battle Start: steal 16 Gold (or all)',
        params: { goldSteal: 16 },
      },
      {
        name: 'Gilded Barrier',
        timing: 'BATTLE_START',
        description: 'Gain Armor equal to stolenGold/4 (cap 4)',
        params: { armorPerGold: 4, armorCap: 4 },
      },
    ],
  },

  // Biome B - Week 3 Finals (2 bosses)
  'B-B-W3-01': {
    id: 'B-B-W3-01',
    name: 'The Frostbound Leviathan',
    emoji: '\u{1F40B}\u{1F9CA}', // Whale + Ice
    biome: 'B',
    week: 3,
    stats: { hp: 52, atk: 3, arm: 10, spd: 2, dig: 3 },
    weaknessTags: ['RUST', 'STONE'],
    abilities: [
      {
        name: 'Whiteout',
        timing: 'BATTLE_START',
        description: 'Battle Start: apply 2 Chill to you',
        params: { chill: 2 },
      },
      {
        name: 'Glacial Bulk',
        timing: 'EVERY_OTHER_TURN',
        description: 'Every other turn: +3 Armor',
        params: { armor: 3 },
      },
      {
        name: 'Crack Ice',
        timing: 'EXPOSED',
        description: 'When Exposed: remove all Chill and gain +2 SPD this battle',
        params: { spd: 2 },
      },
    ],
  },

  'B-B-W3-02': {
    id: 'B-B-W3-02',
    name: 'The Rusted Chronomancer',
    emoji: '\u{1F9D9}\u2623\uFE0F\u23F3', // Mage + Biohazard + Hourglass
    biome: 'B',
    week: 3,
    stats: { hp: 48, atk: 4, arm: 6, spd: 3, dig: 2 },
    weaknessTags: ['RUST', 'BLOOD'],
    abilities: [
      {
        name: 'Time Shear',
        timing: 'FIRST_TURN',
        description: 'First Turn: strikes twice',
        params: { strikes: 2 },
      },
      {
        name: 'Oxidized Future',
        timing: 'TURN_START',
        description: 'Turn Start: apply 1 Rust to you',
        params: { rust: 1 },
      },
      {
        name: 'Blood Price',
        timing: 'WOUNDED',
        description: 'Wounded: apply 3 Bleed to you',
        params: { bleed: 3 },
      },
    ],
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get boss definition by ID
 */
export function getBoss(id: BossId): BossDefinition {
  return BOSSES[id];
}

/**
 * Get all bosses for a given week
 */
export function getBossesForWeek(week: 1 | 2 | 3): BossDefinition[] {
  return Object.values(BOSSES).filter(boss => boss.week === week);
}

/**
 * Get all bosses for a given biome
 */
export function getBossesForBiome(biome: BiomeType): BossDefinition[] {
  return Object.values(BOSSES).filter(boss => boss.biome === biome);
}

/**
 * Get all bosses for a given biome and week
 */
export function getBossesForBiomeWeek(biome: BiomeType, week: 1 | 2 | 3): BossDefinition[] {
  return Object.values(BOSSES).filter(boss => boss.biome === biome && boss.week === week);
}
