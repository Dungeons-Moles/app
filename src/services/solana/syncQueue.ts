/**
 * Offline Progress Sync Queue
 *
 * Queues run results when offline for later submission when connectivity returns.
 * Uses AsyncStorage to persist the queue across app restarts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const SYNC_QUEUE_KEY = 'solana_sync_queue';

export interface QueuedRunResult {
  /** Unique ID for this queued item */
  id: string;
  /** Wallet address this result belongs to */
  walletAddress: string;
  /** Level reached during the run */
  levelReached: number;
  /** Whether the run was a victory */
  victory: boolean;
  /** Timestamp when the run was completed */
  timestamp: number;
  /** Number of sync attempts */
  attempts: number;
}

interface SyncQueue {
  items: QueuedRunResult[];
  lastSyncAttempt: number | null;
}

/**
 * Get the current sync queue from storage.
 */
export async function getSyncQueue(): Promise<SyncQueue> {
  try {
    const data = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
    if (data) {
      return JSON.parse(data) as SyncQueue;
    }
  } catch (error) {
    console.error('Failed to read sync queue:', error);
  }
  return { items: [], lastSyncAttempt: null };
}

/**
 * Save the sync queue to storage.
 */
async function saveSyncQueue(queue: SyncQueue): Promise<void> {
  try {
    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.error('Failed to save sync queue:', error);
  }
}

/**
 * Add a run result to the sync queue for later submission.
 */
export async function queueRunResult(
  walletAddress: string,
  levelReached: number,
  victory: boolean
): Promise<void> {
  const queue = await getSyncQueue();

  const item: QueuedRunResult = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    walletAddress,
    levelReached,
    victory,
    timestamp: Date.now(),
    attempts: 0,
  };

  queue.items.push(item);
  await saveSyncQueue(queue);
}

/**
 * Get pending items for a specific wallet.
 */
export async function getPendingItems(walletAddress: string): Promise<QueuedRunResult[]> {
  const queue = await getSyncQueue();
  return queue.items.filter((item) => item.walletAddress === walletAddress);
}

/**
 * Remove a successfully synced item from the queue.
 */
export async function removeQueuedItem(itemId: string): Promise<void> {
  const queue = await getSyncQueue();
  queue.items = queue.items.filter((item) => item.id !== itemId);
  await saveSyncQueue(queue);
}

/**
 * Mark a sync attempt for an item (increments attempt counter).
 */
export async function markSyncAttempt(itemId: string): Promise<void> {
  const queue = await getSyncQueue();
  const item = queue.items.find((i) => i.id === itemId);
  if (item) {
    item.attempts += 1;
  }
  queue.lastSyncAttempt = Date.now();
  await saveSyncQueue(queue);
}

/**
 * Clear all items for a wallet (use with caution).
 */
export async function clearWalletQueue(walletAddress: string): Promise<void> {
  const queue = await getSyncQueue();
  queue.items = queue.items.filter((item) => item.walletAddress !== walletAddress);
  await saveSyncQueue(queue);
}

/**
 * Get the count of pending items for a wallet.
 */
export async function getPendingCount(walletAddress: string): Promise<number> {
  const items = await getPendingItems(walletAddress);
  return items.length;
}

/**
 * Check if there are any pending items in the queue.
 */
export async function hasPendingItems(): Promise<boolean> {
  const queue = await getSyncQueue();
  return queue.items.length > 0;
}

/** Maximum number of sync attempts before giving up */
export const MAX_SYNC_ATTEMPTS = 3;

/**
 * Get items that should be retried (under max attempts).
 */
export async function getRetryableItems(walletAddress: string): Promise<QueuedRunResult[]> {
  const items = await getPendingItems(walletAddress);
  return items.filter((item) => item.attempts < MAX_SYNC_ATTEMPTS);
}

/**
 * Sync result callback type - called to submit a queued run result.
 */
export type SyncCallback = (
  levelReached: number,
  victory: boolean
) => Promise<{ success: boolean; error?: string }>;

/**
 * Sync status returned after processing the queue.
 */
export interface SyncStatus {
  synced: number;
  failed: number;
  remaining: number;
}

/**
 * Process all pending items for a wallet using the provided sync callback.
 * Items that exceed MAX_SYNC_ATTEMPTS are removed from the queue.
 *
 * @param walletAddress - Wallet to sync items for
 * @param syncCallback - Function to call for each item to submit to chain
 * @returns Status of the sync operation
 */
export async function processSyncQueue(
  walletAddress: string,
  syncCallback: SyncCallback
): Promise<SyncStatus> {
  const items = await getRetryableItems(walletAddress);
  let synced = 0;
  let failed = 0;

  for (const item of items) {
    try {
      await markSyncAttempt(item.id);
      const result = await syncCallback(item.levelReached, item.victory);

      if (result.success) {
        await removeQueuedItem(item.id);
        synced++;
      } else {
        failed++;
        // If we've hit max attempts, remove the item
        if (item.attempts + 1 >= MAX_SYNC_ATTEMPTS) {
          console.warn(`Sync item ${item.id} exceeded max attempts, removing from queue`);
          await removeQueuedItem(item.id);
        }
      }
    } catch (error) {
      console.error(`Failed to sync item ${item.id}:`, error);
      failed++;
    }
  }

  const remaining = await getPendingCount(walletAddress);

  return { synced, failed, remaining };
}
