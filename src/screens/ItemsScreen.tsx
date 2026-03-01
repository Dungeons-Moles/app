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
import { useIsFocused } from '@react-navigation/native';
import { useProfile } from '../contexts/ProfileContext';
import { useWallet } from '../contexts/WalletContext';
import { RootStackParamList } from '../navigation';
import { Typography } from '../theme/typography';
import { useScreenVariant } from '../contexts/ScreenVariantContext';
import { useControllerAction } from '../hooks/useControllerAction';
import { ControllerHints, type ButtonHint } from '../components/ui/ControllerHints';
import { useInputMode } from '../hooks/useInputMode';
import { FocusGlow } from '../components/ui/FocusGlow';
import { useAudio } from '../contexts/AudioContext';
import { HubSettingsModal } from '../components/ui/HubSettingsModal';
import {
  getGearByTag,
  GearDefinition,
  getEffectDescriptionAllTiers,
  RARITY_MULTIPLIER,
} from '../data/gear';
import { getGearStatsAtTier } from '../data/gear-effects';
import {
  getToolsByTag,
  ToolDefinition,
  getToolEffectDescriptionAllTiers,
  getToolStatsAtTier,
} from '../game/entities/items';
import { ItemTag, ItemStats, ItemRarity, GearId, ToolId } from '../game/engine/types';
import {
  BITMASK_SIZE,
  MIN_ACTIVE_POOL,
  isItemUnlocked as isPoolBitSet,
  setItemUnlocked as setPoolBit,
  getItemPoolIndex,
} from '../services/solana/types/item_pool';
import { getAllItemsetDefinitions, getItemsetsForItem } from '../data/itemsets';
import type { ItemsetDefinition } from '../data/itemsets';

const backgroundImage = require('../../assets/ui/backgrounds/loading-background.png');
const bookImageMobile = require('../../assets/ui/backgrounds/book-wide.png');
const bookImageCompact = require('../../assets/ui/backgrounds/book-compact.png');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.png');
const buttonSource = require('../../assets/ui/buttons/button.png');
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

const ITEMSET_ICONS: Record<string, any> = {
  UNION_STANDARD: require('../../assets/icons/itemsets/union_standard.png'),
  SHARD_CIRCUIT: require('../../assets/icons/itemsets/shard_circuit.png'),
  DEMOLITION_PERMIT: require('../../assets/icons/itemsets/demolition_permit.png'),
  FUSE_NETWORK: require('../../assets/icons/itemsets/fuse_network.png'),
  SHRAPNEL_HARNESS: require('../../assets/icons/itemsets/shrapnel_harness.png'),
  RUST_RITUAL: require('../../assets/icons/itemsets/rust_ritual.png'),
  SWIFT_DIGGER_KIT: require('../../assets/icons/itemsets/swift_digger_kit.png'),
  ROYAL_EXTRACTION: require('../../assets/icons/itemsets/royal_extraction.png'),
  WHITEOUT_INITIATIVE: require('../../assets/icons/itemsets/whiteout_initiative.png'),
  BLOODRUSH_PROTOCOL: require('../../assets/icons/itemsets/bloodrush_protocol.png'),
  CORROSION_PAYLOAD: require('../../assets/icons/itemsets/corrosion_payload.png'),
  GOLDEN_SHRAPNEL_EXCHANGE: require('../../assets/icons/itemsets/golden_shrapnel_exchange.png'),
};

