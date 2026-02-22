/**
 * Enemy Entity Definitions - Phase 4 (User Story 2)
 * 12 enemy archetypes with 3 tiers each, per GDD Section 11
 * @see docs/gdd.md Section 11: Field Enemies
 */

import type { EnemyId } from '@/game/map/types';

// ============================================================================
// Types
// ============================================================================

export interface EnemyTierStats {
  hp: number;
  atk: number;
  arm: number;
  spd: number;
  dig: number;
}

export interface EnemyDefinition {
  id: EnemyId;
  name: string;
  emoji: string;
  /** Stats per tier: [T1, T2, T3] */
  tiers: [EnemyTierStats, EnemyTierStats, EnemyTierStats];
  trait: {
    name: string;
    description: string;
    timing:
      | 'BATTLE_START'
      | 'ON_HIT'
      | 'EVERY_OTHER_TURN'
      | 'WOUNDED'
      | 'FIRST_STRIKE'
      | 'FIRST_TURN'
      | 'COUNTDOWN';
  };
  /** Which biome this enemy is emphasized in */
  biome: 'A' | 'B' | 'BOTH';
}

// ============================================================================
// Gold Rewards per GDD
// ============================================================================

/**
 * Gold rewards per tier per GDD Section 11:
 * - T1 = 2 gold
 * - T2 = 4 gold
 * - T3 = 6 gold
 */
export const TIER_GOLD_REWARDS: Record<1 | 2 | 3, number> = {
  1: 2,
  2: 4,
  3: 6,
};

/**
 * Calculate gold reward for defeating an enemy
 * Per GDD: T1=2, T2=4, T3=6 (regardless of enemy type)
 */
export function calculateGoldReward(_enemyId: string, tier: 1 | 2 | 3): number {
  return TIER_GOLD_REWARDS[tier];
}

// ============================================================================
// Enemy Definitions (12 archetypes)
// ============================================================================

/**
 * All enemy definitions per GDD Section 11
 * Stat format: HP/ATK/ARM/SPD/DIG
 */
