import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  useRef,
  useMemo,
  ReactNode,
} from 'react';
import { Alert } from 'react-native';
import { Keypair, PublicKey, Transaction, ComputeBudgetProgram } from '@solana/web3.js';
import { useWallet } from './WalletContext';
import { useProfile } from './ProfileContext';
import { useSolanaConnection } from './SolanaConnectionContext';
import { useSessionManager } from '@/hooks/useSessionManager';
import { useMapGenerator } from '@/hooks/useMapGenerator';
import { useSessionKey } from '@/hooks/useSessionKey';
import { useGameplayState } from '@/hooks/useGameplayState';
import { getGameStatePda, fetchGameState } from '@/services/solana/gameplayState';
import {
  deriveDuelSessionPda,
  deriveGauntletSessionPda,
  deriveGameStatePda,
  deriveGeneratedMapPda,
  deriveInventoryPda,
  deriveMapEnemiesPda,
  deriveMapPoisPda,
  deriveSessionPda,
} from '@/services/solana/constants';
import { SOLANA_CONFIG } from '@/services/solana/config';
import {
  createMapGeneratorProgram,
  createSessionManagerProgram,
  createGameplayStateProgram,
} from '@/services/solana/programs';
import { fetchGeneratedMap } from '@/services/solana/mapGeneratorClient';
import {
  queueCleanup,
  getPendingCleanups,
  loadCleanupQueue,
  removeCleanup,
  updateCleanup,
  incrementRetryCount,
} from '@/services/solana/deferredCleanup';
import {
  loadSessionSignerWallet,
  drainSessionSignerToMain,
} from '@/services/solana/sessionSigner';
import {
  fetchSessionList,
  checkSessionExists,
  getSessionForLevel,
  type ActiveSession,
} from '@/services/solana/sessionList';
import { abandonSession as abandonSessionTx } from '@/services/solana/sessionBundle';
import { clearFogState, clearBrokenWalls } from '@/services/solana/sessionRestore';
import type { OnChainGameSession } from '@/services/solana/types/session_manager';
import type {
  GameState,
  MovePlayerParams,
  ModifyStatParams,
} from '@/services/solana/types/gameplay_state';
import type { TransactionResult } from '@/types/solana';
import type { SessionSignerState } from '@/services/solana/sessionSigner';
import type { BackendCombatLogEntry } from '@/services/solana/types/combat_events';
import type { CombatEnemyInfo } from '@/services/solana/eventParser';
import type { GauntletCombatVisualEvent } from '@/services/solana/gauntlet';

/** Commit interval in milliseconds (30 seconds) */
const COMMIT_INTERVAL_MS = 30_000;
const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');

// ============================================================================
// Types
// ============================================================================

export interface SessionState {
  /** Current on-chain session (if any) */
  session: OnChainGameSession | null;
  /** Whether player has an active session */
  hasActiveSession: boolean;
  /** Map seed for current campaign level */
  mapSeed: bigint | null;
  /** Whether session operations are in progress */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Warning when wallet disconnects during active session */
  isWalletDisconnected: boolean;
  /** SessionSigner wallet state */
  sessionSignerState: SessionSignerState;
  /** SessionSigner wallet balance in lamports */
  sessionSignerBalance: number;
  /** Whether sessionSigner balance is low */
  isSessionSignerLowBalance: boolean;
  /** On-chain gameplay state */
  gameplayState: GameState | null;
  /** Gameplay sync status */
  gameplaySyncStatus: 'synced' | 'syncing' | 'offline' | 'error';
  /** List of all active sessions across levels */
  activeSessions: ActiveSession[];
  /** Whether session list is loading */
  isSessionListLoading: boolean;
  /** Current session level (convenience accessor) */
  currentLevel: number | null;
  /** Session PDA as base58 string (for persistence keys) */
  sessionKey: string | null;
  /** Active session PDA (campaign, duel, or gauntlet) */
  sessionPda: PublicKey | null;
}

