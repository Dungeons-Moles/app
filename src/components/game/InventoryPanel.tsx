/**
 * InventoryPanel Component - T083
 * Displays equipped tool and gear inventory in a grid (2 items per row)
 * @see specs/001-pve-dungeon-crawler/spec.md FR-018, FR-019, FR-020, FR-021
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ImageBackground, Dimensions, Platform } from 'react-native';
import { FocusGlow } from '../ui/FocusGlow';
import type { Tool, Gear, InventorySlot, ItemsetId, ToolOil } from '../../game/engine/types';
import { getTierFromRarity, type ItemTier } from '../../data/gear';
import { Typography } from '../../theme/typography';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';
import { useAudio } from '@/contexts/AudioContext';

const SLOT_BG = require('../../../assets/ui/frames/square.png');
const LOCK_ICON = require('../../../assets/icons/ui/lock.png');
const DEFAULT_TOOL_SLOT_SIZE = 52;
const SIDEBAR_TOOL_SLOT_SIZE = 42;
const SIDEBAR_GEAR_SLOT_SIZE = 28;
const COMPACT_TOOL_SLOT_SIZE = 68;
const COMPACT_GEAR_SLOT_SIZE = 48;

interface InventoryPanelProps {
  equippedTool: Tool | null;
  inventory: InventorySlot[];
  inventoryCapacity: number;
  maxGearSlots?: number;
  isGauntletLayout?: boolean;
  activeItemsets: ItemsetId[];
  onItemPress?: (item: Tool | Gear, slotIndex: number) => void;
  onToolPress?: (tool: Tool) => void;
  onItemInspect?: (item: Tool | Gear, slotIndex: number) => void;
  onToolInspect?: (tool: Tool) => void;
  onItemsetPress?: (id: ItemsetId) => void;
  isSidebar?: boolean;
  controllerFocusIndex?: number | null;
}

interface ItemSlotProps {
  item: Tool | Gear | null;
  isEmpty?: boolean;
  isLocked?: boolean;
  slotIndex?: number;
  onPress?: (item: Tool | Gear, index: number) => void;
  onLongPress?: (item: Tool | Gear, index: number) => void;
  isSidebar?: boolean;
  size?: number;
}

const DEFAULT_RARITY_COLOR = '#4A4A4A';

function getTierBorderColor(tier: ItemTier): string | null {
  switch (tier) {
    case 2:
      return '#4A90D9';
    case 3:
      return '#CC9900';
    default:
      return null;
  }
}

function ItemSlot({
  item,
  isEmpty = false,
  isLocked = false,
  slotIndex,
  onPress,
  onLongPress,
  isSidebar,
  size = 28,
}: ItemSlotProps) {
  const { playSfx } = useAudio();
  const didLongPressRef = useRef(false);
  const handlePress = useCallback(() => {
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      return;
    }
    if (item && slotIndex !== undefined && onPress) {
      playSfx('ui_click');
      onPress(item, slotIndex);
    }
  }, [item, slotIndex, onPress, playSfx]);

  const handleLongPress = useCallback(() => {
    if (item && slotIndex !== undefined && onLongPress) {
      didLongPressRef.current = true;
      playSfx('ui_hover');
      onLongPress(item, slotIndex);
    }
  }, [item, slotIndex, onLongPress, playSfx]);

  const rarityColor = useMemo(() => (item ? getRarityColor(item) : DEFAULT_RARITY_COLOR), [item]);
  const tierBorder = useMemo(() => {
    if (!item || !isSidebar) return null;
    const rarity = 'rarity' in item ? item.rarity : item.currentRarity;
    const tier = getTierFromRarity(rarity);
    return getTierBorderColor(tier);
  }, [item, isSidebar]);
  const slotStyle = useMemo(
    () => [
      styles.itemSlot,
      { width: size, height: size },
      !isSidebar && { borderColor: rarityColor },
      isSidebar && tierBorder && { borderWidth: 2, borderColor: tierBorder },
    ],
    [rarityColor, isSidebar, size, tierBorder]
  );

  const indicatorStyle = useMemo(
    () => [styles.rarityIndicator, { backgroundColor: rarityColor }],
    [rarityColor]
  );

  const content = (
    <>
      {isLocked ? (
        <Image
          source={LOCK_ICON}
          style={{ width: size * 0.6, height: size * 0.6 }}
          resizeMode="contain"
        />
      ) : item ? (
        item.image ? (
          <Image
            source={item.image}
            style={{ width: size * 0.8, height: size * 0.8 }}
            resizeMode="contain"
          />
        ) : (
          <Text style={[styles.itemEmoji, { fontSize: size * 0.5 }]}>{item.emoji}</Text>
        )
      ) : (
        !isSidebar && <Text style={styles.emptyText}>-</Text>
      )}
      {item && !isSidebar && <View style={indicatorStyle} />}
    </>
  );

  if (isSidebar) {
    return (
      <TouchableOpacity
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={350}
        activeOpacity={0.7}
      >
        <ImageBackground source={SLOT_BG} style={slotStyle} resizeMode="stretch">
          {content}
        </ImageBackground>
      </TouchableOpacity>
    );
  }

  if (isLocked) {
    return (
      <View style={[styles.itemSlot, styles.lockedSlot, { width: size, height: size }]}>
        <Text style={styles.lockedIcon}>🔒</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={slotStyle}
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={350}
      activeOpacity={0.7}
    >
      {content}
    </TouchableOpacity>
  );
}

function getRarityColor(item: Tool | Gear): string {
  const rarity = 'rarity' in item ? item.rarity : item.currentRarity;
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

const OIL_IMAGES: Record<ToolOil, any> = {
  ATK: require('../../../assets/icons/oils/ATK.png'),
  DIG: require('../../../assets/icons/oils/DIG.png'),
  SPD: require('../../../assets/icons/oils/SPD.png'),
  ARM: require('../../../assets/icons/oils/ARM.png'),
};

function OilSlot({
  oil,
  isSidebar,
  size = 28,
}: {
  oil?: ToolOil | null;
  isSidebar?: boolean;
  size?: number;
}) {
  if (!oil) {
    return isSidebar ? (
      <ImageBackground
        source={SLOT_BG}
        style={[styles.itemSlot, { width: size, height: size }]}
        resizeMode="stretch"
      />
    ) : (
      <View style={[styles.itemSlot, styles.oilSlotEmpty, { width: size, height: size }]} />
    );
  }

  const content = (
    <Image
      source={OIL_IMAGES[oil]}
      style={{ width: size * 0.8, height: size * 0.8 }}
      resizeMode="contain"
    />
  );

  if (isSidebar) {
    return (
      <ImageBackground
        source={SLOT_BG}
        style={[styles.itemSlot, { width: size, height: size }]}
        resizeMode="stretch"
      >
        {content}
      </ImageBackground>
    );
  }

  return (
    <View style={[styles.itemSlot, styles.oilSlot, { width: size, height: size }]}>{content}</View>
  );
}

const ITEMSET_ICONS: Record<ItemsetId, any> = {
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

function ActiveItemsets({
  itemsets,
  isSidebar,
  onPress,
  controllerFocusIndex,
  baseIndex,
  compact,
}: {
  itemsets: ItemsetId[];
  isSidebar?: boolean;
  onPress?: (id: ItemsetId) => void;
  controllerFocusIndex?: number | null;
  baseIndex?: number;
  compact?: boolean;
}) {
  const { playSfx } = useAudio();
  if (itemsets.length === 0) {
    return null;
  }

  return (
    <View style={[styles.itemsetsContainer, compact && styles.itemsetsContainerCompactMobile]}>
      {itemsets.map((id, i) => {
        const slotIndex = (baseIndex ?? 0) + i;
        const isFocused = controllerFocusIndex === slotIndex;
        return (
          <FocusGlow key={id} active={isFocused}>
            <TouchableOpacity
              onPress={() => {
                if (onPress) {
                  playSfx('ui_click');
                  onPress(id);
                }
              }}
              activeOpacity={onPress ? 0.7 : 1}
              disabled={!onPress}
            >
              <View
                style={[
                  styles.itemsetBadge,
                  isSidebar && { backgroundColor: 'transparent', borderColor: '#000000' },
                  compact && { width: 22, height: 22 },
                ]}
              >
                <Image source={ITEMSET_ICONS[id]} style={[styles.itemsetIcon, compact && { width: 16, height: 16 }]} resizeMode="contain" />
              </View>
            </TouchableOpacity>
          </FocusGlow>
        );
      })}
    </View>
  );
}

export function InventoryPanel({
  equippedTool,
  inventory,
  inventoryCapacity,
  maxGearSlots = 8,
  isGauntletLayout = false,
  activeItemsets,
  onItemPress,
  onToolPress,
  onItemInspect,
  onToolInspect,
  onItemsetPress,
  isSidebar,
  controllerFocusIndex,
}: InventoryPanelProps) {
  // Create inventory grid with 4 items per row.
  const maxSlots = Math.max(4, maxGearSlots);
  const slots: (InventorySlot | null)[] = [];

  // Fill slots up to capacity - items unlock left-to-right
  for (let i = 0; i < maxSlots; i++) {
    const slot = inventory.find((s) => s.index === i);
    if (i < inventoryCapacity) {
      slots.push(slot ?? null);
    } else {
      slots.push(null); // Locked slots
    }
  }

  // Create rows of 4 items each (4 columns x 2 rows = 8 slots)
  const rows: (InventorySlot | null)[][] = [];
  for (let i = 0; i < slots.length; i += 4) {
    rows.push(slots.slice(i, i + 4));
  }

  const handleToolPress = useCallback(
    (tool: Tool | Gear, _slotIndex: number) => {
      if (tool && 'rarity' in tool) {
        onToolPress?.(tool);
      }
    },
    [onToolPress]
  );

  const handleToolInspect = useCallback(
    (tool: Tool | Gear, _slotIndex: number) => {
      if (tool && 'rarity' in tool) {
        onToolInspect?.(tool);
      }
    },
    [onToolInspect]
  );

  const variant = useScreenVariant();
  const isCompactSidebar = !!isSidebar && variant === 'compact';
  const textColor = isSidebar ? '#000000' : '#FFFFFF';
  const useGauntletSidebarSizing = !!isSidebar && isGauntletLayout;
  const gearSlotSize = isCompactSidebar
    ? COMPACT_GEAR_SLOT_SIZE
    : useGauntletSidebarSizing
      ? SIDEBAR_GEAR_SLOT_SIZE
      : 32;
  const isNativeSidebar = isSidebar && Platform.OS !== 'web';
  const nativeToolSlotSize = Math.max(36, Math.round(Dimensions.get('window').height / 10));
  const toolSlotSize = isCompactSidebar
    ? COMPACT_TOOL_SLOT_SIZE
    : isNativeSidebar
      ? nativeToolSlotSize
      : useGauntletSidebarSizing
        ? SIDEBAR_TOOL_SLOT_SIZE
        : DEFAULT_TOOL_SLOT_SIZE;

  return (
    <View
      style={[
        styles.container,
        isSidebar && styles.sidebarContainer,
        useGauntletSidebarSizing && styles.gauntletSidebarContainer,
      ]}
    >
      {/* Gear Section - Top */}
      <View
        style={[
          styles.gearSection,
          (useGauntletSidebarSizing || isCompactSidebar) && styles.sidebarGearSection,
        ]}
      >
        <Text
          style={[
            styles.sectionTitle,
            isCompactSidebar && styles.sidebarSectionTitle,
            { color: textColor },
          ]}
        >
          GEAR ({inventory.length}/{inventoryCapacity})
        </Text>
        <View style={styles.gearGrid}>
          {rows.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.gearRow}>
              {row.map((slot, colIndex) => {
                const slotIndex = rowIndex * 4 + colIndex;
                const isLocked = slotIndex >= inventoryCapacity;
                return (
                  <FocusGlow key={slotIndex} active={controllerFocusIndex === slotIndex}>
                    <ItemSlot
                      item={slot?.item ?? null}
                      isEmpty={!slot && !isLocked}
                      isLocked={isLocked}
                      slotIndex={slot?.index}
                      onPress={onItemPress}
                      onLongPress={onItemInspect}
                      isSidebar={isSidebar}
                      size={gearSlotSize}
                    />
                  </FocusGlow>
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {/* Tool Section + Itemsets */}
      {isNativeSidebar && activeItemsets.length > 0 ? (
        <View style={styles.mobileToolItemsetsRow}>
          <View style={styles.mobileToolLeft}>
            <View style={styles.toolColumn}>
              <Text style={[styles.sectionTitle, { color: textColor, marginBottom: 4 }]}>
                WEAPON
              </Text>
              <FocusGlow active={controllerFocusIndex === maxSlots}>
                <ItemSlot
                  item={equippedTool}
                  isEmpty={!equippedTool}
                  slotIndex={-1}
                  onPress={handleToolPress}
                  onLongPress={handleToolInspect}
                  isSidebar={isSidebar}
                  size={toolSlotSize}
                />
              </FocusGlow>
            </View>
            <View style={styles.toolColumn}>
              <Text style={[styles.sectionTitle, { color: textColor, marginBottom: 4 }]}>
                OIL
              </Text>
              <OilSlot oil={equippedTool?.oil ?? null} isSidebar={isSidebar} size={toolSlotSize} />
            </View>
          </View>
          <View style={styles.mobileItemsetsGrid}>
            <ActiveItemsets
              itemsets={activeItemsets}
              isSidebar={isSidebar}
              onPress={onItemsetPress}
              controllerFocusIndex={controllerFocusIndex}
              baseIndex={maxSlots + 1}
              compact
            />
          </View>
        </View>
      ) : (
        <>
          <View
            style={[
              styles.toolSection,
              (useGauntletSidebarSizing || isCompactSidebar) && styles.sidebarToolSection,
              isNativeSidebar && { borderTopWidth: 0, paddingVertical: 2 },
            ]}
          >
            <View
              style={[
                styles.toolRow,
                (useGauntletSidebarSizing || isCompactSidebar) && styles.sidebarToolRow,
              ]}
            >
              <View style={styles.toolColumn}>
                <Text
                  style={[
                    styles.sectionTitle,
                    isCompactSidebar && styles.sidebarSectionTitle,
                    { color: textColor, marginBottom: 4 },
                  ]}
                >
                  WEAPON
                </Text>
                <FocusGlow active={controllerFocusIndex === maxSlots}>
                  <ItemSlot
                    item={equippedTool}
                    isEmpty={!equippedTool}
                    slotIndex={-1}
                    onPress={handleToolPress}
                    onLongPress={handleToolInspect}
                    isSidebar={isSidebar}
                    size={toolSlotSize}
                  />
                </FocusGlow>
              </View>
              <View style={styles.toolColumn}>
                <Text
                  style={[
                    styles.sectionTitle,
                    isCompactSidebar && styles.sidebarSectionTitle,
                    { color: textColor, marginBottom: 4 },
                  ]}
                >
                  OIL
                </Text>
                <OilSlot oil={equippedTool?.oil ?? null} isSidebar={isSidebar} size={toolSlotSize} />
              </View>
            </View>
          </View>
          <ActiveItemsets
            itemsets={activeItemsets}
            isSidebar={isSidebar}
            onPress={onItemsetPress}
            controllerFocusIndex={controllerFocusIndex}
            baseIndex={maxSlots + 1}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 6,
    padding: 6,
    gap: 8,
  },
  sidebarContainer: {
    backgroundColor: 'transparent',
  },
  gauntletSidebarContainer: {
    gap: 4,
  },
  gearSection: {
    // Top section - compact
  },
  sidebarGearSection: {
    marginTop: -2,
  },
  toolSection: {
    alignItems: 'stretch',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  sidebarToolSection: {
    paddingVertical: 4,
  },
  toolRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
    gap: 24,
  },
  sidebarToolRow: {
    gap: 16,
  },
  toolColumn: {
    alignItems: 'center',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontFamily: Typography.header,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  sidebarSectionTitle: {
    fontSize: 18,
  },
  gearGrid: {
    gap: 6,
    marginVertical: 2,
  },
  gearRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  itemSlot: {
    width: 28,
    height: 28,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  oilSlot: {
    // Removed specific styling that might overlap with SLOT_BG
  },
  oilSlotEmpty: {
    // Removed specific styling
  },
  emptySlot: {
    // Removed specific styling
  },
  lockedSlot: {
    // Removed specific styling
  },
  itemEmoji: {
    fontSize: 14,
  },
  emptyText: {
    fontFamily: Typography.number,
    color: '#4A4A4A',
    fontSize: 12,
  },
  lockedIcon: {
    fontSize: 10,
    opacity: 0.3,
  },
  rarityIndicator: {
    position: 'absolute',
    bottom: 1,
    left: 1,
    right: 1,
    height: 2,
    borderRadius: 1,
  },
  mobileToolItemsetsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  mobileToolLeft: {
    flexDirection: 'row',
    gap: 8,
    flexShrink: 0,
  },
  mobileItemsetsGrid: {
    width: 48,
  },
  itemsetsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  itemsetsContainerCompactMobile: {
    borderTopWidth: 0,
    paddingTop: 0,
    justifyContent: 'flex-start',
  },
  itemsetBadge: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: 'rgba(100, 100, 100, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  itemsetIcon: {
    width: 20,
    height: 20,
  },
});

export default InventoryPanel;
