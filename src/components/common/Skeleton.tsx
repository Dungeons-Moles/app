import React, { useEffect, useRef, useMemo } from 'react';
import { StyleSheet, Animated, ViewStyle } from 'react-native';
import Svg, { Rect, Defs, Pattern, Line } from 'react-native-svg';

interface SkeletonProps {
  width: number | string;
  height: number | string;
  style?: ViewStyle;
  borderRadius?: number;
}

export function Skeleton({ width, height, style, borderRadius = 4 }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  // Generate a unique ID for the pattern to avoid collisions when multiple skeletons are present
  const patternId = useMemo(() => `pattern-${Math.random().toString(36).substr(2, 9)}`, []);

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.timing(opacity, {
        toValue: 0.8,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0.4,
        duration: 1000,
        useNativeDriver: true,
      }),
    ]);

    const loop = Animated.loop(animation);
    loop.start();

    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width: width as any,
          height: height as any,
          opacity,
          borderRadius,
        },
        style,
      ]}
    >
      <Svg height="100%" width="100%" preserveAspectRatio="none">
        <Defs>
          <Pattern
            id={patternId}
            patternUnits="userSpaceOnUse"
            width="8"
            height="8"
            patternTransform="rotate(45)"
          >
            <Line x1="0" y1="0" x2="0" y2="8" stroke="#5c4033" strokeWidth="4" />
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${patternId})`} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    overflow: 'hidden',
    backgroundColor: 'rgba(61, 43, 31, 0.2)', // Added subtle background to ensure visibility
  },
});
