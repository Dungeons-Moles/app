/**
 * Deferred Cleanup Service
 *
 * Queues session cleanup tasks (endSession, recordRunResult) to be processed
 * in the background or on next app launch. This allows immediate navigation
 * after combat ends without waiting for transaction signatures.
 *
 * The cleanup queue is persisted to storage and processed when:
 * 1. The wallet reconnects
 * 2. The app comes to foreground
 * 3. Explicitly triggered by the user
 */

import * as SecureStorage from '@/services/storage/secureStorage';

// ============================================================================
// Types
// ============================================================================

export interface PendingCleanup {
  /** Unique identifier for this cleanup task */
  id: string;
  /** Wallet address that owns this session */
  walletAddress: string;
  /** Campaign level that was played */
  campaignLevel: number;
  /** Whether the player won (boss victory) */
  isVictory: boolean;
  /** Level reached when run ended */
  levelReached: number;
  /** Timestamp when queued */
  queuedAt: number;
  /** Number of retry attempts */
  retryCount: number;
  /** Whether session is still open (needs endSession call) */
  needsSessionEnd: boolean;
  /** Whether run result needs to be recorded */
  needsResultRecord: boolean;
  /** Session type for correct PDA derivation (defaults to campaign for backwards compat) */
  sessionType?: 'campaign' | 'duel' | 'gauntlet';
  /** Number of times this cleanup has been revived after exhausting retries */
  revivalCount?: number;
}

interface CleanupQueue {
  items: PendingCleanup[];
  lastProcessed: number | null;
}

// ============================================================================
// Constants
// ============================================================================

const CLEANUP_QUEUE_KEY = 'deferred_cleanup_queue';
const MAX_RETRY_COUNT = 3;
const MAX_REVIVAL_COUNT = 2;

// ============================================================================
// Queue Management
// ============================================================================

/**
 * Loads the cleanup queue from storage.
 */
export async function loadCleanupQueue(): Promise<CleanupQueue> {
  try {
    const data = await SecureStorage.getItemAsync(CLEANUP_QUEUE_KEY);
    if (!data) {
      return { items: [], lastProcessed: null };
    }
    return JSON.parse(data) as CleanupQueue;
  } catch (error) {
    console.error('[DeferredCleanup] Failed to load queue:', error);
    return { items: [], lastProcessed: null };
  }
}

/**
 * Saves the cleanup queue to storage.
 */
async function saveCleanupQueue(queue: CleanupQueue): Promise<void> {
  try {
    await SecureStorage.setItemAsync(CLEANUP_QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.error('[DeferredCleanup] Failed to save queue:', error);
  }
}

/**
 * Adds a cleanup task to the queue.
 */
export async function queueCleanup(
  cleanup: Omit<PendingCleanup, 'id' | 'queuedAt' | 'retryCount'>
): Promise<string> {
  const queue = await loadCleanupQueue();

  const id = `cleanup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const newItem: PendingCleanup = {
    ...cleanup,
    id,
    queuedAt: Date.now(),
    retryCount: 0,
  };

  queue.items.push(newItem);
  await saveCleanupQueue(queue);

  console.log('[DeferredCleanup] Queued cleanup:', id);
  return id;
}

/**
 * Removes a cleanup task from the queue (after successful processing).
 */
export async function removeCleanup(id: string): Promise<void> {
  const queue = await loadCleanupQueue();
  queue.items = queue.items.filter((item) => item.id !== id);
  queue.lastProcessed = Date.now();
  await saveCleanupQueue(queue);
  console.log('[DeferredCleanup] Removed cleanup:', id);
}

/**
 * Updates a cleanup task (e.g., after partial completion or retry).
 */
export async function updateCleanup(id: string, updates: Partial<PendingCleanup>): Promise<void> {
  const queue = await loadCleanupQueue();
  const index = queue.items.findIndex((item) => item.id === id);
  if (index >= 0) {
    queue.items[index] = { ...queue.items[index], ...updates };
    await saveCleanupQueue(queue);
  }
}

/**
 * Gets pending cleanups for a specific wallet address.
 */
export async function getPendingCleanups(walletAddress: string): Promise<PendingCleanup[]> {
  const queue = await loadCleanupQueue();
  return queue.items.filter(
    (item) => item.walletAddress === walletAddress && item.retryCount < MAX_RETRY_COUNT
  );
}

/**
 * Checks if there are any pending cleanups.
 */
export async function hasPendingCleanups(walletAddress?: string): Promise<boolean> {
  const queue = await loadCleanupQueue();
  if (walletAddress) {
    return queue.items.some((item) => item.walletAddress === walletAddress);
  }
  return queue.items.length > 0;
}

/**
 * Clears all pending cleanups (use with caution).
 */
export async function clearAllCleanups(): Promise<void> {
  await saveCleanupQueue({ items: [], lastProcessed: Date.now() });
  console.log('[DeferredCleanup] Cleared all cleanups');
}

/**
 * Increments retry count for a cleanup task.
 */
export async function incrementRetryCount(id: string): Promise<number> {
  const queue = await loadCleanupQueue();
  const item = queue.items.find((i) => i.id === id);
  if (item) {
    item.retryCount++;
    await saveCleanupQueue(queue);
    return item.retryCount;
  }
  return 0;
}
