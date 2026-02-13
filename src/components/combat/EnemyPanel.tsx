/**
 * EnemyPanel Component - T125
 * Displays enemy info in combat: name, emoji, HP bar, stats, trait, status effects
 * @see specs/001-pve-dungeon-crawler/spec.md FR-048
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ImageBackground,
  type ImageSourcePropType,
} from 'react-native';
import type { StatusEffects, Tool, Gear, ItemRarity } from '../../game/engine/types';
import { getTierFromRarity } from '../../data/gear';
import { Typography } from '../../theme/typography';

const ICONS = {
  ATK: require('../../../assets/icons/stats/ATK.png'),
  SPD: require('../../../assets/icons/stats/speed.png'),
  DIG: require('../../../assets/icons/stats/DIG.png'),
};
const COIN_ICON = require('../../../assets/icons/ui/coin.png');

const SIDEBAR_BG = require('../../../assets/ui/panels/sidebar.png');
const SQUARE_BG = require('../../../assets/ui/frames/square.png');

function getTierBorderColor(rarity: ItemRarity): string | null {
  const tier = getTierFromRarity(rarity);
  switch (tier) {
    case 2:
      return '#4A90D9';
    case 3:
      return '#FFD700';
    default:
      return null;
  }
}

interface ItemBadgeProps {
  emoji: string;
  name: string;
  image?: ImageSourcePropType;
  rarity?: ItemRarity;
}

function ItemBadge({ emoji, image, rarity }: ItemBadgeProps) {
  const borderColor = rarity ? getTierBorderColor(rarity) : null;
  return (
    <ImageBackground
      source={SQUARE_BG}
      style={[styles.itemBadge, borderColor && { borderWidth: 2, borderColor }]}
      resizeMode="stretch"
    >
      {image ? (
        <Image source={image} style={styles.itemImage} resizeMode="contain" />
      ) : (
        <Text style={styles.itemEmoji}>{emoji}</Text>
      )}
    </ImageBackground>
  );
}

export interface EnemyPanelProps {
  name: string;
  emoji: string;
  imageSource?: ImageSourcePropType;
  hp: number;
  maxHp: number;
  atk: number;
  arm: number;
  maxArm: number;
  spd: number;
  dig: number;
  statusEffects: StatusEffects;
  trait?: {
    name: string;
    description: string;
  };
  /** Optional subtitle (e.g., wallet address for Pit Draft) */
  subtitle?: string;
  /** Optional enemy gold (for PvP combat display) */
  gold?: number;
  /** Optional equipped tool (for Pit Draft PvP) */
  equippedTool?: Tool | null;
  /** Optional equipped gear (for Pit Draft PvP) */
  equippedGear?: Gear[];
  /** Optional vertical adjustment for portrait alignment */
  imageOffsetY?: number;
}

interface StatRowProps {
  label: string;
  value: number;
  icon: ImageSourcePropType;
}

