/**
 * T047-T051, T110: Combat resolver for PvE Dungeon Crawler
 * Pure function resolver for deterministic auto-combat
 * Integrates boss traits (T102-T109)
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
  BossId,
} from '../engine/types';
import {
  CombatPhase,
  DEFAULT_STATUS_EFFECTS,
} from '../engine/types';
import { GAME_CONSTANTS } from '../engine/constants';
import { SeededRNG } from '../engine/rng';
import { calculateDamage, applyDamage, isDefeated } from './damage';
import {
  executeBossTrait,
  checkEldritchMolePhases,
  resetBossPhaseState,
  resetStatusReflectionFlag,
  isBoss,
} from '../entities/bosses';

/**
 * Input for creating combat state
 */
export interface CombatResolverInput {
  player: CombatantState;
  enemy: CombatantState;
  seed: number;
  /** Optional boss ID if fighting a boss (enables boss traits) */
  bossId?: BossId;
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
 * T048-T051, T110: Resolve combat to completion
 * Pure function that runs combat from start to finish
 *
 * Combat flow per research.md R2:
 * 1. Battle Start - execute Battle Start effects (including boss traits)
 * 2. Turn Start - execute Turn Start effects (boss traits like Obsidian Golem, Drill Sergeant)
 * 3. Determine Order - higher SPEED attacks first
 * 4. Execute Attacks - calculate damage, apply, check death, check boss phases
 * 5. Turn End - apply end-of-turn effects (status decay)
 * 6. Loop until one combatant dies
 * 7. Battle End - set result
 */
export function resolveCombat(input: CombatResolverInput): CombatState {
  let state = createCombatState(input);
  const rng = new SeededRNG(input.seed);
  const bossId = input.bossId;

  // Reset boss phase state for new combat
  if (bossId) {
    resetBossPhaseState();
  }

  // Phase 1: Battle Start
  state = executeBattleStart(state, rng, bossId);

  // Check for immediate death (from Battle Start effects)
  if (checkCombatEnd(state)) {
    return finalizeCombat(state, rng);
  }

  // Main combat loop
  const MAX_TURNS = 100; // Safety limit
  while (state.turn < MAX_TURNS && !state.result) {
    // Phase 2: Turn Start
    state = executeTurnStart(state, rng, bossId);

    // Check for death from Turn Start effects
    if (checkCombatEnd(state)) {
      break;
    }

    // Phase 3-4: Execute attacks in SPEED order
    state = executeAttackPhase(state, rng, bossId);

    // Check for death
    if (checkCombatEnd(state)) {
      break;
    }

    // Phase 5: Turn End
    state = executeTurnEnd(state, rng, bossId);

    // Check for death from Turn End effects
    if (checkCombatEnd(state)) {
      break;
    }
  }

  // Phase 6: Battle End
  return finalizeCombat(state, rng);
}

/**
 * T049, T110: Execute Battle Start phase
 * Effects that trigger at BATTLE_START timing
 * Executes boss traits like Broodmother (3 strikes) and Mad Miner (mirror item)
 */
function executeBattleStart(
  state: CombatState,
  rng: SeededRNG,
  bossId?: BossId
): CombatState {
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

  // T110: Execute boss BATTLE_START traits
  if (bossId) {
    const traitResult = executeBossTrait(state, bossId, 'BATTLE_START');
    if (traitResult.triggered) {
      state = traitResult.state;

      // Log boss trait activation
      state = addLogEntry(state, {
        turn: 0,
        timing: 'BATTLE_START',
        actor: 'enemy',
        action: 'TRIGGER_TRAIT',
        target: 'none',
        result: { effectName: traitResult.effectName },
        rngValues: [],
      });
    }
  }

  // TODO: Execute Battle Start effects from items/itemsets

  return state;
}

/**
 * T110: Execute Turn Start phase
 * Executes boss traits like Obsidian Golem (+3 Armor), Gas Anomaly (2 damage),
 * Drill Sergeant (+2 ATK), and resets Crystal Mimic reflection flag
 */
function executeTurnStart(
  state: CombatState,
  rng: SeededRNG,
  bossId?: BossId
): CombatState {
  state = {
    ...state,
    turn: state.turn + 1,
    phase: CombatPhase.TurnStart,
  };

  // T110: Execute boss TURN_START traits
  if (bossId) {
    // Reset Crystal Mimic reflection flag each turn
    if (bossId === 'CRYSTAL_MIMIC') {
      resetStatusReflectionFlag();
    }

    const traitResult = executeBossTrait(state, bossId, 'TURN_START');
    if (traitResult.triggered) {
      state = traitResult.state;

      // Log boss trait activation
      state = addLogEntry(state, {
        turn: state.turn,
        timing: 'TURN_START',
        actor: 'enemy',
        action: 'TRIGGER_TRAIT',
        target: bossId === 'GAS_ANOMALY' ? 'player' : 'enemy',
        result: {
          effectName: traitResult.effectName,
          // Log specific effects
          ...(bossId === 'OBSIDIAN_GOLEM' && { armorGained: 3 }),
          ...(bossId === 'GAS_ANOMALY' && { damage: 2 }),
        },
        rngValues: [],
      });
    }
  }

  return state;
}

/**
 * T050, T110: Execute attack phase with SPEED ordering
 * Checks Eldritch Mole phase transitions after damage
 */
function executeAttackPhase(
  state: CombatState,
  rng: SeededRNG,
  bossId?: BossId
): CombatState {
  // Determine attack order by SPEED
  const playerSpeed = state.player.spd + state.player.bonusSpd;
  const enemySpeed = state.enemy.spd + state.enemy.bonusSpd;

  // Higher SPEED attacks first
  // On tie, player attacks first (favor player)
  const playerGoesFirst = playerSpeed >= enemySpeed;

  if (playerGoesFirst) {
    // Player attacks
    state = { ...state, phase: CombatPhase.PlayerAttack };
    state = executeAttacks(state, 'player', rng, bossId);

    // Check if enemy died
    if (isDefeated(state.enemy)) {
      return state;
    }

    // Enemy counter-attacks
    state = { ...state, phase: CombatPhase.EnemyAttack };
    state = executeAttacks(state, 'enemy', rng, bossId);
  } else {
    // Enemy attacks first
    state = { ...state, phase: CombatPhase.EnemyAttack };
    state = executeAttacks(state, 'enemy', rng, bossId);

    // Check if player died
    if (isDefeated(state.player)) {
      return state;
    }

    // Player counter-attacks
    state = { ...state, phase: CombatPhase.PlayerAttack };
    state = executeAttacks(state, 'player', rng, bossId);
  }

  return state;
}

/**
 * T110: Execute all attacks for a combatant (handles multi-strike)
 * Checks Eldritch Mole phase transitions after player damages enemy
 */
function executeAttacks(
  state: CombatState,
  attacker: 'player' | 'enemy',
  rng: SeededRNG,
  bossId?: BossId
): CombatState {
  const attackerState = attacker === 'player' ? state.player : state.enemy;
  const defenderKey = attacker === 'player' ? 'enemy' : 'player';

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

    // T109: Check Eldritch Mole phases after player damages boss
    if (bossId === 'ELDRITCH_MOLE' && attacker === 'player' && damageResult.finalDamage > 0) {
      const phaseResult = checkEldritchMolePhases(state, bossId);
      if (phaseResult.phaseTriggered) {
        state = phaseResult.state;

        // Log phase transition
        state = addLogEntry(state, {
          turn: state.turn,
          timing: state.phase,
          actor: 'enemy',
          action: 'PHASE_TRIGGER',
          target: 'enemy',
          result: { effectName: phaseResult.phaseTriggered },
          rngValues: [],
        });
      }
    }

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
 * Handles status effect decay
 */
function executeTurnEnd(
  state: CombatState,
  rng: SeededRNG,
  bossId?: BossId
): CombatState {
  state = { ...state, phase: CombatPhase.TurnEnd };

  // Decay Chill (remove 1 stack from each combatant)
  if (state.player.statusEffects.chill > 0) {
    state = {
      ...state,
      player: {
        ...state.player,
        statusEffects: {
          ...state.player.statusEffects,
          chill: state.player.statusEffects.chill - 1,
        },
      },
    };

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

  if (state.enemy.statusEffects.chill > 0) {
    state = {
      ...state,
      enemy: {
        ...state.enemy,
        statusEffects: {
          ...state.enemy.statusEffects,
          chill: state.enemy.statusEffects.chill - 1,
        },
      },
    };

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

  // Clear Shrapnel at end of turn (unless Shrapnel Harness itemset is active)
  if (state.player.statusEffects.shrapnel > 0) {
    const shrapnelToClear = state.player.statusEffects.shrapnel;
    state = {
      ...state,
      player: {
        ...state.player,
        statusEffects: {
          ...state.player.statusEffects,
          shrapnel: 0,
        },
      },
    };

    state = addLogEntry(state, {
      turn: state.turn,
      timing: 'TURN_END',
      actor: 'system',
      action: 'REMOVE_STATUS',
      target: 'player',
      result: {
        statusRemoved: { type: 'shrapnel', stacks: shrapnelToClear },
      },
      rngValues: [],
    });
  }

  if (state.enemy.statusEffects.shrapnel > 0) {
    const shrapnelToClear = state.enemy.statusEffects.shrapnel;
    state = {
      ...state,
      enemy: {
        ...state.enemy,
        statusEffects: {
          ...state.enemy.statusEffects,
          shrapnel: 0,
        },
      },
    };

    state = addLogEntry(state, {
      turn: state.turn,
      timing: 'TURN_END',
      actor: 'system',
      action: 'REMOVE_STATUS',
      target: 'enemy',
      result: {
        statusRemoved: { type: 'shrapnel', stacks: shrapnelToClear },
      },
      rngValues: [],
    });
  }

  // Apply Rust to ARM (reduce ARM by Rust stacks)
  // Note: Rust reduces effective ARM during damage calc, it's already handled there

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
