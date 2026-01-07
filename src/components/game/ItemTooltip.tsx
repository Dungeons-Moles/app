/**
 * ItemTooltip Component - T084
 * Displays item details: name, emoji, rarity, stats, effect text, and tags
 * @see specs/001-pve-dungeon-crawler/spec.md FR-021
 */

import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import type { Tool, Gear, ItemStats, ItemTag } from '../../game/engine/types';
import { getToolDefinition, TOOL_DEFINITIONS } from '../../game/entities/items';
import { GEAR_DEFINITIONS } from '../../data/gear';
import { getItemsetsForItem } from '../../game/entities/itemsets';

interface ItemTooltipProps {
  item: Tool | Gear | null;
  visible: boolean;
  onClose: () => void;
}

function getRarityColor(rarity: string): string {
  switch (rarity) {
    case 'COMMON':
      return '#A0A0A0';
    case 'GILDED':
      return '#FFD700';
    case 'DIAMOND':
      return '#00FFFF';
    case 'RARE':
      return '#4169E1';
    case 'HEROIC':
      return '#9932CC';
    case 'MYTHIC':
      return '#FF4500';
    default:
      return '#A0A0A0';
  }
}

function getRarityName(rarity: string): string {
  return rarity.charAt(0) + rarity.slice(1).toLowerCase();
}

function getTagColor(tag: ItemTag): string {
  switch (tag) {
    case 'STONE':
      return '#8B7355';
    case 'SCOUT':
      return '#4682B4';
    case 'GREED':
      return '#FFD700';
    case 'FROST':
      return '#87CEEB';
    case 'SHRAPNEL':
      return '#CD5C5C';
    case 'SHARD':
      return '#9370DB';
    default:
      return '#808080';
  }
}

function StatDisplay({ stats }: { stats: ItemStats }) {
  const statEntries: { label: string; emoji: string; value: number }[] = [];

  if (stats.atk) statEntries.push({ label: 'ATK', emoji: '⚔️', value: stats.atk });
  if (stats.arm) statEntries.push({ label: 'ARM', emoji: '🛡️', value: stats.arm });
  if (stats.spd) statEntries.push({ label: 'SPD', emoji: '💨', value: stats.spd });
  if (stats.dig) statEntries.push({ label: 'DIG', emoji: '⛏️', value: stats.dig });
  if (stats.hp) statEntries.push({ label: 'HP', emoji: '❤️', value: stats.hp });

  if (statEntries.length === 0) {
    return null;
  }

  return (
    <View style={styles.statsSection}>
      {statEntries.map((stat) => (
        <View key={stat.label} style={styles.statItem}>
          <Text style={styles.statEmoji}>{stat.emoji}</Text>
          <Text style={styles.statValue}>+{stat.value}</Text>
          <Text style={styles.statLabel}>{stat.label}</Text>
        </View>
      ))}
    </View>
  );
}

function TagsDisplay({ tags }: { tags: ItemTag[] }) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <View style={styles.tagsSection}>
      {tags.map((tag) => (
        <View key={tag} style={[styles.tag, { backgroundColor: getTagColor(tag) }]}>
          <Text style={styles.tagText}>{tag}</Text>
        </View>
      ))}
    </View>
  );
}

function ItemsetsDisplay({ itemId }: { itemId: string }) {
  const itemsets = getItemsetsForItem(itemId as any);

  if (itemsets.length === 0) {
    return null;
  }

  return (
    <View style={styles.itemsetsSection}>
      <Text style={styles.itemsetsSectionTitle}>Part of:</Text>
      {itemsets.map((itemset) => (
        <View key={itemset.id} style={styles.itemsetRow}>
          <Text style={styles.itemsetEmoji}>{itemset.emoji}</Text>
          <Text style={styles.itemsetName}>{itemset.name}</Text>
        </View>
      ))}
    </View>
  );
}

export function ItemTooltip({ item, visible, onClose }: ItemTooltipProps) {
  if (!item) {
    return null;
  }

  const isTool = 'rarity' in item;
  const rarity = isTool ? item.rarity : item.currentRarity;
  const baseRarity = isTool ? item.rarity : item.baseRarity;
  const rarityColor = getRarityColor(rarity);

  // Get effect description from definitions
  let effectDescription: string | null = null;
  if (isTool) {
    const def = TOOL_DEFINITIONS[item.id];
    if (def?.effect) {
      effectDescription = def.effect.description;
    }
  } else {
    const def = GEAR_DEFINITIONS[item.id];
    if (def?.effect) {
      effectDescription = def.effect.description;
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.tooltipContainer}>
          <TouchableOpacity activeOpacity={1}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: rarityColor }]}>
              <Text style={styles.emoji}>{item.emoji}</Text>
              <View style={styles.headerText}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={[styles.rarity, { color: rarityColor }]}>
                  {getRarityName(rarity)}
                  {!isTool && baseRarity !== rarity && ` (${getRarityName(baseRarity)})`}
                </Text>
              </View>
            </View>

            {/* Stats */}
            <StatDisplay stats={item.stats} />

            {/* Effect */}
            {effectDescription && (
              <View style={styles.effectSection}>
                <Text style={styles.effectText}>{effectDescription}</Text>
              </View>
            )}

            {/* Tags */}
            <TagsDisplay tags={item.tags} />

            {/* Itemsets */}
            <ItemsetsDisplay itemId={item.id} />

            {/* Type indicator */}
            <View style={styles.typeIndicator}>
              <Text style={styles.typeText}>{isTool ? 'Tool' : 'Gear'}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tooltipContainer: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    minWidth: 250,
    maxWidth: 300,
    borderWidth: 1,
    borderColor: '#3A3A3A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 2,
  },
  emoji: {
    fontSize: 36,
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  rarity: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  statsSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statEmoji: {
    fontSize: 14,
  },
  statValue: {
    color: '#98FB98',
    fontSize: 14,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#808080',
    fontSize: 12,
  },
  effectSection: {
    backgroundColor: 'rgba(100, 100, 100, 0.2)',
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
  },
  effectText: {
    color: '#E0E0E0',
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  tagsSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  tagText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemsetsSection: {
    marginBottom: 8,
  },
  itemsetsSectionTitle: {
    color: '#808080',
    fontSize: 10,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  itemsetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 2,
  },
  itemsetEmoji: {
    fontSize: 14,
  },
  itemsetName: {
    color: '#FFD700',
    fontSize: 12,
  },
  typeIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(100, 100, 100, 0.3)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeText: {
    color: '#808080',
    fontSize: 10,
    textTransform: 'uppercase',
  },
});

export default ItemTooltip;