interface SessionContextType extends SessionState {
  /** Start a new game session for a campaign level */
  startGame: (campaignLevel: number) => Promise<TransactionResult>;
  /** Start a new duel session */
  startDuelGame: () => Promise<TransactionResult>;
  /** Start a new gauntlet session */
  startGauntletGame: () => Promise<TransactionResult>;
  /** End the current session (after game over or victory) */
  endGame: () => Promise<TransactionResult>;
  /** End session immediately with session key signer (called after combat death/victory) */
  endSessionWithSessionSigner: () => Promise<TransactionResult>;
  /** Queue session cleanup for later processing (immediate return, no signature needed) */
  queueEndGame: (levelReached: number, isVictory: boolean) => Promise<void>;
  /** Process any pending cleanup tasks */
  processPendingCleanups: () => Promise<void>;
  /** Whether there are pending cleanups */
  hasPendingCleanups: boolean;
  /** Delegate session to MagicBlock (currently stubbed) */
  delegateToRollup: () => Promise<TransactionResult>;
  /** Commit current game state hash to chain */
  commitGameState: (stateHash: number[]) => Promise<TransactionResult>;
  /** Refresh session state from chain */
  refreshSession: () => Promise<void>;
  /** Get the seed to use for map generation */
  getMapSeedForLevel: (level: number) => Promise<bigint | null>;
  /** Verify that a seed matches the on-chain seed for a level */
  verifySeed: (level: number, seed: bigint) => Promise<boolean>;
  /** Start the auto-commit timer for periodic state checkpoints */
  startAutoCommit: (getStateHash: () => number[]) => void;
  /** Stop the auto-commit timer */
  stopAutoCommit: () => void;
  /** Whether auto-commit is currently running */
  isAutoCommitActive: boolean;
  /** Move player on-chain (via session key signer, awaits confirmation) */
  movePlayer: (params: MovePlayerParams) => Promise<{
    success: boolean;
    newState?: GameState;
    previousState?: GameState;
    combatOccurred?: boolean;
    combatLog?: BackendCombatLogEntry[];
    combatEnemyInfo?: CombatEnemyInfo;
    bossFightReady?: boolean;
    isDead?: boolean;
    signature?: string;
  }>;
  /** Trigger boss fight on-chain (via session key signer) */
  triggerBoss: () => Promise<{
    success: boolean;
    newState?: GameState;
    previousState?: GameState;
    isDead?: boolean;
    combatLog?: BackendCombatLogEntry[];
    gauntletVisual?: GauntletCombatVisualEvent | null;
    signature?: string;
  }>;
  /** Modify player stat on-chain (via session key signer) */
  modifyPlayerStat: (params: ModifyStatParams) => Promise<{ success: boolean; newValue?: number }>;
  /** Top up session key signer */
  topUpSessionSigner: (amount?: number) => Promise<boolean>;
  /** Get current session keypair (for direct use) */
  getSessionSignerKeypair: () => Keypair | null;
  /** Refresh the list of all active sessions */
  refreshSessionList: () => Promise<void>;
  /** Switch to a different active session */
  switchToSession: (sessionPda: string) => Promise<TransactionResult>;
  /** Abandon a session (deducts 1 run) */
  abandonSession: (sessionPda: string) => Promise<TransactionResult>;
  /** Force abandon current session (bypasses death/victory requirement, for debugging) */
  forceAbandonCurrentSession: () => Promise<TransactionResult>;
  /** Check if a session exists for a given level */
  hasSessionForLevel: (level: number) => Promise<boolean>;
  /** Get the session PDA for a level if it exists */
  getSessionPdaForLevel: (level: number) => Promise<string | null>;
  /** Set the game state PDA for on-chain operations */
  setGameStatePda: (pda: PublicKey | null) => void;
  /** Refresh on-chain gameplay state (re-fetches from chain) */
  refreshGameplayState: () => Promise<GameState | null>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

export function SessionProvider({ children }: { children: ReactNode }) {
  const { wallet, signAndSendTransaction, signAndSendTransactions } = useWallet();
  const { connection, gameplayConnection, setUseErForGameplay } = useSolanaConnection();
  const { profile } = useProfile();
  const sessionManager = useSessionManager();
  const mapGenerator = useMapGenerator();
  const sessionSigner = useSessionKey();
  const gameplayState = useGameplayState();

  const [mapSeed, setMapSeed] = useState<bigint | null>(null);
  const [isAutoCommitActive, setIsAutoCommitActive] = useState(false);
  const [isWalletDisconnected, setIsWalletDisconnected] = useState(false);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [isSessionListLoading, setIsSessionListLoading] = useState(false);
  const walletId = wallet.address ?? wallet.publicKey?.toBase58() ?? null;
  const commitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const getStateHashRef = useRef<(() => number[]) | null>(null);

  // Monitor wallet connection during active session
  useEffect(() => {
    if (sessionManager.hasActiveSession && !wallet.isConnected) {
      setIsWalletDisconnected(true);
      stopAutoCommit();
      Alert.alert(
        'Wallet Disconnected',
        'Your wallet has disconnected during an active session. Please reconnect to save your progress.',
        [{ text: 'OK' }]
      );
    } else if (wallet.isConnected) {
      setIsWalletDisconnected(false);
    }
  }, [sessionManager.hasActiveSession, wallet.isConnected]);

  // Fetch session when wallet connects
  const { fetchSession, resetSession, hasActiveSession: smHasActive } = sessionManager;
  useEffect(() => {
    if (wallet.isConnected && wallet.publicKey) {
      fetchSession();
    } else {
      // Only reset if we don't have an active session that we want to preserve
      // to allow for reconnection handling
      if (!smHasActive) {
        resetSession();
        setMapSeed(null);
      }
    }
  }, [wallet.isConnected, wallet.publicKey, fetchSession, resetSession, smHasActive]);

  useEffect(() => {
    if (!sessionManager.hasActiveSession || !sessionManager.session) {
      setUseErForGameplay(false);
      return;
    }
    setUseErForGameplay(sessionManager.session.isDelegated);
  }, [
    sessionManager.hasActiveSession,
    sessionManager.session,
    sessionManager.session?.isDelegated,
    setUseErForGameplay,
  ]);

  const fetchSessionGeneratedSeed = useCallback(
    async (sessionPda: PublicKey): Promise<bigint | null> => {
      try {
        const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
        const mapProgram = createMapGeneratorProgram(connection);
        const generatedMap = await fetchGeneratedMap(mapProgram, generatedMapPda);
        return generatedMap?.seed ?? null;
      } catch (err) {
        console.warn('[SessionContext] Failed to fetch generated map seed:', err);
        return null;
      }
    },
    [connection]
  );

  const isGameStateDelegatedOnBase = useCallback(
    async (sessionPda: PublicKey): Promise<boolean> => {
      try {
        const [gameStatePda] = getGameStatePda(sessionPda);
        const info = await connection.getAccountInfo(gameStatePda, 'processed');
        return Boolean(info?.owner.equals(DELEGATION_PROGRAM_ID));
      } catch {
        return false;
      }
    },
    [connection]
  );

  // Always sync map seed from the active session's generated map account.
  // This avoids overwriting PvP sessions with campaign-level map config seeds.
  useEffect(() => {
    let isMounted = true;

    const syncMapSeedFromActiveSession = async () => {
      if (!sessionManager.session) {
        setMapSeed(null);
        return;
      }

      if (!sessionManager.activeSessionPda) {
        return;
      }

      const generatedSeed = await fetchSessionGeneratedSeed(sessionManager.activeSessionPda);
      if (isMounted) {
        setMapSeed(generatedSeed);
      }
    };

    void syncMapSeedFromActiveSession();

    return () => {
      isMounted = false;
    };
  }, [fetchSessionGeneratedSeed, sessionManager.activeSessionPda, sessionManager.session?.sessionId]);

  const confirmSignatureWithTimeout = useCallback(
    async (signature: string, timeoutMs = 15000): Promise<void> => {
      console.log('[SessionContext] confirmSignatureWithTimeout:start', {
        signature,
        timeoutMs,
        commitment: SOLANA_CONFIG.commitment,
      });
      try {
        await connection.confirmTransaction(signature, SOLANA_CONFIG.commitment);
        console.log('[SessionContext] confirmSignatureWithTimeout:confirmTransaction:ok', {
          signature,
        });
        return;
      } catch {
        console.warn('[SessionContext] confirmSignatureWithTimeout:falling_back_to_poll', {
          signature,
        });
        // fall through to status polling
      }

      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const statuses = await connection.getSignatureStatuses([signature]);
        const status = statuses.value[0];
        console.log('[SessionContext] confirmSignatureWithTimeout:poll', {
          signature,
          confirmationStatus: status?.confirmationStatus ?? null,
          hasErr: !!status?.err,
          elapsedMs: Date.now() - start,
        });
        if (status?.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
        }
        if (
          status &&
          (status.confirmationStatus === 'processed' ||
            status.confirmationStatus === 'confirmed' ||
            status.confirmationStatus === 'finalized')
        ) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw new Error('Timed out waiting for transaction confirmation');
    },
    [connection]
  );

  const logTxDebugError = useCallback((label: string, err: unknown) => {
    const e = err as
      | Error
      | {
          message?: string;
          logs?: string[];
          transactionLogs?: string[];
          cause?: unknown;
        };
    const directLogs = Array.isArray((e as { logs?: string[] }).logs)
      ? (e as { logs: string[] }).logs
      : null;
    const txLogs = Array.isArray((e as { transactionLogs?: string[] }).transactionLogs)
      ? (e as { transactionLogs: string[] }).transactionLogs
      : null;
    const causeLogs =
      typeof (e as { cause?: unknown }).cause === 'object' &&
      (e as { cause?: { logs?: string[] } }).cause &&
      Array.isArray(((e as { cause?: { logs?: string[] } }).cause as { logs?: string[] }).logs)
        ? (((e as { cause?: { logs?: string[] } }).cause as { logs?: string[] }).logs ?? null)
        : null;

    console.error(`[SessionContext] ${label}:error`, {
      message: e?.message ?? String(err),
      logs: directLogs,
      transactionLogs: txLogs,
      causeLogs,
      raw: err,
    });
  }, []);

  const debugSimulateTransaction = useCallback(
    async (label: string, transaction: Transaction): Promise<void> => {
      try {
        const sim = await connection.simulateTransaction(transaction);
        if (sim.value.err) {
          console.warn(`[SessionContext] ${label}:simulate:err`, {
            err: sim.value.err,
            logs: sim.value.logs ?? [],
            unitsConsumed: sim.value.unitsConsumed ?? null,
          });
        } else {
          console.log(`[SessionContext] ${label}:simulate:ok`, {
            unitsConsumed: sim.value.unitsConsumed ?? null,
          });
        }
      } catch (simErr) {
        console.warn(`[SessionContext] ${label}:simulate:failed`, simErr);
      }
    },
    [connection]
  );

  const isAccountNotInitializedError = useCallback((err: unknown): boolean => {
    const message = err instanceof Error ? err.message : String(err);
    return (
      message.includes('AccountNotInitialized') ||
      message.includes('custom program error: 0xbc4') ||
      message.includes('custom program error: 0xBC4')
    );
  }, []);

  const getFallbackStateHash = useCallback((): number[] => {
    const stateHash = sessionManager.session?.stateHash
      ? Array.from(sessionManager.session.stateHash)
      : [];
    if (stateHash.length === 32) {
      return stateHash;
    }
    return new Array<number>(32).fill(0);
  }, [sessionManager.session?.stateHash]);

  const ensureDelegatedToRollup = useCallback(async (
    options?: {
      sessionPda?: PublicKey;
      onChainLevel?: number;
      sessionSignerKeypair?: Keypair;
    }
  ): Promise<TransactionResult> => {
    if (sessionManager.session?.isDelegated) {
      setUseErForGameplay(true);
      return { success: true };
    }

    const sessionSignerKeypair = options?.sessionSignerKeypair ?? sessionSigner.keypair;
    if (!sessionSignerKeypair) {
      return { success: false, error: 'Session key signer not available for delegation' };
    }

    const delegateWithOverrides = () =>
      sessionManager.delegateSession(sessionSignerKeypair, {
        sessionPda: options?.sessionPda ?? sessionManager.activeSessionPda ?? undefined,
        onChainLevel: options?.onChainLevel ?? sessionManager.session?.campaignLevel ?? undefined,
      });

    let result = await delegateWithOverrides();
    const initialMessage = result.error?.toLowerCase() ?? '';
    if (!result.success && initialMessage.includes('no active session to delegate')) {
      // Newly-created sessions can hit a short state propagation race; refresh once and retry.
      await sessionManager.fetchSession();
      result = await delegateWithOverrides();
    }

    if (result.success) {
      setUseErForGameplay(true);
      return result;
    }

    const message = result.error?.toLowerCase() ?? '';
    if (message.includes('already delegated')) {
      setUseErForGameplay(true);
      return { success: true, signature: result.signature };
    }

    return result;
  }, [
    sessionManager,
    sessionManager.activeSessionPda,
    sessionManager.session?.campaignLevel,
    sessionSigner.keypair,
    setUseErForGameplay,
  ]);

  const startGame = useCallback(
    async (campaignLevel: number): Promise<TransactionResult> => {
      console.log('[SessionContext] startGame called', {
        campaignLevel,
        hasProfile: !!profile,
        availableRuns: profile?.availableRuns,
        currentLevel: profile?.currentLevel,
      });

      // Validate player has available runs
      if (profile && profile.availableRuns <= 0) {
        console.log('[SessionContext] No available runs');
        return { success: false, error: 'No available sessions remaining' };
      }

      // Check if session already exists on-chain before trying to create a new one
      // session.campaignLevel is 1-indexed (on-chain), campaignLevel arg is 0-indexed (frontend)
      if (sessionManager.session && sessionManager.session.campaignLevel === campaignLevel + 1) {
        console.log('[SessionContext] Session already exists, signaling resume...');
        // Just fetch map seed and ensure sessionSigner is ready
        const seed = await mapGenerator.getMapSeed(campaignLevel);
        setMapSeed(seed);

        // If sessionSigner wallet doesn't exist locally but we're reusing session,
        // we CANNOT just create a new one because it won't match the on-chain owner.
        // We must attempt to load it again or fail.
        if (!sessionSigner.keypair) {
          console.warn('[SessionContext] Session key signer missing for active session!');
          // Try one last check
          const recovered = await sessionSigner.checkPendingSession();
          if (!recovered) {
            return {
              success: false,
              error: 'Session credentials lost. Please reset or abandon run.',
            };
          }
        }

        // Set up GameState PDA for the gameplay state hook
        if (sessionManager.session && wallet.publicKey) {
          const [sessionPda] = deriveSessionPda(
            wallet.publicKey,
            sessionManager.session.campaignLevel
          );
          const [gameStatePda] = getGameStatePda(sessionPda);
          gameplayState.setGameStatePda(gameStatePda);
          console.log(
            '[SessionContext] Restored GameState PDA for existing session:',
            gameStatePda.toBase58()
          );
        }

        const delegateResult = await ensureDelegatedToRollup();
        if (!delegateResult.success) {
          return {
            success: false,
            error: delegateResult.error ?? 'Failed to delegate session to rollup',
          };
        }

        // Signal resumption — caller will do full on-chain restore
        return { success: true, isResumed: true, mapSeed: seed };
      }

      // Validate campaign level is unlocked
      if (profile && campaignLevel > profile.currentLevel) {
        console.log('[SessionContext] Level not unlocked');
        return { success: false, error: 'Campaign level not unlocked yet' };
      }

      // Step 1: Create sessionSigner wallet and build fund transaction (no signature yet)
      console.log(
        '[SessionContext] Step 1: Creating sessionSigner wallet... (current keypair:',
        sessionSigner.keypair?.publicKey.toBase58() ?? 'null',
        ')'
      );
      const sessionSignerResult = await sessionSigner.createWithoutFunding();
      if (!sessionSignerResult) {
        return { success: false, error: 'Failed to create sessionSigner wallet' };
      }
      const { keypair: newSessionSignerKeypair, fundTransaction } = sessionSignerResult;
      console.log(
        '[SessionContext] SessionSigner keypair created:',
        newSessionSignerKeypair.publicKey.toBase58()
      );

      // Step 2: Build start session transaction with the new sessionSigner's public key
      console.log('[SessionContext] Step 2: Building start session transaction...');
      const sessionResult = await sessionManager.buildStartSessionTransaction(
        campaignLevel,
        newSessionSignerKeypair.publicKey
      );
      if (!sessionResult) {
        await sessionSigner.clear();
        return { success: false, error: 'Failed to build session transaction' };
      }
      const { transaction: sessionTransaction, sessionPda } = sessionResult;

      // Step 3: Build/start transaction only (fund + start), then delegate in a second tx.
      const COMPUTE_BUDGET_PROGRAM_ID = 'ComputeBudget111111111111111111111111111111';
      const sessionInstructions = sessionTransaction.instructions.filter(
        (ix) => ix.programId.toBase58() !== COMPUTE_BUDGET_PROGRAM_ID
      );
      const startTx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_200_000 })
      );
      startTx.add(...fundTransaction.instructions);
      startTx.add(...sessionInstructions);
      const startBh = await connection.getLatestBlockhash('confirmed');
      startTx.recentBlockhash = startBh.blockhash;
      startTx.feePayer = wallet.publicKey ?? undefined;

