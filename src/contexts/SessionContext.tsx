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
import { useBurnerWallet } from '@/hooks/useBurnerWallet';
import { useGameplayState } from '@/hooks/useGameplayState';
import { getGameStatePda } from '@/services/solana/gameplayState';
import { deriveGeneratedMapPda, deriveSessionPda } from '@/services/solana/constants';
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
  removeCleanup,
  updateCleanup,
  incrementRetryCount,
} from '@/services/solana/deferredCleanup';
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
import type { BurnerState } from '@/services/solana/burnerWallet';
import type { BackendCombatLogEntry } from '@/services/solana/types/combat_events';
import type { CombatEnemyInfo } from '@/services/solana/eventParser';
import type { GauntletCombatVisualEvent } from '@/services/solana/gauntlet';

/** Commit interval in milliseconds (30 seconds) */
const COMMIT_INTERVAL_MS = 30_000;

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
  /** Burner wallet state */
  burnerState: BurnerState;
  /** Burner wallet balance in lamports */
  burnerBalance: number;
  /** Whether burner balance is low */
  isBurnerLowBalance: boolean;
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
  /** End session immediately with burner wallet (called after combat death/victory) */
  endSessionWithBurner: () => Promise<TransactionResult>;
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
  /** Move player on-chain (via burner wallet, awaits confirmation) */
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
  /** Trigger boss fight on-chain (via burner wallet) */
  triggerBoss: () => Promise<{
    success: boolean;
    newState?: GameState;
    previousState?: GameState;
    isDead?: boolean;
    combatLog?: BackendCombatLogEntry[];
    gauntletVisual?: GauntletCombatVisualEvent | null;
    signature?: string;
  }>;
  /** Modify player stat on-chain (via burner wallet) */
  modifyPlayerStat: (params: ModifyStatParams) => Promise<{ success: boolean; newValue?: number }>;
  /** Top up burner wallet */
  topUpBurner: (amount?: number) => Promise<boolean>;
  /** Get current burner keypair (for direct use) */
  getBurnerKeypair: () => Keypair | null;
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
  const { wallet, signAndSendTransaction } = useWallet();
  const { connection } = useSolanaConnection();
  const { profile } = useProfile();
  const sessionManager = useSessionManager();
  const mapGenerator = useMapGenerator();
  const burnerWallet = useBurnerWallet();
  const gameplayState = useGameplayState();

  const [mapSeed, setMapSeed] = useState<bigint | null>(null);
  const [isAutoCommitActive, setIsAutoCommitActive] = useState(false);
  const [isWalletDisconnected, setIsWalletDisconnected] = useState(false);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [isSessionListLoading, setIsSessionListLoading] = useState(false);
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

  // Fetch map seed when session changes
  const getMapSeed = mapGenerator.getMapSeed;
  useEffect(() => {
    let isMounted = true;
    if (sessionManager.session) {
      getMapSeed(sessionManager.session.campaignLevel).then((seed) => {
        if (isMounted) {
          setMapSeed(seed);
        }
      });
    } else {
      setMapSeed(null);
    }
    return () => {
      isMounted = false;
    };
  }, [getMapSeed, sessionManager.session?.campaignLevel]);

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
        // Just fetch map seed and ensure burner is ready
        const seed = await mapGenerator.getMapSeed(campaignLevel);
        setMapSeed(seed);

        // If burner wallet doesn't exist locally but we're reusing session,
        // we CANNOT just create a new one because it won't match the on-chain owner.
        // We must attempt to load it again or fail.
        if (!burnerWallet.keypair) {
          console.warn('[SessionContext] Burner wallet missing for active session!');
          // Try one last check
          const recovered = await burnerWallet.checkPendingSession();
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

        // Signal resumption — caller will do full on-chain restore
        return { success: true, isResumed: true, mapSeed: seed };
      }

      // Validate campaign level is unlocked
      if (profile && campaignLevel > profile.currentLevel) {
        console.log('[SessionContext] Level not unlocked');
        return { success: false, error: 'Campaign level not unlocked yet' };
      }

      // Step 1: Create burner wallet and build fund transaction (no signature yet)
      console.log(
        '[SessionContext] Step 1: Creating burner wallet... (current keypair:',
        burnerWallet.keypair?.publicKey.toBase58() ?? 'null',
        ')'
      );
      const burnerResult = await burnerWallet.createWithoutFunding();
      if (!burnerResult) {
        return { success: false, error: 'Failed to create burner wallet' };
      }
      const { keypair: newBurnerKeypair, fundTransaction } = burnerResult;
      console.log(
        '[SessionContext] Burner keypair created:',
        newBurnerKeypair.publicKey.toBase58()
      );

      // Step 2: Build start session transaction with the new burner's public key
      console.log('[SessionContext] Step 2: Building start session transaction...');
      const sessionResult = await sessionManager.buildStartSessionTransaction(
        campaignLevel,
        newBurnerKeypair.publicKey
      );
      if (!sessionResult) {
        await burnerWallet.clear();
        return { success: false, error: 'Failed to build session transaction' };
      }
      const { transaction: sessionTransaction, sessionPda } = sessionResult;

      // Step 3: Combine both transactions into one
      console.log('[SessionContext] Step 3: Combining transactions...');
      const combinedTransaction = new Transaction();

      // Set compute budget FIRST — start_session does heavy CPIs (map gen ~378k CUs alone).
      // Must be the first instruction to avoid wallet-injected compute budgets overriding it.
      combinedTransaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));

      // Add fund burner instruction(s)
      combinedTransaction.add(...fundTransaction.instructions);

      // Add start session instruction(s), filtering out any existing compute budget instructions
      // to avoid duplicates (which would cause the first/lower limit to take effect)
      const COMPUTE_BUDGET_PROGRAM_ID = 'ComputeBudget111111111111111111111111111111';
      const sessionInstructions = sessionTransaction.instructions.filter(
        (ix) => ix.programId.toBase58() !== COMPUTE_BUDGET_PROGRAM_ID
      );
      combinedTransaction.add(...sessionInstructions);

      // Set recent blockhash and fee payer before signing
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      combinedTransaction.recentBlockhash = blockhash;
      combinedTransaction.feePayer = wallet.publicKey ?? undefined;

      // Step 4: Burner wallet must partially sign first (it's a Signer in the program)
      console.log('[SessionContext] Step 4: Burner wallet partially signing transaction...');
      combinedTransaction.partialSign(newBurnerKeypair);

      // Step 5: Sign and send the combined transaction (ONE signature prompt for main wallet!)
      console.log(
        '[SessionContext] Step 5: Requesting main wallet signature for combined transaction...'
      );
      await debugSimulateTransaction('startGame:combined_tx', combinedTransaction);
      try {
        const signature = await signAndSendTransaction(combinedTransaction);
        console.log('[SessionContext] Combined transaction sent:', signature);
        await confirmSignatureWithTimeout(signature);
        console.log('[SessionContext] Combined transaction confirmed');

        // Mark burner as active now that funding is confirmed
        console.log(
          '[SessionContext] Marking burner as active:',
          newBurnerKeypair.publicKey.toBase58()
        );
        await burnerWallet.markAsActive(newBurnerKeypair);
        console.log(
          '[SessionContext] Burner after markAsActive:',
          burnerWallet.keypair?.publicKey.toBase58() ?? 'null (state may not have updated yet)'
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
          logTxDebugError('startGame:combined_tx', txError);
        }

        await burnerWallet.clear();
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

      // Step 6: Fetch the map seed for this level
      // Note: start_session now atomically creates GameState, MapEnemies,
      // PlayerInventory, MapPois, and GeneratedMap via CPI, so no separate
      // initialization step is needed.
      console.log('[SessionContext] Step 6: Fetching map seed...');
      const seed = await mapGenerator.getMapSeed(campaignLevel);
      console.log('[SessionContext] Map seed:', seed?.toString());
      setMapSeed(seed);

      // Step 7: Set GameState PDA so the gameplay hook can start working
      console.log('[SessionContext] Step 7: Setting GameState PDA...');
      if (wallet.publicKey) {
        const [gameStatePda] = getGameStatePda(sessionPda);
        gameplayState.setGameStatePda(gameStatePda);
        console.log('[SessionContext] GameState PDA set:', gameStatePda.toBase58());
      }

      console.log('[SessionContext] startGame complete');
      return { success: true, mapSeed: seed };
    },
    [
      burnerWallet,
      connection,
      gameplayState,
      mapGenerator,
      profile,
      sessionManager,
      signAndSendTransaction,
      confirmSignatureWithTimeout,
      debugSimulateTransaction,
      isAccountNotInitializedError,
      logTxDebugError,
      wallet.publicKey,
    ]
  );

  const startDuelGame = useCallback(
    async (): Promise<TransactionResult> => {
      console.log('[SessionContext] startDuelGame called');

      const burnerResult = await burnerWallet.createWithoutFunding();
      if (!burnerResult) {
        return { success: false, error: 'Failed to create burner wallet' };
      }

      const { keypair: newBurnerKeypair, fundTransaction } = burnerResult;

      const sessionResult = await sessionManager.buildStartDuelSessionTransaction(
        newBurnerKeypair.publicKey
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
      combinedTransaction.partialSign(newBurnerKeypair);

      await debugSimulateTransaction('startDuelGame:combined_tx', combinedTransaction);
      try {
        const signature = await signAndSendTransaction(combinedTransaction);
        console.log('[SessionContext] startDuelGame:combined_tx_sent', { signature });
        await confirmSignatureWithTimeout(signature);
        console.log('[SessionContext] startDuelGame:combined_tx_confirmed', { signature });
        await burnerWallet.markAsActive(newBurnerKeypair);
        console.log('[SessionContext] startDuelGame:burner_marked_active');
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
      burnerWallet,
      connection,
      gameplayState,
      sessionManager,
      signAndSendTransaction,
      wallet.publicKey,
      fetchSessionGeneratedSeed,
      confirmSignatureWithTimeout,
      debugSimulateTransaction,
      isAccountNotInitializedError,
      logTxDebugError,
    ]
  );

  const startGauntletGame = useCallback(
    async (): Promise<TransactionResult> => {
      console.log('[SessionContext] startGauntletGame called');

      const burnerResult = await burnerWallet.createWithoutFunding();
      if (!burnerResult) {
        return { success: false, error: 'Failed to create burner wallet' };
      }

      const { keypair: newBurnerKeypair, fundTransaction } = burnerResult;

      const sessionResult = await sessionManager.buildStartGauntletSessionTransaction(
        newBurnerKeypair.publicKey
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
      combinedTransaction.partialSign(newBurnerKeypair);

      await debugSimulateTransaction('startGauntletGame:combined_tx', combinedTransaction);
      try {
        const signature = await signAndSendTransaction(combinedTransaction);
        console.log('[SessionContext] startGauntletGame:combined_tx_sent', { signature });
        await confirmSignatureWithTimeout(signature);
        console.log('[SessionContext] startGauntletGame:combined_tx_confirmed', { signature });
        await burnerWallet.markAsActive(newBurnerKeypair);
        console.log('[SessionContext] startGauntletGame:burner_marked_active');
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

      return { success: true, mapSeed: generatedSeed };
    },
    [
      burnerWallet,
      connection,
      gameplayState,
      sessionManager,
      signAndSendTransaction,
      wallet.publicKey,
      fetchSessionGeneratedSeed,
      confirmSignatureWithTimeout,
      debugSimulateTransaction,
      isAccountNotInitializedError,
      logTxDebugError,
    ]
  );

  /**
   * End session immediately with burner wallet (no user interaction).
   * Called automatically after combat ends in death or final victory.
   * The program validates that game_state.is_dead or game_state.completed is true.
   */
  const endSessionWithBurner = useCallback(async (): Promise<TransactionResult> => {
    if (!burnerWallet.keypair) {
      return { success: false, error: 'Burner wallet not available' };
    }

    console.log('[SessionContext] Ending session with burner wallet...');

    // End the session on-chain (only burner wallet signs)
    const result = await sessionManager.endSession(burnerWallet.keypair);

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

      // Drain burner back to main wallet and clear
      await burnerWallet.drain();
      await burnerWallet.clear();
    }

    return result;
  }, [burnerWallet, sessionManager, wallet.publicKey]);

  /**
   * End game (legacy function for compatibility).
   * Now delegates to endSessionWithBurner.
   */
  const endGame = useCallback(async (): Promise<TransactionResult> => {
    return endSessionWithBurner();
  }, [endSessionWithBurner]);

  const delegateToRollup = useCallback(async (): Promise<TransactionResult> => {
    return sessionManager.delegateSession();
  }, [sessionManager]);

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
   * Move player on-chain via burner wallet.
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
      if (!burnerWallet.keypair) {
        console.error('[SessionContext] movePlayer failed: Burner wallet not available');
        return { success: false };
      }
      console.log(
        '[SessionContext] movePlayer: burner =',
        burnerWallet.keypair.publicKey.toBase58(),
        ', gameStatePda =',
        gameplayState.gameStatePda?.toBase58() ?? 'null',
        ', gameState =',
        gameplayState.gameState ? 'set' : 'null'
      );
      return gameplayState.move(burnerWallet.keypair, params);
    },
    [burnerWallet.keypair, gameplayState]
  );

  /**
   * Trigger boss fight on-chain via burner wallet.
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
    if (!burnerWallet.keypair) {
      console.error('[SessionContext] triggerBoss failed: Burner wallet not available');
      return { success: false };
    }
    return gameplayState.triggerBoss(burnerWallet.keypair);
  }, [burnerWallet.keypair, gameplayState]);

  /**
   * Modify player stat on-chain via burner wallet.
   */
  const modifyPlayerStat = useCallback(
    async (params: ModifyStatParams): Promise<{ success: boolean; newValue?: number }> => {
      if (!burnerWallet.keypair) {
        return { success: false };
      }
      return gameplayState.updateStat(burnerWallet.keypair, params);
    },
    [burnerWallet.keypair, gameplayState]
  );

  /**
   * Top up burner wallet with additional SOL.
   */
  const topUpBurner = useCallback(
    async (amount?: number): Promise<boolean> => {
      return burnerWallet.topUp(amount);
    },
    [burnerWallet]
  );

  /**
   * Get current burner keypair for direct use.
   */
  const getBurnerKeypair = useCallback((): Keypair | null => {
    return burnerWallet.keypair;
  }, [burnerWallet.keypair]);

  // Track pending cleanups state
  const [hasPendingCleanupsState, setHasPendingCleanupsState] = useState(false);

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
        if (onChainLevel !== null) {
          sessionManager.setActiveOnChainLevel(onChainLevel);
        }

        // If burner wallet doesn't exist, we need to recover or fail
        if (!burnerWallet.keypair) {
          const recovered = await burnerWallet.checkPendingSession();
          if (!recovered) {
            return {
              success: false,
              error: 'Burner wallet not available. Please reconnect your wallet.',
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
      burnerWallet,
      connection,
      fetchSessionGeneratedSeed,
      gameplayState,
      sessionManager,
      wallet.publicKey,
      refreshSessionList,
    ]
  );

  // Derive current level from session
  const currentLevel = sessionManager.session?.campaignLevel ?? null;

  // Compute session key (base58 string) for persistence
  const sessionKey = useMemo(() => {
    if (!wallet.publicKey || !sessionManager.session?.campaignLevel) {
      return null;
    }
    const [sessionPda] = deriveSessionPda(wallet.publicKey, sessionManager.session.campaignLevel);
    return sessionPda.toBase58();
  }, [wallet.publicKey, sessionManager.session?.campaignLevel]);

  /**
   * Queue session cleanup for deferred processing.
   * This returns immediately without requiring any signatures,
   * allowing instant navigation after combat ends.
   */
  const queueEndGame = useCallback(
    async (levelReached: number, isVictory: boolean): Promise<void> => {
      if (!wallet.address) {
        console.warn('[SessionContext] Cannot queue cleanup: no wallet address');
        return;
      }

      const campaignLevel = sessionManager.session?.campaignLevel ?? 0;

      console.log('[SessionContext] Queueing deferred cleanup:', {
        walletAddress: wallet.address,
        campaignLevel,
        levelReached,
        isVictory,
      });

      await queueCleanup({
        walletAddress: wallet.address,
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

      // Clear burner wallet locally (funds will be recovered later)
      await burnerWallet.clear();

      console.log('[SessionContext] Cleanup queued, local state cleared');
    },
    [
      wallet.address,
      wallet.publicKey,
      sessionManager.session?.campaignLevel,
      sessionManager.hasActiveSession,
      burnerWallet,
    ]
  );

  /**
   * Process pending cleanup tasks.
   * This attempts to end sessions and record results for any queued cleanups.
   */
  const processPendingCleanups = useCallback(async (): Promise<void> => {
    if (!wallet.address) {
      return;
    }

    const pending = await getPendingCleanups(wallet.address);
    if (pending.length === 0) {
      setHasPendingCleanupsState(false);
      return;
    }

    console.log('[SessionContext] Processing pending cleanups:', pending.length);

    for (const cleanup of pending) {
      try {
        let allComplete = true;

        // Session ending is now done immediately with burner wallet after combat.
        // If it failed there, the burner keypair is already cleared and we can't retry here.
        // Mark as complete since we can't do anything about it now.
        if (cleanup.needsSessionEnd) {
          console.warn(
            '[SessionContext] Deferred session end skipped - burner wallet no longer available.',
            'Session should have been ended immediately after combat.',
            cleanup.id
          );
          // Mark as not needing session end - the session may still be open on-chain
          // but we can't close it without the burner wallet
          await updateCleanup(cleanup.id, { needsSessionEnd: false });
        }

        // Try to record the run result if needed
        // Note: recordRunResult is handled by ProfileContext, not here
        // We just mark it as complete since the queueing is for the session end
        if (cleanup.needsResultRecord && allComplete) {
          // The run result recording is deferred to ProfileContext's offline sync
          // Just mark this cleanup as not needing result recording
          await updateCleanup(cleanup.id, { needsResultRecord: false });
        }

        // If everything completed, remove the cleanup
        if (allComplete && !cleanup.needsSessionEnd) {
          await removeCleanup(cleanup.id);
          console.log('[SessionContext] Cleanup completed:', cleanup.id);
        }
      } catch (error) {
        console.error('[SessionContext] Error processing cleanup:', cleanup.id, error);
        await incrementRetryCount(cleanup.id);
      }
    }

    // Check if there are still pending cleanups
    const remaining = await getPendingCleanups(wallet.address);
    setHasPendingCleanupsState(remaining.length > 0);
  }, [wallet.address, sessionManager]);

  // Process pending cleanups on wallet connect
  // This handles deferred session endings (from combat deaths or final boss victories)
  useEffect(() => {
    if (wallet.address) {
      getPendingCleanups(wallet.address).then((pending) => {
        setHasPendingCleanupsState(pending.length > 0);
        if (pending.length > 0) {
          console.log(
            '[SessionContext] Found pending cleanups on connect, processing:',
            pending.length
          );
          // Process cleanups automatically when wallet connects
          processPendingCleanups().catch((err) => {
            console.warn('[SessionContext] Failed to process pending cleanups:', err);
          });
        }
      });
    }
  }, [wallet.address, processPendingCleanups]);

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

    const burnerKeypair = burnerWallet.keypair;
    if (!burnerKeypair) {
      return { success: false, error: 'Burner wallet not available' };
    }

    try {
      console.log('[SessionContext] Force abandoning session...', {
        level: session.campaignLevel,
      });

      // Derive the session PDA
      const [sessionPda] = deriveSessionPda(wallet.publicKey, session.campaignLevel);

      // Derive inventory PDA
      const [inventoryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('inventory'), sessionPda.toBuffer()],
        SOLANA_CONFIG.programs.playerInventory
      );

      // Create a program instance for the abandon call
      const { createSessionManagerProgram } = await import('@/services/solana/programs');
      const program = createSessionManagerProgram(connection);

      // Create the abandon session transaction
      const tx = await abandonSessionTx(
        connection,
        program,
        sessionPda,
        inventoryPda,
        wallet.publicKey,
        burnerKeypair.publicKey,
        session.campaignLevel
      );

      // Add compute budget for safety (increased for closing all accounts via CPI)
      tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }));

      // Burner needs to sign (for closing sub-accounts)
      tx.partialSign(burnerKeypair);

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

      // Refresh session list
      await refreshSessionList();

      return { success: true, signature };
    } catch (error) {
      console.error('[SessionContext] Failed to force abandon session:', error);
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
    sessionManager.resetSession,
    burnerWallet.keypair,
    refreshSessionList,
  ]);

  const value: SessionContextType = {
    session: sessionManager.session,
    hasActiveSession: sessionManager.hasActiveSession,
    mapSeed,
    isLoading: sessionManager.isLoading || mapGenerator.isLoading || gameplayState.isLoading,
    error: sessionManager.error || mapGenerator.error || gameplayState.error || burnerWallet.error,
    isWalletDisconnected,
    burnerState: burnerWallet.state,
    burnerBalance: burnerWallet.balance,
    isBurnerLowBalance: burnerWallet.isLowBalance,
    gameplayState: gameplayState.gameState,
    gameplaySyncStatus: gameplayState.syncStatus,
    activeSessions,
    isSessionListLoading,
    currentLevel,
    sessionKey,
    startGame,
    startDuelGame,
    startGauntletGame,
    endGame,
    endSessionWithBurner,
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
    topUpBurner,
    getBurnerKeypair,
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
