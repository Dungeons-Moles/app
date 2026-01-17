/**
 * StatsPanel Component - T082
 * Displays player stats (HP, ATK, ARM, SPD, DIG, GOLD) with emoji icons
 * @see specs/001-pve-dungeon-crawler/spec.md FR-045
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { PlayerStats } from '../../game/engine/types';
import { Typography } from '../../theme/typography';

interface StatsPanelProps {
  stats: PlayerStats;
}

interface StatRowProps {
  emoji: string;
  label: string;
  value: number;
  maxValue?: number;
  color?: string;
}

function StatRow({ emoji, label, value, maxValue, color = '#E0E0E0' }: StatRowProps) {
  const displayValue = maxValue !== undefined ? `${value}/${maxValue}` : `${value}`;

  return (
    <View style={styles.statRow}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={[styles.label, { color }]}>{label}</Text>
      <Text style={[styles.value, { color }]}>{displayValue}</Text>
    </View>
  );
}

export function StatsPanel({ stats }: StatsPanelProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Stats</Text>
      <View style={styles.statsContainer}>
        <StatRow emoji="❤️" label="HP" value={stats.hp} maxValue={stats.maxHp} color="#FF6B6B" />
        <StatRow emoji="⚔️" label="ATK" value={stats.atk} color="#FFB347" />
        <StatRow emoji="🛡️" label="ARM" value={stats.arm} color="#87CEEB" />
        <StatRow emoji="⚡" label="SPD" value={stats.spd} color="#98FB98" />
        <StatRow emoji="⛏️" label="DIG" value={stats.dig} color="#DEB887" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 6,
    padding: 6,
  },
  title: {
    color: '#FFFFFF',
    fontFamily: Typography.header,
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statsContainer: {
    gap: 1,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  emoji: {
    fontSize: 10,
    width: 14,
    textAlign: 'center',
  },
  label: {
    fontFamily: Typography.stat,
    fontSize: 9,
    width: 30,
  },
  value: {
    fontFamily: Typography.number,
    fontSize: 10,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'right',
  },
});

export default StatsPanel;
