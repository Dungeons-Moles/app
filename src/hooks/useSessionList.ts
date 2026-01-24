/**
 * useSessionList - Multi-session management hook
 * T060: Create useSessionList hook in src/hooks/useSessionList.ts (fetch, switch, abandon)
 */

import { useState, useCallback, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '../contexts/WalletContext';
import { useSolanaConnection } from '../contexts/SolanaConnectionContext';
import {
  getSessionCount,
  getActiveLevels,
  checkSessionExists,
  fetchSessionRawData,
} from '../services/solana/sessionList';
import type { ActiveSession, SessionData } from '../services/solana/sessionList';

interface UseSessionListResult {
  /** List of active sessions (levels with active sessions) */
  activeLevels: number[];
  /** Total session count */
  sessionCount: number;
  /** Whether the session list is loading */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Fetch/refresh the session list */
  refresh: () => Promise<void>;
  /** Check if a session exists on a specific level */
  hasSessionOnLevel: (level: number) => Promise<boolean>;
  /** Get raw session data (for advanced use) */
  fetchRawSessionData: (sessionPda: string) => Promise<SessionData | null>;
  /** Abandon a session (deducts run) */
  abandonSession: (sessionPda: string) => Promise<boolean>;
}

export function useSessionList(): UseSessionListResult {
  const { wallet } = useWallet();
  const { connection } = useSolanaConnection();
  const [activeLevels, setActiveLevels] = useState<number[]>([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!wallet.publicKey) {
      setActiveLevels([]);
      setSessionCount(0);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch session count and active levels
      const [count, levels] = await Promise.all([
        getSessionCount(connection, wallet.publicKey),
        getActiveLevels(connection, wallet.publicKey),
      ]);
      setSessionCount(count);
      setActiveLevels(levels);
    } catch (err) {
      console.error('[useSessionList] Failed to fetch sessions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch sessions');
    } finally {
      setIsLoading(false);
    }
  }, [connection, wallet.publicKey]);

  // Fetch sessions on mount and when wallet changes
  useEffect(() => {
    if (wallet.publicKey) {
      refresh();
    }
  }, [wallet.publicKey, refresh]);

  const hasSessionOnLevel = useCallback(
    async (level: number): Promise<boolean> => {
      if (!wallet.publicKey) return false;
      try {
        return await checkSessionExists(connection, wallet.publicKey, level);
      } catch (err) {
        console.error('[useSessionList] Failed to check session:', err);
        return false;
      }
    },
    [connection, wallet.publicKey]
  );

  const fetchRawSessionData = useCallback(
    async (sessionPda: string): Promise<SessionData | null> => {
      try {
        const rawData = await fetchSessionRawData(connection, new PublicKey(sessionPda));
        if (!rawData.sessionAccount || !rawData.gameStateAccount) {
          return null;
        }
        // Return raw data - decoding would require program instances
        // The calling code should decode if needed
        return null; // TODO: Add decoding support when programs are available
      } catch (err) {
        console.error('[useSessionList] Failed to fetch session data:', err);
        return null;
      }
    },
    [connection]
  );

  const abandonSession = useCallback(
    async (sessionPda: string): Promise<boolean> => {
      if (!wallet.publicKey) {
        setError('No wallet connected');
        return false;
      }

      try {
        // TODO: Implement abandon session
        // This should:
        // 1. Call end_session with victory=false
        // 2. Drain remaining SOL from burner
        // 3. Deduct a run from profile
        console.warn('[useSessionList] Abandon session not yet implemented');

        // Refresh session list after abandoning
        await refresh();
        return true;
      } catch (err) {
        console.error('[useSessionList] Failed to abandon session:', err);
        setError(err instanceof Error ? err.message : 'Failed to abandon session');
        return false;
      }
    },
    [wallet.publicKey, refresh]
  );

  return {
    activeLevels,
    sessionCount,
    isLoading,
    error,
    refresh,
    hasSessionOnLevel,
    fetchRawSessionData,
    abandonSession,
  };
}
