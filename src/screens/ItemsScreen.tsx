import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ImageBackground,
  ActivityIndicator,
  ScrollView,
  Alert,
  Animated,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useProfile } from '../contexts/ProfileContext';
import { RootStackParamList } from '../navigation';
import { Typography } from '../theme/typography';
import { useScreenVariant } from '../contexts/ScreenVariantContext';
import { useControllerAction } from '../hooks/useControllerAction';
import { ControllerHints, type ButtonHint } from '../components/ui/ControllerHints';
import { useInputMode } from '../hooks/useInputMode';
import { FocusGlow } from '../components/ui/FocusGlow';
import {
  getGearByTag,
  GearDefinition,
} from '../data/gear';
import {
  getToolsByTag,
  ToolDefinition,
} from '../game/entities/items';
import { ItemTag, ItemStats, ItemRarity } from '../game/engine/types';
import {
  BITMASK_SIZE,
  MIN_ACTIVE_POOL,
  isItemUnlocked as isPoolBitSet,
  setItemUnlocked as setPoolBit,
  getItemPoolIndex,
} from '../services/solana/types/item_pool';

const backgroundImage = require('../../assets/ui/backgrounds/loading-background.png');
const bookImageMobile = require('../../assets/ui/backgrounds/book-wide.png');
const bookImageCompact = require('../../assets/ui/backgrounds/book-compact.png');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.png');
const buttonV3Source = require('../../assets/ui/buttons/button-v3.png');
const buttonV4Source = require('../../assets/ui/buttons/button-v4.png');
const buttonGreenSource = require('../../assets/ui/buttons/button-green.png');
const buttonGraySource = require('../../assets/ui/buttons/button-gray.png');
const lockIconSource = require('../../assets/icons/ui/lock.png');
const rectangleFrameSource = require('../../assets/ui/frames/rectangle.png');
const statIconATK = require('../../assets/icons/stats/ATK.png');
const statIconARM = require('../../assets/icons/stats/ARM.png');
const statIconSPD = require('../../assets/icons/stats/speed.png');
const statIconDIG = require('../../assets/icons/stats/DIG.png');
const statIconHP = require('../../assets/icons/stats/HP.png');
const squareFrameSource = require('../../assets/ui/frames/square.png');

