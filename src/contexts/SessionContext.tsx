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
import { useWallet } from './WalletContext';
import { useProfile } from './ProfileContext';
import { useSessionManager } from '@/hooks/useSessionManager';
import { useMapGenerator } from '@/hooks/useMapGenerator';
import type { OnChainGameSession } from '@/services/solana/types/session_manager';
import type { TransactionResult } from '@/types/solana';

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
}

interface SessionContextType extends SessionState {
  /** Start a new game session for a campaign level */
  startGame: (campaignLevel: number) => Promise<TransactionResult>;
  /** End the current session (after game over or victory) */
  endGame: () => Promise<TransactionResult>;
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
      // Validate player has available runs
      if (profile && profile.availableRuns <= 0) {
        return { success: false, error: 'No available runs remaining' };
      }

      // Validate campaign level is unlocked
      if (profile && campaignLevel > profile.currentLevel) {
        return { success: false, error: 'Campaign level not unlocked yet' };
      }

      const result = await sessionManager.startSession(campaignLevel);

      if (result.success) {
        // Fetch the map seed for this level
        const seed = await mapGenerator.getMapSeed(campaignLevel);
        setMapSeed(seed);
      }

      return result;
    },
    [mapGenerator, profile, sessionManager]
  );

  const endGame = useCallback(async (): Promise<TransactionResult> => {
    const result = await sessionManager.endSession();
    if (result.success) {
      setMapSeed(null);
    }
    return result;
  }, [sessionManager]);

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

  const value: SessionContextType = {
    session: sessionManager.session,
    hasActiveSession: sessionManager.hasActiveSession,
    mapSeed,
    isLoading: sessionManager.isLoading || mapGenerator.isLoading,
    error: sessionManager.error || mapGenerator.error,
    isWalletDisconnected,
    startGame,
    endGame,
    delegateToRollup,
    commitGameState,
    refreshSession,
    getMapSeedForLevel,
    verifySeed,
    startAutoCommit,
    stopAutoCommit,
    isAutoCommitActive,
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
