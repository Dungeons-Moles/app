/**
 * Game reducer for PvE Dungeon Crawler
 * Pure function that applies actions to produce new state
 * @see specs/001-pve-dungeon-crawler/contracts/game-engine.md
 * @see specs/001-pve-dungeon-crawler/research.md R3
 */

import type { GameState, CombatResult, Tool, Gear, ToolId, GearId } from './types';
import { GamePhase } from './types';
import { Direction } from '../input/types';
import { isValidTransition } from './state-machine';
import {
  equipTool,
  addGearToInventory,
  removeGearFromInventory,
  removeGearById,
  increaseInventoryCapacity,
  addGold,
  removeGold,
} from '../entities/player';

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
  | { type: 'RETURN_TO_MENU' }
  // Item collection actions (T081)
  | { type: 'EQUIP_TOOL'; tool: Tool }
  | { type: 'COLLECT_GEAR'; gear: Gear }
  | { type: 'DISCARD_GEAR'; slotIndex: number }
  | { type: 'DISCARD_GEAR_BY_ID'; gearId: GearId }
  | { type: 'INCREASE_INVENTORY' }
  | { type: 'ADD_GOLD'; amount: number }
  | { type: 'SPEND_GOLD'; amount: number };

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

    // Item collection actions (T081)
    case 'EQUIP_TOOL':
      return handleEquipTool(state, action.tool);

    case 'COLLECT_GEAR':
      return handleCollectGear(state, action.gear);

    case 'DISCARD_GEAR':
      return handleDiscardGear(state, action.slotIndex);

    case 'DISCARD_GEAR_BY_ID':
      return handleDiscardGearById(state, action.gearId);

    case 'INCREASE_INVENTORY':
      return handleIncreaseInventory(state);

    case 'ADD_GOLD':
      return handleAddGold(state, action.amount);

    case 'SPEND_GOLD':
      return handleSpendGold(state, action.amount);

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

// ============================================================================
// Item Collection Action Handlers (T081)
// ============================================================================

/**
 * Handles EQUIP_TOOL action.
 * Equips a tool to the player's weapon slot.
 */
function handleEquipTool(state: GameState, tool: Tool): GameState {
  const updatedPlayer = equipTool(state.player, tool);
  return {
    ...state,
    player: updatedPlayer,
  };
}

/**
 * Handles COLLECT_GEAR action.
 * Adds gear to player inventory if space available.
 */
function handleCollectGear(state: GameState, gear: Gear): GameState {
  const updatedPlayer = addGearToInventory(state.player, gear);
  if (!updatedPlayer) {
    // Inventory full - return unchanged state
    return state;
  }
  return {
    ...state,
    player: updatedPlayer,
  };
}

/**
 * Handles DISCARD_GEAR action.
 * Removes gear from inventory by slot index.
 */
function handleDiscardGear(state: GameState, slotIndex: number): GameState {
  const { player } = removeGearFromInventory(state.player, slotIndex);
  return {
    ...state,
    player,
  };
}

/**
 * Handles DISCARD_GEAR_BY_ID action.
 * Removes gear from inventory by gear ID.
 */
function handleDiscardGearById(state: GameState, gearId: GearId): GameState {
  const { player } = removeGearById(state.player, gearId);
  return {
    ...state,
    player,
  };
}

/**
 * Handles INCREASE_INVENTORY action.
 * Increases inventory capacity (called at start of Day).
 */
function handleIncreaseInventory(state: GameState): GameState {
  const updatedPlayer = increaseInventoryCapacity(state.player);
  return {
    ...state,
    player: updatedPlayer,
  };
}

/**
 * Handles ADD_GOLD action.
 * Adds gold to the player.
 */
function handleAddGold(state: GameState, amount: number): GameState {
  const updatedPlayer = addGold(state.player, amount);
  return {
    ...state,
    player: updatedPlayer,
  };
}

/**
 * Handles SPEND_GOLD action.
 * Removes gold from player if they can afford it.
 */
function handleSpendGold(state: GameState, amount: number): GameState {
  const { player, success } = removeGold(state.player, amount);
  if (!success) {
    // Insufficient gold - return unchanged state
    return state;
  }
  return {
    ...state,
    player,
  };
}
