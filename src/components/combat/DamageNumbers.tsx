/**
 * T057: DamageNumbers floating animation
 * Displays floating damage/heal numbers during combat
 * @see specs/001-pve-dungeon-crawler/spec.md FR-015
 */

import React, { memo, useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, Text, Image, type ImageSourcePropType } from 'react-native';
import type { DamageNumber } from '../../contexts/CombatContext';
import type { CombatSourceRef } from '../../game/engine/types';
import { GEAR_DEFINITIONS } from '../../data/gear';
import { TOOL_DEFINITIONS } from '../../game/entities/items';
import { Typography } from '../../theme/typography';
import { formatFloatingNumberText } from './damage-number-format';

const COIN_ICON = require('../../../assets/icons/ui/coin-yellow.webp');
const HP_ICON = require('../../../assets/icons/stats/HP.webp');
const ATK_ICON = require('../../../assets/icons/stats/ATK.webp');
const ARM_ICON = require('../../../assets/icons/stats/ARM.webp');
const SPD_ICON = require('../../../assets/icons/stats/speed.webp');
const DIG_ICON = require('../../../assets/icons/stats/DIG.webp');
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

const ITEMSET_ICONS: Record<string, ImageSourcePropType> = {
  UNION_STANDARD: require('../../../assets/icons/itemsets/union_standard.webp'),
  SHARD_CIRCUIT: require('../../../assets/icons/itemsets/shard_circuit.webp'),
  DEMOLITION_PERMIT: require('../../../assets/icons/itemsets/demolition_permit.webp'),
  FUSE_NETWORK: require('../../../assets/icons/itemsets/fuse_network.webp'),
  SHRAPNEL_HARNESS: require('../../../assets/icons/itemsets/shrapnel_harness.webp'),
  RUST_RITUAL: require('../../../assets/icons/itemsets/rust_ritual.webp'),
  SWIFT_DIGGER_KIT: require('../../../assets/icons/itemsets/swift_digger_kit.webp'),
  ROYAL_EXTRACTION: require('../../../assets/icons/itemsets/royal_extraction.webp'),
  WHITEOUT_INITIATIVE: require('../../../assets/icons/itemsets/whiteout_initiative.webp'),
  BLOODRUSH_PROTOCOL: require('../../../assets/icons/itemsets/bloodrush_protocol.webp'),
  CORROSION_PAYLOAD: require('../../../assets/icons/itemsets/corrosion_payload.webp'),
  GOLDEN_SHRAPNEL_EXCHANGE: require('../../../assets/icons/itemsets/golden_shrapnel_exchange.webp'),
};

function getSourceItemIcon(source?: CombatSourceRef): ImageSourcePropType | null {
  if (!source) return null;
  if (source.kind === 'gear') {
    return GEAR_DEFINITIONS[source.id as keyof typeof GEAR_DEFINITIONS]?.image ?? null;
  }
  if (source.kind === 'tool') {
    return TOOL_DEFINITIONS[source.id as keyof typeof TOOL_DEFINITIONS]?.image ?? null;
  }
  if (source.kind === 'itemset') {
    return ITEMSET_ICONS[source.id] ?? null;
  }
  return null;
}

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

function getStatIcon(number: DamageNumber): ImageSourcePropType | null {
  if (number.type === 'gold' || number.type === 'goldGain') return COIN_ICON;
  if (
    number.type === 'damage' &&
    number.source?.kind === 'status' &&
    number.source.id in STATUS_ICONS
  ) {
    return STATUS_ICONS[number.source.id as keyof typeof STATUS_ICONS];
  }
  if (number.type === 'damage' || number.type === 'heal') return HP_ICON;
  if (number.type === 'armor') return ARM_ICON;
  if (number.type === 'status' && number.statusType) return STATUS_ICONS[number.statusType];
  if (number.type === 'stat') {
    if (number.statType === 'ATK') return ATK_ICON;
    if (number.statType === 'ARM') return ARM_ICON;
    if (number.statType === 'SPD') return SPD_ICON;
    if (number.statType === 'DIG') return DIG_ICON;
  }
  return null;
}

function renderStatIcon(number: DamageNumber, sizScale: number) {
  const icon = getStatIcon(number);
  if (!icon) return null;
  return (
    <Image
      source={icon}
      style={[
        number.type === 'gold' || number.type === 'goldGain' ? styles.coinIcon : styles.statIcon,
        {
          width: 18 * sizScale,
          height: 18 * sizScale,
          marginLeft: 4 * sizScale,
        },
      ]}
    />
  );
}

