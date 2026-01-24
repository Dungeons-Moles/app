import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  useRef,
  ReactNode,
} from 'react';
import { Alert } from 'react-native';
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { useWallet } from './WalletContext';
import { useProfile } from './ProfileContext';
import { useSolanaConnection } from './SolanaConnectionContext';
import { useSessionManager } from '@/hooks/useSessionManager';
import { useMapGenerator, generateMapLocally } from '@/hooks/useMapGenerator';
import { useBurnerWallet } from '@/hooks/useBurnerWallet';
import { useGameplayState } from '@/hooks/useGameplayState';
import {
  initializeGameState,
  getGameStatePda,
  fetchGameState,
} from '@/services/solana/gameplayState';
import {
  createGameplayStateProgramWithProvider,
  createAnchorProvider,
} from '@/services/solana/programs';
import { deriveGameSessionPda } from '@/services/solana/types';
import {
  queueCleanup,
  getPendingCleanups,
  removeCleanup,
  updateCleanup,
  incrementRetryCount,
  type PendingCleanup,
} from '@/services/solana/deferredCleanup';
import {
  fetchSessionList,
  checkSessionExists,
  getSessionForLevel,
  type ActiveSession,
  type SessionData,
} from '@/services/solana/sessionList';
import type { OnChainGameSession } from '@/services/solana/types/session_manager';
import type {
  GameState,
  MovePlayerParams,
  ModifyStatParams,
} from '@/services/solana/types/gameplay_state';
import type { TransactionResult } from '@/types/solana';
import type { BurnerState } from '@/services/solana/burnerWallet';

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
}

interface SessionContextType extends SessionState {
  /** Start a new game session for a campaign level */
  startGame: (campaignLevel: number) => Promise<TransactionResult>;
  /** End the current session (after game over or victory) */
  endGame: () => Promise<TransactionResult>;
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
  /** Move player on-chain (via burner wallet) */
  movePlayer: (params: MovePlayerParams) => Promise<{ success: boolean; newState?: GameState }>;
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
  /** Check if a session exists for a given level */
  hasSessionForLevel: (level: number) => Promise<boolean>;
  /** Get the session PDA for a level if it exists */
  getSessionPdaForLevel: (level: number) => Promise<string | null>;
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
  useEffect(() => {
    if (wallet.isConnected && wallet.publicKey) {
      sessionManager.fetchSession();
    } else {
      // Only reset if we don't have an active session that we want to preserve
      // to allow for reconnection handling
      if (!sessionManager.hasActiveSession) {
        sessionManager.resetSession();
        setMapSeed(null);
      }
    }
  }, [wallet.isConnected, wallet.publicKey, sessionManager]);

