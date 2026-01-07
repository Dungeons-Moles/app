import React, { createContext, useContext, useReducer, ReactNode, Dispatch } from 'react';
import {
  GamePhase,
  type GameState,
  type CombatState,
} from '../game/engine/types';
import {
  GameAction as CoreGameAction,
  gameReducer as coreGameReducer,
} from '../game/engine/game-reducer';

// ============================================================================
// Context-specific Actions (debug/escape hatches)
// ============================================================================

type ContextAction =
  | { type: 'SET_PHASE'; phase: GamePhase }
  | { type: 'UPDATE_COMBAT'; combat: CombatState }
  | { type: 'TOGGLE_DEBUG'; key: keyof GameState['debug'] }
  | { type: 'RESET_GAME' };

export type GameAction = CoreGameAction | ContextAction;

// ============================================================================
// Initial State
// ============================================================================

const initialGameState: GameState | null = null;

// ============================================================================
// Game Reducer (wrapper around canonical reducer)
// ============================================================================

function isContextAction(action: GameAction): action is ContextAction {
  return ['SET_PHASE', 'UPDATE_COMBAT', 'TOGGLE_DEBUG', 'RESET_GAME'].includes(action.type);
}

export function gameReducer(
  state: GameState | null,
  action: GameAction
): GameState | null {
  // Handle null state
  if (!state) {
    return state;
  }

  // Handle context-specific actions locally
  if (isContextAction(action)) {
    switch (action.type) {
      case 'SET_PHASE':
        return { ...state, phase: action.phase };
      case 'UPDATE_COMBAT':
        return { ...state, combat: action.combat };
      case 'TOGGLE_DEBUG':
        return {
          ...state,
          debug: { ...state.debug, [action.key]: !state.debug[action.key] },
        };
      case 'RESET_GAME':
        return null;
    }
  }

  // Delegate core actions to canonical reducer
  return coreGameReducer(state, action);
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
