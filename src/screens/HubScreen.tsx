import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ImageBackground,
  Platform,
  TouchableWithoutFeedback,
  ScrollView,
  RefreshControl,
  Animated,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import Svg, { Ellipse, Defs, Pattern, Line } from 'react-native-svg';
import { useProfile } from '../contexts/ProfileContext';
import { useSession } from '../contexts/SessionContext';
import { useGame, GamePhase } from '../contexts/GameContext';
import { shortenAddress } from '../utils/storage';
import { RootStackParamList } from '../navigation';
import { InlineModal } from '../components/InlineModal';
import { SpeedControls } from '../components/combat';
import { Skeleton } from '../components/common/Skeleton';
import { Typography } from '../theme/typography';
import type { CombatSpeed } from '../types';
import { useScreenVariant } from '../contexts/ScreenVariantContext';
import { MAX_CAMPAIGN_LEVEL } from '../hooks/useMapGenerator';
import { useControllerAction } from '../hooks/useControllerAction';
import { ControllerHints, type ButtonHint } from '../components/ui/ControllerHints';
import { useInputMode } from '../hooks/useInputMode';
import { FocusGlow } from '../components/ui/FocusGlow';
import { ControllerKeyboard } from '../components/ui/ControllerKeyboard';
import { getVrfSeed } from '../services/solana/vrf';

const iconASource = require('../../assets/ui/control-buttons/a.png');
const iconBSource = require('../../assets/ui/control-buttons/b.png');
const iconDirSource = require('../../assets/ui/control-buttons/direction.png');
const defaultMoleImageSource = require('../../assets/entities/characters/default-mole.png');
const backgroundImageCompact = require('../../assets/ui/backgrounds/hub-background-compact.png');
const backgroundImageWide = require('../../assets/ui/backgrounds/hub-background-wide.png');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.png');
const buttonV2Source = require('../../assets/ui/buttons/button-v2.png');
const buttonV3Source = require('../../assets/ui/buttons/button-v3.png');
const buttonV4Source = require('../../assets/ui/buttons/button-v4.png');
const paperPanelSource = require('../../assets/ui/panels/paper-panel.png');
const yellowBrushSource = require('../../assets/ui/illustrations/yellow-brush.png');
const pvpPanelSource = require('../../assets/ui/panels/pvp-panel.png');
const gauntletPaperSource = require('../../assets/ui/illustrations/gauntlet-paper.png');
const duelsPaperSource = require('../../assets/ui/illustrations/duels-paper.png');
const pitDraftPaperSource = require('../../assets/ui/illustrations/pit-draft-paper.png');
const engineImageSource = require('../../assets/ui/illustrations/engine.png');
const walletImageSource = require('../../assets/ui/illustrations/wallet.png');

type HubScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Hub'>;
};

