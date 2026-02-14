import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  Image,
  ImageBackground,
  Platform,
  TouchableWithoutFeedback,
  ScrollView,
  RefreshControl,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Ellipse, Defs, Pattern, Line } from 'react-native-svg';
import { useProfile } from '../contexts/ProfileContext';
import { useSession } from '../contexts/SessionContext';
import { useGame, GamePhase } from '../contexts/GameContext';
import { shortenAddress } from '../utils/storage';
import { RootStackParamList } from '../navigation';
import { SpeedControls } from '../components/combat';
import { Skeleton } from '../components/common/Skeleton';
import { Typography } from '../theme/typography';
import { useScreenVariant } from '../contexts/ScreenVariantContext';
import { MAX_CAMPAIGN_LEVEL } from '../hooks/useMapGenerator';
import {
  GEAR_DEFINITIONS,
  getAllGearDefinitions,
  getGearByTag,
  GearDefinition,
} from '../data/gear';
import {
  TOOL_DEFINITIONS,
  getAllToolDefinitions,
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

const defaultMoleImageSource = require('../../assets/entities/characters/default-mole.png');
const backgroundImageCompact = require('../../assets/ui/backgrounds/hub-background-compact.png');
const backgroundImageWide = require('../../assets/ui/backgrounds/hub-background-wide.png');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.png');
const buttonV2Source = require('../../assets/ui/buttons/button-v2.png');
const buttonV3Source = require('../../assets/ui/buttons/button-v3.png');
const buttonV4Source = require('../../assets/ui/buttons/button-v4.png');
const paperPanelSource = require('../../assets/ui/panels/paper-panel.png');
const yellowBrushSource = require('../../assets/ui/illustrations/yellow-brush.png');
const engineImageSource = require('../../assets/ui/illustrations/engine.png');
const walletImageSource = require('../../assets/ui/illustrations/wallet.png');
const lockIconSource = require('../../assets/icons/ui/lock.png');

// Item descriptions mapping (enhanced from GDD)
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

// Tag display names
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

// All tags in order
const ALL_TAGS: ItemTag[] = ['STONE', 'SCOUT', 'GREED', 'BLAST', 'FROST', 'RUST', 'BLOOD', 'TEMPO'];
const ITEM_POOL_MIN_SIZE = MIN_ACTIVE_POOL;

// Unified display item type for tools and gear
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

// Rarity colors for UI
const RARITY_COLORS: Record<ItemRarity, string> = {
  COMMON: '#9CA3AF',
  GILDED: '#22C55E',
  DIAMOND: '#3B82F6',
  RARE: '#A855F7',
  HEROIC: '#F97316',
  MYTHIC: '#FFD700',
};

type HubScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Hub'>;
};