// Item descriptions mapping
const ITEM_DESCRIPTIONS: Record<string, string> = {
  'Basic Pickaxe': 'A sturdy pickaxe for digging through tough terrain. Essential for any miner.',
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

const ALL_TAGS: ItemTag[] = ['STONE', 'SCOUT', 'GREED', 'BLAST', 'FROST', 'RUST', 'BLOOD', 'TEMPO'];

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

type StatTiers = { atk?: string; arm?: string; spd?: string; dig?: string; hp?: string };

function formatTiered(v1: number, v2: number, v3: number): string {
  if (v1 === v2 && v2 === v3) return `+${v1}`;
  return `+${v1}/${v2}/${v3}`;
}

function getGearStatTiers(id: GearId, baseStats: ItemStats): StatTiers {
  const result: StatTiers = {};
  const mults = [RARITY_MULTIPLIER.COMMON, RARITY_MULTIPLIER.GILDED, RARITY_MULTIPLIER.DIAMOND];

  // BattleStart flat stats from effects (authoritative tier values)
  const e1 = getGearStatsAtTier(id, 1);
  const e2 = getGearStatsAtTier(id, 2);
  const e3 = getGearStatsAtTier(id, 3);

  const statKeys: (keyof ItemStats)[] = ['atk', 'arm', 'spd', 'dig', 'hp'];
  for (const key of statKeys) {
    const ev1 = e1[key] ?? 0;
    const ev2 = e2[key] ?? 0;
    const ev3 = e3[key] ?? 0;
    const hasEffectStat = ev1 || ev2 || ev3;

    const baseVal = baseStats[key];
    if (hasEffectStat) {
      // Effect tier values are authoritative (already include any base stat contribution)
      result[key] = formatTiered(ev1, ev2, ev3);
    } else if (baseVal !== undefined) {
      // Permanent stat only (no BattleStart effect) — scale with rarity multiplier
      result[key] = formatTiered(
        ...(mults.map((m) => Math.floor(baseVal * m)) as [number, number, number])
      );
    }
  }
  return result;
}

function getToolStatTiers(id: ToolId): StatTiers {
  const t1 = getToolStatsAtTier(id, 1);
  const t2 = getToolStatsAtTier(id, 2);
  const t3 = getToolStatsAtTier(id, 3);
  const result: StatTiers = {};
  const stats: (keyof ItemStats)[] = ['atk', 'arm', 'spd', 'dig', 'hp'];
  for (const key of stats) {
    const v1 = t1[key] ?? 0;
    const v2 = t2[key] ?? 0;
    const v3 = t3[key] ?? 0;
    if (v1 || v2 || v3) {
      result[key] = formatTiered(v1, v2, v3);
    }
  }
  return result;
}

function getItemStatTiers(item: DisplayItem): StatTiers {
  if (item.isTool) return getToolStatTiers(item.id as ToolId);
  return getGearStatTiers(item.id as GearId, item.stats);
}

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
  const { playSfx } = useAudio();
  const { isItemUnlocked, updateActiveItemPool, profile, mode } = useProfile();
  const { disconnect } = useWallet();
  const isGuest = mode === 'guest';
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
    setSelectedItemset(getAllItemsetDefinitions()[0] || null);
  }, []);

  const checkItemUnlocked = useCallback(
    (id: string): boolean => isGuest || isItemUnlocked(id),
    [isGuest, isItemUnlocked]
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
    console.log('[ItemsScreen] Save pressed, pool size:', draftPoolIndices.size);
    if (draftPoolIndices.size < ITEM_POOL_MIN_SIZE) {
      console.warn('[ItemsScreen] Pool too small:', draftPoolIndices.size, '<', ITEM_POOL_MIN_SIZE);
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

    console.log('[ItemsScreen] Sending updateActiveItemPool transaction...');
    setIsSavingItemPool(true);
    try {
      const result = await updateActiveItemPool(nextBitmask);
      if (!result.success) {
        console.error('[ItemsScreen] Save failed:', result.error);
        Alert.alert('Failed to Save', result.error ?? 'Could not update active item pool.');
        return;
      }
      console.log('[ItemsScreen] Item pool saved successfully, signature:', result.signature);
      Alert.alert('Saved', 'Your item pool has been updated.');
    } catch (err) {
      console.error('[ItemsScreen] Unexpected save error:', err);
      Alert.alert('Failed to Save', 'An unexpected error occurred.');
    } finally {
      setIsSavingItemPool(false);
    }
  }, [draftPoolIndices, updateActiveItemPool]);

  const handleBack = useCallback(() => {
    playSfx('ui_back');
    navigation.goBack();
  }, [navigation, playSfx]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    navigation.reset({
      index: 0,
      routes: [{ name: 'Account' }],
    });
  }, [disconnect, navigation]);

  const selectedItemPoolIndex = selectedItem ? getItemPoolIndex(selectedItem.id) : -1;
  const selectedItemInPool =
    selectedItemPoolIndex >= 0 && draftPoolIndices.has(selectedItemPoolIndex);
  const canRemoveSelectedItem = !selectedItemInPool || draftPoolIndices.size > ITEM_POOL_MIN_SIZE;

  // --- Controller navigation ---
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const isFocused = useIsFocused();
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const allItems = useMemo(() => getAllItems(), []);
  const itemsPerRow = isCompact ? 5 : 5;

  const [cursorIdx, setCursorIdx] = useState(0);

  // Tab state
  const [activeTab, setActiveTab] = useState<'items' | 'itemsets'>('items');
  const [selectedItemset, setSelectedItemset] = useState<ItemsetDefinition | null>(null);
  const [itemsetCursorIdx, setItemsetCursorIdx] = useState(0);
  const allItemsets = useMemo(() => getAllItemsetDefinitions(), []);
  const allItemsById = useMemo(() => {
    const map: Record<string, DisplayItem> = {};
    getAllItems().forEach((item) => {
      map[item.id] = item;
    });
    return map;
  }, []);
  const itemsetCursorRef = useRef<View>(null);

  // Sync cursor → selected item + auto-scroll into view
  useEffect(() => {
    if (isController && allItems[cursorIdx]) {
      setSelectedItem(allItems[cursorIdx]);
      playSfx('ui_hover');
      // Scroll the focused item into view on web
      requestAnimationFrame(() => {
        const el = cursorRef.current as unknown as HTMLElement;
        if (el?.scrollIntoView) {
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      });
    }
  }, [cursorIdx, isController]);

  // Sync itemset cursor → selected itemset
  useEffect(() => {
    if (isController && activeTab === 'itemsets' && allItemsets[itemsetCursorIdx]) {
      setSelectedItemset(allItemsets[itemsetCursorIdx]);
      playSfx('ui_hover');
    }
  }, [itemsetCursorIdx, isController, activeTab]);

  const scrollViewRef = useRef<ScrollView>(null);
  const cursorRef = useRef<View>(null);

  const toggleTab = useCallback(() => {
    playSfx('ui_page_turn');
    setActiveTab((prev) => {
      if (prev === 'items') {
        setItemsetCursorIdx(0);
        setSelectedItemset(getAllItemsetDefinitions()[0] || null);
        return 'itemsets';
      } else {
        setCursorIdx(0);
        return 'items';
      }
    });
  }, [playSfx]);

  useControllerAction(
    {
      onB: handleBack,
      onStart: () => setShowSettingsModal(true),
      onA:
        activeTab === 'items' && !isGuest
          ? () => {
              const item = allItems[cursorIdx];
              if (item && checkItemUnlocked(item.id)) togglePoolItem(item);
            }
          : undefined,
      onX: activeTab === 'items' && !isGuest && hasPoolChanges ? handleSaveItemPool : undefined,
      onL1: toggleTab,
      onR1: toggleTab,
      onDPadLeft: () => {
        if (activeTab === 'items') setCursorIdx((p) => Math.max(0, p - 1));
        else setItemsetCursorIdx((p) => Math.max(0, p - 1));
      },
      onDPadRight: () => {
        if (activeTab === 'items') setCursorIdx((p) => Math.min(allItems.length - 1, p + 1));
        else setItemsetCursorIdx((p) => Math.min(allItemsets.length - 1, p + 1));
      },
      onDPadUp: () => {
        if (activeTab === 'items') setCursorIdx((p) => Math.max(0, p - itemsPerRow));
        else setItemsetCursorIdx((p) => Math.max(0, p - itemsPerRow));
      },
      onDPadDown: () => {
        if (activeTab === 'items')
          setCursorIdx((p) => Math.min(allItems.length - 1, p + itemsPerRow));
        else setItemsetCursorIdx((p) => Math.min(allItemsets.length - 1, p + itemsPerRow));
      },
    },
    isController && isFocused && !showSettingsModal
  );

  const controllerHints: ButtonHint[] = [
    { button: 'L1R1', label: 'Tab' },
    { button: 'DPad', label: 'Navigate' },
    ...(activeTab === 'items' && !isGuest
      ? [
          { button: 'A' as const, label: selectedItemInPool ? 'Remove' : 'Add to Pool' },
          ...(hasPoolChanges ? [{ button: 'X' as const, label: 'Save' }] : []),
        ]
      : []),
    { button: 'B', label: 'Back' },
  ];

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Image source={backgroundImage} style={styles.backgroundImage} resizeMode="stretch" />
      <Image
        source={isCompact ? bookImageCompact : bookImageMobile}
        style={styles.backgroundImage}
        resizeMode="stretch"
      />

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
            <TouchableOpacity onPress={toggleTab} activeOpacity={0.8}>
              <ImageBackground
                source={buttonV4Source}
                style={[styles.titlePanel, isCompact && compactStyles.titlePanel]}
                resizeMode="stretch"
              >
                <Text style={[styles.title, isCompact && compactStyles.title]}>
                  {activeTab === 'items' ? 'Items' : 'Itemsets'}
                </Text>
              </ImageBackground>
            </TouchableOpacity>
            {activeTab === 'items' && !isGuest && (
              <Text
                numberOfLines={1}
                style={[
                  styles.poolCountText,
                  isCompact && compactStyles.poolCountText,
                  styles.poolCountAbsolute,
                ]}
              >
                Pool: {draftPoolIndices.size} (min {ITEM_POOL_MIN_SIZE})
              </Text>
            )}
          </View>

          {/* Save button in header right — only on items tab, hidden for guests */}
          {activeTab === 'items' && !isGuest ? (
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
                  (isSavingItemPool ||
                    !hasPoolChanges ||
                    draftPoolIndices.size < ITEM_POOL_MIN_SIZE) &&
                    styles.saveButtonDisabled,
                ]}
                resizeMode="stretch"
              >
                {isSavingItemPool ? (
                  <ActivityIndicator size="small" color="#1a1a1a" />
                ) : (
                  <Text style={[styles.saveButtonText, isCompact && compactStyles.saveButtonText]}>
                    Press X to Save
                  </Text>
                )}
              </ImageBackground>
            </TouchableOpacity>
          ) : (
            <View style={[styles.saveButton, isCompact && compactStyles.saveButton]} />
          )}
        </View>

        {/* Two-column layout */}
        <View style={styles.columnsContainer}>
          {/* Left column - Item grid by tag / Itemset grid */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.itemsListColumn}
            showsVerticalScrollIndicator={false}
          >
            {activeTab === 'items' ? (
              (() => {
                let flatIdx = 0;
                return ALL_TAGS.map((tag) => {
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
                          const isInPool =
                            !isGuest && poolIndex >= 0 && draftPoolIndices.has(poolIndex);
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
                              onPress={() => { playSfx('ui_hover'); setSelectedItem(item); }}
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
                          ) : (
                            cell
                          );
                        })}
                      </View>
                    </View>
                  );
                });
              })()
            ) : (
              <View style={styles.tagSection}>
                <Text
                  style={[
                    styles.tagHeader,
                    isCompact && compactStyles.tagHeader,
                    { color: '#DAA520' },
                  ]}
                >
                  ITEMSETS
                </Text>
                <View style={[styles.itemsGrid, isCompact && compactStyles.itemsGrid]}>
                  {allItemsets.map((itemset, idx) => {
                    const isSelected = selectedItemset?.id === itemset.id;
                    const isCursorItem = isController && idx === itemsetCursorIdx;
                    const cell = (
                      <TouchableOpacity
                        key={itemset.id}
                        style={[
                          styles.itemGridCell,
                          isCompact && compactStyles.itemGridCell,
                          isSelected && styles.itemGridCellSelected,
                        ]}
                        onPress={() => { playSfx('ui_hover'); setSelectedItemset(itemset); }}
                        activeOpacity={0.7}
                      >
                        <ImageBackground
                          source={squareFrameSource}
                          style={[styles.itemFrame, isCompact && compactStyles.itemFrame]}
                          resizeMode="stretch"
                        >
                          <Image
                            source={ITEMSET_ICONS[itemset.id]}
                            style={[styles.itemImage, isCompact && compactStyles.itemImage]}
                            resizeMode="contain"
                          />
                        </ImageBackground>
                      </TouchableOpacity>
                    );
                    return isCursorItem ? (
                      <View key={itemset.id} ref={itemsetCursorRef}>
                        <FocusGlow active>{cell}</FocusGlow>
                      </View>
                    ) : (
                      cell
                    );
                  })}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Right column - Item details sidebar */}
          <View style={[styles.itemDetailsColumn, isCompact && compactStyles.itemDetailsColumn]}>
            {activeTab === 'itemsets' && selectedItemset && (
              <>
                <View
                  style={[
                    styles.selectedItemHeader,
                    isCompact && compactStyles.selectedItemHeader,
                    styles.itemsetDetailHeader,
                    isCompact && compactStyles.itemsetDetailHeader,
                  ]}
                >
                  <Image
                    source={ITEMSET_ICONS[selectedItemset.id]}
                    style={[styles.selectedItemImage, isCompact && compactStyles.selectedItemImage]}
                    resizeMode="contain"
                  />
                  <Text
                    style={[styles.selectedItemName, isCompact && compactStyles.selectedItemName]}
                  >
                    {selectedItemset.name}
                  </Text>
                </View>

                <ScrollView
                  style={styles.itemDescriptionScroll}
                  showsVerticalScrollIndicator={false}
                >
                  {(() => {
                    const timingLabel = selectedItemset.bonus.timing
                      ? selectedItemset.bonus.timing.replace(/_/g, ' ')
                      : selectedItemset.bonus.passive
                        ? 'PASSIVE'
                        : null;
                    return (
                      <>
                        {timingLabel && (
                          <Text
                            style={[
                              styles.itemsetTimingLabel,
                              isCompact && compactStyles.itemsetTimingLabel,
                            ]}
                          >
                            {timingLabel}
                          </Text>
                        )}
                        <View style={styles.statsContainer}>
                          <Text
                            style={[
                              styles.itemDescription,
                              isCompact && compactStyles.itemDescription,
                            ]}
                          >
                            {selectedItemset.bonus.description}
                          </Text>
                        </View>
                        <View style={styles.itemsetsSection}>
                          <Text
                            style={[
                              styles.itemsetsSectionTitle,
                              isCompact && compactStyles.itemsetsSectionTitle,
                            ]}
                          >
                            Items:
                          </Text>
                          {selectedItemset.requiredItems.map((itemId) => {
                            const item = allItemsById[itemId as string];
                            if (!item) return null;
                            return (
                              <View key={itemId as string} style={styles.itemsetMemberRow}>
                                <ImageBackground
                                  source={squareFrameSource}
                                  style={[
                                    styles.itemsetReqFrame,
                                    isCompact && compactStyles.itemsetReqFrame,
                                  ]}
                                  resizeMode="stretch"
                                >
                                  <Image
                                    source={item.image}
                                    style={[
                                      styles.itemsetReqItemImage,
                                      isCompact && compactStyles.itemsetReqItemImage,
                                    ]}
                                    resizeMode="contain"
                                  />
                                </ImageBackground>
                                <Text
                                  style={[
                                    styles.itemsetMemberName,
                                    isCompact && compactStyles.itemsetMemberName,
                                  ]}
                                >
                                  {item.name}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      </>
                    );
                  })()}
                </ScrollView>
              </>
            )}

            {activeTab === 'items' && selectedItem && (
              <>
                {!isGuest && !checkItemUnlocked(selectedItem.id) && (
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
                    <Text
                      style={[styles.lockedBannerText, isCompact && compactStyles.lockedBannerText]}
                    >
                      LOCKED
                    </Text>
                  </ImageBackground>
                )}

                {!isGuest && checkItemUnlocked(selectedItem.id) && selectedItemPoolIndex >= 0 && (
                  <TouchableOpacity
                    onPress={() => togglePoolItem(selectedItem)}
                    style={[styles.poolToggleButton, isCompact && compactStyles.poolToggleButton]}
                    disabled={!canRemoveSelectedItem}
                    activeOpacity={0.8}
                  >
                    <ImageBackground
                      source={
                        !canRemoveSelectedItem
                          ? buttonGraySource
                          : selectedItemInPool
                            ? buttonSource
                            : buttonGreenSource
                      }
                      style={[
                        styles.poolToggleButtonBg,
                        isCompact && compactStyles.poolToggleButtonBg,
                      ]}
                      resizeMode="stretch"
                    >
                      <Text
                        style={[
                          styles.poolToggleButtonText,
                          isCompact && compactStyles.poolToggleButtonText,
                        ]}
                      >
                        {selectedItemInPool ? 'Remove from Pool' : 'Add to Pool'}
                      </Text>
                    </ImageBackground>
                  </TouchableOpacity>
                )}

                <View
                  style={[styles.selectedItemHeader, isCompact && compactStyles.selectedItemHeader]}
                >
                  <Image
                    source={selectedItem.image}
                    style={[styles.selectedItemImage, isCompact && compactStyles.selectedItemImage]}
                    resizeMode="contain"
                  />
                  <Text
                    style={[styles.selectedItemName, isCompact && compactStyles.selectedItemName]}
                  >
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
                  {(() => {
                    const allTiersDesc = selectedItem.effect
                      ? selectedItem.isTool
                        ? getToolEffectDescriptionAllTiers(selectedItem.id as any)
                        : getEffectDescriptionAllTiers(selectedItem.id as any)
                      : null;
                    const desc = allTiersDesc || ITEM_DESCRIPTIONS[selectedItem.name];
                    return desc ? (
                      <Text
                        style={[styles.itemDescription, isCompact && compactStyles.itemDescription]}
                      >
                        {desc}
                      </Text>
                    ) : null;
                  })()}

                  {(() => {
                    const tiers = getItemStatTiers(selectedItem);
                    const statEntries: { label: string; icon: any; value: string }[] = [];
                    if (tiers.atk)
                      statEntries.push({ label: 'ATK', icon: statIconATK, value: tiers.atk });
                    if (tiers.arm)
                      statEntries.push({ label: 'ARM', icon: statIconARM, value: tiers.arm });
                    if (tiers.spd)
                      statEntries.push({ label: 'SPD', icon: statIconSPD, value: tiers.spd });
                    if (tiers.dig)
                      statEntries.push({ label: 'DIG', icon: statIconDIG, value: tiers.dig });
                    if (tiers.hp)
                      statEntries.push({ label: 'HP', icon: statIconHP, value: tiers.hp });
                    if (statEntries.length === 0) return null;
                    return (
                      <View style={styles.statsContainer}>
                        <Text style={[styles.statsHeader, isCompact && compactStyles.statsHeader]}>
                          Stats
                        </Text>
                        {statEntries.map((stat) => (
                          <View key={stat.label} style={styles.statRow}>
                            <View style={styles.statLabelRow}>
                              <Image
                                source={stat.icon}
                                style={[styles.statIcon, isCompact && compactStyles.statIcon]}
                                resizeMode="contain"
                              />
                              <Text
                                style={[styles.statLabel, isCompact && compactStyles.statLabel]}
                              >
                                {stat.label}
                              </Text>
                            </View>
                            <Text style={[styles.statValue, isCompact && compactStyles.statValue]}>
                              {stat.value}
                            </Text>
                          </View>
                        ))}
                      </View>
                    );
                  })()}

                  {/* Itemsets this item is part of */}
                  {(() => {
                    const itemsets = getItemsetsForItem(selectedItem.id as any);
                    if (itemsets.length === 0) return null;
                    return (
                      <View style={styles.itemsetsSection}>
                        <Text
                          style={[
                            styles.itemsetsSectionTitle,
                            isCompact && compactStyles.itemsetsSectionTitle,
                          ]}
                        >
                          Part of:
                        </Text>
                        {itemsets.map((itemset) => (
                          <View key={itemset.id} style={styles.itemsetMemberRow}>
                            <Image
                              source={ITEMSET_ICONS[itemset.id]}
                              style={[
                                styles.itemsetMemberIcon,
                                isCompact && compactStyles.itemsetMemberIcon,
                              ]}
                              resizeMode="contain"
                            />
                            <Text
                              style={[
                                styles.itemsetMemberName,
                                isCompact && compactStyles.itemsetMemberName,
                              ]}
                            >
                              {itemset.name}
                            </Text>
                          </View>
                        ))}
                      </View>
                    );
                  })()}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </View>
      <HubSettingsModal
        visible={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onDisconnect={handleDisconnect}
      />
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
    width: 130,
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
  itemsetDetailHeader: {
    marginTop: 16,
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
  // Itemsets membership section (items tab right panel)
  itemsetsSection: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 6,
    padding: 8,
    marginTop: 8,
  },
  itemsetsSectionTitle: {
    fontFamily: Typography.header,
    fontSize: 10,
    color: '#3d2b1f',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  itemsetMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  itemsetMemberIcon: {
    width: 18,
    height: 18,
  },
  itemsetMemberName: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#8B4513',
  },
  // Required item frames inside itemset detail panel
  itemsetReqFrame: {
    width: 26,
    height: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemsetReqItemImage: {
    width: 20,
    height: 20,
  },
  // Itemset detail timing label (itemsets tab right panel)
  itemsetTimingLabel: {
    fontFamily: Typography.header,
    fontSize: 11,
    color: '#8B4513',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 4,
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
    width: 220,
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
  itemsetDetailHeader: {
    marginTop: 30,
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
  // Itemsets membership section compact
  itemsetsSectionTitle: {
    fontSize: 16,
  },
  itemsetMemberIcon: {
    width: 28,
    height: 28,
  },
  itemsetMemberName: {
    fontSize: 18,
  },
  // Required item frames compact
  itemsetReqFrame: {
    width: 42,
    height: 42,
  },
  itemsetReqItemImage: {
    width: 34,
    height: 34,
  },
  // Itemset detail timing label compact
  itemsetTimingLabel: {
    fontSize: 18,
  },
});