export const ENEMY_DEFINITIONS: Record<EnemyId, EnemyDefinition> = {
  // --------------------------------------------------------------------------
  // Tunnel Rat: 🐀 | T1: 5/1/0/3/1 | T2: 7/2/0/4/1 | T3: 9/3/1/5/2
  // Trait: On Hit (once/turn): steal 1 Gold
  // --------------------------------------------------------------------------
  TUNNEL_RAT: {
    id: 'TUNNEL_RAT',
    name: 'Tunnel Rat',
    emoji: '🐀',
    tiers: [
      { hp: 5, atk: 1, arm: 0, spd: 3, dig: 1 },
      { hp: 7, atk: 2, arm: 0, spd: 4, dig: 1 },
      { hp: 9, atk: 3, arm: 1, spd: 5, dig: 2 },
    ],
    trait: {
      name: 'Thief',
      description: 'On Hit (once/turn): steal 1 Gold',
      timing: 'ON_HIT',
    },
    biome: 'A',
  },

  // --------------------------------------------------------------------------
  // Cave Bat: 🦇 | T1: 6/1/0/3/1 | T2: 8/2/0/4/1 | T3: 10/3/0/5/2
  // Trait: Every other turn: restore 1 HP
  // --------------------------------------------------------------------------
  CAVE_BAT: {
    id: 'CAVE_BAT',
    name: 'Cave Bat',
    emoji: '🦇',
    tiers: [
      { hp: 6, atk: 1, arm: 0, spd: 3, dig: 1 },
      { hp: 8, atk: 2, arm: 0, spd: 4, dig: 1 },
      { hp: 10, atk: 3, arm: 0, spd: 5, dig: 2 },
    ],
    trait: {
      name: 'Leech',
      description: 'Every other turn: restore 1 HP',
      timing: 'EVERY_OTHER_TURN',
    },
    biome: 'BOTH',
  },

  // --------------------------------------------------------------------------
  // Spore Slime: 🟢 | T1: 7/1/2/0/1 | T2: 10/2/3/0/1 | T3: 13/3/4/0/2
  // Trait: Battle Start: apply 1 Chill to you
  // --------------------------------------------------------------------------
  SPORE_SLIME: {
    id: 'SPORE_SLIME',
    name: 'Spore Slime',
    emoji: '🟢',
    tiers: [
      { hp: 7, atk: 1, arm: 2, spd: 0, dig: 1 },
      { hp: 10, atk: 2, arm: 3, spd: 0, dig: 1 },
      { hp: 13, atk: 3, arm: 4, spd: 0, dig: 2 },
    ],
    trait: {
      name: 'Spore Cloud',
      description: 'Battle Start: apply 1 Chill to you',
      timing: 'BATTLE_START',
    },
    biome: 'BOTH',
  },

  // --------------------------------------------------------------------------
  // Rust Mite Swarm: 🐜 | T1: 6/1/0/3/2 | T2: 9/2/0/4/2 | T3: 12/3/0/5/3
  // Trait: On Hit (once/turn): apply 1 Rust
  // --------------------------------------------------------------------------
  RUST_MITE_SWARM: {
    id: 'RUST_MITE_SWARM',
    name: 'Rust Mite Swarm',
    emoji: '🐜',
    tiers: [
      { hp: 6, atk: 1, arm: 0, spd: 3, dig: 2 },
      { hp: 9, atk: 2, arm: 0, spd: 4, dig: 2 },
      { hp: 12, atk: 3, arm: 0, spd: 5, dig: 3 },
    ],
    trait: {
      name: 'Corrosive',
      description: 'On Hit (once/turn): apply 1 Rust',
      timing: 'ON_HIT',
    },
    biome: 'B',
  },

  // --------------------------------------------------------------------------
  // Collapsed Miner: 🧟 | T1: 7/1/0/1/3 | T2: 11/2/0/2/3 | T3: 15/3/1/3/4
  // Trait: Wounded: gain +2 ATK (this battle)
  // --------------------------------------------------------------------------
  COLLAPSED_MINER: {
    id: 'COLLAPSED_MINER',
    name: 'Collapsed Miner',
    emoji: '🧟',
    tiers: [
      { hp: 7, atk: 1, arm: 0, spd: 1, dig: 3 },
      { hp: 11, atk: 2, arm: 0, spd: 2, dig: 3 },
      { hp: 15, atk: 3, arm: 1, spd: 3, dig: 4 },
    ],
    trait: {
      name: 'Rage',
      description: 'Wounded: gain +2 ATK (this battle)',
      timing: 'WOUNDED',
    },
    biome: 'A',
  },

  // --------------------------------------------------------------------------
  // Shard Beetle: 🪲 | T1: 8/1/2/1/2 | T2: 11/2/3/1/2 | T3: 14/3/4/2/3
  // Trait: Battle Start: gain 1 Shrapnel
  // --------------------------------------------------------------------------
  SHARD_BEETLE: {
    id: 'SHARD_BEETLE',
    name: 'Shard Beetle',
    emoji: '🪲',
    tiers: [
      { hp: 8, atk: 1, arm: 2, spd: 1, dig: 2 },
      { hp: 11, atk: 2, arm: 3, spd: 1, dig: 2 },
      { hp: 14, atk: 3, arm: 4, spd: 2, dig: 3 },
    ],
    trait: {
      name: 'Shards',
      description: 'Battle Start: gain 1 Shrapnel',
      timing: 'BATTLE_START',
    },
    biome: 'A',
  },

  // --------------------------------------------------------------------------
  // Tunnel Warden: 🦀 | T1: 8/2/2/2/2 | T2: 11/3/4/3/2 | T3: 14/4/6/4/3
  // Trait: First strike each turn: remove 1 Armor from you before damage
  // --------------------------------------------------------------------------
  TUNNEL_WARDEN: {
    id: 'TUNNEL_WARDEN',
    name: 'Tunnel Warden',
    emoji: '🦀',
    tiers: [
      { hp: 8, atk: 2, arm: 2, spd: 2, dig: 2 },
      { hp: 11, atk: 3, arm: 4, spd: 3, dig: 2 },
      { hp: 14, atk: 4, arm: 6, spd: 4, dig: 3 },
    ],
    trait: {
      name: 'Armor Pierce',
      description: 'First strike each turn: remove 1 Armor from you before damage',
      timing: 'FIRST_STRIKE',
    },
    biome: 'BOTH',
  },

  // --------------------------------------------------------------------------
  // Burrow Ambusher: 🦂 | T1: 6/2/0/4/2 | T2: 9/3/0/5/2 | T3: 12/4/0/6/3
  // Trait: Battle Start: deal 1 damage ignoring Armor
  // --------------------------------------------------------------------------
  BURROW_AMBUSHER: {
    id: 'BURROW_AMBUSHER',
    name: 'Burrow Ambusher',
    emoji: '🦂',
    tiers: [
      { hp: 6, atk: 2, arm: 0, spd: 4, dig: 2 },
      { hp: 9, atk: 3, arm: 0, spd: 5, dig: 2 },
      { hp: 12, atk: 4, arm: 0, spd: 6, dig: 3 },
    ],
    trait: {
      name: 'Ambush',
      description: 'Battle Start: deal 1 damage ignoring Armor',
      timing: 'BATTLE_START',
    },
    biome: 'B',
  },

  // --------------------------------------------------------------------------
  // Frost Wisp: 🧊 | T1: 7/1/0/4/1 | T2: 10/2/0/5/1 | T3: 13/3/0/6/2
  // Trait: If it acts first on Turn 1: apply 1 Chill
  // --------------------------------------------------------------------------
  FROST_WISP: {
    id: 'FROST_WISP',
    name: 'Frost Wisp',
    emoji: '🧊',
    tiers: [
      { hp: 7, atk: 1, arm: 0, spd: 4, dig: 1 },
      { hp: 10, atk: 2, arm: 0, spd: 5, dig: 1 },
      { hp: 13, atk: 3, arm: 0, spd: 6, dig: 2 },
    ],
    trait: {
      name: 'Frost Aura',
      description: 'If it acts first on Turn 1: apply 1 Chill',
      timing: 'FIRST_TURN',
    },
    biome: 'B',
  },

  // --------------------------------------------------------------------------
  // Powder Tick: 🧨 | T1: 6/1/0/2/1 | T2: 9/2/0/3/1 | T3: 12/3/0/4/2
  // Trait: Countdown(3): deal 3 damage to you and itself (non-weapon)
  // --------------------------------------------------------------------------
  POWDER_TICK: {
    id: 'POWDER_TICK',
    name: 'Powder Tick',
    emoji: '🧨',
    tiers: [
      { hp: 6, atk: 1, arm: 0, spd: 2, dig: 1 },
      { hp: 9, atk: 2, arm: 0, spd: 3, dig: 1 },
      { hp: 12, atk: 3, arm: 0, spd: 4, dig: 2 },
    ],
    trait: {
      name: 'Explosive',
      description: 'Countdown(3): deal 3 damage to you and itself (non-weapon)',
      timing: 'COUNTDOWN',
    },
    biome: 'B',
  },

  // --------------------------------------------------------------------------
  // Coin Slug: 🐌🪙 | T1: 7/1/2/1/1 | T2: 10/2/3/1/1 | T3: 13/3/4/2/2
  // Trait: Battle Start: gain Armor equal to floor(your Gold/10) (cap 3)
  // --------------------------------------------------------------------------
  COIN_SLUG: {
    id: 'COIN_SLUG',
    name: 'Coin Slug',
    emoji: '🐌🪙',
    tiers: [
      { hp: 7, atk: 1, arm: 2, spd: 1, dig: 1 },
      { hp: 10, atk: 2, arm: 3, spd: 1, dig: 1 },
      { hp: 13, atk: 3, arm: 4, spd: 2, dig: 2 },
    ],
    trait: {
      name: 'Gilded Shell',
      description: 'Battle Start: gain Armor equal to floor(your Gold/10) (cap 3)',
      timing: 'BATTLE_START',
    },
    biome: 'A',
  },

  // --------------------------------------------------------------------------
  // Blood Mosquito: 🦟 | T1: 6/1/0/3/1 | T2: 9/2/0/4/1 | T3: 12/3/0/5/2
  // Trait: On Hit (once/turn): apply 1 Bleed
  // --------------------------------------------------------------------------
  BLOOD_MOSQUITO: {
    id: 'BLOOD_MOSQUITO',
    name: 'Blood Mosquito',
    emoji: '🦟',
    tiers: [
      { hp: 6, atk: 1, arm: 0, spd: 3, dig: 1 },
      { hp: 9, atk: 2, arm: 0, spd: 4, dig: 1 },
      { hp: 12, atk: 3, arm: 0, spd: 5, dig: 2 },
    ],
    trait: {
      name: 'Bloodsucker',
      description: 'On Hit (once/turn): apply 1 Bleed',
      timing: 'ON_HIT',
    },
    biome: 'B',
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get enemy definition by ID
 */
export function getEnemyDefinition(id: EnemyId): EnemyDefinition {
  return ENEMY_DEFINITIONS[id];
}

/**
 * Get all enemy definitions as an array
 */
export function getAllEnemyDefinitions(): EnemyDefinition[] {
  return Object.values(ENEMY_DEFINITIONS);
}

/**
 * Get enemy stats for a specific tier (1-indexed: 1, 2, or 3)
 */
export function getEnemyTierStats(id: EnemyId, tier: 1 | 2 | 3): EnemyTierStats {
  const def = getEnemyDefinition(id);
  return def.tiers[tier - 1];
}

/**
 * Get enemies by biome emphasis
 */
export function getEnemiesByBiome(biome: 'A' | 'B'): EnemyDefinition[] {
  return getAllEnemyDefinitions().filter(
    (enemy) => enemy.biome === biome || enemy.biome === 'BOTH'
  );
}

/**
 * Get all enemy IDs
 */
export function getAllEnemyIds(): EnemyId[] {
  return Object.keys(ENEMY_DEFINITIONS) as EnemyId[];
}

/**
 * Maps on-chain archetype IDs (0-11) to EnemyId strings.
 * Order must match the Rust FieldEnemyArchetype enum in the Solana program.
 */
export const ARCHETYPE_TO_ENEMY_ID: EnemyId[] = [
  'TUNNEL_RAT',
  'CAVE_BAT',
  'SPORE_SLIME',
  'RUST_MITE_SWARM',
  'COLLAPSED_MINER',
  'SHARD_BEETLE',
  'TUNNEL_WARDEN',
  'BURROW_AMBUSHER',
  'FROST_WISP',
  'POWDER_TICK',
  'COIN_SLUG',
  'BLOOD_MOSQUITO',
];

/**
 * Derive enemy tier (1-3) by matching HP from the on-chain CombatStarted event
 * against the known tier stats for the given archetype.
 */
export function deriveEnemyTier(enemyId: EnemyId, enemyHp: number): 1 | 2 | 3 {
  const def = ENEMY_DEFINITIONS[enemyId];
  for (let t = 0; t < 3; t++) {
    if (def.tiers[t].hp === enemyHp) return (t + 1) as 1 | 2 | 3;
  }
  // Fallback: pick closest tier by HP
  let bestTier: 1 | 2 | 3 = 1;
  let bestDiff = Infinity;
  for (let t = 0; t < 3; t++) {
    const diff = Math.abs(def.tiers[t].hp - enemyHp);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestTier = (t + 1) as 1 | 2 | 3;
    }
  }
  return bestTier;
}