// Item descriptions mapping
const ITEM_DESCRIPTIONS: Record<string, string> = {
  'Basic Pickaxe': 'A sturdy pickaxe for digging through tough terrain. Essential for any miner.',
  'Miner Helmet': 'Protective headgear that provides basic defense against falling debris.',
  'Mining Gloves': 'Reinforced gloves that improve grip and digging efficiency.',
  Headlamp: 'Bright light source that helps you move faster through dark tunnels.',
  'Reinforced Boots': 'Sturdy boots with reinforced soles for better protection and digging.',
  'Canary Cage': 'A caged canary that warns of danger, increasing your maximum health.',
  'Mining Cart': 'A wheeled cart that allows you to move quickly through the mines.',
  'Dynamite Bundle': 'Explosive power for both combat and excavation.',
  'Iron Sword': 'A basic but reliable weapon for combat.',
  'Wooden Shield': 'Simple wooden protection against enemy attacks.',
  Chainmail: 'Interlocking metal rings providing solid armor.',
  'Battle Axe': 'A heavy axe that deals significant damage.',
  'War Hammer': 'A balanced weapon offering both offense and defense.',
  'Knight Helm': 'Heavy helmet providing excellent protection.',
  'Battle Standard': 'Inspiring banner that boosts attack and vitality.',
  'Champion Blade': 'A masterwork weapon for skilled warriors.',
  'Leather Boots': 'Light footwear that increases movement speed.',
  'Short Bow': 'A compact ranged weapon for quick attacks.',
  Dagger: 'A swift blade for fast strikes.',
  Cloak: 'A concealing garment that provides speed and protection.',
  'Grappling Hook': 'Tool for quick traversal and movement.',
  Spyglass: 'Enhances perception, improving both speed and digging.',
  'Swift Quiver': 'Holds arrows for rapid fire combat.',
  'Shadow Step': 'Mastery of stealth and speed.',
  'Heavy Shield': 'Massive protection that significantly reduces damage.',
  'Plate Armor': 'Full body protection with added vitality.',
  'Tower Shield': 'An enormous shield for maximum defense.',
  'Iron Bracers': 'Arm guards providing solid protection.',
  'Fortified Helm': 'Reinforced headgear with life-preserving properties.',
  'Barrier Charm': 'Magical protection that enhances life force.',
  Aegis: 'Legendary shield offering supreme defense.',
  'Fortress Gauntlets': 'Heavy gauntlets that combine offense and defense.',
  'Rage Ring': 'A ring that channels anger into attack power.',
  'Blood Axe': 'A brutal weapon fueled by fury.',
  'Fury Helm': 'Channels rage into power while protecting the wearer.',
  'Berserk Talisman': 'Amplifies combat prowess through raw emotion.',
  'Wrath Gauntlets': 'Gauntlets that enhance destructive power.',
  'Chaos Blade': 'An unpredictable weapon of great speed and power.',
  'Rampage Armor': 'Armor that grows stronger as the battle rages.',
  Destroyer: 'The ultimate weapon of annihilation.',
  'Frost Shard': 'A fragment of eternal ice that chills enemies.',
  'Ice Armor': 'Frozen protection that freezes attackers.',
  'Frozen Heart': 'A heart of ice that preserves life.',
  'Blizzard Cloak': 'A garment woven from winter winds.',
  'Glacial Blade': 'A sword forged from ancient ice.',
  'Icicle Crown': 'A crown of eternal winter.',
  'Permafrost Shield': 'A shield that never thaws.',
  "Winter's End": 'The ultimate frost weapon.',
  'Ember Stone': 'A stone burning with eternal flame.',
  'Flame Guard': 'Protection wreathed in fire.',
  'Inferno Ring': 'A ring of burning power.',
  'Phoenix Feather': 'A feather of rebirth and speed.',
  'Blazing Sword': 'A blade of pure fire.',
  'Molten Armor': 'Armor forged in volcanic heat.',
  'Dragonfire Amulet': 'An amulet of legendary flame.',
  'Sunforged Blade': 'A weapon born of solar fire.',
  'Venom Fang': 'A tooth dripping with poison.',
  'Toxic Cloak': 'A garment of deadly fumes.',
  'Plague Mask': 'A mask that spreads disease.',
  'Serpent Ring': 'A ring of serpentine power.',
  'Acid Blade': 'A blade that corrodes armor.',
  'Corrosive Shield': 'A shield that melts attacks.',
  'Basilisk Eye': 'An eye that petrifies foes.',
  "Death's Embrace": 'The ultimate poison weapon.',
  'Shadow Dagger': 'A blade of pure darkness.',
  'Darkness Cloak': 'A garment of absolute shadow.',
  'Phantom Mask': 'A mask of ghostly protection.',
  'Void Ring': 'A ring of emptiness and power.',
  'Nightmare Blade': 'A sword of dark dreams.',
  'Eclipse Armor': 'Armor of the darkened sun.',
  'Abyssal Crown': 'A crown of infinite darkness.',
  'Soul Reaper': 'The ultimate shadow weapon.',
  'Holy Symbol': 'A symbol of divine protection.',
  'Angel Wings': 'Wings of celestial speed.',
  'Blessed Armor': 'Armor sanctified by light.',
  'Sacred Ring': 'A ring of holy power.',
  'Seraph Blade': 'A blade of angelic fire.',
  'Radiant Shield': 'A shield of pure light.',
  'Halo of Light': 'A crown of divine radiance.',
  Godslayer: 'The ultimate divine weapon.',
};

const TAG_DISPLAY_NAMES: Record<ItemTag, string> = {
  STONE: 'STONE',
  SCOUT: 'SCOUT',
  GREED: 'GREED',
  BLAST: 'BLAST',
  FROST: 'FROST',
  RUST: 'RUST',
  BLOOD: 'BLOOD',
  TEMPO: 'TEMPO',
};

