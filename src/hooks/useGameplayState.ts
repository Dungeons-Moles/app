/**
 * useGameplayState Hook
 *
 * React hook for managing gameplay state interactions with the on-chain program.
 * Integrates with burner wallet for automatic transaction signing.
 */

import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { PublicKey, Keypair } from '@solana/web3.js';
import { AnchorProvider } from '@coral-xyz/anchor';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { useWallet } from '@/contexts/WalletContext';
import {
  createGameplayStateProgramWithProvider,
  createAnchorProvider,
} from '@/services/solana/programs';
import {
  initializeGameState,
  movePlayer,
  modifyStat,
  closeGameState,
  fetchGameState,
  getGameplayErrorMessage,
  calculateMoveCost,
} from '@/services/solana/gameplayState';
import {
  GameState,
  StatType,
  GameStateInitParams,
  MovePlayerParams,
  ModifyStatParams,
} from '@/services/solana/types/gameplay_state';

// ============================================================================
// Types
// ============================================================================

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

export interface UseGameplayStateReturn {
  /** Current game state (null if not initialized) */
  gameState: GameState | null;
  /** GameState PDA (null if not initialized) */
  gameStatePda: PublicKey | null;
  /** Whether operations are loading */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
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
  updateStat: (
    burnerKeypair: Keypair,
    params: ModifyStatParams
  ) => Promise<{ success: boolean; newValue?: number }>;
  /** Close the game state */
  close: (burnerKeypair: Keypair) => Promise<boolean>;
  /** Refresh game state from chain */
  refresh: () => Promise<GameState | null>;
  /** Current sync status */
  syncStatus: SyncStatus;
  /** Last sync timestamp */
  lastSyncAt: number | null;
  /** Calculate move cost for a tile */
  getMoveCost: (isWall: boolean) => number;
  /** Set the game state PDA (for loading existing sessions) */
  setGameStatePda: (pda: PublicKey | null) => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useGameplayState(): UseGameplayStateReturn {
  const { connection } = useSolanaConnection();
  const { wallet } = useWallet();

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameStatePda, setGameStatePda] = useState<PublicKey | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Create a minimal provider for read operations
  const provider = useMemo(() => {
    if (!wallet.publicKey) {
      return null;
    }

    const walletAdapter: AnchorProvider['wallet'] = {
      publicKey: wallet.publicKey,
      signTransaction: async (transaction) => transaction,
      signAllTransactions: async (transactions) => transactions,
    } as AnchorProvider['wallet'];

    return createAnchorProvider(connection, walletAdapter);
  }, [connection, wallet.publicKey]);

  const program = useMemo(() => {
    if (!provider) {
      return null;
    }
    return createGameplayStateProgramWithProvider(provider);
  }, [provider]);

  /**
   * Refresh game state from chain.
   */
  const refresh = useCallback(async (): Promise<GameState | null> => {
    if (!program || !gameStatePda) {
      return null;
    }

    if (isMountedRef.current) {
      setSyncStatus('syncing');
    }

    try {
      const state = await fetchGameState(program, gameStatePda);

      if (isMountedRef.current) {
        setGameState(state);
        setSyncStatus('synced');
        setLastSyncAt(Date.now());
        setError(null);
      }
      return state;
    } catch (err) {
      console.error('Failed to refresh game state:', err);
      if (isMountedRef.current) {
        setSyncStatus('error');
        setError(getGameplayErrorMessage(err));
      }
      return null;
    }
  }, [gameStatePda, program]);

  /**
   * Initialize a new game state for a session.
   */
  const initialize = useCallback(
    async (
      sessionPda: PublicKey,
      burnerKeypair: Keypair,
      params: GameStateInitParams
    ): Promise<boolean> => {
      if (!program) {
        if (isMountedRef.current) {
          setError('Program not available');
        }
        return false;
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const { gameStatePda: pda } = await initializeGameState(
          connection,
          program,
          sessionPda,
          burnerKeypair,
          params
        );

        if (isMountedRef.current) {
          setGameStatePda(pda);
        }

        // Fetch the initialized state
        const state = await fetchGameState(program, pda);

        if (isMountedRef.current) {
          setGameState(state);
          setSyncStatus('synced');
          setLastSyncAt(Date.now());
          setIsLoading(false);
        }

        return true;
      } catch (err) {
        console.error('Failed to initialize game state:', err);
        if (isMountedRef.current) {
          setError(getGameplayErrorMessage(err));
          setIsLoading(false);
        }
        return false;
      }
    },
    [connection, program]
  );

