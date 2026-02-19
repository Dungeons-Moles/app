import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ImageSourcePropType } from 'react-native';
import { Typography } from '@/theme/typography';

interface NftCardProps {
  name: string;
  image?: ImageSourcePropType;
  emoji?: string;
  rarity?: string;
  priceSol?: number;
  isOwned?: boolean;
  isEquipped?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
  isCompact?: boolean;
}

const RARITY_COLORS: Record<string, string> = {
  common: '#6B7280',
  uncommon: '#10B981',
  rare: '#3B82F6',
  epic: '#8B5CF6',
  legendary: '#F59E0B',
  heroic: '#EF4444',
};

export function NftCard({
  name,
  image,
  emoji,
  rarity,
  priceSol,
  isOwned,
  isEquipped,
  actionLabel,
  onAction,
  disabled,
  isCompact,
}: NftCardProps) {
  const rarityColor = rarity ? RARITY_COLORS[rarity] ?? '#6B7280' : '#6B7280';

  return (
    <View style={[
      styles.container,
      isCompact && compactStyles.container,
      isEquipped && styles.equippedContainer,
    ]}>
      {/* Image */}
      <View style={[styles.imageContainer, isCompact && compactStyles.imageContainer]}>
        {image ? (
          <Image source={image} style={styles.nftImage} resizeMode="contain" />
        ) : (
          <Text style={[styles.emoji, isCompact && compactStyles.emoji]}>
            {emoji ?? '?'}
          </Text>
        )}
      </View>

      {/* Name */}
      <Text
        style={[styles.name, isCompact && compactStyles.name]}
        numberOfLines={1}
      >
        {name}
      </Text>

      {/* Rarity badge */}
      {rarity && (
        <View style={[styles.rarityBadge, { backgroundColor: rarityColor }]}>
          <Text style={[styles.rarityText, isCompact && compactStyles.rarityText]}>
            {rarity.toUpperCase()}
          </Text>
        </View>
      )}

      {/* Price */}
      {priceSol !== undefined && (
        <Text style={[styles.price, isCompact && compactStyles.price]}>
          {priceSol.toFixed(3)} SOL
        </Text>
      )}

      {/* Equipped indicator */}
      {isEquipped && (
        <Text style={[styles.equippedLabel, isCompact && compactStyles.equippedLabel]}>
          EQUIPPED
        </Text>
      )}

      {/* Action button */}
      {actionLabel && onAction && (
        <TouchableOpacity
          style={[
            styles.actionButton,
            isCompact && compactStyles.actionButton,
            disabled && styles.actionButtonDisabled,
          ]}
          onPress={onAction}
          disabled={disabled}
          activeOpacity={0.7}
        >
          <Text style={[
            styles.actionButtonText,
            isCompact && compactStyles.actionButtonText,
            disabled && styles.actionButtonTextDisabled,
          ]}>
            {actionLabel}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(92, 64, 51, 0.2)',
  },
  equippedContainer: {
    borderColor: 'rgba(92, 64, 51, 0.2)',
    borderWidth: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    opacity: 0.5,
  },
  imageContainer: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: 'rgba(92, 64, 51, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nftImage: {
    width: '100%',
    height: '100%',
  },
  emoji: {
    fontSize: 32,
  },
  name: {
    fontFamily: Typography.button,
    fontSize: 11,
    color: '#3d2b1f',
    textAlign: 'center',
  },
  rarityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  rarityText: {
    fontFamily: Typography.stat,
    fontSize: 8,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  price: {
    fontFamily: Typography.number,
    fontSize: 10,
    color: '#5c4033',
    fontWeight: 'bold',
  },
  equippedLabel: {
    fontFamily: Typography.stat,
    fontSize: 8,
    color: '#8a7a6a',
    fontWeight: 'bold',
  },
  actionButton: {
    backgroundColor: '#3d2b1f',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    width: '100%',
    alignItems: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    fontFamily: Typography.button,
    fontSize: 10,
    color: '#ffffff',
  },
  actionButtonTextDisabled: {
    color: '#cccccc',
  },
});

const compactStyles = StyleSheet.create({
  container: {
    width: 180,
    padding: 14,
    gap: 6,
  },
  imageContainer: {
    width: 100,
    height: 100,
  },
  emoji: {
    fontSize: 56,
  },
  name: {
    fontSize: 20,
  },
  rarityText: {
    fontSize: 14,
  },
  price: {
    fontSize: 18,
  },
  equippedLabel: {
    fontSize: 14,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  actionButtonText: {
    fontSize: 18,
  },
});
