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
import { Keypair } from '@solana/web3.js';
import { useWallet } from './WalletContext';
import { useProfile } from './ProfileContext';
import { useSessionManager } from '@/hooks/useSessionManager';
import { useMapGenerator } from '@/hooks/useMapGenerator';
import { useBurnerWallet } from '@/hooks/useBurnerWallet';
import { useGameplayState } from '@/hooks/useGameplayState';
import { deriveGameSessionPda } from '@/services/solana/types';
import {
  queueCleanup,
  getPendingCleanups,
  removeCleanup,
  updateCleanup,
  incrementRetryCount,
  type PendingCleanup,
} from '@/services/solana/deferredCleanup';
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
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

export function SessionProvider({ children }: { children: ReactNode }) {
  const { wallet } = useWallet();
  const { profile } = useProfile();
  const sessionManager = useSessionManager();
  const mapGenerator = useMapGenerator();
  const burnerWallet = useBurnerWallet();
  const gameplayState = useGameplayState();

  const [mapSeed, setMapSeed] = useState<bigint | null>(null);
  const [isAutoCommitActive, setIsAutoCommitActive] = useState(false);
  const [isWalletDisconnected, setIsWalletDisconnected] = useState(false);
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
    if (sessionManager.session) {
      mapGenerator.getMapSeed(sessionManager.session.campaignLevel).then((seed) => {
        setMapSeed(seed);
      });
    } else {
      setMapSeed(null);
    }
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

      // Validate campaign level is unlocked
      if (profile && campaignLevel > profile.currentLevel) {
        console.log('[SessionContext] Level not unlocked');
        return { success: false, error: 'Campaign level not unlocked yet' };
      }

      // Step 1: Create and fund burner wallet (requires main wallet signature)
      console.log('[SessionContext] Step 1: Creating and funding burner wallet...');
      const burnerFunded = await burnerWallet.createAndFund();
      console.log('[SessionContext] Burner funded result:', {
        burnerFunded,
        hasKeypair: !!burnerWallet.keypair,
      });
      if (!burnerFunded || !burnerWallet.keypair) {
        return { success: false, error: 'Failed to create burner wallet' };
      }

      // Step 2: Start the session on-chain
      console.log('[SessionContext] Step 2: Starting session on-chain...');
      const result = await sessionManager.startSession(campaignLevel);
      console.log('[SessionContext] Session start result:', result);
      if (!result.success) {
        // Drain burner if session start failed
        await burnerWallet.drain();
        await burnerWallet.clear();
        return result;
      }

      // Step 3: Fetch the map seed for this level
      console.log('[SessionContext] Step 3: Fetching map seed...');
      const seed = await mapGenerator.getMapSeed(campaignLevel);
      console.log('[SessionContext] Map seed:', seed?.toString());
      setMapSeed(seed);

      // Step 4: Initialize gameplay state on-chain with burner
      console.log('[SessionContext] Step 4: Initializing gameplay state...');
      if (wallet.publicKey) {
        const [sessionPda] = deriveGameSessionPda(wallet.publicKey);
        // Default map dimensions - should be passed from game context in real usage
        const initialized = await gameplayState.initialize(sessionPda, burnerWallet.keypair, {
          mapWidth: 32,
          mapHeight: 32,
          startX: 16,
          startY: 16,
        });

        console.log('[SessionContext] Gameplay state initialized:', initialized);
        if (!initialized) {
          console.warn(
            'Failed to initialize gameplay state, session created without on-chain state'
          );
        }
      }

      console.log('[SessionContext] startGame complete, returning result');
      return result;
    },
    [burnerWallet, gameplayState, mapGenerator, profile, sessionManager, wallet.publicKey]
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