  /**
   * Move player to adjacent tile.
   * Uses optimistic update for responsive UI.
   */
  const move = useCallback(
    async (
      burnerKeypair: Keypair,
      params: MovePlayerParams
    ): Promise<{ success: boolean; newState?: GameState }> => {
      if (!program || !gameStatePda || !gameState) {
        setError('Game state not initialized');
        return { success: false };
      }

      // Calculate expected move cost
      const moveCost = calculateMoveCost(params.isWall, gameState.dig);

      // Validate move locally before sending
      if (gameState.movesRemaining < moveCost) {
        setError('Not enough moves remaining');
        return { success: false };
      }

      if (gameState.bossFightReady) {
        setError('Boss fight triggered - end your run!');
        return { success: false };
      }

      // Optimistic update
      const optimisticState: GameState = {
        ...gameState,
        positionX: params.targetX,
        positionY: params.targetY,
        movesRemaining: gameState.movesRemaining - moveCost,
        totalMoves: gameState.totalMoves + moveCost,
      };

      if (isMountedRef.current) {
        setGameState(optimisticState);
        setSyncStatus('syncing');
        setError(null);
      }

      try {
        await movePlayer(connection, program, gameStatePda, burnerKeypair, params);

        // Fetch confirmed state
        const confirmedState = await fetchGameState(program, gameStatePda);

        if (isMountedRef.current) {
          setGameState(confirmedState);
          setSyncStatus('synced');
          setLastSyncAt(Date.now());
        }

        return { success: true, newState: confirmedState ?? undefined };
      } catch (err) {
        console.error('Failed to move player:', err);

        // Rollback optimistic update
        if (isMountedRef.current) {
          setGameState(gameState);
          setSyncStatus('error');
          setError(getGameplayErrorMessage(err));
        }

        return { success: false };
      }
    },
    [connection, gameState, gameStatePda, program]
  );

  /**
   * Modify a player stat.
   */
  const updateStat = useCallback(
    async (
      burnerKeypair: Keypair,
      params: ModifyStatParams
    ): Promise<{ success: boolean; newValue?: number }> => {
      if (!program || !gameStatePda || !gameState) {
        setError('Game state not initialized');
        return { success: false };
      }

      if (isMountedRef.current) {
        setSyncStatus('syncing');
        setError(null);
      }

      try {
        await modifyStat(connection, program, gameStatePda, burnerKeypair, params);

        // Fetch confirmed state
        const confirmedState = await fetchGameState(program, gameStatePda);

        if (isMountedRef.current) {
          setGameState(confirmedState);
          setSyncStatus('synced');
          setLastSyncAt(Date.now());
        }

        // Get the new value based on stat type
        const newValue = confirmedState ? getStatValue(confirmedState, params.stat) : undefined;

        return { success: true, newValue };
      } catch (err) {
        console.error('Failed to modify stat:', err);

        if (isMountedRef.current) {
          setSyncStatus('error');
          setError(getGameplayErrorMessage(err));
        }

        return { success: false };
      }
    },
    [connection, gameState, gameStatePda, program]
  );

  /**
   * Close the game state.
   */
  const close = useCallback(
    async (burnerKeypair: Keypair): Promise<boolean> => {
      if (!program || !gameStatePda) {
        setError('Game state not initialized');
        return false;
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        await closeGameState(connection, program, gameStatePda, burnerKeypair);

        if (isMountedRef.current) {
          setGameState(null);
          setGameStatePda(null);
          setSyncStatus('synced');
          setIsLoading(false);
        }

        return true;
      } catch (err) {
        console.error('Failed to close game state:', err);

        if (isMountedRef.current) {
          setError(getGameplayErrorMessage(err));
          setIsLoading(false);
        }

        return false;
      }
    },
    [connection, gameStatePda, program]
  );

  /**
   * Calculate move cost for a tile based on current dig stat.
   */
  const getMoveCost = useCallback(
    (isWall: boolean): number => {
      const dig = gameState?.dig ?? 0;
      return calculateMoveCost(isWall, dig);
    },
    [gameState?.dig]
  );

  // Auto-refresh when gameStatePda changes
  useEffect(() => {
    if (gameStatePda && program) {
      refresh();
    }
  }, [gameStatePda, program, refresh]);

  return {
    gameState,
    gameStatePda,
    isLoading,
    error,
    initialize,
    move,
    updateStat,
    close,
    refresh,
    syncStatus,
    lastSyncAt,
    getMoveCost,
    setGameStatePda,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get a stat value from game state.
 */
function getStatValue(state: GameState, stat: StatType): number {
  switch (stat) {
    case StatType.Hp:
      return state.hp;
    case StatType.MaxHp:
      return state.maxHp;
    case StatType.Atk:
      return state.atk;
    case StatType.Arm:
      return state.arm;
    case StatType.Spd:
      return state.spd;
    case StatType.Dig:
      return state.dig;
    default:
      return 0;
  }
}
