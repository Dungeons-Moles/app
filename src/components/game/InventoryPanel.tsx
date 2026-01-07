/**
 * InventoryPanel Component - T083
 * Displays equipped tool and gear inventory in a grid (2 items per row)
 * @see specs/001-pve-dungeon-crawler/spec.md FR-018, FR-019, FR-020, FR-021
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Tool, Gear, InventorySlot, ItemsetId } from '../../game/engine/types';
import { getItemsetDefinition } from '../../game/entities/itemsets';

interface InventoryPanelProps {
  equippedTool: Tool | null;
  inventory: InventorySlot[];
  inventoryCapacity: number;
  activeItemsets: ItemsetId[];
  onItemPress?: (item: Tool | Gear, slotIndex: number) => void;
  onToolPress?: (tool: Tool) => void;
}

interface ItemSlotProps {
  item: Tool | Gear | null;
  isEmpty?: boolean;
  isLocked?: boolean;
  onPress?: () => void;
}

function ItemSlot({ item, isEmpty = false, isLocked = false, onPress }: ItemSlotProps) {
  if (isLocked) {
    return (
      <View style={[styles.itemSlot, styles.lockedSlot]}>
        <Text style={styles.lockedIcon}>🔒</Text>
      </View>
    );
  }

  if (isEmpty || !item) {
    return (
      <View style={[styles.itemSlot, styles.emptySlot]}>
        <Text style={styles.emptyText}>-</Text>
      </View>
    );
  }

  const rarityColor = getRarityColor(item);

  return (
    <TouchableOpacity
      style={[styles.itemSlot, { borderColor: rarityColor }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.itemEmoji}>{item.emoji}</Text>
      <View style={[styles.rarityIndicator, { backgroundColor: rarityColor }]} />
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

function ActiveItemsets({ itemsets }: { itemsets: ItemsetId[] }) {
  if (itemsets.length === 0) {
    return null;
  }

  return (
    <View style={styles.itemsetsContainer}>
      {itemsets.map((id) => {
        const def = getItemsetDefinition(id);
        return (
          <View key={id} style={styles.itemsetBadge}>
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
  activeItemsets,
  onItemPress,
  onToolPress,
}: InventoryPanelProps) {
  // Create inventory grid with 2 items per row
  const maxSlots = 12; // Maximum possible inventory slots
  const slots: (InventorySlot | null)[] = [];

  // Fill slots up to capacity
  for (let i = 0; i < maxSlots; i++) {
    const slot = inventory.find((s) => s.index === i);
    if (i < inventoryCapacity) {
      slots.push(slot ?? null);
    } else {
      slots.push(null); // Locked slots
    }
  }

  // Create rows of 2 items each
  const rows: (InventorySlot | null)[][] = [];
  for (let i = 0; i < slots.length; i += 2) {
    rows.push(slots.slice(i, i + 2));
  }

  return (
    <View style={styles.container}>
      {/* Tool Section */}
      <View style={styles.toolSection}>
        <Text style={styles.sectionTitle}>Weapon</Text>
        <ItemSlot
          item={equippedTool}
          isEmpty={!equippedTool}
          onPress={() => equippedTool && onToolPress?.(equippedTool)}
        />
      </View>

      {/* Gear Section */}
      <View style={styles.gearSection}>
        <Text style={styles.sectionTitle}>
          Gear ({inventory.length}/{inventoryCapacity})
        </Text>
        <View style={styles.gearGrid}>
          {rows.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.gearRow}>
              {row.map((slot, colIndex) => {
                const slotIndex = rowIndex * 2 + colIndex;
                const isLocked = slotIndex >= inventoryCapacity;
                return (
                  <ItemSlot
                    key={slotIndex}
                    item={slot?.item ?? null}
                    isEmpty={!slot && !isLocked}
                    isLocked={isLocked}
                    onPress={() => slot && onItemPress?.(slot.item, slot.index)}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {/* Active Itemsets */}
      <ActiveItemsets itemsets={activeItemsets} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 8,
    padding: 8,
    minWidth: 120,
  },
  toolSection: {
    marginBottom: 8,
  },
  gearSection: {
    flex: 1,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  gearGrid: {
    gap: 4,
  },
  gearRow: {
    flexDirection: 'row',
    gap: 4,
  },
  itemSlot: {
    width: 40,
    height: 40,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#4A4A4A',
    backgroundColor: 'rgba(50, 50, 50, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  emptySlot: {
    borderStyle: 'dashed',
    backgroundColor: 'rgba(30, 30, 30, 0.5)',
  },
  lockedSlot: {
    borderStyle: 'dotted',
    backgroundColor: 'rgba(20, 20, 20, 0.3)',
    borderColor: '#2A2A2A',
  },
  itemEmoji: {
    fontSize: 20,
  },
  emptyText: {
    color: '#4A4A4A',
    fontSize: 16,
  },
  lockedIcon: {
    fontSize: 14,
    opacity: 0.3,
  },
  rarityIndicator: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    right: 2,
    height: 3,
    borderRadius: 2,
  },
  itemsetsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  itemsetBadge: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: 'rgba(100, 100, 100, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  itemsetEmoji: {
    fontSize: 12,
  },
});

export default InventoryPanel;
