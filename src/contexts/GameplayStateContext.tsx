/**
 * GameplayStateContext
 *
 * Provides on-chain gameplay state to UI components.
 * Acts as a bridge between the useGameplayState hook and the component tree.
 * Extended to include MapEnemies and MapPois from on-chain state.
 *
 * @see data-model.md for MapEnemies and MapPois structure
 */

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { Keypair, PublicKey } from '@solana/web3.js';
import { useGameplayState, SyncStatus } from '@/hooks/useGameplayState';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
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
  type MapEnemiesAccount,
  type MapPoisAccount,
  type EnemyData,
  type PoiData,
  fetchSessionRawData,
} from '@/services/solana/sessionList';
import { deriveMapEnemiesPda, deriveMapPoisPda } from '@/services/solana/constants';

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

  // Map entities from on-chain state
  /** Enemies on the map (from MapEnemies account) */
  enemies: EnemyData[];
  /** POIs on the map (from MapPois account) */
  pois: PoiData[];
  /** Whether map entities are loading */
  isMapEntitiesLoading: boolean;

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
  /** Refresh map entities (enemies and POIs) */
  refreshMapEntities: (sessionPda: PublicKey) => Promise<void>;
  /** Remove an enemy from the local list (after combat) */
  removeEnemy: (x: number, y: number) => void;
  /** Mark a POI as consumed */
  consumePoi: (x: number, y: number) => void;
  /** Get enemy at a specific position */
  getEnemyAt: (x: number, y: number) => EnemyData | undefined;
  /** Get POI at a specific position */
  getPoiAt: (x: number, y: number) => PoiData | undefined;
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
  const { connection } = useSolanaConnection();

  // Map entities state
  const [enemies, setEnemies] = useState<EnemyData[]>([]);
  const [pois, setPois] = useState<PoiData[]>([]);
  const [isMapEntitiesLoading, setIsMapEntitiesLoading] = useState(false);
  const [sessionPdaForEntities, setSessionPdaForEntities] = useState<PublicKey | null>(null);

  /**
   * Refresh map entities (enemies and POIs) from on-chain state.
   */
  const refreshMapEntities = useCallback(
    async (sessionPda: PublicKey): Promise<void> => {
      if (!connection) {
        return;
      }

      setIsMapEntitiesLoading(true);
      setSessionPdaForEntities(sessionPda);

      try {
        const rawData = await fetchSessionRawData(connection, sessionPda);

        // Parse enemies (simplified - real implementation would decode properly)
        if (rawData.enemiesAccount) {
          // For now, set empty - actual parsing would use program decoder
          // This will be populated when the Anchor program is available
          console.log('[GameplayStateContext] Enemies data available, decoding pending');
          setEnemies([]);
        } else {
          setEnemies([]);
        }

        // Parse POIs (simplified - real implementation would decode properly)
        if (rawData.poisAccount) {
          // For now, set empty - actual parsing would use program decoder
          console.log('[GameplayStateContext] POIs data available, decoding pending');
          setPois([]);
        } else {
          setPois([]);
        }
      } catch (error) {
        console.error('[GameplayStateContext] Failed to fetch map entities:', error);
        setEnemies([]);
        setPois([]);
      } finally {
        setIsMapEntitiesLoading(false);
      }
    },
    [connection]
  );

  /**
   * Remove an enemy from the local list (after combat victory).
   */
  const removeEnemy = useCallback((x: number, y: number): void => {
    setEnemies((prev) =>
      prev.map((enemy) =>
        enemy.x === x && enemy.y === y ? { ...enemy, alive: false } : enemy
      )
    );
  }, []);

  /**
   * Mark a POI as consumed.
   */
  const consumePoi = useCallback((x: number, y: number): void => {
    setPois((prev) =>
      prev.map((poi) =>
        poi.x === x && poi.y === y ? { ...poi, consumed: true } : poi
      )
    );
  }, []);

  /**
   * Get enemy at a specific position.
   */
  const getEnemyAt = useCallback(
    (x: number, y: number): EnemyData | undefined => {
      return enemies.find((e) => e.x === x && e.y === y && e.alive);
    },
    [enemies]
  );

  /**
   * Get POI at a specific position.
   */
  const getPoiAt = useCallback(
    (x: number, y: number): PoiData | undefined => {
      return pois.find((p) => p.x === x && p.y === y && !p.consumed);
    },
    [pois]
  );

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

    // Map entities
    enemies,
    pois,
    isMapEntitiesLoading,

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
    refreshMapEntities,
    removeEnemy,
    consumePoi,
    getEnemyAt,
    getPoiAt,
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
export type { GameState, Phase, StatType, PlayerStats, SyncStatus, EnemyData, PoiData };
