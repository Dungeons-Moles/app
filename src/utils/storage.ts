import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { PlayerProfile } from '../types';

const PROFILE_KEY = 'player_profile';
const IS_WEB = Platform.OS === 'web';

function getWebStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    if (!window.localStorage) {
      return null;
    }
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return window.localStorage;
  } catch (error) {
    return null;
  }
}

export async function saveProfile(profile: PlayerProfile): Promise<void> {
  try {
    if (IS_WEB) {
      const storage = getWebStorage();
      if (!storage) {
        throw new Error('Web storage is unavailable');
      }
      storage.setItem(PROFILE_KEY, JSON.stringify(profile));
      return;
    }
    await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(profile));
  } catch (error) {
    console.error('Failed to save profile:', error);
    throw error;
  }
}

export async function loadProfile(): Promise<PlayerProfile | null> {
  try {
    if (IS_WEB) {
      const storage = getWebStorage();
      if (!storage) {
        return null;
      }
      const data = storage.getItem(PROFILE_KEY);
      if (data) {
        return JSON.parse(data) as PlayerProfile;
      }
      return null;
    }
    const data = await SecureStore.getItemAsync(PROFILE_KEY);
    if (data) {
      return JSON.parse(data) as PlayerProfile;
    }
    return null;
  } catch (error) {
    console.error('Failed to load profile:', error);
    return null;
  }
}

export async function deleteProfile(): Promise<void> {
  try {
    if (IS_WEB) {
      const storage = getWebStorage();
      if (!storage) {
        throw new Error('Web storage is unavailable');
      }
      storage.removeItem(PROFILE_KEY);
      return;
    }
    await SecureStore.deleteItemAsync(PROFILE_KEY);
  } catch (error) {
    console.error('Failed to delete profile:', error);
    throw error;
  }
}

export function generateProfileId(): string {
  return `profile_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}
