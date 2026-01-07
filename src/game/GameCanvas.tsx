import React from 'react';
import { Canvas, Circle, Group, Text, useFont } from '@shopify/react-native-skia';
import { StyleSheet, View } from 'react-native';

interface GameCanvasProps {
  width?: number;
  height?: number;
}

/**
 * Placeholder Skia canvas for future game rendering.
 * This component will eventually render the dungeon map, player, enemies, etc.
 */
export function GameCanvas({ width = 300, height = 300 }: GameCanvasProps) {
  const r = width * 0.15;
  const centerX = width / 2;
  const centerY = height / 2;

  return (
    <View style={styles.container}>
      <Canvas style={{ width, height }}>
        <Group>
          {/* Background circle representing the dungeon area */}
          <Circle
            cx={centerX}
            cy={centerY}
            r={width * 0.45}
            color="#1a1a2e"
          />
          {/* Player placeholder (the mole) */}
          <Circle
            cx={centerX}
            cy={centerY}
            r={r}
            color="#8b5cf6"
          />
          {/* Eyes */}
          <Circle
            cx={centerX - r * 0.3}
            cy={centerY - r * 0.2}
            r={r * 0.15}
            color="#ffffff"
          />
          <Circle
            cx={centerX + r * 0.3}
            cy={centerY - r * 0.2}
            r={r * 0.15}
            color="#ffffff"
          />
          {/* Nose */}
          <Circle
            cx={centerX}
            cy={centerY + r * 0.2}
            r={r * 0.2}
            color="#f472b6"
          />
        </Group>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0f0f1a',
  },
});
