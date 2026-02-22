/**
 * StatsPanel Component - T082
 * Displays player stats (HP, ATK, ARM, SPD, DIG, GOLD) with emoji icons
 * @see specs/001-pve-dungeon-crawler/spec.md FR-045
 */

import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import type { PlayerStats } from '../../game/engine/types';
import { Typography } from '../../theme/typography';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';

const ICONS = {
  HP: require('../../../assets/icons/stats/HP.png'),
  ATK: require('../../../assets/icons/stats/ATK.png'),
  ARM: require('../../../assets/icons/stats/ARM.png'),
  SPD: require('../../../assets/icons/stats/speed.png'),
  DIG: require('../../../assets/icons/stats/DIG.png'),
};

interface StatsPanelProps {
  stats: PlayerStats;
  isSidebar?: boolean;
}

interface StatRowProps {
  icon: any;
  label: string;
  value: number;
  maxValue?: number;
  color?: string;
  isSidebar?: boolean;
  isCompact?: boolean;
}

const StatRow = React.memo(function StatRow({ icon, label, value, maxValue, color = '#E0E0E0', isSidebar, isCompact }: StatRowProps) {
  const displayValue = maxValue !== undefined ? `${value}/${maxValue}` : `${value}`;
  const textColor = isSidebar ? '#000000' : color;
  const iconSize = isCompact ? 28 : 18;
  const fontSize = isCompact ? 16 : 14;
  const labelWidth = isCompact ? 52 : 40;

  return (
    <View style={styles.statRow}>
      <Image
        source={icon}
        style={[{ width: iconSize, height: iconSize }, isSidebar && { tintColor: '#000000' }]}
        resizeMode="contain"
      />
      <Text style={[styles.label, { color: textColor, fontSize, width: labelWidth }]}>{label}</Text>
      <Text style={[styles.value, { color: textColor, fontSize }]}>{displayValue}</Text>
    </View>
  );
});

export function StatsPanel({ stats, isSidebar }: StatsPanelProps) {
  const variant = useScreenVariant();
  const isCompact = !!isSidebar && variant === 'compact';

  if (isSidebar) {
    return (
      <View style={[styles.container, styles.sidebarContainer]}>
        <View style={styles.twoColumnStats}>
          <View style={styles.column}>
            <StatRow
              icon={ICONS.HP}
              label="HP"
              value={stats.hp}
              maxValue={stats.maxHp}
              color="#FF6B6B"
              isSidebar={true}
              isCompact={isCompact}
            />
            <StatRow
              icon={ICONS.ATK}
              label="ATK"
              value={stats.atk}
              color="#FFB347"
              isSidebar={true}
              isCompact={isCompact}
            />
            <StatRow
              icon={ICONS.ARM}
              label="ARM"
              value={stats.arm}
              color="#87CEEB"
              isSidebar={true}
              isCompact={isCompact}
            />
          </View>
          <View style={styles.column}>
            <StatRow
              icon={ICONS.SPD}
              label="SPD"
              value={stats.spd}
              color="#98FB98"
              isSidebar={true}
              isCompact={isCompact}
            />
            <StatRow
              icon={ICONS.DIG}
              label="DIG"
              value={stats.dig}
              color="#DEB887"
              isSidebar={true}
              isCompact={isCompact}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.statsContainer}>
        <StatRow
          icon={ICONS.HP}
          label="HP"
          value={stats.hp}
          maxValue={stats.maxHp}
          color="#FF6B6B"
          isSidebar={false}
        />
        <StatRow icon={ICONS.ATK} label="ATK" value={stats.atk} color="#FFB347" isSidebar={false} />
        <StatRow icon={ICONS.ARM} label="ARM" value={stats.arm} color="#87CEEB" isSidebar={false} />
        <StatRow icon={ICONS.SPD} label="SPD" value={stats.spd} color="#98FB98" isSidebar={false} />
        <StatRow icon={ICONS.DIG} label="DIG" value={stats.dig} color="#DEB887" isSidebar={false} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 6,
    padding: 6,
  },
  sidebarContainer: {
    backgroundColor: 'transparent',
    padding: 0,
  },
  statsContainer: {
    gap: 1,
  },
  twoColumnStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 10,
  },
  column: {
    flex: 1,
    gap: 6,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 2,
  },
  icon: {
    width: 18,
    height: 18,
  },
  label: {
    fontFamily: Typography.header,
    fontSize: 14,
    width: 40, // Slightly reduced to fit 2 columns
    fontWeight: 'bold',
  },
  value: {
    fontFamily: Typography.number,
    fontSize: 14,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'right',
  },
});

export default StatsPanel;
