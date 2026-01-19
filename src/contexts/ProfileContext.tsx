import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { usePlayerProfile } from '@/hooks/usePlayerProfile';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { detectConnectivity } from '@/services/solana/connectivity';
import { getUserErrorMessage } from '@/services/solana/errors';
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
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { wallet } = useWallet();
  const { connection } = useSolanaConnection();
  const profileApi = usePlayerProfile();
  const [mode, setMode] = React.useState<'online' | 'cached' | 'guest'>('guest');
  const [error, setError] = React.useState<string | null>(null);
  const hasFetchedRef = useRef(false);
  const fetchProfileRef = useRef(profileApi.fetchProfile);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

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
