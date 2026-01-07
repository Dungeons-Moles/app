/**
 * T047-T051, T118: Combat resolver for PvE Dungeon Crawler
 * Pure function resolver for deterministic auto-combat
 * @see specs/001-pve-dungeon-crawler/research.md R2
 * @see specs/001-pve-dungeon-crawler/spec.md FR-010 to FR-017
 */

import type {
  CombatState,
  CombatantState,
  CombatLogEntry,
  CombatAction,
  CombatActionResult,
  StatusEffects,
} from '../engine/types';
import {
  CombatPhase,
  DEFAULT_STATUS_EFFECTS,
} from '../engine/types';
import { GAME_CONSTANTS } from '../engine/constants';
import { SeededRNG } from '../engine/rng';
import { calculateDamage, applyDamage, isDefeated } from './damage';
import { processStatusEffectsTurnEnd } from './status-effects';
import { executeTraitEffects, type EnemyId } from './traits';

/**
 * Input for creating combat state
 */
export interface CombatResolverInput {
  player: CombatantState;
  enemy: CombatantState;
  seed: number;
  enemyId?: EnemyId; // Optional enemy ID for trait execution
  hasShrapnelHarness?: boolean; // True if player has Shrapnel Harness itemset
}

/**
 * T047: Create initial combat state from input
 */
export function createCombatState(input: CombatResolverInput): CombatState {
  return {
    player: { ...input.player },
    enemy: { ...input.enemy },
    turn: 0,
    phase: CombatPhase.BattleStart,
    log: [],
    rngState: input.seed,
    result: null,
  };
}

/**
 * T048-T051, T118: Resolve combat to completion
 * Pure function that runs combat from start to finish
 *
 * Combat flow per research.md R2:
 * 1. Battle Start - execute Battle Start effects (including enemy traits)
 * 2. Turn Start - execute Turn Start effects, increment turn counter
 * 3. Determine Order - higher SPEED attacks first
 * 4. Execute Attacks - calculate damage, apply, check death
 * 5. Turn End - apply end-of-turn effects (status decay)
 * 6. Loop until one combatant dies
 * 7. Battle End - set result
 */
export function resolveCombat(input: CombatResolverInput): CombatState {
  let state = createCombatState(input);
  const rng = new SeededRNG(input.seed);
  const { enemyId, hasShrapnelHarness = false } = input;

  // Phase 1: Battle Start
  state = executeBattleStart(state, rng, enemyId);

  // Check for immediate death (from Battle Start effects)
  if (checkCombatEnd(state)) {
    return finalizeCombat(state, rng);
  }

  // Main combat loop
  const MAX_TURNS = 100; // Safety limit
  while (state.turn < MAX_TURNS && !state.result) {
    // Phase 2: Turn Start
    state = executeTurnStart(state, rng, enemyId);

    // Check for death from Turn Start effects
    if (checkCombatEnd(state)) {
      break;
    }

    // Phase 3-4: Execute attacks in SPEED order
    state = executeAttackPhase(state, rng, enemyId);

    // Check for death
    if (checkCombatEnd(state)) {
      break;
    }

    // Phase 5: Turn End
    state = executeTurnEnd(state, rng, hasShrapnelHarness);

    // Check for death from Turn End effects
    if (checkCombatEnd(state)) {
      break;
    }
  }

  // Phase 6: Battle End
  return finalizeCombat(state, rng);
}

/**
 * T049, T118: Execute Battle Start phase
 * Effects that trigger at BATTLE_START timing
 * Includes enemy traits like Spore Slime (apply Chill) and Shard Beetle (gain Shrapnel)
 */
function executeBattleStart(state: CombatState, rng: SeededRNG, enemyId?: EnemyId): CombatState {
  state = { ...state, phase: CombatPhase.BattleStart };

  // Log Battle Start phase
  state = addLogEntry(state, {
    turn: 0,
    timing: CombatPhase.BattleStart,
    actor: 'system',
    action: 'TRIGGER_TRAIT',
    target: 'none',
    result: { effectName: 'Battle Start' },
    rngValues: [],
  });

  // Execute Battle Start traits from enemy (e.g., Spore Slime, Shard Beetle)
  if (enemyId) {
    state = executeTraitEffects(state, 'BATTLE_START', enemyId, 'enemy');
  }

  // TODO: Execute Battle Start effects from player items/itemsets

  return state;
}

