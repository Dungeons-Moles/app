import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { usePlayerProfile } from '@/hooks/usePlayerProfile';
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
  refresh: () => Promise<void>;
  createProfile: (name: string) => Promise<TransactionResult>;
  clearProfile: () => Promise<void>;
  updateDefaultCombatSpeed: (speed: CombatSpeed) => Promise<void>;
  updateLastPlayed: () => Promise<void>;
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

  // Keep ref updated with latest fetchProfile
  useEffect(() => {
    fetchProfileRef.current = profileApi.fetchProfile;
  }, [profileApi.fetchProfile]);

  const refresh = useCallback(async () => {
    await fetchProfileRef.current();
  }, []);

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

  const value = useMemo(
    () => ({
      profile: profileApi.profile,
      isLoading: profileApi.isLoading,
      error: error ?? profileApi.error,
      exists: profileApi.exists,
      isCached: profileApi.isCached,
      mode,
      refresh,
      createProfile: profileApi.createProfile,
      clearProfile,
      updateDefaultCombatSpeed,
      updateLastPlayed,
    }),
    [clearProfile, error, mode, profileApi, refresh, updateDefaultCombatSpeed, updateLastPlayed]
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
