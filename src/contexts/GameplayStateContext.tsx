/**
 * GameplayStateContext
 *
 * Provides on-chain gameplay state to UI components.
 * Acts as a bridge between the useGameplayState hook and the component tree.
 *
 * Privacy-aware: does NOT read MapEnemies or MapPois directly.
 * All entity data flows through SessionDiscovery + SYNC_DISCOVERY.
 */

import React, { createContext, useContext, useCallback, useMemo, useRef, ReactNode } from 'react';
import { Keypair, PublicKey } from '@solana/web3.js';
import { useGameplayState, SyncStatus } from '@/hooks/useGameplayState';
import { useSessionIdentity } from '@/contexts/SessionContext';
import { getGameStatePda } from '@/services/solana/gameplayState';
import {
  GameState,
  Phase,
  StatType,
  GameStateInitParams,
  MovePlayerParams,
  ModifyStatParams,
  PHASE_MOVE_ALLOWANCE,
} from '@/services/solana/types/gameplay_state';
import {
  type EnemyData,
  type PoiData,
} from '@/services/solana/sessionList';

// ============================================================================
// Types
// ============================================================================

interface GameplayStateContextType {
  /** Current game state (null if not initialized) */
  gameState: GameState | null;
  /** GameState PDA (null if not initialized) */
  gameStatePda: PublicKey | null;
  /** Whether operations are loading */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Current sync status */
  syncStatus: SyncStatus;
  /** Last sync timestamp */
  lastSyncAt: number | null;

  // Computed properties for UI
  /** Current position as [x, y] */
  position: [number, number] | null;
  /** All stats as an object */
  stats: PlayerStats | null;
  /** Current phase name */
  phaseName: string | null;
  /** Current week number */
  week: number | null;
  /** Moves remaining in current phase */
  movesRemaining: number | null;
  /** Total moves made */
  totalMoves: number | null;
  /** Whether boss fight is ready */
  bossFightReady: boolean;
  /** Gear slots available */
  gearSlots: number | null;
  /** Move allowance for current phase */
  currentPhaseMoveAllowance: number | null;

  // Actions
  /** Initialize a new game state for a session */
  initialize: (
    sessionPda: PublicKey,
    sessionSignerKeypair: Keypair,
    params: GameStateInitParams
  ) => Promise<boolean>;
  /** Move player to adjacent tile (on-chain-first, awaits confirmation) */
  move: (
    sessionSignerKeypair: Keypair,
    params: MovePlayerParams
  ) => Promise<{
    success: boolean;
    newState?: GameState;
    previousState?: GameState;
    combatOccurred?: boolean;
    bossFightReady?: boolean;
    isDead?: boolean;
    signature?: string;
  }>;
  /** Modify a player stat */
  modifyStat: (
    sessionSignerKeypair: Keypair,
    params: ModifyStatParams
  ) => Promise<{ success: boolean; newValue?: number }>;
  /** Close the game state */
  close: (sessionSignerKeypair: Keypair) => Promise<boolean>;
  /** Refresh game state from chain */
  refresh: () => Promise<void>;
  /** Calculate move cost for a tile */
  getMoveCost: (isWall: boolean) => number;
  /** Set the game state PDA */
  setGameStatePda: (pda: PublicKey | null) => void;
}

interface PlayerStats {
  hp: number;
  maxHp: number;
  atk: number;
  arm: number;
  spd: number;
  dig: number;
}

// ============================================================================
// Context
// ============================================================================

const GameplayStateContext = createContext<GameplayStateContextType | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

