/**
 * T059: Victory/Defeat display with 3-second timer
 * Shows combat result and auto-navigates after timer
 * @see specs/001-pve-dungeon-crawler/spec.md FR-005, FR-006
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { GAME_CONSTANTS } from '../../game/engine/constants';

interface VictoryDefeatDisplayProps {
  result: 'VICTORY' | 'DEFEAT';
  onComplete: () => void;
}

/**
 * VictoryDefeatDisplay shows the combat outcome
 * Per spec: displays for 3 seconds, then auto-navigates
 */
export function VictoryDefeatDisplay({
  result,
  onComplete,
}: VictoryDefeatDisplayProps) {
  const [countdown, setCountdown] = useState(3);
  const scaleAnim = React.useRef(new Animated.Value(0)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const didCompleteRef = React.useRef(false);

  // Animate in on mount
  useEffect(() => {
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
  }, []);

  // Countdown timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (countdown > 0) return;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (didCompleteRef.current) return;
    didCompleteRef.current = true;
    onComplete();
  }, [countdown, onComplete]);

  const isVictory = result === 'VICTORY';

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.content,
          {
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
          },
        ]}
      >
        {/* Result emoji */}
        <Text style={styles.emoji}>
          {isVictory ? '🏆' : '💀'}
        </Text>

        {/* Result text */}
        <Text
          style={[
            styles.resultText,
            { color: isVictory ? '#22c55e' : '#dc2626' },
          ]}
        >
          {result}
        </Text>

        {/* Subtext */}
        <Text style={styles.subtext}>
          {isVictory
            ? 'Enemy defeated!'
            : 'You have fallen...'}
        </Text>

        {/* Countdown */}
        <Text style={styles.countdown}>
          Returning in {countdown}...
        </Text>
      </Animated.View>

      {/* Background overlay */}
      <View
        style={[
          styles.overlay,
          { backgroundColor: isVictory ? 'rgba(34, 197, 94, 0.1)' : 'rgba(220, 38, 38, 0.1)' },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -1,
  },
  content: {
    alignItems: 'center',
    padding: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  emoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  resultText: {
    fontSize: 36,
    fontWeight: 'bold',
    letterSpacing: 4,
    marginBottom: 8,
  },
  subtext: {
    fontSize: 16,
    color: '#888888',
    marginBottom: 24,
  },
  countdown: {
    fontSize: 14,
    color: '#666666',
  },
});
