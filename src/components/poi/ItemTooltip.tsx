import React, { useEffect, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions, Modal } from 'react-native';
import type { ItemRarity } from '@/game/engine/types';
import { ITEM_RARITY_COLORS } from '@/utils/rarity-colors';
import { Typography } from '@/theme/typography';

interface ItemTooltipProps {
  name: string;
  description?: string;
  rarity: ItemRarity;
  anchorPosition: { x: number; y: number };
  onDismiss: () => void;
}

import { useAudio } from '@/contexts/AudioContext';

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
  const { playSfx } = useAudio();
  const handleDismiss = () => {
    playSfx('ui_click');
    onDismiss();
  };

  useEffect(() => {
    const timeout = setTimeout(handleDismiss, 3000);
    return () => clearTimeout(timeout);
  }, [handleDismiss, name, description, rarity, anchorPosition.x, anchorPosition.y]);

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
    <Modal transparent visible animationType="fade" onRequestClose={handleDismiss}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={handleDismiss} />
        <View style={[styles.tooltip, { left, top, maxWidth, borderColor: rarityColor }]}>
          <Text style={styles.name}>{name}</Text>
          <Text style={[styles.rarity, { color: rarityColor }]}>{formatRarityLabel(rarity)}</Text>
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
    fontFamily: Typography.header,
    fontSize: 16,
    color: '#f9fafb',
    marginBottom: 2,
  },
  rarity: {
    fontFamily: Typography.stat,
    fontSize: 12,
    marginBottom: 6,
  },
  description: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#e5e7eb',
    lineHeight: 16,
  },
});
