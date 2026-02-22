/**
 * CombatReplayContext
 *
 * Manages combat animation state for the CombatOverlay component.
 * Implements state machine: idle -> intro -> turns -> outro -> result
 *
 * @see data-model.md for CombatReplay and CombatReplayState
 */

import React, {
  createContext,
  useContext,
  useCallback,
  useState,
  useRef,
  useMemo,
  ReactNode,
} from 'react';
import type {
  CombatReplay,
  CombatReplayState,
  TurnExecutedEvent,
  StatusAppliedEvent,
  NightMovementBatch,
  EnemyMovedEvent,
} from '@/services/solana/types/combat_events';
import {
  INTRO_DURATION_MS,
  TURN_DURATION_MS,
  STATUS_DURATION_MS,
  OUTRO_DURATION_MS,
  ENEMY_MOVE_DURATION_MS,
} from '@/services/solana/types/combat_events';

// ============================================================================
// Types
// ============================================================================

interface CombatReplayContextType {
  /** Current combat replay data */
  combatReplay: CombatReplay | null;
  /** Current animation state */
  replayState: CombatReplayState;
  /** Current turn being animated */
  currentTurn: number;
  /** Current turn data */
  currentTurnData: TurnExecutedEvent | null;
  /** Status effects applied this turn */
  currentStatusEffects: StatusAppliedEvent[];
  /** Whether combat is playing */
  isPlaying: boolean;
  /** Whether player won (only valid after combat ends) */
  playerWon: boolean | null;
  /** Night movement batch (if animating) */
  nightMovement: NightMovementBatch | null;

  // Actions
  /** Set combat replay data and start animation */
  setCombatReplay: (replay: CombatReplay) => void;
  /** Start playing the combat animation */
  playCombatReplay: () => Promise<void>;
  /** Pause the combat animation */
  pauseReplay: () => void;
  /** Resume paused animation */
  resumeReplay: () => void;
  /** Skip to end of combat */
  skipToEnd: () => void;
  /** Clear combat replay (return to idle) */
  clearReplay: () => void;
  /** Set night movement events and start animation */
  setNightMovement: (movements: EnemyMovedEvent[]) => void;
  /** Animate night movement sequence */
  animateNightMovement: () => Promise<void>;
  /** Clear night movement */
  clearNightMovement: () => void;
}

const CombatReplayContext = createContext<CombatReplayContextType | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

