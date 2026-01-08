/**
 * POIModal Component - T100
 * Displays POI interaction options as an overlay modal
 * @see specs/001-pve-dungeon-crawler/spec.md User Story 5
 */

import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
} from 'react-native';
import type { POIInteraction, POIOption, Tool, Gear } from '../../game/engine/types';
import { POI_DEFINITIONS } from '../../data/pois';
import type { POIId } from '../../game/map/types';

interface POIModalProps {
  interaction: POIInteraction | null;
  visible: boolean;
  onSelectOption: (optionIndex: number) => void;
  onClose: () => void;
}

// POI types that use the 3-choice card layout
const THREE_CHOICE_POIS: POIId[] = ['L2', 'L3', 'L4', 'L12'];

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

function getRarityBorderColor(item: Tool | Gear): string {
  const rarity = 'rarity' in item ? item.rarity : item.currentRarity;
  switch (rarity) {
    case 'COMMON':
      return '#666666';
    case 'GILDED':
      return '#B8860B';
    case 'DIAMOND':
      return '#008B8B';
    case 'RARE':
      return '#27408B';
    case 'HEROIC':
      return '#6B238E';
    case 'MYTHIC':
      return '#CC3700';
    default:
      return '#666666';
  }
}

interface ItemCardProps {
  option: POIOption;
  index: number;
  onPress: (index: number) => void;
}

// Get emoji for Tool Oil Rack stat options
function getStatEmoji(label: string): string {
  if (label.includes('ATK')) return '🗡️';
  if (label.includes('ARM')) return '🛡️';
  if (label.includes('DIG')) return '⛏️';
  return '✨';
}

function ItemCard({ option, index, onPress }: ItemCardProps) {
  const handlePress = useCallback(() => {
    if (!option.disabled) {
      onPress(index);
    }
  }, [option.disabled, index, onPress]);

  const item = option.item;
  // Use item emoji if available, otherwise derive from label (for Tool Oil Rack)
  const emoji = item?.emoji ?? getStatEmoji(option.label);
  const rarityColor = item ? getRarityColor(item) : '#888888';
  const borderColor = item ? getRarityBorderColor(item) : '#444444';

  const cardStyle = useMemo(
    () => [
      styles.itemCard,
      { borderColor },
      option.disabled && styles.itemCardDisabled,
    ],
    [borderColor, option.disabled]
  );

  return (
    <TouchableOpacity
      style={cardStyle}
      onPress={handlePress}
      disabled={option.disabled}
      activeOpacity={0.7}
    >
      {/* Rarity indicator bar at top */}
      <View style={[styles.rarityBar, { backgroundColor: rarityColor }]} />

      {/* Emoji icon */}
      <View style={styles.iconContainer}>
        <Text style={styles.itemEmoji}>{emoji}</Text>
      </View>

      {/* Item name */}
      <Text style={[styles.itemName, option.disabled && styles.itemNameDisabled]} numberOfLines={2}>
        {option.label}
      </Text>

      {/* Description/Stats */}
      {option.description && (
        <Text style={styles.itemDescription} numberOfLines={3}>
          {option.description}
        </Text>
      )}

      {/* Cost if applicable */}
      {option.cost !== undefined && (
        <Text style={styles.itemCost}>{option.cost}g</Text>
      )}

      {/* Disabled reason */}
      {option.disabledReason && (
        <Text style={styles.disabledReason}>{option.disabledReason}</Text>
      )}
    </TouchableOpacity>
  );
}

interface ListOptionButtonProps {
  option: POIOption;
  index: number;
  onPress: (index: number) => void;
}

function ListOptionButton({ option, index, onPress }: ListOptionButtonProps) {
  const handlePress = useCallback(() => {
    if (!option.disabled) {
      onPress(index);
    }
  }, [option.disabled, index, onPress]);

  const buttonStyle = useMemo(
    () => [
      styles.listOptionButton,
      option.disabled && styles.listOptionButtonDisabled,
      option.item && styles.listOptionButtonWithItem,
    ],
    [option.disabled, option.item]
  );

  const textStyle = useMemo(
    () => [
      styles.listOptionText,
      option.disabled && styles.listOptionTextDisabled,
    ],
    [option.disabled]
  );

  const rarityColor = option.item ? getRarityColor(option.item) : null;
  const indicatorStyle = useMemo(
    () => [styles.listRarityIndicator, rarityColor && { backgroundColor: rarityColor }],
    [rarityColor]
  );

  return (
    <TouchableOpacity
      style={buttonStyle}
      onPress={handlePress}
      disabled={option.disabled}
      activeOpacity={0.7}
    >
      <Text style={textStyle}>{option.label}</Text>
      {option.disabledReason && (
        <Text style={styles.listDisabledReason}>{option.disabledReason}</Text>
      )}
      {rarityColor && <View style={indicatorStyle} />}
    </TouchableOpacity>
  );
}

