import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { Position } from '../../game/engine/types';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';

interface WallHighlightProps {
  position: Position;
  cost: number;
  tileSize: number;
  cameraOffset: { x: number; y: number };
}

export function WallHighlight({ position, cost, tileSize, cameraOffset }: WallHighlightProps) {
  const variant = useScreenVariant();
  const isCompact = variant === 'compact';
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const screenPosition = useMemo(
    () => ({
      left: position.x * tileSize + cameraOffset.x,
      top: position.y * tileSize + cameraOffset.y,
    }),
    [position.x, position.y, tileSize, cameraOffset.x, cameraOffset.y]
  );

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.65, 1],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        screenPosition,
        {
          width: tileSize,
          height: tileSize,
          transform: [{ scale }],
          opacity,
        },
      ]}
    >
      <View style={[styles.badge, isCompact && styles.badgeCompact]}>
        <Text style={[styles.badgeText, isCompact && styles.badgeTextCompact]}>
          {cost} move{cost === 1 ? '' : 's'}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#fbbf24',
    borderRadius: 4,
    shadowColor: '#fbbf24',
    shadowOpacity: 0.7,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#fbbf24',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1f2937',
  },
  badgeCompact: {
    top: -14,
    right: -14,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeTextCompact: {
    fontSize: 18,
    fontWeight: '700',
  },
});
