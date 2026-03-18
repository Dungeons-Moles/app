/**
 * CombatResultFloater - Floating indicators for auto-resolved combat results.
 * Shows gold gained and HP lost/gained as animated floating numbers on the map.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Image } from 'expo-image';
import { Typography } from '../../theme/typography';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';

const COIN_ICON = require('../../../assets/icons/ui/coin-yellow.webp');
const HP_ICON = require('../../../assets/icons/stats/HP.webp');

export interface CombatResultIndicator {
  id: string;
  goldDelta: number;
  hpDelta: number;
}

interface CombatResultFloaterProps {
  indicators: CombatResultIndicator[];
  onComplete: (id: string) => void;
}

function FloatingIndicator({
  indicator,
  onComplete,
  isCompact,
}: {
  indicator: CombatResultIndicator;
  onComplete: (id: string) => void;
  isCompact: boolean;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const handleComplete = useCallback(() => {
    onComplete(indicator.id);
  }, [onComplete, indicator.id]);

  useEffect(() => {
    Animated.parallel([
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.delay(1200),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(translateY, {
        toValue: -60,
        duration: 1750,
        useNativeDriver: true,
      }),
    ]).start(handleComplete);
  }, [fadeAnim, translateY, handleComplete]);

  const hasGold = indicator.goldDelta > 0;
  const hasHpChange = indicator.hpDelta !== 0;

  if (!hasGold && !hasHpChange) return null;

  const fontSize = isCompact ? 32 : 18;
  const iconSize = isCompact ? 28 : 16;

  return (
    <Animated.View
      style={[
        styles.floatingContainer,
        {
          opacity: fadeAnim,
          transform: [{ translateY }],
        },
      ]}
    >
      {hasHpChange && (
        <View style={styles.row}>
          <Text
            style={[
              styles.valueText,
              { fontSize },
              indicator.hpDelta < 0 ? styles.hpLoss : styles.hpGain,
            ]}
          >
            {indicator.hpDelta > 0 ? '+' : ''}
            {indicator.hpDelta}
          </Text>
          <Image source={HP_ICON} style={{ width: iconSize, height: iconSize }} contentFit="contain" />
        </View>
      )}
      {hasGold && (
        <View style={styles.row}>
          <Text style={[styles.goldText, { fontSize }]}>+{indicator.goldDelta}</Text>
          <Image source={COIN_ICON} style={{ width: iconSize, height: iconSize }} contentFit="contain" />
        </View>
      )}
    </Animated.View>
  );
}

export function CombatResultFloater({ indicators, onComplete }: CombatResultFloaterProps) {
  const isCompact = useScreenVariant() === 'compact';

  if (indicators.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {indicators.map((indicator) => (
        <FloatingIndicator
          key={indicator.id}
          indicator={indicator}
          onComplete={onComplete}
          isCompact={isCompact}
        />
      ))}
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
  floatingContainer: {
    alignItems: 'center',
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  valueText: {
    fontFamily: Typography.number,
    fontWeight: 'bold',
  },
  hpLoss: {
    color: '#ef4444',
  },
  hpGain: {
    color: '#22c55e',
  },
  goldText: {
    fontFamily: Typography.number,
    fontWeight: 'bold',
    color: '#eab308',
  },
});