/**
 * Execute Turn Start phase
 * Includes enemy traits that trigger on Turn Start (e.g., Obsidian Golem regen)
 */
function executeTurnStart(state: CombatState, rng: SeededRNG, enemyId?: EnemyId): CombatState {
  state = {
    ...state,
    turn: state.turn + 1,
    phase: CombatPhase.TurnStart,
  };

  // Execute Turn Start traits from enemy
  if (enemyId) {
    state = executeTraitEffects(state, 'TURN_START', enemyId, 'enemy');
  }

  // TODO: Execute Turn Start effects from player items/itemsets

  return state;
}

/**
 * T050: Execute attack phase with SPEED ordering
 */
function executeAttackPhase(state: CombatState, rng: SeededRNG, enemyId?: EnemyId): CombatState {
  // Determine attack order by SPEED
  const playerSpeed = state.player.spd + state.player.bonusSpd;
  const enemySpeed = state.enemy.spd + state.enemy.bonusSpd;

  // Higher SPEED attacks first
  // On tie, player attacks first (favor player)
  const playerGoesFirst = playerSpeed >= enemySpeed;

  if (playerGoesFirst) {
    // Player attacks
    state = { ...state, phase: CombatPhase.PlayerAttack };
    state = executeAttacks(state, 'player', rng, enemyId);

    // Check if enemy died
    if (isDefeated(state.enemy)) {
      return state;
    }

    // Enemy counter-attacks
    state = { ...state, phase: CombatPhase.EnemyAttack };
    state = executeAttacks(state, 'enemy', rng, enemyId);
  } else {
    // Enemy attacks first
    state = { ...state, phase: CombatPhase.EnemyAttack };
    state = executeAttacks(state, 'enemy', rng, enemyId);

    // Check if player died
    if (isDefeated(state.player)) {
      return state;
    }

    // Player counter-attacks
    state = { ...state, phase: CombatPhase.PlayerAttack };
    state = executeAttacks(state, 'player', rng, enemyId);
  }

  return state;
}

/**
 * Execute all attacks for a combatant (handles multi-strike)
 * Includes ON_HIT traits like Rust Mite Swarm
 */
function executeAttacks(
  state: CombatState,
  attacker: 'player' | 'enemy',
  rng: SeededRNG,
  enemyId?: EnemyId
): CombatState {
  const attackerState = attacker === 'player' ? state.player : state.enemy;
  const defenderKey = attacker === 'player' ? 'enemy' : 'player';
  const defender = state[defenderKey];

  const strikes = attackerState.strikesPerTurn;

  for (let strike = 0; strike < strikes; strike++) {
    // Check if defender already dead
    if (isDefeated(state[defenderKey])) {
      break;
    }

    // Calculate damage
    const currentAttacker = state[attacker];
    const currentDefender = state[defenderKey];
    const damageResult = calculateDamage(currentAttacker, currentDefender);

    // Apply damage to defender
    const newDefender = applyDamage(currentDefender, damageResult.finalDamage);

    // Update state with new defender HP
    state = {
      ...state,
      [defenderKey]: newDefender,
    };

    // Advance RNG for this attack (for potential future random effects)
    const rngValue = rng.next();

    // Log the attack
    state = addLogEntry(state, {
      turn: state.turn,
      timing: state.phase,
      actor: attacker,
      action: 'ATTACK',
      target: defenderKey as 'player' | 'enemy',
      result: {
        damage: damageResult.finalDamage,
        armorLost: damageResult.armorReduction,
      },
      rngValues: [rngValue],
    });

    // Execute ON_HIT traits (e.g., Rust Mite Swarm applies Rust)
    if (attacker === 'enemy' && enemyId) {
      state = executeTraitEffects(state, 'ON_HIT', enemyId, 'enemy');
    }

    // Apply Shrapnel reflect damage to attacker
    if (damageResult.shrapnelReflect > 0) {
      const newAttacker = applyDamage(state[attacker], damageResult.shrapnelReflect);
      state = {
        ...state,
        [attacker]: newAttacker,
      };

      // Log Shrapnel damage
      state = addLogEntry(state, {
        turn: state.turn,
        timing: state.phase,
        actor: defenderKey as 'player' | 'enemy',
        action: 'TRIGGER_TRAIT',
        target: attacker,
        result: {
          damage: damageResult.shrapnelReflect,
          effectName: 'Shrapnel',
        },
        rngValues: [],
      });
    }

    // Check if attacker died from Shrapnel
    if (isDefeated(state[attacker])) {
      break;
    }
  }

  return state;
}

