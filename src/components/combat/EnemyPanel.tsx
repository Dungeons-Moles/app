/**
 * EnemyPanel Component - T125
 * Displays enemy info in combat: name, emoji, HP bar, stats, trait, status effects
 * @see specs/001-pve-dungeon-crawler/spec.md FR-048
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image, ImageBackground } from 'react-native';
import type { StatusEffects } from '../../game/engine/types';
import { Typography } from '../../theme/typography';

const ICONS = {
  ATK: require('../../../assets/icons/ATK.png'),
  SPD: require('../../../assets/icons/speed.png'),
  DIG: require('../../../assets/icons/DIG.png'),
};

const SIDEBAR_BG = require('../../../assets/map/sidebar.png');

export interface EnemyPanelProps {
  name: string;
  emoji: string;
  imageSource?: any;
  hp: number;
  maxHp: number;
  atk: number;
  arm: number;
  maxArm: number;
  spd: number;
  dig: number;
  statusEffects: StatusEffects;
  trait?: {
    name: string;
    description: string;
  };
}

interface StatRowProps {
  label: string;
  value: number;
  icon: any;
}

function StatRow({ label, value, icon }: StatRowProps) {
  return (
    <View style={styles.statRow}>
      <Image source={icon} style={styles.statIcon} resizeMode="contain" />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export function EnemyPanel({
  name,
  emoji,
  hp,
  maxHp,
  atk,
  arm,
  maxArm,
  spd,
  dig,
  statusEffects,
  trait,
  imageSource,
}: EnemyPanelProps) {
  const hpPercent = useMemo(() => Math.max(0, (hp / maxHp) * 100), [hp, maxHp]);
  const armorPercent = useMemo(
    () => (maxArm > 0 ? Math.max(0, (arm / maxArm) * 100) : 0),
    [arm, maxArm]
  );

  const hpBarColor = useMemo(() => {
    if (hpPercent > 50) return '#22c55e';
    if (hpPercent > 25) return '#eab308';
    return '#dc2626';
  }, [hpPercent]);

  return (
    <View style={styles.container}>
      <ImageBackground source={SIDEBAR_BG} style={styles.sidePanelBg} resizeMode="stretch">
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            {imageSource && (
              <Image source={imageSource} style={styles.image} resizeMode="contain" />
            )}
            <Text style={styles.name} numberOfLines={2}>
              {name}
            </Text>
          </View>

          {/* HP Bar */}
          <View style={styles.hpSection}>
            <View style={styles.hpBarBackground}>
              <View
                style={[styles.hpBarFill, { width: `${hpPercent}%`, backgroundColor: hpBarColor }]}
              />
            </View>
            <Text style={styles.hpText}>
              {hp}/{maxHp}
            </Text>
          </View>

          {/* Armor Bar */}
          <View style={styles.armorSection}>
            <View style={styles.armorBarBackground}>
              <View style={[styles.armorBarFill, { width: `${armorPercent}%` }]} />
            </View>
            <Text style={styles.armorText}>
              {arm}/{maxArm}
            </Text>
          </View>

          {/* Stats */}
          <View style={styles.statsSection}>
            <View style={styles.statsRow}>
              <StatRow label="ATK" value={atk} icon={ICONS.ATK} />
              <StatRow label="DIG" value={dig} icon={ICONS.DIG} />
            </View>
            <View style={styles.statsRow}>
              <StatRow label="SPD" value={spd} icon={ICONS.SPD} />
            </View>
          </View>

          {/* Trait */}
          {trait && (
            <View style={styles.traitSection}>
              <Text style={styles.traitName}>{trait.name}</Text>
              <Text style={styles.traitDescription} numberOfLines={3}>
                {trait.description}
              </Text>
            </View>
          )}
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '25%',
    height: '100%',
    overflow: 'hidden',
  },
  sidePanelBg: {
    margin: 'auto',
    width: '100%',
    height: '100%',
  },
  content: {
    padding: 12,
    height: '100%',
  },
  header: {
    alignItems: 'center',
    marginBottom: 12,
  },
  image: {
    width: 60,
    height: 60,
    marginBottom: 4,
  },
  name: {
    fontFamily: Typography.header,
    fontSize: 18,
    color: '#000000', // Black text
    textAlign: 'center',
    fontWeight: 'bold',
  },
  hpSection: {
    marginBottom: 6,
  },
  hpBarBackground: {
    height: 14,
    backgroundColor: '#2a2a3a',
    borderRadius: 0, // Rectangle
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#000',
  },
  hpBarFill: {
    height: '100%',
    borderRadius: 0, // Rectangle
  },
  hpText: {
    fontFamily: Typography.number,
    fontSize: 12,
    color: '#000000',
    textAlign: 'center',
    marginTop: 4,
    fontWeight: 'bold',
  },
  armorSection: {
    marginBottom: 12,
  },
  armorBarBackground: {
    height: 10,
    backgroundColor: '#2a2a3a',
    borderRadius: 0, // Rectangle
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#000',
  },
  armorBarFill: {
    height: '100%',
    borderRadius: 0, // Rectangle
    backgroundColor: '#a855f7',
  },
  armorText: {
    fontFamily: Typography.number,
    fontSize: 11,
    color: '#000000',
    textAlign: 'center',
    marginTop: 3,
    fontWeight: 'bold',
  },
  statsSection: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.2)',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
  },
  statIcon: {
    width: 18,
    height: 18,
    marginRight: 8,
  },
  statLabel: {
    fontFamily: Typography.header,
    fontSize: 12,
    color: '#000000',
    flex: 1,
    fontWeight: 'bold',
  },
  statValue: {
    fontFamily: Typography.number,
    fontSize: 16,
    color: '#000000',
    fontWeight: 'bold',
  },
  traitSection: {
    padding: 8,
    marginBottom: 12,
    marginHorizontal: 5,
    borderWidth: 2,
    borderColor: '#8B4513',
    backgroundColor: 'rgba(139, 69, 19, 0.1)',
    borderRadius: 4,
  },
  traitName: {
    fontFamily: Typography.header,
    fontSize: 13,
    color: '#000000',
    marginBottom: 4,
    fontWeight: 'bold',
  },
  traitDescription: {
    fontFamily: Typography.body,
    fontSize: 10,
    color: '#333333',
    lineHeight: 14,
  },
});
