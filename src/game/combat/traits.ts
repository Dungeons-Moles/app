/**
 * Enemy Traits - Phase 4 (User Story 2)
 * Implements all 12 enemy trait handlers per GDD Section 11
 * @see docs/gdd.md Section 11: Field Enemies
 */

import type { CombatState, CombatLogEntry, EffectTiming } from '../engine/types';
import { applyStatus } from './status-effects';
import type { EnemyId } from '../map/types';

// Re-export EnemyId for convenience
export type { EnemyId } from '../map/types';

// ============================================================================
// Types
// ============================================================================

export interface EnemyTrait {
  id: EnemyId;
  name: string;
  description: string;
  timing: EffectTiming | 'BEFORE_ATTACK' | 'COUNTDOWN' | 'FIRST_TURN' | 'FIRST_STRIKE' | 'WOUNDED';
  execute: (state: CombatState, source: 'player' | 'enemy', context?: TraitContext) => CombatState;
}

export interface TraitContext {
  /** Current turn number */
  turn?: number;
  /** Whether this is the first strike of the turn */
  isFirstStrike?: boolean;
  /** Whether the enemy acted first on turn 1 */
  enemyActedFirstOnTurn1?: boolean;
  /** Player's gold amount for Coin Slug trait */
  playerGold?: number;
  /** Countdown remaining for Powder Tick */
  countdownRemaining?: number;
}

// ============================================================================
// Trait Implementations
// ============================================================================

/**
 * Tunnel Rat: On Hit: Steal 1 Gold (max once/turn)
 * Note: Gold stealing is handled in combat resolver
 */
const tunnelRatTrait: EnemyTrait = {
  id: 'TUNNEL_RAT',
  name: 'Thief',
  description: 'On Hit (once/turn): steal 1 Gold',
  timing: 'ON_HIT',
  execute: (state: CombatState): CombatState => {
    // Gold stealing handled in combat resolver
    return state;
  },
};

/**
 * Cave Bat: Every other turn: restore 1 HP
 * Note: HP restoration handled in combat resolver
 */
const caveBatTrait: EnemyTrait = {
  id: 'CAVE_BAT',
  name: 'Leech',
  description: 'Every other turn: restore 1 HP',
  timing: 'EVERY_OTHER_TURN',
  execute: (state: CombatState): CombatState => {
    // HP restoration handled in combat resolver
    return state;
  },
};

/**
 * Spore Slime: Battle Start: Give player 1 Chill
 * STATUS EFFECT TRAIT
 */
