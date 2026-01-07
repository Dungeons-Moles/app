/**
 * Game reducer for PvE Dungeon Crawler
 * Pure function that applies actions to produce new state
 * @see specs/001-pve-dungeon-crawler/contracts/game-engine.md
 * @see specs/001-pve-dungeon-crawler/research.md R3
 */

import type { GameState, CombatResult, Position } from './types';
import { GamePhase, TimePhase } from './types';
import { Direction, DIRECTION_DELTA } from '../input/types';
import { isValidTransition } from './state-machine';
import { initializeGame, consumeMoves } from './state-factory';
import { TileType, TILE_MOVE_COST } from '../map/types';
import { updateFogOfWar } from '../map/fog-of-war';
import { movePlayer } from '../entities/player';

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

  // Initialize game with seed (map generation, player setup, etc.)
  return initializeGame(state, seed);
}

/**
 * Handles MOVE action.
 * Moves player in direction if valid, consumes time.
 */
function handleMove(state: GameState, direction: Direction): GameState {
  if (state.phase !== GamePhase.Exploration) {
    return state; // Ignore move if not exploring
  }

  // Calculate target position
  const delta = DIRECTION_DELTA[direction];
  const targetPos: Position = {
    x: state.player.position.x + delta.x,
    y: state.player.position.y + delta.y,
  };

  // Check bounds
  if (
    targetPos.x < 0 ||
    targetPos.x >= state.map.width ||
    targetPos.y < 0 ||
    targetPos.y >= state.map.height
  ) {
    return state; // Can't move out of bounds
  }

  // Check if tile is walkable
  const targetTile = state.map.tiles[targetPos.y][targetPos.x];
  if (targetTile === TileType.Wall) {
    return state; // Can't move into wall
  }

  // Get move cost
  const moveCost = TILE_MOVE_COST[targetTile];

  // Check for enemy at target position
  const enemyAtTarget = state.map.enemies.find(
    e => e.position.x === targetPos.x && e.position.y === targetPos.y
  );

  // Move player
  let newState = {
    ...state,
    player: movePlayer(state.player, targetPos),
  };

  // Update fog of war
  const isDay = newState.time.phase === TimePhase.Day;
  newState = {
    ...newState,
    map: updateFogOfWar(newState.map, targetPos, isDay),
  };

  // Consume time
  newState = consumeMoves(newState, moveCost);

  // Check for enemy encounter
  if (enemyAtTarget) {
    return {
      ...newState,
      phase: GamePhase.Combat,
      // Combat state would be initialized here in full implementation
    };
  }

  // Check if boss should trigger (Night 3 complete)
  if (
    newState.time.phase === TimePhase.Boss &&
    state.time.phase === TimePhase.Night
  ) {
    return {
      ...newState,
      phase: GamePhase.BossFight,
    };
  }

  return newState;
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
