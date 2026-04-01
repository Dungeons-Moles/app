/**
 * useGameplayState Hook
 *
 * React hook for managing gameplay state interactions with the on-chain program.
 * Integrates with sessionSigner wallet for automatic transaction signing.
 */

import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { PublicKey, Keypair, Connection, Transaction } from '@solana/web3.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import * as Sentry from '@sentry/react-native';
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
  decodeGameStateFromAccountInfo,
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
import { parseCombatLog } from '@/services/solana/eventParser';
import type { CombatEnemyInfo } from '@/services/solana/eventParser';
import { parseGauntletCombatVisualEvent } from '@/services/solana/gauntlet';
import type { GauntletCombatVisualEvent } from '@/services/solana/gauntlet';
import { sendSessionSignerTransaction } from '@/services/solana/sessionSigner';
import { SOLANA_CONFIG } from '@/services/solana/config';
import {
  fetchSessionDiscovery,
  decodeSessionDiscoveryFromAccountInfo,
} from '@/services/solana/mapGeneratorClient';
import type { SessionDiscoveryData } from '@/services/solana/mapGeneratorClient';
import { deriveSessionDiscoveryPda, deriveGauntletEchoesPda } from '@/services/solana/constants';
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
    /** Boss ID from BossCombatStarted event (authoritative, avoids stale weekBoss) */
    inlineBossId?: string;
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
  const wsSubIdRef = useRef<number | null>(null);
  const wsListenersRef = useRef<Set<(state: GameState) => void>>(new Set());
  const wsDiscoverySubIdRef = useRef<number | null>(null);
  const wsDiscoveryListenersRef = useRef<Set<(data: SessionDiscoveryData) => void>>(new Set());
  const latestDiscoveryRef = useRef<SessionDiscoveryData | null>(null);

  const gameplayWriteConnection = useMemo(() => {
    const gameplayEndpoint = gameplayConnection.rpcEndpoint.replace(/\/+$/, '');
    const readEndpoint = gameplayReadConnection.rpcEndpoint.replace(/\/+$/, '');
    const directEndpoint = SOLANA_CONFIG.directErRpcUrl.replace(/\/+$/, '');
    const isRouter = gameplayEndpoint.includes('router.magicblock.app');
    const hasResolvedValidator = readEndpoint !== directEndpoint && !readEndpoint.includes('router.magicblock.app');
    return isRouter && hasResolvedValidator ? gameplayReadConnection : gameplayConnection;
  }, [gameplayConnection, gameplayReadConnection]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      wsListenersRef.current.clear();
      wsDiscoveryListenersRef.current.clear();
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
   * Register a one-shot WS listener that resolves when the GameState account changes.
   * Call BEFORE sending the tx to avoid missing fast WS notifications.
   * Returns a promise + cleanup function. Use raceWsVsFetch() to add a timeout AFTER the send.
   */
  const registerWsListener = useCallback((): {
    promise: Promise<GameState>;
    cancel: () => void;
  } => {
    let resolve: (state: GameState) => void;
    const promise = new Promise<GameState>((r) => {
      resolve = r;
    });
    const listener = (state: GameState) => {
      wsListenersRef.current.delete(listener);
      resolve(state);
    };
    wsListenersRef.current.add(listener);
    const cancel = () => wsListenersRef.current.delete(listener);
    return { promise, cancel };
  }, []);

  /**
   * Race a WS listener against a timeout that falls back to explicit fetch.
   * The timeout starts NOW (call this AFTER the send completes, not before).
   * The timeout is cancelled if WS delivers first (prevents orphaned warnings).
   */
  const raceWsVsFetch = useCallback(
    (wsPromise: Promise<GameState>, timeoutMs: number): Promise<GameState | null> => {
      if (!program || !gameStatePda) return Promise.resolve(null);

      const prog = program;
      const pda = gameStatePda;

      return new Promise<GameState | null>((resolve) => {
        let resolved = false;
        const done = (state: GameState | null) => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeoutId);
          resolve(state);
        };

        wsPromise.then(done);

        const timeoutId = setTimeout(async () => {
          if (resolved) return;
          console.warn(`[useGameplayState] WS timeout after ${timeoutMs}ms, falling back to fetch`);
          try {
            done(await fetchGameState(prog, pda));
          } catch {
            done(null);
          }
        }, timeoutMs);
      });
    },
    [program, gameStatePda]
  );

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
          gameplayWriteConnection,
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
    [gameplayConnection, gameplayWriteConnection, program]
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
      inlineBossId?: string;
      gauntletCombatVisual?: GauntletCombatVisualEvent | null;
      discovery?: SessionDiscoveryData | null;
    }> => {
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
        }
      }

      if (!currentGameState) {
        const msg = 'Game state not initialized — fetch failed';
        console.error('[useGameplayState] move() failed:', msg);
        setError(msg);
        return { success: false };
      }

      const previousState = currentGameState;

      // Defer setSyncStatus('syncing') — setting state here triggers a React re-render
      // that blocks the main thread before the TX is sent, adding 100-300ms latency.
      // The sync status will be updated when the result arrives.

      try {
        const t0 = Date.now();
        const sessionPda = currentGameState.session;

        // Register WS listeners BEFORE sending the tx to avoid missing fast notifications.
        // The ER can process and push within ms of receiving the tx from the router.
        // Timeouts are started AFTER the send to avoid premature fallback on slow networks
        // (RN's sendTransaction can take ~720ms, which would expire a 500ms timeout).
        const wsState = registerWsListener();
        let wsDiscoveryCancelled = false;
        let wsDiscoveryResolve!: (data: SessionDiscoveryData | null) => void;
        const wsDiscoveryPromise = new Promise<SessionDiscoveryData | null>((r) => {
          wsDiscoveryResolve = r;
        });
        const discoveryListener = (data: SessionDiscoveryData) => {
          if (wsDiscoveryCancelled) return;
          wsDiscoveryCancelled = true;
          wsDiscoveryListenersRef.current.delete(discoveryListener);
          wsDiscoveryResolve(data);
        };
        wsDiscoveryListenersRef.current.add(discoveryListener);

        const moveResult = await movePlayer(
          gameplayWriteConnection,
          program,
          gameStatePda,
          sessionPda,
          sessionSignerKeypair,
          params,
          {
            onSendFail: (err) => {
              console.warn('[useGameplayState] Fire-and-forget send failed:', err.message);
              Sentry.captureException(err, {
                tags: {
                  source: 'useGameplayState.move.onSendFail',
                  flow: 'movement',
                },
                extra: {
                  gameStatePda: gameStatePda.toBase58(),
                  sessionPda: sessionPda.toBase58(),
                  targetX: params.targetX,
                  targetY: params.targetY,
                },
              });
              // Cancel WS wait early — the tx never reached the ER so no update will come.
              if (!wsDiscoveryCancelled) {
                wsDiscoveryCancelled = true;
                wsDiscoveryListenersRef.current.delete(discoveryListener);
                wsDiscoveryResolve(null);
              }
              wsState.cancel?.();
            },
          }
        );
        const { signature, connection: moveConnection } = moveResult;
        const tSent = Date.now();

        // Background confirmation removed — WS subscription already delivers
        // confirmed state, and the polling (40ms × 50 requests per move) saturates
        // the HTTP connection on rapid moves, causing subsequent sends to stall.

        // Await only gameState — don't block the move on discovery WS delivery.
        // Discovery is best-effort: take whatever arrived by the time gameState resolves.
        const confirmedState = await raceWsVsFetch(wsState.promise, 500);

        // Resolve discovery immediately with whatever is available (WS data or latest ref).
        if (!wsDiscoveryCancelled) {
          wsDiscoveryCancelled = true;
          wsDiscoveryListenersRef.current.delete(discoveryListener);
          wsDiscoveryResolve(latestDiscoveryRef.current);
        }
        const wsDiscoveryData = await wsDiscoveryPromise;

        // Only parse combat logs when the WS-delivered state shows HP changed or death.
        // This skips the expensive getTransaction RPC call on non-combat night moves.
        const isNightPhase =
          previousState.phase === Phase.Night1 ||
          previousState.phase === Phase.Night2 ||
          previousState.phase === Phase.Night3;
        const hpOrDeathChangedEarly =
          confirmedState != null && (confirmedState.hp < previousState.hp || confirmedState.isDead);
        let combatResult: { combatEnemyInfo?: CombatEnemyInfo } = { combatEnemyInfo: undefined };
        if (isNightPhase && hpOrDeathChangedEarly) {
          combatResult = await parseCombatInfoWithRetry(
            gameplayReadConnection,
            program,
            signature,
            'move',
            { maxAttempts: 1, delayMs: 0, quiet: true }
          );
        }

        const tDone = Date.now();
        console.log(`[perf] move: ${tDone - t0}ms (send: ${tSent - t0}ms, ws: ${tDone - tSent}ms)`);

        // Prefer the WS-delivered discovery snapshot on normal moves to keep the
        // hot path fast. Only pay for a follow-up RPC read when the move changed
        // phase/week boundaries or when WS delivery missed entirely.
        let finalDiscovery: SessionDiscoveryData | null = wsDiscoveryData;
        if (
          confirmedState &&
          (!wsDiscoveryData ||
            confirmedState.phase !== previousState.phase ||
            confirmedState.week !== previousState.week)
        ) {
          const [sdPda] = deriveSessionDiscoveryPda(sessionPda);
          const freshDiscovery = await fetchSessionDiscovery(
            createMapGeneratorProgram(moveConnection),
            sdPda
          ).catch(() => null);
          if (freshDiscovery) {
            finalDiscovery = freshDiscovery;
          }
        }

        if (isMountedRef.current) {
          setGameState(confirmedState);
          setSyncStatus('synced');
          setLastSyncAt(Date.now());
        }

        // Heuristic combat indicator: HP loss, death, or gold increase strongly suggests combat.
        // Gold increase is included because move_player only changes gold via combat rewards,
        // and during night phase the frontend may not know the enemy's position (enemies move
        // on-chain), so HP-only detection misses zero-damage wins (high ARM).
        const hpOrDeathChanged =
          confirmedState != null && (confirmedState.hp < previousState.hp || confirmedState.isDead);
        const goldIncreased = confirmedState != null && confirmedState.gold > previousState.gold;

        // Detect inline boss/echo resolution from state changes.
        // Boss fights auto-resolve inside move_player when the last Night3 move
        // is exhausted (Campaign, Duel weeks 1-2, Gauntlet).
        // After a WIN, moves_remaining resets to DAY_MOVES (non-zero) and week
        // advances, so we detect via week change / death / completion instead of
        // checking movesRemaining === 0.
        let bossResolvedInline = false;
        let preBossPlayerHp: number | undefined;
        let inlineBossId: string | undefined;
        let gauntletCombatVisual: GauntletCombatVisualEvent | null = null;

        const bossResolvedIndicator =
          confirmedState != null &&
          signature &&
          previousState.phase === Phase.Night3 &&
          (confirmedState.isDead ||
            confirmedState.week > previousState.week ||
            (confirmedState.completed && !previousState.completed));

        // Skip the compact combat-info retry when we know the HP change came from
        // a boss/echo resolution, not a field enemy fight. The retry would waste
        // ~80ms looking for field enemy events that don't exist.
        const isBossOrEchoResolution = !!bossResolvedIndicator;

        // Use pre-fetched combat result from the quick parallel parse.
        // If the quick attempt missed and HP actually changed, do a follow-up retry.
        let combatEnemyInfo: CombatEnemyInfo | undefined;
        if (!isBossOrEchoResolution) {
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
        const combatOccurred = hpOrDeathChanged || parsedCombatDetected || goldIncreased;

        if (
          bossResolvedIndicator &&
          (previousState.runMode === RunMode.Campaign ||
            (previousState.runMode === RunMode.Duel &&
              (previousState.week === 1 || previousState.week === 2)))
        ) {
          bossResolvedInline = true;
          preBossPlayerHp = previousState.hp;
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
          inlineBossId,
          gauntletCombatVisual,
          discovery: finalDiscovery,
        };
      } catch (err) {
        console.error('[useGameplayState] Failed to move player:', err);
        Sentry.captureException(err, {
          tags: {
            source: 'useGameplayState.move',
            flow: 'movement',
          },
          extra: {
            gameStatePda: gameStatePda.toBase58(),
            currentSessionPda: previousState.session.toBase58(),
            targetX: params.targetX,
            targetY: params.targetY,
            phase: previousState.phase,
            week: previousState.week,
          },
        });

        if (isMountedRef.current) {
          setSyncStatus('error');
          setError(getUserErrorMessage(err, 'gameplay_state'));
        }

        return { success: false };
      }
    },
    [gameplayReadConnection, gameplayWriteConnection, gameState, gameStatePda, program, registerWsListener, raceWsVsFetch]
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
        const wsState = registerWsListener();
        await modifyStat(gameplayWriteConnection, program, gameStatePda, sessionSignerKeypair, params);

        // Wait for WS-delivered state (timeout starts after send)
        const confirmedState = await raceWsVsFetch(wsState.promise, 500);

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
    [gameplayWriteConnection, gameState, gameStatePda, program, registerWsListener, raceWsVsFetch]
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
      const conn = overrides?.connection ?? gameplayWriteConnection;
      const prog = overrides?.program ?? program;

      const previousState = gameState;

      if (isMountedRef.current) {
        setSyncStatus('syncing');
        setError(null);
      }

      try {
        const sessionPda = gameState.session;
        // Register WS listener before send (overrides bypass WS)
        const wsState = overrides ? null : registerWsListener();
        const signature = await triggerBossFight(
          conn,
          prog,
          gameStatePda,
          sessionPda,
          sessionSignerKeypair,
          gameState.runMode === RunMode.Gauntlet
            ? { gauntletEchoesPda: deriveGauntletEchoesPda(sessionPda)[0] }
            : undefined
        );
        // Wait for the confirmed state. Boss combat visualization is built
        // entirely on the frontend now, so we no longer parse the old compact
        // combat metadata path here.
        // When overrides are provided (gauntlet uses base-layer connection),
        // fall back to explicit fetch since WS subscription is on gameplayReadConnection.
        const statePromise =
          overrides || !wsState
            ? fetchGameState(prog, gameStatePda)
            : raceWsVsFetch(wsState.promise, 1000);

        const confirmedState = await statePromise;

        if (isMountedRef.current) {
          setGameState(confirmedState);
          setSyncStatus('synced');
          setLastSyncAt(Date.now());
        }

        // Parse gauntlet visual from the trigger_boss_fight tx when in gauntlet mode.
        // Use more retries than move_player because triggerBossFight uses
        // skipErConfirmation — the tx may not be queryable via getTransaction
        // until the ER indexes it, even though account state has already settled.
        let gauntletVisual: GauntletCombatVisualEvent | null = null;
        if (signature && previousState.runMode === RunMode.Gauntlet) {
          gauntletVisual = await parseWithRetry(
            () => parseGauntletCombatVisualEvent(conn, signature),
            { label: 'gauntlet visual', maxAttempts: 5, delayMs: 250 }
          );
        }

        return {
          success: true,
          newState: confirmedState ?? undefined,
          previousState,
          isDead: confirmedState?.isDead ?? false,
          gauntletVisual,
          signature,
        };
      } catch (err) {
        console.error('[useGameplayState] Failed to trigger boss fight:', err);
        Sentry.captureException(err, {
          tags: {
            source: 'useGameplayState.triggerBoss',
            flow: 'boss',
          },
          extra: {
            gameStatePda: gameStatePda.toBase58(),
            sessionPda: previousState.session.toBase58(),
            runMode: previousState.runMode,
            phase: previousState.phase,
            week: previousState.week,
          },
        });

        if (isMountedRef.current) {
          setSyncStatus('error');
          setError(getUserErrorMessage(err, 'gameplay_state'));
        }

        return { success: false };
      }
    },
    [gameplayWriteConnection, gameState, gameStatePda, program, registerWsListener, raceWsVsFetch]
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
        await closeGameState(gameplayWriteConnection, program, gameStatePda, sessionSignerKeypair);

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
    [gameplayWriteConnection, gameStatePda, program]
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

  // WebSocket subscription for real-time GameState updates.
  // Replaces polling-based refresh — the ER pushes state changes via WS,
  // eliminating an RPC roundtrip per move (~150ms from high-latency locations).
  // Also does an immediate fetch for initial state (WS only fires on changes).
  useEffect(() => {
    if (!gameStatePda || !program) return;
    let cancelled = false;

    // Set up WS subscription on the read connection (resolved ER validator)
    try {
      wsSubIdRef.current = gameplayReadConnection.onAccountChange(
        gameStatePda,
        (accountInfo) => {
          const decoded = decodeGameStateFromAccountInfo(program, accountInfo.data);
          if (!decoded || cancelled) return;

          if (isMountedRef.current) {
            setGameState(decoded);
            setSyncStatus('synced');
            setLastSyncAt(Date.now());
          }

          // Notify one-shot listeners (from move/triggerBoss/updateStat)
          wsListenersRef.current.forEach((fn) => fn(decoded));
          wsListenersRef.current.clear();
        },
        'processed'
      );
    } catch (err) {
      console.warn('[useGameplayState] WS subscription setup failed:', err);
    }

    // Immediate fetch for initial state + ER propagation retry
    (async () => {
      const state = await fetchGameState(program, gameStatePda);
      if (state && isMountedRef.current && !cancelled) {
        setGameState(state);
        setSyncStatus('synced');
        setLastSyncAt(Date.now());
        return;
      }
      if (cancelled) return;
      // ER propagation delay — retry up to 3 times with 800ms gaps
      for (let attempt = 1; attempt <= 3; attempt++) {
        await new Promise((r) => setTimeout(r, 800));
        if (cancelled) return;
        const retryState = await fetchGameState(program, gameStatePda);
        if (retryState && isMountedRef.current && !cancelled) {
          setGameState(retryState);
          setSyncStatus('synced');
          setLastSyncAt(Date.now());
          return;
        }
      }
    })();

    return () => {
      cancelled = true;
      wsListenersRef.current.clear();
      if (wsSubIdRef.current !== null) {
        void gameplayReadConnection.removeAccountChangeListener(wsSubIdRef.current).catch(() => {});
        wsSubIdRef.current = null;
      }
    };
  }, [gameStatePda, program, gameplayReadConnection]);

  // WebSocket subscription for SessionDiscovery updates.
  // Set up once we know the session PDA (from gameState.session).
  const sessionPdaForDiscovery = gameState?.session;
  useEffect(() => {
    if (!sessionPdaForDiscovery || !gameplayReadConnection) return;
    let cancelled = false;

    const [sdPda] = deriveSessionDiscoveryPda(sessionPdaForDiscovery);
    const mapProgram = createMapGeneratorProgram(gameplayReadConnection);

    try {
      wsDiscoverySubIdRef.current = gameplayReadConnection.onAccountChange(
        sdPda,
        (accountInfo) => {
          if (cancelled) return;
          const decoded = decodeSessionDiscoveryFromAccountInfo(mapProgram, accountInfo.data);
          if (!decoded) return;

          latestDiscoveryRef.current = decoded;
          wsDiscoveryListenersRef.current.forEach((fn) => fn(decoded));
          wsDiscoveryListenersRef.current.clear();
        },
        'processed'
      );
    } catch (err) {
      console.warn('[useGameplayState] Discovery WS subscription setup failed:', err);
    }

    return () => {
      cancelled = true;
      wsDiscoveryListenersRef.current.clear();
      if (wsDiscoverySubIdRef.current !== null) {
        void gameplayReadConnection
          .removeAccountChangeListener(wsDiscoverySubIdRef.current)
          .catch(() => {});
        wsDiscoverySubIdRef.current = null;
      }
    };
  }, [sessionPdaForDiscovery?.toBase58(), gameplayReadConnection]);

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
  return parseWithRetry(() => parseGauntletCombatVisualEvent(connection, signature), {
    label: 'gauntlet visual',
    ...options,
  });
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