export function GameplayStateProvider({ children }: { children: ReactNode }) {
  const gameplay = useGameplayState();
  const { sessionPda } = useSessionIdentity();

  // Sync gameStatePda from SessionContext so this context's gameState stays populated.
  // SessionContext sets the PDA on its own useGameplayState instance; this effect
  // mirrors that onto GameplayStateProvider's instance so consumers (e.g. BossPanel)
  // reading from useGameplayStateContext() see the correct on-chain state.
  //
  // Uses render-time state sync (not useEffect) so the PDA is cleared in the same
  // render cycle that sessionPda becomes null. This prevents the auto-refresh effect
  // in useGameplayState from firing with a stale PDA during session end, which would
  // cause unnecessary fetches and re-renders on the Defeat/Victory screens.
  if (sessionPda) {
    const [derived] = getGameStatePda(sessionPda);
    if (!gameplay.gameStatePda?.equals(derived)) {
      gameplay.setGameStatePda(derived);
    }
  } else if (gameplay.gameStatePda !== null) {
    gameplay.setGameStatePda(null);
  }

  // Stable refresh wrapper to avoid recreating on every render
  const refresh = useCallback(async () => { await gameplay.refresh(); }, [gameplay.refresh]);

  // Extract individual scalar fields from gameState to use as deps instead of the
  // full object. This prevents ALL context consumers from re-rendering on every
  // game action (gameState is a new object on every change).
  // The full gameState is held in a ref so the useMemo body can still return it.
  const gs = gameplay.gameState;
  const gameStateRef = useRef(gs);
  gameStateRef.current = gs;
  const gsPositionX = gs?.positionX;
  const gsPositionY = gs?.positionY;
  const gsHp = gs?.hp;
  const gsMaxHp = gs?.maxHp;
  const gsAtk = gs?.atk;
  const gsArm = gs?.arm;
  const gsSpd = gs?.spd;
  const gsDig = gs?.dig;
  const gsPhase = gs?.phase;
  const gsWeek = gs?.week;
  const gsMovesRemaining = gs?.movesRemaining;
  const gsTotalMoves = gs?.totalMoves;
  const gsBossFightReady = gs?.bossFightReady;
  const gsGearSlots = gs?.gearSlots;
  const gsSession = gs?.session;

  const value = useMemo<GameplayStateContextType>(() => {
    // Compute derived values for UI convenience
    const position: [number, number] | null =
      gsPositionX != null && gsPositionY != null ? [gsPositionX, gsPositionY] : null;

    const stats: PlayerStats | null =
      gsHp != null
        ? {
            hp: gsHp,
            maxHp: gsMaxHp!,
            atk: gsAtk!,
            arm: gsArm!,
            spd: gsSpd!,
            dig: gsDig!,
          }
        : null;

    const phaseName = gsPhase != null ? getPhaseName(gsPhase) : null;

    const currentPhaseMoveAllowance =
      gsPhase != null ? PHASE_MOVE_ALLOWANCE[gsPhase] : null;

    return {
      gameState: gameStateRef.current,
      gameStatePda: gameplay.gameStatePda,
      isLoading: gameplay.isLoading,
      error: gameplay.error,
      syncStatus: gameplay.syncStatus,
      lastSyncAt: gameplay.lastSyncAt,

      // Computed properties
      position,
      stats,
      phaseName,
      week: gsWeek ?? null,
      movesRemaining: gsMovesRemaining ?? null,
      totalMoves: gsTotalMoves ?? null,
      bossFightReady: gsBossFightReady ?? false,
      gearSlots: gsGearSlots ?? null,
      currentPhaseMoveAllowance,

      // Actions
      initialize: gameplay.initialize,
      move: gameplay.move,
      modifyStat: gameplay.updateStat,
      close: gameplay.close,
      refresh,
      getMoveCost: gameplay.getMoveCost,
      setGameStatePda: gameplay.setGameStatePda,
    };
  }, [
    // Scalar fields from gameState — only recompute when these actually change
    gsPositionX,
    gsPositionY,
    gsHp,
    gsMaxHp,
    gsAtk,
    gsArm,
    gsSpd,
    gsDig,
    gsPhase,
    gsWeek,
    gsMovesRemaining,
    gsTotalMoves,
    gsBossFightReady,
    gsGearSlots,
    gsSession,
    gameplay.gameStatePda,
    gameplay.isLoading,
    gameplay.error,
    gameplay.syncStatus,
    gameplay.lastSyncAt,
    gameplay.initialize,
    gameplay.move,
    gameplay.updateStat,
    gameplay.close,
    refresh,
    gameplay.getMoveCost,
    gameplay.setGameStatePda,
  ]);

  return <GameplayStateContext.Provider value={value}>{children}</GameplayStateContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useGameplayStateContext() {
  const context = useContext(GameplayStateContext);
  if (context === undefined) {
    throw new Error('useGameplayStateContext must be used within a GameplayStateProvider');
  }
  return context;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get human-readable phase name.
 */
function getPhaseName(phase: Phase): string {
  switch (phase) {
    case Phase.Day1:
      return 'Day 1';
    case Phase.Night1:
      return 'Night 1';
    case Phase.Day2:
      return 'Day 2';
    case Phase.Night2:
      return 'Night 2';
    case Phase.Day3:
      return 'Day 3';
    case Phase.Night3:
      return 'Night 3';
    default:
      return 'Unknown';
  }
}

// Re-export types for convenience
export type { GameState, Phase, StatType, PlayerStats, SyncStatus, EnemyData, PoiData };
