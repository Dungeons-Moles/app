/**
 * POIModal Component - T100
 * Displays POI interaction options as an overlay modal
 * @see specs/001-pve-dungeon-crawler/spec.md User Story 5
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  type GestureResponderEvent,
  Image,
  Modal,
  Pressable,
} from 'react-native';
import type {
  POIInteraction,
  POIOption,
  Tool,
  Gear,
  GearId,
  ItemRarity,
  ToolId,
} from '@/game/engine/types';
import { POI_DEFINITIONS, type POIDefinition } from '@/data/pois';
import { getTierFromRarity } from '@/data/gear';

const paperPanelSource = require('../../../assets/ui/panels/paper-panel.png');

const squareSource = require('../../../assets/ui/frames/square.png');

import { TOOL_DEFINITIONS } from '@/game/entities/items';
import { GEAR_DEFINITIONS } from '@/data/gear';
import type { POIId } from '@/game/engine/types';
import { extractStatBonuses, formatStatBonuses } from '@/utils/stat-display';
import { SimplifiedItemOption } from '@/components/poi/SimplifiedItemOption';
import { ItemTooltip as PoiItemTooltip } from '@/components/poi/ItemTooltip';
import { Typography } from '@/theme/typography';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';

interface POIModalProps {
  interaction: POIInteraction | null;
  visible: boolean;
  onSelectOption: (optionIndex: number) => void;
  onClose: () => void;
  kilnSelection?: { gearId: GearId | null; rarity: ItemRarity | null; emoji: string; count: number };
  kilnFuseOptionIndex?: number | null;
  onKilnSlotPress?: (slotIndex: number) => void;
  scrapSelection?: Gear | null;
  scrapOptionIndex?: number | null;
  onScrapSlotPress?: () => void;
  equippedTool?: Tool | null;
  onFastTravel?: () => void;
}

// POI types that use the 3-choice card layout
const THREE_CHOICE_POIS: POIId[] = ['L2', 'L3', 'L4', 'L12', 'L13'];

// Stat-to-emoji mapping for Tool Oil Rack (L4) options
const STAT_EMOJI_MAP: Record<string, { emoji: string; name: string; image?: any }> = {
  '+1 ATK': {
    emoji: '⚔️',
    name: 'Attack Oil',
    image: require('../../../assets/icons/oils/ATK.png'),
  },
  '+1 DIG': {
    emoji: '⛏️',
    name: 'Dig Oil',
    image: require('../../../assets/icons/oils/DIG.png'),
  },
  '+1 SPD': {
    emoji: '⚡',
    name: 'Speed Oil',
    image: require('../../../assets/icons/oils/SPD.png'),
  },
  '+1 ARM': {
    emoji: '🛡️',
    name: 'Armor Oil',
    image: require('../../../assets/icons/oils/ARM.png'),
  },
};

// Helper to get effect description from item definitions
function getItemEffectDescription(item: Tool | Gear | undefined): string | undefined {
  if (!item) return undefined;

  // Check if it's a tool (has 'rarity' but not 'currentRarity')
  if ('rarity' in item && !('currentRarity' in item)) {
    const toolDef = TOOL_DEFINITIONS[item.id as ToolId];
    return toolDef?.effect?.description;
  }

  // It's gear
  const gearDef = GEAR_DEFINITIONS[item.id as GearId];
  return gearDef?.effect?.description;
}

type TooltipState = {
  name: string;
  description?: string;
  rarity: ItemRarity;
  position: { x: number; y: number };
};

function getItemRarity(item: Tool | Gear): ItemRarity {
  return 'rarity' in item ? item.rarity : item.currentRarity;
}

function getRarityColor(item: Tool | Gear): string {
  const rarity = getItemRarity(item);
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

function getTierBorderStyle(rarity: ItemRarity | null | undefined): { borderWidth: number; borderColor: string } | null {
  if (!rarity) return null;
  const tier = getTierFromRarity(rarity);
  switch (tier) {
    case 2:
      return { borderWidth: 2, borderColor: '#4A90D9' };
    case 3:
      return { borderWidth: 2, borderColor: '#FFD700' };
    default:
      return null;
  }
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
    () => [styles.listOptionText, option.disabled && styles.listOptionTextDisabled],
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

// Helper to look up gear definition by ID to get image if instance doesn't have it (though instances should have it)
function getGearImage(gearId: GearId): any {
  return GEAR_DEFINITIONS[gearId]?.image;
}

export function POIModal({
  interaction,
  visible,
  onSelectOption,
  onClose,
  kilnSelection,
  kilnFuseOptionIndex,
  onKilnSlotPress,
  scrapSelection,
  scrapOptionIndex,
  onScrapSlotPress,
  equippedTool,
  onFastTravel,
}: POIModalProps) {
  if (!interaction) {
    return null;
  }

  const poiDef = POI_DEFINITIONS[interaction.poi.definitionId as POIId];
  if (!poiDef) {
    return null;
  }

  const poiId = interaction.poi.definitionId as POIId;
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [anvilModIndex, setAnvilModIndex] = useState<number | null>(null);
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
  const isRuneKiln = poiId === 'L11';
  const isRailWaypoint = poiId === 'L8';
  const isSmugglerHatch = poiId === 'L9';
  const isRustyAnvil = poiId === 'L10';
  const isRestAlcove = poiId === 'L5';
  const isSeismicScanner = poiId === 'L7';
  const isScrapChute = poiId === 'L14';

  useEffect(() => {
    if (!visible) {
      setTooltip(null);
      setAnvilModIndex(null);
    }
  }, [visible]);

  useEffect(() => {
    setTooltip(null);
  }, [poiId]);

  const getOptionRarity = useCallback((option: POIOption): ItemRarity => {
    if (option.item) {
      return getItemRarity(option.item);
    }
    return 'COMMON';
  }, []);

  const getOptionDisplay = useCallback((option: POIOption): string => {
    if (option.item) {
      const statDisplay = formatStatBonuses(extractStatBonuses(option.item));
      if (statDisplay) {
        return statDisplay;
      }
    }

    if (!option.item && option.label) {
      return option.label;
    }

    if (option.description) {
      const descriptionParts = option.description
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      if (descriptionParts.length > 1 && descriptionParts[0] === 'No stats') {
        return descriptionParts.slice(1).join(' ');
      }
      return descriptionParts.join(' ');
    }

    return option.label;
  }, []);

  const handleOptionSelect = useCallback(
    (optionIndex: number) => {
      setTooltip(null);
      onSelectOption(optionIndex);
    },
    [onSelectOption]
  );

  const handleTooltipDismiss = useCallback(() => {
    setTooltip(null);
  }, []);

  const handleOptionLongPress = useCallback(
    (option: POIOption, event: GestureResponderEvent) => {
      if (option.disabled) {
        return;
      }

      const position = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
      const itemName = option.item?.name ?? option.label;
      const rarity = getOptionRarity(option);
      setTooltip({
        name: itemName,
        description: option.description,
        rarity,
        position,
      });
    },
    [getOptionRarity]
  );

  const handleKilnFuse = useCallback(() => {
    if (kilnFuseOptionIndex === null || kilnFuseOptionIndex === undefined) {
      return;
    }
    onSelectOption(kilnFuseOptionIndex);
  }, [kilnFuseOptionIndex, onSelectOption]);

  const variant = useScreenVariant();
  const isCompact = variant === 'compact';

  const ModalWrapper = ({ children, alignLeft }: { children: React.ReactNode; alignLeft?: boolean }) => {
    // In compact mode, use a View-based overlay so the floating sidebar (zIndex 150)
    // can render above the overlay (zIndex 100). Modal creates a separate layer that
    // blocks everything behind it regardless of zIndex.
    if (isCompact) {
      if (!visible) return null;
      return (
        <View style={[styles.compactModalOverlay, alignLeft && styles.compactModalOverlayLeft]}>
          <View style={[styles.compactModalScale, alignLeft && styles.compactModalScaleLeft]}>
            {children}
          </View>
        </View>
      );
    }
    return (
      <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
        <View style={styles.modalContainer}>
          <View style={styles.modalDarkArea}>{children}</View>
          <View style={styles.modalSidebarArea} pointerEvents="none" />
        </View>
      </Modal>
    );
  };

  // Overlay wrapper for POIs that need sidebar interaction (Rune Kiln, Scrap Chute).
  // Uses an absolutely-positioned View instead of <Modal> so the sidebar remains touchable.
  const OverlayWrapper = ({ children }: { children: React.ReactNode }) => {
    if (!visible) return null;
    if (isCompact) {
      return (
        <View style={styles.compactModalOverlay}>
          <View style={styles.compactModalScale}>
            {children}
          </View>
        </View>
      );
    }
    return (
      <View style={styles.overlayContainer} pointerEvents="box-none">
        <View style={styles.modalDarkArea}>{children}</View>
      </View>
    );
  };

  if (isRuneKiln) {
    if (!visible) {
      return null;
    }

    // Get images for rune kiln slots
    const selectedGearImage = kilnSelection?.gearId ? getGearImage(kilnSelection.gearId) : null;
    const filledSlots = kilnSelection?.count ?? 0;
    const fuseDisabled = kilnFuseOptionIndex === null || kilnFuseOptionIndex === undefined;
    const canRemoveSlotOne = filledSlots >= 1 && !!onKilnSlotPress;
    const canRemoveSlotTwo = filledSlots >= 2 && !!onKilnSlotPress;
    const kilnTierBorder = getTierBorderStyle(kilnSelection?.rarity);

    return (
      <OverlayWrapper>
        <View style={styles.inlineModal} pointerEvents="auto">
          <Image
            source={paperPanelSource}
            style={{
              position: 'absolute',
              width: '120%', // Wider for inline/compact
              height: '120%',
              top: '-10%',
              left: '-10%',
              zIndex: -1,
            }}
            resizeMode="stretch"
          />
          <View style={{ padding: 16, paddingTop: 24 }}>
            <TouchableOpacity style={styles.closeButtonTop} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.closeButtonTopText}>X</Text>
            </TouchableOpacity>

            <Text style={styles.threeChoiceTitle}>{poiDef.name}</Text>
            {poiDef.description ? (
              <Text style={styles.description}>{poiDef.description}</Text>
            ) : null}

            <View style={styles.fuseRow}>
              <TouchableOpacity
                style={[styles.fuseSlot, filledSlots < 1 && styles.fuseSlotEmpty, filledSlots >= 1 && kilnTierBorder]}
                onPress={() => onKilnSlotPress?.(0)}
                activeOpacity={0.7}
                disabled={!canRemoveSlotOne}
              >
                <Image
                  source={squareSource}
                  style={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    resizeMode: 'stretch',
                  }}
                />
                {filledSlots >= 1 && selectedGearImage ? (
                  <Image
                    source={selectedGearImage}
                    style={{ width: 40, height: 40 }}
                    resizeMode="contain"
                  />
                ) : filledSlots >= 1 ? (
                  <Text style={styles.fuseEmoji}>{kilnSelection?.emoji}</Text>
                ) : null}
              </TouchableOpacity>
              <Text style={styles.fusePlus}>+</Text>
              <TouchableOpacity
                style={[styles.fuseSlot, filledSlots < 2 && styles.fuseSlotEmpty, filledSlots >= 2 && kilnTierBorder]}
                onPress={() => onKilnSlotPress?.(1)}
                activeOpacity={0.7}
                disabled={!canRemoveSlotTwo}
              >
                <Image
                  source={squareSource}
                  style={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    resizeMode: 'stretch',
                  }}
                />
                {filledSlots >= 2 && selectedGearImage ? (
                  <Image
                    source={selectedGearImage}
                    style={{ width: 40, height: 40 }}
                    resizeMode="contain"
                  />
                ) : filledSlots >= 2 ? (
                  <Text style={styles.fuseEmoji}>{kilnSelection?.emoji}</Text>
                ) : null}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.fuseButton, fuseDisabled && styles.fuseButtonDisabled]}
              onPress={handleKilnFuse}
              activeOpacity={0.7}
              disabled={fuseDisabled}
            >
              <Text style={styles.fuseButtonText}>Fuse</Text>
            </TouchableOpacity>
          </View>
        </View>
      </OverlayWrapper>
    );
  }

  if (isScrapChute) {
    if (!visible) {
      return null;
    }

    const hasSelection = scrapSelection !== null && scrapSelection !== undefined;
    const item = scrapSelection;
    const selectedOption =
      scrapOptionIndex !== null && scrapOptionIndex !== undefined
        ? options[scrapOptionIndex]
        : null;
    const cost = selectedOption?.cost;
    const canAfford = !selectedOption?.disabled;

    return (
      <OverlayWrapper>
        <View style={styles.inlineModal} pointerEvents="auto">
          <Image
            source={paperPanelSource}
            style={{
              position: 'absolute',
              width: '120%',
              height: '120%',
              top: '-10%',
              left: '-10%',
              zIndex: -1,
            }}
            resizeMode="stretch"
          />
          <View style={{ padding: 16, paddingTop: 24 }}>
            <TouchableOpacity style={styles.closeButtonTop} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.closeButtonTopText}>X</Text>
            </TouchableOpacity>

            <Text style={styles.threeChoiceTitle}>{poiDef.name}</Text>
            {poiDef.description ? (
              <Text style={styles.description}>{poiDef.description}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.scrapSlot, hasSelection && getTierBorderStyle(item?.currentRarity)]}
              onPress={() => onScrapSlotPress?.()}
              activeOpacity={0.7}
              disabled={!hasSelection}
            >
              <Image
                source={squareSource}
                style={{
                  position: 'absolute',
                  width: '100%',
                  height: '100%',
                  resizeMode: 'stretch',
                }}
              />
              {hasSelection && item ? (
                item.image ? (
                  <Image
                    source={item.image}
                    style={{ width: 48, height: 48 }}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={styles.scrapEmoji}>{item.emoji}</Text>
                )
              ) : (
                <Text style={styles.scrapPlus}>+</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.helperText}>
              {hasSelection
                ? `Selected: ${item?.name}`
                : options.length <= 1
                  ? 'No gear to scrap'
                  : 'Select gear from inventory'}
            </Text>

            <TouchableOpacity
              style={[
                styles.scrapButton,
                (!hasSelection || !canAfford) && styles.scrapButtonDisabled,
              ]}
              onPress={() =>
                scrapOptionIndex !== null &&
                scrapOptionIndex !== undefined &&
                onSelectOption(scrapOptionIndex)
              }
              activeOpacity={0.7}
              disabled={!hasSelection || !canAfford}
            >
              <Text style={styles.scrapButtonText}>{cost ? `Scrap (-${cost}g)` : 'Scrap'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </OverlayWrapper>
    );
  }

  if (isThreeChoicePOI && hasValidOptions) {
    if (!visible) {
      return null;
    }

    return (
      <ModalWrapper alignLeft={poiId !== 'L4'}>
        <View style={styles.threeChoiceModal} pointerEvents="auto">
          <Image
            source={paperPanelSource}
            style={{
              position: 'absolute',
              width: '110%', // Increased from 100%
              height: '115%', // Increased from 100%
              top: '-7.5%', // Centering adjustment
              left: '-5%', // Centering adjustment
              zIndex: -1,
            }}
            resizeMode="stretch"
          />

          <View style={{ padding: 24, paddingTop: 32 }}>
            <TouchableOpacity style={styles.closeButtonTop} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.closeButtonTopText}>X</Text>
            </TouchableOpacity>

            <Text style={styles.threeChoiceTitle}>{poiDef.name}</Text>
            {poiDef.description ? (
              <Text style={styles.description}>{poiDef.description}</Text>
            ) : null}

            <View style={styles.cardsContainer}>
              {options.slice(0, 3).map((option, index) => {
                const statDisplay = option.item
                  ? formatStatBonuses(extractStatBonuses(option.item)) || undefined
                  : getOptionDisplay(option);
                const rarity = getOptionRarity(option);
                // For Tool Oil Rack (L4), use stat emoji mapping
                const statMapping = STAT_EMOJI_MAP[option.label];
                const emoji = option.item?.emoji ?? statMapping?.emoji;
                const image = option.item?.image ?? statMapping?.image;
                const itemName = option.item?.name ?? statMapping?.name ?? option.label;
                const effectDescription = getItemEffectDescription(option.item);
                return (
                  <SimplifiedItemOption
                    key={index}
                    emoji={emoji}
                    image={image}
                    statDisplay={statDisplay}
                    effectDescription={effectDescription}
                    rarity={rarity}
                    itemName={itemName}
                    disabled={option.disabled}
                    onSelect={() => handleOptionSelect(index)}
                    onLongPress={(event) => handleOptionLongPress(option, event)}
                  />
                );
              })}
            </View>
            {tooltip ? (
              <PoiItemTooltip
                name={tooltip.name}
                description={tooltip.description}
                rarity={tooltip.rarity}
                anchorPosition={tooltip.position}
                onDismiss={handleTooltipDismiss}
              />
            ) : null}
          </View>
        </View>
      </ModalWrapper>
    );
  }

  if (isRailWaypoint) {
    if (!visible) {
      return null;
    }

    const hasOtherWaypoints = displayOptions.some(
      ({ option }) => !option.disabled && option.label.startsWith('Travel')
    );
    return (
      <ModalWrapper>
        <View style={styles.standardModal} pointerEvents="auto">
          <Image
            source={paperPanelSource}
            style={{
              position: 'absolute',
              width: '115%',
              height: '115%',
              top: '-7.5%',
              left: '-7.5%',
              zIndex: -1,
            }}
            resizeMode="stretch"
          />
          <View style={{ padding: 16, paddingTop: 24 }}>
            <TouchableOpacity style={styles.closeButtonTop} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.closeButtonTopText}>X</Text>
            </TouchableOpacity>

            <Text style={styles.threeChoiceTitle}>{poiDef.name}</Text>

            {hasOtherWaypoints ? (
              <TouchableOpacity style={styles.primaryButton} onPress={() => onFastTravel?.()} activeOpacity={0.7}>
                <Text style={styles.primaryButtonText}>Fast travel?</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.helperText}>No other waypoints discovered</Text>
            )}
          </View>
        </View>
      </ModalWrapper>
    );
  }

  if (isSmugglerHatch) {
    if (!visible) {
      return null;
    }

    const shopItems = displayOptions.filter(({ option }) => option.item);
    const rerollOption = indexedOptions.find(({ option }) => option.label.includes('Reroll'));
    const rerollDisabled = !rerollOption || rerollOption.option.disabled;
    const gridItems = shopItems.slice(0, 6);

    return (
      <ModalWrapper>
        <View style={styles.standardModal} pointerEvents="auto">
          <Image
            source={paperPanelSource}
            style={{
              position: 'absolute',
              width: '115%',
              height: '115%',
              top: '-7.5%',
              left: '-7.5%',
              zIndex: -1,
            }}
            resizeMode="stretch"
          />
          <View style={{ padding: 16, paddingTop: 24 }}>
            <TouchableOpacity style={styles.closeButtonTop} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.closeButtonTopText}>X</Text>
            </TouchableOpacity>

            <Text style={styles.threeChoiceTitle}>{poiDef.name}</Text>
            {poiDef.description ? (
              <Text style={styles.description}>{poiDef.description}</Text>
            ) : null}

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
                      <Image
                        source={squareSource}
                        style={{
                          position: 'absolute',
                          width: '100%',
                          height: '100%',
                          resizeMode: 'stretch',
                        }}
                      />
                      {option.item?.image ? (
                        <Image
                          source={option.item.image}
                          style={styles.shopImage}
                          resizeMode="contain"
                        />
                      ) : (
                        <Text style={styles.shopEmoji}>{option.item?.emoji}</Text>
                      )}
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
      </ModalWrapper>
    );
  }

  if (isRustyAnvil) {
    if (!visible) {
      return null;
    }

    const tool = equippedTool;
    // For Anvil, we typically have 1 upgrade option + Leave.
    // The first option is the upgrade option.
    const upgradeOption = displayOptions.length > 0 ? displayOptions[0].option : null;
    const canAfford = upgradeOption && !upgradeOption.disabled;

    return (
      <ModalWrapper>
        <View style={[styles.standardModal, styles.compactModal]} pointerEvents="auto">
          <Image
            source={paperPanelSource}
            style={{
              position: 'absolute',
              width: '120%',
              height: '120%',
              top: '-10%',
              left: '-10%',
              zIndex: -1,
            }}
            resizeMode="stretch"
          />
          <View style={{ padding: 16, paddingTop: 24 }}>
            <TouchableOpacity style={styles.closeButtonTop} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.closeButtonTopText}>X</Text>
            </TouchableOpacity>

            <Text style={styles.threeChoiceTitle}>{poiDef.name}</Text>
            {poiDef.description ? (
              <Text style={styles.description}>{poiDef.description}</Text>
            ) : null}

            <View style={styles.anvilSlot}>
              <Image
                source={squareSource}
                style={{
                  position: 'absolute',
                  width: '100%',
                  height: '100%',
                  resizeMode: 'stretch',
                }}
              />
              {tool && tool.image ? (
                <Image source={tool.image} style={{ width: 64, height: 64 }} resizeMode="contain" />
              ) : tool ? (
                <Text style={{ fontSize: 32 }}>{tool.emoji}</Text>
              ) : (
                <Text style={styles.helperText}>No tool</Text>
              )}
            </View>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                { marginTop: 16 },
                (!upgradeOption || !canAfford) && styles.primaryButtonDisabled,
              ]}
              onPress={() => upgradeOption && onSelectOption(displayOptions[0].index)}
              disabled={!upgradeOption || !canAfford}
            >
              <Text style={styles.primaryButtonText}>
                {upgradeOption?.cost
                  ? `Upgrade (${upgradeOption.cost}g)`
                  : upgradeOption?.label || 'Upgrade'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ModalWrapper>
    );
  }

  if (isRestAlcove) {
    if (!visible) {
      return null;
    }
    const restOption = displayOptions[0];
    return (
      <ModalWrapper>
        <View style={styles.standardModal} pointerEvents="auto">
          <Image
            source={paperPanelSource}
            style={{
              position: 'absolute',
              width: '115%',
              height: '115%',
              top: '-7.5%',
              left: '-7.5%',
              zIndex: -1,
            }}
            resizeMode="stretch"
          />
          <View style={{ padding: 16, paddingTop: 24 }}>
            <TouchableOpacity style={styles.closeButtonTop} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.closeButtonTopText}>X</Text>
            </TouchableOpacity>

            <Text style={styles.threeChoiceTitle}>{poiDef.name}</Text>
            {poiDef.description ? (
              <Text style={styles.description}>{poiDef.description}</Text>
            ) : null}

            {restOption && (
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  restOption.option.disabled && styles.primaryButtonDisabled,
                ]}
                onPress={() => onSelectOption(restOption.index)}
                activeOpacity={0.7}
                disabled={restOption.option.disabled}
              >
                <Text style={styles.primaryButtonText}>{restOption.option.label}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ModalWrapper>
    );
  }

  if (isSeismicScanner) {
    if (!visible) {
      return null;
    }

    const activeScannerOptions = displayOptions.filter(({ option }) => !option.disabled);
    const emptyOption = displayOptions.find(({ option }) => option.disabled);

    return (
      <ModalWrapper>
        <View style={styles.standardModal} pointerEvents="auto">
          <Image
            source={paperPanelSource}
            style={{
              position: 'absolute',
              width: '115%',
              height: '115%',
              top: '-7.5%',
              left: '-7.5%',
              zIndex: -1,
            }}
            resizeMode="stretch"
          />
          <View style={{ padding: 16, paddingTop: 24 }}>
            <TouchableOpacity style={styles.closeButtonTop} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.closeButtonTopText}>X</Text>
            </TouchableOpacity>

            <Text style={styles.threeChoiceTitle}>{poiDef.name}</Text>
            {poiDef.description ? (
              <Text style={styles.description}>{poiDef.description}</Text>
            ) : null}

            {activeScannerOptions.length > 0 ? (
              <View style={styles.gridWrapper}>
                <View style={styles.scannerGrid}>
                  {activeScannerOptions.map(({ option, index }) => {
                    const emoji = option.label.split(' ')[0];
                    // Find the POI definition corresponding to this option
                    const poiDef = Object.values(POI_DEFINITIONS).find((def) =>
                      option.label.includes(def.name)
                    );
                    return (
                      <TouchableOpacity
                        key={`scan-${index}`}
                        style={styles.scannerCell}
                        onPress={() => onSelectOption(index)}
                        activeOpacity={0.7}
                      >
                        <Image
                          source={squareSource}
                          style={{
                            position: 'absolute',
                            width: '100%',
                            height: '100%',
                            resizeMode: 'stretch',
                          }}
                        />
                        {poiDef?.image ? (
                          <Image
                            source={poiDef.image}
                            style={styles.scannerImage}
                            resizeMode="contain"
                          />
                        ) : (
                          <Text style={styles.scannerEmoji}>{emoji}</Text>
                        )}
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
      </ModalWrapper>
    );
  }

  if (!visible) {
    return null;
  }

  return (
    <ModalWrapper>
      <View style={styles.standardModal} pointerEvents="auto">
        <Image
          source={paperPanelSource}
          style={{
            position: 'absolute',
            width: '115%',
            height: '115%',
            top: '-7.5%',
            left: '-7.5%',
            zIndex: -1,
          }}
          resizeMode="stretch"
        />
        <View style={{ padding: 16, paddingTop: 24 }}>
          <TouchableOpacity style={styles.closeButtonTop} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.closeButtonTopText}>X</Text>
          </TouchableOpacity>

          <Text style={styles.threeChoiceTitle}>{poiDef.name}</Text>
          {poiDef.description ? <Text style={styles.description}>{poiDef.description}</Text> : null}

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
    </ModalWrapper>
  );
}

const styles = StyleSheet.create({
  // ============================================================================
  // Overlay & Container
  // ============================================================================
  modalContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 230,
    zIndex: 100,
  },
  overlayContainerCompact: {
    right: 0,
  },
  compactModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  compactModalOverlayLeft: {
    alignItems: 'flex-start',
    paddingLeft: 48,
  },
  compactModalScale: {
    transform: [{ scale: 1.4 }],
  },
  compactModalScaleLeft: {
    transformOrigin: 'left center',
  },
  modalDarkArea: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSidebarArea: {
    width: 230,
    backgroundColor: 'transparent',
  },

  // ============================================================================
  // Modal Containers
  // ============================================================================
  threeChoiceModal: {
    borderRadius: 4,
    maxWidth: 580,
    width: '100%',
    position: 'relative',
    overflow: 'visible', // Changed from hidden to visible
  },
  standardModal: {
    borderRadius: 4,
    maxWidth: 420,
    width: '100%',
    position: 'relative',
    overflow: 'visible',
  },
  compactModal: {
    maxWidth: 300,
  },
  inlineModal: {
    borderRadius: 4,
    maxWidth: 320,
    width: '80%',
    position: 'relative',
    overflow: 'visible',
  },
  threeChoiceTitle: {
    fontFamily: Typography.header,
    fontSize: 22,
    color: '#3d2b1f',
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: 'bold',
  },
  description: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#5c4033',
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
  // Close Button (Top Right)
  // ============================================================================
  closeButtonTop: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  closeButtonTopText: {
    fontFamily: Typography.number,
    fontSize: 24,
    color: 'black',
    fontWeight: 'bold',
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
    fontFamily: Typography.button,
    fontSize: 15,
    color: '#ffffff',
  },
  helperText: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#888888',
    textAlign: 'center',
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  shopCellEmpty: {
    // backgroundColor: '#1a1a20', // Removed
    // borderColor: '#2a2a30', // Removed
  },
  shopCellDisabled: {
    opacity: 0.5,
  },
  shopEmoji: {
    fontSize: 20,
  },
  shopImage: {
    width: 32,
    height: 32,
  },
  shopCost: {
    fontFamily: Typography.number,
    fontSize: 12,
    color: '#3d2b1f',
    marginTop: 4,
    fontWeight: 'bold',
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
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#ffffff',
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
    width: 80, // Increased size
    height: 80, // Increased size
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  scannerEmoji: {
    fontSize: 32, // Increased size
  },
  scannerImage: {
    width: 60, // Increased size
    height: 60, // Increased size
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
  // Rune Kiln Fuse
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
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  fuseSlotEmpty: {
    // Styles handled by image opacity or can be removed if image covers all
  },
  fuseEmoji: {
    fontSize: 28,
  },
  fusePlus: {
    fontFamily: Typography.number,
    fontSize: 24,
    color: '#000000',
    marginHorizontal: 12,
  },
  fuseButton: {
    backgroundColor: '#252530',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4a4a55',
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  fuseButtonDisabled: {
    opacity: 0.5,
  },
  fuseButtonText: {
    fontFamily: Typography.button,
    fontSize: 15,
    color: '#ffffff',
  },

  // ============================================================================
  // Scrap Chute
  // ============================================================================
  scrapSlot: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  scrapEmoji: {
    fontSize: 32,
  },
  scrapPlus: {
    fontFamily: Typography.number,
    fontSize: 32,
    color: '#000000',
  },
  scrapButton: {
    backgroundColor: '#252530',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4a4a55',
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  scrapButtonDisabled: {
    opacity: 0.5,
  },
  scrapButtonText: {
    fontFamily: Typography.button,
    fontSize: 15,
    color: '#ffffff',
  },

  // ============================================================================
  // Rusty Anvil
  // ============================================================================
  anvilSlot: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
});

export default POIModal;