      // Step 4: SessionSigner wallet partially signs start transaction.
      console.log('[SessionContext] Step 4: SessionSigner wallet partially signing start tx...');
      startTx.partialSign(newSessionSignerKeypair);

      // Step 5: Wallet signs/sends start transaction.
      console.log('[SessionContext] Step 5: Requesting main wallet signature for start tx...');
      await debugSimulateTransaction('startGame:start_tx', startTx);
      try {
        const [startSignature] = await signAndSendTransactions(
          [startTx],
          {
            connection,
            skipPreflight: true,
          }
        );
        console.log('[SessionContext] startGame:start_tx_sent', { signature: startSignature });
        await confirmSignatureWithTimeout(startSignature);
        console.log('[SessionContext] startGame:start_tx_confirmed', {
          signature: startSignature,
        });

        // Mark sessionSigner as active now that funding is confirmed
        console.log(
          '[SessionContext] Marking sessionSigner as active:',
          newSessionSignerKeypair.publicKey.toBase58()
        );
        await sessionSigner.markAsActive(newSessionSignerKeypair);
        console.log(
          '[SessionContext] SessionSigner after markAsActive:',
          sessionSigner.keypair?.publicKey.toBase58() ?? 'null (state may not have updated yet)'
        );

        // Fetch the created session
        await sessionManager.fetchSession();
      } catch (txError: unknown) {
        // Check for session_counter not initialized error (Code 3012)
        // This is common on devnet/testnet if the program hasn't been initialized by an admin
        const error = txError as { message?: string; logs?: string[] };
        const isCounterUninitialized =
          isAccountNotInitializedError(txError) ||
          (Array.isArray(error?.logs) &&
            error.logs.some(
              (log: string) =>
                log.includes('Error Code: AccountNotInitialized') && log.includes('session_counter')
            ));

        if (isCounterUninitialized) {
          console.warn(
            '[SessionContext] Session counter not initialized on-chain. Falling back to offline mode.'
          );
        } else {
          logTxDebugError('startGame:start_tx', txError);
        }

        await sessionSigner.clear();
        return {
          success: false,
          error:
            txError instanceof Error
              ? txError.message
              : isCounterUninitialized
                ? 'Session counter not initialized'
                : 'Transaction failed',
        };
      }

      // Step 6: Delegate all runtime accounts after session creation.
      const delegateResult = await sessionManager.delegateSession(newSessionSignerKeypair, {
        sessionPda,
        onChainLevel: campaignLevel + 1,
      });
      if (!delegateResult.success) {
        logTxDebugError('startGame:delegate_tx', delegateResult.error);
        await sessionSigner.clear();
        return {
          success: false,
          error: delegateResult.error ?? 'Delegation transaction failed after session creation',
        };
      }

      // Step 7: Fetch the map seed for this level
      // Note: start_session now atomically creates GameState, MapEnemies,
      // PlayerInventory, MapPois, and GeneratedMap via CPI, so no separate
      // initialization step is needed.
      console.log('[SessionContext] Step 7: Fetching map seed...');
      const seed = await mapGenerator.getMapSeed(campaignLevel);
      console.log('[SessionContext] Map seed:', seed?.toString());
      setMapSeed(seed);

      // Step 8: Set GameState PDA so the gameplay hook can start working
      console.log('[SessionContext] Step 8: Setting GameState PDA...');
      if (wallet.publicKey) {
        const [gameStatePda] = getGameStatePda(sessionPda);
        gameplayState.setGameStatePda(gameStatePda);
        console.log('[SessionContext] GameState PDA set:', gameStatePda.toBase58());
      }

