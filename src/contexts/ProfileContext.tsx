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
import {
  RUN_PRICE_LAMPORTS,
  RUNS_PER_PURCHASE,
  TREASURY_PUBKEY,
} from '@/services/solana/constants';
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
  const [unlockedIndices, setUnlockedIndices] = useState<Set<number>>(new Set());
  const hasFetchedRef = useRef(false);
  const fetchProfileRef = useRef(profileApi.fetchProfile);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Initialize unlocked items from starter items
  // NOTE: This logic is legacy. Real unlocking happens via profile sync.
  useEffect(() => {
    // Legacy initialization removed
  }, []);

  // Update unlocked items when profile loads from bitmask
  useEffect(() => {
    if (profileApi.profile?.unlockedItems) {
      const bitmask = profileApi.profile.unlockedItems;
      const newIndices = new Set<number>();

      // Parse bitmask (10 bytes = 80 bits)
      for (let byteIndex = 0; byteIndex < bitmask.length; byteIndex++) {
        const byte = bitmask[byteIndex];
        for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
          if ((byte & (1 << bitIndex)) !== 0) {
            // Global index = byteIndex * 8 + bitIndex
            newIndices.add(byteIndex * 8 + bitIndex);
          }
        }
      }
      setUnlockedIndices(newIndices);
    }
  }, [profileApi.profile?.unlockedItems]);

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

    if (isTool) {
      // T1-T16: 2 tools per tag
      const tagIndex = Math.floor((num - 1) / 2);
      const innerIndex = (num - 1) % 2;
      return 64 + tagIndex * 2 + innerIndex;
    } else {
      // I1-I64: 8 gear per tag
      const tagIndex = Math.floor((num - 1) / 8);
      const innerIndex = (num - 1) % 8;
      return tagIndex * 8 + innerIndex;
    }
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
        setUnlockedIndices((prev) => {
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

  // Compute unlocked items list (Placeholder implementation if not used by HubScreen)
  const unlockedItems = useMemo((): any[] => {
    // This is kept for compatibility but might need proper implementation
    // if other screens use unlockedItems array.
    // For now, HubScreen uses isItemUnlocked(id) which works correctly with new logic.
    return [];
  }, [unlockedIndices]);

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
