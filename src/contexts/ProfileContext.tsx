import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { PlayerProfile } from '../types';
import { saveProfile, loadProfile, deleteProfile, generateProfileId } from '../utils/storage';

interface ProfileContextType {
  profile: PlayerProfile | null;
  isLoading: boolean;
  createProfile: (walletAddress: string) => Promise<PlayerProfile>;
  updateLastPlayed: () => Promise<void>;
  clearProfile: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadProfile()
      .then(setProfile)
      .finally(() => setIsLoading(false));
  }, []);

  const createProfile = useCallback(async (walletAddress: string): Promise<PlayerProfile> => {
    const newProfile: PlayerProfile = {
      id: generateProfileId(),
      walletAddress,
      displayName: `Mole_${walletAddress.slice(-4)}`,
      createdAt: Date.now(),
      lastPlayedAt: Date.now(),
    };

    await saveProfile(newProfile);
    setProfile(newProfile);
    return newProfile;
  }, []);

  const updateLastPlayed = useCallback(async () => {
    if (profile) {
      const updated = { ...profile, lastPlayedAt: Date.now() };
      await saveProfile(updated);
      setProfile(updated);
    }
  }, [profile]);

  const clearProfile = useCallback(async () => {
    await deleteProfile();
    setProfile(null);
  }, []);

  return (
    <ProfileContext.Provider
      value={{
        profile,
        isLoading,
        createProfile,
        updateLastPlayed,
        clearProfile,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
}
