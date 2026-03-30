/**
 * PlayerPanel Component - T126
 * Displays player info in combat: HP bar, stats, status effects, equipped items
 * @see specs/001-pve-dungeon-crawler/spec.md FR-049
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  type ImageSourcePropType,
} from 'react-native';
import { CachedImageBackground } from '../common/CachedImageBackground';
import type { StatusEffects, Tool, Gear, ItemRarity } from '../../game/engine/types';
import { getTierFromRarity } from '../../data/gear';
import { Typography } from '../../theme/typography';

const defaultMoleImageSource = require('../../../assets/entities/characters/default-mole.webp');
const COIN_ICON = require('../../../assets/icons/ui/coin.webp');

const ICONS = {
  ATK: require('../../../assets/icons/stats/ATK.webp'),
  SPD: require('../../../assets/icons/stats/speed.webp'),
  DIG: require('../../../assets/icons/stats/DIG.webp'),
};

const SIDEBAR_BG = require('../../../assets/ui/panels/sidebar.webp');

export interface PlayerPanelProps {
  name: string;
  emoji: string;
  /** Optional character image (skin). Falls back to default mole if not provided. */
  imageSource?: ImageSourcePropType;
  hp: number;
  maxHp: number;
  atk: number;
  arm: number;
  maxArm: number;
  spd: number;
  dig: number;
  gold?: number;
  statusEffects: StatusEffects;
  equippedTool?: Tool | null;
  equippedGear?: Gear[];
  /** Optional subtitle (e.g., wallet address for Pit Draft) */
  subtitle?: string;
  /** Scale factor for compact/mobile views (default 1) */
  scale?: number;
}

interface StatRowProps {
  label: string;
  value: number;
  icon: any;
  scale?: number;
}

function StatRow({ label, value, icon, scale = 1 }: StatRowProps) {
  return (
    <View style={styles.statRow}>
      <Image
        source={icon}
        style={{ width: 18 * scale, height: 18 * scale, marginRight: 2 * scale }}
        resizeMode="contain"
      />
      <Text style={[styles.statLabel, { fontSize: 10 * scale }]}>{label}</Text>
      <Text style={[styles.statValue, { fontSize: 13 * scale }]}>{value}</Text>
    </View>
  );
}

const SQUARE_BG = require('../../../assets/ui/frames/square.webp');
const SQUARE_BG_BLUE = require('../../../assets/ui/frames/square-blue.webp');
const SQUARE_BG_YELLOW = require('../../../assets/ui/frames/square-yellow.webp');

const TIER_BG_COLORS: Record<number, string> = {
  2: 'rgba(59, 130, 246, 0.15)',
  3: 'rgba(234, 179, 8, 0.18)',
};

function getTierSlotBg(rarity: ItemRarity): { source: any; bgColor?: string } {
  const tier = getTierFromRarity(rarity);
  switch (tier) {
    case 2:
      return { source: SQUARE_BG_BLUE, bgColor: TIER_BG_COLORS[2] };
    case 3:
      return { source: SQUARE_BG_YELLOW, bgColor: TIER_BG_COLORS[3] };
    default:
      return { source: SQUARE_BG };
  }
}

interface ItemBadgeProps {
  emoji: string;
  name: string;
  image?: any;
  rarity?: ItemRarity;
  scale?: number;
}

function ItemBadge({ emoji, name, image, rarity, scale = 1 }: ItemBadgeProps) {
  const { source: slotBg, bgColor } = rarity
    ? getTierSlotBg(rarity)
    : { source: SQUARE_BG, bgColor: undefined };
  return (
    <CachedImageBackground
      source={slotBg}
      style={[
        {
          width: 32 * scale,
          height: 32 * scale,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: bgColor,
          borderRadius: 4 * scale,
        },
      ]}
      resizeMode="stretch"
    >
      {image ? (
        <Image
          source={image}
          style={{ width: 24 * scale, height: 24 * scale }}
          resizeMode="contain"
        />
      ) : (
        <Text style={{ fontSize: 16 * scale }}>{emoji}</Text>
      )}
    </CachedImageBackground>
  );
}

