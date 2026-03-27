/**
 * Platform-aware Secure Storage
 *
 * Uses expo-secure-store on native (iOS/Android) and sessionStorage on web.
 * sessionStorage survives page reloads but is cleared when the tab closes,
 * which avoids re-signing on refresh while still limiting secret exposure.
 *
 * localStorage is never used because it persists indefinitely and exposes
 * secrets to XSS, malicious extensions, and shared-browser access.
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const isWeb = Platform.OS === 'web';

const WEB_PREFIX = '__dnm_ss_';

/**
 * Stores a value securely (native) or in sessionStorage (web).
 */
export async function setItemAsync(key: string, value: string): Promise<void> {
  if (isWeb) {
    sessionStorage.setItem(WEB_PREFIX + key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

/**
 * Retrieves a value from secure storage (native) or sessionStorage (web).
 */
export async function getItemAsync(key: string): Promise<string | null> {
  if (isWeb) {
    return sessionStorage.getItem(WEB_PREFIX + key);
  } else {
    return SecureStore.getItemAsync(key);
  }
}

/**
 * Deletes a value from secure storage (native) or sessionStorage (web).
 */
export async function deleteItemAsync(key: string): Promise<void> {
  if (isWeb) {
    sessionStorage.removeItem(WEB_PREFIX + key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}
