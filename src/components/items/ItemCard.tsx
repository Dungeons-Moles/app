/**
 * ItemCard - Display card for a single item in collection
 * T075: Create ItemCard component in src/components/items/ItemCard.tsx (name, set, stats, lock status)
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Typography } from '../../theme/typography';
import type { ItemStats, ItemTag } from '../../game/engine/types';

interface ItemCardProps {
  /** Item name */
  name: string;
  /** Item emoji/icon */
  emoji: string;
  /** Item set/tag */
  tag?: ItemTag;
  /** Item stats */
  stats?: ItemStats;
  /** Whether the item is unlocked */
  isUnlocked: boolean;
  /** Called when item is pressed */
  onPress?: () => void;
  /** Card size variant */
  size?: 'small' | 'medium' | 'large';
}

export function ItemCard({
  name,
  emoji,
  tag,
  stats,
  isUnlocked,
  onPress,
  size = 'medium',
}: ItemCardProps) {
  const sizeStyles = SIZE_STYLES[size];

  return (
    <Pressable
      style={[
        styles.container,
        sizeStyles.container,
        !isUnlocked && styles.lockedContainer,
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      {/* Item icon */}
      <View style={[styles.iconContainer, sizeStyles.iconContainer]}>
        {isUnlocked ? (
          <Text style={[styles.emoji, sizeStyles.emoji]}>{emoji}</Text>
        ) : (
          <Text style={[styles.lockIcon, sizeStyles.lockIcon]}>🔒</Text>
        )}
      </View>

      {/* Item name (for medium/large cards) */}
      {size !== 'small' && (
        <Text
          style={[styles.name, sizeStyles.name, !isUnlocked && styles.lockedText]}
          numberOfLines={1}
        >
          {isUnlocked ? name : '???'}
        </Text>
      )}

      {/* Tag badge (for medium/large cards) */}
      {size !== 'small' && tag && isUnlocked && (
        <View style={[styles.tagBadge, { backgroundColor: TAG_COLORS[tag] }]}>
          <Text style={styles.tagText}>{tag}</Text>
        </View>
      )}

      {/* Stats (for large cards only) */}
      {size === 'large' && isUnlocked && stats && (
        <View style={styles.statsContainer}>
          {stats.atk !== undefined && stats.atk !== 0 && (
            <Text style={styles.statText}>
              ATK {stats.atk > 0 ? '+' : ''}
              {stats.atk}
            </Text>
          )}
          {stats.arm !== undefined && stats.arm !== 0 && (
            <Text style={styles.statText}>
              ARM {stats.arm > 0 ? '+' : ''}
              {stats.arm}
            </Text>
          )}
          {stats.spd !== undefined && stats.spd !== 0 && (
            <Text style={styles.statText}>
              SPD {stats.spd > 0 ? '+' : ''}
              {stats.spd}
            </Text>
          )}
          {stats.dig !== undefined && stats.dig !== 0 && (
            <Text style={styles.statText}>
              DIG {stats.dig > 0 ? '+' : ''}
              {stats.dig}
            </Text>
          )}
        </View>
      )}

      {/* Lock overlay for locked items */}
      {!isUnlocked && <View style={styles.lockOverlay} />}
    </Pressable>
  );
}

const TAG_COLORS: Record<string, string> = {
  STONE: '#6B7280',
  SCOUT: '#10B981',
  GREED: '#F59E0B',
  BLAST: '#EF4444',
  FROST: '#3B82F6',
  RUST: '#92400E',
  BLOOD: '#DC2626',
  TEMPO: '#8B5CF6',
};

const SIZE_STYLES = {
  small: StyleSheet.create({
    container: {
      width: 50,
      height: 50,
      padding: 4,
    },
    iconContainer: {
      width: 36,
      height: 36,
    },
    emoji: {
      fontSize: 24,
    },
    lockIcon: {
      fontSize: 18,
    },
    name: {
      fontSize: 0, // Hidden for small
    },
  }),
  medium: StyleSheet.create({
    container: {
      width: 80,
      height: 90,
      padding: 8,
    },
    iconContainer: {
      width: 48,
      height: 48,
    },
    emoji: {
      fontSize: 32,
    },
    lockIcon: {
      fontSize: 24,
    },
    name: {
      fontSize: 10,
    },
  }),
  large: StyleSheet.create({
    container: {
      width: 120,
      height: 140,
      padding: 12,
    },
    iconContainer: {
      width: 64,
      height: 64,
    },
    emoji: {
      fontSize: 42,
    },
    lockIcon: {
      fontSize: 32,
    },
    name: {
      fontSize: 12,
    },
  }),
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(50, 60, 70, 0.9)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#556677',
  },
  lockedContainer: {
    backgroundColor: 'rgba(30, 35, 40, 0.95)',
    borderColor: '#333344',
  },
  iconContainer: {
    borderRadius: 8,
    backgroundColor: 'rgba(80, 100, 120, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  emoji: {
    textAlign: 'center',
  },
  lockIcon: {
    textAlign: 'center',
    opacity: 0.5,
  },
  name: {
    fontFamily: Typography.body,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 2,
  },
  lockedText: {
    color: '#666666',
  },
  tagBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  tagText: {
    fontFamily: Typography.body,
    fontSize: 8,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
    marginTop: 4,
  },
  statText: {
    fontFamily: Typography.number,
    fontSize: 10,
    color: '#88AACC',
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 8,
  },
});
