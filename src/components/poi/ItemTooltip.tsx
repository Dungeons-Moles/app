import React, { useEffect, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions, Modal } from 'react-native';
import type { ItemRarity } from '@/game/engine/types';
import { ITEM_RARITY_COLORS } from '@/utils/rarity-colors';

interface ItemTooltipProps {
  name: string;
  description?: string;
  rarity: ItemRarity;
  anchorPosition: { x: number; y: number };
  onDismiss: () => void;
}

const TOOLTIP_MAX_WIDTH = 240;
const SCREEN_PADDING = 12;

function formatRarityLabel(rarity: ItemRarity): string {
  return rarity.charAt(0) + rarity.slice(1).toLowerCase();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function ItemTooltip({
  name,
  description,
  rarity,
  anchorPosition,
  onDismiss,
}: ItemTooltipProps) {
  useEffect(() => {
    const timeout = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timeout);
  }, [onDismiss, name, description, rarity, anchorPosition.x, anchorPosition.y]);

  const rarityColor = ITEM_RARITY_COLORS[rarity] ?? '#9ca3af';
  const normalizedDescription = useMemo(() => {
    if (!description) {
      return '';
    }
    return description
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' ');
  }, [description]);

  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const maxWidth = Math.min(TOOLTIP_MAX_WIDTH, screenWidth - SCREEN_PADDING * 2);
  const estimatedHeight = normalizedDescription ? 120 : 80;
  const left = clamp(
    anchorPosition.x - maxWidth / 2,
    SCREEN_PADDING,
    screenWidth - maxWidth - SCREEN_PADDING
  );
  const placeAbove = anchorPosition.y > screenHeight - estimatedHeight - SCREEN_PADDING;
  const top = clamp(
    placeAbove ? anchorPosition.y - estimatedHeight - 12 : anchorPosition.y + 12,
    SCREEN_PADDING,
    screenHeight - estimatedHeight - SCREEN_PADDING
  );

  return (
    <Modal
      transparent
      visible
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onDismiss} />
        <View style={[styles.tooltip, { left, top, maxWidth, borderColor: rarityColor }]}>
          <Text style={styles.name}>{name}</Text>
          <Text style={[styles.rarity, { color: rarityColor }]}>
            {formatRarityLabel(rarity)}
          </Text>
          {normalizedDescription ? (
            <Text style={styles.description}>{normalizedDescription}</Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  tooltip: {
    position: 'absolute',
    backgroundColor: '#111827',
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  name: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#f9fafb',
    marginBottom: 2,
    fontFamily: 'monospace',
  },
  rarity: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
    fontFamily: 'monospace',
  },
  description: {
    fontSize: 11,
    color: '#e5e7eb',
    lineHeight: 16,
    fontFamily: 'monospace',
  },
});
