/**
 * useNightMovement Hook
 *
 * Handles sequential enemy movement animation during night phases.
 * Enemies animate 200ms per move toward the player.
 *
 * @see contracts/combat-events.md for EnemyMovedEvent
 */

import { useState, useCallback, useRef } from 'react';
import type { EnemyMovedEvent } from '@/services/solana/types/combat_events';

// ============================================================================
// Constants
// ============================================================================

/** Animation duration per enemy in milliseconds */
const ENEMY_MOVE_DURATION_MS = 200;

// ============================================================================
// Types
// ============================================================================

export interface NightMovementState {
  /** Whether night movement animation is active */
  isAnimating: boolean;
  /** Current enemy being animated (0-indexed) */
  currentEnemyIndex: number;
  /** Total number of enemies moving */
  totalEnemies: number;
  /** All enemy movements */
  movements: EnemyMovedEvent[];
  /** Current movement being animated */
  currentMovement: EnemyMovedEvent | null;
  /** Whether animation is complete */
  isComplete: boolean;
}

export interface UseNightMovementResult extends NightMovementState {
  /** Start animating enemy movements */
  startAnimation: (movements: EnemyMovedEvent[]) => Promise<void>;
  /** Skip to end of animation */
  skipToEnd: () => void;
  /** Reset state */
  reset: () => void;
  /** Pause animation */
  pause: () => void;
  /** Resume animation */
  resume: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useNightMovement(): UseNightMovementResult {
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentEnemyIndex, setCurrentEnemyIndex] = useState(0);
  const [movements, setMovements] = useState<EnemyMovedEvent[]>([]);
  const [isComplete, setIsComplete] = useState(false);

  const isPausedRef = useRef(false);
  const isAbortedRef = useRef(false);

  const currentMovement = movements[currentEnemyIndex] ?? null;
  const totalEnemies = movements.length;

  /**
   * Wait for a duration, checking for pause/abort.
   */
  const waitWithInterrupt = useCallback(async (ms: number): Promise<boolean> => {
    const checkInterval = 50;
    let elapsed = 0;

    while (elapsed < ms) {
      if (isAbortedRef.current) {
        return false;
      }

      if (isPausedRef.current) {
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
        continue;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(checkInterval, ms - elapsed))
      );
      elapsed += checkInterval;
    }

    return !isAbortedRef.current;
  }, []);

  /**
   * Start animating the enemy movements.
   */
  const startAnimation = useCallback(
    async (newMovements: EnemyMovedEvent[]): Promise<void> => {
      if (newMovements.length === 0) {
        return;
      }

      setMovements(newMovements);
      setCurrentEnemyIndex(0);
      setIsAnimating(true);
      setIsComplete(false);
      isPausedRef.current = false;
      isAbortedRef.current = false;

      // Animate each enemy sequentially
      for (let i = 0; i < newMovements.length; i++) {
        if (isAbortedRef.current) {
          break;
        }

        setCurrentEnemyIndex(i);

        // Wait for animation duration
        if (!(await waitWithInterrupt(ENEMY_MOVE_DURATION_MS))) {
          break;
        }
      }

      setIsAnimating(false);
      setIsComplete(true);
    },
    [waitWithInterrupt]
  );

  /**
   * Skip to end of animation.
   */
  const skipToEnd = useCallback(() => {
    isAbortedRef.current = true;
    setCurrentEnemyIndex(movements.length - 1);
    setIsAnimating(false);
    setIsComplete(true);
  }, [movements.length]);

  /**
   * Reset state.
   */
  const reset = useCallback(() => {
    isAbortedRef.current = true;
    setMovements([]);
    setCurrentEnemyIndex(0);
    setIsAnimating(false);
    setIsComplete(false);
    isPausedRef.current = false;
  }, []);

  /**
   * Pause animation.
   */
  const pause = useCallback(() => {
    isPausedRef.current = true;
  }, []);

  /**
   * Resume animation.
   */
  const resume = useCallback(() => {
    isPausedRef.current = false;
  }, []);

  return {
    isAnimating,
    currentEnemyIndex,
    totalEnemies,
    movements,
    currentMovement,
    isComplete,
    startAnimation,
    skipToEnd,
    reset,
    pause,
    resume,
  };
}
