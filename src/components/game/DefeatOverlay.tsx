/**
 * DefeatOverlay - Shows "DEFEAT" / "You have fallen..." on the map
 * when auto-resolve combat results in player death.
 * Counts down 3 seconds then calls onComplete.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Image } from 'expo-image';
import { Typography } from '../../theme/typography';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';

const skullIcon = require('../../../assets/icons/ui/skull.webp');

interface DefeatOverlayProps {
  visible: boolean;
  onComplete: () => void;
}

export function DefeatOverlay({ visible, onComplete }: DefeatOverlayProps) {
  const isCompact = useScreenVariant() === 'compact';
  const s = isCompact ? 2 : 1;
  const [countdown, setCountdown] = useState(3);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didCompleteRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
      setCountdown(3);
      didCompleteRef.current = false;
      return;
    }

    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, scaleAnim, opacityAnim]);

  const scheduleCountdown = useCallback(
    (remaining: number) => {
      if (remaining <= 0) {
        if (!didCompleteRef.current) {
          didCompleteRef.current = true;
          onComplete();
        }
        return;
      }
      timerRef.current = setTimeout(() => {
        setCountdown(remaining - 1);
        scheduleCountdown(remaining - 1);
      }, 1000);
    },
    [onComplete]
  );

  useEffect(() => {
    if (!visible) return;
    scheduleCountdown(3);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [visible, scheduleCountdown]);

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <View style={styles.overlay} />
      <Animated.View
        style={[
          styles.card,
          {
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
            padding: 40 * s,
            borderRadius: 20 * s,
          },
        ]}
      >
        <Image
          source={skullIcon}
          style={{ width: 100 * s, height: 100 * s, marginBottom: 16 * s }}
          // @ts-ignore – expo-image tintColor prop
          tintColor="#FF4444"
          contentFit="contain"
        />
        <Text style={[styles.resultText, { fontSize: 48 * s, letterSpacing: 4 * s, marginBottom: 8 * s }]}>
          DEFEAT
        </Text>
        <Text style={[styles.subtext, { fontSize: 18 * s, marginBottom: 16 * s }]}>
          You have fallen...
        </Text>
        <Text style={[styles.countdown, { fontSize: 14 * s }]}>
          Returning in {countdown}...
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    zIndex: -1,
  },
  card: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  resultText: {
    fontFamily: Typography.header,
    color: '#dc2626',
  },
  subtext: {
    fontFamily: Typography.body,
    color: '#888888',
  },
  countdown: {
    fontFamily: Typography.number,
    color: '#666666',
  },
});
