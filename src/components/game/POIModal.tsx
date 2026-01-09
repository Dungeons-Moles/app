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
} from 'react-native';
import type { POIInteraction, POIOption, Tool, Gear, GearId } from '../../game/engine/types';
import { POI_DEFINITIONS } from '../../data/pois';
import type { POIId } from '../../game/map/types';

interface POIModalProps {
  interaction: POIInteraction | null;
  visible: boolean;
  onSelectOption: (optionIndex: number) => void;
  onClose: () => void;
  golemSelection?: { gearId: GearId | null; emoji: string; count: number };
  golemFuseOptionIndex?: number | null;
  onGolemSlotPress?: (slotIndex: number) => void;
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
  golemSelection,
  golemFuseOptionIndex,
  onGolemSlotPress,
}: POIModalProps) {
  if (!interaction) {
    return null;
  }

  const poiDef = POI_DEFINITIONS[interaction.poi.definitionId as POIId];
  if (!poiDef) {
    return null;
  }

  const poiId = interaction.poi.definitionId as POIId;
  const options = interaction.options ?? [];
  const indexedOptions = useMemo(
    () => options.map((option, index) => ({ option, index })),
    [options]
  );
  const displayOptions = useMemo(
    () => indexedOptions.filter(({ option }) => option.label !== 'Leave'),
    [indexedOptions]
  );

  const isThreeChoicePOI = THREE_CHOICE_POIS.includes(poiId);
  const hasValidOptions = options.length > 0 && !options[0]?.disabled;
  const isCrusherGolem = poiId === 'L11';
  const isRailWaypoint = poiId === 'L8';
  const isSmugglerHatch = poiId === 'L9';
  const isRustyAnvil = poiId === 'L10';
  const isRestAlcove = poiId === 'L5';
  const isSeismicScanner = poiId === 'L7';

  const handleGolemFuse = useCallback(() => {
    if (golemFuseOptionIndex === null || golemFuseOptionIndex === undefined) {
      return;
    }
    onSelectOption(golemFuseOptionIndex);
  }, [golemFuseOptionIndex, onSelectOption]);

  if (isCrusherGolem) {
    if (!visible) {
      return null;
    }

    const selectedEmoji = golemSelection?.emoji ?? '';
    const filledSlots = golemSelection?.count ?? 0;
    const fuseDisabled = golemFuseOptionIndex === null || golemFuseOptionIndex === undefined;
    const canRemoveSlotOne = filledSlots >= 1 && !!onGolemSlotPress;
    const canRemoveSlotTwo = filledSlots >= 2 && !!onGolemSlotPress;

    return (
      <View style={styles.inlineOverlay} pointerEvents="box-none">
        <View style={styles.inlineModal} pointerEvents="auto">
          <TouchableOpacity
            style={styles.closeButtonTop}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={styles.closeButtonTopText}>X</Text>
          </TouchableOpacity>

          <Text style={styles.threeChoiceTitle}>{poiDef.name}</Text>

          <View style={styles.fuseRow}>
            <TouchableOpacity
              style={[styles.fuseSlot, filledSlots < 1 && styles.fuseSlotEmpty]}
              onPress={() => onGolemSlotPress?.(0)}
              activeOpacity={0.7}
              disabled={!canRemoveSlotOne}
            >
              {filledSlots >= 1 && <Text style={styles.fuseEmoji}>{selectedEmoji}</Text>}
            </TouchableOpacity>
            <Text style={styles.fusePlus}>+</Text>
            <TouchableOpacity
              style={[styles.fuseSlot, filledSlots < 2 && styles.fuseSlotEmpty]}
              onPress={() => onGolemSlotPress?.(1)}
              activeOpacity={0.7}
              disabled={!canRemoveSlotTwo}
            >
              {filledSlots >= 2 && <Text style={styles.fuseEmoji}>{selectedEmoji}</Text>}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.fuseButton, fuseDisabled && styles.fuseButtonDisabled]}
            onPress={handleGolemFuse}
            activeOpacity={0.7}
            disabled={fuseDisabled}
          >
            <Text style={styles.fuseButtonText}>Fuse</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

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
            <TouchableOpacity
              style={styles.closeButtonTop}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.closeButtonTopText}>X</Text>
            </TouchableOpacity>

            <Text style={styles.threeChoiceTitle}>{poiDef.name}</Text>

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

  if (isRailWaypoint) {
    const hasOtherWaypoints = displayOptions.some(
      ({ option }) => !option.disabled && option.label.startsWith('Travel')
    );
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <View style={styles.standardModal}>
            <TouchableOpacity
              style={styles.closeButtonTop}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.closeButtonTopText}>X</Text>
            </TouchableOpacity>

            <Text style={styles.threeChoiceTitle}>{poiDef.name}</Text>

            {hasOtherWaypoints ? (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => {}}
                activeOpacity={0.7}
              >
                <Text style={styles.primaryButtonText}>Fast travel?</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.helperText}>No other waypoints discovered</Text>
            )}
          </View>
        </View>
      </Modal>
    );
  }

  if (isSmugglerHatch) {
    const shopItems = displayOptions.filter(({ option }) => option.item);
    const rerollOption = indexedOptions.find(({ option }) => option.label.includes('Reroll'));
    const rerollDisabled = !rerollOption || rerollOption.option.disabled;
    const gridItems = shopItems.slice(0, 6);

    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <View style={styles.standardModal}>
            <TouchableOpacity
              style={styles.closeButtonTop}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.closeButtonTopText}>X</Text>
            </TouchableOpacity>

            <Text style={styles.threeChoiceTitle}>{poiDef.name}</Text>

            <View style={styles.gridWrapper}>
              <View style={styles.shopGrid}>
                {gridItems.map(({ option, index: optionIndex }) => {
                  const disabled = option.disabled;
                  return (
                    <TouchableOpacity
                      key={`shop-${optionIndex}`}
                      style={[styles.shopCell, disabled && styles.shopCellDisabled]}
                      onPress={() => onSelectOption(optionIndex)}
                      activeOpacity={0.7}
                      disabled={disabled}
                    >
                      <Text style={styles.shopEmoji}>{option.item?.emoji}</Text>
                      {option.cost !== undefined && (
                        <Text style={styles.shopCost}>{option.cost}g</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.rerollButton, rerollDisabled && styles.rerollButtonDisabled]}
              onPress={() => rerollOption && onSelectOption(rerollOption.index)}
              activeOpacity={0.7}
              disabled={rerollDisabled}
            >
              <Text style={styles.rerollButtonText}>
                {rerollOption?.option.label ?? 'Reroll shop'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  if (isRustyAnvil) {
    const noToolOption = displayOptions.find(({ option }) => option.label === 'No tool equipped');
    const forgeOptions = noToolOption ? [] : displayOptions;

    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <View style={[styles.standardModal, styles.compactModal]}>
            <TouchableOpacity
              style={styles.closeButtonTop}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.closeButtonTopText}>X</Text>
            </TouchableOpacity>

            <Text style={styles.threeChoiceTitle}>{poiDef.name}</Text>

            {noToolOption ? (
              <Text style={styles.helperText}>{noToolOption.option.label}</Text>
            ) : (
              <View style={styles.gridWrapper}>
                <View style={styles.anvilGrid}>
                  {forgeOptions.map(({ option, index }) => {
                    const emoji = option.label.split(' ')[0];
                    const disabled = option.disabled;
                    return (
                      <TouchableOpacity
                        key={`anvil-${index}`}
                        style={[styles.anvilCell, disabled && styles.shopCellDisabled]}
                        onPress={() => onSelectOption(index)}
                        activeOpacity={0.7}
                        disabled={disabled}
                      >
                        <Text style={styles.shopEmoji}>{emoji}</Text>
                        {option.cost !== undefined && (
                          <Text style={styles.shopCost}>{option.cost}g</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    );
  }

  if (isRestAlcove) {
    const restOption = displayOptions[0];
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <View style={styles.standardModal}>
            <TouchableOpacity
              style={styles.closeButtonTop}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.closeButtonTopText}>X</Text>
            </TouchableOpacity>

            <Text style={styles.threeChoiceTitle}>{poiDef.name}</Text>

            {restOption && (
              <TouchableOpacity
                style={[styles.primaryButton, restOption.option.disabled && styles.primaryButtonDisabled]}
                onPress={() => onSelectOption(restOption.index)}
                activeOpacity={0.7}
                disabled={restOption.option.disabled}
              >
                <Text style={styles.primaryButtonText}>{restOption.option.label}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    );
  }

  if (isSeismicScanner) {
    const activeScannerOptions = displayOptions.filter(({ option }) => !option.disabled);
    const emptyOption = displayOptions.find(({ option }) => option.disabled);

    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <View style={styles.standardModal}>
            <TouchableOpacity
              style={styles.closeButtonTop}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.closeButtonTopText}>X</Text>
            </TouchableOpacity>

            <Text style={styles.threeChoiceTitle}>{poiDef.name}</Text>

            {activeScannerOptions.length > 0 ? (
              <View style={styles.gridWrapper}>
                <View style={styles.scannerGrid}>
                  {activeScannerOptions.map(({ option, index }) => {
                    const emoji = option.label.split(' ')[0];
                    return (
                      <TouchableOpacity
                        key={`scan-${index}`}
                        style={styles.scannerCell}
                        onPress={() => onSelectOption(index)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.scannerEmoji}>{emoji}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : (
              <Text style={styles.helperText}>
                {emptyOption?.option.label ?? 'No POIs to reveal'}
              </Text>
            )}
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.standardModal}>
          <TouchableOpacity
            style={styles.closeButtonTop}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={styles.closeButtonTopText}>X</Text>
          </TouchableOpacity>

          <Text style={styles.threeChoiceTitle}>{poiDef.name}</Text>
          {poiDef.description ? (
            <Text style={styles.description}>{poiDef.description}</Text>
          ) : null}

          <View style={styles.optionsContent}>
            {displayOptions.map(({ option, index }) => (
              <ListOptionButton
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
  inlineOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingRight: 160,
  },

  // ============================================================================
  // Modal Containers
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
  standardModal: {
    backgroundColor: '#1a1a1f',
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#4a4a55',
    padding: 16,
    paddingTop: 24,
    maxWidth: 420,
    width: '100%',
    position: 'relative',
  },
  compactModal: {
    maxWidth: 300,
  },
  inlineModal: {
    backgroundColor: '#1a1a1f',
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#4a4a55',
    padding: 16,
    paddingTop: 24,
    maxWidth: 320,
    width: '80%',
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
  description: {
    fontSize: 12,
    color: '#888888',
    marginBottom: 16,
    lineHeight: 16,
    textAlign: 'center',
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
  // Default List Layout
  // ============================================================================
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

  // ============================================================================
  // Primary Actions
  // ============================================================================
  primaryButton: {
    backgroundColor: '#252530',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4a4a55',
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontSize: 13,
    color: '#ffffff',
    fontFamily: 'monospace',
  },
  helperText: {
    fontSize: 12,
    color: '#888888',
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  gridWrapper: {
    width: '100%',
    alignItems: 'center',
  },

  // ============================================================================
  // Smuggler Hatch Grid
  // ============================================================================
  shopGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
    width: 240,
    alignSelf: 'center',
  },
  shopCell: {
    width: 70,
    height: 70,
    backgroundColor: '#252530',
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#4a4a55',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shopCellEmpty: {
    backgroundColor: '#1a1a20',
    borderColor: '#2a2a30',
  },
  shopCellDisabled: {
    opacity: 0.5,
  },
  shopEmoji: {
    fontSize: 20,
  },
  shopCost: {
    fontSize: 11,
    color: '#FFD700',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  rerollButton: {
    backgroundColor: '#2a2a35',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4a4a55',
    paddingVertical: 8,
    alignItems: 'center',
  },
  rerollButtonDisabled: {
    opacity: 0.5,
  },
  rerollButtonText: {
    fontSize: 12,
    color: '#ffffff',
    fontFamily: 'monospace',
  },

  // ============================================================================
  // Seismic Scanner Grid
  // ============================================================================
  scannerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    width: 320,
    alignSelf: 'center',
  },
  scannerCell: {
    width: 44,
    height: 44,
    backgroundColor: '#252530',
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#4a4a55',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerEmoji: {
    fontSize: 18,
  },

  // ============================================================================
  // Rusty Anvil Grid
  // ============================================================================
  anvilGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    width: 180,
    marginBottom: 8,
  },
  anvilCell: {
    width: 70,
    height: 70,
    backgroundColor: '#252530',
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#4a4a55',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ============================================================================
  // Crusher Golem Fuse
  // ============================================================================
  fuseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
  },
  fuseSlot: {
    width: 56,
    height: 56,
    backgroundColor: '#252530',
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#4a4a55',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fuseSlotEmpty: {
    backgroundColor: '#1a1a20',
    borderColor: '#2a2a30',
  },
  fuseEmoji: {
    fontSize: 20,
  },
  fusePlus: {
    fontSize: 18,
    color: '#ffffff',
    fontFamily: 'monospace',
  },
  fuseButton: {
    backgroundColor: '#252530',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4a4a55',
    paddingVertical: 10,
    alignItems: 'center',
  },
  fuseButtonDisabled: {
    opacity: 0.5,
  },
  fuseButtonText: {
    fontSize: 13,
    color: '#ffffff',
    fontFamily: 'monospace',
  },
});

export default POIModal;
