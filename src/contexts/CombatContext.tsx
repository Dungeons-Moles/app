/**
 * T054: CombatContext provider
 * Manages combat state and provides combat-specific actions
 * @see specs/001-pve-dungeon-crawler/spec.md User Story 2
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useState,
  ReactNode,
  Dispatch,
} from 'react';
import type {
  CombatState,
  CombatantState,
} from '../game/engine/types';
import { CombatPhase } from '../game/engine/types';
import { resolveCombat, createCombatState, type CombatResolverInput } from '../game/combat/resolver';

// ============================================================================
// Combat Speed
// ============================================================================

export const COMBAT_ANIMATION_BASE_MS = 500;

export const COMBAT_SPEED_MULTIPLIER = {
  paused: 0,
  normal: 1,
  fast: 2,
} as const;

export type CombatSpeed = keyof typeof COMBAT_SPEED_MULTIPLIER;

export function getCombatAnimationIntervalMs(speed: CombatSpeed): number | null {
  if (speed === 'paused') {
    return null;
  }

  return COMBAT_ANIMATION_BASE_MS / COMBAT_SPEED_MULTIPLIER[speed];
}

// ============================================================================
// Combat Actions
// ============================================================================

export type CombatAction =
  | { type: 'START_COMBAT'; input: CombatResolverInput }
  | { type: 'RESOLVE_COMBAT' }
  | { type: 'ADVANCE_LOG'; index: number }
  | { type: 'COMPLETE_ANIMATION' }
  | { type: 'RESET_COMBAT' };

// ============================================================================
// Combat UI State (extends CombatState for UI needs)
// ============================================================================

export interface CombatUIState {
  /** Base combat state before playback */
  combat: CombatState | null;
  /** The resolved combat state (for playback) */
  resolvedCombat: CombatState | null;
  /** Current log playback index */
  currentLogIndex: number;
  /** Is combat animation in progress */
  isAnimating: boolean;
  /** Is combat complete */
  isComplete: boolean;
  /** Damage numbers to display */
  damageNumbers: DamageNumber[];
}

export interface DamageNumber {
  id: string;
  value: number;
  type: 'damage' | 'heal' | 'armor';
  target: 'player' | 'enemy';
  timestamp: number;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: CombatUIState = {
  combat: null,
  resolvedCombat: null,
  currentLogIndex: 0,
  isAnimating: false,
  isComplete: false,
  damageNumbers: [],
};

// ============================================================================
// Reducer
// ============================================================================

function combatReducer(state: CombatUIState, action: CombatAction): CombatUIState {
  switch (action.type) {
    case 'START_COMBAT': {
      // Resolve combat immediately (it's deterministic)
      const baseCombat = createCombatState(action.input);
      const resolvedCombat = resolveCombat(action.input);

      return {
        ...state,
        combat: baseCombat,
        resolvedCombat,
        currentLogIndex: 0,
        isAnimating: true,
        isComplete: false,
        damageNumbers: [],
      };
    }

    case 'RESOLVE_COMBAT': {
      if (!state.resolvedCombat) return state;

      return {
        ...state,
        isAnimating: false,
        isComplete: true,
      };
    }

    case 'ADVANCE_LOG': {
      if (!state.resolvedCombat) return state;

      const newIndex = Math.min(
        action.index,
        state.resolvedCombat.log.length - 1
      );

      // Extract damage number from current log entry
      const entry = state.resolvedCombat.log[newIndex];
      const newDamageNumbers = [...state.damageNumbers];

      if (entry?.result.damage && entry.target !== 'none') {
        newDamageNumbers.push({
          id: `dmg-${newIndex}-${Date.now()}`,
          value: entry.result.damage,
          type: 'damage',
          target: entry.target,
          timestamp: Date.now(),
        });
      }

      if (entry?.result.armorLost && entry.target !== 'none') {
        newDamageNumbers.push({
          id: `arm-${newIndex}-${Date.now()}`,
          value: entry.result.armorLost,
          type: 'armor',
          target: entry.target,
          timestamp: Date.now(),
        });
      }

      if (entry?.result.healing && entry.target !== 'none') {
        newDamageNumbers.push({
          id: `heal-${newIndex}-${Date.now()}`,
          value: entry.result.healing,
          type: 'heal',
          target: entry.target,
          timestamp: Date.now(),
        });
      }

      // Keep only recent damage numbers (last 10)
      const trimmedNumbers = newDamageNumbers.slice(-10);

      return {
        ...state,
        currentLogIndex: newIndex,
        damageNumbers: trimmedNumbers,
      };
    }

    case 'COMPLETE_ANIMATION': {
      return {
        ...state,
        isAnimating: false,
        isComplete: true,
      };
    }

    case 'RESET_COMBAT': {
      return initialState;
    }

    default:
      return state;
  }
}

// ============================================================================
// Context
// ============================================================================

interface CombatContextType {
  state: CombatUIState;
  dispatch: Dispatch<CombatAction>;
  /** Current combat animation speed */
  speed: CombatSpeed;
  /** Update combat animation speed */
  setSpeed: (speed: CombatSpeed) => void;
  /** Start a new combat */
  startCombat: (input: CombatResolverInput) => void;
  /** Get current combatant states for display */
  getDisplayStates: () => { player: CombatantState | null; enemy: CombatantState | null };
  /** Get combat result */
  getResult: () => 'VICTORY' | 'DEFEAT' | null;
}

const CombatContext = createContext<CombatContextType | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

export function CombatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(combatReducer, initialState);
  const [speed, setSpeed] = useState<CombatSpeed>('normal');