/**
 * Execute Turn End phase
 * Handles status effect decay using processStatusEffectsTurnEnd
 */
function executeTurnEnd(state: CombatState, rng: SeededRNG, hasShrapnelHarness: boolean = false): CombatState {
  state = { ...state, phase: CombatPhase.TurnEnd };

  // Process player status effects
  const playerChillBefore = state.player.statusEffects.chill;
  const playerShrapnelBefore = state.player.statusEffects.shrapnel;
  const updatedPlayer = processStatusEffectsTurnEnd(state.player, hasShrapnelHarness);

  // Log Chill decay for player
  if (playerChillBefore > 0) {
    state = addLogEntry(state, {
      turn: state.turn,
      timing: 'TURN_END',
      actor: 'system',
      action: 'REMOVE_STATUS',
      target: 'player',
      result: {
        statusRemoved: { type: 'chill', stacks: 1 },
      },
      rngValues: [],
    });
  }

  // Log Shrapnel clear for player
  if (playerShrapnelBefore > 0) {
    const shrapnelCleared = hasShrapnelHarness
      ? Math.max(0, playerShrapnelBefore - 3)
      : playerShrapnelBefore;
    if (shrapnelCleared > 0) {
      state = addLogEntry(state, {
        turn: state.turn,
        timing: 'TURN_END',
        actor: 'system',
        action: 'REMOVE_STATUS',
        target: 'player',
        result: {
          statusRemoved: { type: 'shrapnel', stacks: shrapnelCleared },
        },
        rngValues: [],
      });
    }
  }

  state = { ...state, player: updatedPlayer };

  // Process enemy status effects (enemy never has Shrapnel Harness)
  const enemyChillBefore = state.enemy.statusEffects.chill;
  const enemyShrapnelBefore = state.enemy.statusEffects.shrapnel;
  const updatedEnemy = processStatusEffectsTurnEnd(state.enemy, false);

  // Log Chill decay for enemy
  if (enemyChillBefore > 0) {
    state = addLogEntry(state, {
      turn: state.turn,
      timing: 'TURN_END',
      actor: 'system',
      action: 'REMOVE_STATUS',
      target: 'enemy',
      result: {
        statusRemoved: { type: 'chill', stacks: 1 },
      },
      rngValues: [],
    });
  }

  // Log Shrapnel clear for enemy
  if (enemyShrapnelBefore > 0) {
    state = addLogEntry(state, {
      turn: state.turn,
      timing: 'TURN_END',
      actor: 'system',
      action: 'REMOVE_STATUS',
      target: 'enemy',
      result: {
        statusRemoved: { type: 'shrapnel', stacks: enemyShrapnelBefore },
      },
      rngValues: [],
    });
  }

  state = { ...state, enemy: updatedEnemy };

  // Note: Rust persists - it's handled during damage calculation

  return state;
}

/**
 * Check if combat should end
 */
function checkCombatEnd(state: CombatState): boolean {
  return isDefeated(state.player) || isDefeated(state.enemy);
}

/**
 * Finalize combat and set result
 */
function finalizeCombat(state: CombatState, rng: SeededRNG): CombatState {
  state = { ...state, phase: CombatPhase.BattleEnd };

  // Determine result
  // Per spec: player death is evaluated first (player loses on simultaneous death)
  let result: 'VICTORY' | 'DEFEAT';
  if (isDefeated(state.player)) {
    result = 'DEFEAT';
  } else if (isDefeated(state.enemy)) {
    result = 'VICTORY';
  } else {
    // Shouldn't happen, but default to defeat if both alive at end
    result = 'DEFEAT';
  }

  // Save final RNG state
  const finalRngState = rng.getState();

  return {
    ...state,
    result,
    rngState: finalRngState,
  };
}

/**
 * T051: Add log entry with bounded length
 */
function addLogEntry(state: CombatState, entry: CombatLogEntry): CombatState {
  const newLog = [...state.log, entry];

  // Cap log at MAX_COMBAT_LOG_ENTRIES
  if (newLog.length > GAME_CONSTANTS.MAX_COMBAT_LOG_ENTRIES) {
    return {
      ...state,
      log: newLog.slice(-GAME_CONSTANTS.MAX_COMBAT_LOG_ENTRIES),
    };
  }

  return {
    ...state,
    log: newLog,
  };
}
