import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CachedImageBackground } from '../common/CachedImageBackground';
import type { OnChainPlayerProfile } from '@/types/solana';
import { Typography } from '@/theme/typography';
import { useScreenVariant } from '@/contexts/ScreenVariantContext';

const rectangleSource = require('../../../assets/ui/frames/rectangle.webp');

interface ProfileCardProps {
  profile: OnChainPlayerProfile;
}

export function ProfileCard({ profile }: ProfileCardProps) {
  const isCompact = useScreenVariant() === 'compact';

  return (
    <CachedImageBackground
      source={rectangleSource}
      style={[styles.card, isCompact && compactStyles.card]}
      resizeMode="stretch"
    >
      <View style={[styles.content, isCompact && compactStyles.content]}>
        <View style={styles.row}>
          <Text style={[styles.label, isCompact && compactStyles.label]}>Sessions Played:</Text>
          <Text style={[styles.value, isCompact && compactStyles.value]}>{profile.totalRuns}</Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.label, isCompact && compactStyles.label]}>Sessions Remaining:</Text>
          <Text style={[styles.value, isCompact && compactStyles.value]}>
            {profile.availableRuns}
          </Text>
        </View>
      </View>
    </CachedImageBackground>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 185,
    height: 55,
  },
  content: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 3,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: 5,
  },
  label: {
    fontFamily: Typography.stat,
    fontSize: 12,
    color: '#1a1a1a',
  },
  value: {
    fontFamily: Typography.number,
    fontSize: 12,
    fontWeight: '600',
    color: '#000000',
  },
});

const compactStyles = StyleSheet.create({
  card: {
    width: 320,
    height: 90,
  },
  content: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 6,
  },
  label: {
    fontSize: 20,
  },
  value: {
    fontSize: 20,
  },
});
