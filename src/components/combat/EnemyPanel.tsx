/**
 * EnemyPanel Component - T125
 * Displays enemy info in combat: name, emoji, HP bar, stats, trait, status effects
 * @see specs/001-pve-dungeon-crawler/spec.md FR-048
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import type { StatusEffects } from '../../game/engine/types';

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
  statusEffects: StatusEffects;
  trait?: {
    name: string;
    description: string;
  };
}

interface StatRowProps {
  label: string;
  value: number;
  icon: string;
}

function StatRow({ label, value, icon }: StatRowProps) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statIcon}>{icon}</Text>
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
      {/* Header */}
      <View style={styles.header}>
        {imageSource && <Image source={imageSource} style={styles.image} resizeMode="contain" />}
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
        <StatRow label="ATK" value={atk} icon="⚔️" />
        <StatRow label="ARM" value={arm} icon="🛡️" />
        <StatRow label="SPD" value={spd} icon="⚡" />
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 8,
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
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  hpSection: {
    marginBottom: 6,
  },
  hpBarBackground: {
    height: 14,
    backgroundColor: '#2a2a3a',
    borderRadius: 7,
    overflow: 'hidden',
  },
  hpBarFill: {
    height: '100%',
    borderRadius: 7,
  },
  hpText: {
    fontSize: 11,
    color: '#888888',
    textAlign: 'center',
    marginTop: 4,
  },
  armorSection: {
    marginBottom: 12,
  },
  armorBarBackground: {
    height: 10,
    backgroundColor: '#2a2a3a',
    borderRadius: 5,
    overflow: 'hidden',
  },
  armorBarFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: '#a855f7',
  },
  armorText: {
    fontSize: 10,
    color: '#a855f7',
    textAlign: 'center',
    marginTop: 3,
  },
  statsSection: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a35',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  statIcon: {
    fontSize: 12,
    marginRight: 6,
    width: 18,
  },
  statLabel: {
    fontSize: 10,
    color: '#888888',
    flex: 1,
  },
  statValue: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  traitSection: {
    backgroundColor: '#1a1a25',
    borderRadius: 6,
    padding: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a2a35',
  },
  traitName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#f59e0b',
    marginBottom: 4,
  },
  traitDescription: {
    fontSize: 10,
    color: '#9ca3af',
    lineHeight: 14,
  },
});

export default EnemyPanel;