export const PlayerPanel = React.memo(function PlayerPanel({
  name,
  emoji,
  imageSource,
  hp,
  maxHp,
  atk,
  arm,
  maxArm,
  spd,
  dig,
  gold,
  statusEffects,
  equippedTool,
  equippedGear = [],
  subtitle,
  scale = 1,
}: PlayerPanelProps) {
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

  const hasItems = equippedTool || equippedGear.length > 0;
  const isCompact = scale > 1;

  const containerStyle = useMemo(
    () => [styles.container, isCompact && { height: '80%' as const, alignSelf: 'center' as const }],
    [isCompact]
  );
  const scrollContentStyle = useMemo(() => ({ padding: 16 * scale }), [scale]);

  return (
    <View style={containerStyle}>
      <CachedImageBackground source={SIDEBAR_BG} style={styles.sidePanelBg} resizeMode="stretch">
        <ScrollView
          style={styles.flex1}
          contentContainerStyle={scrollContentStyle}
          showsVerticalScrollIndicator={false}
        >
          {/* Gold display in top left */}
          {gold !== undefined && (
            <View
              style={[
                styles.goldContainer,
                { top: 10 * scale, paddingHorizontal: 12 * scale, paddingVertical: 6 * scale },
              ]}
            >
              <Image
                source={COIN_ICON}
                style={{ width: 18 * scale, height: 18 * scale }}
                resizeMode="contain"
              />
              <Text style={[styles.goldText, { fontSize: 14 * scale }]}>{gold}</Text>
            </View>
          )}

          {/* Header */}
          <View style={[styles.header, { marginBottom: 12 * scale }]}>
            <Image
              source={imageSource ?? defaultMoleImageSource}
              style={{
                width: 60 * scale,
                height: 60 * scale,
                marginBottom: 4 * scale,
                transform: 'scaleX(-1)',
              }}
              resizeMode="contain"
            />
            <Text style={[styles.name, { fontSize: 18 * scale }]}>{name}</Text>
            {subtitle && (
              <Text
                style={[styles.subtitle, { fontSize: 9 * scale, marginTop: 2 * scale }]}
                numberOfLines={1}
              >
                ({subtitle})
              </Text>
            )}
          </View>

          {/* HP Bar */}
          <View style={[styles.hpSection, { marginBottom: 6 * scale }]}>
            <View style={[styles.hpBarBackground, { height: 14 * scale }]}>
              <View
                style={[styles.hpBarFill, { width: `${hpPercent}%`, backgroundColor: hpBarColor }]}
              />
            </View>
            <Text style={[styles.hpText, { fontSize: 12 * scale, marginTop: 4 * scale }]}>
              {hp}/{maxHp}
            </Text>
          </View>

          {/* Armor Bar */}
          <View style={[styles.armorSection, { marginBottom: 12 * scale }]}>
            <View style={[styles.armorBarBackground, { height: 10 * scale }]}>
              <View style={[styles.armorBarFill, { width: `${armorPercent}%` }]} />
            </View>
            <Text style={[styles.armorText, { fontSize: 11 * scale, marginTop: 3 * scale }]}>
              {arm}/{maxArm}
            </Text>
          </View>

          {/* Stats */}
          <View
            style={[
              styles.statsSection,
              { marginBottom: 12 * scale, paddingBottom: 12 * scale },
            ]}
          >
            <View style={[styles.statsRow, { marginBottom: 8 * scale }]}>
              <StatRow label="ATK" value={atk} icon={ICONS.ATK} scale={scale} />
              <StatRow label="DIG" value={dig} icon={ICONS.DIG} scale={scale} />
            </View>
            <View style={[styles.statsRow, { marginBottom: 8 * scale }]}>
              <StatRow label="SPD" value={spd} icon={ICONS.SPD} scale={scale} />
            </View>
          </View>

          {/* Equipped Items */}
          {hasItems && (
            <View>
              <Text style={[styles.sectionTitle, { fontSize: 12 * scale, marginBottom: 6 * scale }]}>
                Equipment
              </Text>
              <View style={[styles.itemsGrid, { gap: 4 * scale }]}>
                {equippedTool && (
                  <ItemBadge
                    emoji={equippedTool.emoji}
                    image={equippedTool.image}
                    name={equippedTool.name}
                    rarity={equippedTool.rarity}
                    scale={scale}
                  />
                )}
                {equippedGear.map((gear, index) => (
                  <ItemBadge
                    key={index}
                    emoji={gear.emoji}
                    image={gear.image}
                    name={gear.name}
                    rarity={gear.currentRarity}
                    scale={scale}
                  />
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </CachedImageBackground>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '25%',
    height: '100%',
    overflow: 'hidden',
  },
  sidePanelBg: {
    width: '100%',
    height: '100%',
  },
  flex1: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
  },
  name: {
    fontFamily: Typography.header,
    color: '#000000',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  subtitle: {
    fontFamily: Typography.body,
    color: '#666666',
    textAlign: 'center',
  },
  hpSection: {},
  hpBarBackground: {
    backgroundColor: '#2a2a3a',
    borderRadius: 0,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#000',
  },
  hpBarFill: {
    height: '100%',
    borderRadius: 0,
  },
  hpText: {
    fontFamily: Typography.number,
    color: '#000000',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  armorSection: {},
  armorBarBackground: {
    backgroundColor: '#2a2a3a',
    borderRadius: 0,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#000',
  },
  armorBarFill: {
    height: '100%',
    borderRadius: 0,
    backgroundColor: '#a855f7',
  },
  armorText: {
    fontFamily: Typography.number,
    color: '#000000',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  statsSection: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.2)',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
  },
  statLabel: {
    fontFamily: Typography.header,
    color: '#000000',
    flex: 1,
    fontWeight: 'bold',
  },
  statValue: {
    fontFamily: Typography.number,
    color: '#000000',
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontFamily: Typography.header,
    color: '#333333',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: 'bold',
  },
  itemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  goldContainer: {
    position: 'absolute',
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 12,
    zIndex: 10,
  },
  goldText: {
    fontFamily: Typography.number,
    color: '#000000',
    fontWeight: 'bold',
  },
});
