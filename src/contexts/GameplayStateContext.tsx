/**
 * GameplayStateContext
 *
 * Provides on-chain gameplay state to UI components.
 * Acts as a bridge between the useGameplayState hook and the component tree.
 * Extended to include MapEnemies and MapPois from on-chain state.
 *
 * @see data-model.md for MapEnemies and MapPois structure
 */

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, ReactNode } from 'react';
import { Keypair, PublicKey } from '@solana/web3.js';
import { useGameplayState, SyncStatus } from '@/hooks/useGameplayState';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { useSession } from '@/contexts/SessionContext';
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
import { deriveMapEnemiesPda, deriveMapPoisPda } from '@/services/solana/constants';
import {
  createPoiSystemProgram,
  createGameplayStateProgram,
} from '@/services/solana/programs';
import type { PoiInstance, MapPoisData } from '@/services/solana/types/poi_system';

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
  /** Move player to adjacent tile (on-chain-first, awaits confirmation) */
  move: (
    burnerKeypair: Keypair,
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
  /** Refresh map entities (enemies and POIs), returns enemy data for sync */
  refreshMapEntities: (sessionPda: PublicKey) => Promise<{ enemies: Array<{ x: number; y: number; archetypeId: number; tier: number }> } | null>;
  /** Remove an enemy from the local list (after combat) */
  removeEnemy: (x: number, y: number) => void;
  /** Mark a POI as consumed */
  consumePoi: (x: number, y: number) => void;
  /** Get enemy at a specific position */
  getEnemyAt: (x: number, y: number) => EnemyData | undefined;
  /** Get POI at a specific position */
  getPoiAt: (x: number, y: number) => PoiData | undefined;
  /** Discovered waypoint POI indices */
  discoveredWaypoints: number[];
  /** Check if fast travel is possible between two waypoint indices */
  canFastTravel: (fromIndex: number, toIndex: number) => boolean;
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
  const { sessionPda } = useSession();

  // Sync gameStatePda from SessionContext so this context's gameState stays populated.
  // SessionContext sets the PDA on its own useGameplayState instance; this effect
  // mirrors that onto GameplayStateProvider's instance so consumers (e.g. BossPanel)
  // reading from useGameplayStateContext() see the correct on-chain state.
  useEffect(() => {
    if (sessionPda) {
      const [derived] = getGameStatePda(sessionPda);
      gameplay.setGameStatePda(derived);
    } else {
      gameplay.setGameStatePda(null);
    }
  }, [sessionPda]);

  // Map entities state
  const [enemies, setEnemies] = useState<EnemyData[]>([]);
  const [pois, setPois] = useState<PoiData[]>([]);
  const [isMapEntitiesLoading, setIsMapEntitiesLoading] = useState(false);
  const [sessionPdaForEntities, setSessionPdaForEntities] = useState<PublicKey | null>(null);

  /**
   * Refresh map entities (enemies and POIs) from on-chain state.
   * Returns raw enemy data for syncing local game state.
   */
  const refreshMapEntities = useCallback(
    async (sessionPda: PublicKey): Promise<{ enemies: Array<{ x: number; y: number; archetypeId: number; tier: number }> } | null> => {
      if (!connection) {
        return null;
      }

      setIsMapEntitiesLoading(true);
      setSessionPdaForEntities(sessionPda);

      let rawEnemyData: Array<{ x: number; y: number; archetypeId: number; tier: number }> = [];

      try {
        // Derive PDAs for enemies and POIs
        const [enemiesPda] = deriveMapEnemiesPda(sessionPda);
        const [poisPda] = deriveMapPoisPda(sessionPda);

        // Create program instances for decoding
        const poiProgram = createPoiSystemProgram(connection);
        const gameplayProgram = createGameplayStateProgram(connection);

        // Fetch accounts in parallel
        const [enemiesAccountInfo, poisAccountInfo] = await connection.getMultipleAccountsInfo([
          enemiesPda,
          poisPda,
        ]);

        // Parse enemies using gameplay-state program coder
        if (enemiesAccountInfo?.data) {
          try {
            const mapEnemies = gameplayProgram.coder.accounts.decode(
              'mapEnemies',
              enemiesAccountInfo.data
            ) as { enemies: Array<{ x: number; y: number; archetypeId: number; tier: number; defeated: boolean }> };

            // Store raw enemy data (non-defeated) for returning to caller
            rawEnemyData = mapEnemies.enemies
              .filter((e) => !e.defeated)
              .map((e) => ({
                x: e.x,
                y: e.y,
                archetypeId: e.archetypeId,
                tier: e.tier,
              }));

            const parsedEnemies: EnemyData[] = rawEnemyData.map((e) => ({
              x: e.x,
              y: e.y,
              archetype: e.archetypeId,
              currentHp: 0, // HP is computed from archetype at combat time
              alive: true,
            }));

            setEnemies(parsedEnemies);
            console.log('[GameplayStateContext] Decoded enemies:', parsedEnemies.length);
            console.log('[GameplayStateContext] Raw enemy data sample:', rawEnemyData.slice(0, 3));
          } catch (decodeError) {
            console.error('[GameplayStateContext] Failed to decode enemies:', decodeError);
            setEnemies([]);
          }
        } else {
          setEnemies([]);
        }

        // Parse POIs using poi-system program coder
        if (poisAccountInfo?.data) {
          try {
            const mapPois = poiProgram.coder.accounts.decode(
              'mapPois',
              poisAccountInfo.data
            ) as MapPoisData;

            const parsedPois: PoiData[] = mapPois.pois.map((p: PoiInstance) => ({
              x: p.x,
              y: p.y,
              poiType: p.poiType,
              consumed: p.used,
            }));

            setPois(parsedPois);
            console.log('[GameplayStateContext] Decoded POIs:', parsedPois.length);
          } catch (decodeError) {
            console.error('[GameplayStateContext] Failed to decode POIs:', decodeError);
            setPois([]);
          }
        } else {
          setPois([]);
        }
      } catch (error) {
        console.error('[GameplayStateContext] Failed to fetch map entities:', error);
        setEnemies([]);
        setPois([]);
        return null;
      } finally {
        setIsMapEntitiesLoading(false);
      }

      return { enemies: rawEnemyData };
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

  /**
   * Discovered waypoint indices (POIs of type 8 / RAIL_WAYPOINT that are consumed/discovered).
   */
  const discoveredWaypoints = useMemo((): number[] => {
    return pois
      .map((p, index) => ({ ...p, index }))
      .filter((p) => p.poiType === 8 && p.consumed)
      .map((p) => p.index);
  }, [pois]);

  /**
   * Check if fast travel is possible between two waypoint indices.
   * Both waypoints must be discovered.
   */
  const canFastTravel = useCallback(
    (fromIndex: number, toIndex: number): boolean => {
      return discoveredWaypoints.includes(fromIndex) && discoveredWaypoints.includes(toIndex);
    },
    [discoveredWaypoints]
  );

  /**
   * Automatically refresh map entities when the game state's session changes.
   * This ensures POIs and enemies are loaded when a session starts or is resumed.
   */
  useEffect(() => {
    const sessionPda = gameplay.gameState?.session;
    if (!sessionPda || !connection) {
      return;
    }

    // Only refresh if this is a different session than we already have loaded
    if (sessionPdaForEntities?.equals(sessionPda)) {
      return;
    }

    console.log('[GameplayStateContext] Auto-refreshing map entities for session:', sessionPda.toBase58());
    refreshMapEntities(sessionPda);
  }, [gameplay.gameState?.session, connection, sessionPdaForEntities, refreshMapEntities]);

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
    refresh: async () => { await gameplay.refresh(); },
    getMoveCost: gameplay.getMoveCost,
    setGameStatePda: gameplay.setGameStatePda,
    refreshMapEntities,
    removeEnemy,
    consumePoi,
    getEnemyAt,
    getPoiAt,
    discoveredWaypoints,
    canFastTravel,
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
