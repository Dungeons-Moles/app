/**
 * usePoiInteraction Hook
 *
 * Handles POI (Point of Interest) interaction logic with position validation.
 * POI interactions are explicit (require button press), not auto-triggered.
 *
 * @see spec.md for POI interaction requirements
 */

import { useState, useCallback, useMemo } from 'react';
import { useGame, GamePhase } from '@/contexts/GameContext';
import { useSession } from '@/contexts/SessionContext';
import { useGameplayStateContext, type PoiData } from '@/contexts/GameplayStateContext';
import type { Position } from '@/game/engine/types';

// ============================================================================
// Types
// ============================================================================

export interface PoiInteractionState {
  /** Whether player can interact with a POI at current position */
  canInteract: boolean;
  /** The POI at current position (if any) */
  currentPoi: PoiData | undefined;
  /** Whether interaction is in progress */
  isInteracting: boolean;
  /** Error message if any */
  error: string | null;
}

export interface UsePoiInteractionResult extends PoiInteractionState {
  /** Attempt to interact with POI at current position */
  interact: () => Promise<{ success: boolean; result?: any }>;
  /** Check if there's a POI at a specific position */
  hasPoiAt: (x: number, y: number) => boolean;
  /** Get POI data at a specific position */
  getPoiAt: (x: number, y: number) => PoiData | undefined;
  /** Clear error state */
  clearError: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function usePoiInteraction(): UsePoiInteractionResult {
  const { state: gameState, dispatch } = useGame();
  const { hasActiveSession, gameplayState: onChainState } = useSession();
  const { pois, getPoiAt: getOnChainPoiAt, consumePoi } = useGameplayStateContext();

  const [isInteracting, setIsInteracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get player position
  const playerPosition: Position | null = gameState?.player?.position ?? null;

  // Check if there's a valid POI at the player's current position
  const currentPoi = useMemo((): PoiData | undefined => {
    if (!playerPosition) return undefined;

    // First check on-chain POIs
    const onChainPoi = getOnChainPoiAt(playerPosition.x, playerPosition.y);
    if (onChainPoi && !onChainPoi.consumed) {
      return onChainPoi;
    }

    // Fall back to local game state POIs
    if (gameState?.map?.pois) {
      const localPoi = gameState.map.pois.find(
        (p) => p.position.x === playerPosition.x && p.position.y === playerPosition.y && !p.visited
      );
      if (localPoi) {
        return {
          x: localPoi.position.x,
          y: localPoi.position.y,
          poiType: 0, // Map to appropriate type
          consumed: localPoi.visited,
        };
      }
    }

    return undefined;
  }, [playerPosition, getOnChainPoiAt, gameState?.map?.pois]);

  // Can interact if:
  // 1. Player is in exploration phase
  // 2. There's a non-consumed POI at current position
  const canInteract = useMemo((): boolean => {
    if (!gameState || gameState.phase !== GamePhase.Exploration) {
      return false;
    }
    return currentPoi !== undefined && !currentPoi.consumed;
  }, [gameState, currentPoi]);

  /**
   * Check if there's a POI at a specific position.
   */
  const hasPoiAt = useCallback(
    (x: number, y: number): boolean => {
      // Check on-chain POIs
      const onChainPoi = getOnChainPoiAt(x, y);
      if (onChainPoi && !onChainPoi.consumed) {
        return true;
      }

      // Check local game state POIs
      if (gameState?.map?.pois) {
        const localPoi = gameState.map.pois.find(
          (p) => p.position.x === x && p.position.y === y && !p.visited
        );
        return localPoi !== undefined;
      }

      return false;
    },
    [getOnChainPoiAt, gameState?.map?.pois]
  );

  /**
   * Get POI data at a specific position.
   */
  const getPoiAt = useCallback(
    (x: number, y: number): PoiData | undefined => {
      // Check on-chain POIs first
      const onChainPoi = getOnChainPoiAt(x, y);
      if (onChainPoi && !onChainPoi.consumed) {
        return onChainPoi;
      }

      // Fall back to local game state
      if (gameState?.map?.pois) {
        const localPoi = gameState.map.pois.find(
          (p) => p.position.x === x && p.position.y === y && !p.visited
        );
        if (localPoi) {
          return {
            x: localPoi.position.x,
            y: localPoi.position.y,
            poiType: 0,
            consumed: localPoi.visited,
          };
        }
      }

      return undefined;
    },
    [getOnChainPoiAt, gameState?.map?.pois]
  );

  // Get the current POI ID from local state
  const currentPoiId = useMemo((): string | undefined => {
    if (!playerPosition || !gameState?.map?.pois) return undefined;
    const localPoi = gameState.map.pois.find(
      (p) => p.position.x === playerPosition.x && p.position.y === playerPosition.y && !p.visited
    );
    return localPoi?.id;
  }, [playerPosition, gameState?.map?.pois]);

  /**
   * Interact with the POI at current position.
   */
  const interact = useCallback(async (): Promise<{ success: boolean; result?: any }> => {
    if (!canInteract || !playerPosition || !currentPoi || !currentPoiId) {
      setError('Cannot interact with POI');
      return { success: false };
    }

    setIsInteracting(true);
    setError(null);

    try {
      // Dispatch local POI interaction with poiId
      dispatch({ type: 'INTERACT_POI', poiId: currentPoiId });

      // Mark on-chain POI as consumed
      consumePoi(playerPosition.x, playerPosition.y);

      // TODO: Send on-chain interaction transaction when available
      // This would call the POI interaction instruction

      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'POI interaction failed';
      setError(errorMessage);
      console.error('[usePoiInteraction] Error:', err);
      return { success: false };
    } finally {
      setIsInteracting(false);
    }
  }, [canInteract, playerPosition, currentPoi, currentPoiId, dispatch, consumePoi]);

  /**
   * Clear error state.
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    canInteract,
    currentPoi,
    isInteracting,
    error,
    interact,
    hasPoiAt,
    getPoiAt,
    clearError,
  };
}
