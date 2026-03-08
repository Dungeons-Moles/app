/**
 * T057: DamageNumbers floating animation
 * Displays floating damage/heal numbers during combat
 * @see specs/001-pve-dungeon-crawler/spec.md FR-015
 */

import React, { memo, useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, Text, Image } from 'react-native';
import type { DamageNumber } from '../../contexts/CombatContext';
import { Typography } from '../../theme/typography';

const COIN_ICON = require('../../../assets/icons/ui/coin-yellow.webp');
const HP_ICON = require('../../../assets/icons/stats/HP.webp');
const ATK_ICON = require('../../../assets/icons/stats/ATK.webp');
const ARM_ICON = require('../../../assets/icons/stats/ARM.webp');
const SPD_ICON = require('../../../assets/icons/stats/speed.webp');
const STATUS_ICONS = {
  chill: require('../../../assets/icons/status-effects/chill.webp'),
  shrapnel: require('../../../assets/icons/status-effects/shrapnel.webp'),
  rust: require('../../../assets/icons/status-effects/rust.webp'),
  bleed: require('../../../assets/icons/status-effects/bleed.webp'),
} as const;

const STATUS_COLORS = {
  chill: '#5CAEC8',
  shrapnel: '#6E7784',
  rust: '#A4542A',
  bleed: '#B33A3F',
} as const;

interface DamageNumbersProps {
  damageNumbers: DamageNumber[];
  enemyPosition: { x: number; y: number };
  playerPosition: { x: number; y: number };
  scale?: number;
}

/**
 * DamageNumbers renders floating damage indicators
 * Per spec FR-015:
 * - Red for damage
 * - Green for healing
 * - Purple for armor loss
 */
export const DamageNumbers = memo(function DamageNumbers({
  damageNumbers,
  enemyPosition,
  playerPosition,
  scale = 1,
}: DamageNumbersProps) {
  return (
    <View style={styles.container}>
      {damageNumbers.map((dn) => (
        <FloatingNumber
          key={dn.id}
          number={dn}
          position={dn.target === 'enemy' ? enemyPosition : playerPosition}
          scale={scale}
        />
      ))}
    </View>
  );
});

interface FloatingNumberProps {
  number: DamageNumber;
  position: { x: number; y: number };
  scale?: number;
}

const FloatingNumber = memo(function FloatingNumber({ number, position, scale: sizScale = 1 }: FloatingNumberProps) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const animScale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    // Pop-in animation
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.spring(animScale, {
        toValue: 1,
        friction: 5,
        tension: 100,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -40 * sizScale,
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
      case 'gold':
        return '#eab308'; // Gold/yellow
      case 'status':
        return number.statusType ? STATUS_COLORS[number.statusType] : '#ffffff';
      case 'stat':
        if (number.statType === 'ARM') return '#a855f7';
        if (number.statType === 'SPD') return '#d97706';
        return '#111111';
      case 'split':
        return '#ffffff';
      default:
        return '#ffffff';
    }
  };

  const getText = () => {
    if (number.type === 'gold') return `-${number.value}`;
    if (number.type === 'split') return '';
    const prefix =
      number.type === 'heal' || number.type === 'status' || number.type === 'stat' ? '+' : '-';
    return `${prefix}${number.value}`;
  };

  const randomOffset =
    number.lane !== undefined
      ? 0
      : (Array.from(number.id).reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 36) - 18;

  return (
    <Animated.View
      style={[
        styles.numberContainer,
        {
          left: position.x - 20 * sizScale + randomOffset,
          top: position.y,
          width: 40 * sizScale,
          transform: [{ translateY }, { scale: animScale }],
          opacity,
        },
      ]}
    >
      <View style={styles.contentRow}>
        {number.type === 'split' ? (
          <>
            {(number.splitArmorValue ?? 0) > 0 ? (
              <Text
                style={[
                  styles.numberText,
                  styles.splitPart,
                  { color: '#a855f7', fontSize: 24 * sizScale },
                ]}
              >
                -{number.splitArmorValue}
              </Text>
            ) : null}
            {(number.splitDamageValue ?? 0) > 0 ? (
              <Text
                style={[
                  styles.numberText,
                  { color: '#ef4444', fontSize: 24 * sizScale },
                ]}
              >
                -{number.splitDamageValue}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={[styles.numberText, { color: getColor(), fontSize: 24 * sizScale }]}>{getText()}</Text>
        )}
        {number.type === 'gold' ? (
          <Image
            source={COIN_ICON}
            style={[
              styles.coinIcon,
              {
                width: 18 * sizScale,
                height: 18 * sizScale,
                marginLeft: 4 * sizScale,
              },
            ]}
          />
        ) : number.type === 'damage' &&
          number.source?.kind === 'status' &&
          number.source.id in STATUS_ICONS ? (
          <Image
            source={STATUS_ICONS[number.source.id as keyof typeof STATUS_ICONS]}
            style={[
              styles.statIcon,
              {
                width: 18 * sizScale,
                height: 18 * sizScale,
                marginLeft: 4 * sizScale,
              },
            ]}
          />
        ) : number.type === 'damage' ? (
          <Image
            source={HP_ICON}
            style={[
              styles.statIcon,
              {
                width: 18 * sizScale,
                height: 18 * sizScale,
                marginLeft: 4 * sizScale,
              },
            ]}
          />
        ) : number.type === 'heal' ? (
          <Image
            source={HP_ICON}
            style={[
              styles.statIcon,
              {
                width: 18 * sizScale,
                height: 18 * sizScale,
                marginLeft: 4 * sizScale,
              },
            ]}
          />
        ) : number.type === 'armor' ? (
          <Image
            source={ARM_ICON}
            style={[
              styles.statIcon,
              {
                width: 18 * sizScale,
                height: 18 * sizScale,
                marginLeft: 4 * sizScale,
              },
            ]}
          />
        ) : number.type === 'status' && number.statusType ? (
          <Image
            source={STATUS_ICONS[number.statusType]}
            style={[
              styles.statIcon,
              {
                width: 18 * sizScale,
                height: 18 * sizScale,
                marginLeft: 4 * sizScale,
              },
            ]}
          />
        ) : number.type === 'stat' && number.statType === 'ATK' ? (
          <Image
            source={ATK_ICON}
            style={[
              styles.statIcon,
              {
                width: 18 * sizScale,
                height: 18 * sizScale,
                marginLeft: 4 * sizScale,
              },
            ]}
          />
        ) : number.type === 'stat' && number.statType === 'ARM' ? (
          <Image
            source={ARM_ICON}
            style={[
              styles.statIcon,
              {
                width: 18 * sizScale,
                height: 18 * sizScale,
                marginLeft: 4 * sizScale,
              },
            ]}
          />
        ) : number.type === 'stat' && number.statType === 'SPD' ? (
          <Image
            source={SPD_ICON}
            style={[
              styles.statIcon,
              {
                width: 18 * sizScale,
                height: 18 * sizScale,
                marginLeft: 4 * sizScale,
              },
            ]}
          />
        ) : null}
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
  },
  numberContainer: {
    position: 'absolute',
    width: 72,
    alignItems: 'center',
  },
  contentRow: {
    flexDirection: 'row',
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
  coinIcon: {
    resizeMode: 'contain',
  },
  statIcon: {
    resizeMode: 'contain',
  },
  splitPart: {
    marginRight: 8,
  },
});
