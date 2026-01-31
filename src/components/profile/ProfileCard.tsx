import React from 'react';
import { View, Text, StyleSheet, ImageBackground } from 'react-native';
import type { OnChainPlayerProfile } from '@/types/solana';
import { Typography } from '@/theme/typography';

const rectangleSource = require('../../../assets/ui/frames/rectangle.png');

interface ProfileCardProps {
  profile: OnChainPlayerProfile;
}

export function ProfileCard({ profile }: ProfileCardProps) {
  return (
    <ImageBackground source={rectangleSource} style={styles.card} resizeMode="stretch">
      <View style={styles.content}>
        <View style={styles.row}>
          <Text style={styles.label}>Sessions Played:</Text>
          <Text style={styles.value}>{profile.totalRuns}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Sessions Remaining:</Text>
          <Text style={styles.value}>{profile.availableRuns}</Text>
        </View>
      </View>
    </ImageBackground>
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
