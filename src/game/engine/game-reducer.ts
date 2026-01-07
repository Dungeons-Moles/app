/**
 * Game reducer for PvE Dungeon Crawler
 * Pure function that applies actions to produce new state
 * @see specs/001-pve-dungeon-crawler/contracts/game-engine.md
 * @see specs/001-pve-dungeon-crawler/research.md R3
 */

import type { GameState, CombatResult } from './types';
import { GamePhase } from './types';
import { Direction } from '../input/types';
import { isValidTransition } from './state-machine';

// ============================================================================
// Game Actions
// ============================================================================

/**
 * All possible game actions as a discriminated union.
 * Per research.md R3: Using typed actions for state machine transitions.
 */
export type GameAction =
  | { type: 'START_GAME'; seed: number }
  | { type: 'MOVE'; direction: Direction }
  | { type: 'ENTER_COMBAT'; enemyId: string }
  | { type: 'RESOLVE_COMBAT'; result: CombatResult }
  | { type: 'INTERACT_POI'; poiId: string }
  | { type: 'SELECT_POI_OPTION'; optionIndex: number }
  | { type: 'CLOSE_POI' }
  | { type: 'TRIGGER_BOSS' }
  | { type: 'END_GAME'; result: 'VICTORY' | 'DEFEAT' }
  | { type: 'RETURN_TO_MENU' };

// ============================================================================
// Action Type Guards
// ============================================================================

export function isStartGameAction(
  action: GameAction
): action is { type: 'START_GAME'; seed: number } {
  return action.type === 'START_GAME';
}

export function isMoveAction(
  action: GameAction
): action is { type: 'MOVE'; direction: Direction } {
  return action.type === 'MOVE';
}

// ============================================================================
// Game Reducer
// ============================================================================

