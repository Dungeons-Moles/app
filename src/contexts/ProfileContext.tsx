import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { usePlayerProfile } from '@/hooks/usePlayerProfile';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { detectConnectivity } from '@/services/solana/connectivity';
import { getUserErrorMessage } from '@/services/solana/errors';
import { getStarterItems, getItemForLevel, type Item } from '@/data/items/all-items';
import { RUN_PRICE_LAMPORTS, RUNS_PER_PURCHASE, TREASURY_PUBKEY } from '@/services/solana/constants';
import type { CombatSpeed } from '@/types';
import type { TransactionResult } from '@/types/solana';

interface ProfileContextType {
  profile: ReturnType<typeof usePlayerProfile>['profile'];
  isLoading: boolean;
  error: string | null;
  exists: boolean;
  isCached: boolean;
  mode: 'online' | 'cached' | 'guest';
  pendingSyncCount: number;
  isSyncing: boolean;
  refresh: () => Promise<void>;
  createProfile: (name: string) => Promise<TransactionResult>;
  recordRunResult: (levelReached: number, victory: boolean) => Promise<TransactionResult>;
  updateName: (name: string) => Promise<TransactionResult>;
  clearProfile: () => Promise<void>;
  updateDefaultCombatSpeed: (speed: CombatSpeed) => Promise<void>;
  updateLastPlayed: () => Promise<void>;
  syncPendingResults: () => Promise<void>;
  /** Login as guest (no wallet connection required) */
  loginAsGuest: () => void;
  /** Purchase 20 runs for 0.001 SOL */
  purchaseRuns: () => Promise<TransactionResult>;
  /** Whether a run purchase is in progress */
  isPurchasing: boolean;
  /** Get all unlocked items for the player */
  unlockedItems: Item[];
  /** Unlock an item (called after completing a level) */
  unlockItem: (itemId: number) => void;
  /** Check if an item is unlocked */
  isItemUnlocked: (itemId: number) => boolean;
  /** Get the item that would be unlocked for a level */
  getRewardForLevel: (level: number) => Item | undefined;
  /** Current available runs (convenience accessor) */
  availableRuns: number;
  /** Highest level unlocked (convenience accessor) */
  highestLevelUnlocked: number;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { wallet, signAndSendTransaction } = useWallet();
  const { connection } = useSolanaConnection();
  const profileApi = usePlayerProfile();
  const [mode, setMode] = React.useState<'online' | 'cached' | 'guest'>('guest');
  const [error, setError] = React.useState<string | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [unlockedItemIds, setUnlockedItemIds] = useState<Set<number>>(new Set());
  const hasFetchedRef = useRef(false);
  const fetchProfileRef = useRef(profileApi.fetchProfile);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Initialize unlocked items from starter items
  useEffect(() => {
    const starterItems = getStarterItems();
    const starterIds = new Set(starterItems.map((item) => item.id));
    setUnlockedItemIds(starterIds);
  }, []);

  // Update unlocked items when profile loads (based on highest level completed)
  useEffect(() => {
    if (profileApi.profile?.currentLevel) {
      const highestLevel = profileApi.profile.currentLevel;
      setUnlockedItemIds((prev) => {
        const newSet = new Set(prev);
        // Unlock items for all completed levels
        for (let level = 1; level < highestLevel; level++) {
          const item = getItemForLevel(level);
          if (item) {
            newSet.add(item.id);
          }
        }
        return newSet;
      });
    }
  }, [profileApi.profile?.currentLevel]);

  // Keep ref updated with latest fetchProfile
  useEffect(() => {
    fetchProfileRef.current = profileApi.fetchProfile;
  }, [profileApi.fetchProfile]);

  const refresh = useCallback(async () => {
    await fetchProfileRef.current();
  }, []);

  // Offline sync hook - syncs queued run results when connectivity returns
  const offlineSync = useOfflineSync({
    onSyncItem: profileApi.recordRunResult,
    autoSyncOnForeground: true,
  });

  // Profile refresh on app foreground (T068)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      // Detect transition from background to foreground
      if (
        (appStateRef.current === 'background' || appStateRef.current === 'inactive') &&
        nextAppState === 'active'
      ) {
        // Refresh profile when coming to foreground
        if (wallet.address && mode !== 'guest') {
          await refresh();
        }
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [wallet.address, mode, refresh]);

