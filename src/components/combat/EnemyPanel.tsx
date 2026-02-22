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
  scale?: number;
}

function ItemBadge({ emoji, image, rarity, scale = 1 }: ItemBadgeProps) {
  const borderColor = rarity ? getTierBorderColor(rarity) : null;
  return (
    <ImageBackground
      source={SQUARE_BG}
      style={[
        { width: 32 * scale, height: 32 * scale, justifyContent: 'center', alignItems: 'center' },
        borderColor && { borderWidth: 2, borderColor },
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
  /** Scale factor for compact/mobile views (default 1) */
  scale?: number;
}

interface StatRowProps {
  label: string;
  value: number;
  icon: ImageSourcePropType;
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
  scale = 1,
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

  const isCompact = scale > 1;

  const containerStyle = useMemo(
    () => [styles.container, isCompact && { height: '80%' as const, alignSelf: 'center' as const }],
    [isCompact]
  );
  const scrollContentStyle = useMemo(() => ({ padding: 12 * scale }), [scale]);

  return (
    <View style={containerStyle}>
      <ImageBackground source={SIDEBAR_BG} style={styles.sidePanelBg} resizeMode="stretch">
        <ScrollView
          style={styles.flex1}
          contentContainerStyle={scrollContentStyle}
          showsVerticalScrollIndicator={false}
        >
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
            {imageSource && (
              <Image
                source={imageSource}
                style={[
                  { width: 60 * scale, height: 60 * scale, marginBottom: 4 * scale },
                  imageOffsetY !== 0 && { marginTop: imageOffsetY * scale },
                ]}
                resizeMode="contain"
              />
            )}
            <Text style={[styles.name, { fontSize: 18 * scale }]} numberOfLines={2}>
              {name}
            </Text>
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

          {/* Trait */}
          {trait && (
            <View
              style={[
                styles.traitSection,
                {
                  padding: 8 * scale,
                  marginBottom: 12 * scale,
                  marginHorizontal: 5 * scale,
                },
              ]}
            >
              <Text style={[styles.traitName, { fontSize: 13 * scale, marginBottom: 4 * scale }]}>
                {trait.name}
              </Text>
              <Text
                style={[
                  styles.traitDescription,
                  { fontSize: 10 * scale, lineHeight: 14 * scale },
                ]}
                numberOfLines={3}
              >
                {trait.description}
              </Text>
            </View>
          )}

          {/* Equipment (Pit Draft PvP) */}
          {(equippedTool || equippedGear.length > 0) && (
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
  flex1: {
    flex: 1,
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
  traitSection: {
    borderWidth: 2,
    borderColor: '#8B4513',
    backgroundColor: 'rgba(139, 69, 19, 0.1)',
    borderRadius: 4,
  },
  traitName: {
    fontFamily: Typography.header,
    color: '#000000',
    fontWeight: 'bold',
  },
  traitDescription: {
    fontFamily: Typography.body,
    color: '#333333',
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
});