  const startCombat = useCallback((input: CombatResolverInput) => {
    dispatch({ type: 'START_COMBAT', input });
  }, []);

  const getDisplayStates = useCallback(() => {
    if (!state.resolvedCombat || !state.combat) {
      return { player: null, enemy: null };
    }

    const normalizeCombatant = (combatant: CombatantState): CombatantState => ({
      ...combatant,
      arm: combatant.arm + combatant.bonusArm,
      bonusArm: 0,
      statusEffects: { ...combatant.statusEffects },
    });

    let player = normalizeCombatant(state.combat.player);
    let enemy = normalizeCombatant(state.combat.enemy);

    const log = state.resolvedCombat.log;
    const maxIndex = Math.min(state.currentLogIndex, log.length - 1);

    for (let index = 0; index <= maxIndex; index += 1) {
      const entry = log[index];
      if (!entry || entry.target === 'none') continue;

      const target = entry.target === 'player' ? player : enemy;
      const { result } = entry;

      if (result.armorLost && result.armorLost > 0) {
        target.arm = Math.max(0, target.arm - result.armorLost);
      }

      if (result.damage && result.damage > 0) {
        target.hp = Math.max(0, target.hp - result.damage);
      }

      if (result.armorGained && result.armorGained > 0) {
        target.arm += result.armorGained;
      }

      if (result.healing && result.healing > 0) {
        if (result.effectName === 'Crystal Crown') {
          target.maxHp += result.healing;
          target.hp += result.healing;
        } else {
          target.hp = Math.min(target.maxHp, target.hp + result.healing);
        }
      }

      if (result.statusApplied) {
        const { type, stacks } = result.statusApplied;
        target.statusEffects = {
          ...target.statusEffects,
          [type]: Math.max(0, target.statusEffects[type] + stacks),
        };
      }

      if (result.statusRemoved) {
        const { type, stacks } = result.statusRemoved;
        target.statusEffects = {
          ...target.statusEffects,
          [type]: Math.max(0, target.statusEffects[type] - stacks),
        };
      }
    }

    return { player, enemy };
  }, [state.resolvedCombat, state.combat, state.currentLogIndex]);

  const getResult = useCallback(() => {
    return state.resolvedCombat?.result ?? null;
  }, [state.resolvedCombat]);

  useEffect(() => {
    if (!state.resolvedCombat || state.isComplete) return;

    const logLength = state.resolvedCombat.log.length;
    if (state.currentLogIndex >= logLength - 1) {
      dispatch({ type: 'COMPLETE_ANIMATION' });
      return;
    }

    const intervalMs = getCombatAnimationIntervalMs(speed);
    if (intervalMs === null) return;

    const timer = setTimeout(() => {
      dispatch({ type: 'ADVANCE_LOG', index: state.currentLogIndex + 1 });
    }, intervalMs);

    return () => clearTimeout(timer);
  }, [state.currentLogIndex, state.resolvedCombat, state.isComplete, speed, dispatch]);

  return (
    <CombatContext.Provider
      value={{
        state,
        dispatch,
        speed,
        setSpeed,
        startCombat,
        getDisplayStates,
        getResult,
      }}
    >
      {children}
    </CombatContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * T055: useCombat hook
 * Provides access to combat state and actions
 */
export function useCombat() {
  const context = useContext(CombatContext);
  if (context === undefined) {
    throw new Error('useCombat must be used within a CombatProvider');
  }
  return context;
}