const sporeSlimeTrait: EnemyTrait = {
  id: 'SPORE_SLIME',
  name: 'Spore Cloud',
  description: 'Battle Start: apply 1 Chill to you',
  timing: 'BATTLE_START',
  execute: (state: CombatState, source: 'player' | 'enemy'): CombatState => {
    if (source !== 'enemy') return state;

    const updatedPlayer = applyStatus(state.player, 'chill', 1);

    const logEntry: CombatLogEntry = {
      turn: state.turn,
      timing: 'BATTLE_START',
      actor: 'enemy',
      action: 'APPLY_STATUS',
      target: 'player',
      result: {
        statusApplied: { type: 'chill', stacks: 1 },
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
  description: 'On Hit (once/turn): apply 1 Rust',
  timing: 'ON_HIT',
  execute: (state: CombatState, source: 'player' | 'enemy'): CombatState => {
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
 * Collapsed Miner: Wounded: Gain +2 ATK
 */
const collapsedMinerTrait: EnemyTrait = {
  id: 'COLLAPSED_MINER',
  name: 'Rage',
  description: 'Wounded: gain +2 ATK (this battle)',
  timing: 'WOUNDED',
  execute: (state: CombatState, source: 'player' | 'enemy'): CombatState => {
    if (source !== 'enemy') return state;

    const updatedEnemy = {
      ...state.enemy,
      bonusAtk: state.enemy.bonusAtk + 2,
    };

    const logEntry: CombatLogEntry = {
      turn: state.turn,
      timing: 'WOUNDED',
      actor: 'enemy',
      action: 'TRIGGER_TRAIT',
      target: 'enemy',
      result: {
        effectName: 'Rage (+2 ATK)',
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
 * Shard Beetle: Battle Start: Gain 3 Shrapnel
 * STATUS EFFECT TRAIT
 */
const shardBeetleTrait: EnemyTrait = {
  id: 'SHARD_BEETLE',
  name: 'Shards',
  description: 'Battle Start: gain 3 Shrapnel',
  timing: 'BATTLE_START',
  execute: (state: CombatState, source: 'player' | 'enemy'): CombatState => {
    if (source !== 'enemy') return state;

    const updatedEnemy = applyStatus(state.enemy, 'shrapnel', 3);

    const logEntry: CombatLogEntry = {
      turn: state.turn,
      timing: 'BATTLE_START',
      actor: 'enemy',
      action: 'APPLY_STATUS',
      target: 'enemy',
      result: {
        statusApplied: { type: 'shrapnel', stacks: 3 },
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
 * Tunnel Warden: First strike each turn: remove 2 Armor before damage
 */
const tunnelWardenTrait: EnemyTrait = {
  id: 'TUNNEL_WARDEN',
  name: 'Armor Pierce',
  description: 'First strike each turn: remove 2 Armor from you before damage',
  timing: 'FIRST_STRIKE',
  execute: (
    state: CombatState,
    source: 'player' | 'enemy',
    context?: TraitContext
  ): CombatState => {
    if (source !== 'enemy') return state;
    if (!context?.isFirstStrike) return state;

    const armorRemoved = Math.min(2, state.player.arm);
    if (armorRemoved <= 0) return state;

    const updatedPlayer = {
      ...state.player,
      arm: state.player.arm - armorRemoved,
    };

    const logEntry: CombatLogEntry = {
      turn: state.turn,
      timing: 'BEFORE_ATTACK',
      actor: 'enemy',
      action: 'TRIGGER_TRAIT',
      target: 'player',
      result: {
        effectName: 'Armor Pierce',
        armorLost: armorRemoved,
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
 * Burrow Ambusher: Battle Start: deal 2 damage ignoring Armor
 */
const burrowAmbusherTrait: EnemyTrait = {
  id: 'BURROW_AMBUSHER',
  name: 'Ambush',
  description: 'Battle Start: deal 2 damage ignoring Armor',
  timing: 'BATTLE_START',
  execute: (state: CombatState, source: 'player' | 'enemy'): CombatState => {
    if (source !== 'enemy') return state;

    const damage = 2;
    const updatedPlayer = {
      ...state.player,
      hp: Math.max(0, state.player.hp - damage),
    };

    const logEntry: CombatLogEntry = {
      turn: state.turn,
      timing: 'BATTLE_START',
      actor: 'enemy',
      action: 'TRIGGER_TRAIT',
      target: 'player',
      result: {
        damage,
        effectName: 'Ambush',
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
 * Frost Wisp: If it acts first on Turn 1: apply 2 Chill
 * STATUS EFFECT TRAIT
 */
const frostWispTrait: EnemyTrait = {
  id: 'FROST_WISP',
  name: 'Frost Aura',
  description: 'If it acts first on Turn 1: apply 2 Chill',
  timing: 'FIRST_TURN',
  execute: (
    state: CombatState,
    source: 'player' | 'enemy',
    context?: TraitContext
  ): CombatState => {
    if (source !== 'enemy') return state;
    if (!context?.enemyActedFirstOnTurn1) return state;

    const updatedPlayer = applyStatus(state.player, 'chill', 2);

    const logEntry: CombatLogEntry = {
      turn: state.turn,
      timing: 'FIRST_TURN',
      actor: 'enemy',
      action: 'APPLY_STATUS',
      target: 'player',
      result: {
        statusApplied: { type: 'chill', stacks: 2 },
        effectName: 'Frost Aura',
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
 * Powder Tick: Countdown(3): deal 5 damage to you and itself (non-weapon)
 * Note: Countdown logic handled in combat resolver
 */
const powderTickTrait: EnemyTrait = {
  id: 'POWDER_TICK',
  name: 'Explosive',
  description: 'Countdown(3): deal 5 damage to you and itself (non-weapon)',
  timing: 'COUNTDOWN',
  execute: (
    state: CombatState,
    source: 'player' | 'enemy',
    context?: TraitContext
  ): CombatState => {
    if (source !== 'enemy') return state;
    // Only trigger when countdown reaches 0
    if (context?.countdownRemaining !== 0) return state;

    const damage = 5;
    const updatedPlayer = {
      ...state.player,
      hp: Math.max(0, state.player.hp - damage),
    };
    const updatedEnemy = {
      ...state.enemy,
      hp: Math.max(0, state.enemy.hp - damage),
    };

    const logEntry: CombatLogEntry = {
      turn: state.turn,
      timing: 'TURN_END',
      actor: 'enemy',
      action: 'TRIGGER_TRAIT',
      target: 'player',
      result: {
        damage,
        effectName: 'Explosive',
      },
      rngValues: [],
    };

    return {
      ...state,
      player: updatedPlayer,
      enemy: updatedEnemy,
      log: [...state.log, logEntry],
    };
  },
};

/**
 * Coin Slug: Battle Start: gain Armor equal to floor(your Gold/10) (cap 3)
 */
const coinSlugTrait: EnemyTrait = {
  id: 'COIN_SLUG',
  name: 'Gilded Shell',
  description: 'Battle Start: gain Armor equal to floor(your Gold/10) (cap 3)',
  timing: 'BATTLE_START',
  execute: (
    state: CombatState,
    source: 'player' | 'enemy',
    context?: TraitContext
  ): CombatState => {
    if (source !== 'enemy') return state;

    const playerGold = context?.playerGold ?? state.playerGold ?? 0;
    const armorGained = Math.min(3, Math.floor(playerGold / 10));

    if (armorGained <= 0) return state;

    const updatedEnemy = {
      ...state.enemy,
      arm: state.enemy.arm + armorGained,
    };

    const logEntry: CombatLogEntry = {
      turn: state.turn,
      timing: 'BATTLE_START',
      actor: 'enemy',
      action: 'TRIGGER_TRAIT',
      target: 'enemy',
      result: {
        armorGained,
        effectName: 'Gilded Shell',
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
 * Blood Mosquito: On Hit (once/turn): apply 1 Bleed
 * STATUS EFFECT TRAIT
 */
const bloodMosquitoTrait: EnemyTrait = {
  id: 'BLOOD_MOSQUITO',
  name: 'Bloodsucker',
  description: 'On Hit (once/turn): apply 1 Bleed',
  timing: 'ON_HIT',
  execute: (state: CombatState, source: 'player' | 'enemy'): CombatState => {
    if (source !== 'enemy') return state;

    const updatedPlayer = applyStatus(state.player, 'bleed', 1);

    const logEntry: CombatLogEntry = {
      turn: state.turn,
      timing: 'ON_HIT',
      actor: 'enemy',
      action: 'APPLY_STATUS',
      target: 'player',
      result: {
        statusApplied: { type: 'bleed', stacks: 1 },
        effectName: 'Bloodsucker',
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
  FROST_WISP: frostWispTrait,
  POWDER_TICK: powderTickTrait,
  COIN_SLUG: coinSlugTrait,
  BLOOD_MOSQUITO: bloodMosquitoTrait,
};

// ============================================================================
// Helper Functions
// ============================================================================

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
  source: 'player' | 'enemy',
  context?: TraitContext
): CombatState {
  if (!enemyId) return state;

  const trait = ENEMY_TRAITS[enemyId];
  if (!trait) return state;
  if (trait.timing !== timing) return state;

  return trait.execute(state, source, context);
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
  const statusTraits: EnemyId[] = [
    'SPORE_SLIME',
    'RUST_MITE_SWARM',
    'SHARD_BEETLE',
    'FROST_WISP',
    'BLOOD_MOSQUITO',
  ];
  return statusTraits.includes(enemyId);
}
