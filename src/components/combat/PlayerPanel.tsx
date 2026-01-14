/**
 * PlayerPanel Component - T126
 * Displays player info in combat: HP bar, stats, status effects, equipped items
 * @see specs/001-pve-dungeon-crawler/spec.md FR-049
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import type { StatusEffects, Tool, Gear } from '../../game/engine/types';

const defaultMoleImageSource = require('../../../assets/characters/default-mole.png');

export interface PlayerPanelProps {
  name: string;
  emoji: string;
  hp: number;
  maxHp: number;
  atk: number;
  arm: number;
  maxArm: number;
  spd: number;
  statusEffects: StatusEffects;
  equippedTool?: Tool | null;
  equippedGear?: Gear[];
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

interface ItemBadgeProps {
  emoji: string;
  name: string;
}

function ItemBadge({ emoji, name }: ItemBadgeProps) {
  return (
    <View style={styles.itemBadge}>
      <Text style={styles.itemEmoji}>{emoji}</Text>
    </View>
  );
}

export function PlayerPanel({
  name,
  emoji,
  hp,
  maxHp,
  atk,
  arm,
  maxArm,
  spd,
  statusEffects,
  equippedTool,
  equippedGear = [],
}: PlayerPanelProps) {
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

  const hasItems = equippedTool || equippedGear.length > 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Image source={defaultMoleImageSource} style={styles.headerImage} resizeMode="contain" />
        <Text style={styles.name}>{name}</Text>
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

      {/* Equipped Items */}
      {hasItems && (
        <View style={styles.itemsSection}>
          <Text style={styles.sectionTitle}>Equipment</Text>
          <ScrollView
            horizontal={false}
            style={styles.itemsScroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.itemsGrid}>
              {equippedTool && <ItemBadge emoji={equippedTool.emoji} name={equippedTool.name} />}
              {equippedGear.map((gear, index) => (
                <ItemBadge key={index} emoji={gear.emoji} name={gear.name} />
              ))}
            </View>
          </ScrollView>
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
  emoji: {
    fontSize: 36,
    marginBottom: 4,
  },
  headerImage: {
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
  sectionTitle: {
    fontSize: 10,
    color: '#6b7280',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  itemsSection: {
    flex: 1,
    minHeight: 40,
  },
  itemsScroll: {
    flex: 1,
  },
  itemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  itemBadge: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#3a3a50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemEmoji: {
    fontSize: 14,
  },
});

export default PlayerPanel;
