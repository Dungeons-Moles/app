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
  emoji?: string;
  statDisplay?: string;
  effectDescription?: string;
  rarity: ItemRarity;
  itemName: string;
  selected?: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onLongPress: (event: GestureResponderEvent) => void;
}

export function SimplifiedItemOption({
  emoji,
  statDisplay,
  effectDescription,
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
      accessibilityLabel={`${itemName}, ${statDisplay ?? effectDescription ?? 'No stats'}, ${rarity.toLowerCase()} rarity`}
      accessibilityHint={`Long press to view ${itemName} details`}
    >
      {emoji && <Text style={styles.emoji}>{emoji}</Text>}
      <Text style={styles.itemName} numberOfLines={2}>
        {itemName}
      </Text>
      {statDisplay ? <Text style={textStyle}>{statDisplay}</Text> : null}
      {effectDescription && (
        <Text style={styles.effectText} numberOfLines={3}>
          {effectDescription}
        </Text>
      )}
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
    paddingVertical: 12,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 160,
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
  emoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  itemName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
    marginBottom: 4,
  },
  statText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  statTextDisabled: {
    color: '#6b7280',
  },
  effectText: {
    fontSize: 11,
    color: '#6b21a8',
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },
});