const TAG_COLORS: Record<ItemTag, string> = {
  STONE: '#8B7355',
  SCOUT: '#4682B4',
  GREED: '#DAA520',
  FROST: '#5F9EA0',
  BLAST: '#f97316',
  RUST: '#a16207',
  BLOOD: '#dc2626',
  TEMPO: '#9333ea',
};

const ALL_TAGS: ItemTag[] = [
  'STONE',
  'SCOUT',
  'GREED',
  'BLAST',
  'FROST',
  'RUST',
  'BLOOD',
  'TEMPO',
];

const ITEM_POOL_MIN_SIZE = MIN_ACTIVE_POOL;

type DisplayItem = {
  id: string;
  name: string;
  image: any;
  rarity: ItemRarity;
  stats: ItemStats;
  effect?: { description: string };
  isTool: boolean;
  tag: ItemTag;
};

const RARITY_COLORS: Record<ItemRarity, string> = {
  COMMON: '#9CA3AF',
  GILDED: '#22C55E',
  DIAMOND: '#3B82F6',
  RARE: '#A855F7',
  HEROIC: '#F97316',
  MYTHIC: '#FFD700',
};

type ItemsScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Items'>;
};

const convertToDisplayItem = (
  def: ToolDefinition | GearDefinition,
  isTool: boolean,
  tag: ItemTag
): DisplayItem => ({
  id: def.id,
  name: def.name,
  image: def.image,
  rarity: isTool ? (def as ToolDefinition).rarity : (def as GearDefinition).baseRarity,
  stats: def.stats,
  effect: def.effect,
  isTool,
  tag,
});

const getItemsByTag = (tag: ItemTag): DisplayItem[] => {
  const tools = getToolsByTag(tag).map((t) => convertToDisplayItem(t, true, tag));
  const gear = getGearByTag(tag).map((g) => convertToDisplayItem(g, false, tag));
  return [...tools, ...gear];
};

const getAllItems = (): DisplayItem[] => {
  const allItems: DisplayItem[] = [];
  ALL_TAGS.forEach((tag) => {
    allItems.push(...getItemsByTag(tag));
  });
  return allItems;
};

