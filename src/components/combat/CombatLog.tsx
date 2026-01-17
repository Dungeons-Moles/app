/**
 * CombatLog Component - T127
 * Displays combat log entries with colored action types
 * @see specs/001-pve-dungeon-crawler/spec.md FR-016
 */

import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList } from 'react-native';
import type { CombatLogEntry } from '../../game/engine/types';
import { Typography } from '../../theme/typography';

export interface CombatLogProps {
  entries: CombatLogEntry[];
  maxVisible?: number;
}

interface FormattedEntry {
  key: string;
  turn: number;
  text: string;
  color: string;
  icon: string;
}

function formatEntry(entry: CombatLogEntry, index: number): FormattedEntry {
  const actorName =
    entry.actor === 'player' ? 'Player' : entry.actor === 'enemy' ? 'Enemy' : 'System';

  let text = '';
  let color = '#9ca3af';
  let icon = '';

  switch (entry.action) {
    case 'ATTACK':
      const damage = entry.result.damage ?? 0;
      text = `${actorName} attacks for ${damage} damage`;
      color = entry.actor === 'player' ? '#22c55e' : '#ef4444';
      icon = '⚔️';
      break;

    case 'APPLY_STATUS':
      const statusApplied = entry.result.statusApplied;
      const statusType = statusApplied?.type ?? 'status';
      const stacks = statusApplied?.stacks ?? 0;
      text = `${actorName} applies ${stacks} ${statusType}`;
      color = '#f59e0b';
      icon = getStatusIcon(statusType);
      break;

    case 'REMOVE_STATUS':
      const statusRemoved = entry.result.statusRemoved;
      text = `${statusRemoved?.type ?? 'Status'} decayed by ${statusRemoved?.stacks ?? 0}`;
      color = '#6b7280';
      icon = '📉';
      break;

    case 'TRIGGER_TRAIT':
      text = `${entry.result.effectName ?? 'Effect'} triggered`;
      color = '#a855f7';
      icon = '✨';
      break;

    case 'HEAL':
      const healing = entry.result.healing ?? 0;
      text = `${actorName} heals for ${healing}`;
      color = '#22c55e';
      icon = '💚';
      break;

    case 'LOSE_ARMOR':
      const armorLost = entry.result.armorLost ?? 0;
      text = `${actorName} loses ${armorLost} armor`;
      color = '#3b82f6';
      icon = '🛡️';
      break;

    case 'GAIN_ARMOR':
      const armorGained = entry.result.armorGained ?? 0;
      text = `${actorName} gains ${armorGained} armor`;
      color = '#3b82f6';
      icon = '🛡️';
      break;

    case 'GOLD_REWARD':
      const amount = entry.result.amount ?? 0;
      const totalGold = entry.result.totalGold ?? amount;
      text = `Gold reward +${amount} (Total ${totalGold})`;
      color = '#facc15';
      icon = '💰';
      break;

    case 'TRIGGER_ITEM':
      text = `${entry.result.effectName ?? 'Item effect'} triggered`;
      color = '#f59e0b';
      icon = '📦';
      break;

    case 'TRIGGER_ITEMSET':
      text = `${entry.result.effectName ?? 'Set bonus'} activated`;
      color = '#a855f7';
      icon = '🔗';
      break;

    case 'PHASE_TRIGGER':
      text = entry.result.effectName ?? 'Phase triggered';
      color = '#6b7280';
      icon = '🔄';
      break;

    default:
      text = `${actorName}: ${entry.action}`;
      icon = '📜';
  }

  return {
    key: `${entry.turn}-${index}`,
    turn: entry.turn,
    text,
    color,
    icon,
  };
}

function getStatusIcon(statusType: string): string {
  switch (statusType.toLowerCase()) {
    case 'chill':
      return '❄️';
    case 'shrapnel':
      return '💥';
    case 'rust':
      return '🦠';
    default:
      return '⚡';
  }
}

const LogEntry = React.memo(function LogEntry({ item }: { item: FormattedEntry }) {
  return (
    <View style={styles.entry}>
      <Text style={styles.turnNumber}>[{item.turn}]</Text>
      <Text style={styles.icon}>{item.icon}</Text>
      <Text style={[styles.text, { color: item.color }]}>{item.text}</Text>
    </View>
  );
});

export function CombatLog({ entries, maxVisible = 5 }: CombatLogProps) {
  const scrollViewRef = useRef<ScrollView>(null);

  // Format entries
  const formattedEntries = useMemo(
    () =>
      entries
        .slice(-maxVisible)
        .map((entry, index) => formatEntry(entry, entries.length - maxVisible + index)),
    [entries, maxVisible]
  );

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [formattedEntries.length]);

  if (entries.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Combat Log</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Awaiting combat...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Combat Log</Text>
        <Text style={styles.count}>{entries.length}</Text>
      </View>
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {formattedEntries.map((item) => (
          <LogEntry key={item.key} item={item} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#151518',
    borderRadius: 8,
    padding: 8,
    maxHeight: 120,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    fontFamily: Typography.header,
    fontSize: 12,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  count: {
    fontFamily: Typography.number,
    fontSize: 10,
    color: '#4b5563',
    backgroundColor: '#1f2937',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 4,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  turnNumber: {
    fontFamily: Typography.number,
    fontSize: 10,
    color: '#4b5563',
    width: 24,
  },
  icon: {
    fontSize: 10,
    width: 16,
    marginRight: 4,
  },
  text: {
    fontFamily: Typography.body,
    fontSize: 11,
    flex: 1,
  },
  emptyContainer: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#4b5563',
    fontStyle: 'italic',
  },
});

export default CombatLog;
