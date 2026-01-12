import React, {
  createContext,
  useContext,
  useReducer,
  ReactNode,
  Dispatch,
  useCallback,
  useEffect,
} from 'react';
import {
  GamePhase,
  type GameState,
  type CombatState,
  type Position,
} from '../game/engine/types';
import {
  GameAction as CoreGameAction,
  gameReducer as coreGameReducer,
} from '../game/engine/game-reducer';
import { createInitialGameState } from '../game/engine/state-factory';
import type { GameMap } from '../game/map/types';

// ============================================================================
// Overview Mode Types
// ============================================================================

export interface OverviewModeState {
  active: boolean;
  offset: Position;
  zoom: number;
}

export const DEFAULT_OVERVIEW_STATE: OverviewModeState = {
  active: false,
  offset: { x: 0, y: 0 },
  zoom: 1,
};

export const OVERVIEW_CONFIG = {
  activeZoom: 0.5,
  maxPanDistance: 50,
} as const;

type OverviewAction =
  | { type: 'TOGGLE'; canActivate: boolean }
  | { type: 'PAN'; delta: Position; map: GameMap; playerPosition: Position }
  | { type: 'RESET_CAMERA' }
  | { type: 'RESET' };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampOverviewOffset(
  offset: Position,
  map: GameMap,
  playerPosition: Position
): Position {
  const limitedX = clamp(
    offset.x,
    -OVERVIEW_CONFIG.maxPanDistance,
    OVERVIEW_CONFIG.maxPanDistance
  );
  const limitedY = clamp(
    offset.y,
    -OVERVIEW_CONFIG.maxPanDistance,
    OVERVIEW_CONFIG.maxPanDistance
  );

  const minX = -playerPosition.x;
  const maxX = map.width - 1 - playerPosition.x;
  const minY = -playerPosition.y;
  const maxY = map.height - 1 - playerPosition.y;

  return {
    x: clamp(limitedX, minX, maxX),
    y: clamp(limitedY, minY, maxY),
  };
}

export function applyOverviewAction(
  state: OverviewModeState,
  action: OverviewAction
): OverviewModeState {
  switch (action.type) {
    case 'TOGGLE': {
      if (!action.canActivate && !state.active) {
        return state;
      }
      if (state.active) {
        return DEFAULT_OVERVIEW_STATE;
      }
      return {
        ...state,
        active: true,
        offset: { x: 0, y: 0 },
        zoom: OVERVIEW_CONFIG.activeZoom,
      };
    }
    case 'PAN': {
      if (!state.active) {
        return state;
      }
      const nextOffset = {
        x: state.offset.x + action.delta.x,
        y: state.offset.y + action.delta.y,
      };
      return {
        ...state,
        offset: clampOverviewOffset(nextOffset, action.map, action.playerPosition),
      };
    }
    case 'RESET_CAMERA':
      return { ...state, offset: { x: 0, y: 0 } };
    case 'RESET':
      return DEFAULT_OVERVIEW_STATE;
    default:
      return state;
  }
}

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

// Start with null, game state is created when START_GAME action is dispatched
const initialGameState: GameState | null = null;

// Pre-create initial state for reuse
function getInitialState(): GameState {
  return createInitialGameState();
}

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
  // Handle null state - only START_GAME can initialize
  if (!state) {
    if (action.type === 'START_GAME') {
      // Create initial state and then apply START_GAME action
      const initialState = getInitialState();
      return coreGameReducer(initialState, action);
    }
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
  overviewMode: OverviewModeState;
  toggleOverviewMode: () => void;
  panOverview: (delta: Position) => void;
  resetOverviewCamera: () => void;
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
  const [overviewMode, updateOverviewMode] = useReducer(
    applyOverviewAction,
    DEFAULT_OVERVIEW_STATE
  );

  useEffect(() => {
    if (!state || state.phase !== GamePhase.Exploration) {
      updateOverviewMode({ type: 'RESET' });
    }
  }, [state]);

  const toggleOverviewMode = useCallback(() => {
    const canActivate = state?.phase === GamePhase.Exploration;
    updateOverviewMode({ type: 'TOGGLE', canActivate: Boolean(canActivate) });
  }, [state?.phase]);

  const panOverview = useCallback(
    (delta: Position) => {
      if (!state) {
        return;
      }
      updateOverviewMode({
        type: 'PAN',
        delta,
        map: state.map,
        playerPosition: state.player.position,
      });
    },
    [state]
  );

  const resetOverviewCamera = useCallback(() => {
    updateOverviewMode({ type: 'RESET_CAMERA' });
  }, []);

  return (
    <GameContext.Provider
      value={{
        state,
        dispatch,
        overviewMode,
        toggleOverviewMode,
        panOverview,
        resetOverviewCamera,
      }}
    >
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
