import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { Typography } from '../../theme/typography';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

const chestSource = require('../../../assets/ui/illustrations/chest.webp');

type BadgeSize = 'sm' | 'md' | 'lg';

const SIZE_CONFIG = {
  sm: { iconSize: 46, pillHeight: 26, fontSize: 14, paddingLeft: 6, paddingRight: 12, overlap: 10 },
  md: { iconSize: 64, pillHeight: 36, fontSize: 20, paddingLeft: 10, paddingRight: 16, overlap: 14 },
  lg: { iconSize: 80, pillHeight: 44, fontSize: 26, paddingLeft: 12, paddingRight: 20, overlap: 18 },
};

interface GauntletPoolBadgeProps {
  poolLamports: bigint | null;
  size?: BadgeSize;
}

export function GauntletPoolBadge({ poolLamports, size = 'sm' }: GauntletPoolBadgeProps) {
  const cfg = SIZE_CONFIG[size];
  const solText =
    poolLamports !== null
      ? `${(Number(poolLamports) / LAMPORTS_PER_SOL).toFixed(2)} SOL`
      : '—';

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.pill,
          {
            height: cfg.pillHeight,
            paddingLeft: cfg.paddingLeft,
            paddingRight: cfg.paddingRight,
            marginRight: -cfg.overlap,
          },
        ]}
      >
        <Text style={[styles.value, { fontSize: cfg.fontSize }]}>{solText}</Text>
      </View>
      <Image
        source={chestSource}
        style={{ width: cfg.iconSize, height: cfg.iconSize, zIndex: 1 }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pill: {
    borderRadius: 3,
    backgroundColor: 'rgba(20, 25, 35, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(120, 140, 160, 0.35)',
    justifyContent: 'center',
  },
  value: {
    fontFamily: Typography.number,
    fontWeight: 'bold',
    color: '#e8dcc8',
  },
});
