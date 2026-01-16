import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { CachedProfileData } from '@/types/solana';

const CACHE_PREFIX = 'solana_profile_';
const CACHE_TTL = 5 * 60 * 1000;
const IS_WEB = Platform.OS === 'web';

export interface CachedProfile {
  data: CachedProfileData;
  timestamp: number;
  walletAddress: string;
}

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

function getCacheKey(address: string) {
  return `${CACHE_PREFIX}${address}`;
}

export async function getCachedProfile(address: string): Promise<CachedProfileData | null> {
  try {
    const cacheKey = getCacheKey(address);
    const raw = IS_WEB
      ? getWebStorage()?.getItem(cacheKey)
      : await SecureStore.getItemAsync(cacheKey);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CachedProfile;
    if (Date.now() - parsed.timestamp > CACHE_TTL) {
      return null;
    }

    return parsed.data;
  } catch (error) {
    return null;
  }
}

export async function setCachedProfile(address: string, data: CachedProfileData): Promise<void> {
  const payload: CachedProfile = {
    data,
    timestamp: Date.now(),
    walletAddress: address,
  };
  const value = JSON.stringify(payload);
  if (IS_WEB) {
    getWebStorage()?.setItem(getCacheKey(address), value);
    return;
  }
  await SecureStore.setItemAsync(getCacheKey(address), value);
}

export async function clearCachedProfile(address: string): Promise<void> {
  if (IS_WEB) {
    getWebStorage()?.removeItem(getCacheKey(address));
    return;
  }
  await SecureStore.deleteItemAsync(getCacheKey(address));
}
