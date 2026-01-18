import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { OnChainPlayerProfile } from '@/types/solana';
import { Typography } from '@/theme/typography';

interface ProfileCardProps {
  profile: OnChainPlayerProfile;
}

export function ProfileCard({ profile }: ProfileCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.label}>Total Runs:</Text>
        <Text style={styles.value}>{profile.totalRuns}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>PvE Runs Available:</Text>
        <Text style={styles.value}>{profile.availableRuns}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 2,
    gap: 3,
  },
  row: {
    flexDirection: 'row',
    gap: 5,
  },
  label: {
    fontFamily: Typography.stat,
    fontSize: 12,
    color: '#888888',
  },
  value: {
    fontFamily: Typography.number,
    fontSize: 12,
    fontWeight: '600',
    color: '#c8c8c8',
  },
});
