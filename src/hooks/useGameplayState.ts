/**
 * useGameplayState Hook
 *
 * React hook for managing gameplay state interactions with the on-chain program.
 * Integrates with sessionSigner wallet for automatic transaction signing.
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
  triggerBossFight,
  resolveGauntletWeek,
} from '@/services/solana/gameplayState';
import {
  GameState,
  RunMode,
  StatType,
  GameStateInitParams,
  MovePlayerParams,
  ModifyStatParams,
} from '@/services/solana/types/gameplay_state';
import { parseCombatLog } from '@/services/solana/eventParser';
import type { CombatEnemyInfo } from '@/services/solana/eventParser';
import type { BackendCombatLogEntry } from '@/services/solana/types/combat_events';
import type { GauntletCombatVisualEvent } from '@/services/solana/gauntlet';

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
    /** Combat log entries from on-chain (if combat occurred) */
    combatLog?: BackendCombatLogEntry[];
    /** Enemy info from CombatStarted event (archetype + HP for tier derivation) */
    combatEnemyInfo?: CombatEnemyInfo;
  }>;
  /** Modify a player stat */
  updateStat: (
    sessionSignerKeypair: Keypair,
    params: ModifyStatParams
  ) => Promise<{ success: boolean; newValue?: number }>;
  /** Close the game state */
  close: (sessionSignerKeypair: Keypair) => Promise<boolean>;
  /** Refresh game state from chain */
  refresh: () => Promise<GameState | null>;
  /** Current sync status */
  syncStatus: SyncStatus;
  /** Last sync timestamp */
  lastSyncAt: number | null;
  /** Trigger boss fight on-chain */
  triggerBoss: (sessionSignerKeypair: Keypair) => Promise<{
    success: boolean;
    newState?: GameState;
    previousState?: GameState;
    isDead?: boolean;
    combatLog?: BackendCombatLogEntry[];
    gauntletVisual?: GauntletCombatVisualEvent | null;
    signature?: string;
  }>;
  /** Calculate move cost for a tile */
  getMoveCost: (isWall: boolean) => number;
  /** Set the game state PDA (for loading existing sessions) */
  setGameStatePda: (pda: PublicKey | null) => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useGameplayState(): UseGameplayStateReturn {
  const { gameplayConnection } = useSolanaConnection();
  const { wallet } = useWallet();

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameStatePda, setGameStatePda] = useState<PublicKey | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  const isMountedRef = useRef(true);
  const refreshInFlightRef = useRef<Promise<GameState | null> | null>(null);

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

    return createAnchorProvider(gameplayConnection, walletAdapter);
  }, [gameplayConnection, wallet.publicKey]);

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

    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    if (isMountedRef.current) {
      setSyncStatus('syncing');
    }

    const refreshPromise = (async (): Promise<GameState | null> => {
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
      } finally {
        refreshInFlightRef.current = null;
      }
    })();

    refreshInFlightRef.current = refreshPromise;
    return refreshPromise;
  }, [gameStatePda, program]);

  /**
   * Initialize a new game state for a session.
   */
  const initialize = useCallback(
    async (
      sessionPda: PublicKey,
      sessionSignerKeypair: Keypair,
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
          gameplayConnection,
          program,
          sessionPda,
          sessionSignerKeypair,
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
    [gameplayConnection, program]
  );

  /**
   * Move player to adjacent tile.
   * On-chain-first: sends transaction, awaits confirmation, fetches confirmed state.
   * No optimistic updates — local state only changes after on-chain confirmation.
   */
  const move = useCallback(
    async (
      sessionSignerKeypair: Keypair,
      params: MovePlayerParams
    ): Promise<{
      success: boolean;
      newState?: GameState;
      previousState?: GameState;
      combatOccurred?: boolean;
      combatLog?: BackendCombatLogEntry[];
      combatEnemyInfo?: CombatEnemyInfo;
      bossFightReady?: boolean;
      isDead?: boolean;
      signature?: string;
    }> => {
      console.log(
        '[useGameplayState] move() called — program:',
        !!program,
        ', gameStatePda:',
        gameStatePda?.toBase58() ?? 'null',
        ', gameState:',
        gameState ? 'set' : 'null',
        ', endpoint:',
        gameplayConnection.rpcEndpoint
      );

      if (!program) {
        const msg = 'Program not available';
        console.error('[useGameplayState] move() failed:', msg);
        setError(msg);
        return { success: false };
      }

      if (!gameStatePda) {
        const msg = 'Game state not connected to blockchain (gameStatePda is null)';
        console.error('[useGameplayState] move() failed:', msg);
        setError(msg);
        return { success: false };
      }

      let currentGameState = gameState;

      if (!currentGameState) {
        // Auto-refresh may not have completed yet — try fetching on-demand
        console.warn('[useGameplayState] move(): gameState is null, attempting on-demand fetch...');
        currentGameState = await fetchGameState(program, gameStatePda);
        if (currentGameState && isMountedRef.current) {
          setGameState(currentGameState);
          console.log('[useGameplayState] move(): on-demand fetch succeeded');
        }
      }

      if (!currentGameState) {
        const msg = 'Game state not initialized — fetch failed';
        console.error('[useGameplayState] move() failed:', msg);
        setError(msg);
        return { success: false };
      }

      const previousState = currentGameState;

      if (isMountedRef.current) {
        setSyncStatus('syncing');
        setError(null);
      }

      try {
        const sessionPda = currentGameState.session;
        const signature = await movePlayer(
          gameplayConnection,
          program,
          gameStatePda,
          sessionPda,
          sessionSignerKeypair,
          params
        );

        // Fetch confirmed state after on-chain confirmation
        const confirmedState = await fetchGameState(program, gameStatePda);

        // Debug: Log fetched HP to track sync issues
        console.log('[useGameplayState] move() fetched state:', {
          previousHp: previousState.hp,
          fetchedHp: confirmedState?.hp,
          previousGold: previousState.gold,
          fetchedGold: confirmedState?.gold,
        });

        if (isMountedRef.current) {
          setGameState(confirmedState);
          setSyncStatus('synced');
          setLastSyncAt(Date.now());
        }

        // Detect combat from state changes
        const combatOccurred =
          confirmedState != null &&
          (confirmedState.hp < previousState.hp ||
            confirmedState.isDead ||
            confirmedState.gold > previousState.gold);

        // Fetch combat log and enemy info from transaction if combat occurred
        let combatLog: BackendCombatLogEntry[] | undefined;
        let combatEnemyInfo: CombatEnemyInfo | undefined;
        if (combatOccurred && signature) {
          const parsed = await parseCombatLogWithRetry(
            gameplayConnection,
            program,
            signature,
            'move'
          );
          combatLog = parsed.combatLog;
          combatEnemyInfo = parsed.combatEnemyInfo;
        }

        return {
          success: true,
          newState: confirmedState ?? undefined,
          previousState,
          combatOccurred,
          combatLog,
          combatEnemyInfo,
          bossFightReady: confirmedState?.bossFightReady ?? false,
          isDead: confirmedState?.isDead ?? false,
          signature,
        };
      } catch (err) {
        console.error('[useGameplayState] Failed to move player:', err);

        if (isMountedRef.current) {
          setSyncStatus('error');
          setError(getGameplayErrorMessage(err));
        }

        return { success: false };
      }
    },
    [gameplayConnection, gameState, gameStatePda, program]
  );

  /**
   * Modify a player stat.
   */
  const updateStat = useCallback(
    async (
      sessionSignerKeypair: Keypair,
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
        await modifyStat(gameplayConnection, program, gameStatePda, sessionSignerKeypair, params);

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
    [gameplayConnection, gameState, gameStatePda, program]
  );

  /**
   * Trigger boss fight on-chain.
   * Calls the trigger_boss_fight instruction, fetches confirmed state, and parses combat log.
   */
  const triggerBoss = useCallback(
    async (
      sessionSignerKeypair: Keypair
    ): Promise<{
      success: boolean;
      newState?: GameState;
      previousState?: GameState;
      isDead?: boolean;
      combatLog?: BackendCombatLogEntry[];
      gauntletVisual?: GauntletCombatVisualEvent | null;
      signature?: string;
    }> => {
      if (!program || !gameStatePda || !gameState) {
        setError('Game state not initialized');
        return { success: false };
      }

      const previousState = gameState;

      if (isMountedRef.current) {
        setSyncStatus('syncing');
        setError(null);
      }

      try {
        const sessionPda = gameState.session;
        let signature: string;
        let gauntletVisual: GauntletCombatVisualEvent | null = null;

        if (gameState.runMode === RunMode.Gauntlet) {
          const gauntletResult = await resolveGauntletWeek(
            gameplayConnection,
            program,
            gameStatePda,
            sessionPda,
            sessionSignerKeypair
          );
          signature = gauntletResult.signature;
          gauntletVisual = gauntletResult.combatVisual ?? null;
        } else {
          signature = await triggerBossFight(
            gameplayConnection,
            program,
            gameStatePda,
            sessionPda,
            sessionSignerKeypair
          );
        }

        // Fetch confirmed state after on-chain confirmation
        const confirmedState = await fetchGameState(program, gameStatePda);

        console.log('[useGameplayState] triggerBoss() fetched state:', {
          previousHp: previousState.hp,
          fetchedHp: confirmedState?.hp,
          isDead: confirmedState?.isDead,
        });

        if (isMountedRef.current) {
          setGameState(confirmedState);
          setSyncStatus('synced');
          setLastSyncAt(Date.now());
        }

        // Parse combat log from transaction
        let combatLog: BackendCombatLogEntry[] | undefined;
        if (gauntletVisual?.combatLog?.length) {
          combatLog = gauntletVisual.combatLog;
        } else if (signature) {
          const parsed = await parseCombatLogWithRetry(
            gameplayConnection,
            program,
            signature,
            'boss'
          );
          combatLog = parsed.combatLog;
        }

        return {
          success: true,
          newState: confirmedState ?? undefined,
          previousState,
          isDead: confirmedState?.isDead ?? false,
          combatLog,
          gauntletVisual,
          signature,
        };
      } catch (err) {
        console.error('[useGameplayState] Failed to trigger boss fight:', err);

        if (isMountedRef.current) {
          setSyncStatus('error');
          setError(getGameplayErrorMessage(err));
        }

        return { success: false };
      }
    },
    [gameplayConnection, gameState, gameStatePda, program]
  );

  /**
   * Close the game state.
   */
  const close = useCallback(
    async (sessionSignerKeypair: Keypair): Promise<boolean> => {
      if (!program || !gameStatePda) {
        setError('Game state not initialized');
        return false;
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        await closeGameState(gameplayConnection, program, gameStatePda, sessionSignerKeypair);

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
    [gameplayConnection, gameStatePda, program]
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
      console.log('[useGameplayState] Auto-refresh triggered for PDA:', gameStatePda.toBase58());
      refresh().then((state) => {
        console.log('[useGameplayState] Auto-refresh complete, gameState:', state ? 'set' : 'null');
      });
    }
  }, [gameStatePda, program, refresh]);

  return {
    gameState,
    gameStatePda,
    isLoading,
    error,
    initialize,
    move,
    triggerBoss,
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
 * Parse combat log from a transaction signature with retry.
 * Returns entries and enemy info if available.
 */
async function parseCombatLogWithRetry(
  connection: Parameters<typeof parseCombatLog>[0],
  program: Parameters<typeof parseCombatLog>[1],
  signature: string,
  label: string
): Promise<{
  combatLog?: BackendCombatLogEntry[];
  combatEnemyInfo?: CombatEnemyInfo;
}> {
  let combatLog: BackendCombatLogEntry[] | undefined;
  let combatEnemyInfo: CombatEnemyInfo | undefined;
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await parseCombatLog(connection, program, signature);
      if (result.enemyInfo) {
        combatEnemyInfo = result.enemyInfo;
      }
      if (result.log && result.log.entries.length > 0) {
        combatLog = result.log.entries;
        console.log(`[useGameplayState] Parsed ${label} combat log:`, combatLog.length, 'entries');
        break;
      }
      console.warn(
        `[useGameplayState] ${label} combat log parse attempt ${attempt + 1}/${maxAttempts}: no CombatLog event found`
      );
    } catch (logErr) {
      console.warn(
        `[useGameplayState] ${label} combat log parse attempt ${attempt + 1}/${maxAttempts} error:`,
        logErr
      );
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  if (!combatLog) {
    console.warn(
      `[useGameplayState] Could not parse ${label} combat log after ${maxAttempts} attempts, using on-chain outcome fallback`
    );
  }

  return { combatLog, combatEnemyInfo };
}

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
