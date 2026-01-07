/**
 * T119: Enemy traits that apply status effects
 * Implements enemy traits that interact with the status effects system
 * @see specs/001-pve-dungeon-crawler/spec.md Appendix A: Enemy Data
 * @see specs/001-pve-dungeon-crawler/data-model.md EnemyTrait
 */

import type { CombatState, CombatantState, EffectTiming, CombatLogEntry } from '../engine/types';
import { applyStatus } from './status-effects';

// ============================================================================
// Types
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

export interface EnemyTrait {
  id: EnemyId;
  name: string;
  description: string;
  timing: EffectTiming;
  execute: (state: CombatState, source: 'player' | 'enemy') => CombatState;
}

// ============================================================================
// Trait Implementations
// ============================================================================

/**
 * Tunnel Rat: On Hit: Steal 1 Gold (max once/turn)
 * Note: Gold stealing is not a status effect, handled separately
 */
const tunnelRatTrait: EnemyTrait = {
  id: 'TUNNEL_RAT',
  name: 'Thief',
  description: 'On Hit: Steal 1 Gold (max once/turn)',
  timing: 'ON_HIT',
  execute: (state: CombatState, source: 'player' | 'enemy'): CombatState => {
    // Gold stealing handled in combat resolver
    return state;
  },
};

/**
 * Cave Bat: Every other strike: restore 1 HP
 * Note: HP restoration handled in combat resolver
 */
const caveBatTrait: EnemyTrait = {
  id: 'CAVE_BAT',
  name: 'Leech',
  description: 'Every other strike: restore 1 HP',
  timing: 'ON_HIT',
  execute: (state: CombatState, source: 'player' | 'enemy'): CombatState => {
    // HP restoration handled in combat resolver
    return state;
  },
};

/**
 * Spore Slime: Battle Start: Give player 2 Chill
 * STATUS EFFECT TRAIT
 */
const sporeSlimeTrait: EnemyTrait = {
  id: 'SPORE_SLIME',
  name: 'Spore Cloud',
  description: 'Battle Start: Give player 2 Chill',
  timing: 'BATTLE_START',
  execute: (state: CombatState, source: 'player' | 'enemy'): CombatState => {
    // Only apply if the enemy is the Spore Slime
    if (source !== 'enemy') return state;

    const updatedPlayer = applyStatus(state.player, 'chill', 2);

    const logEntry: CombatLogEntry = {
      turn: state.turn,
      timing: 'BATTLE_START',
      actor: 'enemy',
      action: 'APPLY_STATUS',
      target: 'player',
      result: {
        statusApplied: { type: 'chill', stacks: 2 },
        effectName: 'Spore Cloud',
      },
      rngValues: [],
    };

    return {
      ...state,
      player: updatedPlayer,
      log: [...state.log, logEntry],
    };
  },
};

/**
 * Rust Mite Swarm: On Hit: Apply 1 Rust
 * STATUS EFFECT TRAIT
 */
const rustMiteSwarmTrait: EnemyTrait = {
  id: 'RUST_MITE_SWARM',
  name: 'Corrosive',
  description: 'On Hit: Apply 1 Rust',
  timing: 'ON_HIT',
  execute: (state: CombatState, source: 'player' | 'enemy'): CombatState => {
    // Only apply if the enemy is hitting the player
    if (source !== 'enemy') return state;

    const updatedPlayer = applyStatus(state.player, 'rust', 1);

    const logEntry: CombatLogEntry = {
      turn: state.turn,
      timing: 'ON_HIT',
      actor: 'enemy',
      action: 'APPLY_STATUS',
      target: 'player',
      result: {
        statusApplied: { type: 'rust', stacks: 1 },
        effectName: 'Corrosive',
      },
      rngValues: [],
    };

    return {
      ...state,
      player: updatedPlayer,
      log: [...state.log, logEntry],
    };
  },
};

/**
 * Collapsed Miner: Wounded: Gain +3 ATK
 * Note: ATK gain handled in combat resolver
 */
