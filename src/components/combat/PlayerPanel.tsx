/**
 * T121: Player Panel for Combat UI
 * Displays player information including stats, status effects, and equipped items
 * @see specs/001-pve-dungeon-crawler/spec.md FR-049
 */

import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { CombatantState, Tool, Gear } from '../../game/engine/types';
import { StatusEffectIcons } from './StatusEffectIcons';

interface PlayerPanelProps {
  player: CombatantState;
  equippedTool?: Tool | null;
  equippedGear?: Gear[];
}

/**
 * Player panel (right sidebar) showing stats, effects, and equipped items
 */
export const PlayerPanel = React.memo(function PlayerPanel({
  player,
  equippedTool,
  equippedGear = [],
}: PlayerPanelProps) {
  const hpPercentage = useMemo(() => {
    return Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100));
  }, [player.hp, player.maxHp]);

  const hpColor = useCallback((percentage: number) => {
    if (percentage > 50) return '#22c55e';
    if (percentage > 25) return '#eab308';
    return '#dc2626';
  }, []);

  return (
    <View style={styles.container}>
      {/* Player Header */}
      <View style={styles.header}>
        <Text style={styles.emoji}>{player.emoji}</Text>
        <Text style={styles.name} numberOfLines={1}>{player.name}</Text>
      </View>

      {/* HP Bar */}
      <View style={styles.hpSection}>
        <View style={styles.hpBarBackground}>
          <View
            style={[
              styles.hpBarFill,
              { width: `${hpPercentage}%`, backgroundColor: hpColor(hpPercentage) },
            ]}
          />
        </View>
        <Text style={styles.hpText}>
          {player.hp}/{player.maxHp} HP
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsSection}>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>ATK</Text>
          <Text style={styles.statValue}>{player.atk + player.bonusAtk}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>ARM</Text>
          <Text style={styles.statValue}>{player.arm + player.bonusArm}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>SPD</Text>
          <Text style={styles.statValue}>{player.spd + player.bonusSpd}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>DIG</Text>
          <Text style={styles.statValue}>{player.dig}</Text>
        </View>
      </View>

      {/* Status Effects */}
      <View style={styles.statusSection}>
        <Text style={styles.sectionLabel}>Status Effects</Text>
        <StatusEffectIcons combatant={player} size="small" direction="row" />
      </View>

      {/* Equipped Tool */}
      {equippedTool && (
        <View style={styles.toolSection}>
          <Text style={styles.sectionLabel}>Equipped Tool</Text>
          <View style={styles.itemRow}>
            <Text style={styles.itemEmoji}>{equippedTool.emoji}</Text>
            <Text style={styles.itemName} numberOfLines={1}>
              {equippedTool.name}
            </Text>
          </View>
        </View>
      )}

      {/* Equipped Gear */}
      {equippedGear.length > 0 && (
        <View style={styles.gearSection}>
          <Text style={styles.sectionLabel}>Gear ({equippedGear.length})</Text>
          <View style={styles.gearGrid}>
            {equippedGear.slice(0, 6).map((gear, index) => (
              <View key={`${gear.id}-${index}`} style={styles.gearItem}>
                <Text style={styles.gearEmoji}>{gear.emoji}</Text>
              </View>
            ))}
            {equippedGear.length > 6 && (
              <View style={styles.gearItem}>
                <Text style={styles.moreGear}>+{equippedGear.length - 6}</Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 12,
    minWidth: 140,
    maxWidth: 180,
    borderWidth: 2,
    borderColor: '#8b5cf6',
  },
  header: {
    alignItems: 'center',
    marginBottom: 8,
  },
  emoji: {
    fontSize: 32,
    marginBottom: 4,
  },
  name: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  hpSection: {
    marginBottom: 8,
  },
  hpBarBackground: {
    height: 8,
    backgroundColor: '#2a2a3a',
    borderRadius: 4,
    overflow: 'hidden',
  },
  hpBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  hpText: {
    color: '#888888',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 2,
  },
  statsSection: {
    marginBottom: 8,
    gap: 4,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  statLabel: {
    color: '#888888',
    fontSize: 10,
  },
  statValue: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  statusSection: {
    marginBottom: 8,
  },
  sectionLabel: {
    color: '#888888',
    fontSize: 8,
    marginBottom: 4,
  },
  toolSection: {
    backgroundColor: '#2a2a3a',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemEmoji: {
    fontSize: 16,
  },
  itemName: {
    color: '#a78bfa',
    fontSize: 10,
    flex: 1,
  },
  gearSection: {
    marginTop: 4,
  },
  gearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  gearItem: {
    width: 28,
    height: 28,
    backgroundColor: '#2a2a3a',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearEmoji: {
    fontSize: 14,
  },
  moreGear: {
    color: '#888888',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
