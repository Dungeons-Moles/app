import React, { useCallback, useMemo, useState } from 'react';
import {
  Text,
  Pressable,
  StyleSheet,
  type GestureResponderEvent,
  Image,
  View,
} from 'react-native';
import type { ItemRarity } from '@/game/engine/types';
import { Typography } from '@/theme/typography';
import { useScreenVariant } from '@/contexts/ScreenVariantContext';
import { ITEM_RARITY_FILL } from '@/utils/rarity-colors';

const squareSource = require('../../../assets/ui/frames/square.webp');
const squareBlueSource = require('../../../assets/ui/frames/square-blue.webp');
const squareYellowSource = require('../../../assets/ui/frames/square-yellow.webp');

function getFrameForRarity(rarity: ItemRarity) {
  switch (rarity) {
    case 'SAPPHIRE':
      return squareBlueSource;
    case 'GOLDEN':
      return squareYellowSource;
    default:
      return squareSource;
  }
}

interface SimplifiedItemOptionProps {
  emoji?: string;
  image?: any;
  statDisplay?: string;
  effectDescription?: string;
  rarity: ItemRarity;
  baseRarity?: ItemRarity;
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
  baseRarity,
  itemName,
  selected = false,
  disabled = false,
  onSelect,
  onLongPress,
}: SimplifiedItemOptionProps) {
  const isCompact = useScreenVariant() === 'compact';
  const isMobileWide = !isCompact;
  const [pressed, setPressed] = useState(false);

  const handlePressIn = useCallback(() => setPressed(true), []);
  const handlePressOut = useCallback(() => setPressed(false), []);

  const rarityFillColor = baseRarity ? ITEM_RARITY_FILL[baseRarity] : undefined;

  const containerStyle = useMemo(
    () => [
      styles.container,
      isMobileWide && styles.containerMobile,
      (selected || pressed) && styles.selected,
      disabled && styles.disabled,
    ],
    [selected, disabled, isMobileWide, pressed]
  );

  const textStyle = useMemo(
    () => [styles.statText, disabled && styles.statTextDisabled],
    [disabled]
  );

  return (
    <Pressable
      testID="item-option"
      style={containerStyle}
      onPress={onSelect}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onLongPress={onLongPress}
      delayLongPress={300}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${itemName}, ${statDisplay ?? effectDescription ?? 'No stats'}, ${rarity.toLowerCase()} rarity`}
      accessibilityHint={`Long press to view ${itemName} details`}
    >
      {rarityFillColor && (
        <View
          style={{
            position: 'absolute',
            width: '95%',
            height: '95%',
            backgroundColor: rarityFillColor,
            borderRadius: 4,
          }}
        />
      )}
      <Image
        source={getFrameForRarity(rarity)}
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          resizeMode: 'stretch',
        }}
      />
      <View style={[styles.contentContainer, isMobileWide && styles.contentContainerMobile]}>
        {image ? (
          <Image
            source={image}
            style={[styles.image, isMobileWide && styles.imageMobile]}
            resizeMode="contain"
          />
        ) : (
          emoji && <Text style={[styles.emoji, isMobileWide && styles.emojiMobile]}>{emoji}</Text>
        )}
        <Text style={[styles.itemName, isMobileWide && styles.itemNameMobile]} numberOfLines={2}>
          {itemName}
        </Text>
        {statDisplay ? (
          <Text style={[textStyle, isMobileWide && styles.statTextMobile]}>{statDisplay}</Text>
        ) : null}
        {effectDescription && (
          <Text
            style={[styles.effectText, isMobileWide && styles.effectTextMobile]}
            numberOfLines={6}
          >
            {effectDescription}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 230,
    position: 'relative',
  },
  containerMobile: {
    minHeight: 214,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  contentContainer: {
    width: '100%',
    alignItems: 'center',
    padding: 8,
  },
  contentContainerMobile: {
    padding: 6,
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
  imageMobile: {
    width: 36,
    height: 36,
    marginBottom: 5,
  },
  itemName: {
    fontFamily: Typography.header,
    fontSize: 14,
    color: '#3d2b1f',
    textAlign: 'center',
    marginBottom: 4,
    fontWeight: 'bold',
  },
  itemNameMobile: {
    fontSize: 13,
    marginBottom: 3,
  },
  statText: {
    fontFamily: Typography.number,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#3d2b1f',
    textAlign: 'center',
  },
  statTextMobile: {
    fontSize: 13,
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
  effectTextMobile: {
    fontSize: 10,
    marginTop: 3,
  },
  emojiMobile: {
    fontSize: 24,
    marginBottom: 5,
  },
});
