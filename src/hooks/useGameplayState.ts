/**
 * useGameplayState Hook
 *
 * React hook for managing gameplay state interactions with the on-chain program.
 * Integrates with sessionSigner wallet for automatic transaction signing.
 */

import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { PublicKey, Keypair, Connection, Transaction } from '@solana/web3.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
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
  calculateMoveCost,
  triggerBossFight,
} from '@/services/solana/gameplayState';
import { getUserErrorMessage } from '@/services/solana/errors';
import {
  GameState,
  RunMode,
  Phase,
  StatType,
  GameStateInitParams,
  MovePlayerParams,
  ModifyStatParams,
} from '@/services/solana/types/gameplay_state';
import { parseCombatLog, parseBossCombatFromMoveTx } from '@/services/solana/eventParser';
import type { CombatEnemyInfo } from '@/services/solana/eventParser';
import { parseGauntletCombatVisualEvent } from '@/services/solana/gauntlet';
import type { GauntletCombatVisualEvent } from '@/services/solana/gauntlet';
import { sendSessionSignerTransaction, confirmErTransaction } from '@/services/solana/sessionSigner';
import { fetchSessionDiscovery } from '@/services/solana/mapGeneratorClient';
import type { SessionDiscoveryData } from '@/services/solana/mapGeneratorClient';
import { deriveSessionDiscoveryPda } from '@/services/solana/constants';
import { createMapGeneratorProgram } from '@/services/solana/programs';
import { parseWithRetry } from '@/utils/retry';

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
    /** Enemy info from CombatStarted event (archetype + HP for tier derivation) */
    combatEnemyInfo?: CombatEnemyInfo;
    /** Boss fight was resolved inline in this move_player tx (Campaign, Duel weeks 1-2) */
    bossResolvedInline?: boolean;
    /** Player HP at the start of the boss fight (from CombatStarted event) */
    preBossPlayerHp?: number;
    /** Gauntlet echo combat visual (from inline resolution in move_player) */
    gauntletCombatVisual?: GauntletCombatVisualEvent | null;
    /** Updated SessionDiscovery data (tiles, enemies, POIs) after the move */
    discovery?: SessionDiscoveryData | null;
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
  triggerBoss: (
    sessionSignerKeypair: Keypair,
    overrides?: {
      connection: Connection;
      program: Program;
      playerPublicKey?: PublicKey;
      sendTransaction?: (tx: Transaction) => Promise<string>;
    }
  ) => Promise<{
    success: boolean;
    newState?: GameState;
    previousState?: GameState;
    isDead?: boolean;
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
  const { gameplayConnection, gameplayReadConnection } = useSolanaConnection();
  const { wallet } = useWallet();

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameStatePda, setGameStatePdaState] = useState<PublicKey | null>(null);
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

  // Create a minimal provider for read operations.
  // Uses gameplayReadConnection (resolved ER validator) instead of gameplayConnection
  // (router) because the router returns zeroed data for delegated account reads.
  const provider = useMemo(() => {
    if (!wallet.publicKey) {
      return null;
    }

    const walletAdapter: AnchorProvider['wallet'] = {
      publicKey: wallet.publicKey,
      signTransaction: async (transaction) => transaction,
      signAllTransactions: async (transactions) => transactions,
    } as AnchorProvider['wallet'];

    return createAnchorProvider(gameplayReadConnection, walletAdapter);
  }, [gameplayReadConnection, wallet.publicKey]);

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
          setError(getUserErrorMessage(err, 'gameplay_state'));
        }
        return null;
      } finally {
        refreshInFlightRef.current = null;
      }
    })();

    refreshInFlightRef.current = refreshPromise;
    return refreshPromise;
  }, [gameStatePda, program]);

  const setGameStatePda = useCallback((pda: PublicKey | null) => {
    // Clear stale on-chain snapshot immediately when switching sessions.
    setGameState(null);
    setGameStatePdaState(pda);
    setSyncStatus(pda ? 'syncing' : 'synced');
  }, []);

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
          setError(getUserErrorMessage(err, 'gameplay_state'));
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
      combatEnemyInfo?: CombatEnemyInfo;
      bossFightReady?: boolean;
      isDead?: boolean;
      signature?: string;
      bossResolvedInline?: boolean;
      preBossPlayerHp?: number;
      gauntletCombatVisual?: GauntletCombatVisualEvent | null;
      discovery?: SessionDiscoveryData | null;
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
        const t0 = Date.now();
        const sessionPda = currentGameState.session;
        const moveResult = await movePlayer(
          gameplayConnection,
          program,
          gameStatePda,
          sessionPda,
          sessionSignerKeypair,
          params
        );
        const { signature, connection: moveConnection } = moveResult;
        const t1 = Date.now();
        console.log(`[perf] movePlayer send: ${t1 - t0}ms`);

        // Run confirmation, state fetch, and combat log parse ALL in parallel.
        // The ER processes the tx in ~50ms, so by the time the fetch arrives
        // (~150ms from Brazil), the state already reflects the move.
        // Confirmation still runs — it just doesn't block the fetch.
        const confirmPromise = confirmErTransaction(moveConnection, signature);
        const statePromise = fetchGameState(program, gameStatePda);
        const combatPromise = parseCombatInfoWithRetry(
          gameplayConnection,
          program,
          signature,
          'move',
          { maxAttempts: 1, delayMs: 0, quiet: true }
        );
        const [, confirmedState, combatResult] = await Promise.all([
          confirmPromise,
          statePromise,
          combatPromise,
        ]);
        const t2 = Date.now();
        console.log(`[perf] confirm+fetch+parse (parallel): ${t2 - t1}ms | total so far: ${t2 - t0}ms`);

        // Fetch SessionDiscovery AFTER confirmation to avoid stale data
        // (e.g., defeated enemies still appearing from pre-TX state)
        const [sdPda] = deriveSessionDiscoveryPda(sessionPda);
        const discoveryData = await fetchSessionDiscovery(
          createMapGeneratorProgram(moveConnection),
          sdPda
        ).catch(() => null);

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

        // Heuristic combat indicator: HP loss or death strongly suggests combat.
        const hpOrDeathChanged =
          confirmedState != null && (confirmedState.hp < previousState.hp || confirmedState.isDead);

        // Detect inline boss/echo resolution from state changes.
        // Boss fights auto-resolve inside move_player when the last Night3 move
        // is exhausted (Campaign, Duel weeks 1-2, Gauntlet).
        // After a WIN, moves_remaining resets to DAY_MOVES (non-zero) and week
        // advances, so we detect via week change / death / completion instead of
        // checking movesRemaining === 0.
        let bossResolvedInline = false;
        let preBossPlayerHp: number | undefined;
        let gauntletCombatVisual: GauntletCombatVisualEvent | null = null;

        const bossResolvedIndicator =
          confirmedState != null &&
          signature &&
          previousState.phase === Phase.Night3 &&
          (confirmedState.isDead ||
            confirmedState.week > previousState.week ||
            (confirmedState.completed && !previousState.completed));

        // Gauntlet echo combat emits GauntletCombatVisual,
        // so skip the compact combat-info retry when we know it's a gauntlet echo.
        const isGauntletEchoResolution =
          bossResolvedIndicator && previousState.runMode === RunMode.Gauntlet;

        // Use pre-fetched combat result from the quick parallel parse.
        // If the quick attempt missed and HP actually changed, do a follow-up retry.
        let combatEnemyInfo: CombatEnemyInfo | undefined;
        if (!isGauntletEchoResolution) {
          if (combatResult.combatEnemyInfo) {
            combatEnemyInfo = combatResult.combatEnemyInfo;
          } else if (hpOrDeathChanged && signature) {
            // Quick attempt missed — retry once more for compact combat metadata.
            const retryResult = await parseCombatInfoWithRetry(
              gameplayConnection,
              program,
              signature,
              'move',
              { maxAttempts: 1, delayMs: 80 }
            );
            combatEnemyInfo = retryResult.combatEnemyInfo;
          }
        }

        const parsedCombatDetected = !!combatEnemyInfo;
        const combatOccurred = hpOrDeathChanged || parsedCombatDetected;

        if (
          bossResolvedIndicator &&
          (previousState.runMode === RunMode.Campaign ||
            (previousState.runMode === RunMode.Duel &&
              (previousState.week === 1 || previousState.week === 2)))
        ) {
          bossResolvedInline = true;
          try {
            const bossParsed = await parseBossCombatFromMoveTx(
              gameplayConnection,
              signature!,
              program
            );
            preBossPlayerHp = bossParsed.preBossPlayerHp;
            console.log('[useGameplayState] Inline boss resolution detected:', {
              preBossPlayerHp,
            });
          } catch (err) {
            console.warn('[useGameplayState] Failed to parse inline boss combat:', err);
          }
        }

        if (bossResolvedIndicator && previousState.runMode === RunMode.Gauntlet) {
          bossResolvedInline = true;
          gauntletCombatVisual = await parseGauntletVisualWithRetry(
            gameplayConnection,
            signature!,
            {
              maxAttempts: 2,
              delayMs: 80,
            }
          );
          console.log('[useGameplayState] Inline gauntlet echo resolution detected:', {
            hasVisual: !!gauntletCombatVisual,
            playerWon: gauntletCombatVisual?.playerWon,
          });
        }

        return {
          success: true,
          newState: confirmedState ?? undefined,
          previousState,
          combatOccurred,
          combatEnemyInfo,
          bossFightReady: confirmedState?.bossFightReady ?? false,
          isDead: confirmedState?.isDead ?? false,
          signature,
          bossResolvedInline,
          preBossPlayerHp,
          gauntletCombatVisual,
          discovery: discoveryData,
        };
      } catch (err) {
        console.error('[useGameplayState] Failed to move player:', err);

        if (isMountedRef.current) {
          setSyncStatus('error');
          setError(getUserErrorMessage(err, 'gameplay_state'));
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
          setError(getUserErrorMessage(err, 'gameplay_state'));
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
      sessionSignerKeypair: Keypair,
      overrides?: {
        connection: Connection;
        program: Program;
        playerPublicKey?: PublicKey;
        sendTransaction?: (tx: Transaction) => Promise<string>;
      }
    ): Promise<{
      success: boolean;
      newState?: GameState;
      previousState?: GameState;
      isDead?: boolean;
      gauntletVisual?: GauntletCombatVisualEvent | null;
      signature?: string;
    }> => {
      if (!program || !gameStatePda || !gameState) {
        setError('Game state not initialized');
        return { success: false };
      }

      // Use overrides when provided (e.g. gauntlet needs base-layer connection)
      const conn = overrides?.connection ?? gameplayConnection;
      const prog = overrides?.program ?? program;

      const previousState = gameState;

      if (isMountedRef.current) {
        setSyncStatus('syncing');
        setError(null);
      }

      try {
        const sessionPda = gameState.session;
        // Gauntlet echo combat auto-resolves inline in move_player — triggerBoss
        // should only be called for Campaign and Duel modes.
        const signature = await triggerBossFight(
          conn,
          prog,
          gameStatePda,
          sessionPda,
          sessionSignerKeypair
        );
        // Fire state fetch and compact combat metadata parse in parallel
        const statePromise = fetchGameState(prog, gameStatePda);
        const combatPromise = signature
          ? parseCombatInfoWithRetry(conn, prog, signature, 'boss', {
              maxAttempts: 2,
              delayMs: 80,
            })
          : Promise.resolve({ combatEnemyInfo: undefined });

        const [confirmedState, combatResult] = await Promise.all([
          statePromise,
          combatPromise,
        ]);

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

        return {
          success: true,
          newState: confirmedState ?? undefined,
          previousState,
          isDead: confirmedState?.isDead ?? false,
          gauntletVisual: null,
          signature,
        };
      } catch (err) {
        console.error('[useGameplayState] Failed to trigger boss fight:', err);

        if (isMountedRef.current) {
          setSyncStatus('error');
          setError(getUserErrorMessage(err, 'gameplay_state'));
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
          setError(getUserErrorMessage(err, 'gameplay_state'));
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

  // Auto-refresh when gameStatePda changes.
  // Includes a retry for ER propagation: after delegation, the ER may take a
  // moment to receive the account, so a single fetch can return null.
  useEffect(() => {
    if (!gameStatePda || !program) return;
    let cancelled = false;
    console.log('[useGameplayState] Auto-refresh triggered for PDA:', gameStatePda.toBase58());
    (async () => {
      const state = await refresh();
      console.log('[useGameplayState] Auto-refresh complete, gameState:', state ? 'set' : 'null');
      if (state || cancelled) return;
      // ER propagation delay — retry up to 3 times with 800ms gaps
      for (let attempt = 1; attempt <= 3; attempt++) {
        await new Promise((r) => setTimeout(r, 800));
        if (cancelled) return;
        const retryState = await refresh();
        console.log(`[useGameplayState] Auto-refresh retry #${attempt}, gameState:`, retryState ? 'set' : 'null');
        if (retryState || cancelled) return;
      }
    })();
    return () => { cancelled = true; };
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
 * Uses parseWithRetry for the retry loop; accumulates enemyInfo across attempts.
 */
async function parseCombatInfoWithRetry(
  connection: Parameters<typeof parseCombatLog>[0],
  program: Parameters<typeof parseCombatLog>[1],
  signature: string,
  label: string,
  options?: { maxAttempts?: number; delayMs?: number; quiet?: boolean }
): Promise<{
  combatEnemyInfo?: CombatEnemyInfo;
}> {
  const quiet = options?.quiet ?? false;
  let combatEnemyInfo: CombatEnemyInfo | undefined;

  const foundEnemyInfo = await parseWithRetry(
    async () => {
      const result = await parseCombatLog(connection, program, signature);
      if (result.enemyInfo) combatEnemyInfo = result.enemyInfo;
      if (result.enemyInfo) {
        console.log(
          `[useGameplayState] Parsed ${label} combat metadata: archetype=`,
          result.enemyInfo.archetype,
          'hp=',
          result.enemyInfo.hp
        );
        return true;
      }
      return null;
    },
    { label: `${label} combat metadata`, ...options }
  );

  if (!foundEnemyInfo && !quiet) {
    console.warn(
      `[useGameplayState] Could not parse ${label} combat metadata after retries, using on-chain outcome fallback`
    );
  }

  return { combatEnemyInfo };
}

/**
 * Parse gauntlet combat visual from a transaction signature with retry.
 */
async function parseGauntletVisualWithRetry(
  connection: Connection,
  signature: string,
  options?: { maxAttempts?: number; delayMs?: number }
): Promise<GauntletCombatVisualEvent | null> {
  return parseWithRetry(
    () => parseGauntletCombatVisualEvent(connection, signature),
    { label: 'gauntlet visual', ...options }
  );
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