export function ItemsScreen({ navigation }: ItemsScreenProps) {
  const { isItemUnlocked, updateActiveItemPool, profile } = useProfile();
  const screenVariant = useScreenVariant();
  const isCompact = screenVariant === 'compact';
  const [selectedItem, setSelectedItem] = useState<DisplayItem | null>(null);
  const [draftPoolIndices, setDraftPoolIndices] = useState<Set<number>>(new Set());
  const [isSavingItemPool, setIsSavingItemPool] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const activePoolBitmask = useMemo(
    () => profile?.activeItemPool ?? new Uint8Array(BITMASK_SIZE),
    [profile?.activeItemPool]
  );

  const loadDraftPoolFromProfile = useCallback(() => {
    const next = new Set<number>();
    for (let i = 0; i < 80; i++) {
      if (isPoolBitSet(activePoolBitmask, i)) {
        next.add(i);
      }
    }
    setDraftPoolIndices(next);
  }, [activePoolBitmask]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  // Load pool and select first unlocked item on mount
  useEffect(() => {
    loadDraftPoolFromProfile();
    const allItems = getAllItems();
    const firstUnlocked = allItems.find((item) => isItemUnlocked(item.id));
    setSelectedItem(firstUnlocked || allItems[0] || null);
  }, []);

  const checkItemUnlocked = useCallback(
    (id: string): boolean => isItemUnlocked(id),
    [isItemUnlocked]
  );

  const togglePoolItem = useCallback(
    (item: DisplayItem) => {
      if (!checkItemUnlocked(item.id)) return;

      const poolIndex = getItemPoolIndex(item.id);
      if (poolIndex < 0) return;

      setDraftPoolIndices((prev) => {
        const next = new Set(prev);
        if (next.has(poolIndex)) {
          if (next.size <= ITEM_POOL_MIN_SIZE) {
            Alert.alert(
              'Minimum Pool Size',
              `Your item pool must keep at least ${ITEM_POOL_MIN_SIZE} items.`
            );
            return prev;
          }
          next.delete(poolIndex);
          return next;
        }
        next.add(poolIndex);
        return next;
      });
    },
    [checkItemUnlocked]
  );

  const hasPoolChanges = useMemo(() => {
    for (let i = 0; i < 80; i++) {
      const onChain = isPoolBitSet(activePoolBitmask, i);
      const draft = draftPoolIndices.has(i);
      if (onChain !== draft) return true;
    }
    return false;
  }, [activePoolBitmask, draftPoolIndices]);

  const handleSaveItemPool = useCallback(async () => {
    if (draftPoolIndices.size < ITEM_POOL_MIN_SIZE) {
      Alert.alert(
        'Invalid Pool Size',
        `Select at least ${ITEM_POOL_MIN_SIZE} items before saving.`
      );
      return;
    }

    const nextBitmask = new Uint8Array(BITMASK_SIZE);
    for (const index of draftPoolIndices) {
      setPoolBit(nextBitmask, index);
    }

    setIsSavingItemPool(true);
    try {
      const result = await updateActiveItemPool(nextBitmask);
      if (!result.success) {
        Alert.alert('Failed to Save', result.error ?? 'Could not update active item pool.');
        return;
      }
      Alert.alert('Saved', 'Your item pool has been updated.');
    } finally {
      setIsSavingItemPool(false);
    }
  }, [draftPoolIndices, updateActiveItemPool]);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const selectedItemPoolIndex = selectedItem ? getItemPoolIndex(selectedItem.id) : -1;
  const selectedItemInPool =
    selectedItemPoolIndex >= 0 && draftPoolIndices.has(selectedItemPoolIndex);
  const canRemoveSelectedItem = !selectedItemInPool || draftPoolIndices.size > ITEM_POOL_MIN_SIZE;

  // --- Controller navigation ---
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const allItems = useMemo(() => getAllItems(), []);
  const itemsPerRow = isCompact ? 5 : 5;

  const [cursorIdx, setCursorIdx] = useState(0);

  // Sync cursor → selected item + auto-scroll into view
  useEffect(() => {
    if (isController && allItems[cursorIdx]) {
      setSelectedItem(allItems[cursorIdx]);
      // Scroll the focused item into view on web
      requestAnimationFrame(() => {
        const el = (cursorRef.current as unknown) as HTMLElement;
        if (el?.scrollIntoView) {
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      });
    }
  }, [cursorIdx, isController]);

  const scrollViewRef = useRef<ScrollView>(null);
  const cursorRef = useRef<View>(null);

  useControllerAction(
    {
      onB: handleBack,
      onA: () => {
        const item = allItems[cursorIdx];
        if (item && checkItemUnlocked(item.id)) togglePoolItem(item);
      },
      onX: hasPoolChanges ? handleSaveItemPool : undefined,
      onDPadLeft: () => setCursorIdx((p) => Math.max(0, p - 1)),
      onDPadRight: () => setCursorIdx((p) => Math.min(allItems.length - 1, p + 1)),
      onDPadUp: () => setCursorIdx((p) => Math.max(0, p - itemsPerRow)),
      onDPadDown: () => setCursorIdx((p) => Math.min(allItems.length - 1, p + itemsPerRow)),
    },
    isController
  );

  const controllerHints: ButtonHint[] = [
    { button: 'DPad', label: 'Navigate' },
    { button: 'A', label: selectedItemInPool ? 'Remove' : 'Add to Pool' },
    ...(hasPoolChanges ? [{ button: 'X' as const, label: 'Save' }] : []),
    { button: 'B', label: 'Back' },
  ];

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Image source={backgroundImage} style={styles.backgroundImage} resizeMode="stretch" />
      <Image source={isCompact ? bookImageCompact : bookImageMobile} style={styles.backgroundImage} resizeMode="stretch" />

      <View style={[styles.content, isCompact && compactStyles.content]}>
        {/* Header */}
        <View style={[styles.header, isCompact && compactStyles.header]}>
          {!isController && (
            <TouchableOpacity onPress={handleBack} activeOpacity={0.7}>
              <ImageBackground
                source={buttonV1Source}
                style={[styles.backButton, isCompact && compactStyles.backButton]}
                resizeMode="stretch"
              >
                <Text style={[styles.backButtonText, isCompact && compactStyles.backButtonText]}>
                  Back
                </Text>
              </ImageBackground>
            </TouchableOpacity>
          )}

          <View style={styles.titleGroup}>
            <ImageBackground
              source={buttonV4Source}
              style={[styles.titlePanel, isCompact && compactStyles.titlePanel]}
              resizeMode="stretch"
            >
              <Text style={[styles.title, isCompact && compactStyles.title]}>Items</Text>
            </ImageBackground>
            <Text numberOfLines={1} style={[styles.poolCountText, isCompact && compactStyles.poolCountText, styles.poolCountAbsolute]}>
              Pool: {draftPoolIndices.size} (min {ITEM_POOL_MIN_SIZE})
            </Text>
          </View>

          {/* Save button in header right */}
          <TouchableOpacity
            disabled={
              isSavingItemPool || !hasPoolChanges || draftPoolIndices.size < ITEM_POOL_MIN_SIZE
            }
            onPress={handleSaveItemPool}
            activeOpacity={0.7}
          >
            <ImageBackground
              source={buttonV3Source}
              style={[
                styles.saveButton,
                isCompact && compactStyles.saveButton,
                (isSavingItemPool || !hasPoolChanges || draftPoolIndices.size < ITEM_POOL_MIN_SIZE) &&
                  styles.saveButtonDisabled,
              ]}
              resizeMode="stretch"
            >
              {isSavingItemPool ? (
                <ActivityIndicator size="small" color="#1a1a1a" />
              ) : (
                <Text style={[styles.saveButtonText, isCompact && compactStyles.saveButtonText]}>
                  Save
                </Text>
              )}
            </ImageBackground>
          </TouchableOpacity>
        </View>

        {/* Two-column layout */}
        <View style={styles.columnsContainer}>
          {/* Left column - Item grid by tag */}
          <ScrollView ref={scrollViewRef} style={styles.itemsListColumn} showsVerticalScrollIndicator={false}>
            {(() => { let flatIdx = 0; return ALL_TAGS.map((tag) => {
              const tagItems = getItemsByTag(tag);
              return (
                <View key={tag} style={styles.tagSection}>
                  <Text
                    style={[
                      styles.tagHeader,
                      isCompact && compactStyles.tagHeader,
                      { color: TAG_COLORS[tag] },
                    ]}
                  >
                    {TAG_DISPLAY_NAMES[tag]}
                  </Text>
                  <View style={[styles.itemsGrid, isCompact && compactStyles.itemsGrid]}>
                    {tagItems.map((item) => {
                      const idx = flatIdx++;
                      const unlocked = checkItemUnlocked(item.id);
                      const isSelected = selectedItem?.id === item.id;
                      const poolIndex = getItemPoolIndex(item.id);
                      const isInPool = poolIndex >= 0 && draftPoolIndices.has(poolIndex);
                      const isCursorItem = isController && idx === cursorIdx;
                      const cell = (
                        <TouchableOpacity
                          key={item.id}
                          style={[
                            styles.itemGridCell,
                            isCompact && compactStyles.itemGridCell,
                            isInPool && styles.itemGridCellInPool,
                            isSelected && styles.itemGridCellSelected,
                          ]}
                          onPress={() => setSelectedItem(item)}
                          activeOpacity={0.7}
                        >
                          <ImageBackground
                            source={squareFrameSource}
                            style={[styles.itemFrame, isCompact && compactStyles.itemFrame]}
                            resizeMode="stretch"
                          >
                            <Image
                              source={item.image}
                              style={[
                                styles.itemImage,
                                isCompact && compactStyles.itemImage,
                                !unlocked && styles.itemImageLocked,
                              ]}
                              resizeMode="contain"
                            />
                            {!unlocked && (
                              <View style={styles.itemLockOverlay}>
                                <Image
                                  source={lockIconSource}
                                  style={[
                                    styles.gridLockIcon,
                                    isCompact && compactStyles.gridLockIcon,
                                  ]}
                                  resizeMode="contain"
                                />
                              </View>
                            )}
                          </ImageBackground>
                        </TouchableOpacity>
                      );
                      return isCursorItem ? (
                        <View key={item.id} ref={cursorRef}>
                          <FocusGlow active>{cell}</FocusGlow>
                        </View>
                      ) : cell;
                    })}
                  </View>
                </View>
              );
            }); })()}
          </ScrollView>

          {/* Right column - Item details sidebar */}
          <View style={[styles.itemDetailsColumn, isCompact && compactStyles.itemDetailsColumn]}>
            {selectedItem && (
              <>
                {!checkItemUnlocked(selectedItem.id) && (
                  <ImageBackground
                    source={rectangleFrameSource}
                    style={[styles.lockedBanner, isCompact && compactStyles.lockedBanner]}
                    resizeMode="stretch"
                  >
                    <Image
                      source={lockIconSource}
                      style={styles.lockedBannerIcon}
                      resizeMode="contain"
                    />
                    <Text style={[styles.lockedBannerText, isCompact && compactStyles.lockedBannerText]}>
                      LOCKED
                    </Text>
                  </ImageBackground>
                )}

                {checkItemUnlocked(selectedItem.id) && selectedItemPoolIndex >= 0 && (
                  <TouchableOpacity
                    onPress={() => togglePoolItem(selectedItem)}
                    style={[styles.poolToggleButton, isCompact && compactStyles.poolToggleButton]}
                    disabled={!canRemoveSelectedItem}
                    activeOpacity={0.8}
                  >
                    <ImageBackground
                      source={!canRemoveSelectedItem
                        ? buttonGraySource
                        : selectedItemInPool
                          ? buttonV1Source
                          : buttonGreenSource}
                      style={[styles.poolToggleButtonBg, isCompact && compactStyles.poolToggleButtonBg]}
                      resizeMode="stretch"
                    >
                      <Text style={[styles.poolToggleButtonText, isCompact && compactStyles.poolToggleButtonText]}>
                        {selectedItemInPool ? 'Remove from Pool' : 'Add to Pool'}
                      </Text>
                    </ImageBackground>
                  </TouchableOpacity>
                )}

                <View style={[styles.selectedItemHeader, isCompact && compactStyles.selectedItemHeader]}>
                  <Image
                    source={selectedItem.image}
                    style={[styles.selectedItemImage, isCompact && compactStyles.selectedItemImage]}
                    resizeMode="contain"
                  />
                  <Text style={[styles.selectedItemName, isCompact && compactStyles.selectedItemName]}>
                    {selectedItem.name}
                  </Text>
                  <View
                    style={[
                      styles.rarityBadge,
                      { backgroundColor: RARITY_COLORS[selectedItem.rarity] },
                    ]}
                  >
                    <Text style={[styles.rarityText, isCompact && compactStyles.rarityText]}>
                      {selectedItem.rarity.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <ScrollView
                  style={styles.itemDescriptionScroll}
                  showsVerticalScrollIndicator={false}
                >
                  {(selectedItem.effect?.description ||
                    ITEM_DESCRIPTIONS[selectedItem.name]) && (
                    <Text style={[styles.itemDescription, isCompact && compactStyles.itemDescription]}>
                      {selectedItem.effect?.description ||
                        ITEM_DESCRIPTIONS[selectedItem.name]}
                    </Text>
                  )}

                  {(selectedItem.stats.atk !== undefined ||
                    selectedItem.stats.arm !== undefined ||
                    selectedItem.stats.spd !== undefined ||
                    selectedItem.stats.dig !== undefined ||
                    selectedItem.stats.hp !== undefined) && (
                    <View style={styles.statsContainer}>
                      <Text style={[styles.statsHeader, isCompact && compactStyles.statsHeader]}>
                        Stats
                      </Text>
                      {selectedItem.stats.atk !== undefined && (
                        <View style={styles.statRow}>
                          <View style={styles.statLabelRow}>
                            <Image source={statIconATK} style={[styles.statIcon, isCompact && compactStyles.statIcon]} resizeMode="contain" />
                            <Text style={[styles.statLabel, isCompact && compactStyles.statLabel]}>ATK</Text>
                          </View>
                          <Text style={[styles.statValue, isCompact && compactStyles.statValue]}>
                            +{selectedItem.stats.atk}
                          </Text>
                        </View>
                      )}
                      {selectedItem.stats.arm !== undefined && (
                        <View style={styles.statRow}>
                          <View style={styles.statLabelRow}>
                            <Image source={statIconARM} style={[styles.statIcon, isCompact && compactStyles.statIcon]} resizeMode="contain" />
                            <Text style={[styles.statLabel, isCompact && compactStyles.statLabel]}>ARM</Text>
                          </View>
                          <Text style={[styles.statValue, isCompact && compactStyles.statValue]}>
                            +{selectedItem.stats.arm}
                          </Text>
                        </View>
                      )}
                      {selectedItem.stats.spd !== undefined && (
                        <View style={styles.statRow}>
                          <View style={styles.statLabelRow}>
                            <Image source={statIconSPD} style={[styles.statIcon, isCompact && compactStyles.statIcon]} resizeMode="contain" />
                            <Text style={[styles.statLabel, isCompact && compactStyles.statLabel]}>SPD</Text>
                          </View>
                          <Text style={[styles.statValue, isCompact && compactStyles.statValue]}>
                            +{selectedItem.stats.spd}
                          </Text>
                        </View>
                      )}
                      {selectedItem.stats.dig !== undefined && (
                        <View style={styles.statRow}>
                          <View style={styles.statLabelRow}>
                            <Image source={statIconDIG} style={[styles.statIcon, isCompact && compactStyles.statIcon]} resizeMode="contain" />
                            <Text style={[styles.statLabel, isCompact && compactStyles.statLabel]}>DIG</Text>
                          </View>
                          <Text style={[styles.statValue, isCompact && compactStyles.statValue]}>
                            +{selectedItem.stats.dig}
                          </Text>
                        </View>
                      )}
                      {selectedItem.stats.hp !== undefined && (
                        <View style={styles.statRow}>
                          <View style={styles.statLabelRow}>
                            <Image source={statIconHP} style={[styles.statIcon, isCompact && compactStyles.statIcon]} resizeMode="contain" />
                            <Text style={[styles.statLabel, isCompact && compactStyles.statLabel]}>HP</Text>
                          </View>
                          <Text style={[styles.statValue, isCompact && compactStyles.statValue]}>
                            +{selectedItem.stats.hp}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </View>
      <ControllerHints hints={controllerHints} horizontal />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e6d5b8',
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    paddingTop: 24,
    paddingHorizontal: 64,
    paddingBottom: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backButton: {
    width: 80,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontFamily: Typography.button,
    fontSize: 16,
    marginBottom: 4,
  },
  titlePanel: {
    paddingVertical: 8,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    width: 180,
    height: 60,
  },
  title: {
    fontFamily: Typography.header,
    fontSize: 20,
  },
  saveButton: {
    width: 80,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.35,
  },
  saveButtonText: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#1a1a1a',
    marginBottom: 4,
  },
  titleGroup: {
    alignItems: 'center',
  },
  poolCountText: {
    fontFamily: Typography.header,
    fontSize: 11,
    color: '#3d2b1f',
  },
  poolCountAbsolute: {
    position: 'absolute',
    left: '100%',
    marginLeft: 8,
    width: 150,
    top: '50%',
    transform: [{ translateY: '-50%' }],
  },
  columnsContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: 16,
  },
  itemsListColumn: {
    flex: 2,
    paddingRight: 8,
  },
  tagSection: {
    marginBottom: 16,
  },
  tagHeader: {
    fontFamily: Typography.header,
    fontSize: 14,
    color: '#3d2b1f',
    marginBottom: 8,
    letterSpacing: 1,
  },
  itemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    width: 310,
  },
  itemGridCell: {
    width: 54,
    height: 54,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 6,
  },
  itemGridCellInPool: {
    borderColor: '#16a34a',
  },
  itemGridCellSelected: {
    backgroundColor: 'rgba(250,188,15,0.14)',
  },
  itemFrame: {
    width: 54,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  itemImage: {
    width: 46,
    height: 46,
  },
  itemImageLocked: {
    opacity: 0.4,
  },
  itemLockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  gridLockIcon: {
    width: 20,
    height: 20,
  },
  itemDetailsColumn: {
    flex: 1,
    padding: 8,
    paddingLeft: 40,
    alignItems: 'center',
    position: 'relative',
  },
  lockedBanner: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
    zIndex: 10,
    width: 90,
    height: 30,
    backgroundColor: 'rgba(163, 58, 58, 0.15)',
  },
  lockedBannerIcon: {
    width: 12,
    height: 12,
  },
  lockedBannerText: {
    fontFamily: Typography.body,
    fontSize: 10,
    color: '#a33a3a',
    fontWeight: 'bold',
  },
  selectedItemHeader: {
    alignItems: 'center',
    marginBottom: 6,
    marginTop: 40,
  },
  selectedItemImage: {
    width: 80,
    height: 80,
    marginBottom: 4,
  },
  selectedItemName: {
    fontFamily: Typography.header,
    fontSize: 14,
    color: '#3d2b1f',
    textAlign: 'center',
    marginBottom: 4,
  },
  rarityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  rarityText: {
    fontFamily: Typography.button,
    fontSize: 10,
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  poolToggleButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
  },
  poolToggleButtonBg: {
    width: 110,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  poolToggleButtonText: {
    fontFamily: Typography.button,
    fontSize: 11,
    color: '#ffffff',
  },
  itemDescriptionScroll: {
    flex: 1,
    width: '100%',
  },
  itemDescription: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#5c4033',
    lineHeight: 14,
    textAlign: 'center',
    marginBottom: 8,
  },
  statsContainer: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 6,
    padding: 8,
  },
  statsHeader: {
    fontFamily: Typography.header,
    fontSize: 11,
    color: '#3d2b1f',
    marginBottom: 4,
    textAlign: 'center',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statIcon: {
    width: 14,
    height: 14,
  },
  statLabel: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#8a7a6a',
  },
  statValue: {
    fontFamily: Typography.number,
    fontSize: 11,
    color: '#3d2b1f',
    fontWeight: 'bold',
  },
});

const compactStyles = StyleSheet.create({
  content: {
    paddingTop: 130,
    paddingHorizontal: 88,
    paddingBottom: 160,
  },
  header: {
    marginBottom: 12,
  },
  backButton: {
    width: 140,
    height: 76,
  },
  backButtonText: {
    fontSize: 28,
    marginBottom: 6,
  },
  titlePanel: {
    width: 320,
    height: 100,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 36,
  },
  saveButton: {
    width: 140,
    height: 76,
  },
  saveButtonText: {
    fontSize: 28,
    marginBottom: 6,
  },
  poolCountText: {
    fontSize: 18,
  },
  tagHeader: {
    fontSize: 22,
    marginBottom: 12,
  },
  itemsGrid: {
    gap: 11,
    width: 484,
  },
  itemGridCell: {
    width: 84,
    height: 84,
  },
  itemFrame: {
    width: 84,
    height: 84,
  },
  itemImage: {
    width: 65,
    height: 65,
  },
  gridLockIcon: {
    width: 36,
    height: 36,
  },
  itemDetailsColumn: {
    padding: 16,
    paddingLeft: 60,
  },
  lockedBanner: {
    width: 150,
    height: 48,
  },
  lockedBannerText: {
    fontSize: 16,
  },
  selectedItemImage: {
    width: 190,
    height: 190,
    marginBottom: 8,
  },
  selectedItemHeader: {
    marginTop: 150,
  },
  selectedItemName: {
    fontSize: 24,
    marginBottom: 8,
  },
  rarityText: {
    fontSize: 16,
  },
  poolToggleButton: {},
  poolToggleButtonBg: {
    width: 180,
    height: 52,
  },
  poolToggleButtonText: {
    fontSize: 18,
  },
  itemDescription: {
    fontSize: 18,
    lineHeight: 24,
    marginBottom: 12,
  },
  statsHeader: {
    fontSize: 18,
    marginBottom: 8,
  },
  statIcon: {
    width: 22,
    height: 22,
  },
  statLabel: {
    fontSize: 18,
  },
  statValue: {
    fontSize: 18,
  },
});
