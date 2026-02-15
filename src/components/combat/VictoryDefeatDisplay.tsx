/**
 * T059: Victory/Defeat display with 3-second timer
 * T075: Display gold reward in combat result
 * T076: Gold reward animation
 * Shows combat result and auto-navigates after timer
 * @see specs/001-pve-dungeon-crawler/spec.md FR-005, FR-006
 * @see specs/002-qol-balance-batch/contracts/gold-rewards.md
 */

import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { GAME_CONSTANTS } from '../../game/engine/constants';
import { Typography } from '../../theme/typography';

export interface VictoryDefeatDisplayProps {
  result: 'VICTORY' | 'DEFEAT';
  /** Gold rewarded (only shown on VICTORY) */
  goldReward?: number;
  /** Whether this is the final boss victory (week 3 boss) */
  isFinalVictory?: boolean;
  onComplete: () => void;
  /** Scale factor for compact/mobile views (default 1) */
  scale?: number;
}

/**
 * VictoryDefeatDisplay shows the combat outcome
 * Per spec: displays for 3 seconds, then auto-navigates
 * T075/T076: Displays animated gold reward on victory
 */
export function VictoryDefeatDisplay({
  result,
  goldReward,
  isFinalVictory = false,
  onComplete,
  scale = 1,
}: VictoryDefeatDisplayProps) {
  const [countdown, setCountdown] = useState(3);
  const [displayedGold, setDisplayedGold] = useState(0);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const goldOpacityAnim = useRef(new Animated.Value(0)).current;
  const goldScaleAnim = useRef(new Animated.Value(0.5)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const goldCounterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const didCompleteRef = useRef(false);

  const isVictory = result === 'VICTORY';
  const showGoldReward = isVictory && goldReward !== undefined && goldReward > 0;

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

  // T076: Gold reward animation sequence
  // 1. Short delay (300ms) after result appears
  // 2. Gold icon and amount animate in
  // 3. Gold counter increments from 0 to reward amount
  useEffect(() => {
    if (!showGoldReward) return;

    const delayTimer = setTimeout(() => {
      // Animate gold display in
      Animated.parallel([
        Animated.timing(goldOpacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(goldScaleAnim, {
          toValue: 1,
          friction: 6,
          tension: 80,
          useNativeDriver: true,
        }),
      ]).start();

      // Increment gold counter from 0 to reward amount
      const incrementDuration = 400; // Total time to count up
      const steps = Math.min(goldReward, 10); // Max 10 increments
      const stepValue = goldReward / steps;
      const stepInterval = incrementDuration / steps;
      let currentStep = 0;

      goldCounterRef.current = setInterval(() => {
        currentStep += 1;
        if (currentStep >= steps) {
          setDisplayedGold(goldReward);
          if (goldCounterRef.current) {
            clearInterval(goldCounterRef.current);
            goldCounterRef.current = null;
          }
        } else {
          setDisplayedGold(Math.round(stepValue * currentStep));
        }
      }, stepInterval);
    }, 300);

    return () => {
      clearTimeout(delayTimer);
      if (goldCounterRef.current) {
        clearInterval(goldCounterRef.current);
        goldCounterRef.current = null;
      }
    };
  }, [showGoldReward, goldReward]);

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

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.content,
          {
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
            padding: 40 * scale,
            borderRadius: 20 * scale,
          },
        ]}
      >
        {/* Result emoji */}
        <Text style={[styles.emoji, { fontSize: 64 * scale, marginBottom: 16 * scale }]}>
          {isVictory ? (isFinalVictory ? '👑' : '🏆') : '💀'}
        </Text>

        {/* Result text */}
        <Text
          style={[
            styles.resultText,
            {
              color: isVictory ? '#22c55e' : '#dc2626',
              fontSize: 48 * scale,
              letterSpacing: 4 * scale,
              marginBottom: 8 * scale,
            },
          ]}
        >
          {isFinalVictory ? 'YOU WIN!' : result}
        </Text>

        {/* Subtext */}
        <Text style={[styles.subtext, { fontSize: 18 * scale, marginBottom: 16 * scale }]}>
          {isVictory
            ? isFinalVictory
              ? 'Level Complete!'
              : 'Enemy defeated!'
            : 'You have fallen...'}
        </Text>

        {/* T075: Gold reward display (only on victory) */}
        {showGoldReward && (
          <Animated.View
            style={[
              styles.goldRewardContainer,
              {
                opacity: goldOpacityAnim,
                transform: [{ scale: goldScaleAnim }],
                paddingHorizontal: 20 * scale,
                paddingVertical: 10 * scale,
                borderRadius: 12 * scale,
                marginBottom: 16 * scale,
              },
            ]}
          >
            <Text style={[styles.goldIcon, { fontSize: 24 * scale, marginRight: 8 * scale }]}>
              💰
            </Text>
            <Text style={[styles.goldAmount, { fontSize: 24 * scale }]}>
              +{displayedGold} Gold
            </Text>
          </Animated.View>
        )}

        {/* Countdown */}
        <Text style={[styles.countdown, { fontSize: 14 * scale }]}>
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
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  emoji: {},
  resultText: {
    fontFamily: Typography.header,
  },
  subtext: {
    fontFamily: Typography.body,
    color: '#888888',
  },
  // T075/T076: Gold reward styles
  goldRewardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.3)',
  },
  goldIcon: {},
  goldAmount: {
    fontFamily: Typography.number,
    fontWeight: 'bold',
    color: '#eab308',
    letterSpacing: 1,
  },
  countdown: {
    fontFamily: Typography.number,
    color: '#666666',
  },
});
