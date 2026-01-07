import React, { createContext, useContext, useReducer, ReactNode, Dispatch } from 'react';
import {
  GamePhase,
  type GameState,
  type CombatState,
  type CombatResult,
  type POIInteraction,
  type Position,
} from '../game/engine/types';
import type { Direction } from '../game/input/types';

// ============================================================================
// Enemy Instance (combat encounter)
// ============================================================================

export interface EnemyEncounter {
  id: string;
  definitionId: string;
  position: Position;
}

// ============================================================================
// Game Actions
// ============================================================================

export type GameAction =
  | { type: 'START_GAME'; seed: number }
  | { type: 'MOVE'; direction: Direction }
  | { type: 'ENTER_COMBAT'; enemy: EnemyEncounter }
  | { type: 'RESOLVE_COMBAT'; result: CombatResult }
  | { type: 'INTERACT_POI'; poi: POIInteraction }
  | { type: 'CLOSE_POI' }
  | { type: 'TRIGGER_BOSS' }
  | { type: 'SET_PHASE'; phase: GamePhase }
  | { type: 'UPDATE_COMBAT'; combat: CombatState }
  | { type: 'TOGGLE_DEBUG'; key: keyof GameState['debug'] }
  | { type: 'RESET_GAME' };

// ============================================================================
// Initial State
// ============================================================================

const initialGameState: GameState | null = null;

// ============================================================================
// Game Reducer
// ============================================================================

export function gameReducer(
  state: GameState | null,
  action: GameAction
): GameState | null {
  switch (action.type) {
    case 'START_GAME':
      // TODO: Initialize full game state with seed
      // This will be implemented when map generation is ready
      return state;

    case 'MOVE':
      if (!state || state.phase !== GamePhase.Exploration) {
        return state;
      }
      // TODO: Handle movement, time consumption, collision
      return state;

    case 'ENTER_COMBAT':
      if (!state || state.phase !== GamePhase.Exploration) {
        return state;
      }
      return {
        ...state,
        phase: GamePhase.Combat,
        // Combat state will be initialized by combat system
      };

    case 'RESOLVE_COMBAT':
      if (!state || (state.phase !== GamePhase.Combat && state.phase !== GamePhase.BossFight)) {
        return state;
      }
      return {
        ...state,
        phase: action.result === 'VICTORY' ? GamePhase.Exploration : GamePhase.Defeat,
        combat: null,
      };

    case 'INTERACT_POI':
      if (!state || state.phase !== GamePhase.Exploration) {
        return state;
      }
      return {
        ...state,
        phase: GamePhase.POIInteraction,
        activePOI: action.poi,
      };

    case 'CLOSE_POI':
      if (!state || state.phase !== GamePhase.POIInteraction) {
        return state;
      }
      return {
        ...state,
        phase: GamePhase.Exploration,
        activePOI: null,
      };

    case 'TRIGGER_BOSS':
      if (!state || state.phase !== GamePhase.Exploration) {
        return state;
      }
      return {
        ...state,
        phase: GamePhase.BossFight,
      };

    case 'SET_PHASE':
      if (!state) {
        return state;
      }
      return {
        ...state,
        phase: action.phase,
      };

    case 'UPDATE_COMBAT':
      if (!state) {
        return state;
      }
      return {
        ...state,
        combat: action.combat,
      };

    case 'TOGGLE_DEBUG':
      if (!state) {
        return state;
      }
      return {
        ...state,
        debug: {
          ...state.debug,
          [action.key]: !state.debug[action.key],
        },
      };

    case 'RESET_GAME':
      return null;

    default:
      return state;
  }
}

// ============================================================================
// Context Types
// ============================================================================

interface GameContextType {
  state: GameState | null;
  dispatch: Dispatch<GameAction>;
}

// ============================================================================
// Context
// ============================================================================

const GameContext = createContext<GameContextType | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialGameState);

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useGame() {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}

// Re-export GamePhase for convenience
export { GamePhase } from '../game/engine/types';