function getStatusSourceIcon(source?: CombatSourceRef): ImageSourcePropType | null {
  if (!source || source.kind !== 'status') return null;
  return STATUS_ICONS[source.id as keyof typeof STATUS_ICONS] ?? null;
}

function renderSourceItemIcon(number: DamageNumber, sizScale: number) {
  const itemIcon = getSourceItemIcon(number.source);
  if (!itemIcon) return null;
  return (
    <Image
      source={itemIcon}
      style={[
        styles.statIcon,
        {
          width: 16 * sizScale,
          height: 16 * sizScale,
          marginLeft: 3 * sizScale,
        },
      ]}
    />
  );
}

function renderStatusSourceIcon(number: DamageNumber, sizScale: number) {
  if (number.type === 'damage' && number.source?.kind === 'status') return null;
  const icon = getStatusSourceIcon(number.source);
  if (!icon) return null;
  return (
    <Image
      source={icon}
      style={[
        styles.statIcon,
        {
          width: 16 * sizScale,
          height: 16 * sizScale,
          marginLeft: 3 * sizScale,
        },
      ]}
    />
  );
}

function renderInlineIcon(
  icon: ImageSourcePropType,
  sizScale: number,
  style?: object
) {
  return (
    <Image
      source={icon}
      style={[
        styles.statIcon,
        {
          width: 18 * sizScale,
          height: 18 * sizScale,
          marginLeft: 4 * sizScale,
        },
        style,
      ]}
    />
  );
}

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
    Animated.sequence([
      Animated.delay(number.delayMs ?? 0),
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
      ]),
    ]).start();
  }, [animScale, number.delayMs, opacity, sizScale, translateY]);

  const getColor = () => {
    switch (number.type) {
      case 'damage':
        return '#ef4444'; // Red
      case 'heal':
        return '#22c55e'; // Green
      case 'armor':
        return '#a855f7'; // Purple
      case 'gold':
      case 'goldGain':
        return '#eab308'; // Gold/yellow
      case 'status':
        return number.statusType ? STATUS_COLORS[number.statusType] : '#ffffff';
      case 'stat':
        if (number.statType === 'ARM') return '#a855f7';
        if (number.statType === 'SPD') return '#d97706';
        if (number.statType === 'DIG') return '#6E7784';
        return '#111111';
      case 'split':
        return '#ffffff';
      default:
        return '#ffffff';
    }
  };

  const getText = () => {
    return formatFloatingNumberText(number);
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
          left: position.x - 30 * sizScale + randomOffset,
          top: position.y,
          width: 60 * sizScale,
          transform: [{ translateY }, { scale: animScale }],
          opacity,
        },
      ]}
    >
      <View style={styles.contentRow}>
        {number.type === 'split' ? (
          <>
            {(number.splitArmorValue ?? 0) > 0 ? (
              <View style={styles.splitEntry}>
                <Text
                  style={[
                    styles.numberText,
                    styles.splitPart,
                    { color: '#a855f7', fontSize: 24 * sizScale },
                  ]}
                >
                  -{number.splitArmorValue}
                </Text>
                {renderInlineIcon(ARM_ICON, sizScale)}
              </View>
            ) : null}
            {(number.splitDamageValue ?? 0) > 0 ? (
              <View style={styles.splitEntry}>
                <Text
                  style={[
                    styles.numberText,
                    { color: '#ef4444', fontSize: 24 * sizScale },
                  ]}
                >
                  -{number.splitDamageValue}
                </Text>
                {renderInlineIcon(HP_ICON, sizScale)}
              </View>
            ) : null}
          </>
        ) : (
          <Text style={[styles.numberText, { color: getColor(), fontSize: 24 * sizScale }]}>{getText()}</Text>
        )}
        {renderStatIcon(number, sizScale)}
        {renderSourceItemIcon(number, sizScale)}
        {renderStatusSourceIcon(number, sizScale)}
      </View>
      {number.strikeLabel ? (
        <Text
          style={[
            styles.strikeLabelText,
            { fontSize: 11 * sizScale },
          ]}
        >
          {number.strikeLabel}
        </Text>
      ) : null}
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
    marginRight: 0,
  },
  splitEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  strikeLabelText: {
    fontFamily: Typography.number,
    fontSize: 11,
    fontWeight: '600',
    color: '#cbd5e1',
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
    textAlign: 'center',
    marginTop: -2,
  },
});
