/**
 * T057: DamageNumbers floating animation
 * Displays floating damage/heal numbers during combat
 * @see specs/001-pve-dungeon-crawler/spec.md FR-015
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, Text } from 'react-native';
import type { DamageNumber } from '../../contexts/CombatContext';
import { Typography } from '../../theme/typography';

interface DamageNumbersProps {
  damageNumbers: DamageNumber[];
  enemyPosition: { x: number; y: number };
  playerPosition: { x: number; y: number };
}

/**
 * DamageNumbers renders floating damage indicators
 * Per spec FR-015:
 * - Red for damage
 * - Green for healing
 * - Purple for armor loss
 */
export function DamageNumbers({
  damageNumbers,
  enemyPosition,
  playerPosition,
}: DamageNumbersProps) {
  return (
    <View style={styles.container}>
      {damageNumbers.map((dn) => (
        <FloatingNumber
          key={dn.id}
          number={dn}
          position={dn.target === 'enemy' ? enemyPosition : playerPosition}
        />
      ))}
    </View>
  );
}

interface FloatingNumberProps {
  number: DamageNumber;
  position: { x: number; y: number };
}

function FloatingNumber({ number, position }: FloatingNumberProps) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    // Pop-in animation
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        tension: 100,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -40,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(600),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  const getColor = () => {
    switch (number.type) {
      case 'damage':
        return '#ef4444'; // Red
      case 'heal':
        return '#22c55e'; // Green
      case 'armor':
        return '#a855f7'; // Purple
      default:
        return '#ffffff';
    }
  };

  const getText = () => {
    const prefix = number.type === 'heal' ? '+' : '-';
    return `${prefix}${number.value}`;
  };

  // Add some random horizontal offset for variety
  const randomOffset = (number.id.charCodeAt(0) % 20) - 10;

  return (
    <Animated.View
      style={[
        styles.numberContainer,
        {
          left: position.x - 20 + randomOffset,
          top: position.y,
          transform: [{ translateY }, { scale }],
          opacity,
        },
      ]}
    >
      <Text style={[styles.numberText, { color: getColor() }]}>{getText()}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
  },
  numberContainer: {
    position: 'absolute',
    width: 40,
    alignItems: 'center',
  },
  numberText: {
    fontFamily: Typography.number,
    fontSize: 24,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
});
