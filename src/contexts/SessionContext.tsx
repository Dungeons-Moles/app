import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { useWallet } from './WalletContext';
import { useProfile } from './ProfileContext';
import { useSessionManager } from '@/hooks/useSessionManager';
import { useMapGenerator } from '@/hooks/useMapGenerator';
import type { OnChainGameSession } from '@/services/solana/types/session_manager';
import type { TransactionResult } from '@/types/solana';

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

  // Fetch session when wallet connects
  useEffect(() => {
    if (wallet.isConnected && wallet.publicKey) {
      sessionManager.fetchSession();
    } else {
      sessionManager.resetSession();
      setMapSeed(null);
    }
  }, [wallet.isConnected, wallet.publicKey]);

  // Fetch map seed when session changes
  useEffect(() => {
    if (sessionManager.session) {
      mapGenerator.getMapSeed(sessionManager.session.campaignLevel).then((seed) => {
        setMapSeed(seed);
      });
    } else {
      setMapSeed(null);
    }
  }, [sessionManager.session?.campaignLevel]);

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

  const value: SessionContextType = {
    session: sessionManager.session,
    hasActiveSession: sessionManager.hasActiveSession,
    mapSeed,
    isLoading: sessionManager.isLoading || mapGenerator.isLoading,
    error: sessionManager.error || mapGenerator.error,
    startGame,
    endGame,
    delegateToRollup,
    commitGameState,
    refreshSession,
    getMapSeedForLevel,
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
