/**
 * T121: Enemy Panel for Combat UI
 * Displays enemy information including name, trait, and status effects
 * @see specs/001-pve-dungeon-crawler/spec.md FR-048
 */

import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { CombatantState } from '../../game/engine/types';
import { StatusEffectIcons } from './StatusEffectIcons';
import { ENEMY_TRAITS, type EnemyId } from '../../game/combat/traits';

interface EnemyPanelProps {
  enemy: CombatantState;
  enemyId?: EnemyId;
}

/**
 * Enemy panel (left sidebar) showing name, trait, and active effects
 */
export const EnemyPanel = React.memo(function EnemyPanel({ enemy, enemyId }: EnemyPanelProps) {
  const trait = useMemo(() => {
    if (!enemyId) return null;
    return ENEMY_TRAITS[enemyId];
  }, [enemyId]);

  const hpPercentage = useMemo(() => {
    return Math.max(0, Math.min(100, (enemy.hp / enemy.maxHp) * 100));
  }, [enemy.hp, enemy.maxHp]);

  const hpColor = useCallback((percentage: number) => {
    if (percentage > 50) return '#22c55e';
    if (percentage > 25) return '#eab308';
    return '#dc2626';
  }, []);

  return (
    <View style={styles.container}>
      {/* Enemy Header */}
      <View style={styles.header}>
        <Text style={styles.emoji}>{enemy.emoji}</Text>
        <Text style={styles.name} numberOfLines={1}>{enemy.name}</Text>
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
          {enemy.hp}/{enemy.maxHp} HP
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsSection}>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>ATK</Text>
          <Text style={styles.statValue}>{enemy.atk + enemy.bonusAtk}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>ARM</Text>
          <Text style={styles.statValue}>{enemy.arm + enemy.bonusArm}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>SPD</Text>
          <Text style={styles.statValue}>{enemy.spd + enemy.bonusSpd}</Text>
        </View>
      </View>

      {/* Trait */}
      {trait && (
        <View style={styles.traitSection}>
          <Text style={styles.traitLabel}>Trait</Text>
          <Text style={styles.traitName}>{trait.name}</Text>
          <Text style={styles.traitDescription} numberOfLines={2}>
            {trait.description}
          </Text>
        </View>
      )}

      {/* Status Effects */}
      <View style={styles.statusSection}>
        <Text style={styles.sectionLabel}>Status Effects</Text>
        <StatusEffectIcons combatant={enemy} size="small" direction="row" />
      </View>
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
    borderColor: '#dc2626',
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
  traitSection: {
    backgroundColor: '#2a2a3a',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  traitLabel: {
    color: '#888888',
    fontSize: 8,
    marginBottom: 2,
  },
  traitName: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  traitDescription: {
    color: '#aaaaaa',
    fontSize: 9,
    lineHeight: 12,
  },
  statusSection: {
    marginTop: 4,
  },
  sectionLabel: {
    color: '#888888',
    fontSize: 8,
    marginBottom: 4,
  },
});
