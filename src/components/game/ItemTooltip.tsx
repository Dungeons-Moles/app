/**
 * ItemTooltip Component - T084
 * Displays item details: name, emoji, rarity, stats, effect text, and tags
 * @see specs/001-pve-dungeon-crawler/spec.md FR-021
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { InlineModal } from '../InlineModal';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';
import type { Tool, Gear, ItemStats, ItemTag } from '../../game/engine/types';
import { getToolDefinition, TOOL_DEFINITIONS, getToolScaledEffectDescription } from '../../game/entities/items';
import { GEAR_DEFINITIONS, getTierFromRarity, getScaledEffectDescription } from '../../data/gear';
import { getItemsetsForItem } from '../../game/entities/itemsets';
import { useAudio } from '@/contexts/AudioContext';

const paperPanelSource = require('../../../assets/ui/panels/paper-panel.webp');
const squareSource = require('../../../assets/ui/frames/square.webp');
const squareBlueSource = require('../../../assets/ui/frames/square-blue.webp');
const squareYellowSource = require('../../../assets/ui/frames/square-yellow.webp');

const STAT_ICONS = {
  HP: require('../../../assets/icons/stats/HP.webp'),
  ATK: require('../../../assets/icons/stats/ATK.webp'),
  ARM: require('../../../assets/icons/stats/ARM.webp'),
  SPD: require('../../../assets/icons/stats/speed.webp'),
  DIG: require('../../../assets/icons/stats/DIG.webp'),
};

const ITEMSET_ICONS = {
  UNION_STANDARD: require('../../../assets/icons/itemsets/union_standard.webp'),
  SHARD_CIRCUIT: require('../../../assets/icons/itemsets/shard_circuit.webp'),
  DEMOLITION_PERMIT: require('../../../assets/icons/itemsets/demolition_permit.webp'),
  FUSE_NETWORK: require('../../../assets/icons/itemsets/fuse_network.webp'),
  SHRAPNEL_HARNESS: require('../../../assets/icons/itemsets/shrapnel_harness.webp'),
  RUST_RITUAL: require('../../../assets/icons/itemsets/rust_ritual.webp'),
  SWIFT_DIGGER_KIT: require('../../../assets/icons/itemsets/swift_digger_kit.webp'),
  ROYAL_EXTRACTION: require('../../../assets/icons/itemsets/royal_extraction.webp'),
  WHITEOUT_INITIATIVE: require('../../../assets/icons/itemsets/whiteout_initiative.webp'),
  BLOODRUSH_PROTOCOL: require('../../../assets/icons/itemsets/bloodrush_protocol.webp'),
  CORROSION_PAYLOAD: require('../../../assets/icons/itemsets/corrosion_payload.webp'),
  GOLDEN_SHRAPNEL_EXCHANGE: require('../../../assets/icons/itemsets/golden_shrapnel_exchange.webp'),
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
    case 'SAPPHIRE':
      return '#2563EB'; // Blue
    case 'GOLDEN':
      return '#B8860B'; // DarkGoldenRod
    case 'RARE':
      return '#A855F7';
    case 'HEROIC':
      return '#F97316';
    case 'MYTHIC':
      return '#FFD700';
    default:
      return '#696969';
  }
}

function getOriginalRarityColor(rarity: string): string {
  switch (rarity) {
    case 'COMMON':
      return '#A0A0A0';
    case 'SAPPHIRE':
      return '#4A90D9';
    case 'GOLDEN':
      return '#FFD700';
    case 'RARE':
      return '#A855F7';
    case 'HEROIC':
      return '#F97316';
    case 'MYTHIC':
      return '#FFD700';
    default:
      return '#A0A0A0';
  }
}

function getRarityName(rarity: string): string {
  return rarity.charAt(0) + rarity.slice(1).toLowerCase();
}

const TIER_LABELS = ['I', 'II', 'III'] as const;
const TIER_COLORS = ['#808080', '#4A90D9', '#CC9900'] as const;

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

function StatDisplay({ stats, scale = 1 }: { stats: ItemStats; scale?: number }) {
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
          <Image
            source={stat.icon}
            style={{ width: 16 * scale, height: 16 * scale }}
            contentFit="contain"
          />
          <Text style={[styles.statValue, { fontSize: 14 * scale }]}>+{stat.value}</Text>
          <Text style={[styles.statLabel, { fontSize: 12 * scale }]}>{stat.label}</Text>
        </View>
      ))}
    </View>
  );
}

function TagsDisplay({ tags, scale = 1 }: { tags: ItemTag[]; scale?: number }) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <View style={styles.tagsSection}>
      {tags.map((tag) => (
        <View key={tag} style={styles.tagContainer}>
          <Text style={[styles.tagText, { color: getTagColor(tag), fontSize: 10 * scale }]}>
            {tag}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ItemsetsDisplay({ itemId, scale = 1 }: { itemId: string; scale?: number }) {
  const itemsets = getItemsetsForItem(itemId as any);

  if (itemsets.length === 0) {
    return null;
  }

  return (
    <View style={styles.itemsetsSection}>
      <Text style={[styles.itemsetsSectionTitle, { fontSize: 10 * scale }]}>Part of:</Text>
      {itemsets.map((itemset) => (
        <View key={itemset.id} style={styles.itemsetRow}>
          <Image
            source={ITEMSET_ICONS[itemset.id as keyof typeof ITEMSET_ICONS]}
            style={{ width: 20 * scale, height: 20 * scale }}
            contentFit="contain"
          />
          <Text style={[styles.itemsetName, { fontSize: 12 * scale }]}>{itemset.name}</Text>
        </View>
      ))}
    </View>
  );
}

export function ItemTooltip({ item, visible, onClose }: ItemTooltipProps) {
  const { playSfx } = useAudio();
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const isCompact = useScreenVariant() === 'compact';
  const s = isCompact ? 1.5 : 1;

  const handleClose = () => {
    playSfx('ui_click');
    onClose();
  };

  if (!item) {
    return null;
  }

  const isTool = 'rarity' in item;
  const rarity = isTool ? item.rarity : item.currentRarity;
  const baseRarity = isTool ? item.rarity : item.baseRarity;
  const rarityColor = getRarityColor(rarity);
  const borderColor = getOriginalRarityColor(rarity);
  const tier = getTierFromRarity(rarity);

  // Get effect description scaled to current tier
  let effectDescription: string | null = null;
  if (isTool) {
    effectDescription = getToolScaledEffectDescription(item.id, rarity);
  } else {
    effectDescription = getScaledEffectDescription(item.id, rarity);
  }

  return (
    <InlineModal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose}>
        <View
          style={[styles.tooltipContainer, { minWidth: 380 * s, maxWidth: 440 * s }]}
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
              contentFit="fill"
            />
          )}

          <TouchableOpacity
            activeOpacity={1}
            style={[styles.contentContainer, { padding: 48 * s }]}
          >
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: borderColor }]}>
              <View style={[styles.iconContainer, { width: 64 * s, height: 64 * s, backgroundColor: tier === 3 ? 'rgba(234, 179, 8, 0.18)' : tier === 2 ? 'rgba(59, 130, 246, 0.15)' : undefined, borderRadius: 4 * s }]}>
                <Image
                  source={tier === 3 ? squareYellowSource : tier === 2 ? squareBlueSource : squareSource}
                  style={{ position: 'absolute', width: '100%', height: '100%' }}
                  contentFit="fill"
                />
                {item.image ? (
                  <Image source={item.image} style={styles.image} contentFit="contain" />
                ) : (
                  <Text style={[styles.emoji, { fontSize: 36 * s }]}>{item.emoji}</Text>
                )}
              </View>
              <View style={styles.headerText}>
                <Text style={[styles.name, { fontSize: 18 * s }]}>{item.name}</Text>
                <View style={styles.rarityRow}>
                  <Text style={[styles.rarity, { color: rarityColor, fontSize: 12 * s }]}>
                    {getRarityName(rarity)}
                    {!isTool && baseRarity !== rarity && ` (${getRarityName(baseRarity)})`}
                  </Text>
                  <Text
                    style={[styles.tierLabel, { color: TIER_COLORS[tier - 1], fontSize: 11 * s }]}
                  >
                    Tier {TIER_LABELS[tier - 1]}
                  </Text>
                </View>
              </View>
            </View>

            {/* Stats */}
            <StatDisplay stats={item.stats} scale={s} />

            {/* Effect */}
            {effectDescription && (
              <View style={styles.effectSection}>
                <Text style={[styles.effectText, { fontSize: 12 * s, lineHeight: 16 * s }]}>
                  {effectDescription}
                </Text>
              </View>
            )}

            {/* Tags */}
            <TagsDisplay tags={item.tags} scale={s} />

            {/* Itemsets */}
            <ItemsetsDisplay itemId={item.id} scale={s} />

            {/* Type indicator */}
            <View style={styles.typeIndicator}>
              <Text style={[styles.typeText, { fontSize: 10 * s }]}>
                {isTool ? 'Tool' : 'Gear'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </InlineModal>
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
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#3d2b1f',
    borderRadius: 4,
  },
  effectText: {
    color: '#3d2b1f',
    fontSize: 12,
    lineHeight: 16,
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
