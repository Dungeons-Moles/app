/**
 * ItemGrid - Grid display for item collection
 * T074: Create ItemGrid component in src/components/items/ItemGrid.tsx (80-item grid)
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { ItemCard } from './ItemCard';
import { Typography } from '../../theme/typography';
import type { ItemStats, ItemTag } from '../../game/engine/types';

/** Item data for display in grid */
export interface GridItem {
  id: number;
  name: string;
  emoji: string;
  tag?: ItemTag;
  stats?: ItemStats;
}

interface ItemGridProps {
  /** All items to display */
  items: GridItem[];
  /** Set of unlocked item IDs */
  unlockedIds: Set<number>;
  /** Called when an item is pressed */
  onItemPress?: (item: GridItem) => void;
  /** Card size variant */
  cardSize?: 'small' | 'medium' | 'large';
  /** Number of columns */
  columns?: number;
  /** Whether to show progress header */
  showProgress?: boolean;
}

export function ItemGrid({
  items,
  unlockedIds,
  onItemPress,
  cardSize = 'medium',
  columns = 8,
  showProgress = true,
}: ItemGridProps) {
  const unlockedCount = items.filter((item) => unlockedIds.has(item.id)).length;
  const totalCount = items.length;
  const progress = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;
  const isComplete = unlockedCount === totalCount && totalCount > 0;

  return (
    <View style={styles.container}>
      {/* Progress header */}
      {showProgress && (
        <View style={styles.progressHeader}>
          <Text style={styles.progressTitle}>
            {isComplete ? 'Collection Complete!' : 'Item Collection'}
          </Text>
          <View style={styles.progressRow}>
            <Text style={styles.progressText}>
              {unlockedCount}/{totalCount} items unlocked
            </Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.progressPercent}>{progress}%</Text>
          </View>
        </View>
      )}

      {/* Item grid */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.grid, { maxWidth: getGridWidth(columns, cardSize) }]}>
          {items.map((item) => (
            <ItemCard
              key={item.id}
              name={item.name}
              emoji={item.emoji}
              tag={item.tag}
              stats={item.stats}
              isUnlocked={unlockedIds.has(item.id)}
              onPress={onItemPress ? () => onItemPress(item) : undefined}
              size={cardSize}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/** Calculate max grid width based on columns and card size */
function getGridWidth(columns: number, size: 'small' | 'medium' | 'large'): number {
  const cardWidths = { small: 50, medium: 80, large: 120 };
  const gap = 8;
  return columns * (cardWidths[size] + gap);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  progressHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(30, 40, 50, 0.9)',
    borderBottomWidth: 1,
    borderBottomColor: '#334455',
  },
  progressTitle: {
    fontFamily: Typography.header,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressText: {
    fontFamily: Typography.number,
    fontSize: 14,
    color: '#AAAAAA',
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(80, 90, 100, 0.5)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#44AA44',
    borderRadius: 4,
  },
  progressPercent: {
    fontFamily: Typography.number,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#44AA44',
    minWidth: 45,
    textAlign: 'right',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
});