export function HubScreen({ navigation }: HubScreenProps) {
  const {
    profile,
    isLoading,
    clearProfile,
    updateName,
    updateDefaultCombatSpeed,
    refresh,
    mode,
    defaultCombatSpeed,
  } = useProfile();
  const isGuest = mode === 'guest';
  const isScreenFocused = useIsFocused();
  const screenVariant = useScreenVariant();
  const isCompact = screenVariant === 'compact';
  const inputMode = useInputMode();
  const { state: gameState, dispatch } = useGame();
  const [showSettings, setShowSettings] = useState(false);
  const [showSkins, setShowSkins] = useState(false);
  const [showRanks, setShowRanks] = useState(false);
  const [showQuests, setShowQuests] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showPvP, setShowPvP] = useState(false);
  const [pvpFocus, setPvpFocus] = useState(0);
  const [profileName, setProfileName] = useState(profile?.name ?? '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileValidationError, setProfileValidationError] = useState<string | null>(null);
  const [profileSuccessMessage, setProfileSuccessMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [focus, setFocus] = useState<{ group: 'left' | 'right'; index: number }>({
    group: 'right',
    index: 0,
  });
  const [settingsFocus, setSettingsFocus] = useState(0); // 0 = speed, 1 = reset
  const [profileFocus, setProfileFocus] = useState(0); // 0 = name, 1 = save
  const [showProfileKeyboard, setShowProfileKeyboard] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

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
      // Guest mode: Start game directly with secure/VRF-backed seed
      const seed = await getVrfSeed();

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
    setPvpFocus(0);
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
    navigation.navigate('Marketplace');
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

  const handleItems = () => {
    navigation.navigate('Items');
  };

  const handleProfileSettings = () => {
    setProfileName(profile?.name ?? '');
    setProfileValidationError(null);
    setProfileSuccessMessage(null);
    setShowProfile(true);
  };

  const NAME_MAX_LENGTH = 32;

  const handleProfileNameChange = useCallback((value: string) => {
    setProfileName(value);
    setProfileSuccessMessage(null);
    if (!value.trim()) {
      setProfileValidationError('Name is required');
    } else if (value.length > NAME_MAX_LENGTH) {
      setProfileValidationError(`Name must be ${NAME_MAX_LENGTH} characters or less`);
    } else {
      setProfileValidationError(null);
    }
  }, []);

  const handleProfileSave = useCallback(async () => {
    if (!profileName.trim()) {
      setProfileValidationError('Name is required');
      return;
    }
    if (profileName === profile?.name) {
      setProfileSuccessMessage('Name unchanged');
      return;
    }
    setProfileSaving(true);
    setProfileSuccessMessage(null);
    try {
      const result = await updateName(profileName);
      if (result.success) {
        setProfileSuccessMessage('Name updated!');
      } else {
        setProfileValidationError(result.error ?? 'Failed to update name');
      }
    } finally {
      setProfileSaving(false);
    }
  }, [profileName, profile?.name, updateName]);

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const isProfileSaveDisabled = profileSaving || isLoading || !!profileValidationError || profileName === profile?.name;

  // --- Controller navigation ---
  const anyModalOpen =
    showSettings || showProfile || showSkins || showRanks || showQuests || showPvP;
  const isController = inputMode === 'controller';

  const controllerCloseHint = isController ? (
    <View style={[styles.controllerCloseHint, isCompact && compactStyles.controllerCloseHint]}>
      <Image
        source={iconBSource}
        style={{ width: isCompact ? 40 : 18, height: isCompact ? 40 : 18 }}
        resizeMode="contain"
      />
      <Text style={[styles.controllerCloseHintText, isCompact && compactStyles.controllerCloseHintText]}>
        Close
      </Text>
    </View>
  ) : null;

  const isFocused = (group: 'left' | 'right', index: number) =>
    inputMode === 'controller' && !anyModalOpen && focus.group === group && focus.index === index;

  const leftCount = isGuest ? 0 : 5;
  const rightCount = isGuest ? 1 : 2;

  const handleControllerA = () => {
    if (focus.group === 'left') {
      [handleItems, handleQuests, handleSkins, handleMarketplace, handleLeaderboard][focus.index]?.();
    } else {
      [handlePlayPvE, handlePlayPvP][focus.index]?.();
    }
  };

  const closeAnyModal = () => {
    if (showPvP) setShowPvP(false);
    else if (showSettings) setShowSettings(false);
    else if (showProfile) setShowProfile(false);
    else if (showSkins) setShowSkins(false);
    else if (showRanks) setShowRanks(false);
    else if (showQuests) setShowQuests(false);
  };

  // Settings modal: cycle combat speed with Left/Right
  const SPEED_ORDER: CombatSpeed[] = ['paused', 'normal', 'fast'];
  const cycleSpeed = (dir: -1 | 1) => {
    const idx = SPEED_ORDER.indexOf(defaultCombatSpeed);
    const next = SPEED_ORDER[Math.max(0, Math.min(SPEED_ORDER.length - 1, idx + dir))];
    if (next) updateDefaultCombatSpeed(next);
  };

  // Build controller actions based on which modal is open
  const settingsActions = showSettings
    ? {
        onA: settingsFocus === 1 ? handleResetProfile : undefined,
        onB: closeAnyModal,
        onDPadUp: () => setSettingsFocus((p) => Math.max(0, p - 1)),
        onDPadDown: () => setSettingsFocus((p) => Math.min(1, p + 1)),
        onDPadLeft: settingsFocus === 0 ? () => cycleSpeed(-1) : undefined,
        onDPadRight: settingsFocus === 0 ? () => cycleSpeed(1) : undefined,
      }
    : null;

  const profileActions = showProfile && !showProfileKeyboard
    ? {
        onA:
          profileFocus === 0
            ? () => setShowProfileKeyboard(true)
            : !isProfileSaveDisabled
              ? handleProfileSave
              : undefined,
        onB: closeAnyModal,
        onDPadUp: () => setProfileFocus((p) => Math.max(0, p - 1)),
        onDPadDown: () => setProfileFocus((p) => Math.min(1, p + 1)),
      }
    : null;

  const pvpActions = showPvP
    ? {
        onA: () => [handleGauntlet, handleDuels, handlePitDraft][pvpFocus]?.(),
        onB: () => setShowPvP(false),
        onDPadUp: () => setPvpFocus((p) => Math.max(0, p - 1)),
        onDPadDown: () => setPvpFocus((p) => Math.min(2, p + 1)),
      }
    : null;

  const otherModalOpen = anyModalOpen && !showSettings && !showProfile && !showPvP;

  useControllerAction(
    settingsActions ?? profileActions ?? pvpActions ?? {
      onA: otherModalOpen ? undefined : handleControllerA,
      onB: otherModalOpen ? closeAnyModal : undefined,
      onDPadUp: otherModalOpen
        ? undefined
        : () => setFocus((p) => (p.index > 0 ? { ...p, index: p.index - 1 } : p)),
      onDPadDown: otherModalOpen
        ? undefined
        : () =>
            setFocus((p) => {
              const max = (p.group === 'left' ? leftCount : rightCount) - 1;
              return p.index < max ? { ...p, index: p.index + 1 } : p;
            }),
      onDPadLeft: otherModalOpen
        ? undefined
        : () =>
            setFocus((p) =>
              p.group === 'right' && leftCount > 0
                ? { group: 'left', index: Math.min(p.index, leftCount - 1) }
                : p
            ),
      onDPadRight: otherModalOpen
        ? undefined
        : () =>
            setFocus((p) =>
              p.group === 'left'
                ? { group: 'right', index: Math.min(p.index, rightCount - 1) }
                : p
            ),
      onStart: otherModalOpen ? undefined : () => { setSettingsFocus(0); setShowSettings(true); },
      onSelect: otherModalOpen ? undefined : () => { setProfileFocus(0); handleProfileSettings(); },
    },
    !showProfileKeyboard && isScreenFocused
  );

  const controllerHints: ButtonHint[] = anyModalOpen
    ? []
    : [
        { button: 'A', label: 'Select' },
        { button: 'Start', label: 'Settings' },
        { button: 'Select', label: 'Profile' },
        { button: 'DPad', label: 'Navigate' },
      ];

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
              onPress={handleProfileSettings}
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
                <FocusGlow active={isFocused('left', 0)}>
                  <TouchableOpacity onPress={handleItems} activeOpacity={0.7}>
                    <ImageBackground
                      source={buttonV1Source}
                      style={[styles.navButton, compactStyles.navButton]}
                      resizeMode="stretch"
                    >
                      <Text style={[styles.navButtonText, compactStyles.navButtonText]}>Items</Text>
                    </ImageBackground>
                  </TouchableOpacity>
                </FocusGlow>

                <FocusGlow active={isFocused('left', 1)}>
                  <TouchableOpacity onPress={handleQuests} activeOpacity={0.7}>
                    <ImageBackground
                      source={buttonV1Source}
                      style={[styles.navButton, compactStyles.navButton]}
                      resizeMode="stretch"
                    >
                      <Text style={[styles.navButtonText, compactStyles.navButtonText]}>Quests</Text>
                    </ImageBackground>
                  </TouchableOpacity>
                </FocusGlow>

                <FocusGlow active={isFocused('left', 2)}>
                  <TouchableOpacity onPress={handleSkins} activeOpacity={0.7}>
                    <ImageBackground
                      source={buttonV1Source}
                      style={[styles.navButton, compactStyles.navButton]}
                      resizeMode="stretch"
                    >
                      <Text style={[styles.navButtonText, compactStyles.navButtonText]}>Skins</Text>
                    </ImageBackground>
                  </TouchableOpacity>
                </FocusGlow>

                <FocusGlow active={isFocused('left', 3)}>
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
                </FocusGlow>

                <FocusGlow active={isFocused('left', 4)}>
                  <TouchableOpacity onPress={handleLeaderboard} activeOpacity={0.7}>
                    <ImageBackground
                      source={buttonV1Source}
                      style={[styles.navButton, compactStyles.navButton]}
                      resizeMode="stretch"
                    >
                      <Text style={[styles.navButtonText, compactStyles.navButtonText]}>PvP Ranks</Text>
                    </ImageBackground>
                  </TouchableOpacity>
                </FocusGlow>

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
              <FocusGlow active={isFocused('right', 0)}>
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
              </FocusGlow>

              {/* PVP button - hidden for guests */}
              {!isGuest && (
                <FocusGlow active={isFocused('right', 1)}>
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
                </FocusGlow>
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Settings Modal */}
      <InlineModal
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
                style={[styles.modalContent, isCompact && compactStyles.settingsModalContent]}
                resizeMode="stretch"
              >
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, isCompact && compactStyles.modalTitle]}>Settings</Text>
                  {!isController && (
                    <TouchableOpacity
                      onPress={() => setShowSettings(false)}
                      style={styles.closeButton}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={[styles.closeButtonText, isCompact && compactStyles.closeButtonText]}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={[styles.modalBody, isCompact && compactStyles.settingsModalBody]}>
                  <FocusGlow active={isController && showSettings && settingsFocus === 0}>
                    <View style={styles.settingRow}>
                      <Text style={[styles.settingLabel, isCompact && compactStyles.settingLabel]}>Combat speed</Text>
                      <SpeedControls
                        currentSpeed={defaultCombatSpeed}
                        onSpeedChange={updateDefaultCombatSpeed}
                        scale={isCompact ? 2 : 1}
                      />
                    </View>
                  </FocusGlow>

                  <FocusGlow active={isController && showSettings && settingsFocus === 1}>
                    <TouchableOpacity
                      style={[styles.resetButton, isCompact && compactStyles.resetButton]}
                      onPress={handleResetProfile}
                      activeOpacity={0.7}
                    >
                      <ImageBackground
                        source={buttonV1Source}
                        style={styles.buttonImage}
                        resizeMode="stretch"
                      >
                        <Text style={[styles.disconnectText, isCompact && compactStyles.disconnectText]}>
                          {isGuest ? 'Disconnect' : 'Reset Profile'}
                        </Text>
                      </ImageBackground>
                    </TouchableOpacity>
                  </FocusGlow>
                </View>
                {isController && (
                  <View style={[styles.settingsHints, isCompact && compactStyles.settingsHints]}>
                    {settingsFocus === 0 ? (
                      <View style={styles.settingsHintRow}>
                        <Image source={iconDirSource} style={[styles.settingsHintIcon, isCompact && compactStyles.settingsHintIcon, { transform: [{ rotate: '-90deg' }] }]} resizeMode="contain" />
                        <Image source={iconDirSource} style={[styles.settingsHintIcon, isCompact && compactStyles.settingsHintIcon, { transform: [{ rotate: '90deg' }] }]} resizeMode="contain" />
                        <Text style={[styles.settingsHintText, isCompact && compactStyles.settingsHintText]}>Change speed</Text>
                      </View>
                    ) : (
                      <View style={styles.settingsHintRow}>
                        <Image source={iconASource} style={[styles.settingsHintIcon, isCompact && compactStyles.settingsHintIcon]} resizeMode="contain" />
                        <Text style={[styles.settingsHintText, isCompact && compactStyles.settingsHintText]}>Confirm</Text>
                      </View>
                    )}
                    <View style={styles.settingsHintRow}>
                      <Image source={iconBSource} style={[styles.settingsHintIcon, isCompact && compactStyles.settingsHintIcon]} resizeMode="contain" />
                      <Text style={[styles.settingsHintText, isCompact && compactStyles.settingsHintText]}>Close</Text>
                    </View>
                  </View>
                )}
              </ImageBackground>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </InlineModal>

      {/* Skins Modal */}
      <InlineModal
        visible={showSkins}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSkins(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowSkins(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={[styles.marketplaceModal, isCompact && compactStyles.marketplaceModal]}>
                <ImageBackground
                  source={paperPanelSource}
                  style={[styles.marketplaceBg, isCompact && compactStyles.marketplaceBg]}
                  resizeMode="stretch"
                />
                <View style={[styles.marketplaceInner, isCompact && compactStyles.marketplaceInner]}>
                  <View style={styles.modalHeader}>
                    <Text style={[styles.modalTitle, isCompact && compactStyles.modalTitle]}>Skins</Text>
                    {!isController && (
                      <TouchableOpacity
                        onPress={() => setShowSkins(false)}
                        style={styles.closeButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Text style={[styles.closeButtonText, isCompact && compactStyles.closeButtonText]}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={styles.marketplaceContent}>
                    <Text style={[styles.comingSoonText, isCompact && compactStyles.comingSoonText]}>Coming Soon</Text>
                  </View>
                  {controllerCloseHint}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </InlineModal>

      {/* Ranks Modal */}
      <InlineModal
        visible={showRanks}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRanks(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowRanks(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={[styles.marketplaceModal, isCompact && compactStyles.marketplaceModal]}>
                <ImageBackground
                  source={paperPanelSource}
                  style={[styles.marketplaceBg, isCompact && compactStyles.marketplaceBg]}
                  resizeMode="stretch"
                />
                <View style={[styles.marketplaceInner, isCompact && compactStyles.marketplaceInner]}>
                  <View style={styles.modalHeader}>
                    <Text style={[styles.modalTitle, isCompact && compactStyles.modalTitle]}>PvP Ranks</Text>
                    {!isController && (
                      <TouchableOpacity
                        onPress={() => setShowRanks(false)}
                        style={styles.closeButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Text style={[styles.closeButtonText, isCompact && compactStyles.closeButtonText]}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={styles.marketplaceContent}>
                    <Text style={[styles.comingSoonText, isCompact && compactStyles.comingSoonText]}>Coming Soon</Text>
                  </View>
                  {controllerCloseHint}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </InlineModal>

      {/* Quests Modal */}
      <InlineModal
        visible={showQuests}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQuests(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowQuests(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={[styles.marketplaceModal, isCompact && compactStyles.marketplaceModal]}>
                <ImageBackground
                  source={paperPanelSource}
                  style={[styles.marketplaceBg, isCompact && compactStyles.marketplaceBg]}
                  resizeMode="stretch"
                />
                <View style={[styles.marketplaceInner, isCompact && compactStyles.marketplaceInner]}>
                  <View style={styles.modalHeader}>
                    <Text style={[styles.modalTitle, isCompact && compactStyles.modalTitle]}>Quests</Text>
                    {!isController && (
                      <TouchableOpacity
                        onPress={() => setShowQuests(false)}
                        style={styles.closeButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Text style={[styles.closeButtonText, isCompact && compactStyles.closeButtonText]}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={styles.marketplaceContent}>
                    <Text style={[styles.comingSoonText, isCompact && compactStyles.comingSoonText]}>Coming Soon</Text>
                  </View>
                  {controllerCloseHint}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </InlineModal>

      {/* Profile Modal */}
      <InlineModal
        visible={showProfile}
        transparent
        animationType="fade"
        onRequestClose={() => setShowProfile(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowProfile(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={[styles.marketplaceModal, isCompact && compactStyles.marketplaceModal]}>
                <ImageBackground
                  source={paperPanelSource}
                  style={[styles.marketplaceBg, isCompact && compactStyles.marketplaceBg]}
                  resizeMode="stretch"
                />
                <View style={[styles.marketplaceInner, isCompact && compactStyles.marketplaceInner]}>
                  <View style={styles.modalHeader}>
                    <Text style={[styles.modalTitle, isCompact && compactStyles.modalTitle]}>Profile</Text>
                    {!isController && (
                      <TouchableOpacity
                        onPress={() => setShowProfile(false)}
                        style={styles.closeButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Text style={[styles.closeButtonText, isCompact && compactStyles.closeButtonText]}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <ScrollView style={{ flex: 1, width: '100%' }} contentContainerStyle={{ gap: 16 }}>
                    {/* Name Edit */}
                    <View style={styles.profileSection}>
                      <Text style={[styles.profileSectionTitle, isCompact && compactStyles.profileSectionTitle]}>Display Name</Text>
                      <FocusGlow active={isController && showProfile && profileFocus === 0}>
                        <View style={styles.profileInputContainer}>
                          <TextInput
                            style={[styles.profileInput, isCompact && compactStyles.profileInput, profileValidationError && styles.profileInputError]}
                            value={profileName}
                            onChangeText={handleProfileNameChange}
                            placeholder="Enter your name"
                            placeholderTextColor="#888888"
                            maxLength={NAME_MAX_LENGTH}
                            editable={!isController && !profileSaving}
                          />
                          <Text style={[styles.profileCharCount, isCompact && compactStyles.profileCharCount]}>
                            {profileName.length}/{NAME_MAX_LENGTH}
                          </Text>
                        </View>
                      </FocusGlow>
                      {profileValidationError && <Text style={[styles.profileErrorText, isCompact && compactStyles.profileFeedbackText]}>{profileValidationError}</Text>}
                      {profileSuccessMessage && <Text style={[styles.profileSuccessText, isCompact && compactStyles.profileFeedbackText]}>{profileSuccessMessage}</Text>}
                      <FocusGlow active={isController && showProfile && profileFocus === 1}>
                        <TouchableOpacity
                          onPress={handleProfileSave}
                          disabled={isProfileSaveDisabled}
                          activeOpacity={0.7}
                          style={{ alignItems: 'center', marginTop: 4 }}
                        >
                          <ImageBackground
                            source={buttonV3Source}
                            style={[styles.profileSaveButton, isCompact && compactStyles.profileSaveButton, isProfileSaveDisabled && { opacity: 0.5 }]}
                            resizeMode="stretch"
                          >
                            {profileSaving ? (
                              <ActivityIndicator size="small" color="#3d2b1f" />
                            ) : (
                              <Text style={[styles.profileSaveButtonText, isCompact && compactStyles.profileSaveButtonText]}>Save</Text>
                            )}
                          </ImageBackground>
                        </TouchableOpacity>
                      </FocusGlow>
                    </View>

                    {/* Statistics */}
                    <View style={styles.profileSection}>
                      <Text style={[styles.profileSectionTitle, isCompact && compactStyles.profileSectionTitle]}>Statistics</Text>
                      <View style={styles.profileStatsGrid}>
                        <View style={styles.profileStatRow}>
                          <Text style={[styles.profileStatLabel, isCompact && compactStyles.profileStatText]}>Sessions Played</Text>
                          <Text style={[styles.profileStatValue, isCompact && compactStyles.profileStatText]}>{profile?.totalRuns ?? 0}</Text>
                        </View>
                        <View style={styles.profileStatRow}>
                          <Text style={[styles.profileStatLabel, isCompact && compactStyles.profileStatText]}>Current Level</Text>
                          <Text style={[styles.profileStatValue, isCompact && compactStyles.profileStatText]}>{(profile?.currentLevel ?? 0) + 1} / 81</Text>
                        </View>
                        <View style={styles.profileStatRow}>
                          <Text style={[styles.profileStatLabel, isCompact && compactStyles.profileStatText]}>Available Sessions</Text>
                          <Text style={[styles.profileStatValue, isCompact && compactStyles.profileStatText]}>{profile?.availableRuns ?? 0}</Text>
                        </View>
                        <View style={styles.profileStatRow}>
                          <Text style={[styles.profileStatLabel, isCompact && compactStyles.profileStatText]}>Member Since</Text>
                          <Text style={[styles.profileStatValue, isCompact && compactStyles.profileStatText]}>
                            {profile?.createdAt ? formatDate(profile.createdAt) : 'N/A'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </ScrollView>
                  {isController && (
                    <View style={[styles.settingsHints, isCompact && compactStyles.settingsHints]}>
                      <View style={styles.settingsHintRow}>
                        <Image source={iconASource} style={[styles.settingsHintIcon, isCompact && compactStyles.settingsHintIcon]} resizeMode="contain" />
                        <Text style={[styles.settingsHintText, isCompact && compactStyles.settingsHintText]}>
                          {profileFocus === 0 ? 'Edit Name' : 'Save'}
                        </Text>
                      </View>
                      <View style={styles.settingsHintRow}>
                        <Image source={iconBSource} style={[styles.settingsHintIcon, isCompact && compactStyles.settingsHintIcon]} resizeMode="contain" />
                        <Text style={[styles.settingsHintText, isCompact && compactStyles.settingsHintText]}>Close</Text>
                      </View>
                    </View>
                  )}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </InlineModal>

      {/* Profile Controller Keyboard */}
      <ControllerKeyboard
        visible={showProfileKeyboard}
        value={profileName}
        maxLength={NAME_MAX_LENGTH}
        placeholder="Enter your name"
        onSubmit={(text) => {
          handleProfileNameChange(text);
          setShowProfileKeyboard(false);
        }}
        onCancel={() => setShowProfileKeyboard(false)}
      />

      {/* PvP Modal */}
      <InlineModal
        visible={showPvP}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPvP(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowPvP(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <ImageBackground
                source={pvpPanelSource}
                style={[styles.pvpModalContent, isCompact && compactStyles.pvpModalContent]}
                resizeMode="stretch"
              >
                {!isController && (
                  <TouchableOpacity
                    onPress={() => setShowPvP(false)}
                    style={[styles.pvpCloseButton, isCompact && compactStyles.pvpCloseButton]}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={[styles.pvpCloseButtonText, isCompact && compactStyles.pvpCloseButtonText]}>✕</Text>
                  </TouchableOpacity>
                )}
                {isController && (
                  <View style={[styles.modalHintBar, isCompact && compactStyles.modalHintBar]}>
                    <View style={styles.settingsHintRow}>
                      <Image source={iconASource} style={[styles.settingsHintIcon, isCompact && compactStyles.settingsHintIcon]} resizeMode="contain" />
                      <Text style={[styles.settingsHintText, isCompact && compactStyles.settingsHintText]}>Select</Text>
                    </View>
                    <View style={styles.settingsHintRow}>
                      <Image source={iconBSource} style={[styles.settingsHintIcon, isCompact && compactStyles.settingsHintIcon]} resizeMode="contain" />
                      <Text style={[styles.settingsHintText, isCompact && compactStyles.settingsHintText]}>Close</Text>
                    </View>
                  </View>
                )}
                <View style={[styles.pvpPapersStack, isCompact && compactStyles.pvpPapersStack]}>
                  <View style={[
                    styles.pvpPaperGauntletWrap,
                    isCompact && compactStyles.pvpPaperGauntletWrap,
                    isController && { zIndex: pvpFocus === 0 ? 10 : 1 },
                  ]}>
                    <FocusGlow active={isController && pvpFocus === 0}>
                      <TouchableOpacity onPress={handleGauntlet} activeOpacity={0.7}>
                        <Image
                          source={gauntletPaperSource}
                          style={[styles.pvpPaperGauntlet, isCompact && compactStyles.pvpPaperGauntlet]}
                          resizeMode="contain"
                        />
                      </TouchableOpacity>
                    </FocusGlow>
                  </View>

                  <View style={[
                    styles.pvpPaperDuelsWrap,
                    isCompact && compactStyles.pvpPaperDuelsWrap,
                    isController && { zIndex: pvpFocus === 1 ? 10 : 1 },
                  ]}>
                    <FocusGlow active={isController && pvpFocus === 1}>
                      <TouchableOpacity onPress={handleDuels} activeOpacity={0.7}>
                        <Image
                          source={duelsPaperSource}
                          style={[styles.pvpPaperDuels, isCompact && compactStyles.pvpPaperDuels]}
                          resizeMode="contain"
                        />
                      </TouchableOpacity>
                    </FocusGlow>
                  </View>

                  <View style={[
                    styles.pvpPaperPitDraftWrap,
                    isCompact && compactStyles.pvpPaperPitDraftWrap,
                    isController && { zIndex: pvpFocus === 2 ? 10 : 1 },
                  ]}>
                    <FocusGlow active={isController && pvpFocus === 2}>
                      <TouchableOpacity onPress={handlePitDraft} activeOpacity={0.7}>
                        <Image
                          source={pitDraftPaperSource}
                          style={[styles.pvpPaperPitDraft, isCompact && compactStyles.pvpPaperPitDraft]}
                          resizeMode="contain"
                        />
                      </TouchableOpacity>
                    </FocusGlow>
                  </View>
                </View>
              </ImageBackground>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </InlineModal>

      {/* Controller button hints */}
      <ControllerHints hints={controllerHints} />
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

  // CONTROLLER CLOSE HINT (inside modals)
  controllerCloseHint: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFE9D6',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#c8b99a',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  controllerCloseHintText: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#5c4033',
  },
  // SHARED MODAL HINT BAR (used by PvP and others with multiple hints)
  modalHintBar: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#EFE9D6',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#c8b99a',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  // SETTINGS MODAL HINTS
  settingsHints: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#EFE9D6',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#c8b99a',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  settingsHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  settingsHintIcon: {
    width: 18,
    height: 18,
  },
  settingsHintText: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#5c4033',
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

  // SHARED MODAL STYLES (used by Skins, Ranks, Quests modals)
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

  // PROFILE MODAL STYLES
  profileSection: {
    gap: 8,
  },
  profileSectionTitle: {
    fontFamily: Typography.header,
    fontSize: 18,
    color: '#3d2b1f',
    textAlign: 'center',
  },
  profileInputContainer: {
    marginBottom: 4,
  },
  profileInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#5c4033',
    padding: 10,
    fontSize: 14,
    fontFamily: Typography.body,
    color: '#3d2b1f',
  },
  profileInputError: {
    borderColor: '#a33a3a',
  },
  profileCharCount: {
    fontFamily: Typography.number,
    fontSize: 11,
    color: '#5c4033',
    textAlign: 'right',
    marginTop: 2,
  },
  profileErrorText: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#a33a3a',
  },
  profileSuccessText: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#228B22',
  },
  profileSaveButton: {
    width: 100,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileSaveButtonText: {
    fontFamily: Typography.button,
    fontSize: 16,
    color: '#3d2b1f',
    marginBottom: 4,
  },
  profileStatsGrid: {
    gap: 8,
  },
  profileStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(92, 64, 51, 0.3)',
  },
  profileStatLabel: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#5c4033',
  },
  profileStatValue: {
    fontFamily: Typography.stat,
    fontSize: 14,
    color: '#3d2b1f',
  },

  // PVP MODAL STYLES
  pvpCloseButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
    padding: 10,
  },
  pvpCloseButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#5c4033',
  },
  pvpModalContent: {
    width: 300,
    height: 359,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 36,
    paddingBottom: 15,
  },
  pvpPapersStack: {
    width: '100%',
    paddingHorizontal: 16,
  },
  pvpPaperGauntletWrap: {
    alignSelf: 'flex-start',
    zIndex: 3,
  },
  pvpPaperGauntlet: {
    width: 155,
    height: 105,
  },
  pvpPaperDuelsWrap: {
    marginTop: -52,
    alignSelf: 'flex-end',
    zIndex: 2,
    transform: [{ rotate: '14deg' }],
  },
  pvpPaperDuels: {
    width: 150,
    height: 102,
  },
  pvpPaperPitDraftWrap: {
    marginTop: -47,
    alignSelf: 'flex-start',
    zIndex: 1,
    transform: [{ rotate: '-7deg' }],
  },
  pvpPaperPitDraft: {
    width: 149,
    height: 85,
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
    marginLeft: 320,
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
  // Shared modals (Skins, Ranks, Quests) — scaled up for compact
  marketplaceModal: {
    width: 860,
    height: 760,
  },
  marketplaceBg: {
    top: (760 - 906) / 2,
    left: (860 - 760) / 2,
    width: 760,
    height: 906,
  },
  marketplaceInner: {
    padding: 60,
    paddingTop: 40,
  },
  modalTitle: {
    fontSize: 48,
    marginTop: 12,
  },
  closeButtonText: {
    fontSize: 40,
  },
  comingSoonText: {
    fontSize: 40,
  },
  // Profile modal — scaled up for compact
  profileSectionTitle: {
    fontSize: 32,
  },
  profileInput: {
    padding: 16,
    fontSize: 28,
    borderRadius: 12,
  },
  profileCharCount: {
    fontSize: 20,
  },
  profileFeedbackText: {
    fontSize: 22,
  },
  profileSaveButton: {
    width: 180,
    height: 76,
  },
  profileSaveButtonText: {
    fontSize: 30,
    marginBottom: 6,
  },
  profileStatText: {
    fontSize: 26,
  },

  // PVP modal — bigger panel and papers with left/right alternation
  pvpCloseButton: {
    top: 36,
    right: 40,
  },
  pvpCloseButtonText: {
    fontSize: 40,
  },
  pvpModalContent: {
    width: 783,
    height: 937,
    paddingTop: 95,
    paddingBottom: 40,
  },
  pvpPapersStack: {
    width: '100%',
    paddingHorizontal: 40,
  },
  pvpPaperGauntletWrap: {
    alignSelf: 'flex-start',
    zIndex: 3,
  },
  pvpPaperGauntlet: {
    width: 405,
    height: 275,
  },
  pvpPaperDuelsWrap: {
    marginTop: -135,
    alignSelf: 'flex-end',
    zIndex: 2,
    transform: [{ rotate: '14deg' }],
  },
  pvpPaperDuels: {
    width: 392,
    height: 266,
  },
  pvpPaperPitDraftWrap: {
    marginTop: -122,
    alignSelf: 'flex-start',
    zIndex: 1,
    transform: [{ rotate: '-7deg' }],
  },
  pvpPaperPitDraft: {
    width: 389,
    height: 221,
  },

  // Settings modal — scaled up for compact
  settingsModalContent: {
    width: 680,
    height: 680,
    padding: 80,
  },
  settingsModalBody: {
    flex: 1,
    justifyContent: 'center',
  },
  settingLabel: {
    fontSize: 36,
  },
  resetButton: {
    width: 360,
    height: 96,
  },
  disconnectText: {
    fontSize: 32,
  },

  // Controller close hint — scaled up for compact
  controllerCloseHint: {
    bottom: 32,
    left: 32,
    gap: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  controllerCloseHintText: {
    fontSize: 26,
  },
  // Modal hint bar — scaled up for compact
  modalHintBar: {
    bottom: 32,
    left: 32,
    gap: 24,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  // Settings modal hints — scaled up for compact
  settingsHints: {
    bottom: 32,
    left: 32,
    gap: 24,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  settingsHintIcon: {
    width: 36,
    height: 36,
  },
  settingsHintText: {
    fontSize: 22,
  },
});