export function HubScreen({ navigation }: HubScreenProps) {
  const {
    profile,
    isLoading,
    clearProfile,
    updateDefaultCombatSpeed,
    refresh,
    mode,
    isItemUnlocked,
    defaultCombatSpeed,
    purchaseRuns,
    availableRuns,
    updateActiveItemPool,
  } = useProfile();
  const isGuest = mode === 'guest';
  const screenVariant = useScreenVariant();
  const isCompact = screenVariant === 'compact';
  const { activeSessions } = useSession();
  const { state: gameState, dispatch } = useGame();
  const [showSettings, setShowSettings] = useState(false);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [marketplaceTab, setMarketplaceTab] = useState<'skins' | 'items' | 'pve'>('pve');
  const [showSkins, setShowSkins] = useState(false);
  const [showRanks, setShowRanks] = useState(false);
  const [showItems, setShowItems] = useState(false);
  const [selectedItem, setSelectedItem] = useState<DisplayItem | null>(null);
  const [draftPoolIndices, setDraftPoolIndices] = useState<Set<number>>(new Set());
  const [isSavingItemPool, setIsSavingItemPool] = useState(false);
  const [showQuests, setShowQuests] = useState(false);
  const [showPvP, setShowPvP] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const hasPromptedResume = useRef(false);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    if (isGuest || hasPromptedResume.current) {
      return;
    }

    if (activeSessions.length > 0) {
      hasPromptedResume.current = true;
      setShowResumePrompt(true);
    }
  }, [activeSessions.length, isGuest]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleResetProfile = async () => {
    await clearProfile();
    navigation.reset({
      index: 0,
      routes: [{ name: 'Account' }],
    });
  };

  const handlePlayPvE = useCallback(async () => {
    if (isGuest) {
      // Guest mode: Start game directly with random seed
      const seed = Math.floor(Math.random() * 2147483647);

      // Reset any existing game state before starting a new one
      if (gameState) {
        dispatch({ type: 'RESET_GAME' });
      }

      dispatch({ type: 'START_GAME', seed });
      navigation.navigate('Game');
    } else {
      // Navigate to campaign selection screen
      navigation.navigate('CampaignSelect');
    }
  }, [navigation, isGuest, dispatch, gameState?.phase]);

  const handlePlayPvP = () => {
    setShowPvP(true);
  };

  const handleGauntlet = () => {
    setShowPvP(false);
    navigation.navigate('Gauntlet');
  };

  const handleDuels = () => {
    setShowPvP(false);
    navigation.navigate('Duels');
  };

  const handlePitDraft = () => {
    setShowPvP(false);
    navigation.navigate('PitDraft');
  };

  const handleMarketplace = () => {
    setShowMarketplace(true);
    setMarketplaceTab('pve');
    setPurchaseError(null);
  };

  const handlePurchaseSessions = async () => {
    setIsPurchasing(true);
    setPurchaseError(null);
    try {
      const result = await purchaseRuns();
      if (result?.success) {
        setShowMarketplace(false);
      } else {
        setPurchaseError(result?.error ?? 'Purchase failed');
      }
    } catch (e) {
      setPurchaseError(e instanceof Error ? e.message : 'Purchase failed');
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleLeaderboard = () => {
    setShowRanks(true);
  };

  const handleQuests = () => {
    setShowQuests(true);
  };

  const handleSkins = () => {
    setShowSkins(true);
  };

  const checkItemUnlocked = useCallback(
    (id: string): boolean => {
      return isItemUnlocked(id);
    },
    [isItemUnlocked]
  );

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

  // Helper to convert tool/gear to DisplayItem
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

  // Get all items by tag
  const getItemsByTag = (tag: ItemTag): DisplayItem[] => {
    const tools = getToolsByTag(tag).map((t) => convertToDisplayItem(t, true, tag));
    const gear = getGearByTag(tag).map((g) => convertToDisplayItem(g, false, tag));
    return [...tools, ...gear];
  };

  // Get all items
  const getAllItems = (): DisplayItem[] => {
    const allItems: DisplayItem[] = [];
    ALL_TAGS.forEach((tag) => {
      allItems.push(...getItemsByTag(tag));
    });
    return allItems;
  };

  const handleItems = () => {
    setShowItems(true);
    loadDraftPoolFromProfile();
    // Select first unlocked item or first item
    const allItems = getAllItems();
    const firstUnlocked = allItems.find((item) => checkItemUnlocked(item.id));
    setSelectedItem(firstUnlocked || allItems[0] || null);
  };

  const togglePoolItem = useCallback(
    (item: DisplayItem) => {
      if (!checkItemUnlocked(item.id)) {
        return;
      }

      const poolIndex = getItemPoolIndex(item.id);
      if (poolIndex < 0) {
        return;
      }

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
      if (onChain !== draft) {
        return true;
      }
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

  const selectedItemPoolIndex = selectedItem ? getItemPoolIndex(selectedItem.id) : -1;
  const selectedItemInPool =
    selectedItemPoolIndex >= 0 && draftPoolIndices.has(selectedItemPoolIndex);
  const canRemoveSelectedItem = !selectedItemInPool || draftPoolIndices.size > ITEM_POOL_MIN_SIZE;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Image
        source={isCompact ? backgroundImageCompact : backgroundImageWide}
        style={styles.backgroundImage}
        resizeMode="stretch"
      />
      <ScrollView
        contentContainerStyle={{ flex: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FABC0F" />
        }
      >
        <View style={styles.hubLayout}>
          {/* TOP LEFT - Player Info (compact: full left column) */}
          <View style={[styles.topLeft, isCompact && compactStyles.leftColumn]}>
            <TouchableOpacity
              onPress={() => navigation.navigate('ProfileSettings')}
              activeOpacity={0.8}
            >
              <ImageBackground
                source={walletImageSource}
                style={[styles.playerPanel, isCompact && compactStyles.playerPanel]}
                resizeMode="stretch"
              >
                {/* Avatar Square */}
                <View style={[styles.avatarContainer, isCompact && compactStyles.avatarContainer]}>
                  <Image
                    source={defaultMoleImageSource}
                    style={[styles.avatarImage, isCompact && compactStyles.avatarImage]}
                    resizeMode="cover"
                  />
                </View>

                {/* Player Info */}
                <View style={styles.playerInfo}>
                  {isLoading ? (
                    <View style={{ gap: 4 }}>
                      <Skeleton width={80} height={16} borderRadius={4} />
                      <Skeleton width={60} height={12} borderRadius={4} />
                    </View>
                  ) : (
                    <>
                      <Text
                        style={[styles.playerName, isCompact && compactStyles.playerName]}
                        numberOfLines={1}
                      >
                        {profile?.name ?? 'Adventurer'}
                      </Text>
                      {isGuest ? (
                        <Text style={[styles.walletAddress, isCompact && compactStyles.walletAddress]}>
                          (GUEST)
                        </Text>
                      ) : profile?.owner ? (
                        <Text style={[styles.walletAddress, isCompact && compactStyles.walletAddress]}>
                          {shortenAddress(profile.owner.toBase58())}
                        </Text>
                      ) : null}
                    </>
                  )}
                </View>
              </ImageBackground>
            </TouchableOpacity>

            {/* Wide: Items button directly below profile */}
            {!isCompact && !isGuest && (
              <TouchableOpacity onPress={handleItems} activeOpacity={0.7} style={{ marginTop: 8 }}>
                <ImageBackground
                  source={buttonV1Source}
                  style={styles.navButton}
                  resizeMode="stretch"
                >
                  <Text style={styles.navButtonText}>Items</Text>
                </ImageBackground>
              </TouchableOpacity>
            )}

            {/* Compact: all nav buttons centered vertically below profile */}
            {isCompact && !isGuest && (
              <View style={compactStyles.leftButtonsCenter}>
                <TouchableOpacity onPress={handleItems} activeOpacity={0.7}>
                  <ImageBackground
                    source={buttonV1Source}
                    style={[styles.navButton, compactStyles.navButton]}
                    resizeMode="stretch"
                  >
                    <Text style={[styles.navButtonText, compactStyles.navButtonText]}>Items</Text>
                  </ImageBackground>
                </TouchableOpacity>

                <TouchableOpacity onPress={handleQuests} activeOpacity={0.7}>
                  <ImageBackground
                    source={buttonV1Source}
                    style={[styles.navButton, compactStyles.navButton]}
                    resizeMode="stretch"
                  >
                    <Text style={[styles.navButtonText, compactStyles.navButtonText]}>Quests</Text>
                  </ImageBackground>
                </TouchableOpacity>

                <TouchableOpacity onPress={handleSkins} activeOpacity={0.7}>
                  <ImageBackground
                    source={buttonV1Source}
                    style={[styles.navButton, compactStyles.navButton]}
                    resizeMode="stretch"
                  >
                    <Text style={[styles.navButtonText, compactStyles.navButtonText]}>Skins</Text>
                  </ImageBackground>
                </TouchableOpacity>

                <TouchableOpacity onPress={handleMarketplace} activeOpacity={0.7}>
                  <ImageBackground
                    source={buttonV1Source}
                    style={[styles.navButton, compactStyles.navButton]}
                    resizeMode="stretch"
                  >
                    <Text style={[styles.navButtonText, compactStyles.navButtonText]}>
                      Marketplace
                    </Text>
                  </ImageBackground>
                </TouchableOpacity>

                <TouchableOpacity onPress={handleLeaderboard} activeOpacity={0.7}>
                  <ImageBackground
                    source={buttonV1Source}
                    style={[styles.navButton, compactStyles.navButton]}
                    resizeMode="stretch"
                  >
                    <Text style={[styles.navButtonText, compactStyles.navButtonText]}>PvP Ranks</Text>
                  </ImageBackground>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* TOP CENTER - Points (wide only) */}
          {!isCompact && (
            <View style={styles.topCenter}>
              {!isGuest && (
                <ImageBackground
                  source={yellowBrushSource}
                  style={styles.pointsPanel}
                  resizeMode="stretch"
                >
                  <Text style={styles.pointsLabel}>GAUNTLET POINTS</Text>
                  <Text style={[styles.pointsValue, { color: '#1a1a1a' }]}>0</Text>
                </ImageBackground>
              )}
            </View>
          )}

          {/* TOP RIGHT - Settings (wide) / Gauntlet Points (compact) */}
          <View style={styles.topRight}>
            {isCompact ? (
              !isGuest && (
                <ImageBackground
                  source={yellowBrushSource}
                  style={[styles.pointsPanel, compactStyles.pointsPanel]}
                  resizeMode="stretch"
                >
                  <Text style={[styles.pointsLabel, compactStyles.pointsLabel]}>
                    GAUNTLET POINTS
                  </Text>
                  <Text
                    style={[styles.pointsValue, { color: '#1a1a1a' }, compactStyles.pointsValue]}
                  >
                    0
                  </Text>
                </ImageBackground>
              )
            ) : (
              <TouchableOpacity onPress={() => setShowSettings(true)} activeOpacity={0.7}>
                <ImageBackground
                  source={buttonV1Source}
                  style={styles.settingsBtn}
                  resizeMode="stretch"
                >
                  <Image
                    source={engineImageSource}
                    style={styles.settingsIconImage}
                    resizeMode="contain"
                  />
                </ImageBackground>
              </TouchableOpacity>
            )}
          </View>

          {/* CENTER - Character */}
          <View style={[styles.center, isCompact && compactStyles.center]}>
            <View style={styles.characterContainer}>
              <View style={[styles.characterShadow, isCompact && compactStyles.characterShadow]}>
                <Svg height="100%" width="100%">
                  <Defs>
                    <Pattern
                      id="diagonalLines"
                      patternUnits="userSpaceOnUse"
                      width="4"
                      height="4"
                      patternTransform="rotate(45)"
                    >
                      <Line x1="0" y1="0" x2="0" y2="4" stroke="black" strokeWidth="2" />
                    </Pattern>
                  </Defs>
                  <Ellipse
                    cx={isCompact ? '100' : '50'}
                    cy={isCompact ? '30' : '11'}
                    rx={isCompact ? '95' : '50'}
                    ry={isCompact ? '22' : '11'}
                    fill="url(#diagonalLines)"
                  />
                </Svg>
              </View>
              <Image
                source={defaultMoleImageSource}
                style={[styles.characterImage, isCompact && compactStyles.characterImage]}
                resizeMode="contain"
              />
            </View>
          </View>

          {/* BOTTOM LEFT - Secondary Navigation (wide only) */}
          {!isCompact && (
            <View style={styles.bottomLeft}>
              {!isGuest && (
                <TouchableOpacity onPress={handleQuests} activeOpacity={0.7}>
                  <ImageBackground
                    source={buttonV1Source}
                    style={styles.navButton}
                    resizeMode="stretch"
                  >
                    <Text style={styles.navButtonText}>Quests</Text>
                  </ImageBackground>
                </TouchableOpacity>
              )}

              {!isGuest && (
                <View style={styles.sideBySideRow}>
                  <TouchableOpacity onPress={handleSkins} activeOpacity={0.7}>
                    <ImageBackground
                      source={buttonV1Source}
                      style={styles.navButton}
                      resizeMode="stretch"
                    >
                      <Text style={styles.navButtonText}>Skins</Text>
                    </ImageBackground>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={handleMarketplace} activeOpacity={0.7}>
                    <ImageBackground
                      source={buttonV1Source}
                      style={styles.navButton}
                      resizeMode="stretch"
                    >
                      <Text style={styles.navButtonText}>Marketplace</Text>
                    </ImageBackground>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* BOTTOM RIGHT - Primary Actions */}
          <View style={[styles.bottomRight, isCompact && compactStyles.bottomRight]}>
            {/* PvP Ranks above play buttons - wide only (in compact, it's in left column) */}
            {!isCompact && !isGuest && (
              <TouchableOpacity onPress={handleLeaderboard} activeOpacity={0.7}>
                <ImageBackground
                  source={buttonV1Source}
                  style={styles.shopButton}
                  resizeMode="stretch"
                >
                  <Text style={styles.shopButtonText}>PvP Ranks</Text>
                </ImageBackground>
              </TouchableOpacity>
            )}

            {/* Campaign/Play and PVP — side by side (wide) / stacked (compact) */}
            <View style={[styles.playButtonsRow, isCompact && compactStyles.playButtonsColumn]}>
              <TouchableOpacity onPress={handlePlayPvE} activeOpacity={0.7}>
                <ImageBackground
                  source={buttonV4Source}
                  style={[styles.campaignButton, isCompact && compactStyles.campaignButton]}
                  resizeMode="stretch"
                >
                  <Text
                    style={[
                      styles.campaignButtonText,
                      isCompact && compactStyles.campaignButtonText,
                    ]}
                  >
                    {isGuest ? 'Play' : 'Campaign'}
                  </Text>
                  {isLoading ? (
                    <Skeleton width={50} height={12} style={{ marginTop: 4, marginBottom: 2 }} />
                  ) : (
                    !isGuest && (
                      <Text style={[styles.buttonSub, isCompact && compactStyles.buttonSub]}>
                        {`${(profile?.currentLevel ?? 0) + 1} / ${MAX_CAMPAIGN_LEVEL + 1}`}
                      </Text>
                    )
                  )}
                </ImageBackground>
              </TouchableOpacity>

              {/* PVP button - hidden for guests */}
              {!isGuest && (
                <TouchableOpacity onPress={handlePlayPvP} activeOpacity={0.7}>
                  <ImageBackground
                    source={buttonV2Source}
                    style={[styles.gauntletButton, isCompact && compactStyles.gauntletButton]}
                    resizeMode="stretch"
                  >
                    <Text
                      style={[
                        styles.gauntletButtonText,
                        isCompact && compactStyles.gauntletButtonText,
                      ]}
                    >
                      PVP
                    </Text>
                  </ImageBackground>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Settings Modal */}
      <Modal
        visible={showSettings}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSettings(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowSettings(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <ImageBackground
                source={paperPanelSource}
                style={styles.modalContent}
                resizeMode="stretch"
              >
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Settings</Text>
                  <TouchableOpacity
                    onPress={() => setShowSettings(false)}
                    style={styles.closeButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.closeButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.modalBody}>
                  <View style={styles.settingRow}>
                    <Text style={styles.settingLabel}>Combat speed</Text>
                    <SpeedControls
                      currentSpeed={defaultCombatSpeed}
                      onSpeedChange={updateDefaultCombatSpeed}
                    />
                  </View>

                  <TouchableOpacity
                    style={styles.resetButton}
                    onPress={handleResetProfile}
                    activeOpacity={0.7}
                  >
                    <ImageBackground
                      source={buttonV1Source}
                      style={styles.buttonImage}
                      resizeMode="stretch"
                    >
                      <Text style={styles.disconnectText}>
                        {isGuest ? 'Disconnect' : 'Reset Profile'}
                      </Text>
                    </ImageBackground>
                  </TouchableOpacity>
                </View>
              </ImageBackground>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal
        visible={showResumePrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowResumePrompt(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowResumePrompt(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <ImageBackground
                source={paperPanelSource}
                style={styles.resumeModalContent}
                resizeMode="stretch"
              >
                <Text style={styles.resumeModalTitle}>Resume Session</Text>
                <Text style={styles.resumeModalText}>
                  You have {activeSessions.length} active session
                  {activeSessions.length === 1 ? '' : 's'} waiting. Jump back in or manage them from
                  your list.
                </Text>
                <View style={styles.resumeModalButtons}>
                  <TouchableOpacity
                    style={styles.resumeModalButton}
                    onPress={() => setShowResumePrompt(false)}
                    activeOpacity={0.7}
                  >
                    <ImageBackground
                      source={buttonV1Source}
                      style={styles.resumeModalButtonImage}
                      resizeMode="stretch"
                    >
                      <Text style={styles.resumeModalButtonText}>Later</Text>
                    </ImageBackground>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.resumeModalButton}
                    onPress={() => {
                      setShowResumePrompt(false);
                      navigation.navigate('SessionList');
                    }}
                    activeOpacity={0.7}
                  >
                    <ImageBackground
                      source={buttonV4Source}
                      style={styles.resumeModalButtonImage}
                      resizeMode="stretch"
                    >
                      <Text
                        style={[styles.resumeModalButtonText, styles.resumeModalButtonTextPrimary]}
                      >
                        View Sessions
                      </Text>
                    </ImageBackground>
                  </TouchableOpacity>
                </View>
              </ImageBackground>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Marketplace Modal */}
      <Modal
        visible={showMarketplace}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMarketplace(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowMarketplace(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.marketplaceModal}>
                <ImageBackground
                  source={paperPanelSource}
                  style={styles.marketplaceBg}
                  resizeMode="stretch"
                />
                <View style={styles.marketplaceInner}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Marketplace</Text>
                    <TouchableOpacity
                      onPress={() => setShowMarketplace(false)}
                      style={styles.closeButton}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={styles.closeButtonText}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Tabs */}
                  <View style={styles.marketplaceTabs}>
                    {(['skins', 'items', 'pve'] as const).map((tab) => (
                      <TouchableOpacity
                        key={tab}
                        style={[
                          styles.marketplaceTab,
                          marketplaceTab === tab && styles.marketplaceTabActive,
                        ]}
                        onPress={() => setMarketplaceTab(tab)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.marketplaceTabText,
                            marketplaceTab === tab && styles.marketplaceTabTextActive,
                          ]}
                        >
                          {tab === 'pve' ? 'PvE' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Tab Content */}
                  <View style={styles.marketplaceContent}>
                    {marketplaceTab === 'skins' && (
                      <Text style={styles.comingSoonText}>Coming Soon</Text>
                    )}
                    {marketplaceTab === 'items' && (
                      <Text style={styles.comingSoonText}>Coming Soon</Text>
                    )}
                    {marketplaceTab === 'pve' && (
                      <View style={styles.pveContent}>
                        <View style={styles.sessionBundle}>
                          <Text style={styles.bundleAmount}>20</Text>
                          <Text style={styles.bundleLabel}>Sessions</Text>
                        </View>

                        <View style={styles.bundlePriceRow}>
                          <Text style={styles.bundlePriceLabel}>Price</Text>
                          <Text style={styles.bundlePriceValue}>0.005 SOL</Text>
                        </View>

                        <Text style={styles.bundleCurrent}>Current: {availableRuns} sessions</Text>

                        {purchaseError && (
                          <Text style={styles.purchaseErrorText}>{purchaseError}</Text>
                        )}

                        <TouchableOpacity
                          onPress={handlePurchaseSessions}
                          activeOpacity={0.7}
                          disabled={isPurchasing}
                        >
                          <ImageBackground
                            source={buttonV4Source}
                            style={[styles.purchaseBtn, isPurchasing && { opacity: 0.6 }]}
                            resizeMode="stretch"
                          >
                            {isPurchasing ? (
                              <ActivityIndicator color="#1a1a1a" size="small" />
                            ) : (
                              <Text style={styles.purchaseBtnText}>Purchase</Text>
                            )}
                          </ImageBackground>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Skins Modal */}
      <Modal
        visible={showSkins}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSkins(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowSkins(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.marketplaceModal}>
                <ImageBackground
                  source={paperPanelSource}
                  style={styles.marketplaceBg}
                  resizeMode="stretch"
                />
                <View style={styles.marketplaceInner}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Skins</Text>
                    <TouchableOpacity
                      onPress={() => setShowSkins(false)}
                      style={styles.closeButton}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={styles.closeButtonText}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.marketplaceContent}>
                    <Text style={styles.comingSoonText}>Coming Soon</Text>
                  </View>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Ranks Modal */}
      <Modal
        visible={showRanks}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRanks(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowRanks(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.marketplaceModal}>
                <ImageBackground
                  source={paperPanelSource}
                  style={styles.marketplaceBg}
                  resizeMode="stretch"
                />
                <View style={styles.marketplaceInner}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>PvP Ranks</Text>
                    <TouchableOpacity
                      onPress={() => setShowRanks(false)}
                      style={styles.closeButton}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={styles.closeButtonText}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.marketplaceContent}>
                    <Text style={styles.comingSoonText}>Coming Soon</Text>
                  </View>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Items Modal */}
      <Modal
        visible={showItems}
        transparent
        animationType="fade"
        onRequestClose={() => setShowItems(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowItems(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.itemsModalContainer}>
                <ImageBackground
                  source={paperPanelSource}
                  style={styles.itemsModalBg}
                  resizeMode="stretch"
                >
                  <View style={styles.itemsModalInner}>
                    <View style={styles.itemsModalHeaderRow}>
                      <View style={styles.itemsModalHeaderLeft}>
                        <TouchableOpacity
                          style={[
                            styles.itemsModalSaveButton,
                            (isSavingItemPool ||
                              !hasPoolChanges ||
                              draftPoolIndices.size < ITEM_POOL_MIN_SIZE) &&
                              styles.poolSaveButtonDisabled,
                          ]}
                          disabled={
                            isSavingItemPool ||
                            !hasPoolChanges ||
                            draftPoolIndices.size < ITEM_POOL_MIN_SIZE
                          }
                          onPress={handleSaveItemPool}
                          activeOpacity={0.8}
                        >
                          {isSavingItemPool ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                          ) : (
                            <Text style={styles.poolSaveButtonText}>Save</Text>
                          )}
                        </TouchableOpacity>
                        <Text style={styles.poolCountHeaderText}>
                          Pool: {draftPoolIndices.size} (min {ITEM_POOL_MIN_SIZE})
                        </Text>
                      </View>
                      <View style={styles.itemsModalHeaderCenter}>
                        <Text style={[styles.modalTitle, { fontSize: 28 }]}>Items</Text>
                      </View>
                      <View style={styles.itemsModalHeaderRight}>
                        <TouchableOpacity
                          onPress={() => setShowItems(false)}
                          style={styles.itemsModalCloseButton}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Text style={styles.closeButtonText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Two-column layout */}
                    <View style={styles.itemsModalContent}>
                      {/* Left column - Item grid by tag */}
                      <ScrollView
                        style={styles.itemsListColumn}
                        showsVerticalScrollIndicator={false}
                      >
                        {ALL_TAGS.map((tag) => {
                          const tagItems = getItemsByTag(tag);
                          return (
                            <View key={tag} style={styles.tagSection}>
                              <Text style={[styles.tagHeader, { color: TAG_COLORS[tag] }]}>
                                {TAG_DISPLAY_NAMES[tag]}
                              </Text>
                              <View style={styles.itemsGrid}>
                                {tagItems.map((item) => {
                                  const unlocked = checkItemUnlocked(item.id);
                                  const isSelected = selectedItem?.id === item.id;
                                  const poolIndex = getItemPoolIndex(item.id);
                                  const isInPool =
                                    poolIndex >= 0 && draftPoolIndices.has(poolIndex);
                                  return (
                                    <TouchableOpacity
                                      key={item.id}
                                      style={[
                                        styles.itemGridCell,
                                        isInPool && styles.itemGridCellInPool,
                                        isSelected && styles.itemGridCellSelected,
                                      ]}
                                      onPress={() => setSelectedItem(item)}
                                      activeOpacity={0.7}
                                    >
                                      <ImageBackground
                                        source={require('../../assets/ui/frames/square.png')}
                                        style={styles.itemFrame}
                                        resizeMode="stretch"
                                      >
                                        <Image
                                          source={item.image}
                                          style={[
                                            styles.itemImage,
                                            !unlocked && styles.itemImageLocked,
                                          ]}
                                          resizeMode="contain"
                                        />
                                        {!unlocked && (
                                          <View style={styles.itemLockOverlay}>
                                            <Image
                                              source={lockIconSource}
                                              style={styles.gridLockIcon}
                                              resizeMode="contain"
                                            />
                                          </View>
                                        )}
                                      </ImageBackground>
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                            </View>
                          );
                        })}
                      </ScrollView>

                      {/* Right column - Item details sidebar */}
                      <View style={styles.itemDetailsColumn}>
                        {selectedItem && (
                          <>
                            {!checkItemUnlocked(selectedItem.id) && (
                              <View style={styles.lockedBanner}>
                                <Image
                                  source={lockIconSource}
                                  style={styles.lockedBannerIcon}
                                  resizeMode="contain"
                                />
                                <Text style={styles.lockedBannerText}>LOCKED</Text>
                              </View>
                            )}

                            <View style={styles.selectedItemHeader}>
                              <Image
                                source={selectedItem.image}
                                style={styles.selectedItemImage}
                                resizeMode="contain"
                              />
                              <Text style={styles.selectedItemName}>{selectedItem.name}</Text>
                              <View
                                style={[
                                  styles.rarityBadge,
                                  { backgroundColor: RARITY_COLORS[selectedItem.rarity] },
                                ]}
                              >
                                <Text style={styles.rarityText}>
                                  {selectedItem.rarity.toUpperCase()}
                                </Text>
                              </View>
                              {checkItemUnlocked(selectedItem.id) && selectedItemPoolIndex >= 0 && (
                                <>
                                  <Text
                                    style={[
                                      styles.poolMembershipText,
                                      selectedItemInPool
                                        ? styles.poolMembershipTextIn
                                        : styles.poolMembershipTextOut,
                                    ]}
                                  >
                                    {selectedItemInPool ? 'IN POOL' : 'NOT IN POOL'}
                                  </Text>
                                  <TouchableOpacity
                                    onPress={() => togglePoolItem(selectedItem)}
                                    style={[
                                      styles.poolToggleButton,
                                      selectedItemInPool
                                        ? styles.poolToggleButtonRemove
                                        : styles.poolToggleButtonAdd,
                                      !canRemoveSelectedItem && styles.poolToggleButtonDisabled,
                                    ]}
                                    disabled={!canRemoveSelectedItem}
                                    activeOpacity={0.8}
                                  >
                                    <Text style={styles.poolToggleButtonText}>
                                      {selectedItemInPool ? 'Remove from Pool' : 'Add to Pool'}
                                    </Text>
                                  </TouchableOpacity>
                                </>
                              )}
                            </View>

                            <ScrollView
                              style={styles.itemDescriptionScroll}
                              showsVerticalScrollIndicator={false}
                            >
                              {(selectedItem.effect?.description ||
                                ITEM_DESCRIPTIONS[selectedItem.name]) && (
                                <Text style={styles.itemDescription}>
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
                                  <Text style={styles.statsHeader}>Stats</Text>
                                  {selectedItem.stats.atk !== undefined && (
                                    <View style={styles.statRow}>
                                      <Text style={styles.statLabel}>ATK</Text>
                                      <Text style={styles.statValue}>
                                        +{selectedItem.stats.atk}
                                      </Text>
                                    </View>
                                  )}
                                  {selectedItem.stats.arm !== undefined && (
                                    <View style={styles.statRow}>
                                      <Text style={styles.statLabel}>ARM</Text>
                                      <Text style={styles.statValue}>
                                        +{selectedItem.stats.arm}
                                      </Text>
                                    </View>
                                  )}
                                  {selectedItem.stats.spd !== undefined && (
                                    <View style={styles.statRow}>
                                      <Text style={styles.statLabel}>SPD</Text>
                                      <Text style={styles.statValue}>
                                        +{selectedItem.stats.spd}
                                      </Text>
                                    </View>
                                  )}
                                  {selectedItem.stats.dig !== undefined && (
                                    <View style={styles.statRow}>
                                      <Text style={styles.statLabel}>DIG</Text>
                                      <Text style={styles.statValue}>
                                        +{selectedItem.stats.dig}
                                      </Text>
                                    </View>
                                  )}
                                  {selectedItem.stats.hp !== undefined && (
                                    <View style={styles.statRow}>
                                      <Text style={styles.statLabel}>HP</Text>
                                      <Text style={styles.statValue}>+{selectedItem.stats.hp}</Text>
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
                </ImageBackground>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Quests Modal */}
      <Modal
        visible={showQuests}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQuests(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowQuests(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.marketplaceModal}>
                <ImageBackground
                  source={paperPanelSource}
                  style={styles.marketplaceBg}
                  resizeMode="stretch"
                />
                <View style={styles.marketplaceInner}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Quests</Text>
                    <TouchableOpacity
                      onPress={() => setShowQuests(false)}
                      style={styles.closeButton}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={styles.closeButtonText}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.marketplaceContent}>
                    <Text style={styles.comingSoonText}>Coming Soon</Text>
                  </View>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* PvP Modal */}
      <Modal
        visible={showPvP}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPvP(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowPvP(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <ImageBackground
                source={paperPanelSource}
                style={styles.pvpModalContent}
                resizeMode="stretch"
              >
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>PvP</Text>
                  <TouchableOpacity
                    onPress={() => setShowPvP(false)}
                    style={styles.closeButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.closeButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ gap: 12 }}>
                  <TouchableOpacity onPress={handleGauntlet} activeOpacity={0.7}>
                    <ImageBackground
                      source={buttonV2Source}
                      style={styles.pvpModeButton}
                      resizeMode="stretch"
                    >
                      <Text style={styles.pvpModeButtonText}>Gauntlet</Text>
                    </ImageBackground>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={handleDuels} activeOpacity={0.7}>
                    <ImageBackground
                      source={buttonV2Source}
                      style={styles.pvpModeButton}
                      resizeMode="stretch"
                    >
                      <Text style={styles.pvpModeButtonText}>Duels</Text>
                    </ImageBackground>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={handlePitDraft} activeOpacity={0.7}>
                    <ImageBackground
                      source={buttonV2Source}
                      style={styles.pvpModeButton}
                      resizeMode="stretch"
                    >
                      <Text style={styles.pvpModeButtonText}>Pit Draft</Text>
                    </ImageBackground>
                  </TouchableOpacity>
                </View>
              </ImageBackground>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  safeArea: {
    flex: 1,
  },
  hubLayout: {
    flex: 1,
    position: 'relative',
  },

  // TOP LEFT - Player Info
  topLeft: {
    position: 'absolute',
    top: 24,
    left: 24,
    zIndex: 10,
    alignItems: 'flex-start',
  },
  profileCardWrapper: {
    marginTop: 8,
  },
  playerPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 4,
    width: 160, // (46 height * 2.6 ratio)
    height: 53,
    ...(Platform.OS === 'web' ? { width: 160, height: 53 } : {}),
  },
  avatarContainer: {
    width: 40.5,
    height: 39,
    borderRadius: 2,
    overflow: 'hidden',
    marginLeft: 3.5,
    marginRight: 10,
    justifyContent: 'flex-start',
  },
  avatarImage: {
    width: '165%', // Zoom in
    height: '160%',
    position: 'absolute',
    top: 0, // Align to top to show head
    left: '-35%', // Center horizontally (160 - 100) / 2
    resizeMode: 'cover',
  },
  playerInfo: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: 8,
    gap: 0,
  },
  playerName: {
    fontFamily: Typography.header,
    fontSize: 14,
    color: '#888888',
    lineHeight: 16,
  },
  walletAddress: {
    fontFamily: Typography.number,
    fontSize: 11,
    color: '#888888',
    fontWeight: 'bold',
    lineHeight: 12,
  },

  // TOP CENTER - Points
  topCenter: {
    position: 'absolute',
    top: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  pointsPanel: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    width: 180,
    height: 53,
  },
  pointsLabel: {
    fontFamily: Typography.header,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  pointsValue: {
    fontFamily: Typography.number,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#c8c8c8',
  },

  // TOP RIGHT - Settings
  topRight: {
    position: 'absolute',
    top: 24,
    right: 24,
    zIndex: 10,
  },
  settingsBtn: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsIconImage: {
    width: 30,
    height: 30,
    marginBottom: 4,
  },

  // CENTER - Character
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  characterContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  characterImage: {
    width: 175,
    height: 175,
    marginTop: 40,
    zIndex: 1, // Ensure image is above shadow
  },
  characterShadow: {
    position: 'absolute',
    bottom: 0, // Adjusted to sit under the feet
    left: 27,
    width: 100,
    height: 22,
    opacity: 0.6,
    zIndex: 0,
  },
  character: {
    fontSize: 80,
  },

  // BOTTOM LEFT - Secondary Navigation
  bottomLeft: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    gap: 8,
    zIndex: 10,
    alignItems: 'flex-start',
  },
  navButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: 120,
    height: 48,
  },
  navButtonText: {
    fontFamily: Typography.button,
    fontSize: 14,
    marginBottom: 4,
  },
  navButtonTextWarning: {
    color: '#a33a3a',
  },
  sideBySideRow: {
    flexDirection: 'row',
    gap: 8,
  },

  // BOTTOM RIGHT - Primary Actions
  bottomRight: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    alignItems: 'flex-end',
    gap: 8,
    zIndex: 10,
  },
  shopButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: 130,
    height: 45,
  },
  shopButtonText: {
    fontFamily: Typography.button,
    fontSize: 14,
    marginBottom: 4,
  },
  playButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  campaignButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: 135,
    height: 68,
  },
  campaignButtonText: {
    fontFamily: Typography.button,
    fontSize: 16,
  },
  buttonSub: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#555555',
    marginTop: 2,
    marginBottom: 4,
  },
  gauntletButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: 135,
    height: 68,
  },
  gauntletButtonText: {
    fontFamily: Typography.button,
    fontSize: 22,
    color: '#a33a3a',
    marginBottom: 6,
  },

  // MODAL
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: 340,
    height: 340,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  modalHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  modalTitle: {
    fontFamily: Typography.header,
    fontSize: 28,
    marginTop: 8,
    color: '#3d2b1f',
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    right: -10,
    top: -5,
    padding: 10,
  },
  closeButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#5c4033',
  },
  modalBody: {
    width: '100%',
    alignItems: 'center',
    gap: 30,
  },
  resumeModalContent: {
    width: 320,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumeModalTitle: {
    fontFamily: Typography.header,
    fontSize: 24,
    color: '#3d2b1f',
    textAlign: 'center',
    marginBottom: 12,
  },
  resumeModalText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#5c4033',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  resumeModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  resumeModalButton: {
    width: 140,
    height: 44,
  },
  resumeModalButtonImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resumeModalButtonText: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#3d2b1f',
  },
  resumeModalButtonTextPrimary: {
    color: '#ffffff',
  },
  settingRow: {
    alignItems: 'center',
    gap: 12,
  },
  settingLabel: {
    fontFamily: Typography.header,
    fontSize: 20,
    color: '#3d2b1f',
    marginBottom: 2,
  },
  resetButton: {
    width: 180,
    height: 48,
    marginTop: 10,
  },
  buttonImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disconnectText: {
    fontFamily: Typography.button,
    fontSize: 18,
    color: '#a33a3a',
  },

  // MARKETPLACE MODAL
  marketplaceModal: {
    width: 431,
    height: 380,
    position: 'relative',
    overflow: 'hidden',
  },
  marketplaceBg: {
    position: 'absolute',
    top: (380 - 453) / 2,
    left: (431 - 380) / 2,
    width: 380,
    height: 453,
    transform: [{ rotate: '90deg' }],
  },
  marketplaceInner: {
    flex: 1,
    padding: 36,
    paddingTop: 24,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  marketplaceTabs: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  marketplaceTab: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  marketplaceTabActive: {
    borderBottomColor: '#3d2b1f',
  },
  marketplaceTabText: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#8a7a6a',
  },
  marketplaceTabTextActive: {
    color: '#3d2b1f',
  },
  marketplaceContent: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  comingSoonText: {
    fontFamily: Typography.header,
    fontSize: 22,
    color: '#8a7a6a',
  },
  pveContent: {
    width: '100%',
    alignItems: 'center',
    gap: 10,
  },
  sessionBundle: {
    alignItems: 'center',
    marginBottom: 4,
  },
  bundleAmount: {
    fontFamily: Typography.number,
    fontSize: 48,
    fontWeight: 'bold',
    color: '#3d2b1f',
  },
  bundleLabel: {
    fontFamily: Typography.body,
    fontSize: 16,
    color: '#5c4033',
    marginTop: -4,
  },
  bundlePriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '80%',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#c4a882',
  },
  bundlePriceLabel: {
    fontFamily: Typography.body,
    fontSize: 15,
    color: '#8a7a6a',
  },
  bundlePriceValue: {
    fontFamily: Typography.number,
    fontSize: 15,
    fontWeight: 'bold',
    color: '#3d2b1f',
  },
  bundleCurrent: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: '#8a7a6a',
  },
  purchaseErrorText: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#a33a3a',
    textAlign: 'center',
  },
  purchaseBtn: {
    width: 140,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  purchaseBtnText: {
    fontFamily: Typography.button,
    fontSize: 16,
    color: '#1a1a1a',
    marginBottom: 4,
  },

  // ITEMS MODAL STYLES
  itemsModalContainer: {
    width: '80%',
    maxWidth: 850,
    height: '90%',
    maxHeight: 600,
    position: 'relative',
    overflow: 'hidden',
  },
  itemsModalBg: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  itemsModalInner: {
    flex: 1,
    padding: 24,
    paddingTop: 16,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  itemsModalHeaderRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  itemsModalHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemsModalHeaderCenter: {
    flex: 1,
    alignItems: 'center',
  },
  itemsModalHeaderRight: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  itemsModalCloseButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemsModalSaveButton: {
    minWidth: 70,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#16a34a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemsModalContent: {
    flex: 1,
    flexDirection: 'row',
    width: '100%',
    gap: 16,
    marginTop: 4,
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
    gap: 8,
    width: 290, // 5 items * 50px + 4 gaps * 8px = 250 + 32 = 282px
  },
  itemGridCell: {
    width: 50,
    height: 50,
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
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  itemImage: {
    width: 40,
    height: 40,
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
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
    padding: 8, // Reduced padding
    alignItems: 'center',
    position: 'relative', // Enable absolute positioning for children
  },
  poolCountHeaderText: {
    fontFamily: Typography.header,
    fontSize: 11,
    color: '#3d2b1f',
    textAlign: 'left',
  },
  poolSaveButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  poolSaveButtonText: {
    fontFamily: Typography.button,
    fontSize: 11,
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  selectedItemHeader: {
    alignItems: 'center',
    marginBottom: 6, // Reduced margin
    marginTop: 12, // Add some top margin since locked banner is moved
  },
  selectedItemImage: {
    width: 60, // Reduced from 80
    height: 60, // Reduced from 80
    marginBottom: 4, // Reduced margin
  },
  selectedItemName: {
    fontFamily: Typography.header,
    fontSize: 14, // Reduced from 16
    color: '#3d2b1f',
    textAlign: 'center',
    marginBottom: 4, // Reduced margin
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
  poolMembershipText: {
    marginTop: 6,
    fontFamily: Typography.button,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  poolMembershipTextIn: {
    color: '#166534',
  },
  poolMembershipTextOut: {
    color: '#7f1d1d',
  },
  poolToggleButton: {
    marginTop: 6,
    paddingHorizontal: 12,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  poolToggleButtonAdd: {
    backgroundColor: '#15803d',
  },
  poolToggleButtonRemove: {
    backgroundColor: '#b91c1c',
  },
  poolToggleButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  poolToggleButtonText: {
    fontFamily: Typography.button,
    fontSize: 11,
    color: '#ffffff',
  },
  lockedBanner: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(163, 58, 58, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
    gap: 4,
    zIndex: 10,
  },
  lockedBannerIcon: {
    width: 10,
    height: 10,
  },
  lockedBannerText: {
    fontFamily: Typography.body,
    fontSize: 10,
    color: '#a33a3a',
    fontWeight: 'bold',
  },
  itemDescriptionScroll: {
    flex: 1,
    width: '100%',
  },
  itemDescription: {
    fontFamily: Typography.body,
    fontSize: 11, // Reduced from 12
    color: '#5c4033',
    lineHeight: 14, // Reduced from 16
    textAlign: 'center',
    marginBottom: 8, // Reduced from 12
  },
  statsContainer: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 6,
    padding: 8, // Reduced from 10
  },
  statsHeader: {
    fontFamily: Typography.header,
    fontSize: 11, // Reduced from 12
    color: '#3d2b1f',
    marginBottom: 4, // Reduced from 8
    textAlign: 'center',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2, // Reduced from 3
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

  // PVP MODAL STYLES
  pvpModalContent: {
    width: 340,
    height: 340,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  pvpModeButton: {
    width: 135,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pvpModeButtonText: {
    fontFamily: Typography.button,
    fontSize: 18,
    color: '#a33a3a',
    marginBottom: 6,
  },
});

const compactStyles = StyleSheet.create({
  // Left column spans full height in compact mode
  leftColumn: {
    top: 28,
    left: 28,
    bottom: 28,
    justifyContent: 'flex-start',
  },
  // Centered button group below profile
  leftButtonsCenter: {
    flex: 1,
    justifyContent: 'center',
    gap: 14,
  },
  playerPanel: {
    width: 440,
    height: 140,
    paddingLeft: 10,
  },
  avatarContainer: {
    width: 112,
    height: 102,
    marginLeft: 10,
    marginRight: 18,
  },
  avatarImage: {
    width: 180,
    height: 170,
    left: -38,
  },
  playerName: {
    fontSize: 34,
    lineHeight: 38,
  },
  walletAddress: {
    fontSize: 24,
    lineHeight: 26,
  },
  navButton: {
    width: 300,
    height: 96,
  },
  navButtonText: {
    fontSize: 30,
    marginBottom: 8,
  },
  // Gauntlet points in top right for compact
  pointsPanel: {
    width: 360,
    height: 110,
  },
  pointsLabel: {
    fontSize: 20,
    letterSpacing: 1,
  },
  pointsValue: {
    fontSize: 40,
  },
  // Character shifts right and down to accommodate left column
  center: {
    marginLeft: 370,
    marginTop: 160,
  },
  characterImage: {
    width: 330,
    height: 330,
  },
  characterShadow: {
    left: 40,
    bottom: -10,
    width: 240,
    height: 60,
    overflow: 'visible',
  },
  // Bottom right — stacked vertically
  bottomRight: {
    bottom: 28,
    right: 28,
  },
  playButtonsColumn: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  campaignButton: {
    width: 280,
    height: 130,
  },
  campaignButtonText: {
    fontSize: 34,
  },
  buttonSub: {
    fontSize: 18,
    marginTop: 4,
  },
  gauntletButton: {
    width: 280,
    height: 130,
  },
  gauntletButtonText: {
    fontSize: 44,
    marginBottom: 10,
  },
});