  // Only run once per wallet address change
  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!wallet.address) {
        if (isMounted) {
          setMode('guest');
          hasFetchedRef.current = false;
        }
        return;
      }

      // Prevent duplicate fetches for the same wallet
      if (hasFetchedRef.current) {
        return;
      }
      hasFetchedRef.current = true;

      try {
        const connectivity = await detectConnectivity(connection, wallet.address);
        if (isMounted) {
          setMode(connectivity.mode);
        }

        if (connectivity.mode !== 'guest') {
          await fetchProfileRef.current();
        }
      } catch (loadError) {
        if (isMounted) {
          setError(getUserErrorMessage(loadError));
        }
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [connection, wallet.address]);

  const clearProfile = useCallback(async () => {
    setError(null);
    await profileApi.resetProfile();
    hasFetchedRef.current = false;
  }, [profileApi]);

  const updateDefaultCombatSpeed = useCallback(async (_speed: CombatSpeed) => {
    return;
  }, []);

  const updateLastPlayed = useCallback(async () => {
    return;
  }, []);

  const syncPendingResults = useCallback(async () => {
    await offlineSync.syncAll();
  }, [offlineSync]);

  const loginAsGuest = useCallback(() => {
    console.log('[ProfileContext] loginAsGuest called');
    setMode('guest');
    setError(null);
  }, []);

  /**
   * Purchase 20 runs for 0.001 SOL.
   */
  const purchaseRuns = useCallback(async (): Promise<TransactionResult> => {
    // Guest mode: no purchasing
    if (mode === 'guest') {
      return { success: false, error: 'Cannot purchase runs in guest mode' };
    }

    if (!wallet.publicKey || !connection) {
      return { success: false, error: 'Wallet not connected' };
    }

    setIsPurchasing(true);
    try {
      // Check balance first
      const balance = await connection.getBalance(wallet.publicKey);
      const requiredBalance = RUN_PRICE_LAMPORTS + 10_000; // Price + fees

      if (balance < requiredBalance) {
        return {
          success: false,
          error: `Insufficient SOL balance. Need at least ${(requiredBalance / 1e9).toFixed(4)} SOL`,
        };
      }

      // Use the profile API to purchase runs
      // This will call the on-chain purchase_runs instruction
      const result = await profileApi.purchaseRuns?.();
      if (result?.success) {
        // Refresh profile to get updated run count
        await fetchProfileRef.current();
        console.log('[ProfileContext] Runs purchased successfully');
      }
      return result ?? { success: false, error: 'Purchase method not available' };
    } catch (err) {
      console.error('[ProfileContext] Failed to purchase runs:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to purchase runs',
      };
    } finally {
      setIsPurchasing(false);
    }
  }, [mode, wallet.publicKey, connection, profileApi]);

  /**
   * Unlock an item by ID.
   */
  const unlockItem = useCallback((itemId: number) => {
    setUnlockedItemIds((prev) => {
      const newSet = new Set(prev);
      newSet.add(itemId);
      return newSet;
    });
  }, []);

  /**
   * Check if an item is unlocked.
   */
  const isItemUnlocked = useCallback(
    (itemId: number): boolean => {
      return unlockedItemIds.has(itemId);
    },
    [unlockedItemIds]
  );

  /**
   * Get the item that would be unlocked for completing a level.
   */
  const getRewardForLevel = useCallback((level: number): Item | undefined => {
    return getItemForLevel(level);
  }, []);

  // Compute unlocked items list
  const unlockedItems = useMemo((): Item[] => {
    const starterItems = getStarterItems();
    const additionalItems: Item[] = [];

    unlockedItemIds.forEach((id) => {
      // Starter items are already included
      if (id >= 40) {
        const item = getItemForLevel(
          // Find the level that unlocks this item
          Array.from({ length: 40 }, (_, i) => i + 1).find((level) => {
            const levelItem = getItemForLevel(level);
            return levelItem?.id === id;
          }) ?? 0
        );
        if (item) {
          additionalItems.push(item);
        }
      }
    });

    return [...starterItems, ...additionalItems];
  }, [unlockedItemIds]);

  // Convenience accessors
  const availableRuns = profileApi.profile?.availableRuns ?? 0;
  const highestLevelUnlocked = profileApi.profile?.currentLevel ?? 1;

  const handleRecordRunResult = useCallback(
    async (levelReached: number, victory: boolean): Promise<TransactionResult> => {
      // Guest mode: no recording
      if (mode === 'guest') {
        return { success: true };
      }

      // Cached mode: queue result for later sync
      if (mode === 'cached') {
        try {
          await offlineSync.queueResult(levelReached, victory);
          return { success: true };
        } catch (error) {
          return { success: false, error: 'Failed to queue result' };
        }
      }

      // Online mode: try on-chain
      return profileApi.recordRunResult(levelReached, victory);
    },
    [mode, offlineSync, profileApi]
  );

  const value = useMemo(
    () => ({
      profile: profileApi.profile,
      isLoading: profileApi.isLoading,
      error: error ?? profileApi.error,
      exists: profileApi.exists,
      isCached: profileApi.isCached,
      mode,
      pendingSyncCount: offlineSync.pendingCount,
      isSyncing: offlineSync.isSyncing,
      refresh,
      createProfile: profileApi.createProfile,
      recordRunResult: handleRecordRunResult,
      updateName: profileApi.updateName,
      clearProfile,
      updateDefaultCombatSpeed,
      updateLastPlayed,
      syncPendingResults,
      loginAsGuest,
      purchaseRuns,
      isPurchasing,
      unlockedItems,
      unlockItem,
      isItemUnlocked,
      getRewardForLevel,
      availableRuns,
      highestLevelUnlocked,
    }),
    [
      clearProfile,
      error,
      handleRecordRunResult,
      loginAsGuest,
      mode,
      offlineSync.pendingCount,
      offlineSync.isSyncing,
      profileApi,
      refresh,
      syncPendingResults,
      updateDefaultCombatSpeed,
      updateLastPlayed,
      purchaseRuns,
      isPurchasing,
      unlockedItems,
      unlockItem,
      isItemUnlocked,
      getRewardForLevel,
      availableRuns,
      highestLevelUnlocked,
    ]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
}
