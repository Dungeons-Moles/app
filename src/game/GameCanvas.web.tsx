import React from 'react';
import { StyleSheet, View } from 'react-native';

interface GameCanvasProps {
  width?: number;
  height?: number;
}

/**
 * Web fallback for the Skia canvas placeholder.
 */
export function GameCanvas({ width = 300, height = 300 }: GameCanvasProps) {
  const r = width * 0.15;
  const centerX = width / 2;
  const centerY = height / 2;
  const bgSize = width * 0.9;

  return (
    <View style={[styles.container, { width, height }]}>
      <View
        style={[
          styles.webBackground,
          {
            width: bgSize,
            height: bgSize,
            borderRadius: bgSize / 2,
          },
        ]}
      />
      <View
        style={[
          styles.webMole,
          {
            width: r * 2,
            height: r * 2,
            borderRadius: r,
            left: centerX - r,
            top: centerY - r,
          },
        ]}
      />
      <View
        style={[
          styles.webEye,
          {
            width: r * 0.3,
            height: r * 0.3,
            borderRadius: r * 0.15,
            left: centerX - r * 0.6,
            top: centerY - r * 0.4,
          },
        ]}
      />
      <View
        style={[
          styles.webEye,
          {
            width: r * 0.3,
            height: r * 0.3,
            borderRadius: r * 0.15,
            left: centerX + r * 0.3,
            top: centerY - r * 0.4,
          },
        ]}
      />
      <View
        style={[
          styles.webNose,
          {
            width: r * 0.4,
            height: r * 0.4,
            borderRadius: r * 0.2,
            left: centerX - r * 0.2,
            top: centerY + r * 0.15,
          },
        ]}
      />
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
    position: 'relative',
  },
  webBackground: {
    backgroundColor: '#1a1a2e',
  },
  webMole: {
    position: 'absolute',
    backgroundColor: '#8b5cf6',
  },
  webEye: {
    position: 'absolute',
    backgroundColor: '#ffffff',
  },
  webNose: {
    position: 'absolute',
    backgroundColor: '#f472b6',
  },
});