  // Fetch map seed when session changes
  useEffect(() => {
    let isMounted = true;
    if (sessionManager.session) {
      mapGenerator.getMapSeed(sessionManager.session.campaignLevel).then((seed) => {
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
  }, [mapGenerator, sessionManager.session?.campaignLevel]);

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
        return { success: false, error: 'No available runs remaining' };
      }

      // Check if session already exists on-chain before trying to create a new one
      if (sessionManager.session && sessionManager.session.campaignLevel === campaignLevel) {
        console.log('[SessionContext] Session already exists, reusing...');
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

        // Initialize gameplay state for reused session if session PDA is available
        if (sessionManager.session && wallet.publicKey) {
          const [sessionPda] = deriveGameSessionPda(wallet.publicKey);
          // Manually derive the GameState PDA and set it in the hook so it can start working
          const [gameStatePda] = getGameStatePda(sessionPda);
          gameplayState.setGameStatePda(gameStatePda);
          console.log(
            '[SessionContext] Restored GameState PDA for existing session:',
            gameStatePda.toBase58()
          );

          // Force fetch the game state directly to bypass hook update latency
          let restoredState = null;
          try {
            // We need a program instance. Since we don't have direct access to the hook's internal program,
            // we'll recreate a temporary one here just for fetching the restore data.
            // This is safer than relying on the hook's state which might not have updated yet.
            if (wallet.publicKey) {
              const provider = createAnchorProvider(connection, {
                publicKey: wallet.publicKey,
                signTransaction: async (tx) => tx,
                signAllTransactions: async (txs) => txs,
              });
              const program = createGameplayStateProgramWithProvider(provider);
              restoredState = await fetchGameState(program, gameStatePda);
              console.log(
                '[SessionContext] Fetched restored state directly:',
                restoredState ? 'Found' : 'Null'
              );
            }
          } catch (e) {
            console.error('[SessionContext] Failed to fetch restored state:', e);
          }

          return { success: true, gameState: restoredState };
        }

        return { success: true };
      }

      // Validate campaign level is unlocked
      if (profile && campaignLevel > profile.currentLevel) {
        console.log('[SessionContext] Level not unlocked');
        return { success: false, error: 'Campaign level not unlocked yet' };
      }

      // Step 1: Create burner wallet and build fund transaction (no signature yet)
      console.log('[SessionContext] Step 1: Creating burner wallet...');
      const burnerResult = await burnerWallet.createWithoutFunding();
      if (!burnerResult) {
        return { success: false, error: 'Failed to create burner wallet' };
      }
      const { keypair: newBurnerKeypair, fundTransaction } = burnerResult;
      console.log(
        '[SessionContext] Burner keypair created:',
        newBurnerKeypair.publicKey.toBase58()
      );

      // Step 2: Build start session transaction (no signature yet)
      console.log('[SessionContext] Step 2: Building start session transaction...');
      const sessionResult = await sessionManager.buildStartSessionTransaction(campaignLevel);
      if (!sessionResult) {
        await burnerWallet.clear();
        return { success: false, error: 'Failed to build session transaction' };
      }
      const { transaction: sessionTransaction, sessionPda } = sessionResult;

      // Step 3: Combine both transactions into one
      console.log('[SessionContext] Step 3: Combining transactions...');
      const combinedTransaction = new Transaction();

      // Add fund burner instruction(s) first
      combinedTransaction.add(...fundTransaction.instructions);

      // Then add start session instruction(s)
      combinedTransaction.add(...sessionTransaction.instructions);

      // Step 4: Sign and send the combined transaction (ONE signature prompt!)
      console.log(
        '[SessionContext] Step 4: Requesting single wallet signature for combined transaction...'
      );
      try {
        const signature = await signAndSendTransaction(combinedTransaction);
        console.log('[SessionContext] Combined transaction sent:', signature);
        await connection.confirmTransaction(signature, 'confirmed');
        console.log('[SessionContext] Combined transaction confirmed');

        // Mark burner as active now that funding is confirmed
        await burnerWallet.markAsActive(newBurnerKeypair);

        // Fetch the created session
        await sessionManager.fetchSession();
      } catch (txError: unknown) {
        // Check for session_counter not initialized error (Code 3012)
        // This is common on devnet/testnet if the program hasn't been initialized by an admin
        const error = txError as { message?: string; logs?: string[] };
        const isCounterUninitialized =
          error?.message?.includes('AccountNotInitialized') ||
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
          console.error('[SessionContext] Combined transaction failed:', txError);
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

      // Step 5: Fetch the map seed for this level
      console.log('[SessionContext] Step 5: Fetching map seed...');
      const seed = await mapGenerator.getMapSeed(campaignLevel);
      console.log('[SessionContext] Map seed:', seed?.toString());
      setMapSeed(seed);

      // Step 6: Initialize gameplay state on-chain with burner
      console.log('[SessionContext] Step 6: Initializing gameplay state...');
      if (wallet.publicKey && seed !== null && seed !== undefined) {
        // Default map dimensions - should be passed from game context in real usage
        try {
          // Determine spawn position based on map generator logic
          // Generate map locally using the seed to find the EXACT spawn point
          const generatedMap = generateMapLocally(Number(seed));
          const startX = generatedMap.spawn.x;
          const startY = generatedMap.spawn.y;

          console.log(`[SessionContext] Map generated locally. Spawn: (${startX}, ${startY})`);

          const initialized = await gameplayState.initialize(sessionPda, newBurnerKeypair, {
            mapWidth: 32,
            mapHeight: 32,
            startX,
            startY,
          });

          console.log('[SessionContext] Gameplay state initialized:', initialized);
          if (!initialized) {
            console.warn(
              'Failed to initialize gameplay state, session created without on-chain state'
            );
          }
        } catch (error) {
          console.warn('[SessionContext] Failed to initialize gameplay state (ignoring):', error);
        }
      }

      console.log('[SessionContext] startGame complete');
      return { success: true };
    },
    [
      burnerWallet,
      connection,
      gameplayState,
      mapGenerator,
      profile,
      sessionManager,
      signAndSendTransaction,
      wallet.publicKey,
    ]
  );

  const endGame = useCallback(async (): Promise<TransactionResult> => {
    // Step 1: Close gameplay state on-chain (if exists)
    if (gameplayState.gameStatePda && burnerWallet.keypair) {
      await gameplayState.close(burnerWallet.keypair);
    }

    // Step 2: End the session on-chain
    const result = await sessionManager.endSession();

    // Step 3: Drain burner back to main wallet
    if (burnerWallet.keypair) {
      await burnerWallet.drain();
      await burnerWallet.clear();
    }

    if (result.success) {
      setMapSeed(null);
    }

    return result;
  }, [burnerWallet, gameplayState, sessionManager]);

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
   */
  const movePlayer = useCallback(
    async (params: MovePlayerParams): Promise<{ success: boolean; newState?: GameState }> => {
      if (!burnerWallet.keypair) {
        return { success: false };
      }
      return gameplayState.move(burnerWallet.keypair, params);
    },
    [burnerWallet.keypair, gameplayState]
  );

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
      const sessions = await fetchSessionList(
        connection,
        null as any, // Program will be created internally if needed
        null as any, // Program will be created internally if needed
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

        // Find the session in our active sessions list
        const session = activeSessions.find((s) => s.sessionPda === sessionPda);
        if (!session) {
          return { success: false, error: 'Session not found' };
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

        // Fetch map seed for this level
        const seed = await mapGenerator.getMapSeed(session.level);
        setMapSeed(seed);

        // Refresh the session manager to point to this session
        await sessionManager.fetchSession();

        // Refresh session list to update last played time
        await refreshSessionList();

        console.log('[SessionContext] Switched to session:', sessionPda, 'level:', session.level);
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
      activeSessions,
      burnerWallet,
      connection,
      gameplayState,
      mapGenerator,
      sessionManager,
      wallet.publicKey,
      refreshSessionList,
    ]
  );

  // Derive current level from session
  const currentLevel = sessionManager.session?.campaignLevel ?? null;

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

      // Clear burner wallet locally (funds will be recovered later)
      await burnerWallet.clear();

      console.log('[SessionContext] Cleanup queued, local state cleared');
    },
    [
      wallet.address,
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

        // Try to end the session if needed
        if (cleanup.needsSessionEnd) {
          console.log('[SessionContext] Ending session for cleanup:', cleanup.id);
          const result = await sessionManager.endSession();
          if (result.success) {
            await updateCleanup(cleanup.id, { needsSessionEnd: false });
          } else {
            console.warn('[SessionContext] Failed to end session:', result.error);
            allComplete = false;
          }
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

  // Check for pending cleanups on wallet connect
  useEffect(() => {
    if (wallet.address) {
      getPendingCleanups(wallet.address).then((pending) => {
        setHasPendingCleanupsState(pending.length > 0);
        if (pending.length > 0) {
          console.log('[SessionContext] Found pending cleanups on connect:', pending.length);
        }
      });
    }
  }, [wallet.address]);

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
    startGame,
    endGame,
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
    modifyPlayerStat,
    topUpBurner,
    getBurnerKeypair,
    refreshSessionList,
    switchToSession: switchToSessionFn,
    abandonSession: abandonSessionFn,
    hasSessionForLevel,
    getSessionPdaForLevel,
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
