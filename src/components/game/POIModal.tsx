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
  Modal,
  Pressable,
  Platform,
  Dimensions,
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

const paperPanelSource = require('../../../assets/ui/panels/paper-panel.webp');

const squareSource = require('../../../assets/ui/frames/square.webp');
const squareBlueSource = require('../../../assets/ui/frames/square-blue.webp');
const squareYellowSource = require('../../../assets/ui/frames/square-yellow.webp');

import { TOOL_DEFINITIONS, getToolStatsAtTier } from '@/game/entities/items';
import { SCRAP_REFUND_BY_RARITY } from '@/game/entities/pois';
import { GEAR_DEFINITIONS } from '@/data/gear';
import type { POIId } from '@/game/engine/types';
import { extractStatBonuses, formatStatBonuses } from '@/utils/stat-display';
import { SimplifiedItemOption } from '@/components/poi/SimplifiedItemOption';
import { ItemTooltip as PoiItemTooltip } from '@/components/poi/ItemTooltip';
import { Typography } from '@/theme/typography';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';
import { useInputMode } from '../../hooks/useInputMode';
import { useControllerAction } from '../../hooks/useControllerAction';
import { FocusGlow } from '../ui/FocusGlow';
import { useAudio, type SfxTrack } from '@/contexts/AudioContext';
import { CachedImage as Image } from '../common/CachedImage';
import { preloadCriticalImages } from '@/utils/preloadCriticalImages';

const POI_SFX_MAP: Partial<Record<string, SfxTrack>> = {
  L1: 'poi_rest',
  L2: 'poi_loot_crate',
  L3: 'poi_loot_crate',
  L4: 'poi_oil_rack',
  L5: 'poi_rest',
  L6: 'poi_scanner',
  L7: 'poi_scanner',
  L8: 'poi_rail',
  L9: 'poi_smuggler',
  L10: 'poi_anvil',
  L11: 'poi_kiln',
  L12: 'poi_geode',
  L13: 'poi_loot_crate',
  L14: 'poi_scrap',
};

interface POIModalProps {
  interaction: POIInteraction | null;
  visible: boolean;
  onSelectOption: (optionIndex: number) => void;
  onClose: () => void;
  kilnSelection?: {
    gearId: GearId | null;
    rarity: ItemRarity | null;
    emoji: string;
    count: number;
  };
  kilnFuseOptionIndex?: number | null;
  onKilnSlotPress?: (slotIndex: number) => void;
  scrapSelection?: Gear | null;
  scrapOptionIndex?: number | null;
  onScrapSlotPress?: () => void;
  equippedTool?: Tool | null;
  onFastTravel?: () => void;
  /** Gear items for controller-mode inventory cycling (Rune Kiln / Scrap Chute). */
  selectableGear?: Gear[];
  /** Called when controller selects a gear item from the inline inventory. */
  onGearSelect?: (gear: Gear) => void;
  centerInCompact?: boolean;
}

// POI types that use the 3-choice card layout
const THREE_CHOICE_POIS: POIId[] = ['L2', 'L3', 'L4', 'L12', 'L13'];

// Stat-to-emoji mapping for Tool Oil Rack (L4) options
const STAT_EMOJI_MAP: Record<string, { emoji: string; name: string; image?: any }> = {
  '+1 ATK': {
    emoji: '⚔️',
    name: 'Attack Oil',
    image: require('../../../assets/icons/oils/ATK.webp'),
  },
  '+1 DIG': {
    emoji: '⛏️',
    name: 'Dig Oil',
    image: require('../../../assets/icons/oils/DIG.webp'),
  },
  '+1 SPD': {
    emoji: '⚡',
    name: 'Speed Oil',
    image: require('../../../assets/icons/oils/SPD.webp'),
  },
  '+1 ARM': {
    emoji: '🛡️',
    name: 'Armor Oil',
    image: require('../../../assets/icons/oils/ARM.webp'),
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

function getTierSquareSource(rarity: ItemRarity | null | undefined): any {
  if (!rarity) return squareSource;
  const tier = getTierFromRarity(rarity);
  switch (tier) {
    case 2:
      return squareBlueSource;
    case 3:
      return squareYellowSource;
    default:
      return squareSource;
  }
}

interface ListOptionButtonProps {
  option: POIOption;
  index: number;
  onPress: (index: number) => void;
}

function isToolOption(option: POIOption): boolean {
  if (!option.item) return false;
  return option.item.id.startsWith('T');
}

function orderSmugglerShopItems<T extends { option: POIOption; index: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aTool = isToolOption(a.option);
    const bTool = isToolOption(b.option);
    if (aTool === bTool) return a.index - b.index;
    return aTool ? -1 : 1;
  });
}

