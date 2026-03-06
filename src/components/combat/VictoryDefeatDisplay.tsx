/**
 * T059: Victory/Defeat display with 3-second timer
 * T075: Display gold reward in combat result
 * T076: Gold reward animation
 * Shows combat result and auto-navigates after timer
 * @see specs/001-pve-dungeon-crawler/spec.md FR-005, FR-006
 * @see specs/002-qol-balance-batch/contracts/gold-rewards.md
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, Easing, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Typography } from '../../theme/typography';

const skullIcon = require('../../../assets/icons/ui/skull.webp');
const trophyIcon = require('../../../assets/icons/ui/trophy.webp');
const crownIcon = require('../../../assets/icons/ui/crown.webp');
const coinIcon = require('../../../assets/icons/ui/coin-yellow.webp');

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
  const goldCountAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didCompleteRef = useRef(false);
  const { height: windowHeight } = useWindowDimensions();

  const isVictory = result === 'VICTORY';
  const showGoldReward = isVictory && goldReward !== undefined && goldReward > 0;

  // Scale down if the card would overflow screen height
  // Estimated card height at scale=1: ~350px, at scale=2: ~700px
  const baseCardHeight = showGoldReward ? 380 : 300;
  const estimatedHeight = baseCardHeight * scale;
  const fitScale = estimatedHeight > windowHeight * 0.85
    ? (windowHeight * 0.85) / estimatedHeight
    : 1;
  const s = scale * fitScale;

  const iconSource = isVictory ? (isFinalVictory ? crownIcon : trophyIcon) : skullIcon;
  const iconSize = 100 * s;

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
  useEffect(() => {
    if (!showGoldReward) return;

    goldCountAnim.setValue(0);
    const listenerId = goldCountAnim.addListener(({ value }) => {
      setDisplayedGold(Math.round(value));
    });

    const delayTimer = setTimeout(() => {
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

      Animated.timing(goldCountAnim, {
        toValue: goldReward,
        duration: 400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();
    }, 300);

    return () => {
      clearTimeout(delayTimer);
      goldCountAnim.removeListener(listenerId);
    };
  }, [showGoldReward, goldReward]);

  // Countdown timer using chained setTimeout instead of setInterval
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
    scheduleCountdown(3);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [scheduleCountdown]);

  const cardPadding = 40 * s;
  const cardBorderRadius = 20 * s;

  const cardInnerContent = (
    <>
      {/* Result icon */}
      <Image
        source={iconSource}
        style={{
          width: iconSize,
          height: iconSize,
          marginBottom: 16 * s,
        }}
        // @ts-ignore – expo-image tintColor prop
        tintColor={isVictory ? '#FFD700' : '#FF4444'}
        contentFit="contain"
      />

      {/* Result text */}
      <Text
        style={[
          styles.resultText,
          {
            color: isVictory ? '#22c55e' : '#dc2626',
            fontSize: 48 * s,
            letterSpacing: 4 * s,
            marginBottom: 8 * s,
          },
        ]}
      >
        {isFinalVictory && isVictory ? 'YOU WIN!' : result}
      </Text>

      {/* Subtext */}
      <Text style={[styles.subtext, { fontSize: 18 * s, marginBottom: 16 * s }]}>
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
              paddingHorizontal: 20 * s,
              paddingVertical: 10 * s,
              borderRadius: 12 * s,
              marginBottom: 16 * s,
            },
          ]}
        >
          <Text style={[styles.goldAmount, { fontSize: 24 * s }]}>
            +{displayedGold}
          </Text>
          <Image
            source={coinIcon}
            style={{
              width: 24 * s,
              height: 24 * s,
              marginLeft: 6 * s,
            }}
            contentFit="contain"
          />
        </Animated.View>
      )}

      {/* Countdown */}
      <Text style={[styles.countdown, { fontSize: 14 * s }]}>
        Returning in {countdown}...
      </Text>
    </>
  );

  return (
    <View style={styles.container}>
      {/* Background overlay */}
      <View
        style={[
          styles.overlay,
          { backgroundColor: isVictory ? 'rgba(34, 197, 94, 0.1)' : 'rgba(220, 38, 38, 0.1)' },
        ]}
      />

      {/* Animated card content */}
      <Animated.View
        style={[
          styles.cardWrapper,
          {
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
            padding: cardPadding,
            borderRadius: cardBorderRadius,
          },
        ]}
      >
        {cardInnerContent}
      </Animated.View>
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
  cardWrapper: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  resultText: {
    fontFamily: Typography.header,
  },
  subtext: {
    fontFamily: Typography.body,
    color: '#888888',
  },
  goldRewardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.3)',
  },
  goldIcon: {
    fontFamily: Typography.number,
    fontWeight: 'bold',
    color: '#eab308',
  },
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
