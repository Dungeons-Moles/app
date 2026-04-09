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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { usePlayerProfile } from '@/hooks/usePlayerProfile';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { detectConnectivity } from '@/services/solana/connectivity';
import { getUserErrorMessage } from '@/services/solana/errors';
import { getStarterItems, getItemForLevel, type Item } from '@/data/items/all-items';
import {
  RUN_PRICE_LAMPORTS,
  RUNS_PER_PURCHASE,
  TREASURY_PUBKEY,
} from '@/services/solana/constants';
import type { CombatSpeed } from '@/types';
import type { TransactionResult } from '@/types/solana';
import * as Sentry from '@sentry/react-native';

interface ProfileContextType {
  profile: ReturnType<typeof usePlayerProfile>['profile'];
  isLoading: boolean;
  isInitialLoadComplete: boolean;
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
  updateActiveItemPool: (activeItemPool: Uint8Array) => Promise<TransactionResult>;
  clearProfile: () => Promise<TransactionResult>;
  defaultCombatSpeed: CombatSpeed;
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
  unlockedItems: any[]; // Changed to any[] to support new item types temporarily
  /** Unlock an item (called after completing a level) */
  unlockItem: (itemId: string) => void; // Changed to string ID
  /** Check if an item is unlocked */
  isItemUnlocked: (itemId: string) => boolean; // Changed to string ID
  /** Get the item that would be unlocked for a level */
  getRewardForLevel: (level: number) => any | undefined;
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
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);
  const [localUnlockedIndices, setLocalUnlockedIndices] = useState<Set<number>>(new Set());
  const [defaultCombatSpeed, setDefaultCombatSpeed] = useState<CombatSpeed>('normal');
  const fetchedForWalletRef = useRef<string | null>(null);
  const fetchProfileRef = useRef(profileApi.fetchProfile);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Load persisted combat speed on mount
  useEffect(() => {
    AsyncStorage.getItem('defaultCombatSpeed').then((stored) => {
      if (stored === 'normal' || stored === 'fast' || stored === 'super-fast') {
        setDefaultCombatSpeed(stored);
      }
    });
  }, []);

  // Derive unlocked indices from profile bitmask (pure computation, no effect needed)
  const onChainUnlockedIndices = useMemo(() => {
    if (!profileApi.profile?.unlockedItems) return new Set<number>();
    const bitmask = profileApi.profile.unlockedItems;
    const indices = new Set<number>();
    for (let byteIndex = 0; byteIndex < bitmask.length; byteIndex++) {
      const byte = bitmask[byteIndex];
      for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
        if ((byte & (1 << bitIndex)) !== 0) {
          indices.add(byteIndex * 8 + bitIndex);
        }
      }
    }
    return indices;
  }, [profileApi.profile?.unlockedItems]);

  // Merge on-chain indices with local optimistic unlocks
  const unlockedIndices = useMemo(() => {
    if (localUnlockedIndices.size === 0) return onChainUnlockedIndices;
    const merged = new Set(onChainUnlockedIndices);
    for (const idx of localUnlockedIndices) merged.add(idx);
    return merged;
  }, [onChainUnlockedIndices, localUnlockedIndices]);

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
          fetchedForWalletRef.current = null;
          setIsInitialLoadComplete(true);
        }
        return;
      }

      // Prevent duplicate fetches for the same wallet
      if (fetchedForWalletRef.current === wallet.address) {
        if (isMounted) setIsInitialLoadComplete(true);
        return;
      }
      fetchedForWalletRef.current = wallet.address;

      if (isMounted) setIsInitialLoadComplete(false);

      try {
        const connectivity = await detectConnectivity(connection, wallet.address);
        if (isMounted) {
          setMode(connectivity.mode);
        }

        if (connectivity.mode !== 'guest') {
          await fetchProfileRef.current();
        }
      } catch (loadError) {
        Sentry.captureException(loadError, { tags: { source: 'ProfileContext.load' } });
        if (isMounted) {
          setError(getUserErrorMessage(loadError));
        }
      } finally {
        if (isMounted) setIsInitialLoadComplete(true);
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [connection, wallet.address]);

  const clearProfile = useCallback(async (): Promise<TransactionResult> => {
    setError(null);
    const result = await profileApi.resetProfile();
    if (result.success) {
      fetchedForWalletRef.current = null;
      setMode('online');
    }
    return result;
  }, [profileApi]);

  const updateDefaultCombatSpeed = useCallback(async (speed: CombatSpeed) => {
    setDefaultCombatSpeed(speed);
    await AsyncStorage.setItem('defaultCombatSpeed', speed);
  }, []);

  const updateLastPlayed = useCallback(async () => {
    return;
  }, []);

  const syncPendingResults = useCallback(async () => {
    await offlineSync.syncAll();
  }, [offlineSync]);

  // Wrap createProfile so mode is set to 'online' on success.
  // This prevents a race where detectConnectivity() hasn't resolved yet
  // but the user already created a profile (proving connectivity).
  const handleCreateProfile = useCallback(
    async (name: string): Promise<TransactionResult> => {
      const result = await profileApi.createProfile(name);
      if (result.success) {
        setMode('online');
      }
      return result;
    },
    [profileApi]
  );

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
      return { success: false, error: 'Cannot purchase sessions in guest mode' };
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

      // Use the profile API to purchase runs via on-chain purchase_runs instruction
      const result = await profileApi.purchaseRuns();
      if (result.success) {
        // Refresh profile to get updated run count
        await fetchProfileRef.current();
        console.log('[ProfileContext] Runs purchased successfully');
      }
      return result;
    } catch (err) {
      console.error('[ProfileContext] Failed to purchase runs:', err);
      Sentry.captureException(err, { tags: { source: 'ProfileContext.purchaseRuns' } });
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to purchase sessions',
      };
    } finally {
      setIsPurchasing(false);
    }
  }, [mode, wallet.publicKey, connection, profileApi]);

  /**
   * Helper to map item ID to bitmask index (0-79).
   *
   * Solana bitmask layout (from player-profile/src/bitmask.rs):
   * - Gear (I1-I64): tag_code * 8 + (item_num_in_tag - 1), indices 0-63
   * - Tools (T1-T16): 64 + tag_code * 2 + (item_num_in_tag - 1), indices 64-79
   *
   * Tag codes: STONE=0, SCOUT=1, GREED=2, BLAST=3, FROST=4, RUST=5, BLOOD=6, TEMPO=7
   *
   * Item ID to tag mapping:
   * - T1,T2 -> STONE, T3,T4 -> SCOUT, T5,T6 -> GREED, T7,T8 -> BLAST,
   *   T9,T10 -> FROST, T11,T12 -> RUST, T13,T14 -> BLOOD, T15,T16 -> TEMPO
   * - I1-I8 -> STONE, I9-I16 -> SCOUT, I17-I24 -> GREED, I25-I32 -> BLAST,
   *   I33-I40 -> FROST, I41-I48 -> RUST, I49-I56 -> BLOOD, I57-I64 -> TEMPO
   */
  const getGlobalItemIndex = useCallback((id: string): number => {
    if (id === 'T0') return -1; // Starter tool, always unlocked, not tracked in bitmask

    const isTool = id.startsWith('T');
    const num = parseInt(id.substring(1), 10);
    if (Number.isNaN(num)) return -1;

    if (isTool) {
      if (num >= 1 && num <= 16) {
        // T1-T16: 2 tools per tag
        const tagIndex = Math.floor((num - 1) / 2);
        const innerIndex = (num - 1) % 2;
        return 64 + tagIndex * 2 + innerIndex;
      }
      return -1;
    }

    if (num >= 1 && num <= 64) {
      // I1-I64: 8 gear per tag
      const tagIndex = Math.floor((num - 1) / 8);
      const innerIndex = (num - 1) % 8;
      return tagIndex * 8 + innerIndex;
    }

    return -1;
  }, []);

  /**
   * Check if an item is unlocked.
   */
  const isItemUnlocked = useCallback(
    (itemId: string): boolean => {
      if (itemId === 'T0') return true; // Starter tool always unlocked
      const index = getGlobalItemIndex(itemId);
      if (index === -1) return false;
      return unlockedIndices.has(index);
    },
    [unlockedIndices, getGlobalItemIndex]
  );

  /**
   * Unlock an item by ID (optimistic update).
   */
  const unlockItem = useCallback(
    (itemId: string) => {
      const index = getGlobalItemIndex(itemId);
      if (index !== -1) {
        setLocalUnlockedIndices((prev) => {
          const newSet = new Set(prev);
          newSet.add(index);
          return newSet;
        });
      }
    },
    [getGlobalItemIndex]
  );

  /**
   * Get the item that would be unlocked for completing a level.
   */
  const getRewardForLevel = useCallback((level: number): Item | undefined => {
    return getItemForLevel(level);
  }, []);

  // Placeholder — HubScreen uses isItemUnlocked(id) instead of this array.
  const unlockedItems: any[] = [];

  // Convenience accessors
  const availableRuns = profileApi.profile?.availableRuns ?? 0;
  const highestLevelUnlocked = profileApi.profile?.highestLevelUnlocked ?? 1;

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
          Sentry.captureException(error, { tags: { source: 'ProfileContext.recordRunResult' } });
          return { success: false, error: 'Failed to queue result' };
        }
      }

      // Online mode: try on-chain
      return profileApi.recordRunResult(levelReached, victory);
    },
    [mode, offlineSync, profileApi]
  );

  const handleUpdateActiveItemPool = useCallback(
    async (activeItemPool: Uint8Array): Promise<TransactionResult> => {
      console.log('[ProfileContext] updateActiveItemPool called, mode:', mode);
      if (mode === 'guest') {
        console.warn('[ProfileContext] Cannot update item pool in guest mode');
        return { success: false, error: 'Cannot update item pool in guest mode' };
      }

      if (mode === 'cached') {
        console.warn('[ProfileContext] Cannot update item pool in cached mode');
        return { success: false, error: 'Item pool updates require an online connection' };
      }

      return profileApi.updateActiveItemPool(activeItemPool);
    },
    [mode, profileApi]
  );

  const value = useMemo(
    () => ({
      profile: profileApi.profile,
      isLoading: profileApi.isLoading,
      isInitialLoadComplete,
      error: error ?? profileApi.error,
      exists: profileApi.exists,
      isCached: profileApi.isCached,
      mode,
      pendingSyncCount: offlineSync.pendingCount,
      isSyncing: offlineSync.isSyncing,
      refresh,
      createProfile: handleCreateProfile,
      recordRunResult: handleRecordRunResult,
      updateName: profileApi.updateName,
      updateActiveItemPool: handleUpdateActiveItemPool,
      clearProfile,
      defaultCombatSpeed,
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
      defaultCombatSpeed,
      error,
      isInitialLoadComplete,
      handleCreateProfile,
      handleRecordRunResult,
      handleUpdateActiveItemPool,
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
