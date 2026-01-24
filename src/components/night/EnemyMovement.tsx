/**
 * EnemyMovement Component
 *
 * Animates enemy position change during night phases.
 *
 * @see spec.md for night movement rules
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Typography } from '@/theme/typography';
import type { EnemyMovedEvent } from '@/services/solana/types/combat_events';

// ============================================================================
// Constants
// ============================================================================

const TILE_SIZE = 32; // Match map tile size
const ANIMATION_DURATION = 200; // 200ms per enemy

// ============================================================================
// Props
// ============================================================================

interface EnemyMovementProps {
  /** Enemy movement data */
  movement: EnemyMovedEvent;
  /** Whether this enemy is currently animating */
  isAnimating: boolean;
  /** Offset from map origin for positioning */
  mapOffset?: { x: number; y: number };
  /** Callback when animation completes */
  onAnimationComplete?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function EnemyMovement({
  movement,
  isAnimating,
  mapOffset = { x: 0, y: 0 },
  onAnimationComplete,
}: EnemyMovementProps) {
  const positionX = useRef(new Animated.Value(movement.fromX * TILE_SIZE + mapOffset.x)).current;
  const positionY = useRef(new Animated.Value(movement.fromY * TILE_SIZE + mapOffset.y)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isAnimating) {
      // Reset to starting position
      positionX.setValue(movement.fromX * TILE_SIZE + mapOffset.x);
      positionY.setValue(movement.fromY * TILE_SIZE + mapOffset.y);
      pulseAnim.setValue(1);

      // Animate to new position
      Animated.parallel([
        Animated.timing(positionX, {
          toValue: movement.toX * TILE_SIZE + mapOffset.x,
          duration: ANIMATION_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(positionY, {
          toValue: movement.toY * TILE_SIZE + mapOffset.y,
          duration: ANIMATION_DURATION,
          useNativeDriver: true,
        }),
        // Pulse effect
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: ANIMATION_DURATION / 2,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: ANIMATION_DURATION / 2,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        onAnimationComplete?.();
      });
    }
  }, [isAnimating, movement, mapOffset, positionX, positionY, pulseAnim, onAnimationComplete]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [
            { translateX: positionX },
            { translateY: positionY },
            { scale: pulseAnim },
          ],
        },
      ]}
    >
      <View style={styles.enemyIndicator}>
        <Text style={styles.enemyEmoji}>Enemy</Text>
      </View>
      {isAnimating && (
        <View style={styles.movementIndicator}>
          <Text style={styles.arrowText}>
            {getDirectionArrow(movement.fromX, movement.fromY, movement.toX, movement.toY)}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function getDirectionArrow(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): string {
  const dx = toX - fromX;
  const dy = toY - fromY;

  if (dx > 0) return '';
  if (dx < 0) return '';
  if (dy > 0) return '';
  if (dy < 0) return '';
  return '';
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: TILE_SIZE,
    height: TILE_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  enemyIndicator: {
    width: TILE_SIZE - 4,
    height: TILE_SIZE - 4,
    backgroundColor: 'rgba(220, 38, 38, 0.8)',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ef4444',
  },
  enemyEmoji: {
    fontSize: 8,
    fontFamily: Typography.number,
    color: '#ffffff',
  },
  movementIndicator: {
    position: 'absolute',
    top: -12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  arrowText: {
    fontSize: 12,
    color: '#ffffff',
  },
});
