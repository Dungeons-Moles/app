import React, { useMemo } from 'react';
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  type GestureResponderEvent,
} from 'react-native';
import type { ItemRarity } from '@/game/engine/types';
import { ITEM_RARITY_BG_COLORS, ITEM_RARITY_COLORS } from '@/utils/rarity-colors';

interface SimplifiedItemOptionProps {
  statDisplay: string;
  rarity: ItemRarity;
  itemName: string;
  selected?: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onLongPress: (event: GestureResponderEvent) => void;
}

export function SimplifiedItemOption({
  statDisplay,
  rarity,
  itemName,
  selected = false,
  disabled = false,
  onSelect,
  onLongPress,
}: SimplifiedItemOptionProps) {
  const backgroundColor = ITEM_RARITY_BG_COLORS[rarity] ?? '#1f1f2a';
  const rarityColor = ITEM_RARITY_COLORS[rarity] ?? '#9ca3af';

  const containerStyle = useMemo(
    () => [
      styles.container,
      { backgroundColor, borderLeftColor: rarityColor },
      selected && styles.selected,
      disabled && styles.disabled,
    ],
    [backgroundColor, rarityColor, selected, disabled]
  );

  const textStyle = useMemo(
    () => [styles.statText, disabled && styles.statTextDisabled],
    [disabled]
  );

  return (
    <TouchableOpacity
      testID="item-option"
      style={containerStyle}
      onPress={onSelect}
      onLongPress={onLongPress}
      delayLongPress={300}
      disabled={disabled}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${statDisplay}, ${rarity.toLowerCase()} rarity`}
      accessibilityHint={`Long press to view ${itemName} details`}
    >
      <Text style={textStyle} numberOfLines={2}>
        {statDisplay}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3a3a45',
    borderLeftWidth: 5,
    paddingVertical: 14,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 84,
  },
  selected: {
    borderColor: '#f97316',
    shadowColor: '#f97316',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  disabled: {
    opacity: 0.5,
  },
  statText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  statTextDisabled: {
    color: '#6b7280',
  },
});
