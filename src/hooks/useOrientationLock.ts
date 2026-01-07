/**
 * useOrientationLock - T130
 * Locks screen orientation to landscape for game screens
 * @see specs/001-pve-dungeon-crawler/spec.md FR-044
 */

import { useEffect } from 'react';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Platform } from 'react-native';

export type OrientationLockType = 'landscape' | 'portrait' | 'default';

/**
 * Lock screen orientation to the specified type
 * @param orientation - The orientation to lock to (default: 'landscape')
 */
export function useOrientationLock(orientation: OrientationLockType = 'landscape') {
  useEffect(() => {
    // Web doesn't support screen orientation API in the same way
    if (Platform.OS === 'web') {
      return;
    }

    let originalOrientation: ScreenOrientation.OrientationLock | null = null;

    async function lockOrientation() {
      try {
        // Store original orientation to restore later
        const currentOrientation = await ScreenOrientation.getOrientationLockAsync();
        originalOrientation = currentOrientation;

        // Lock to the requested orientation
        switch (orientation) {
          case 'landscape':
            await ScreenOrientation.lockAsync(
              ScreenOrientation.OrientationLock.LANDSCAPE
            );
            break;
          case 'portrait':
            await ScreenOrientation.lockAsync(
              ScreenOrientation.OrientationLock.PORTRAIT
            );
            break;
          case 'default':
            await ScreenOrientation.unlockAsync();
            break;
        }
      } catch (error) {
        // Silently fail - orientation lock is a nice-to-have
        console.warn('Failed to lock orientation:', error);
      }
    }

    lockOrientation();

    // Cleanup: restore original orientation when component unmounts
    return () => {
      if (originalOrientation !== null && Platform.OS !== 'web') {
        ScreenOrientation.lockAsync(originalOrientation).catch(() => {
          // Silently fail on cleanup
        });
      }
    };
  }, [orientation]);
}

/**
 * Lock to landscape orientation (convenience wrapper)
 */
export function useLandscapeLock() {
  useOrientationLock('landscape');
}

/**
 * Get current orientation (reactive)
 */
export function useOrientation() {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = ScreenOrientation.addOrientationChangeListener((event) => {
      // Could be used for responsive layout adjustments
      // Currently just for monitoring
    });

    return () => {
      ScreenOrientation.removeOrientationChangeListener(subscription);
    };
  }, []);
}

export default useOrientationLock;
