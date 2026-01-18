/**
 * GameplayStateContext
 *
 * Provides on-chain gameplay state to UI components.
 * Acts as a bridge between the useGameplayState hook and the component tree.
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { Keypair, PublicKey } from '@solana/web3.js';
import { useGameplayState, SyncStatus } from '@/hooks/useGameplayState';
import {
  GameState,
  Phase,
  StatType,
  GameStateInitParams,
  MovePlayerParams,
  ModifyStatParams,
  PHASE_MOVE_ALLOWANCE,
} from '@/services/solana/types/gameplay_state';

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
    burnerKeypair: Keypair,
    params: GameStateInitParams
  ) => Promise<boolean>;
  /** Move player to adjacent tile */
  move: (
    burnerKeypair: Keypair,
    params: MovePlayerParams
  ) => Promise<{ success: boolean; newState?: GameState }>;
  /** Modify a player stat */
  modifyStat: (
    burnerKeypair: Keypair,
    params: ModifyStatParams
  ) => Promise<{ success: boolean; newValue?: number }>;
  /** Close the game state */
  close: (burnerKeypair: Keypair) => Promise<boolean>;
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

  // Compute derived values for UI convenience
  const position: [number, number] | null = gameplay.gameState
    ? [gameplay.gameState.positionX, gameplay.gameState.positionY]
    : null;

  const stats: PlayerStats | null = gameplay.gameState
    ? {
        hp: gameplay.gameState.hp,
        maxHp: gameplay.gameState.maxHp,
        atk: gameplay.gameState.atk,
        arm: gameplay.gameState.arm,
        spd: gameplay.gameState.spd,
        dig: gameplay.gameState.dig,
      }
    : null;

  const phaseName = gameplay.gameState ? getPhaseName(gameplay.gameState.phase) : null;

  const currentPhaseMoveAllowance = gameplay.gameState
    ? PHASE_MOVE_ALLOWANCE[gameplay.gameState.phase]
    : null;

  const value: GameplayStateContextType = {
    gameState: gameplay.gameState,
    gameStatePda: gameplay.gameStatePda,
    isLoading: gameplay.isLoading,
    error: gameplay.error,
    syncStatus: gameplay.syncStatus,
    lastSyncAt: gameplay.lastSyncAt,

    // Computed properties
    position,
    stats,
    phaseName,
    week: gameplay.gameState?.week ?? null,
    movesRemaining: gameplay.gameState?.movesRemaining ?? null,
    totalMoves: gameplay.gameState?.totalMoves ?? null,
    bossFightReady: gameplay.gameState?.bossFightReady ?? false,
    gearSlots: gameplay.gameState?.gearSlots ?? null,
    currentPhaseMoveAllowance,

    // Actions
    initialize: gameplay.initialize,
    move: gameplay.move,
    modifyStat: gameplay.updateStat,
    close: gameplay.close,
    refresh: gameplay.refresh,
    getMoveCost: gameplay.getMoveCost,
    setGameStatePda: gameplay.setGameStatePda,
  };

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
export type { GameState, Phase, StatType, PlayerStats, SyncStatus };
