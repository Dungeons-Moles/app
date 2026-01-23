/**
 * PlayerPanel Component - T126
 * Displays player info in combat: HP bar, stats, status effects, equipped items
 * @see specs/001-pve-dungeon-crawler/spec.md FR-049
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ImageBackground } from 'react-native';
import type { StatusEffects, Tool, Gear } from '../../game/engine/types';
import { Typography } from '../../theme/typography';

const defaultMoleImageSource = require('../../../assets/characters/default-mole.png');
const COIN_ICON = require('../../../assets/icons/coin.png');

const ICONS = {
  ATK: require('../../../assets/icons/ATK.png'),
  SPD: require('../../../assets/icons/speed.png'),
  DIG: require('../../../assets/icons/DIG.png'),
};

const SIDEBAR_BG = require('../../../assets/map/sidebar.png');

export interface PlayerPanelProps {
  name: string;
  emoji: string;
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
}

interface StatRowProps {
  label: string;
  value: number;
  icon: any;
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

const SQUARE_BG = require('../../../assets/campaign/square.png');

interface ItemBadgeProps {
  emoji: string;
  name: string;
  image?: any;
}

function ItemBadge({ emoji, name, image }: ItemBadgeProps) {
  return (
    <ImageBackground source={SQUARE_BG} style={styles.itemBadge} resizeMode="stretch">
      {image ? (
        <Image source={image} style={styles.itemImage} resizeMode="contain" />
      ) : (
        <Text style={styles.itemEmoji}>{emoji}</Text>
      )}
    </ImageBackground>
  );
}

export function PlayerPanel({
  name,
  emoji,
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

  return (
    <View style={styles.container}>
      <ImageBackground source={SIDEBAR_BG} style={styles.sidePanelBg} resizeMode="stretch">
        <View style={styles.content}>
          {/* Gold display in top left */}
          {gold !== undefined && (
            <View style={styles.goldContainer}>
              <Image source={COIN_ICON} style={styles.coinIcon} resizeMode="contain" />
              <Text style={styles.goldText}>{gold}</Text>
            </View>
          )}

          {/* Header */}
          <View style={styles.header}>
            <Image
              source={defaultMoleImageSource}
              style={styles.headerImage}
              resizeMode="contain"
            />
            <Text style={styles.name}>{name}</Text>
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

          {/* Equipped Items */}
          {hasItems && (
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
                    />
                  )}
                  {equippedGear.map((gear, index) => (
                    <ItemBadge key={index} emoji={gear.emoji} image={gear.image} name={gear.name} />
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
    width: '100%',
    height: '100%',
  },
  content: {
    padding: 16,
    height: '100%',
  },

  header: {
    alignItems: 'center',
    marginBottom: 12,
  },
  headerImage: {
    width: 60,
    height: 60,
    marginBottom: 4,
    transform: 'scaleX(-1)',
  },
  name: {
    fontFamily: Typography.header,
    fontSize: 18,
    color: '#000000',
    textAlign: 'center',
    fontWeight: 'bold',
  },

  hpSection: {
    marginBottom: 6,
  },
  hpBarBackground: {
    height: 14,
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
});
