/**
 * ItemTooltip Component - T084
 * Displays item details: name, emoji, rarity, stats, effect text, and tags
 * @see specs/001-pve-dungeon-crawler/spec.md FR-021
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Image,
  ImageBackground,
} from 'react-native';
import type { Tool, Gear, ItemStats, ItemTag } from '../../game/engine/types';
import { getToolDefinition, TOOL_DEFINITIONS } from '../../game/entities/items';
import { GEAR_DEFINITIONS, getTierFromRarity } from '../../data/gear';
import { getItemsetsForItem } from '../../game/entities/itemsets';

const paperPanelSource = require('../../../assets/ui/panels/paper-panel.png');
const rectangleSource = require('../../../assets/ui/frames/rectangle.png');
const squareSource = require('../../../assets/ui/frames/square.png');

const STAT_ICONS = {
  HP: require('../../../assets/icons/stats/HP.png'),
  ATK: require('../../../assets/icons/stats/ATK.png'),
  ARM: require('../../../assets/icons/stats/ARM.png'),
  SPD: require('../../../assets/icons/stats/speed.png'),
  DIG: require('../../../assets/icons/stats/DIG.png'),
};

const ITEMSET_ICONS = {
  UNION_STANDARD: require('../../../assets/icons/itemsets/union_standard.png'),
  SHARD_CIRCUIT: require('../../../assets/icons/itemsets/shard_circuit.png'),
  DEMOLITION_PERMIT: require('../../../assets/icons/itemsets/demolition_permit.png'),
  FUSE_NETWORK: require('../../../assets/icons/itemsets/fuse_network.png'),
  SHRAPNEL_HARNESS: require('../../../assets/icons/itemsets/shrapnel_harness.png'),
  RUST_RITUAL: require('../../../assets/icons/itemsets/rust_ritual.png'),
  SWIFT_DIGGER_KIT: require('../../../assets/icons/itemsets/swift_digger_kit.png'),
  ROYAL_EXTRACTION: require('../../../assets/icons/itemsets/royal_extraction.png'),
  WHITEOUT_INITIATIVE: require('../../../assets/icons/itemsets/whiteout_initiative.png'),
  BLOODRUSH_PROTOCOL: require('../../../assets/icons/itemsets/bloodrush_protocol.png'),
  CORROSION_PAYLOAD: require('../../../assets/icons/itemsets/corrosion_payload.png'),
  GOLDEN_SHRAPNEL_EXCHANGE: require('../../../assets/icons/itemsets/golden_shrapnel_exchange.png'),
};

interface ItemTooltipProps {
  item: Tool | Gear | null;
  visible: boolean;
  onClose: () => void;
}

function getRarityColor(rarity: string): string {
  switch (rarity) {
    case 'COMMON':
      return '#696969'; // DimGray
    case 'GILDED':
      return '#B8860B'; // DarkGoldenRod
    case 'DIAMOND':
      return '#008B8B'; // DarkCyan
    case 'RARE':
      return '#00008B'; // DarkBlue
    case 'HEROIC':
      return '#800080'; // Purple
    case 'MYTHIC':
      return '#8B0000'; // DarkRed
    default:
      return '#696969';
  }
}

function getOriginalRarityColor(rarity: string): string {
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

const TIER_LABELS = ['I', 'II', 'III'] as const;
const TIER_COLORS = ['#808080', '#4A90D9', '#FFD700'] as const;

function getTagColor(tag: ItemTag): string {
  switch (tag) {
    case 'STONE':
      return '#8B7355';
    case 'SCOUT':
      return '#4682B4';
    case 'GREED':
      return '#DAA520'; // Darker Gold
    case 'FROST':
      return '#5F9EA0'; // CadetBlue
    case 'BLAST':
      return '#f97316';
    case 'RUST':
      return '#a16207';
    case 'BLOOD':
      return '#dc2626';
    case 'TEMPO':
      return '#9333ea';
    default:
      return '#808080';
  }
}

function StatDisplay({ stats }: { stats: ItemStats }) {
  const statEntries: { label: string; icon: any; value: number }[] = [];

  if (stats.hp) statEntries.push({ label: 'HP', icon: STAT_ICONS.HP, value: stats.hp });
  if (stats.atk) statEntries.push({ label: 'ATK', icon: STAT_ICONS.ATK, value: stats.atk });
  if (stats.arm) statEntries.push({ label: 'ARM', icon: STAT_ICONS.ARM, value: stats.arm });
  if (stats.spd) statEntries.push({ label: 'SPD', icon: STAT_ICONS.SPD, value: stats.spd });
  if (stats.dig) statEntries.push({ label: 'DIG', icon: STAT_ICONS.DIG, value: stats.dig });

  if (statEntries.length === 0) {
    return null;
  }

  return (
    <View style={styles.statsSection}>
      {statEntries.map((stat) => (
        <View key={stat.label} style={styles.statItem}>
          <Image source={stat.icon} style={styles.statIcon} resizeMode="contain" />
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
        <View key={tag} style={styles.tagContainer}>
          <Text style={[styles.tagText, { color: getTagColor(tag) }]}>{tag}</Text>
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
          <Image
            source={ITEMSET_ICONS[itemset.id as keyof typeof ITEMSET_ICONS]}
            style={styles.itemsetIcon}
            resizeMode="contain"
          />
          <Text style={styles.itemsetName}>{itemset.name}</Text>
        </View>
      ))}
    </View>
  );
}

export function ItemTooltip({ item, visible, onClose }: ItemTooltipProps) {
  const [layout, setLayout] = useState({ width: 0, height: 0 });

  if (!item) {
    return null;
  }

  const isTool = 'rarity' in item;
  const rarity = isTool ? item.rarity : item.currentRarity;
  const baseRarity = isTool ? item.rarity : item.baseRarity;
  const rarityColor = getRarityColor(rarity);
  const borderColor = getOriginalRarityColor(rarity);
  const tier = getTierFromRarity(rarity);

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

  const effectText = effectDescription ?? 'No effect.';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View
          style={styles.tooltipContainer}
          onLayout={(event) => setLayout(event.nativeEvent.layout)}
        >
          {layout.width > 0 && (
            <Image
              source={paperPanelSource}
              style={{
                position: 'absolute',
                width: layout.height,
                height: layout.width,
                top: (layout.height - layout.width) / 2,
                left: (layout.width - layout.height) / 2,
                transform: [{ rotate: '90deg' }],
              }}
              resizeMode="stretch"
            />
          )}

          <TouchableOpacity activeOpacity={1} style={styles.contentContainer}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: borderColor }]}>
              <View style={styles.iconContainer}>
                <Image
                  source={squareSource}
                  style={{ position: 'absolute', width: '100%', height: '100%' }}
                  resizeMode="stretch"
                />
                {item.image ? (
                  <Image source={item.image} style={styles.image} resizeMode="contain" />
                ) : (
                  <Text style={styles.emoji}>{item.emoji}</Text>
                )}
              </View>
              <View style={styles.headerText}>
                <Text style={styles.name}>{item.name}</Text>
                <View style={styles.rarityRow}>
                  <Text style={[styles.rarity, { color: rarityColor }]}>
                    {getRarityName(rarity)}
                    {!isTool && baseRarity !== rarity && ` (${getRarityName(baseRarity)})`}
                  </Text>
                  <Text style={[styles.tierLabel, { color: TIER_COLORS[tier - 1] }]}>
                    Tier {TIER_LABELS[tier - 1]}
                  </Text>
                </View>
              </View>
            </View>

            {/* Stats */}
            <StatDisplay stats={item.stats} />

            {/* Effect */}
            <View style={styles.effectSection}>
              <Image
                source={rectangleSource}
                style={{ position: 'absolute', width: '100%', height: '100%' }}
                resizeMode="stretch"
              />
              <Text style={styles.effectText}>{effectText}</Text>
            </View>

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
    borderRadius: 12,
    minWidth: 380,
    maxWidth: 440,
    overflow: 'hidden', // Ensures the image doesn't bleed out if calculations are slightly off
  },
  contentContainer: {
    padding: 48,
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
  },
  iconContainer: {
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    padding: 8,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  headerText: {
    flex: 1,
  },
  name: {
    color: '#3d2b1f',
    fontSize: 18,
    fontWeight: 'bold',
  },
  rarityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  rarity: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tierLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
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
  statIcon: {
    width: 16,
    height: 16,
  },
  statValue: {
    color: '#3d2b1f',
    fontSize: 14,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#5c4033',
    fontSize: 12,
  },
  effectSection: {
    paddingVertical: 12,
    marginBottom: 12,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  effectText: {
    color: '#3d2b1f',
    fontSize: 12,
    lineHeight: 16,
    paddingLeft: 12,
  },
  tagsSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  tagContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  itemsetsSection: {
    marginBottom: 8,
  },
  itemsetsSectionTitle: {
    color: '#5c4033',
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
  itemsetIcon: {
    width: 20,
    height: 20,
  },
  itemsetName: {
    color: '#8B4513',
    fontSize: 12,
  },
  typeIndicator: {
    position: 'absolute',
    top: 46,
    right: 52,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeText: {
    color: '#6b7280',
    fontSize: 10,
    textTransform: 'uppercase',
  },
});

export default ItemTooltip;
