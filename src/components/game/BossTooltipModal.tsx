/**
 * BossTooltipModal - Displays detailed boss information
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  Image,
  ImageBackground,
  ScrollView,
  Platform,
} from 'react-native';
import { Typography } from '../../theme/typography';
import { getEntityImageSource } from './entityImages';
import { Dimensions } from 'react-native';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';
import type { BossDefinition } from '../../data/bosses';
import type { Tool, Gear } from '../../game/engine/types';
import { ItemTooltip } from './ItemTooltip';

const SIDEBAR_BG = require('../../../assets/ui/panels/sidebar.png');
const SLOT_BG = require('../../../assets/ui/frames/square.png');
const DEFAULT_MOLE_IMAGE_SOURCE = require('../../../assets/entities/characters/default-mole.png');
const COIN_ICON = require('../../../assets/icons/ui/coin.png');
const HP_ICON = require('../../../assets/icons/stats/HP.png');
const ATK_ICON = require('../../../assets/icons/stats/ATK.png');
const ARM_ICON = require('../../../assets/icons/stats/ARM.png');
const SPD_ICON = require('../../../assets/icons/stats/speed.png');
const DIG_ICON = require('../../../assets/icons/stats/DIG.png');
const OIL_ATK_ICON = require('../../../assets/icons/oils/ATK.png');
const OIL_DIG_ICON = require('../../../assets/icons/oils/DIG.png');
const OIL_SPD_ICON = require('../../../assets/icons/oils/SPD.png');
const OIL_ARM_ICON = require('../../../assets/icons/oils/ARM.png');

interface BossTooltipModalProps {
  visible: boolean;
  boss: BossDefinition | null;
  pvpDetails?: PvpDetails | null;
  pvpLoading?: boolean;
  onClose: () => void;
}

export interface PvpDetails {
  name: string;
  sourceLabel: string;
  tool: Tool | null;
  gear: Gear[];
  stats: {
    hp: number;
    atk: number;
    arm: number;
    spd: number;
    dig: number;
    gold: number;
  };
  week?: number;
}

export function BossTooltipModal({
  visible,
  boss,
  pvpDetails = null,
  pvpLoading = false,
  onClose,
}: BossTooltipModalProps) {
  const [inspectedItem, setInspectedItem] = useState<Tool | Gear | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const variant = useScreenVariant();
  const isCompact = variant === 'compact';

  const handleInspectItem = (item: Tool | Gear | null) => {
    if (!item) return;
    setInspectedItem(item);
    setTooltipVisible(true);
  };

  const isPvpDetails = !boss;
  const visibleGearSlots = isPvpDetails
    ? Math.max(4, Math.min(12, 4 + (Math.max(1, pvpDetails?.week ?? 1) - 1) * 2))
    : 12;
  const gearSlots = isPvpDetails
    ? Array.from({ length: visibleGearSlots }, (_, index) => pvpDetails?.gear[index] ?? null)
    : [];

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <View style={[
          styles.modalContentWrapper,
          isCompact && styles.modalContentWrapperCompact,
        ]}>
          <ImageBackground
            source={SIDEBAR_BG}
            style={[
              styles.modalContent,
              isCompact && styles.modalContentCompact,
              Platform.OS !== 'web' && { height: Dimensions.get('window').height * 0.95, flex: undefined },
            ]}
            resizeMode="stretch"
          >
            <ScrollView
              style={styles.contentScroll}
              contentContainerStyle={[styles.innerContent, isCompact && styles.innerContentCompact]}
              showsVerticalScrollIndicator={false}
            >
              {/* Header */}
              <View style={styles.header}>
                <Image
                  source={boss ? getEntityImageSource(boss.id) : DEFAULT_MOLE_IMAGE_SOURCE}
                  style={[styles.bossImage, isCompact && styles.bossImageCompact]}
                  resizeMode="contain"
                />
                <View style={styles.headerText}>
                  <Text style={[styles.bossName, isCompact && styles.bossNameCompact]}>{boss ? boss.name : (pvpDetails?.name ?? 'Mole Echo')}</Text>
                  {!boss && <Text style={[styles.subName, isCompact && styles.subNameCompact]}>{pvpDetails?.sourceLabel ?? 'PvP Echo'}</Text>}
                </View>
                {!boss && (
                  <View style={styles.goldInline}>
                    <Image source={COIN_ICON} style={styles.goldIcon} resizeMode="contain" />
                    <Text style={styles.goldValue}>{pvpDetails?.stats.gold ?? 0}</Text>
                  </View>
                )}
              </View>

              {/* Stats Grid */}
              <View style={styles.pvpStats}>
                <View style={styles.pvpStatsColumn}>
                  <PvpStatRow icon={HP_ICON} label="HP" value={boss ? boss.stats.hp : (pvpDetails?.stats.hp ?? 0)} isCompact={isCompact} />
                  <PvpStatRow icon={ATK_ICON} label="ATK" value={boss ? boss.stats.atk : (pvpDetails?.stats.atk ?? 0)} isCompact={isCompact} />
                  <PvpStatRow icon={ARM_ICON} label="ARM" value={boss ? boss.stats.arm : (pvpDetails?.stats.arm ?? 0)} isCompact={isCompact} />
                </View>
                <View style={styles.pvpStatsColumn}>
                  <PvpStatRow icon={SPD_ICON} label="SPD" value={boss ? boss.stats.spd : (pvpDetails?.stats.spd ?? 0)} isCompact={isCompact} />
                  <PvpStatRow icon={DIG_ICON} label="DIG" value={boss ? (boss.stats.dig ?? 0) : (pvpDetails?.stats.dig ?? 0)} isCompact={isCompact} />
                </View>
              </View>

              {/* Abilities */}
              {boss ? (
                <View style={styles.abilitiesContainer}>
                  <ScrollView style={styles.abilitiesScroll}>
                    {boss.abilities.map((ability, index) => (
                      <View key={index} style={styles.abilityItem}>
                        <Text style={[styles.abilityName, isCompact && styles.abilityNameCompact]}>{ability.name}</Text>
                        <Text style={[styles.abilityDescription, isCompact && styles.abilityDescriptionCompact]}>{ability.description}</Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : (
                <View style={styles.abilitiesContainer}>
                  {pvpLoading ? (
                    <Text style={styles.abilityDescription}>Loading echo build...</Text>
                  ) : (
                    <>
                      <View style={styles.buildSection}>
                        <Text style={styles.buildLabel}>WEAPON</Text>
                        <View style={styles.weaponRow}>
                          <BuildItemSlot
                            item={pvpDetails?.tool ?? null}
                            onPress={() => handleInspectItem(pvpDetails?.tool ?? null)}
                          />
                          <OilSlot oil={pvpDetails?.tool?.oil ?? null} />
                        </View>
                      </View>
                      <View style={styles.buildSection}>
                        <Text style={styles.buildLabel}>GEAR</Text>
                        <View style={styles.gearGrid}>
                          {gearSlots.map((gear, index) => (
                            <BuildItemSlot
                              key={index}
                              item={gear}
                              onPress={() => handleInspectItem(gear)}
                            />
                          ))}
                        </View>
                      </View>
                    </>
                  )}
                </View>
              )}

              <Text style={styles.closeHint}>Tap anywhere to close</Text>
            </ScrollView>
          </ImageBackground>
        </View>
      </Pressable>
      <ItemTooltip
        item={inspectedItem}
        visible={tooltipVisible}
        onClose={() => setTooltipVisible(false)}
      />
    </Modal>
  );
}

function BuildItemSlot({
  item,
  onPress,
}: {
  item: Tool | Gear | null;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} disabled={!item}>
      <ImageBackground source={SLOT_BG} style={styles.buildSlot} resizeMode="stretch">
        {item ? (
          item.image ? (
            <Image source={item.image} style={styles.buildSlotImage} resizeMode="contain" />
          ) : (
            <Text style={styles.buildSlotEmoji}>{item.emoji}</Text>
          )
        ) : (
          <Text style={styles.buildSlotEmpty}>-</Text>
        )}
      </ImageBackground>
    </TouchableOpacity>
  );
}

function OilSlot({ oil }: { oil: Tool['oil'] | null | undefined }) {
  const source =
    oil === 'ATK'
      ? OIL_ATK_ICON
      : oil === 'DIG'
        ? OIL_DIG_ICON
        : oil === 'SPD'
          ? OIL_SPD_ICON
          : oil === 'ARM'
            ? OIL_ARM_ICON
            : null;

  return (
    <ImageBackground source={SLOT_BG} style={styles.buildSlot} resizeMode="stretch">
      {source ? (
        <Image source={source} style={styles.buildSlotImage} resizeMode="contain" />
      ) : (
        <Text style={styles.buildSlotEmpty}>-</Text>
      )}
    </ImageBackground>
  );
}

function PvpStatRow({ icon, label, value, isCompact }: { icon: any; label: string; value: number; isCompact?: boolean }) {
  return (
    <View style={styles.pvpStatRow}>
      <Image source={icon} style={[styles.pvpStatIcon, isCompact && styles.pvpStatIconCompact]} resizeMode="contain" />
      <Text style={[styles.pvpStatLabel, isCompact && styles.pvpStatLabelCompact]}>{label}</Text>
      <Text style={[styles.pvpStatValue, isCompact && styles.pvpStatValueCompact]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContentWrapper: {
    width: '88%',
    maxWidth: 360,
    height: '95%',
    minHeight: 360,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  contentScroll: {
    flex: 1,
  },
  innerContent: {
    gap: 12,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  bossImage: {
    width: 48,
    height: 48,
  },
  headerText: {
    flex: 1,
  },
  bossName: {
    fontFamily: Typography.header,
    fontSize: 24,
    color: '#000000',
  },
  subName: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#333333',
  },
  goldInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  goldIcon: {
    width: 14,
    height: 14,
  },
  goldValue: {
    fontFamily: Typography.number,
    fontSize: 12,
    color: '#000000',
    fontWeight: 'bold',
  },
  pvpStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 2,
  },
  pvpStatsColumn: {
    flex: 1,
    gap: 6,
  },
  pvpStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pvpStatIcon: {
    width: 16,
    height: 16,
    tintColor: '#000000',
  },
  pvpStatLabel: {
    fontFamily: Typography.header,
    fontSize: 13,
    color: '#000000',
    width: 34,
    fontWeight: 'bold',
  },
  pvpStatValue: {
    fontFamily: Typography.number,
    fontSize: 13,
    color: '#000000',
    fontWeight: 'bold',
  },
  abilitiesContainer: {
    minHeight: 100,
  },
  buildSection: {
    gap: 8,
    marginTop: 4,
  },
  weaponRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buildLabel: {
    fontFamily: Typography.header,
    fontSize: 14,
    color: '#000000',
  },
  gearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  buildSlot: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buildSlotImage: {
    width: 28,
    height: 28,
  },
  buildSlotEmoji: {
    fontSize: 16,
  },
  buildSlotEmpty: {
    fontFamily: Typography.number,
    fontSize: 12,
    color: '#4A4A4A',
  },
  abilitiesScroll: {
    flexGrow: 0,
  },
  abilityItem: {
    marginBottom: 12,
    gap: 4,
  },
  abilityName: {
    fontFamily: Typography.header,
    fontSize: 16,
    color: '#000000',
    fontWeight: 'bold',
  },
  abilityDescription: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#333333',
    lineHeight: 20,
  },
  closeHint: {
    textAlign: 'center',
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
  },

  // Compact overrides
  modalContentWrapperCompact: {
    height: undefined,
    maxWidth: 500,
    width: '70%',
  },
  modalContentCompact: {
    flex: undefined,
  },
  innerContentCompact: {
    gap: 16,
    paddingTop: 28,
    paddingHorizontal: 28,
    paddingBottom: 32,
  },
  bossImageCompact: {
    width: 72,
    height: 72,
  },
  bossNameCompact: {
    fontSize: 32,
  },
  subNameCompact: {
    fontSize: 16,
  },
  pvpStatIconCompact: {
    width: 24,
    height: 24,
  },
  pvpStatLabelCompact: {
    fontSize: 20,
    width: 50,
  },
  pvpStatValueCompact: {
    fontSize: 20,
  },
  abilityNameCompact: {
    fontSize: 22,
  },
  abilityDescriptionCompact: {
    fontSize: 18,
    lineHeight: 26,
  },
});