const collapsedMinerTrait: EnemyTrait = {
  id: 'COLLAPSED_MINER',
  name: 'Rage',
  description: 'Wounded: Gain +3 ATK',
  timing: 'ON_WOUNDED',
  execute: (state: CombatState, source: 'player' | 'enemy'): CombatState => {
    // ATK gain handled in combat resolver
    return state;
  },
};

/**
 * Shard Beetle: Battle Start: Gain 5 Shrapnel
 * STATUS EFFECT TRAIT
 */
const shardBeetleTrait: EnemyTrait = {
  id: 'SHARD_BEETLE',
  name: 'Shards',
  description: 'Battle Start: Gain 5 Shrapnel',
  timing: 'BATTLE_START',
  execute: (state: CombatState, source: 'player' | 'enemy'): CombatState => {
    // Only apply if the enemy is the Shard Beetle
    if (source !== 'enemy') return state;

    const updatedEnemy = applyStatus(state.enemy, 'shrapnel', 5);

    const logEntry: CombatLogEntry = {
      turn: state.turn,
      timing: 'BATTLE_START',
      actor: 'enemy',
      action: 'APPLY_STATUS',
      target: 'enemy',
      result: {
        statusApplied: { type: 'shrapnel', stacks: 5 },
        effectName: 'Shards',
      },
      rngValues: [],
    };

    return {
      ...state,
      enemy: updatedEnemy,
      log: [...state.log, logEntry],
    };
  },
};

/**
 * Tunnel Warden: First strike: Remove 4 Armor before damage
 * Note: Armor removal handled in combat resolver
 */
const tunnelWardenTrait: EnemyTrait = {
  id: 'TUNNEL_WARDEN',
  name: 'Armor Pierce',
  description: 'First strike: Remove 4 Armor before damage',
  timing: 'BEFORE_ATTACK',
  execute: (state: CombatState, source: 'player' | 'enemy'): CombatState => {
    // Armor piercing handled in combat resolver
    return state;
  },
};

/**
 * Burrow Ambusher: Ambush: Battle Start deal 3 damage (ignores armor)
 * Note: Direct damage handled in combat resolver
 */
const burrowAmbusherTrait: EnemyTrait = {
  id: 'BURROW_AMBUSHER',
  name: 'Ambush',
  description: 'Battle Start: Deal 3 damage (ignores armor)',
  timing: 'BATTLE_START',
  execute: (state: CombatState, source: 'player' | 'enemy'): CombatState => {
    // Direct damage handled in combat resolver
    return state;
  },
};

// ============================================================================
// Trait Registry
// ============================================================================

export const ENEMY_TRAITS: Record<EnemyId, EnemyTrait> = {
  TUNNEL_RAT: tunnelRatTrait,
  CAVE_BAT: caveBatTrait,
  SPORE_SLIME: sporeSlimeTrait,
  RUST_MITE_SWARM: rustMiteSwarmTrait,
  COLLAPSED_MINER: collapsedMinerTrait,
  SHARD_BEETLE: shardBeetleTrait,
  TUNNEL_WARDEN: tunnelWardenTrait,
  BURROW_AMBUSHER: burrowAmbusherTrait,
};

/**
 * Get trait by enemy ID
 */
export function getEnemyTrait(enemyId: EnemyId): EnemyTrait {
  return ENEMY_TRAITS[enemyId];
}

/**
 * Execute trait effects for a specific timing
 */
export function executeTraitEffects(
  state: CombatState,
  timing: EffectTiming,
  enemyId: EnemyId | null,
  source: 'player' | 'enemy'
): CombatState {
  if (!enemyId) return state;

  const trait = ENEMY_TRAITS[enemyId];
  if (trait.timing !== timing) return state;

  return trait.execute(state, source);
}

/**
 * Get all traits that trigger at a specific timing
 */
export function getTraitsForTiming(timing: EffectTiming): EnemyTrait[] {
  return Object.values(ENEMY_TRAITS).filter((trait) => trait.timing === timing);
}

/**
 * Check if a trait applies status effects
 */
export function traitAppliesStatus(enemyId: EnemyId): boolean {
  const statusTraits: EnemyId[] = ['SPORE_SLIME', 'RUST_MITE_SWARM', 'SHARD_BEETLE'];
  return statusTraits.includes(enemyId);
}