      console.log('[SessionContext] startGame complete');
      return { success: true, mapSeed: seed };
    },
    [
      sessionSigner,
      connection,
      gameplayState,
      mapGenerator,
      profile,
      sessionManager,
      signAndSendTransaction,
      signAndSendTransactions,
      confirmSignatureWithTimeout,
      debugSimulateTransaction,
      ensureDelegatedToRollup,
      isAccountNotInitializedError,
      logTxDebugError,
      wallet.publicKey,
    ]
  );

  const startDuelGame = useCallback(
    async (): Promise<TransactionResult> => {
      console.log('[SessionContext] startDuelGame called');

      const sessionSignerResult = await sessionSigner.createWithoutFunding();
      if (!sessionSignerResult) {
        return { success: false, error: 'Failed to create sessionSigner wallet' };
      }

      const { keypair: newSessionSignerKeypair, fundTransaction } = sessionSignerResult;

      const sessionResult = await sessionManager.buildStartDuelSessionTransaction(
        newSessionSignerKeypair.publicKey
      );

      if (!sessionResult) {
        return { success: false, error: 'Failed to build duel session transaction' };
      }

      const { transaction: sessionTransaction, sessionPda } = sessionResult;
      const combinedTransaction = new Transaction();
      combinedTransaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
      combinedTransaction.add(...fundTransaction.instructions);

      const COMPUTE_BUDGET_PROGRAM_ID = 'ComputeBudget111111111111111111111111111111';
      const sessionInstructions = sessionTransaction.instructions.filter(
        (ix) => ix.programId.toBase58() !== COMPUTE_BUDGET_PROGRAM_ID
      );
      combinedTransaction.add(...sessionInstructions);

      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      combinedTransaction.recentBlockhash = blockhash;
      combinedTransaction.feePayer = wallet.publicKey ?? undefined;
      combinedTransaction.partialSign(newSessionSignerKeypair);

      await debugSimulateTransaction('startDuelGame:combined_tx', combinedTransaction);
      try {
        const signature = await signAndSendTransaction(combinedTransaction);
        console.log('[SessionContext] startDuelGame:combined_tx_sent', { signature });
        await confirmSignatureWithTimeout(signature);
        console.log('[SessionContext] startDuelGame:combined_tx_confirmed', { signature });
        await sessionSigner.markAsActive(newSessionSignerKeypair);
        console.log('[SessionContext] startDuelGame:sessionSigner_marked_active');
        await sessionManager.fetchSession();
        console.log('[SessionContext] startDuelGame:session_fetched');
      } catch (txError: unknown) {
        logTxDebugError('startDuelGame:combined_tx', txError);
        if (isAccountNotInitializedError(txError)) {
          return {
            success: false,
            error:
              'Session manager is not initialized on this validator (AccountNotInitialized / 0xbc4). Run init first.',
          };
        }
        return {
          success: false,
          error: txError instanceof Error ? txError.message : 'Duel session transaction failed',
        };
      }

      const generatedSeed = await fetchSessionGeneratedSeed(sessionPda);
      console.log('[SessionContext] startDuelGame:generated_seed', {
        generatedSeed: generatedSeed?.toString() ?? null,
      });
      setMapSeed(generatedSeed);

      if (wallet.publicKey) {
        const [gameStatePda] = getGameStatePda(sessionPda);
        gameplayState.setGameStatePda(gameStatePda);
      }

      return { success: true, mapSeed: generatedSeed };
    },
    [
      sessionSigner,
      connection,
      gameplayState,
      sessionManager,
      signAndSendTransaction,
      wallet.publicKey,
      fetchSessionGeneratedSeed,
      confirmSignatureWithTimeout,
      debugSimulateTransaction,
      ensureDelegatedToRollup,
      isAccountNotInitializedError,
      logTxDebugError,
    ]
  );

  const startGauntletGame = useCallback(
    async (): Promise<TransactionResult> => {
      console.log('[SessionContext] startGauntletGame called');

      const sessionSignerResult = await sessionSigner.createWithoutFunding();
      if (!sessionSignerResult) {
        return { success: false, error: 'Failed to create sessionSigner wallet' };
      }

      const { keypair: newSessionSignerKeypair, fundTransaction } = sessionSignerResult;

      const sessionResult = await sessionManager.buildStartGauntletSessionTransaction(
        newSessionSignerKeypair.publicKey
      );

      if (!sessionResult) {
        return { success: false, error: 'Failed to build gauntlet session transaction' };
      }

      const { transaction: sessionTransaction, sessionPda } = sessionResult;
      const combinedTransaction = new Transaction();
      combinedTransaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
      combinedTransaction.add(...fundTransaction.instructions);

      const COMPUTE_BUDGET_PROGRAM_ID = 'ComputeBudget111111111111111111111111111111';
      const sessionInstructions = sessionTransaction.instructions.filter(
        (ix) => ix.programId.toBase58() !== COMPUTE_BUDGET_PROGRAM_ID
      );
      combinedTransaction.add(...sessionInstructions);

      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      combinedTransaction.recentBlockhash = blockhash;
      combinedTransaction.feePayer = wallet.publicKey ?? undefined;
      combinedTransaction.partialSign(newSessionSignerKeypair);

      await debugSimulateTransaction('startGauntletGame:combined_tx', combinedTransaction);
      try {
        const signature = await signAndSendTransaction(combinedTransaction);
        console.log('[SessionContext] startGauntletGame:combined_tx_sent', { signature });
        await confirmSignatureWithTimeout(signature);
        console.log('[SessionContext] startGauntletGame:combined_tx_confirmed', { signature });
        await sessionSigner.markAsActive(newSessionSignerKeypair);
        console.log('[SessionContext] startGauntletGame:sessionSigner_marked_active');
        await sessionManager.fetchSession();
        console.log('[SessionContext] startGauntletGame:session_fetched');
      } catch (txError: unknown) {
        logTxDebugError('startGauntletGame:combined_tx', txError);
        if (isAccountNotInitializedError(txError)) {
          return {
            success: false,
            error:
              'Session manager is not initialized on this validator (AccountNotInitialized / 0xbc4). Run init first.',
          };
        }
        return {
          success: false,
          error: txError instanceof Error ? txError.message : 'Gauntlet session transaction failed',
        };
      }

      const generatedSeed = await fetchSessionGeneratedSeed(sessionPda);
      console.log('[SessionContext] startGauntletGame:generated_seed', {
        generatedSeed: generatedSeed?.toString() ?? null,
      });
      setMapSeed(generatedSeed);

      if (wallet.publicKey) {
        const [gameStatePda] = getGameStatePda(sessionPda);
        gameplayState.setGameStatePda(gameStatePda);
      }

      const delegateResult = await ensureDelegatedToRollup({
        sessionPda,
        onChainLevel: 20,
        sessionSignerKeypair: newSessionSignerKeypair,
      });
      if (!delegateResult.success) {
        return {
          success: false,
          error: delegateResult.error ?? 'Failed to delegate session to rollup',
        };
      }

      return { success: true, mapSeed: generatedSeed };
    },
    [
      sessionSigner,
      connection,
      gameplayState,
      sessionManager,
      signAndSendTransaction,
      wallet.publicKey,
      fetchSessionGeneratedSeed,
      confirmSignatureWithTimeout,
      debugSimulateTransaction,
      ensureDelegatedToRollup,
      isAccountNotInitializedError,
      logTxDebugError,
    ]
  );

  /**
   * End session immediately with session key signer (no user interaction).
   * Called automatically after combat ends in death or final victory.
   * The program validates that game_state.is_dead or game_state.completed is true.
   */
  const endSessionWithSessionSigner = useCallback(async (): Promise<TransactionResult> => {
    if (!sessionSigner.keypair) {
      return { success: false, error: 'Session key signer not available' };
    }

    console.log('[SessionContext] Ending session with session key signer...');
    await sessionManager.fetchSession();
    const sessionPda =
      sessionManager.activeSessionPda ??
      (wallet.publicKey && sessionManager.session?.campaignLevel
        ? deriveSessionPda(wallet.publicKey, sessionManager.session.campaignLevel)[0]
        : null);
    if (!sessionPda) {
      return { success: false, error: 'Active session PDA not available' };
    }

    const sessionAccount = await connection.getAccountInfo(sessionPda, 'processed');
    if (!sessionAccount) {
      return { success: false, error: 'Session account not found on-chain' };
    }

    const sessionOwnedByProgram = sessionAccount.owner.equals(SOLANA_CONFIG.programs.sessionManager);
    const mustUndelegate = !sessionOwnedByProgram || Boolean(sessionManager.session?.isDelegated);
    if (mustUndelegate) {
      const undelegateResult = await sessionManager.undelegateSession(
        getFallbackStateHash(),
        sessionSigner.keypair
      );
      if (!undelegateResult.success) {
        return {
          success: false,
          error: undelegateResult.error ?? 'Failed to undelegate session from rollup',
        };
      }
      setUseErForGameplay(false);

      // Ensure base layer ownership is restored before attempting end_session.
      let restored = false;
      for (let i = 0; i < 20; i += 1) {
        const info = await connection.getAccountInfo(sessionPda, 'processed');
        if (info?.owner.equals(SOLANA_CONFIG.programs.sessionManager)) {
          restored = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!restored) {
        return {
          success: false,
          error: 'Session undelegate not finalized yet; please retry in a moment',
        };
      }
    }

    // End the session on-chain (only session signer signs)
    const result = await sessionManager.endSession(sessionSigner.keypair);

    if (result.success) {
      console.log('[SessionContext] Session ended successfully');

      // Clear local state
      setMapSeed(null);

      // Clear fog and broken walls
      if (wallet.publicKey && sessionManager.session?.campaignLevel) {
        const [sessionPda] = deriveSessionPda(
          wallet.publicKey,
          sessionManager.session.campaignLevel
        );
        const sessionKeyStr = sessionPda.toBase58();
        await clearFogState(sessionKeyStr);
        await clearBrokenWalls(sessionKeyStr);
      }

      // Drain/clear in background so post-combat navigation is not blocked.
      void (async () => {
        try {
          await sessionSigner.drain();
        } catch (drainErr) {
          console.warn('[SessionContext] Background drain failed:', drainErr);
        } finally {
          await sessionSigner.clear();
        }
      })();
      setUseErForGameplay(false);
    }

    return result;
  }, [
    sessionSigner,
    getFallbackStateHash,
    sessionManager,
    setUseErForGameplay,
    wallet.publicKey,
    connection,
  ]);

  /**
   * End game (legacy function for compatibility).
   * Now delegates to endSessionWithSessionSigner.
   */
  const endGame = useCallback(async (): Promise<TransactionResult> => {
    return endSessionWithSessionSigner();
  }, [endSessionWithSessionSigner]);

  const delegateToRollup = useCallback(async (): Promise<TransactionResult> => {
    return ensureDelegatedToRollup();
  }, [ensureDelegatedToRollup]);

  const commitGameState = useCallback(
    async (stateHash: number[]): Promise<TransactionResult> => {
      return sessionManager.commitSession(stateHash);
    },
    [sessionManager]
  );

  const refreshSession = useCallback(async () => {
    await sessionManager.fetchSession();
  }, [sessionManager]);

  const getMapSeedForLevel = useCallback(
    async (level: number): Promise<bigint | null> => {
      return mapGenerator.getMapSeed(level);
    },
    [mapGenerator]
  );

  /**
   * Verifies that a given seed matches the on-chain seed for a specific level.
   * This is used to ensure map generation integrity before starting a game.
   *
   * @param level - Campaign level to verify
   * @param seed - Seed to verify against on-chain value
   * @returns true if seed matches, false otherwise
   */
  const verifySeed = useCallback(
    async (level: number, seed: bigint): Promise<boolean> => {
      try {
        const onChainSeed = await mapGenerator.getMapSeed(level);
        if (onChainSeed === null) {
          // If we can't fetch the on-chain seed, allow the game to proceed
          // This enables offline play with cached seeds
          console.warn('Could not fetch on-chain seed for verification, allowing game to proceed');
          return true;
        }
        return onChainSeed === seed;
      } catch (error) {
        console.error('Seed verification failed:', error);
        // Allow game to proceed on error to enable offline play
        return true;
      }
    },
    [mapGenerator]
  );

  /**
   * Stop the auto-commit timer.
   */
  const stopAutoCommit = useCallback(() => {
    if (commitTimerRef.current) {
      clearInterval(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    getStateHashRef.current = null;
    setIsAutoCommitActive(false);
  }, []);

  /**
   * Start the auto-commit timer for periodic state checkpoints.
   * The timer commits the current state hash to the chain every 30 seconds.
   *
   * @param getStateHash - Function that returns the current game state hash (32 bytes)
   */
  const startAutoCommit = useCallback(
    (getStateHash: () => number[]) => {
      // Stop any existing timer
      stopAutoCommit();

      // Store the state hash getter
      getStateHashRef.current = getStateHash;
      setIsAutoCommitActive(true);

      // Start the interval timer
      commitTimerRef.current = setInterval(async () => {
        if (!getStateHashRef.current || !sessionManager.hasActiveSession) {
          stopAutoCommit();
          return;
        }

        try {
          const stateHash = getStateHashRef.current();
          if (stateHash.length === 32) {
            const result = await sessionManager.commitSession(stateHash);
            if (!result.success) {
              console.warn('Auto-commit failed:', result.error);
            }
          }
        } catch (error) {
          console.error('Auto-commit error:', error);
        }
      }, COMMIT_INTERVAL_MS);
    },
    [sessionManager, stopAutoCommit]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (commitTimerRef.current) {
        clearInterval(commitTimerRef.current);
      }
    };
  }, []);

  /**
   * Move player on-chain via session key signer.
   * On-chain-first: awaits confirmation and returns confirmed state.
   */
  const movePlayer = useCallback(
    async (
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
      if (!sessionSigner.keypair) {
        console.error('[SessionContext] movePlayer failed: Session key signer not available');
        return { success: false };
      }
      console.log(
        '[SessionContext] movePlayer: sessionSigner =',
        sessionSigner.keypair.publicKey.toBase58(),
        ', gameStatePda =',
        gameplayState.gameStatePda?.toBase58() ?? 'null',
        ', gameState =',
        gameplayState.gameState ? 'set' : 'null'
      );
      return gameplayState.move(sessionSigner.keypair, params);
    },
    [sessionSigner.keypair, gameplayState]
  );

  /**
   * Trigger boss fight on-chain via session key signer.
   */
  const triggerBoss = useCallback(async (): Promise<{
    success: boolean;
    newState?: GameState;
    previousState?: GameState;
    isDead?: boolean;
    combatLog?: BackendCombatLogEntry[];
    gauntletVisual?: GauntletCombatVisualEvent | null;
    signature?: string;
  }> => {
    if (!sessionSigner.keypair) {
      console.error('[SessionContext] triggerBoss failed: Session key signer not available');
      return { success: false };
    }
    return gameplayState.triggerBoss(sessionSigner.keypair);
  }, [sessionSigner.keypair, gameplayState]);

  /**
   * Modify player stat on-chain via session key signer.
   */
  const modifyPlayerStat = useCallback(
    async (params: ModifyStatParams): Promise<{ success: boolean; newValue?: number }> => {
      if (!sessionSigner.keypair) {
        return { success: false };
      }
      return gameplayState.updateStat(sessionSigner.keypair, params);
    },
    [sessionSigner.keypair, gameplayState]
  );

  /**
   * Top up session key signer with additional SOL.
   */
  const topUpSessionSigner = useCallback(
    async (amount?: number): Promise<boolean> => {
      return sessionSigner.topUp(amount);
    },
    [sessionSigner]
  );

  /**
   * Get current session keypair for direct use.
   */
  const getSessionSignerKeypair = useCallback((): Keypair | null => {
    return sessionSigner.keypair;
  }, [sessionSigner.keypair]);

  // Track pending cleanups state
  const [hasPendingCleanupsState, setHasPendingCleanupsState] = useState(false);
  const cleanupProcessingRef = useRef(false);

  /**
   * Refresh the list of all active sessions for the player.
   */
  const refreshSessionList = useCallback(async (): Promise<void> => {
    if (!wallet.publicKey || !connection) {
      setActiveSessions([]);
      return;
    }

    setIsSessionListLoading(true);
    try {
      // For now, use direct account fetching since we may not have all programs
      // The sessionList service handles this
      const sessionProgram = createSessionManagerProgram(connection);
      const gameplayProgram = createGameplayStateProgram(connection);
      const sessions = await fetchSessionList(
        connection,
        sessionProgram,
        gameplayProgram,
        wallet.publicKey
      ).catch(() => []);
      setActiveSessions(sessions);
    } catch (error) {
      console.warn('[SessionContext] Failed to fetch session list:', error);
      setActiveSessions([]);
    } finally {
      setIsSessionListLoading(false);
    }
  }, [connection, wallet.publicKey]);

  // Fetch session list when wallet connects
  useEffect(() => {
    if (wallet.isConnected && wallet.publicKey) {
      refreshSessionList();
    } else {
      setActiveSessions([]);
    }
  }, [wallet.isConnected, wallet.publicKey, refreshSessionList]);

  /**
   * Check if a session exists for a specific level.
   */
  const hasSessionForLevel = useCallback(
    async (level: number): Promise<boolean> => {
      if (!wallet.publicKey || !connection) {
        return false;
      }
      return checkSessionExists(connection, wallet.publicKey, level);
    },
    [connection, wallet.publicKey]
  );

  /**
   * Get the session PDA for a level if it exists.
   */
  const getSessionPdaForLevel = useCallback(
    async (level: number): Promise<string | null> => {
      if (!wallet.publicKey || !connection) {
        return null;
      }
      const pda = await getSessionForLevel(connection, wallet.publicKey, level);
      return pda ? pda.toBase58() : null;
    },
    [connection, wallet.publicKey]
  );

  /**
   * Switch to a different active session.
   */
  const switchToSessionFn = useCallback(
    async (sessionPda: string): Promise<TransactionResult> => {
      if (!wallet.publicKey || !connection) {
        return { success: false, error: 'Wallet not connected' };
      }

      try {
        const sessionPubkey = new PublicKey(sessionPda);
        // Infer on-chain level from PDA so SessionManager fetch targets the right session.
        let onChainLevel: number | null = null;
        for (let level = 1; level <= 40; level++) {
          const [candidate] = deriveSessionPda(wallet.publicKey, level);
          if (candidate.equals(sessionPubkey)) {
            onChainLevel = level;
            break;
          }
        }
        if (onChainLevel === null) {
          const [duelSessionPda] = deriveDuelSessionPda(wallet.publicKey);
          const [gauntletSessionPda] = deriveGauntletSessionPda(wallet.publicKey);
          if (duelSessionPda.equals(sessionPubkey) || gauntletSessionPda.equals(sessionPubkey)) {
            onChainLevel = 20;
          }
        }
        sessionManager.setActiveSessionPda(sessionPubkey);
        if (onChainLevel !== null) {
          sessionManager.setActiveOnChainLevel(onChainLevel);
        }

        // If sessionSigner wallet doesn't exist, we need to recover or fail
        if (!sessionSigner.keypair) {
          const recovered = await sessionSigner.checkPendingSession();
          if (!recovered) {
            return {
              success: false,
              error: 'Session key signer not available. Please reconnect your wallet.',
            };
          }
        }

        // Get the session's game state PDA and set it
        const [gameStatePda] = getGameStatePda(sessionPubkey);
        gameplayState.setGameStatePda(gameStatePda);

        // Fetch map seed directly from this session's generated map account.
        const seed = await fetchSessionGeneratedSeed(sessionPubkey);
        setMapSeed(seed);

        // Refresh the session manager to point to this session
        await sessionManager.fetchSession();

        const delegateResult = await ensureDelegatedToRollup({
          sessionPda: sessionPubkey,
          onChainLevel: onChainLevel ?? undefined,
        });
        if (!delegateResult.success) {
          const delegatedOnBase = await isGameStateDelegatedOnBase(sessionPubkey);
          if (delegatedOnBase) {
            setUseErForGameplay(true);
            console.warn(
              '[SessionContext] switchToSession: delegation tx failed but game_state is delegated; continuing in ER mode',
              delegateResult.error
            );
          } else {
            return {
              success: false,
              error: delegateResult.error ?? 'Failed to delegate session to rollup',
            };
          }
        }

        // Refresh session list to update last played time
        await refreshSessionList();

        console.log('[SessionContext] Switched to session:', sessionPda, 'onChainLevel:', onChainLevel);
        return { success: true };
      } catch (error) {
        console.error('[SessionContext] Failed to switch session:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to switch session',
        };
      }
    },
    [
      sessionSigner,
      connection,
      fetchSessionGeneratedSeed,
      gameplayState,
      sessionManager,
      ensureDelegatedToRollup,
      isGameStateDelegatedOnBase,
      wallet.publicKey,
      refreshSessionList,
      setUseErForGameplay,
    ]
  );

  // Derive current level from session
  const currentLevel = sessionManager.session?.campaignLevel ?? null;

  // Use the active session PDA from session manager (handles campaign/duel/gauntlet correctly)
  const activeSessionPda = sessionManager.activeSessionPda ?? null;

  // Compute session key (base58 string) for persistence
  const sessionKey = useMemo(() => {
    return activeSessionPda?.toBase58() ?? null;
  }, [activeSessionPda]);

  /**
   * Queue session cleanup for deferred processing.
   * This returns immediately without requiring any signatures,
   * allowing instant navigation after combat ends.
   */
  const queueEndGame = useCallback(
    async (levelReached: number, isVictory: boolean): Promise<void> => {
      if (!walletId) {
        console.warn('[SessionContext] Cannot queue cleanup: no wallet address');
        return;
      }

      const campaignLevel = sessionManager.session?.campaignLevel ?? 0;

      console.log('[SessionContext] Queueing deferred cleanup:', {
        walletAddress: walletId,
        campaignLevel,
        levelReached,
        isVictory,
      });

      await queueCleanup({
        walletAddress: walletId,
        campaignLevel,
        levelReached,
        isVictory,
        needsSessionEnd: sessionManager.hasActiveSession,
        needsResultRecord: true,
      });

      setHasPendingCleanupsState(true);

      // Clear local session state immediately for better UX
      // The actual on-chain cleanup will happen later
      setMapSeed(null);

      // Clear fog state and broken walls for this session
      // This ensures next playthrough starts fresh
      if (wallet.publicKey && campaignLevel > 0) {
        const [sessionPda] = deriveSessionPda(wallet.publicKey, campaignLevel);
        const sessionKeyStr = sessionPda.toBase58();
        await clearFogState(sessionKeyStr);
        await clearBrokenWalls(sessionKeyStr);
        console.log(
          '[SessionContext] Fog and broken walls cleared for session:',
          sessionKeyStr.slice(0, 8)
        );
      }

      // Keep sessionSigner persisted so deferred cleanup can undelegate/end on next app launch.
      setUseErForGameplay(false);

      console.log('[SessionContext] Cleanup queued, local state cleared');
    },
    [
      walletId,
      wallet.publicKey,
      sessionManager.session?.campaignLevel,
      sessionManager.hasActiveSession,
      sessionSigner,
      setUseErForGameplay,
    ]
  );

  /**
   * Process pending cleanup tasks.
   * This attempts to end sessions and record results for any queued cleanups.
   */
  const processPendingCleanups = useCallback(async (): Promise<void> => {
    if (cleanupProcessingRef.current) {
      console.log('[SessionContext] processPendingCleanups:skip_already_running');
      return;
    }
    cleanupProcessingRef.current = true;

    console.log('[SessionContext] processPendingCleanups:start', {
      walletId,
      hasWalletPubkey: !!wallet.publicKey,
      hasConnection: !!connection,
    });
    try {
      if (!walletId || !wallet.publicKey || !connection) {
        console.log('[SessionContext] processPendingCleanups:early_return:no_wallet_or_connection');
        return;
      }

      let pending = await getPendingCleanups(walletId);
      console.log('[SessionContext] processPendingCleanups:initial_pending_count', pending.length);

      let fullQueue = await loadCleanupQueue();
      const existingCleanupLevels = new Set(
        fullQueue.items
          .filter((item) => item.walletAddress === walletId)
          .map((item) => item.campaignLevel)
      );
      const staleFinishedQueuedLevels = new Set<number>();

      // Discover finished sessions that were never queued (e.g. app navigated away/crashed
      // before queueEndGame ran) and enqueue them for background cleanup.
      try {
        const sessionProgram = createSessionManagerProgram(connection);
        const gameplayProgramBase = createGameplayStateProgram(connection);
        const gameplayProgramEr = createGameplayStateProgram(gameplayConnection);
        const sessions = await fetchSessionList(
          connection,
          sessionProgram,
          gameplayProgramBase,
          wallet.publicKey
        );
        console.log('[SessionContext] processPendingCleanups:session_scan_count', sessions.length);

        for (const sessionInfo of sessions) {
          try {
            const sessionPda = new PublicKey(sessionInfo.sessionPda);
            const [gameStatePda] = getGameStatePda(sessionPda);

            const sessionInfoOnBase = await connection.getAccountInfo(sessionPda, 'processed');
            const delegatedOnBase = !!sessionInfoOnBase?.owner.equals(DELEGATION_PROGRAM_ID);

            // If delegated, prefer ER state first (base can be stale during/after ER gameplay).
            const primaryState = delegatedOnBase
              ? await fetchGameState(gameplayProgramEr, gameStatePda)
              : await fetchGameState(gameplayProgramBase, gameStatePda);
            const secondaryState = primaryState
              ? null
              : delegatedOnBase
                ? await fetchGameState(gameplayProgramBase, gameStatePda)
                : await fetchGameState(gameplayProgramEr, gameStatePda);
            const state = primaryState ?? secondaryState;
            if (!state) {
              console.log(
                '[SessionContext] processPendingCleanups:skip_session_no_decodable_gamestate',
                sessionInfo.sessionPda
              );
              continue;
            }

            const hpIsZeroOrBelow = typeof state.hp === 'number' && state.hp <= 0;
            const isDead = Boolean(state.isDead || hpIsZeroOrBelow);
            const completed = Boolean(state.completed);
            const campaignLevel = sessionInfo.level + 1;
            console.log('[SessionContext] processPendingCleanups:session_status', {
              sessionPda: sessionInfo.sessionPda,
              campaignLevel,
              isDead,
              completed,
              hp: state.hp,
              alreadyQueued: existingCleanupLevels.has(campaignLevel),
              delegatedOnBase,
              stateSource: delegatedOnBase
                ? primaryState
                  ? 'er'
                  : 'base_fallback'
                : primaryState
                  ? 'base'
                  : 'er_fallback',
            });

            if (!isDead && !completed) {
              continue;
            }

            if (existingCleanupLevels.has(campaignLevel)) {
              staleFinishedQueuedLevels.add(campaignLevel);
              continue;
            }

            await queueCleanup({
              walletAddress: walletId,
              campaignLevel,
              levelReached: campaignLevel,
              isVictory: completed && !isDead,
              needsSessionEnd: true,
              needsResultRecord: true,
            });
            console.log('[SessionContext] processPendingCleanups:queued_stale_finished_session', {
              sessionPda: sessionInfo.sessionPda,
              campaignLevel,
            });
            existingCleanupLevels.add(campaignLevel);
          } catch (sessionScanErr) {
            console.warn('[SessionContext] processPendingCleanups:scan_one_session_failed', {
              sessionPda: sessionInfo.sessionPda,
              error: sessionScanErr,
            });
          }
        }

        pending = await getPendingCleanups(walletId);
        if (pending.length === 0 && staleFinishedQueuedLevels.size > 0) {
          fullQueue = await loadCleanupQueue();
          const walletQueueItems = fullQueue.items.filter((item) => item.walletAddress === walletId);
          let revivedCount = 0;
          for (const level of staleFinishedQueuedLevels) {
            const queuedForLevel = walletQueueItems.find(
              (item) => item.campaignLevel === level && item.needsSessionEnd
            );
            if (!queuedForLevel || queuedForLevel.retryCount < 3) {
              continue;
            }
            await updateCleanup(queuedForLevel.id, { retryCount: 0 });
            revivedCount += 1;
            console.log('[SessionContext] processPendingCleanups:revived_exhausted_cleanup', {
              cleanupId: queuedForLevel.id,
              campaignLevel: level,
            });
          }
          if (revivedCount > 0) {
            pending = await getPendingCleanups(walletId);
          }
        }
        console.log('[SessionContext] processPendingCleanups:pending_after_scan', pending.length);
      } catch (scanError) {
        console.warn('[SessionContext] Failed to scan for stale finished sessions:', scanError);
      }

      if (pending.length === 0) {
        setHasPendingCleanupsState(false);
        console.log('[SessionContext] processPendingCleanups:done_no_pending');
        return;
      }

      console.log('[SessionContext] Processing pending cleanups:', pending.length);

      for (const cleanup of pending) {
        try {
          let allComplete = true;
          const isInvalidAccountOwnerError = (errorText: string): boolean =>
            errorText.includes('InvalidAccountOwner');

          if (cleanup.needsSessionEnd) {
            const [sessionPda] = deriveSessionPda(wallet.publicKey, cleanup.campaignLevel);
            sessionManager.setActiveOnChainLevel(cleanup.campaignLevel);
            sessionManager.setActiveSessionPda(sessionPda);

            // Recover session signer from in-memory hook or persisted storage.
            let cleanupSigner = sessionSigner.keypair;
            if (!cleanupSigner) {
              cleanupSigner = await loadSessionSignerWallet(walletId);
            }

            if (!cleanupSigner) {
              allComplete = false;
              console.warn(
                '[SessionContext] Deferred cleanup waiting for recoverable session signer:',
                cleanup.id
              );
            } else {
              await sessionManager.fetchSession();

              const sessionAccount = await connection.getAccountInfo(sessionPda, 'processed');
              if (!sessionAccount) {
                console.log('[SessionContext] Deferred cleanup: session already closed on-chain', {
                  cleanupId: cleanup.id,
                  campaignLevel: cleanup.campaignLevel,
                });
                await removeCleanup(cleanup.id);
                continue;
              }

              const ownerIsDelegationProgram = sessionAccount.owner.equals(DELEGATION_PROGRAM_ID);
              const ownerIsSessionProgram = sessionAccount.owner.equals(
                SOLANA_CONFIG.programs.sessionManager
              );

              console.log('[SessionContext] Deferred cleanup: owner check', {
                cleanupId: cleanup.id,
                sessionPda: sessionPda.toBase58(),
                owner: sessionAccount.owner.toBase58(),
                ownerIsDelegationProgram,
                ownerIsSessionProgram,
              });

              if (ownerIsDelegationProgram) {
                const [gameStatePda] = getGameStatePda(sessionPda);
                const gameStateInfo = await connection.getAccountInfo(gameStatePda, 'processed');
                const gameStateOwner = gameStateInfo?.owner ?? null;
                const gameStateOwnerSupported = !!(
                  gameStateOwner &&
                  (gameStateOwner.equals(SOLANA_CONFIG.programs.gameplayState) ||
                    gameStateOwner.equals(DELEGATION_PROGRAM_ID))
                );
                if (!gameStateOwnerSupported) {
                  console.warn(
                    '[SessionContext] Deferred cleanup: dropping legacy incompatible cleanup',
                    {
                      cleanupId: cleanup.id,
                      sessionPda: sessionPda.toBase58(),
                      gameStatePda: gameStatePda.toBase58(),
                      gameStateOwner: gameStateOwner?.toBase58() ?? null,
                    }
                  );
                  await removeCleanup(cleanup.id);
                  continue;
                }

                const undelegateResult = await sessionManager.undelegateSession(
                  getFallbackStateHash(),
                  cleanupSigner
                );
                if (!undelegateResult.success) {
                  const undelegateError = undelegateResult.error ?? 'Deferred undelegate failed';
                  if (isInvalidAccountOwnerError(undelegateError)) {
                    const postUndelegateInfo = await connection.getAccountInfo(sessionPda, 'processed');
                    if (postUndelegateInfo?.owner.equals(SOLANA_CONFIG.programs.sessionManager)) {
                      console.log(
                        '[SessionContext] Deferred cleanup: undelegate returned InvalidAccountOwner but owner restored; continuing to end session',
                        { cleanupId: cleanup.id }
                      );
                    } else {
                      throw new Error(undelegateError);
                    }
                  } else {
                    throw new Error(undelegateError);
                  }
                }

                let ownerRestored = false;
                for (let i = 0; i < 20; i += 1) {
                  const info = await connection.getAccountInfo(sessionPda, 'processed');
                  if (info?.owner.equals(SOLANA_CONFIG.programs.sessionManager)) {
                    ownerRestored = true;
                    break;
                  }
                  await new Promise((resolve) => setTimeout(resolve, 250));
                }
                if (!ownerRestored) {
                  throw new Error('Deferred undelegate did not restore base owner in time');
                }
              } else if (!ownerIsSessionProgram) {
                console.warn('[SessionContext] Deferred cleanup: unexpected session owner, dropping cleanup', {
                  cleanupId: cleanup.id,
                  owner: sessionAccount.owner.toBase58(),
                });
                await removeCleanup(cleanup.id);
                continue;
              }

              const endResult = await sessionManager.endSession(cleanupSigner);
              if (!endResult.success) {
                const endError = endResult.error ?? 'Deferred end session failed';
                if (
                  endError.includes('No active session to end') ||
                  isInvalidAccountOwnerError(endError)
                ) {
                  const postEndInfo = await connection.getAccountInfo(sessionPda, 'processed');
                  if (!postEndInfo) {
                    console.log(
                      '[SessionContext] Deferred cleanup: end session returned recoverable error but session is already closed',
                      { cleanupId: cleanup.id }
                    );
                    await removeCleanup(cleanup.id);
                    continue;
                  }
                }
                throw new Error(endError);
              }

              try {
                await drainSessionSignerToMain(connection, cleanupSigner, wallet.publicKey);
              } catch (drainErr) {
                console.warn('[SessionContext] Deferred cleanup drain failed:', drainErr);
              }

              await updateCleanup(cleanup.id, { needsSessionEnd: false });
              cleanup.needsSessionEnd = false;
            }
          }

          // Try to record the run result if needed
          // Note: recordRunResult is handled by ProfileContext, not here
          // We just mark it as complete since the queueing is for the session end
          if (cleanup.needsResultRecord && allComplete) {
            // The run result recording is deferred to ProfileContext's offline sync
            // Just mark this cleanup as not needing result recording
            await updateCleanup(cleanup.id, { needsResultRecord: false });
            cleanup.needsResultRecord = false;
          }

          // If everything completed, remove the cleanup
          if (allComplete && !cleanup.needsSessionEnd) {
            await removeCleanup(cleanup.id);
            console.log('[SessionContext] Cleanup completed:', cleanup.id);
          }
        } catch (error) {
          console.error('[SessionContext] Error processing cleanup:', cleanup.id, error);
          const retryCount = await incrementRetryCount(cleanup.id);
          console.warn('[SessionContext] processPendingCleanups:retry_incremented', {
            cleanupId: cleanup.id,
            retryCount,
          });
        }
      }

      // Check if there are still pending cleanups
      const remaining = await getPendingCleanups(walletId);
      setHasPendingCleanupsState(remaining.length > 0);
      console.log('[SessionContext] processPendingCleanups:done_remaining', remaining.length);
    } finally {
      cleanupProcessingRef.current = false;
    }
  }, [
    walletId,
    wallet.publicKey,
    connection,
    gameplayConnection,
    sessionManager,
    sessionSigner.keypair,
    getFallbackStateHash,
  ]);

  // IMPORTANT: pending cleanup processing is intentionally triggered only by Campaign screen focus.

  /**
   * Abandon a session (end it as a defeat, deducting 1 run).
   */
  const abandonSessionFn = useCallback(
    async (sessionPda: string): Promise<TransactionResult> => {
      if (!wallet.publicKey || !connection) {
        return { success: false, error: 'Wallet not connected' };
      }

      try {
        // Find the session
        const session = activeSessions.find((s) => s.sessionPda === sessionPda);
        if (!session) {
          return { success: false, error: 'Session not found' };
        }

        // Queue cleanup for the session (this will end it as a defeat)
        await queueEndGame(session.level, false);

        // Refresh session list
        await refreshSessionList();

        console.log('[SessionContext] Abandoned session:', sessionPda);
        return { success: true };
      } catch (error) {
        console.error('[SessionContext] Failed to abandon session:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to abandon session',
        };
      }
    },
    [activeSessions, connection, wallet.publicKey, refreshSessionList, queueEndGame]
  );

  /**
   * Force abandon the current session by calling the Solana abandon_session instruction.
   * This bypasses the "death or victory" requirement of end_session.
   * Requires main wallet signature.
   */
  const forceAbandonCurrentSession = useCallback(async (): Promise<TransactionResult> => {
    if (!wallet.publicKey || !connection) {
      return { success: false, error: 'Wallet not connected' };
    }

    const session = sessionManager.session;
    if (!session) {
      return { success: false, error: 'No active session' };
    }
    const sessionOwner = session.player;
    if (!wallet.publicKey.equals(sessionOwner)) {
      return {
        success: false,
        error: `Connected wallet does not own this session. Switch to ${sessionOwner.toBase58()}`,
      };
    }

    const sessionSignerKeypair = sessionSigner.keypair;
    if (!sessionSignerKeypair) {
      return { success: false, error: 'Session key signer not available' };
    }

    try {
      console.log('[SessionContext] Force abandoning session...', {
        level: session.campaignLevel,
        sessionOwner: sessionOwner.toBase58(),
        wallet: wallet.publicKey.toBase58(),
      });

      // Use the exact active session PDA (works for campaign/duel/gauntlet).
      const sessionPda = sessionManager.activeSessionPda;
      if (!sessionPda) {
        return { success: false, error: 'Active session PDA not available' };
      }

      // Always undelegate first. `session.isDelegated` can be stale when session decode
      // falls back to metadata, and abandon requires base-owner session accounts.
      const undelegateResult = await sessionManager.undelegateSession(
        getFallbackStateHash(),
        sessionSignerKeypair
      );
      if (!undelegateResult.success) {
        return {
          success: false,
          error: undelegateResult.error ?? 'Failed to undelegate session from rollup',
        };
      }
      setUseErForGameplay(false);

      const [gameStatePda] = deriveGameStatePda(sessionPda);
      const [mapEnemiesPda] = deriveMapEnemiesPda(sessionPda);
      const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
      const [inventoryPda] = deriveInventoryPda(sessionPda);
      const [mapPoisPda] = deriveMapPoisPda(sessionPda);
      const [sessionInfo, gameStateInfo, mapEnemiesInfo, generatedMapInfo, inventoryInfo, mapPoisInfo] =
        await Promise.all([
          connection.getAccountInfo(sessionPda, 'processed'),
          connection.getAccountInfo(gameStatePda, 'processed'),
          connection.getAccountInfo(mapEnemiesPda, 'processed'),
          connection.getAccountInfo(generatedMapPda, 'processed'),
          connection.getAccountInfo(inventoryPda, 'processed'),
          connection.getAccountInfo(mapPoisPda, 'processed'),
        ]);
      const stillDelegated =
        !!sessionInfo?.owner.equals(DELEGATION_PROGRAM_ID) ||
        !!gameStateInfo?.owner.equals(DELEGATION_PROGRAM_ID) ||
        !!mapEnemiesInfo?.owner.equals(DELEGATION_PROGRAM_ID) ||
        !!generatedMapInfo?.owner.equals(DELEGATION_PROGRAM_ID) ||
        !!inventoryInfo?.owner.equals(DELEGATION_PROGRAM_ID) ||
        !!mapPoisInfo?.owner.equals(DELEGATION_PROGRAM_ID);
      console.log('[SessionContext] forceAbandon:post_undelegate_owner_check', {
        sessionPda: sessionPda.toBase58(),
        stillDelegated,
        owners: {
          session: sessionInfo?.owner.toBase58() ?? null,
          gameState: gameStateInfo?.owner.toBase58() ?? null,
          mapEnemies: mapEnemiesInfo?.owner.toBase58() ?? null,
          generatedMap: generatedMapInfo?.owner.toBase58() ?? null,
          inventory: inventoryInfo?.owner.toBase58() ?? null,
          mapPois: mapPoisInfo?.owner.toBase58() ?? null,
        },
      });
      if (stillDelegated) {
        return {
          success: false,
          error: 'Session accounts are still delegated after undelegate; try again in a few seconds',
        };
      }

      // Create a program instance for the abandon call
      const { createSessionManagerProgram } = await import('@/services/solana/programs');
      const program = createSessionManagerProgram(connection);

      // Create the abandon session transaction
      const tx = await abandonSessionTx(
        connection,
        program,
        sessionPda,
        inventoryPda,
        sessionOwner,
        sessionSignerKeypair.publicKey,
        session.campaignLevel
      );

      // Add compute budget for safety (increased for closing all accounts via CPI)
      tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }));

      // SessionSigner needs to sign (for closing sub-accounts)
      tx.partialSign(sessionSignerKeypair);

      // Send via wallet adapter (main wallet signs)
      const signature = await signAndSendTransaction(tx);
      await connection.confirmTransaction(signature, 'confirmed');

      console.log('[SessionContext] Session abandoned successfully:', signature);

      // Derive session key for clearing local state
      const sessionKey = sessionPda.toBase58();

      // Clear local state
      await clearFogState(sessionKey);
      await clearBrokenWalls(sessionKey);
      sessionManager.resetSession();
      await sessionSigner.clear();
      setUseErForGameplay(false);

      // Refresh session list
      await refreshSessionList();

      return { success: true, signature };
    } catch (error) {
      console.error('[SessionContext] Failed to force abandon session:', error);
      try {
        const sessionPda = sessionManager.activeSessionPda;
        if (sessionPda) {
          const [gameStatePda] = deriveGameStatePda(sessionPda);
          const [mapEnemiesPda] = deriveMapEnemiesPda(sessionPda);
          const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
          const [inventoryPda] = deriveInventoryPda(sessionPda);
          const [mapPoisPda] = deriveMapPoisPda(sessionPda);
          const [sessionInfo, gameStateInfo, mapEnemiesInfo, generatedMapInfo, inventoryInfo, mapPoisInfo] =
            await Promise.all([
              connection.getAccountInfo(sessionPda, 'processed'),
              connection.getAccountInfo(gameStatePda, 'processed'),
              connection.getAccountInfo(mapEnemiesPda, 'processed'),
              connection.getAccountInfo(generatedMapPda, 'processed'),
              connection.getAccountInfo(inventoryPda, 'processed'),
              connection.getAccountInfo(mapPoisPda, 'processed'),
            ]);
          const isStillDelegated =
            !!sessionInfo?.owner.equals(DELEGATION_PROGRAM_ID) ||
            !!gameStateInfo?.owner.equals(DELEGATION_PROGRAM_ID) ||
            !!mapEnemiesInfo?.owner.equals(DELEGATION_PROGRAM_ID) ||
            !!generatedMapInfo?.owner.equals(DELEGATION_PROGRAM_ID) ||
            !!inventoryInfo?.owner.equals(DELEGATION_PROGRAM_ID) ||
            !!mapPoisInfo?.owner.equals(DELEGATION_PROGRAM_ID);
          setUseErForGameplay(isStillDelegated);
          console.log('[SessionContext] forceAbandon:reconciled_gameplay_route', {
            sessionPda: sessionPda.toBase58(),
            isStillDelegated,
          });
        }
      } catch (reconcileErr) {
        console.warn('[SessionContext] forceAbandon:failed_to_reconcile_route', reconcileErr);
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to abandon session',
      };
    }
  }, [
    wallet.publicKey,
    signAndSendTransaction,
    connection,
    sessionManager.session,
    sessionManager.activeSessionPda,
    sessionManager.resetSession,
    sessionManager.undelegateSession,
    sessionSigner.keypair,
    refreshSessionList,
    getFallbackStateHash,
    setUseErForGameplay,
  ]);

  const value: SessionContextType = {
    session: sessionManager.session,
    hasActiveSession: sessionManager.hasActiveSession,
    mapSeed,
    isLoading: sessionManager.isLoading || mapGenerator.isLoading || gameplayState.isLoading,
    error: sessionManager.error || mapGenerator.error || gameplayState.error || sessionSigner.error,
    isWalletDisconnected,
    sessionSignerState: sessionSigner.state,
    sessionSignerBalance: sessionSigner.balance,
    isSessionSignerLowBalance: sessionSigner.isLowBalance,
    gameplayState: gameplayState.gameState,
    gameplaySyncStatus: gameplayState.syncStatus,
    activeSessions,
    isSessionListLoading,
    currentLevel,
    sessionKey,
    sessionPda: activeSessionPda,
    startGame,
    startDuelGame,
    startGauntletGame,
    endGame,
    endSessionWithSessionSigner,
    queueEndGame,
    processPendingCleanups,
    hasPendingCleanups: hasPendingCleanupsState,
    delegateToRollup,
    commitGameState,
    refreshSession,
    getMapSeedForLevel,
    verifySeed,
    startAutoCommit,
    stopAutoCommit,
    isAutoCommitActive,
    movePlayer,
    triggerBoss,
    modifyPlayerStat,
    topUpSessionSigner,
    getSessionSignerKeypair,
    refreshSessionList,
    switchToSession: switchToSessionFn,
    abandonSession: abandonSessionFn,
    forceAbandonCurrentSession,
    hasSessionForLevel,
    getSessionPdaForLevel,
    setGameStatePda: gameplayState.setGameStatePda,
    refreshGameplayState: gameplayState.refresh,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