/**
 * Pure function that applies an action to produce new state.
 * Per constitution P01: Explicit state machines for game phases.
 *
 * @param state - Current game state
 * @param action - Action to apply
 * @returns New game state after action
 * @throws Error if action causes invalid state transition
 */
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME':
      return handleStartGame(state, action.seed);

    case 'MOVE':
      return handleMove(state, action.direction);

    case 'ENTER_COMBAT':
      return handleEnterCombat(state, action.enemyId);

    case 'RESOLVE_COMBAT':
      return handleResolveCombat(state, action.result);

    case 'INTERACT_POI':
      return handleInteractPOI(state, action.poiId);

    case 'SELECT_POI_OPTION':
      return handleSelectPOIOption(state, action.optionIndex);

    case 'CLOSE_POI':
      return handleClosePOI(state);

    case 'TRIGGER_BOSS':
      return handleTriggerBoss(state);

    case 'END_GAME':
      return handleEndGame(state, action.result);

    case 'RETURN_TO_MENU':
      return handleReturnToMenu(state);

    default: {
      // Exhaustive check - TypeScript will error if we miss a case
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

// ============================================================================
// Action Handlers (Skeletons)
// ============================================================================

/**
 * Handles START_GAME action.
 * Transitions from MainMenu to Exploration with initialized game state.
 */
function handleStartGame(state: GameState, seed: number): GameState {
  if (!isValidTransition(state.phase, GamePhase.Exploration)) {
    throw new Error(
      `Invalid transition: cannot start game from ${state.phase}`
    );
  }

  // TODO: Initialize game with seed (map generation, player setup, etc.)
  // For now, just transition phase and set seed
  return {
    ...state,
    phase: GamePhase.Exploration,
    seed,
    rngState: seed,
  };
}

/**
 * Handles MOVE action.
 * Moves player in direction if valid, consumes time.
 */
function handleMove(state: GameState, _direction: Direction): GameState {
  if (state.phase !== GamePhase.Exploration) {
    return state; // Ignore move if not exploring
  }

  // TODO: Implement movement logic
  // - Check canMoveTo
  // - Update player position
  // - Update fog of war
  // - Consume time (getMoveCost)
  // - Check for enemy encounters
  // - Check for time phase transitions
  return state;
}

/**
 * Handles ENTER_COMBAT action.
 * Transitions to Combat phase with specified enemy.
 */
function handleEnterCombat(state: GameState, _enemyId: string): GameState {
  if (!isValidTransition(state.phase, GamePhase.Combat)) {
    throw new Error(
      `Invalid transition: cannot enter combat from ${state.phase}`
    );
  }

  // TODO: Create combat state with enemy
  return {
    ...state,
    phase: GamePhase.Combat,
  };
}

/**
 * Handles RESOLVE_COMBAT action.
 * Applies combat result and transitions appropriately.
 */
function handleResolveCombat(state: GameState, result: CombatResult): GameState {
  if (state.phase !== GamePhase.Combat && state.phase !== GamePhase.BossFight) {
    return state;
  }

  if (result === 'DEFEAT') {
    return {
      ...state,
      phase: GamePhase.Defeat,
      combat: state.combat
        ? { ...state.combat, result: 'DEFEAT' }
        : null,
    };
  }

  // Victory - return to exploration (or victory screen for final boss)
  if (state.phase === GamePhase.BossFight && state.time.week === 3) {
    return {
      ...state,
      phase: GamePhase.Victory,
      combat: state.combat
        ? { ...state.combat, result: 'VICTORY' }
        : null,
    };
  }

  // TODO: Apply rewards, remove defeated enemy from map
  return {
    ...state,
    phase: GamePhase.Exploration,
    combat: null,
  };
}

/**
 * Handles INTERACT_POI action.
 * Transitions to POIInteraction phase with specified POI.
 */
function handleInteractPOI(state: GameState, _poiId: string): GameState {
  if (!isValidTransition(state.phase, GamePhase.POIInteraction)) {
    throw new Error(
      `Invalid transition: cannot interact with POI from ${state.phase}`
    );
  }

  // TODO: Set up POI interaction state
  return {
    ...state,
    phase: GamePhase.POIInteraction,
  };
}

/**
 * Handles SELECT_POI_OPTION action.
 * Applies selected option effect within POI interaction.
 */
function handleSelectPOIOption(state: GameState, _optionIndex: number): GameState {
  if (state.phase !== GamePhase.POIInteraction) {
    return state;
  }

  // TODO: Apply option effect (grant item, heal, etc.)
  return state;
}

/**
 * Handles CLOSE_POI action.
 * Returns from POI interaction to exploration.
 */
function handleClosePOI(state: GameState): GameState {
  if (!isValidTransition(state.phase, GamePhase.Exploration)) {
    return state;
  }

  return {
    ...state,
    phase: GamePhase.Exploration,
    activePOI: null,
  };
}

/**
 * Handles TRIGGER_BOSS action.
 * Transitions to BossFight phase at end of week.
 */
function handleTriggerBoss(state: GameState): GameState {
  if (!isValidTransition(state.phase, GamePhase.BossFight)) {
    throw new Error(
      `Invalid transition: cannot trigger boss from ${state.phase}`
    );
  }

  // TODO: Create combat state with week boss
  return {
    ...state,
    phase: GamePhase.BossFight,
  };
}

/**
 * Handles END_GAME action.
 * Transitions to Victory or Defeat phase.
 */
function handleEndGame(
  state: GameState,
  result: 'VICTORY' | 'DEFEAT'
): GameState {
  const targetPhase = result === 'VICTORY' ? GamePhase.Victory : GamePhase.Defeat;

  if (!isValidTransition(state.phase, targetPhase)) {
    throw new Error(
      `Invalid transition: cannot end game with ${result} from ${state.phase}`
    );
  }

  return {
    ...state,
    phase: targetPhase,
  };
}

/**
 * Handles RETURN_TO_MENU action.
 * Returns to main menu from Victory or Defeat.
 */
function handleReturnToMenu(state: GameState): GameState {
  if (!isValidTransition(state.phase, GamePhase.MainMenu)) {
    throw new Error(
      `Invalid transition: cannot return to menu from ${state.phase}`
    );
  }

  // TODO: Reset game state to initial values
  return {
    ...state,
    phase: GamePhase.MainMenu,
    combat: null,
    activePOI: null,
  };
}
