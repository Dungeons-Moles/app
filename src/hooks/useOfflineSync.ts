/**
 * Hook for managing offline progress synchronization.
 *
 * This hook provides functionality to:
 * - Queue run results when offline
 * - Process the queue when connectivity returns
 * - Track sync status and pending items
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Sentry from '@sentry/react-native';
import { AppState, AppStateStatus } from 'react-native';
import {
  queueRunResult,
  getPendingCount,
  processSyncQueue,
  type SyncStatus,
} from '@/services/solana/syncQueue';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { detectConnectivity } from '@/services/solana/connectivity';

interface UseOfflineSyncOptions {
  /** Callback to submit a run result to chain */
  onSyncItem?: (levelReached: number, victory: boolean) => Promise<{ success: boolean }>;
  /** Whether to automatically sync when app comes to foreground */
  autoSyncOnForeground?: boolean;
}

interface UseOfflineSyncReturn {
  /** Number of pending items in the queue */
  pendingCount: number;
  /** Whether a sync operation is in progress */
  isSyncing: boolean;
  /** Last sync status (null if never synced) */
  lastSyncStatus: SyncStatus | null;
  /** Queue a run result for later sync */
  queueResult: (levelReached: number, victory: boolean) => Promise<void>;
  /** Process all pending items */
  syncAll: () => Promise<SyncStatus | null>;
  /** Refresh the pending count */
  refreshPendingCount: () => Promise<void>;
}

export function useOfflineSync(options: UseOfflineSyncOptions = {}): UseOfflineSyncReturn {
  const { onSyncItem, autoSyncOnForeground = true } = options;
  const { wallet } = useWallet();
  const { connection } = useSolanaConnection();

  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncStatus, setLastSyncStatus] = useState<SyncStatus | null>(null);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isMountedRef = useRef(true);
  const syncInFlightRef = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    if (!wallet.address) {
      setPendingCount(0);
      return;
    }
    const count = await getPendingCount(wallet.address);
    if (isMountedRef.current) {
      setPendingCount(count);
    }
  }, [wallet.address]);

  const queueResult = useCallback(
    async (levelReached: number, victory: boolean) => {
      if (!wallet.address) {
        console.warn('Cannot queue run result: wallet not connected');
        return;
      }
      await queueRunResult(wallet.address, levelReached, victory);
      await refreshPendingCount();
    },
    [wallet.address, refreshPendingCount]
  );

  const syncAll = useCallback(async (): Promise<SyncStatus | null> => {
    if (!wallet.address || !onSyncItem) {
      return null;
    }

    // Prevent overlapping drains — concurrent calls would process the same
    // queue items and submit duplicate transactions.
    if (syncInFlightRef.current) {
      return null;
    }

    // Check connectivity before syncing
    const connectivity = await detectConnectivity(connection, wallet.address);
    if (!connectivity.isRpcConnected) {
      console.log('Skipping sync: not connected to RPC');
      return null;
    }

    syncInFlightRef.current = true;
    setIsSyncing(true);

    try {
      const status = await processSyncQueue(wallet.address, onSyncItem);
      if (isMountedRef.current) {
        setLastSyncStatus(status);
        setPendingCount(status.remaining);
      }
      return status;
    } catch (error) {
      console.error('Failed to process sync queue:', error);
      Sentry.captureException(error, { tags: { source: 'useOfflineSync.syncAll' } });
      return null;
    } finally {
      syncInFlightRef.current = false;
      if (isMountedRef.current) {
        setIsSyncing(false);
      }
    }
  }, [wallet.address, onSyncItem, connection]);

  // Refresh pending count when wallet changes
  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  // Auto-sync when app comes to foreground
  useEffect(() => {
    if (!autoSyncOnForeground) {
      return;
    }

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      // Detect transition from background to foreground
      if (
        (appStateRef.current === 'background' || appStateRef.current === 'inactive') &&
        nextAppState === 'active'
      ) {
        // Attempt sync when coming to foreground
        syncAll();
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [autoSyncOnForeground, syncAll]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    pendingCount,
    isSyncing,
    lastSyncStatus,
    queueResult,
    syncAll,
    refreshPendingCount,
  };
}
