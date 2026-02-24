import React, { useMemo } from 'react';
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  type GestureResponderEvent,
  Image,
  View,
} from 'react-native';
import type { ItemRarity } from '@/game/engine/types';
import { ITEM_RARITY_COLORS } from '@/utils/rarity-colors';
import { Typography } from '@/theme/typography';

const squareSource = require('../../../assets/ui/frames/square.png');

interface SimplifiedItemOptionProps {
  emoji?: string;
  image?: any;
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
  image,
  statDisplay,
  effectDescription,
  rarity,
  itemName,
  selected = false,
  disabled = false,
  onSelect,
  onLongPress,
}: SimplifiedItemOptionProps) {
  const rarityColor = ITEM_RARITY_COLORS[rarity] ?? '#9ca3af';

  const containerStyle = useMemo(
    () => [styles.container, selected && styles.selected, disabled && styles.disabled],
    [selected, disabled]
  );

  const textStyle = useMemo(
    () => [styles.statText, disabled && styles.statTextDisabled],
    [disabled]
  );

  const isCommon = rarity === 'COMMON';

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
      <Image
        source={squareSource}
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          backgroundColor: isCommon ? undefined : rarityColor,
          opacity: isCommon ? 1 : 0.3,
          resizeMode: 'stretch',
        }}
      />
      <View style={styles.contentContainer}>
        {image ? (
          <Image source={image} style={styles.image} resizeMode="contain" />
        ) : (
          emoji && <Text style={styles.emoji}>{emoji}</Text>
        )}
        <Text style={styles.itemName} numberOfLines={2}>
          {itemName}
        </Text>
        {statDisplay ? <Text style={textStyle}>{statDisplay}</Text> : null}
        {effectDescription && (
          <Text style={styles.effectText} numberOfLines={3}>
            {effectDescription}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 160,
    position: 'relative',
  },
  contentContainer: {
    width: '100%',
    alignItems: 'center',
    padding: 8,
  },
  selected: {
    transform: [{ scale: 1.08 }],
  },
  disabled: {
    opacity: 0.5,
  },
  emoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  image: {
    width: 40,
    height: 40,
    marginBottom: 6,
  },
  itemName: {
    fontFamily: Typography.header,
    fontSize: 14,
    color: '#3d2b1f',
    textAlign: 'center',
    marginBottom: 4,
    fontWeight: 'bold',
  },
  statText: {
    fontFamily: Typography.number,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#3d2b1f',
    textAlign: 'center',
  },
  statTextDisabled: {
    color: '#6b7280',
  },
  effectText: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#3d2b1f',
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },
});
