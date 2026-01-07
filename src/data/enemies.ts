/**
 * Enemy Data Definitions
 * @see specs/001-pve-dungeon-crawler/spec.md Appendix A
 */

import type { EffectTiming, StatusEffects, CombatState } from '../game/engine/types';

// ============================================================================
// Enemy Types
// ============================================================================

export type EnemyId =
  | 'TUNNEL_RAT'
  | 'CAVE_BAT'
  | 'SPORE_SLIME'
  | 'RUST_MITE_SWARM'
  | 'COLLAPSED_MINER'
  | 'SHARD_BEETLE'
  | 'TUNNEL_WARDEN'
  | 'BURROW_AMBUSHER';

export interface EnemyTierStats {
  tier: 1 | 2 | 3;
  hp: number;
  atk: number;
  arm: number;
  spd: number;
}

export interface EnemyTrait {
  name: string;
  timing: EffectTiming;
  description: string;
}

export interface EnemyDefinition {
  id: EnemyId;
  name: string;
  emoji: string;
  tiers: [EnemyTierStats, EnemyTierStats, EnemyTierStats];
  trait: EnemyTrait;
}

// ============================================================================
// Enemy Definitions
// ============================================================================

export const ENEMIES: Record<EnemyId, EnemyDefinition> = {
  TUNNEL_RAT: {
    id: 'TUNNEL_RAT',
    name: 'Tunnel Rat',
    emoji: '🐀',
    tiers: [
      { tier: 1, hp: 3, atk: 1, arm: 0, spd: 2 },
      { tier: 2, hp: 5, atk: 2, arm: 0, spd: 3 },
      { tier: 3, hp: 7, atk: 3, arm: 0, spd: 4 },
    ],
    trait: {
      name: 'Thief',
      timing: 'ON_HIT',
      description: 'On Hit: Steal 1 Gold (max once/turn)',
    },
  },

  CAVE_BAT: {
    id: 'CAVE_BAT',
    name: 'Cave Bat',
    emoji: '🦇',
    tiers: [
      { tier: 1, hp: 4, atk: 1, arm: 0, spd: 2 },
      { tier: 2, hp: 6, atk: 2, arm: 0, spd: 3 },
      { tier: 3, hp: 8, atk: 3, arm: 0, spd: 4 },
    ],
    trait: {
      name: 'Vampiric',
      timing: 'ON_HIT',
      description: 'Every other strike: restore 1 HP',
    },
  },

  SPORE_SLIME: {
    id: 'SPORE_SLIME',
    name: 'Spore Slime',
    emoji: '🟢',
    tiers: [
      { tier: 1, hp: 6, atk: 1, arm: 2, spd: 0 },
      { tier: 2, hp: 9, atk: 2, arm: 3, spd: 0 },
      { tier: 3, hp: 12, atk: 3, arm: 4, spd: 0 },
    ],
    trait: {
      name: 'Spore Cloud',
      timing: 'BATTLE_START',
      description: 'Battle Start: Give player 2 Chill',
    },
  },

  RUST_MITE_SWARM: {
    id: 'RUST_MITE_SWARM',
    name: 'Rust Mite Swarm',
    emoji: '🐜',
    tiers: [
      { tier: 1, hp: 5, atk: 1, arm: 0, spd: 3 },
      { tier: 2, hp: 8, atk: 2, arm: 0, spd: 4 },
      { tier: 3, hp: 11, atk: 3, arm: 0, spd: 5 },
    ],
    trait: {
      name: 'Corrosive',
      timing: 'ON_HIT',
      description: 'On Hit: Apply 1 Rust',
    },
  },

  COLLAPSED_MINER: {
    id: 'COLLAPSED_MINER',
    name: 'Collapsed Miner',
    emoji: '🧟',
    tiers: [
      { tier: 1, hp: 8, atk: 2, arm: 0, spd: 1 },
      { tier: 2, hp: 12, atk: 3, arm: 0, spd: 2 },
      { tier: 3, hp: 16, atk: 4, arm: 0, spd: 3 },
    ],
    trait: {
      name: 'Desperate Fury',
      timing: 'ON_WOUNDED',
      description: 'Wounded: Gain +3 ATK',
    },
  },

  SHARD_BEETLE: {
    id: 'SHARD_BEETLE',
    name: 'Shard Beetle',
    emoji: '🪲',
    tiers: [
      { tier: 1, hp: 7, atk: 1, arm: 3, spd: 1 },
      { tier: 2, hp: 10, atk: 2, arm: 4, spd: 1 },
      { tier: 3, hp: 13, atk: 3, arm: 5, spd: 2 },
    ],
    trait: {
      name: 'Shard Shell',
      timing: 'BATTLE_START',
      description: 'Battle Start: Gain 5 Shrapnel',
    },
  },

  TUNNEL_WARDEN: {
    id: 'TUNNEL_WARDEN',
    name: 'Tunnel Warden',
    emoji: '🦀',
    tiers: [
      { tier: 1, hp: 6, atk: 2, arm: 4, spd: 2 },
      { tier: 2, hp: 9, atk: 3, arm: 6, spd: 3 },
      { tier: 3, hp: 12, atk: 4, arm: 8, spd: 4 },
    ],
    trait: {
      name: 'Armor Breaker',
      timing: 'BEFORE_ATTACK',
      description: 'First strike: Remove 4 Armor before damage',
    },
  },

  BURROW_AMBUSHER: {
    id: 'BURROW_AMBUSHER',
    name: 'Burrow Ambusher',
    emoji: '🦂',
    tiers: [
      { tier: 1, hp: 5, atk: 4, arm: 0, spd: 3 },
      { tier: 2, hp: 8, atk: 6, arm: 0, spd: 4 },
      { tier: 3, hp: 11, atk: 8, arm: 0, spd: 5 },
    ],
    trait: {
      name: 'Ambush',
      timing: 'BATTLE_START',
      description: 'Ambush: Battle Start deal 3 damage (ignores armor)',
    },
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

export function getEnemy(id: EnemyId): EnemyDefinition {
  return ENEMIES[id];
}

export function getEnemyTier(id: EnemyId, tier: 1 | 2 | 3): EnemyTierStats {
  return ENEMIES[id].tiers[tier - 1];
}

export function getAllEnemyIds(): EnemyId[] {
  return Object.keys(ENEMIES) as EnemyId[];
}

export function getEnemyStats(id: EnemyId, tier: 1 | 2 | 3) {
  const enemy = ENEMIES[id];
  const tierStats = enemy.tiers[tier - 1];
  return {
    id: enemy.id,
    name: enemy.name,
    emoji: enemy.emoji,
    ...tierStats,
  };
}
