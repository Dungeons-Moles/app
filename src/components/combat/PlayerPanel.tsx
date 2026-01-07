/**
 * PlayerPanel Component - T126
 * Displays player info in combat: HP bar, stats, status effects, equipped items
 * @see specs/001-pve-dungeon-crawler/spec.md FR-049
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import type { StatusEffects, Tool, Gear } from '../../game/engine/types';

export interface PlayerPanelProps {
  name: string;
  emoji: string;
  hp: number;
  maxHp: number;
  atk: number;
  arm: number;
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

interface StatusBadgeProps {
  type: 'chill' | 'shrapnel' | 'rust';
  stacks: number;
}

function StatusBadge({ type, stacks }: StatusBadgeProps) {
  const config = {
    chill: { emoji: '❄️', color: '#60a5fa', name: 'Chill' },
    shrapnel: { emoji: '💥', color: '#f97316', name: 'Shrapnel' },
    rust: { emoji: '🦠', color: '#a16207', name: 'Rust' },
  };

  const { emoji, color } = config[type];

  return (
    <View style={[styles.statusBadge, { borderColor: color }]}>
      <Text style={styles.statusEmoji}>{emoji}</Text>
      <Text style={[styles.statusStacks, { color }]}>{stacks}</Text>
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
  spd,
  statusEffects,
  equippedTool,
  equippedGear = [],
}: PlayerPanelProps) {
  const hpPercent = useMemo(() => Math.max(0, (hp / maxHp) * 100), [hp, maxHp]);

  const hpBarColor = useMemo(() => {
    if (hpPercent > 50) return '#22c55e';
    if (hpPercent > 25) return '#eab308';
    return '#dc2626';
  }, [hpPercent]);

  const hasStatusEffects = statusEffects.chill > 0 || statusEffects.shrapnel > 0 || statusEffects.rust > 0;
  const hasItems = equippedTool || equippedGear.length > 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={styles.name}>{name}</Text>
      </View>

      {/* HP Bar */}
      <View style={styles.hpSection}>
        <View style={styles.hpBarBackground}>
          <View
            style={[
              styles.hpBarFill,
              { width: `${hpPercent}%`, backgroundColor: hpBarColor },
            ]}
          />
        </View>
        <Text style={styles.hpText}>
          {hp}/{maxHp}
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsSection}>
        <StatRow label="ATK" value={atk} icon="⚔️" />
        <StatRow label="ARM" value={arm} icon="🛡️" />
        <StatRow label="SPD" value={spd} icon="⚡" />
      </View>

      {/* Status Effects */}
      {hasStatusEffects && (
        <View style={styles.statusSection}>
          <Text style={styles.sectionTitle}>Effects</Text>
          <View style={styles.statusRow}>
            {statusEffects.chill > 0 && (
              <StatusBadge type="chill" stacks={statusEffects.chill} />
            )}
            {statusEffects.shrapnel > 0 && (
              <StatusBadge type="shrapnel" stacks={statusEffects.shrapnel} />
            )}
            {statusEffects.rust > 0 && (
              <StatusBadge type="rust" stacks={statusEffects.rust} />
            )}
          </View>
        </View>
      )}

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
              {equippedTool && (
                <ItemBadge emoji={equippedTool.emoji} name={equippedTool.name} />
              )}
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
  name: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  hpSection: {
    marginBottom: 12,
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
  statusSection: {
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    backgroundColor: '#1a1a2e',
  },
  statusEmoji: {
    fontSize: 11,
    marginRight: 3,
  },
  statusStacks: {
    fontSize: 10,
    fontWeight: 'bold',
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