function StatRow({ label, value, icon }: StatRowProps) {
  return (
    <View style={styles.statRow}>
      <Image source={icon} style={styles.statIcon} resizeMode="contain" />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export function EnemyPanel({
  name,
  emoji: _emoji,
  hp,
  maxHp,
  atk,
  arm,
  maxArm,
  spd,
  dig,
  statusEffects: _statusEffects,
  trait,
  imageSource,
  subtitle,
  gold,
  equippedTool,
  equippedGear = [],
  imageOffsetY = 0,
}: EnemyPanelProps) {
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

  return (
    <View style={styles.container}>
      <ImageBackground source={SIDEBAR_BG} style={styles.sidePanelBg} resizeMode="stretch">
        <View style={styles.content}>
          {gold !== undefined && (
            <View style={styles.goldContainer}>
              <Image source={COIN_ICON} style={styles.coinIcon} resizeMode="contain" />
              <Text style={styles.goldText}>{gold}</Text>
            </View>
          )}

          {/* Header */}
          <View style={styles.header}>
            {imageSource && (
              <Image
                source={imageSource}
                style={[styles.image, imageOffsetY !== 0 && { marginTop: imageOffsetY }]}
                resizeMode="contain"
              />
            )}
            <Text style={styles.name} numberOfLines={2}>
              {name}
            </Text>
            {subtitle && (
              <Text style={styles.subtitle} numberOfLines={1}>
                ({subtitle})
              </Text>
            )}
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
            <View style={styles.statsRow}>
              <StatRow label="ATK" value={atk} icon={ICONS.ATK} />
              <StatRow label="DIG" value={dig} icon={ICONS.DIG} />
            </View>
            <View style={styles.statsRow}>
              <StatRow label="SPD" value={spd} icon={ICONS.SPD} />
            </View>
          </View>

          {/* Trait */}
          {trait && (
            <View style={styles.traitSection}>
              <Text style={styles.traitName}>{trait.name}</Text>
              <Text style={styles.traitDescription} numberOfLines={3}>
                {trait.description}
              </Text>
            </View>
          )}

          {/* Equipment (Pit Draft PvP) */}
          {(equippedTool || equippedGear.length > 0) && (
            <View style={styles.itemsSection}>
              <Text style={styles.sectionTitle}>Equipment</Text>
              <ScrollView
                style={styles.itemsScroll}
                contentContainerStyle={styles.itemsScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.itemsGrid}>
                  {equippedTool && (
                    <ItemBadge
                      emoji={equippedTool.emoji}
                      image={equippedTool.image}
                      name={equippedTool.name}
                      rarity={equippedTool.rarity}
                    />
                  )}
                  {equippedGear.map((gear, index) => (
                    <ItemBadge
                      key={index}
                      emoji={gear.emoji}
                      image={gear.image}
                      name={gear.name}
                      rarity={gear.currentRarity}
                    />
                  ))}
                </View>
              </ScrollView>
            </View>
          )}
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '25%',
    height: '100%',
    overflow: 'hidden',
  },
  sidePanelBg: {
    margin: 'auto',
    width: '100%',
    height: '100%',
  },
  content: {
    padding: 12,
    height: '100%',
  },
  goldContainer: {
    position: 'absolute',
    top: 10,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    zIndex: 10,
  },
  coinIcon: {
    width: 24,
    height: 24,
  },
  goldText: {
    fontFamily: Typography.number,
    fontSize: 18,
    color: '#000000',
    fontWeight: 'bold',
  },
  header: {
    alignItems: 'center',
    marginBottom: 12,
  },
  image: {
    width: 60,
    height: 60,
    marginBottom: 4,
  },
  name: {
    fontFamily: Typography.header,
    fontSize: 18,
    color: '#000000',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  subtitle: {
    fontFamily: Typography.body,
    fontSize: 9,
    color: '#666666',
    textAlign: 'center',
    marginTop: 2,
  },
  hpSection: {
    marginBottom: 6,
  },
  hpBarBackground: {
    height: 14,
    backgroundColor: '#2a2a3a',
    borderRadius: 0, // Rectangle
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#000',
  },
  hpBarFill: {
    height: '100%',
    borderRadius: 0, // Rectangle
  },
  hpText: {
    fontFamily: Typography.number,
    fontSize: 12,
    color: '#000000',
    textAlign: 'center',
    marginTop: 4,
    fontWeight: 'bold',
  },
  armorSection: {
    marginBottom: 12,
  },
  armorBarBackground: {
    height: 10,
    backgroundColor: '#2a2a3a',
    borderRadius: 0, // Rectangle
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#000',
  },
  armorBarFill: {
    height: '100%',
    borderRadius: 0, // Rectangle
    backgroundColor: '#a855f7',
  },
  armorText: {
    fontFamily: Typography.number,
    fontSize: 11,
    color: '#000000',
    textAlign: 'center',
    marginTop: 3,
    fontWeight: 'bold',
  },
  statsSection: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.2)',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
  },
  statIcon: {
    width: 18,
    height: 18,
    marginRight: 8,
  },
  statLabel: {
    fontFamily: Typography.header,
    fontSize: 12,
    color: '#000000',
    flex: 1,
    fontWeight: 'bold',
  },
  statValue: {
    fontFamily: Typography.number,
    fontSize: 16,
    color: '#000000',
    fontWeight: 'bold',
  },
  traitSection: {
    padding: 8,
    marginBottom: 12,
    marginHorizontal: 5,
    borderWidth: 2,
    borderColor: '#8B4513',
    backgroundColor: 'rgba(139, 69, 19, 0.1)',
    borderRadius: 4,
  },
  traitName: {
    fontFamily: Typography.header,
    fontSize: 13,
    color: '#000000',
    marginBottom: 4,
    fontWeight: 'bold',
  },
  traitDescription: {
    fontFamily: Typography.body,
    fontSize: 10,
    color: '#333333',
    lineHeight: 14,
  },
  sectionTitle: {
    fontFamily: Typography.header,
    fontSize: 12,
    color: '#333333',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: 'bold',
  },
  itemsSection: {
    flex: 1,
    minHeight: 0,
  },
  itemsScroll: {
    flex: 1,
  },
  itemsScrollContent: {
    paddingBottom: 8,
  },
  itemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  itemBadge: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemEmoji: {
    fontSize: 16,
  },
  itemImage: {
    width: 24,
    height: 24,
  },
});
