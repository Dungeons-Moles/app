/**
 * Fog Persistence Hook
 *
 * Manages persisting fog of war state to AsyncStorage for session restore.
 * Fog state is saved whenever it changes during gameplay and cleared when
 * the session ends.
 */

import { useEffect, useRef, useCallback } from 'react';
import { FogState } from '@/game/map/types';
import { saveFogState, clearFogState } from '@/services/solana/sessionRestore';

interface UseFogPersistenceOptions {
  /** Session PDA key (base58 string) for storage key */
  sessionKey: string | null;
  /** Current fog state from game state */
  fog: FogState[][] | null;
  /** Whether the session is active */
  isActive: boolean;
}

/**
 * Hook that persists fog of war state to AsyncStorage.
 *
 * Usage:
 * ```tsx
 * const { clearFog } = useFogPersistence({
 *   sessionKey: sessionPda?.toBase58() ?? null,
 *   fog: state?.map.fog ?? null,
 *   isActive: hasActiveSession,
 * });
 *
 * // Call clearFog() when session ends
 * ```
 */
export function useFogPersistence({
  sessionKey,
  fog,
  isActive,
}: UseFogPersistenceOptions) {
  // Track last saved fog to avoid unnecessary saves
  const lastSavedFogRef = useRef<string | null>(null);

  // Save fog state whenever it changes
  useEffect(() => {
    if (!sessionKey || !fog || !isActive) {
      return;
    }

    // Serialize fog state to compare with last saved
    // Using a simple hash: count of each state type
    const fogHash = computeFogHash(fog);

    // Skip if fog hasn't changed
    if (fogHash === lastSavedFogRef.current) {
      return;
    }

    // Save fog state
    saveFogState(sessionKey, fog)
      .then(() => {
        lastSavedFogRef.current = fogHash;
        console.log('[useFogPersistence] Fog state saved for session:', sessionKey.slice(0, 8));
      })
      .catch((error) => {
        console.warn('[useFogPersistence] Failed to save fog state:', error);
      });
  }, [sessionKey, fog, isActive]);

  // Clear fog state when session ends
  const clearFog = useCallback(async () => {
    if (!sessionKey) {
      return;
    }

    try {
      await clearFogState(sessionKey);
      lastSavedFogRef.current = null;
      console.log('[useFogPersistence] Fog state cleared for session:', sessionKey.slice(0, 8));
    } catch (error) {
      console.warn('[useFogPersistence] Failed to clear fog state:', error);
    }
  }, [sessionKey]);

  return { clearFog };
}

/**
 * Compute a simple hash of fog state for change detection.
 * Counts the number of each fog type to create a comparable string.
 */
function computeFogHash(fog: FogState[][]): string {
  let hidden = 0;
  let revealed = 0;
  let visible = 0;

  for (const row of fog) {
    for (const cell of row) {
      if (cell === FogState.Hidden) hidden++;
      else if (cell === FogState.Revealed) revealed++;
      else if (cell === FogState.Visible) visible++;
    }
  }

  return `${hidden}:${revealed}:${visible}`;
}