function ListOptionButton({ option, index, onPress }: ListOptionButtonProps) {
  const { playSfx } = useAudio();
  const handlePress = useCallback(() => {
    if (!option.disabled) {
      playSfx('ui_click');
      onPress(index);
    } else {
      playSfx('ui_error');
    }
  }, [option.disabled, index, onPress, playSfx]);

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

// ============================================================================
// Stable wrapper components (defined outside POIModal to avoid re-mount flicker)
// ============================================================================

interface ModalWrapperProps {
  children: React.ReactNode;
  alignLeft?: boolean;
  visible: boolean;
  isCompact: boolean;
  onClose: () => void;
  centerInCompact?: boolean;
}

function ModalWrapper({
  children,
  alignLeft,
  visible,
  isCompact,
  onClose,
  centerInCompact,
}: ModalWrapperProps) {
  if (isCompact) {
    if (!visible) return null;
    const shouldAlignLeft = alignLeft && !centerInCompact;
    const shouldCenterWide = alignLeft && centerInCompact;
    return (
      <View style={[styles.compactModalOverlay, shouldAlignLeft && styles.compactModalOverlayLeft]}>
        <View
          style={[
            styles.compactModalScale,
            shouldAlignLeft && styles.compactModalScaleLeft,
            shouldCenterWide && styles.compactModalScaleCenter,
          ]}
        >
          {children}
        </View>
      </View>
    );
  }
  if (Platform.OS !== 'web') {
    if (!visible) return null;
    return (
      <View style={styles.nativeModalOverlay}>
        {/* Dark overlay — covers game area only (not sidebar) */}
        <View style={styles.nativeModalDarkBg} pointerEvents="none" />
        {/* Modal content — positioned above the dark overlay */}
        <View style={styles.nativeModalContentLayer}>
          <View style={styles.nativeModalCenter}>{children}</View>
          <View style={styles.modalSidebarArea} pointerEvents="none" />
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
}

interface OverlayWrapperProps {
  children: React.ReactNode;
  visible: boolean;
  isCompact: boolean;
}

function OverlayWrapper({ children, visible, isCompact }: OverlayWrapperProps) {
  if (!visible) return null;
  if (isCompact) {
    return (
      <View style={styles.compactModalOverlay}>
        <View style={styles.compactModalScale}>{children}</View>
      </View>
    );
  }
  if (Platform.OS !== 'web') {
    return (
      <View style={styles.nativeModalOverlay} pointerEvents="box-none">
        <View style={styles.nativeModalDarkBg} pointerEvents="none" />
        <View style={styles.nativeModalContentLayer} pointerEvents="box-none">
          <View style={styles.nativeModalCenter} pointerEvents="box-none">{children}</View>
          <View style={styles.modalSidebarArea} pointerEvents="box-none" />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.overlayContainer} pointerEvents="box-none">
      <View style={styles.modalDarkArea}>{children}</View>
    </View>
  );
}

export const POIModal = React.memo(function POIModal({
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
  selectableGear,
  onGearSelect,
  centerInCompact,
}: POIModalProps) {
  if (!interaction) {
    return null;
  }

  const poiDef = POI_DEFINITIONS[interaction.poi.definitionId as POIId];
  if (!poiDef) {
    return null;
  }

  const poiId = interaction.poi.definitionId as POIId;
  const { playSfx } = useAudio();
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [anvilModIndex, setAnvilModIndex] = useState<number | null>(null);
  const [selectedShopIndex, setSelectedShopIndex] = useState<number | null>(null);
  const [selectedThreeChoiceIndex, setSelectedThreeChoiceIndex] = useState<number | null>(null);
  const options = interaction.options ?? [];
  const indexedOptions = useMemo(
    () => options.map((option, index) => ({ option, index })),
    [options]
  );
  const displayOptions = useMemo(
    () => indexedOptions.filter(({ option }) => option.label !== 'Leave'),
    [indexedOptions]
  );
  const smugglerShopItems = useMemo(() => {
    const ordered = orderSmugglerShopItems(displayOptions.filter(({ option }) => option.item));
    const firstTool = ordered.find(({ option }) => isToolOption(option));
    if (!firstTool) {
      return ordered.slice(0, 6);
    }
    const gears = ordered.filter(({ option }) => !isToolOption(option)).slice(0, 5);
    return [firstTool, ...gears];
  }, [displayOptions]);

  const isThreeChoicePOI = THREE_CHOICE_POIS.includes(poiId);
  const hasValidOptions = options.length > 0 && !options[0]?.disabled;
  const isRuneKiln = poiId === 'L11';
  const isRailWaypoint = poiId === 'L8';
  const isSmugglerHatch = poiId === 'L9';
  const isRustyAnvil = poiId === 'L10';
  const isRestAlcove = poiId === 'L5';
  const isSeismicScanner = poiId === 'L7';
  const isScrapChute = poiId === 'L14';
  const modalImageSources = useMemo(() => {
    const sources: Array<ReturnType<typeof require>> = [paperPanelSource, squareSource];

    for (const { option } of indexedOptions) {
      if (option.item?.image) {
        sources.push(option.item.image);
      }
    }

    for (const { image } of Object.values(STAT_EMOJI_MAP)) {
      if (image) {
        sources.push(image);
      }
    }

    if (kilnSelection?.gearId) {
      const gearImage = getGearImage(kilnSelection.gearId);
      if (gearImage) {
        sources.push(gearImage);
      }
    }

    if (scrapSelection?.image) {
      sources.push(scrapSelection.image);
    }

    return sources;
  }, [indexedOptions, kilnSelection?.gearId, scrapSelection?.image]);

  // --- Controller support ---
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [inventoryFocusIndex, setInventoryFocusIndex] = useState(0);
  const gearCount = selectableGear?.length ?? 0;
  const kilnFull = isRuneKiln && (kilnSelection?.count ?? 0) >= 2;
  const scrapFull = isScrapChute && scrapSelection !== null && scrapSelection !== undefined;
  const needsInventoryCycle =
    (isRuneKiln || isScrapChute) && gearCount > 0 && !kilnFull && !scrapFull;

  // Determine the count of selectable items for the current POI type
  const selectableCount = useMemo(() => {
    if (isThreeChoicePOI && hasValidOptions) return Math.min(options.length, 3);
    if (isSmugglerHatch) {
      const rerollOption = indexedOptions.find(({ option }) => option.label.includes('Reroll'));
      return smugglerShopItems.length + (rerollOption ? 1 : 0);
    }
    if (isSeismicScanner) {
      return displayOptions.filter(({ option }) => !option.disabled).length;
    }
    return displayOptions.length;
  }, [
    isThreeChoicePOI,
    hasValidOptions,
    options.length,
    isSmugglerHatch,
    smugglerShopItems.length,
    isSeismicScanner,
    displayOptions,
    indexedOptions,
  ]);

  useEffect(() => {
    if (!visible) {
      setTooltip(null);
      setAnvilModIndex(null);
      setFocusedIndex(0);
      setInventoryFocusIndex(0);
      setSelectedShopIndex(null);
      setSelectedThreeChoiceIndex(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    preloadCriticalImages(modalImageSources);
  }, [visible, modalImageSources]);

  // Play POI SFX when modal opens
  useEffect(() => {
    if (visible) {
      const sfx = POI_SFX_MAP[poiId];
      if (sfx) playSfx(sfx);
    }
  }, [visible, poiId, playSfx]);

  useEffect(() => {
    setTooltip(null);
    setFocusedIndex(0);
    setInventoryFocusIndex(0);
    setSelectedShopIndex(null);
    setSelectedThreeChoiceIndex(null);
  }, [poiId]);

  // Sync controller focus with shop description panel
  useEffect(() => {
    if (isSmugglerHatch && isController) {
      if (focusedIndex < smugglerShopItems.length) {
        setSelectedShopIndex(focusedIndex);
      } else {
        setSelectedShopIndex(null);
      }
    }
  }, [focusedIndex, isSmugglerHatch, isController, smugglerShopItems]);

  useEffect(() => {
    if (visible && isSmugglerHatch && !isController) {
      const hasAnyShopItem = displayOptions.some(({ option }) => !!option.item);
      setSelectedShopIndex(hasAnyShopItem ? 0 : null);
    }
  }, [visible, isSmugglerHatch, isController, displayOptions]);

  // Controller: D-pad to cycle, A to select, B to close
  useControllerAction(
    {
      onDPadLeft: () => {
        if (needsInventoryCycle) {
          setInventoryFocusIndex((prev) => (prev - 1 + gearCount) % gearCount);
        } else {
          setFocusedIndex((prev) => (prev - 1 + selectableCount) % selectableCount);
        }
      },
      onDPadRight: () => {
        if (needsInventoryCycle) {
          setInventoryFocusIndex((prev) => (prev + 1) % gearCount);
        } else {
          setFocusedIndex((prev) => (prev + 1) % selectableCount);
        }
      },
      onDPadUp: () => {
        if (needsInventoryCycle) {
          // Grid navigation: 3 columns
          setInventoryFocusIndex((prev) => (prev >= 3 ? prev - 3 : prev));
        } else if (isSmugglerHatch) {
          setFocusedIndex((prev) => {
            const cols = 3;
            return prev >= cols ? prev - cols : prev;
          });
        } else {
          setFocusedIndex((prev) => (prev - 1 + selectableCount) % selectableCount);
        }
      },
      onDPadDown: () => {
        if (needsInventoryCycle) {
          setInventoryFocusIndex((prev) => (prev + 3 < gearCount ? prev + 3 : prev));
        } else if (isSmugglerHatch) {
          setFocusedIndex((prev) => {
            const cols = 3;
            const rerollIndex = selectableCount - 1;
            // Any item in the last grid row should navigate down to the reroll button
            if (prev < rerollIndex && prev + cols >= rerollIndex) {
              return rerollIndex;
            }
            return prev + cols < selectableCount ? prev + cols : prev;
          });
        } else {
          setFocusedIndex((prev) => (prev + 1) % selectableCount);
        }
      },
      onA: () => {
        if (needsInventoryCycle) {
          // Select the focused inventory item
          const gear = selectableGear?.[inventoryFocusIndex];
          if (gear) onGearSelect?.(gear);
        } else if (isRuneKiln) {
          // No inventory items — fuse action
          if (kilnFuseOptionIndex !== null && kilnFuseOptionIndex !== undefined) {
            onSelectOption(kilnFuseOptionIndex);
          }
        } else if (isScrapChute) {
          // No inventory items — scrap action
          if (scrapOptionIndex !== null && scrapOptionIndex !== undefined) {
            const selectedOption = options[scrapOptionIndex];
            if (selectedOption && !selectedOption.disabled) onSelectOption(scrapOptionIndex);
          }
        } else if (isThreeChoicePOI && hasValidOptions) {
          const opt = options[focusedIndex];
          if (opt && !opt.disabled) handleOptionSelect(focusedIndex);
        } else if (isSmugglerHatch) {
          const rerollOption = indexedOptions.find(({ option }) => option.label.includes('Reroll'));
          if (focusedIndex < smugglerShopItems.length) {
            const { option, index } = smugglerShopItems[focusedIndex];
            if (!option.disabled) onSelectOption(index);
          } else if (rerollOption && !rerollOption.option.disabled) {
            onSelectOption(rerollOption.index);
          }
        } else if (isSeismicScanner) {
          const active = displayOptions.filter(({ option }) => !option.disabled);
          if (focusedIndex < active.length) {
            onSelectOption(active[focusedIndex].index);
          }
        } else if (isRailWaypoint) {
          onFastTravel?.();
        } else if (isRestAlcove) {
          const restOption = displayOptions[0];
          if (restOption && !restOption.option.disabled) onSelectOption(restOption.index);
        } else if (isRustyAnvil) {
          const upgradeOption = displayOptions[0];
          if (upgradeOption && !upgradeOption.option.disabled) onSelectOption(upgradeOption.index);
        } else {
          // Generic list POIs
          if (focusedIndex < displayOptions.length) {
            const { option, index } = displayOptions[focusedIndex];
            if (!option.disabled) onSelectOption(index);
          }
        }
      },
      onB: () => { playSfx('ui_back'); onClose(); },
    },
    isController && visible
  );

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
      playSfx('ui_click');
      onSelectOption(optionIndex);
    },
    [onSelectOption, playSfx]
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
      playSfx('ui_error');
      return;
    }
    playSfx('ui_click');
    onSelectOption(kilnFuseOptionIndex);
  }, [kilnFuseOptionIndex, onSelectOption, playSfx]);

  const variant = useScreenVariant();
  const isCompact = variant === 'compact';
  const isMobileWide = !isCompact;
  const isNative = Platform.OS !== 'web';
  const nativeModalHeight = isNative ? Dimensions.get('window').height * 0.98 : undefined;

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
    const kilnSquareBg = getTierSquareSource(kilnSelection?.rarity);

    return (
      <OverlayWrapper visible={visible} isCompact={isCompact}>
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
            {!isController && (
              <TouchableOpacity style={styles.closeButtonTop} onPress={onClose} activeOpacity={0.7}>
                <Text style={styles.closeButtonTopText}>X</Text>
              </TouchableOpacity>
            )}

            <Text
              style={[
                styles.threeChoiceTitle,
                !isCompact && styles.threeChoiceTitleMobile,
              ]}
            >
              {poiDef.name}
            </Text>
            {poiDef.description ? (
              <Text
                style={[
                  styles.description,
                  !isCompact && styles.descriptionMobile,
                ]}
              >
                {poiDef.description}
              </Text>
            ) : null}

            <View style={styles.fuseRow}>
              <TouchableOpacity
                style={[
                  styles.fuseSlot,
                  filledSlots < 1 && styles.fuseSlotEmpty,
                ]}
                onPress={() => {
                  playSfx('ui_click');
                  onKilnSlotPress?.(0);
                }}
                activeOpacity={0.7}
                disabled={!canRemoveSlotOne}
              >
                <Image
                  source={filledSlots >= 1 ? kilnSquareBg : squareSource}
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
                style={[
                  styles.fuseSlot,
                  filledSlots < 2 && styles.fuseSlotEmpty,
                ]}
                onPress={() => {
                  playSfx('ui_click');
                  onKilnSlotPress?.(1);
                }}
                activeOpacity={0.7}
                disabled={!canRemoveSlotTwo}
              >
                <Image
                  source={filledSlots >= 2 ? kilnSquareBg : squareSource}
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

            {isController && selectableGear && selectableGear.length > 0 && (
              <View style={styles.inlineInventoryGrid}>
                {selectableGear.map((gear, idx) => {
                  const gearSquareBg = getTierSquareSource(gear.currentRarity);
                  const isFocused = inventoryFocusIndex === idx;
                  return (
                    <FocusGlow key={`inv-${gear.id}-${idx}`} active={isFocused}>
                      <Pressable
                        style={[
                          styles.inlineInventoryCell,
                          isFocused && styles.inlineInventoryCellSelected,
                        ]}
                        onPress={() => onGearSelect?.(gear)}
                      >
                        <Image source={gearSquareBg} style={styles.inlineInventoryCellBg} />
                        {gear.image ? (
                          <Image
                            source={gear.image}
                            style={styles.inlineInventoryImage}
                            resizeMode="contain"
                          />
                        ) : (
                          <Text style={styles.inlineInventoryEmoji}>{gear.emoji}</Text>
                        )}
                      </Pressable>
                    </FocusGlow>
                  );
                })}
              </View>
            )}

            <FocusGlow active={isController && !fuseDisabled && !needsInventoryCycle}>
              <TouchableOpacity
                style={[styles.fuseButton, fuseDisabled && styles.fuseButtonDisabled]}
                onPress={handleKilnFuse}
                activeOpacity={0.7}
                disabled={fuseDisabled}
              >
                <Text style={styles.fuseButtonText}>Fuse</Text>
              </TouchableOpacity>
            </FocusGlow>
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
    const scrapGoldLabel = (() => {
      if (!cost || !item) return cost ? `(-${cost}g)` : '';
      const baseRarity: ItemRarity = item.baseRarity ?? item.currentRarity;
      const refund = SCRAP_REFUND_BY_RARITY[baseRarity] ?? 3;
      const net = -cost + refund;
      return net >= 0 ? `(+${net}g)` : `(${net}g)`;
    })();

    return (
      <OverlayWrapper visible={visible} isCompact={isCompact}>
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
            {!isController && (
              <TouchableOpacity style={styles.closeButtonTop} onPress={onClose} activeOpacity={0.7}>
                <Text style={styles.closeButtonTopText}>X</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.threeChoiceTitle}>{poiDef.name}</Text>
            {poiDef.description ? (
              <Text style={styles.description}>{poiDef.description}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.scrapSlot]}
              onPress={() => {
                playSfx('ui_click');
                onScrapSlotPress?.();
              }}
              activeOpacity={0.7}
              disabled={!hasSelection}
            >
              <Image
                source={hasSelection ? getTierSquareSource(item?.currentRarity) : squareSource}
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
                  : isController
                    ? 'Use D-pad to select gear'
                    : 'Select gear from inventory'}
            </Text>

            {isController && selectableGear && selectableGear.length > 0 && (
              <View style={styles.inlineInventoryGrid}>
                {selectableGear.map((gear, idx) => {
                  const gearSquareBg = getTierSquareSource(gear.currentRarity);
                  const isFocused = inventoryFocusIndex === idx;
                  return (
                    <FocusGlow key={`inv-${gear.id}-${idx}`} active={isFocused}>
                      <Pressable
                        style={[
                          styles.inlineInventoryCell,
                          isFocused && styles.inlineInventoryCellSelected,
                        ]}
                        onPress={() => onGearSelect?.(gear)}
                      >
                        <Image source={gearSquareBg} style={styles.inlineInventoryCellBg} />
                        {gear.image ? (
                          <Image
                            source={gear.image}
                            style={styles.inlineInventoryImage}
                            resizeMode="contain"
                          />
                        ) : (
                          <Text style={styles.inlineInventoryEmoji}>{gear.emoji}</Text>
                        )}
                      </Pressable>
                    </FocusGlow>
                  );
                })}
              </View>
            )}

            <FocusGlow active={isController && hasSelection && !!canAfford && !needsInventoryCycle}>
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
                <Text style={styles.scrapButtonText}>{`Scrap ${scrapGoldLabel}`}</Text>
              </TouchableOpacity>
            </FocusGlow>
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
      <ModalWrapper
        visible={visible}
        isCompact={isCompact}
        onClose={onClose}
        alignLeft={true}
        centerInCompact={centerInCompact}
      >
        <View
          style={[
            styles.threeChoiceModal,
            isNative && nativeModalHeight !== undefined ? { height: nativeModalHeight * 0.9 } : null,
          ]}
          pointerEvents="auto"
        >
          <Image
            source={paperPanelSource}
            style={isNative ? {
              position: 'absolute',
              width: '100%',
              height: '100%',
              top: 0,
              left: 0,
              zIndex: -1,
            } : {
              position: 'absolute',
              width: '110%',
              height: '115%',
              top: '-7.5%',
              left: '-5%',
              zIndex: -1,
            }}
            resizeMode="stretch"
          />

          <View style={!isCompact ? styles.threeChoiceContentMobile : { padding: 24, paddingTop: 32 }}>
            {!isController && (
              <TouchableOpacity style={styles.closeButtonTop} onPress={onClose} activeOpacity={0.7}>
                <Text style={styles.closeButtonTopText}>X</Text>
              </TouchableOpacity>
            )}

            <Text style={[styles.threeChoiceTitle, !isCompact && styles.threeChoiceTitleMobile]}>
              {poiDef.name}
            </Text>
            {poiDef.description ? (
              <Text style={[styles.description, !isCompact && styles.descriptionMobile]}>
                {poiDef.description}
              </Text>
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
                  <FocusGlow
                    key={index}
                    active={isController && focusedIndex === index}
                    style={{ flex: 1 }}
                  >
                    <SimplifiedItemOption
                      emoji={emoji}
                      image={image}
                      statDisplay={statDisplay}
                      effectDescription={effectDescription}
                      rarity={rarity}
                      itemName={itemName}
                      selected={
                        (isController && focusedIndex === index) ||
                        selectedThreeChoiceIndex === index
                      }
                      disabled={option.disabled}
                      onSelect={() => {
                        if (!isController) {
                          if (selectedThreeChoiceIndex === index) {
                            setSelectedThreeChoiceIndex(null);
                            handleOptionSelect(index);
                          } else {
                            setSelectedThreeChoiceIndex(index);
                          }
                        } else {
                          handleOptionSelect(index);
                        }
                      }}
                      onLongPress={(event) => handleOptionLongPress(option, event)}
                    />
                  </FocusGlow>
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
      <ModalWrapper visible={visible} isCompact={isCompact} onClose={onClose}>
        <View style={[styles.standardModal, isCompact && { minWidth: 280 }]} pointerEvents="auto">
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
          <View style={{ padding: isCompact ? 24 : 16, paddingTop: isCompact ? 32 : 24 }}>
            {!isController && (
              <TouchableOpacity style={styles.closeButtonTop} onPress={onClose} activeOpacity={0.7}>
                <Text style={styles.closeButtonTopText}>X</Text>
              </TouchableOpacity>
            )}

            <Text style={[styles.threeChoiceTitle, isCompact && { fontSize: 26 }]}>
              {poiDef.name}
            </Text>

            {hasOtherWaypoints ? (
              <FocusGlow active={isController}>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => onFastTravel?.()}
                  activeOpacity={0.7}
                >
                  <Text style={styles.primaryButtonText}>Fast travel?</Text>
                </TouchableOpacity>
              </FocusGlow>
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

    const shopItems = smugglerShopItems;
    const rerollOption = indexedOptions.find(({ option }) => option.label.includes('Reroll'));
    const rerollDisabled = !rerollOption || rerollOption.option.disabled;
    const gridItems = shopItems.slice(0, 6);
    const selectedItem =
      selectedShopIndex !== null ? gridItems[selectedShopIndex]?.option.item : null;
    const selectedStats = selectedItem ? formatStatBonuses(extractStatBonuses(selectedItem)) : null;
    const selectedEffect = getItemEffectDescription(selectedItem ?? undefined);
    const selectedRarity = selectedItem ? getItemRarity(selectedItem) : null;
    const selectedRarityColor = selectedItem ? getRarityColor(selectedItem) : '#A0A0A0';

    return (
      <ModalWrapper visible={visible} isCompact={isCompact} onClose={onClose}>
        <View style={[styles.standardModal, isNative && { marginLeft: 60 }]} pointerEvents="auto">
          {selectedItem && (
            <View
              style={[styles.shopDescPanel, isMobileWide && styles.shopDescPanelMobile, isNative && { right: '87%' }]}
              pointerEvents="auto"
            >
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
              <View style={styles.shopDescContent}>
                <Text style={[styles.shopDescName, { color: selectedRarityColor }]}>
                  {selectedItem.name}
                </Text>
                {selectedRarity && <Text style={styles.shopDescRarity}>{selectedRarity}</Text>}
                {selectedStats ? <Text style={styles.shopDescStats}>{selectedStats}</Text> : null}
                {selectedEffect ? (
                  <Text style={styles.shopDescEffect}>{selectedEffect}</Text>
                ) : null}
              </View>
            </View>
          )}
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
            {!isController && (
              <TouchableOpacity style={styles.closeButtonTop} onPress={onClose} activeOpacity={0.7}>
                <Text style={styles.closeButtonTopText}>X</Text>
              </TouchableOpacity>
            )}

            <Text style={[styles.threeChoiceTitle, isMobileWide && styles.shopTitleMobile]}>
              {poiDef.name}
            </Text>
            {poiDef.description ? (
              <Text style={[styles.description, isMobileWide && styles.shopDescriptionMobile]}>
                {poiDef.description}
              </Text>
            ) : null}

            <View style={styles.gridWrapper}>
              <View style={[styles.shopGrid, isMobileWide && styles.shopGridMobile]}>
                {gridItems.map(({ option, index: optionIndex }, gridIdx) => {
                  const disabled = option.disabled;
                  const isSelected = selectedShopIndex === gridIdx;
                  return (
                    <FocusGlow
                      key={`shop-${optionIndex}`}
                      active={isController && focusedIndex === gridIdx}
                    >
                      <TouchableOpacity
                        style={[
                          styles.shopCell,
                          isMobileWide && styles.shopCellMobile,
                          disabled && styles.shopCellDisabled,
                          isSelected && styles.shopCellSelected,
                        ]}
                        onPress={() => {
                          if (selectedShopIndex !== gridIdx) {
                            setSelectedShopIndex(gridIdx);
                            return;
                          }
                          if (disabled) {
                            playSfx('ui_error');
                            return;
                          }
                          onSelectOption(optionIndex);
                        }}
                        activeOpacity={0.7}
                        disabled={false}
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
                            style={[styles.shopImage, isMobileWide && styles.shopImageMobile]}
                            resizeMode="contain"
                          />
                        ) : (
                          <Text style={styles.shopEmoji}>{option.item?.emoji}</Text>
                        )}
                        {option.cost !== undefined && (
                          <Text style={styles.shopCost}>{option.cost}g</Text>
                        )}
                      </TouchableOpacity>
                    </FocusGlow>
                  );
                })}
              </View>
            </View>

            <FocusGlow active={isController && focusedIndex === gridItems.length}>
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
            </FocusGlow>
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
    const upgradeOption = displayOptions.length > 0 ? displayOptions[0].option : null;
    const canAfford = upgradeOption && !upgradeOption.disabled;
    const isMaxTier = upgradeOption?.label === 'Max Upgrade Reached';

    // Compute next rarity and stat delta
    const nextRarity: ItemRarity | null = tool
      ? tool.rarity === 'COMMON'
        ? 'GILDED'
        : tool.rarity === 'GILDED'
          ? 'DIAMOND'
          : null
      : null;
    const currentTier = tool ? getTierFromRarity(tool.rarity) : 1;
    const nextTier = nextRarity ? getTierFromRarity(nextRarity) : null;
    const currentStats = tool ? getToolStatsAtTier(tool.id as ToolId, currentTier) : {};
    const nextStats = tool && nextTier ? getToolStatsAtTier(tool.id as ToolId, nextTier) : null;
    const statDelta: Record<string, number> = {};
    if (nextStats) {
      for (const key of Object.keys(nextStats) as (keyof typeof nextStats)[]) {
        const diff = (nextStats[key] ?? 0) - ((currentStats as any)[key] ?? 0);
        if (diff !== 0) statDelta[key] = diff;
      }
    }
    const deltaText = formatStatBonuses(statDelta);
    const nextSquareBg = getTierSquareSource(nextRarity);

    return (
      <ModalWrapper visible={visible} isCompact={isCompact} onClose={onClose}>
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
            {!isController && (
              <TouchableOpacity style={styles.closeButtonTop} onPress={onClose} activeOpacity={0.7}>
                <Text style={styles.closeButtonTopText}>X</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.threeChoiceTitle}>{poiDef.name}</Text>
            {poiDef.description ? (
              <Text style={styles.description}>{poiDef.description}</Text>
            ) : null}

            {tool && !isMaxTier && nextRarity ? (
              <>
                <View style={styles.anvilUpgradeRow}>
                  <View style={styles.anvilSlot}>
                    <Image source={squareSource} style={styles.anvilSlotBg} />
                    {tool.image ? (
                      <Image
                        source={tool.image}
                        style={styles.anvilSlotImage}
                        resizeMode="contain"
                      />
                    ) : (
                      <Text style={styles.anvilSlotEmoji}>{tool.emoji}</Text>
                    )}
                  </View>

                  <Text style={styles.anvilArrow}>{'\u2192'}</Text>

                  <View style={styles.anvilUpgradedColumn}>
                    <View style={[styles.anvilSlot]}>
                      <Image source={nextSquareBg} style={styles.anvilSlotBg} />
                      {tool.image ? (
                        <Image
                          source={tool.image}
                          style={styles.anvilSlotImage}
                          resizeMode="contain"
                        />
                      ) : (
                        <Text style={styles.anvilSlotEmoji}>{tool.emoji}</Text>
                      )}
                    </View>
                    {deltaText ? <Text style={styles.anvilNextStats}>{deltaText}</Text> : null}
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.anvilSlotCentered}>
                <View style={styles.anvilSlot}>
                  <Image source={squareSource} style={styles.anvilSlotBg} />
                  {tool && tool.image ? (
                    <Image source={tool.image} style={styles.anvilSlotImage} resizeMode="contain" />
                  ) : tool ? (
                    <Text style={styles.anvilSlotEmoji}>{tool.emoji}</Text>
                  ) : (
                    <Text style={styles.helperText}>No tool</Text>
                  )}
                </View>
              </View>
            )}

            <FocusGlow active={isController}>
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  { marginTop: 24 },
                  (!upgradeOption || !canAfford) && styles.primaryButtonDisabled,
                ]}
                onPress={() => {
                  if (upgradeOption) {
                    playSfx('ui_click');
                    onSelectOption(displayOptions[0].index);
                  } else {
                    playSfx('ui_error');
                  }
                }}
                disabled={!upgradeOption || !canAfford}
              >
                <Text style={styles.primaryButtonText}>
                  {upgradeOption?.cost
                    ? `Upgrade (-${upgradeOption.cost}g)`
                    : upgradeOption?.label || 'Upgrade'}
                </Text>
              </TouchableOpacity>
            </FocusGlow>
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
      <ModalWrapper visible={visible} isCompact={isCompact} onClose={onClose}>
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
            {!isController && (
              <TouchableOpacity style={styles.closeButtonTop} onPress={onClose} activeOpacity={0.7}>
                <Text style={styles.closeButtonTopText}>X</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.threeChoiceTitle}>{poiDef.name}</Text>
            {poiDef.description ? (
              <Text style={styles.description}>{poiDef.description}</Text>
            ) : null}

            {restOption && (
              <FocusGlow active={isController}>
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    restOption.option.disabled && styles.primaryButtonDisabled,
                  ]}
                  onPress={() => {
                    playSfx('ui_click');
                    onSelectOption(restOption.index);
                  }}
                  activeOpacity={0.7}
                  disabled={restOption.option.disabled}
                >
                  <Text style={styles.primaryButtonText}>{restOption.option.label}</Text>
                </TouchableOpacity>
              </FocusGlow>
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
      <ModalWrapper visible={visible} isCompact={isCompact} onClose={onClose}>
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
            {!isController && (
              <TouchableOpacity style={styles.closeButtonTop} onPress={onClose} activeOpacity={0.7}>
                <Text style={styles.closeButtonTopText}>X</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.threeChoiceTitle}>{poiDef.name}</Text>
            {poiDef.description ? (
              <Text style={styles.description}>{poiDef.description}</Text>
            ) : null}

            {activeScannerOptions.length > 0 ? (
              <View style={styles.gridWrapper}>
                <View style={styles.scannerGrid}>
                  {activeScannerOptions.map(({ option, index }, scanIdx) => {
                    const emoji = option.label.split(' ')[0];
                    // Find the POI definition corresponding to this option
                    const scanPoiDef = Object.values(POI_DEFINITIONS).find((def) =>
                      option.label.includes(def.name)
                    );
                    return (
                      <FocusGlow
                        key={`scan-${index}`}
                        active={isController && focusedIndex === scanIdx}
                      >
                        <TouchableOpacity
                          style={styles.scannerCell}
                          onPress={() => {
                            playSfx('ui_click');
                            onSelectOption(index);
                          }}
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
                          {scanPoiDef?.image ? (
                            <Image
                              source={scanPoiDef.image}
                              style={styles.scannerImage}
                              resizeMode="contain"
                            />
                          ) : (
                            <Text style={styles.scannerEmoji}>{emoji}</Text>
                          )}
                        </TouchableOpacity>
                      </FocusGlow>
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
    <ModalWrapper visible={visible} isCompact={isCompact} onClose={onClose}>
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
          {!isController && (
            <TouchableOpacity style={styles.closeButtonTop} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.closeButtonTopText}>X</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.threeChoiceTitle}>{poiDef.name}</Text>
          {poiDef.description ? <Text style={styles.description}>{poiDef.description}</Text> : null}

          <View style={styles.optionsContent}>
            {displayOptions.map(({ option, index }, listIdx) => (
              <FocusGlow key={index} active={isController && focusedIndex === listIdx}>
                <ListOptionButton option={option} index={index} onPress={onSelectOption} />
              </FocusGlow>
            ))}
          </View>
        </View>
      </View>
    </ModalWrapper>
  );
});

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
    alignItems: 'stretch',
    paddingLeft: 48,
    paddingRight: 48,
  },
  compactModalScale: {
    transform: [{ scale: 1.4 }],
  },
  compactModalScaleLeft: {
    transformOrigin: 'left center',
    width: '100%',
    maxWidth: 580,
  },
  compactModalScaleCenter: {
    width: '80%',
    maxWidth: 580,
  },
  nativeModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  nativeModalDarkBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 230,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    zIndex: 0,
  },
  nativeModalContentLayer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    zIndex: 1,
  },
  nativeModalRow: {
    flex: 1,
    flexDirection: 'row',
  },
  nativeModalCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nativeModalContent: {
    width: '98%',
    flex: undefined,
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
    maxWidth: 400,
    width: '90%',
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
  threeChoiceTitleMobile: {
    fontSize: 19,
    marginBottom: 6,
  },
  description: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#5c4033',
    marginBottom: 16,
    lineHeight: 16,
    textAlign: 'center',
  },
  descriptionMobile: {
    fontSize: 11,
    lineHeight: 14,
    marginBottom: 8,
  },
  threeChoiceContentMobile: {
    padding: 18,
    paddingTop: 24,
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
    gap: 12,
    marginBottom: 12,
    width: 300, // Increased to fit larger cells
    alignSelf: 'center',
  },
  shopGridMobile: {
    gap: 8,
    width: 270,
    marginBottom: 8,
  },
  shopCell: {
    width: 90, // Increased size
    height: 90, // Increased size
    justifyContent: 'center',
    alignItems: 'center',
  },
  shopCellMobile: {
    width: 82,
    height: 82,
  },
  shopCellEmpty: {
    // backgroundColor: '#1a1a20', // Removed
    // borderColor: '#2a2a30', // Removed
  },
  shopCellDisabled: {
    opacity: 0.5,
  },
  shopCellSelected: {
    transform: [{ scale: 1.08 }],
  },
  shopDescPanel: {
    position: 'absolute',
    width: 150,
    right: '105%',
    top: '50%',
    transform: [{ translateY: '-50%' }],
    borderRadius: 4,
    overflow: 'visible',
    zIndex: 10,
  },
  shopDescPanelMobile: {
    width: 132,
    right: '90%',
    marginRight: 2,
  },
  shopDescContent: {
    padding: 12,
    alignItems: 'center',
  },
  shopDescName: {
    fontFamily: Typography.header,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  shopDescRarity: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#6b5a4e',
    textAlign: 'center',
    marginBottom: 6,
  },
  shopDescStats: {
    fontFamily: Typography.number,
    fontSize: 12,
    color: '#3d2b1f',
    textAlign: 'center',
    marginBottom: 6,
  },
  shopDescEffect: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#5a4a3e',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  shopEmoji: {
    fontSize: 28, // Increased size
  },
  shopImage: {
    width: 48, // Increased size
    height: 48, // Increased size
  },
  shopImageMobile: {
    width: 40,
    height: 40,
  },
  shopCost: {
    fontFamily: Typography.number,
    fontSize: 14, // Increased size
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
  shopTitleMobile: {
    fontSize: 20,
    marginBottom: 8,
  },
  shopDescriptionMobile: {
    fontSize: 11,
    lineHeight: 14,
    marginBottom: 8,
  },

  // ============================================================================
  // Seismic Scanner Grid
  // ============================================================================
  scannerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    width: 360,
    alignSelf: 'center',
  },
  scannerCell: {
    width: 100, // Increased size further
    height: 100, // Increased size further
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  scannerEmoji: {
    fontSize: 40, // Increased size further
  },
  scannerImage: {
    width: 76, // Increased size further
    height: 76, // Increased size further
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
  anvilUpgradeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 4,
  },
  anvilSlot: {
    width: 72,
    height: 72,
    justifyContent: 'center',
    alignItems: 'center',
  },
  anvilSlotCentered: {
    alignItems: 'center',
    marginBottom: 4,
  },
  anvilSlotBg: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    resizeMode: 'stretch',
  },
  anvilSlotImage: {
    width: 48,
    height: 48,
  },
  anvilSlotEmoji: {
    fontSize: 28,
  },
  anvilArrow: {
    fontFamily: Typography.number,
    fontSize: 22,
    color: '#3d2b1f',
    marginTop: 22,
  },
  anvilUpgradedColumn: {
    alignItems: 'center',
    gap: 4,
  },
  anvilNextStats: {
    fontFamily: Typography.number,
    fontSize: 11,
    color: '#3d6b3d',
    textAlign: 'center',
  },

  // ============================================================================
  // Inline inventory grid (controller mode for Rune Kiln / Scrap Chute)
  // ============================================================================
  inlineInventoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginVertical: 12,
  },
  inlineInventoryCell: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlineInventoryCellSelected: {
    transform: [{ scale: 1.08 }],
  },
  inlineInventoryCellBg: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    resizeMode: 'stretch',
  },
  inlineInventoryImage: {
    width: 32,
    height: 32,
  },
  inlineInventoryEmoji: {
    fontSize: 20,
  },
});

export default POIModal;