export function CombatReplayProvider({ children }: { children: ReactNode }) {
  const [combatReplay, setCombatReplayState] = useState<CombatReplay | null>(null);
  const [replayState, setReplayState] = useState<CombatReplayState>('idle');
  const [currentTurn, setCurrentTurn] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [nightMovement, setNightMovementState] = useState<NightMovementBatch | null>(null);

  const isPausedRef = useRef(false);
  const animationAbortRef = useRef(false);

  // Derived state
  const currentTurnData = useMemo(() => {
    if (!combatReplay || currentTurn >= combatReplay.turns.length) {
      return null;
    }
    return combatReplay.turns[currentTurn];
  }, [combatReplay, currentTurn]);

  const currentStatusEffects = useMemo(() => {
    if (!combatReplay) return [];
    // Find status effects that were applied during the current turn
    return combatReplay.statusEffects.filter((_, index) => {
      // Rough heuristic: distribute status effects across turns
      const effectTurn = Math.floor(
        (index / combatReplay.statusEffects.length) * combatReplay.turns.length
      );
      return effectTurn === currentTurn;
    });
  }, [combatReplay, currentTurn]);

  const playerWon = useMemo(() => {
    if (!combatReplay || replayState !== 'result') {
      return null;
    }
    return combatReplay.combatEnded.playerWon;
  }, [combatReplay, replayState]);

  /**
   * Set combat replay data (doesn't start animation).
   */
  const setCombatReplay = useCallback((replay: CombatReplay) => {
    setCombatReplayState(replay);
    setReplayState('idle');
    setCurrentTurn(0);
    setIsPlaying(false);
    isPausedRef.current = false;
    animationAbortRef.current = false;
  }, []);

  /**
   * Helper to wait for a duration, checking for pause/abort.
   */
  const waitWithInterrupt = useCallback(async (ms: number): Promise<boolean> => {
    const startTime = Date.now();
    const checkInterval = 50; // Check every 50ms

    while (Date.now() - startTime < ms) {
      if (animationAbortRef.current) {
        return false; // Aborted
      }

      if (isPausedRef.current) {
        // Wait until unpaused
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
        continue;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(checkInterval, ms - (Date.now() - startTime)))
      );
    }

    return !animationAbortRef.current;
  }, []);

  /**
   * Play the combat animation sequence.
   */
  const playCombatReplay = useCallback(async () => {
    if (!combatReplay) {
      return;
    }

    setIsPlaying(true);
    isPausedRef.current = false;
    animationAbortRef.current = false;

    // INTRO phase
    setReplayState('intro');
    if (!(await waitWithInterrupt(INTRO_DURATION_MS))) {
      return;
    }

    // TURNS phase
    setReplayState('turns');
    for (let i = 0; i < combatReplay.turns.length; i++) {
      if (animationAbortRef.current) break;

      setCurrentTurn(i);

      // Animate turn
      if (!(await waitWithInterrupt(TURN_DURATION_MS))) {
        break;
      }

      // Check for status effects this turn
      const hasStatusEffects = combatReplay.statusEffects.some((_, index) => {
        const effectTurn = Math.floor(
          (index / combatReplay.statusEffects.length) * combatReplay.turns.length
        );
        return effectTurn === i;
      });

      if (hasStatusEffects) {
        if (!(await waitWithInterrupt(STATUS_DURATION_MS))) {
          break;
        }
      }
    }

    if (animationAbortRef.current) {
      return;
    }

    // OUTRO phase
    setReplayState('outro');
    if (!(await waitWithInterrupt(OUTRO_DURATION_MS))) {
      return;
    }

    // RESULT phase
    setReplayState('result');
    setIsPlaying(false);
  }, [combatReplay, waitWithInterrupt]);

  /**
   * Pause the animation.
   */
  const pauseReplay = useCallback(() => {
    isPausedRef.current = true;
  }, []);

  /**
   * Resume paused animation.
   */
  const resumeReplay = useCallback(() => {
    isPausedRef.current = false;
  }, []);

  /**
   * Skip to the end of combat.
   */
  const skipToEnd = useCallback(() => {
    animationAbortRef.current = true;
    if (combatReplay) {
      setCurrentTurn(combatReplay.turns.length - 1);
      setReplayState('result');
      setIsPlaying(false);
    }
  }, [combatReplay]);

  /**
   * Clear combat replay and return to idle.
   */
  const clearReplay = useCallback(() => {
    animationAbortRef.current = true;
    setCombatReplayState(null);
    setReplayState('idle');
    setCurrentTurn(0);
    setIsPlaying(false);
    isPausedRef.current = false;
  }, []);

  /**
   * Set night movement events.
   */
  const setNightMovement = useCallback((movements: EnemyMovedEvent[]) => {
    setNightMovementState({
      movements,
      currentIndex: 0,
      complete: false,
    });
  }, []);

  /**
   * Animate night movement sequence.
   */
  const animateNightMovement = useCallback(async () => {
    if (!nightMovement || nightMovement.movements.length === 0) {
      return;
    }

    for (let i = 0; i < nightMovement.movements.length; i++) {
      setNightMovementState((prev) => (prev ? { ...prev, currentIndex: i } : null));

      await new Promise((resolve) => setTimeout(resolve, ENEMY_MOVE_DURATION_MS));
    }

    setNightMovementState((prev) => (prev ? { ...prev, complete: true } : null));
  }, [nightMovement]);

  /**
   * Clear night movement.
   */
  const clearNightMovement = useCallback(() => {
    setNightMovementState(null);
  }, []);

  const value = useMemo<CombatReplayContextType>(() => ({
    combatReplay,
    replayState,
    currentTurn,
    currentTurnData,
    currentStatusEffects,
    isPlaying,
    playerWon,
    nightMovement,
    setCombatReplay,
    playCombatReplay,
    pauseReplay,
    resumeReplay,
    skipToEnd,
    clearReplay,
    setNightMovement,
    animateNightMovement,
    clearNightMovement,
  }), [
    combatReplay,
    replayState,
    currentTurn,
    currentTurnData,
    currentStatusEffects,
    isPlaying,
    playerWon,
    nightMovement,
    setCombatReplay,
    playCombatReplay,
    pauseReplay,
    resumeReplay,
    skipToEnd,
    clearReplay,
    setNightMovement,
    animateNightMovement,
    clearNightMovement,
  ]);

  return <CombatReplayContext.Provider value={value}>{children}</CombatReplayContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useCombatReplay() {
  const context = useContext(CombatReplayContext);
  if (context === undefined) {
    throw new Error('useCombatReplay must be used within a CombatReplayProvider');
  }
  return context;
}

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Hook for accessing just the combat animation state.
 */
export function useCombatAnimationState() {
  const { replayState, currentTurn, isPlaying, playerWon } = useCombatReplay();
  return { replayState, currentTurn, isPlaying, playerWon };
}

/**
 * Hook for accessing night movement state.
 */
export function useNightMovementState() {
  const { nightMovement, setNightMovement, animateNightMovement, clearNightMovement } =
    useCombatReplay();
  return { nightMovement, setNightMovement, animateNightMovement, clearNightMovement };
}

// ============================================================================
// Re-export types
// ============================================================================

export type { CombatReplay, CombatReplayState, TurnExecutedEvent, NightMovementBatch };