export function POIModal({
  interaction,
  visible,
  onSelectOption,
  onClose,
}: POIModalProps) {
  if (!interaction) {
    return null;
  }

  const poiDef = POI_DEFINITIONS[interaction.poi.definitionId as POIId];
  if (!poiDef) {
    return null;
  }

  const options = interaction.options ?? [];
  const isThreeChoicePOI = THREE_CHOICE_POIS.includes(interaction.poi.definitionId as POIId);
  const hasValidOptions = options.length > 0 && !options[0]?.disabled;

  // Render three-choice card layout for specific POI types
  if (isThreeChoicePOI && hasValidOptions) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <View style={styles.threeChoiceModal}>
            {/* Close button */}
            <TouchableOpacity
              style={styles.closeButtonTop}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.closeButtonTopText}>X</Text>
            </TouchableOpacity>

            {/* Title */}
            <Text style={styles.threeChoiceTitle}>{poiDef.name}</Text>

            {/* Three item cards in a row */}
            <View style={styles.cardsContainer}>
              {options.slice(0, 3).map((option, index) => (
                <ItemCard
                  key={index}
                  option={option}
                  index={index}
                  onPress={onSelectOption}
                />
              ))}
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // Render default list layout for other POI types
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.listModal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.poiEmoji}>{poiDef.emoji}</Text>
            <Text style={styles.poiName}>{poiDef.name}</Text>
          </View>

          {/* Description */}
          <Text style={styles.description}>{poiDef.description}</Text>

          {/* Options */}
          <ScrollView
            style={styles.optionsContainer}
            contentContainerStyle={styles.optionsContent}
          >
            {options.map((option, index) => (
              <ListOptionButton
                key={index}
                option={option}
                index={index}
                onPress={onSelectOption}
              />
            ))}
          </ScrollView>

          {/* Close Button */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // ============================================================================
  // Overlay & Container
  // ============================================================================
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  // ============================================================================
  // Three-Choice Modal (Card Layout)
  // ============================================================================
  threeChoiceModal: {
    backgroundColor: '#1a1a1f',
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#4a4a55',
    padding: 16,
    paddingTop: 24,
    maxWidth: 500,
    width: '100%',
    position: 'relative',
  },
  threeChoiceTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 16,
    fontFamily: 'monospace',
  },
  cardsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },

  // ============================================================================
  // Item Card
  // ============================================================================
  itemCard: {
    flex: 1,
    backgroundColor: '#252530',
    borderRadius: 4,
    borderWidth: 2,
    padding: 10,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    minHeight: 140,
  },
  itemCardDisabled: {
    opacity: 0.5,
    backgroundColor: '#1a1a20',
  },
  rarityBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  iconContainer: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1f',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#3a3a45',
    marginTop: 4,
    marginBottom: 8,
  },
  itemEmoji: {
    fontSize: 24,
  },
  itemName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 6,
    fontFamily: 'monospace',
  },
  itemNameDisabled: {
    color: '#666666',
  },
  itemDescription: {
    fontSize: 10,
    color: '#aaaaaa',
    textAlign: 'center',
    lineHeight: 14,
    fontFamily: 'monospace',
  },
  itemCost: {
    fontSize: 11,
    color: '#FFD700',
    fontWeight: 'bold',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  disabledReason: {
    fontSize: 9,
    color: '#aa4444',
    textAlign: 'center',
    marginTop: 4,
    fontFamily: 'monospace',
  },

  // ============================================================================
  // Close Button (Top Right)
  // ============================================================================
  closeButtonTop: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    backgroundColor: '#3a3a45',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#5a5a65',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  closeButtonTopText: {
    fontSize: 12,
    color: '#aa4444',
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },

  // ============================================================================
  // List Modal (Default Layout)
  // ============================================================================
  listModal: {
    backgroundColor: '#1a1a1f',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#3a3a45',
    padding: 16,
    maxWidth: 400,
    width: '100%',
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a45',
  },
  poiEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  poiName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  description: {
    fontSize: 13,
    color: '#888888',
    marginBottom: 16,
    lineHeight: 18,
  },
  optionsContainer: {
    flexGrow: 0,
    maxHeight: 300,
  },
  optionsContent: {
    gap: 8,
  },
  listOptionButton: {
    backgroundColor: '#252530',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3a45',
    padding: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  listOptionButtonDisabled: {
    backgroundColor: '#1a1a20',
    borderColor: '#2a2a30',
    opacity: 0.6,
  },
  listOptionButtonWithItem: {
    borderColor: '#4a4a55',
  },
  listOptionText: {
    fontSize: 14,
    color: '#ffffff',
  },
  listOptionTextDisabled: {
    color: '#666666',
  },
  listDisabledReason: {
    fontSize: 11,
    color: '#aa4444',
    marginTop: 4,
  },
  listRarityIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  closeButton: {
    marginTop: 16,
    backgroundColor: '#2a2a35',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 14,
    color: '#888888',
  },
});

export default POIModal;
