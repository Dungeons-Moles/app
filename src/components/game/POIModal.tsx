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

interface OptionButtonProps {
  option: POIOption;
  index: number;
  onPress: (index: number) => void;
}

function OptionButton({ option, index, onPress }: OptionButtonProps) {
  const handlePress = useCallback(() => {
    if (!option.disabled) {
      onPress(index);
    }
  }, [option.disabled, index, onPress]);

  const buttonStyle = useMemo(
    () => [
      styles.optionButton,
      option.disabled && styles.optionButtonDisabled,
      option.item && styles.optionButtonWithItem,
    ],
    [option.disabled, option.item]
  );

  const textStyle = useMemo(
    () => [
      styles.optionText,
      option.disabled && styles.optionTextDisabled,
    ],
    [option.disabled]
  );

  // Determine item rarity color if applicable
  const rarityColor = option.item ? getRarityColor(option.item) : null;
  const indicatorStyle = useMemo(
    () => [styles.rarityIndicator, rarityColor && { backgroundColor: rarityColor }],
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
        <Text style={styles.disabledReason}>{option.disabledReason}</Text>
      )}
      {rarityColor && <View style={indicatorStyle} />}
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

export function POIModal({
  interaction,
  visible,
  onSelectOption,
  onClose,
}: POIModalProps) {
  if (!interaction) {
    return null;
  }

  // Get POI definition for display
  const poiDef = POI_DEFINITIONS[interaction.poi.definitionId as POIId];
  if (!poiDef) {
    return null;
  }

  const options = interaction.options ?? [];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
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
              <OptionButton
                key={index}
                option={option}
                index={index}
                onPress={onSelectOption}
              />
            ))}
          </ScrollView>

          {/* Close Button (fallback) */}
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
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
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
  optionButton: {
    backgroundColor: '#252530',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3a45',
    padding: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  optionButtonDisabled: {
    backgroundColor: '#1a1a20',
    borderColor: '#2a2a30',
    opacity: 0.6,
  },
  optionButtonWithItem: {
    borderColor: '#4a4a55',
  },
  optionText: {
    fontSize: 14,
    color: '#ffffff',
  },
  optionTextDisabled: {
    color: '#666666',
  },
  disabledReason: {
    fontSize: 11,
    color: '#aa4444',
    marginTop: 4,
  },
  rarityIndicator: {
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
