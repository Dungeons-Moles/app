/**
 * Platform-aware Secure Storage
 *
 * Uses expo-secure-store on native (iOS/Android) and localStorage on web.
 * This allows the sessionSigner wallet to work across all platforms.
 *
 * Note: localStorage is NOT secure - this is acceptable for development/testing
 * but in production, web users should use a different authentication flow.
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const isWeb = Platform.OS === 'web';

/**
 * Stores a value securely (native) or in localStorage (web).
 */
export async function setItemAsync(key: string, value: string): Promise<void> {
  console.log('[SecureStorage] setItemAsync called | key:', key, '| valueLength:', value.length);
  if (isWeb) {
    try {
      localStorage.setItem(key, value);
      // Verify write was successful
      const readBack = localStorage.getItem(key);
      console.log('[SecureStorage] localStorage write verified:', readBack !== null);
    } catch (error) {
      console.error('[SecureStorage] Failed to set item in localStorage:', error);
      throw error;
    }
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

/**
 * Retrieves a value from secure storage (native) or localStorage (web).
 */
export async function getItemAsync(key: string): Promise<string | null> {
  console.log('[SecureStorage] getItemAsync called | key:', key);
  if (isWeb) {
    try {
      const value = localStorage.getItem(key);
      console.log('[SecureStorage] localStorage read result:', value !== null ? `found (${value.length} chars)` : 'NOT FOUND');
      return value;
    } catch (error) {
      console.error('[SecureStorage] Failed to get item from localStorage:', error);
      return null;
    }
  } else {
    return SecureStore.getItemAsync(key);
  }
}

/**
 * Deletes a value from secure storage (native) or localStorage (web).
 */
export async function deleteItemAsync(key: string): Promise<void> {
  if (isWeb) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('[SecureStorage] Failed to delete item from localStorage:', error);
    }
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}
