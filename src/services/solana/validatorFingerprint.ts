/**
 * Validator Fingerprint Check
 *
 * Detects when the local validator has been reset (e.g., `--reset` flag)
 * by comparing the genesis hash. When a reset is detected, clears all
 * session-related caches from localStorage and AsyncStorage to prevent
 * stale data (fog, walls, session signers, profile cache) from bleeding
 * into a fresh validator environment.
 *
 * This is only active when running against a local validator.
 */

import { Connection } from '@solana/web3.js';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SOLANA_CONFIG } from './config';

const GENESIS_HASH_KEY = 'validator_genesis_hash';
const IS_WEB = Platform.OS === 'web';

/**
 * Check if the validator's genesis hash has changed since last run.
 * If it has, clear all session-related caches.
 *
 * Only runs when connected to a local validator (localhost/127.0.0.1).
 * On remote clusters, this is a no-op.
 */
export async function checkValidatorFingerprint(connection: Connection): Promise<boolean> {
  if (!SOLANA_CONFIG.isLocalValidator) {
    return false;
  }

  try {
    const currentHash = await connection.getGenesisHash();
    const storedHash = getStoredGenesisHash();

    if (storedHash && storedHash !== currentHash) {
      console.log(
        '[validatorFingerprint] Genesis hash changed! Validator was reset.',
        { stored: storedHash.slice(0, 12) + '...', current: currentHash.slice(0, 12) + '...' }
      );
      await clearAllSessionCaches();
      storeGenesisHash(currentHash);
      return true;
    }

    if (!storedHash) {
      console.log('[validatorFingerprint] First run — storing genesis hash');
    }

    storeGenesisHash(currentHash);
    return false;
  } catch (error) {
    console.warn('[validatorFingerprint] Failed to check genesis hash:', error);
    return false;
  }
}

/**
 * Get the stored genesis hash from localStorage.
 */
function getStoredGenesisHash(): string | null {
  if (!IS_WEB) {
    // On native, use a sync approach — this runs early enough that
    // we can't easily use async SecureStore here. For native we skip
    // since native doesn't have the HMR state persistence issue.
    return null;
  }
  try {
    return localStorage.getItem(GENESIS_HASH_KEY);
  } catch {
    return null;
  }
}

/**
 * Store the genesis hash in localStorage.
 */
function storeGenesisHash(hash: string): void {
  if (!IS_WEB) return;
  try {
    localStorage.setItem(GENESIS_HASH_KEY, hash);
  } catch {
    // Ignore
  }
}

/**
 * Clear all session-related caches from both localStorage and AsyncStorage.
 * Preserves user preferences (e.g., combat speed).
 */
async function clearAllSessionCaches(): Promise<void> {
  console.log('[validatorFingerprint] Clearing all session-related caches...');

  // 1. Clear AsyncStorage keys (fog, walls, sync queue)
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const sessionKeys = allKeys.filter(
      (key) =>
        key.startsWith('fog_state_') ||
        key.startsWith('broken_walls_') ||
        key === 'solana_sync_queue'
    );
    if (sessionKeys.length > 0) {
      await AsyncStorage.multiRemove(sessionKeys);
      console.log(`[validatorFingerprint] Cleared ${sessionKeys.length} AsyncStorage keys:`, sessionKeys);
    }
  } catch (error) {
    console.warn('[validatorFingerprint] Failed to clear AsyncStorage:', error);
  }

  // 2. Clear localStorage keys (session signers, profile caches)
  if (IS_WEB) {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (
          key.startsWith('session_signer') ||
          key.startsWith('solana_profile_') ||
          key === 'player_profile'
        ) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }
      if (keysToRemove.length > 0) {
        console.log(`[validatorFingerprint] Cleared ${keysToRemove.length} localStorage keys:`, keysToRemove);
      }
    } catch (error) {
      console.warn('[validatorFingerprint] Failed to clear localStorage:', error);
    }
  }

  console.log('[validatorFingerprint] All session caches cleared');
}
