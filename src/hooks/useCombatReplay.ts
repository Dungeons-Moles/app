/**
 * useCombatReplay Hook
 *
 * Parses combat events from transaction logs and provides control
 * over combat animation state.
 *
 * @see contracts/combat-events.md for event specifications
 * @see data-model.md for CombatReplay structure
 */

import { useCallback, useMemo } from 'react';
import { useCombatReplay as useCombatReplayContext } from '@/contexts/CombatReplayContext';
// Event parser functions require connection/program - use placeholder for now
import type {
  CombatReplay,
  TurnExecutedEvent,
  CombatEndedEvent,
  StatusAppliedEvent,
  EnemyMovedEvent,
  CombatReplayState,
} from '@/services/solana/types/combat_events';

// ============================================================================
// Types
// ============================================================================

export interface UseCombatReplayResult {
  /** Current combat replay data */
  combatReplay: CombatReplay | null;
  /** Current animation state */
  replayState: CombatReplayState;
  /** Current turn being animated (0-indexed) */
  currentTurn: number;
  /** Total number of turns */
  totalTurns: number;
  /** Current turn data */
  currentTurnData: TurnExecutedEvent | null;
  /** Status effects for current turn */
  currentStatusEffects: StatusAppliedEvent[];
  /** Whether combat animation is playing */
  isPlaying: boolean;
  /** Whether player won the combat */
  playerWon: boolean | null;
  /** Final player HP after combat */
  finalPlayerHp: number | null;
  /** Final enemy HP after combat */
  finalEnemyHp: number | null;
  /** Gold earned from combat */
  goldEarned: number;

  // Actions
  /** Start combat replay from transaction logs */
  startReplayFromLogs: (logs: string[]) => void;
  /** Start combat replay from CombatReplay data */
  startReplay: (replay: CombatReplay) => void;
  /** Play/resume the combat animation */
  play: () => Promise<void>;
  /** Pause the combat animation */
  pause: () => void;
  /** Resume paused animation */
  resume: () => void;
  /** Skip to end of combat */
  skipToEnd: () => void;
  /** Clear combat replay and return to idle */
  clear: () => void;

  // Night movement
  /** Night movement data if animating */
  nightMovement: { movements: EnemyMovedEvent[]; currentIndex: number; complete: boolean } | null;
  /** Start night movement animation from logs */
  startNightMovementFromLogs: (logs: string[]) => void;
  /** Animate the night movement sequence */
  animateNightMovement: () => Promise<void>;
  /** Clear night movement */
  clearNightMovement: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useCombatReplay(): UseCombatReplayResult {
  const context = useCombatReplayContext();

  // Computed values
  const totalTurns = context.combatReplay?.turns.length ?? 0;

  const finalPlayerHp = useMemo(() => {
    if (!context.combatReplay || context.replayState !== 'result') {
      return null;
    }
    return context.combatReplay.combatEnded.finalPlayerHp;
  }, [context.combatReplay, context.replayState]);

  const finalEnemyHp = useMemo(() => {
    if (!context.combatReplay || context.replayState !== 'result') {
      return null;
    }
    return context.combatReplay.combatEnded.finalEnemyHp;
  }, [context.combatReplay, context.replayState]);

  const goldEarned = useMemo(() => {
    if (!context.combatReplay || !context.playerWon) {
      return 0;
    }
    // Gold is earned from defeating enemies
    // Typically based on enemy type/level
    return context.combatReplay.combatEnded.goldEarned ?? 0;
  }, [context.combatReplay, context.playerWon]);

  /**
   * Parse combat events from transaction logs and start replay.
   * Note: Full implementation requires connection and program instance.
   * For now, this is a placeholder that logs a warning.
   */
  const startReplayFromLogs = useCallback(
    (_logs: string[]) => {
      // TODO: Implement with proper connection and program when available
      console.warn('[useCombatReplay] startReplayFromLogs not yet implemented with full event parser');
    },
    []
  );

  /**
   * Start replay from CombatReplay data directly.
   */
  const startReplay = useCallback(
    (replay: CombatReplay) => {
      context.setCombatReplay(replay);
    },
    [context]
  );

  /**
   * Start night movement animation from logs.
   * Note: Full implementation requires connection and program instance.
   * For now, this is a placeholder.
   */
  const startNightMovementFromLogs = useCallback(
    (logs: string[]) => {
      // Check if logs contain night movement events
      if (logs.some((log) => log.includes('EnemyMoved'))) {
        console.log('[useCombatReplay] Night movement events detected, animation not yet implemented');
      }
    },
    []
  );

  return {
    combatReplay: context.combatReplay,
    replayState: context.replayState,
    currentTurn: context.currentTurn,
    totalTurns,
    currentTurnData: context.currentTurnData,
    currentStatusEffects: context.currentStatusEffects,
    isPlaying: context.isPlaying,
    playerWon: context.playerWon,
    finalPlayerHp,
    finalEnemyHp,
    goldEarned,

    // Actions
    startReplayFromLogs,
    startReplay,
    play: context.playCombatReplay,
    pause: context.pauseReplay,
    resume: context.resumeReplay,
    skipToEnd: context.skipToEnd,
    clear: context.clearReplay,

    // Night movement
    nightMovement: context.nightMovement,
    startNightMovementFromLogs,
    animateNightMovement: context.animateNightMovement,
    clearNightMovement: context.clearNightMovement,
  };
}
