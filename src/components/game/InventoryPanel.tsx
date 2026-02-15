/**
 * InventoryPanel Component - T083
 * Displays equipped tool and gear inventory in a grid (2 items per row)
 * @see specs/001-pve-dungeon-crawler/spec.md FR-018, FR-019, FR-020, FR-021
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ImageBackground } from 'react-native';
import type { Tool, Gear, InventorySlot, ItemsetId, ToolOil } from '../../game/engine/types';
import { getItemsetDefinition } from '../../game/entities/itemsets';
import { getTierFromRarity, type ItemTier } from '../../data/gear';
import { Typography } from '../../theme/typography';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';

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
  isSidebar?: boolean;
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
      return '#FFD700';
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
  const didLongPressRef = useRef(false);
  const handlePress = useCallback(() => {
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      return;
    }
    if (item && slotIndex !== undefined && onPress) {
      onPress(item, slotIndex);
    }
  }, [item, slotIndex, onPress]);

  const handleLongPress = useCallback(() => {
    if (item && slotIndex !== undefined && onLongPress) {
      didLongPressRef.current = true;
      onLongPress(item, slotIndex);
    }
  }, [item, slotIndex, onLongPress]);

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

function ActiveItemsets({ itemsets, isSidebar }: { itemsets: ItemsetId[]; isSidebar?: boolean }) {
  if (itemsets.length === 0) {
    return null;
  }

  return (
    <View style={styles.itemsetsContainer}>
      {itemsets.map((id) => {
        const def = getItemsetDefinition(id);
        return (
          <View
            key={id}
            style={[
              styles.itemsetBadge,
              isSidebar && { backgroundColor: 'transparent', borderColor: '#000000' },
            ]}
          >
            <Text style={styles.itemsetEmoji}>{def.emoji}</Text>
          </View>
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
  isSidebar,
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
  const gearSlotSize = isCompactSidebar ? COMPACT_GEAR_SLOT_SIZE : useGauntletSidebarSizing ? SIDEBAR_GEAR_SLOT_SIZE : 32;
  const toolSlotSize = isCompactSidebar ? COMPACT_TOOL_SLOT_SIZE : useGauntletSidebarSizing ? SIDEBAR_TOOL_SLOT_SIZE : DEFAULT_TOOL_SLOT_SIZE;

  return (
    <View
      style={[
        styles.container,
        isSidebar && styles.sidebarContainer,
        useGauntletSidebarSizing && styles.gauntletSidebarContainer,
      ]}
    >
      {/* Gear Section - Top */}
      <View style={[styles.gearSection, (useGauntletSidebarSizing || isCompactSidebar) && styles.sidebarGearSection]}>
        <Text style={[styles.sectionTitle, isCompactSidebar && styles.sidebarSectionTitle, { color: textColor }]}>
          GEAR ({inventory.length}/{inventoryCapacity})
        </Text>
        <View style={styles.gearGrid}>
          {rows.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.gearRow}>
              {row.map((slot, colIndex) => {
                const slotIndex = rowIndex * 4 + colIndex;
                const isLocked = slotIndex >= inventoryCapacity;
                return (
                  <ItemSlot
                    key={slotIndex}
                    item={slot?.item ?? null}
                    isEmpty={!slot && !isLocked}
                    isLocked={isLocked}
                    slotIndex={slot?.index}
                    onPress={onItemPress}
                    onLongPress={onItemInspect}
                    isSidebar={isSidebar}
                    size={gearSlotSize}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {/* Tool Section - Center */}
      <View style={[styles.toolSection, (useGauntletSidebarSizing || isCompactSidebar) && styles.sidebarToolSection]}>
        <View style={styles.toolHeaderRow}>
          <View style={[styles.toolHeaderCell, { width: toolSlotSize }]}>
            <Text style={[styles.sectionTitle, isCompactSidebar && styles.sidebarSectionTitle, { color: textColor, marginBottom: 0 }]}>WEAPON</Text>
          </View>
          <View style={[styles.toolHeaderCell, { width: toolSlotSize }]}>
            <Text style={[styles.sectionTitle, isCompactSidebar && styles.sidebarSectionTitle, { color: textColor, marginBottom: 0 }]}>OIL</Text>
          </View>
        </View>
        <View style={[styles.toolRow, (useGauntletSidebarSizing || isCompactSidebar) && styles.sidebarToolRow]}>
          <ItemSlot
            item={equippedTool}
            isEmpty={!equippedTool}
            slotIndex={-1}
            onPress={handleToolPress}
            onLongPress={handleToolInspect}
            isSidebar={isSidebar}
            size={toolSlotSize}
          />
          <OilSlot oil={equippedTool?.oil ?? null} isSidebar={isSidebar} size={toolSlotSize} />
        </View>
      </View>

      {/* Active Itemsets - Bottom */}
      <ActiveItemsets itemsets={activeItemsets} isSidebar={isSidebar} />
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
  toolHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 4,
    gap: 24,
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
  toolHeaderCell: {
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
  itemsetsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
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
  itemsetEmoji: {
    fontSize: 14,
  },
});

export default InventoryPanel;
