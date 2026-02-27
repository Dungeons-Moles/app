import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
import { useSessionIdentity } from '../contexts/SessionContext';
import { useGame, GamePhase } from '../contexts/GameContext';
import { useWallet } from '../contexts/WalletContext';
import { shortenAddress } from '../utils/storage';
import { RootStackParamList } from '../navigation';
import { InlineModal } from '../components/InlineModal';
import { SpeedControls } from '../components/combat';
import { VolumeControls } from '../components/ui/VolumeControls';
import { Skeleton } from '../components/common/Skeleton';
import { Typography } from '../theme/typography';
import type { CombatSpeed } from '../types';
import { useScreenVariant } from '../contexts/ScreenVariantContext';
import { MAX_CAMPAIGN_LEVEL } from '../hooks/useMapGenerator';
import { useControllerAction } from '../hooks/useControllerAction';
import { ControllerHints, type ButtonHint } from '../components/ui/ControllerHints';
import { useInputMode } from '../hooks/useInputMode';
import { FocusGlow } from '../components/ui/FocusGlow';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BetaWelcomeModal, BETA_WELCOME_KEY } from '../components/ui/BetaWelcomeModal';
import { ControllerKeyboard } from '../components/ui/ControllerKeyboard';
import { getVrfSeed } from '../services/solana/vrf';
import { useNftMarketplace } from '../hooks/useNftMarketplace';
import { useQuests } from '../hooks/useQuests';
import { useEquipSkin } from '../hooks/useEquipSkin';
import { NftCard } from '../components/marketplace/NftCard';
import { QuestCard } from '../components/quests/QuestCard';
import { getSkinImage } from '../data/skinImages';
import { useEquippedSkinImage } from '../hooks/useEquippedSkinImage';
import { useAudio } from '../contexts/AudioContext';
import { useSettings } from '../contexts/SettingsContext';
import { Checkbox } from '../components/ui/Checkbox';

const iconASource = require('../../assets/ui/control-buttons/a.png');
const iconBSource = require('../../assets/ui/control-buttons/b.png');
const iconDirSource = require('../../assets/ui/control-buttons/direction.png');
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
  const { musicVolume, setMusicVolume, sfxVolume, setSfxVolume, playBgm, playSfx } = useAudio();
  const { autoOpenPOI, setAutoOpenPOI } = useSettings();
  const { wallet, getBalance, disconnect } = useWallet();
  const [showSettings, setShowSettings] = useState(false);
  const [showSkins, setShowSkins] = useState(false);
  const [showQuests, setShowQuests] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showPvP, setShowPvP] = useState(false);
  const [showBetaWelcome, setShowBetaWelcome] = useState(false);
  const [pvpFocus, setPvpFocus] = useState(0);
  const [profileName, setProfileName] = useState(profile?.name ?? '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileValidationError, setProfileValidationError] = useState<string | null>(null);
  const [profileSuccessMessage, setProfileSuccessMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [walletBalanceLamports, setWalletBalanceLamports] = useState<bigint | null>(null);
  const [focus, setFocus] = useState<{ group: 'left' | 'right'; index: number }>({
    group: 'right',
    index: 0,
  });
  const [settingsFocus, setSettingsFocus] = useState(0); // 0 = speed, 1 = disconnect, 2 = reset
  const [showResetWarning, setShowResetWarning] = useState(false);
  const [resetInProgress, setResetInProgress] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetWarningFocus, setResetWarningFocus] = useState(1); // 0 = cancel, 1 = confirm
  const [profileFocus, setProfileFocus] = useState(0); // 0 = name, 1 = save
  const [skinsFocus, setSkinsFocus] = useState(0);
  const [questsFocus, setQuestsFocus] = useState(0);
  const [showProfileKeyboard, setShowProfileKeyboard] = useState(false);
  const { userSkins, isLoading: skinsLoading, fetchUserAssets } = useNftMarketplace();
  const { quests, isLoading: questsLoading, fetchQuests, acceptQuest, claimReward } = useQuests();
  const { equipSkin, unequipSkin, isLoading: equipLoading } = useEquipSkin();
  const { processPendingCleanups } = useSessionIdentity();

  // Sort skins: equipped first
  const sortedSkins = useMemo(() => {
    const equippedKey = profile?.equippedSkin?.toBase58() ?? null;
    return [...userSkins].sort((a, b) => {
      const aEq = a.address.toBase58() === equippedKey ? 0 : 1;
      const bEq = b.address.toBase58() === equippedKey ? 0 : 1;
      return aEq - bEq;
    });
  }, [userSkins, profile?.equippedSkin]);

  // Resolve equipped skin image for center character + avatar (single getAccountInfo, no heavy getProgramAccounts)
  const characterImage = useEquippedSkinImage(profile?.equippedSkin);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const didRunCleanupThisFocusRef = useRef(false);

  useEffect(() => {
    if (!isScreenFocused) return;
    playBgm('hub');
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [isScreenFocused, playBgm, fadeAnim]);

  // Show beta welcome modal on first visit
  useEffect(() => {
    AsyncStorage.getItem(BETA_WELCOME_KEY).then((shown) => {
      if (!shown) setShowBetaWelcome(true);
    });
  }, []);

  // Process any pending session cleanups when Hub screen gains focus
  // (e.g. returning from DeathScreen after a deferred queueEndGame)
  useEffect(() => {
    if (!isScreenFocused) {
      didRunCleanupThisFocusRef.current = false;
      return;
    }
    if (didRunCleanupThisFocusRef.current) {
      return;
    }
    didRunCleanupThisFocusRef.current = true;
    processPendingCleanups().catch((err) => {
      console.warn('[HubScreen] Failed to run pending cleanup processing:', err);
    });
  }, [isScreenFocused, processPendingCleanups]);

  useEffect(() => {
    let cancelled = false;

    const refreshWalletBalance = async () => {
      if (isGuest || !wallet.publicKey) {
        if (!cancelled) setWalletBalanceLamports(null);
        return;
      }
      try {
        const lamports = await getBalance();
        if (!cancelled) setWalletBalanceLamports(lamports);
      } catch {
        if (!cancelled) setWalletBalanceLamports(null);
      }
    };

    if (isScreenFocused) {
      refreshWalletBalance();
    }

    return () => {
      cancelled = true;
    };
  }, [getBalance, isGuest, isScreenFocused, wallet.publicKey]);

  useEffect(() => {
    if (showSkins) fetchUserAssets();
  }, [showSkins]);

  useEffect(() => {
    if (showQuests) fetchQuests();
  }, [showQuests]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleDisconnect = useCallback(() => {
    playSfx('ui_click');
    setShowResetWarning(false);
    setShowSettings(false);
    setResetError(null);
    disconnect();
    navigation.reset({
      index: 0,
      routes: [{ name: 'Account' }],
    });
  }, [disconnect, navigation, playSfx]);

  const handleOpenResetWarning = useCallback(() => {
    playSfx('ui_click');
    setResetError(null);
    setResetWarningFocus(1);
    setShowResetWarning(true);
  }, [playSfx]);

  const handleResetProfile = useCallback(async () => {
    playSfx('ui_click');
    setResetError(null);
    setResetInProgress(true);
    try {
      const result = await clearProfile();
      if (!result.success) {
        playSfx('ui_error');
        setResetError(result.error ?? 'Failed to reset profile');
        return;
      }
      playSfx('ui_click');
      setShowResetWarning(false);
      setShowSettings(false);
      navigation.reset({
        index: 0,
        routes: [{ name: 'Account' }],
      });
    } finally {
      setResetInProgress(false);
    }
  }, [clearProfile, navigation, playSfx]);

  const handlePlayPvE = useCallback(async () => {
    playSfx('ui_click');
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
  }, [navigation, isGuest, dispatch, gameState?.phase, playSfx]);

  const handlePlayPvP = () => {
    playSfx('ui_click');
    setPvpFocus(0);
    setShowPvP(true);
  };

  const handleGauntlet = () => {
    playSfx('ui_click');
    setShowPvP(false);
    navigation.navigate('Gauntlet');
  };

  const handleDuels = () => {
    playSfx('ui_click');
    setShowPvP(false);
    navigation.navigate('Duels');
  };

  const handlePitDraft = () => {
    playSfx('ui_click');
    setShowPvP(false);
    navigation.navigate('PitDraft');
  };

  const handleMarketplace = () => {
    playSfx('ui_click');
    navigation.navigate('Marketplace');
  };

  const handleLeaderboard = () => {
    playSfx('ui_click');
    navigation.navigate('GauntletRanking', { returnTo: 'Hub' });
  };

  const handleQuests = () => {
    playSfx('ui_click');
    setQuestsFocus(0);
    setShowQuests(true);
  };

  const handleSkins = () => {
    playSfx('ui_click');
    setSkinsFocus(0);
    setShowSkins(true);
  };

  const handleItems = () => {
    playSfx('ui_click');
    navigation.navigate('Items');
  };

  const handleProfileSettings = () => {
    playSfx('ui_click');
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
      playSfx('ui_error');
      setProfileValidationError('Name is required');
      return;
    }
    if (profileName === profile?.name) {
      playSfx('ui_error');
      setProfileSuccessMessage('Name unchanged');
      return;
    }
    playSfx('ui_click');
    setProfileSaving(true);
    setProfileSuccessMessage(null);
    try {
      const result = await updateName(profileName);
      if (result.success) {
        playSfx('ui_click');
        setProfileSuccessMessage('Name updated!');
      } else {
        playSfx('ui_error');
        setProfileValidationError(result.error ?? 'Failed to update name');
      }
    } finally {
      setProfileSaving(false);
    }
  }, [profileName, profile?.name, updateName, playSfx]);

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const isProfileSaveDisabled =
    profileSaving || isLoading || !!profileValidationError || profileName === profile?.name;
  const walletBalanceSol =
    walletBalanceLamports !== null
      ? (Number(walletBalanceLamports) / 1_000_000_000).toFixed(4)
      : null;

  // --- Controller navigation ---
  const anyModalOpen =
    showSettings || showResetWarning || showProfile || showSkins || showQuests || showPvP || showBetaWelcome;
  const isController = inputMode === 'controller';

  const controllerCloseHint = isController ? (
    <View style={[styles.controllerCloseHint, isCompact && compactStyles.controllerCloseHint]}>
      <Image
        source={iconBSource}
        style={{ width: isCompact ? 40 : 18, height: isCompact ? 40 : 18 }}
        resizeMode="contain"
      />
      <Text
        style={[styles.controllerCloseHintText, isCompact && compactStyles.controllerCloseHintText]}
      >
        Close
      </Text>
    </View>
  ) : null;

  const isFocused = (group: 'left' | 'right', index: number) =>
    inputMode === 'controller' && !anyModalOpen && focus.group === group && focus.index === index;

  const leftCount = isGuest ? 1 : 5;
  const rightCount = isGuest ? 1 : 2;

  const handleControllerA = () => {
    if (focus.group === 'left') {
      [handleItems, handleQuests, handleSkins, handleMarketplace, handleLeaderboard][
        focus.index
      ]?.();
    } else {
      [handlePlayPvE, handlePlayPvP][focus.index]?.();
    }
  };

  const closeAnyModal = () => {
    playSfx('ui_click');
    if (showBetaWelcome) setShowBetaWelcome(false);
    else if (showResetWarning) setShowResetWarning(false);
    else if (showPvP) setShowPvP(false);
    else if (showSettings) setShowSettings(false);
    else if (showProfile) setShowProfile(false);
    else if (showSkins) setShowSkins(false);
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
  const maxSettingsFocus = isGuest ? 4 : 5;

  const toggleAutoOpenPOI = () => {
    playSfx('ui_click');
    setAutoOpenPOI(!autoOpenPOI);
  };

  const settingsActions =
    showSettings && !showResetWarning
      ? {
          onA:
            settingsFocus === 3
              ? toggleAutoOpenPOI
              : settingsFocus === 4
                ? handleDisconnect
                : settingsFocus === 5 && !isGuest
                  ? handleOpenResetWarning
                  : undefined,
          onB: closeAnyModal,
          onDPadUp: () => setSettingsFocus((p) => Math.max(0, p - 1)),
          onDPadDown: () => setSettingsFocus((p) => Math.min(maxSettingsFocus, p + 1)),
          onDPadLeft:
            settingsFocus === 0
              ? () => setMusicVolume(Math.round(Math.max(0, musicVolume - 0.1) * 10) / 10)
              : settingsFocus === 1
                ? () => setSfxVolume(Math.round(Math.max(0, sfxVolume - 0.1) * 10) / 10)
                : settingsFocus === 2
                  ? () => cycleSpeed(-1)
                  : settingsFocus === 3
                    ? toggleAutoOpenPOI
                    : undefined,
          onDPadRight:
            settingsFocus === 0
              ? () => setMusicVolume(Math.round(Math.min(1, musicVolume + 0.1) * 10) / 10)
              : settingsFocus === 1
                ? () => setSfxVolume(Math.round(Math.min(1, sfxVolume + 0.1) * 10) / 10)
                : settingsFocus === 2
                  ? () => cycleSpeed(1)
                  : settingsFocus === 3
                    ? toggleAutoOpenPOI
                    : undefined,
        }
      : null;

  const resetWarningActions = showResetWarning
    ? {
        onA:
          resetWarningFocus === 1 && !resetInProgress
            ? handleResetProfile
            : resetWarningFocus === 0 && !resetInProgress
              ? () => setShowResetWarning(false)
              : undefined,
        onB: resetInProgress ? undefined : () => setShowResetWarning(false),
        onDPadLeft: () => setResetWarningFocus((p) => Math.max(0, p - 1)),
        onDPadRight: () => setResetWarningFocus((p) => Math.min(1, p + 1)),
      }
    : null;

  const profileActions =
    showProfile && !showProfileKeyboard
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

  const skinsActions =
    showSkins && sortedSkins.length > 0
      ? {
          onA: () => {
            const skin = sortedSkins[skinsFocus];
            if (!skin || equipLoading) return;
            const isEquipped = profile?.equippedSkin?.equals(skin.address) ?? false;
            if (isEquipped) {
              playSfx('ui_click');
              unequipSkin().then(() => {
                refresh();
                fetchUserAssets();
              });
            } else {
              playSfx('ui_click');
              equipSkin(skin.address).then(() => {
                refresh();
                fetchUserAssets();
              });
            }
          },
          onB: closeAnyModal,
          onDPadLeft: () => setSkinsFocus((p) => Math.max(0, p - 1)),
          onDPadRight: () => setSkinsFocus((p) => Math.min(sortedSkins.length - 1, p + 1)),
        }
      : showSkins
        ? { onB: closeAnyModal }
        : null;

  // Flatten quests into a single list for focus tracking
  const flatQuests = quests;
  const questsActions =
    showQuests && flatQuests.length > 0
      ? {
          onA: () => {
            const quest = flatQuests[questsFocus];
            if (!quest || questsLoading) return;
            if (quest.progress?.completed && !quest.progress?.claimed) {
              playSfx('ui_click');
              claimReward(quest.definition.questId);
            } else if (!quest.progress) {
              playSfx('ui_click');
              acceptQuest(quest.definition.questId);
            }
          },
          onB: closeAnyModal,
          onDPadUp: () => setQuestsFocus((p) => Math.max(0, p - 1)),
          onDPadDown: () => setQuestsFocus((p) => Math.min(flatQuests.length - 1, p + 1)),
        }
      : showQuests
        ? { onB: closeAnyModal }
        : null;

  const otherModalOpen =
    anyModalOpen &&
    !showSettings &&
    !showResetWarning &&
    !showProfile &&
    !showPvP &&
    !showSkins &&
    !showQuests;

  useControllerAction(
    resetWarningActions ??
      settingsActions ??
      profileActions ??
      pvpActions ??
      skinsActions ??
      questsActions ?? {
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
        onStart: otherModalOpen
          ? undefined
          : () => {
              playSfx('ui_click');
              setSettingsFocus(0);
              setShowSettings(true);
            },
        onSelect:
          otherModalOpen || isGuest
            ? undefined
            : () => {
                setProfileFocus(0);
                handleProfileSettings();
              },
      },
    !showProfileKeyboard && isScreenFocused
  );

  const controllerHints: ButtonHint[] = anyModalOpen
    ? []
    : [
        { button: 'A', label: 'Select' },
        { button: 'Start', label: 'Settings' },
        ...(!isGuest ? [{ button: 'Select', label: 'Profile' } as ButtonHint] : []),
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
              onPress={isGuest ? undefined : handleProfileSettings}
              activeOpacity={isGuest ? 1 : 0.8}
              disabled={isGuest}
            >
              <ImageBackground
                source={walletImageSource}
                style={[styles.playerPanel, isCompact && compactStyles.playerPanel]}
                resizeMode="stretch"
              >
                {/* Avatar Square */}
                <View style={[styles.avatarContainer, isCompact && compactStyles.avatarContainer]}>
                  <Image
                    source={characterImage}
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
                        <Text
                          style={[styles.walletAddress, isCompact && compactStyles.walletAddress]}
                        >
                          (GUEST)
                        </Text>
                      ) : profile?.owner ? (
                        <>
                          <Text
                            style={[styles.walletAddress, isCompact && compactStyles.walletAddress]}
                          >
                            {shortenAddress(profile.owner.toBase58())}
                          </Text>
                          {walletBalanceSol !== null && (
                            <Text
                              style={[
                                styles.walletBalance,
                                isCompact && compactStyles.walletBalance,
                              ]}
                            >
                              {walletBalanceSol} SOL
                            </Text>
                          )}
                        </>
                      ) : null}
                    </>
                  )}
                </View>
              </ImageBackground>
            </TouchableOpacity>

            {/* Guest mode description */}
            {isGuest && (
              <Text
                style={[
                  styles.guestModeDescription,
                  isCompact && compactStyles.guestModeDescription,
                ]}
              >
                {
                  "Guest mode — explore freely with no strings attached.\nYour progress won't be saved."
                }
              </Text>
            )}

            {/* Wide: Items button directly below profile */}
            {!isCompact && (
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

            {/* Compact: nav buttons centered vertically below profile */}
            {isCompact && (
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

                {!isGuest && (
                  <>
                    <FocusGlow active={isFocused('left', 1)}>
                      <TouchableOpacity onPress={handleQuests} activeOpacity={0.7}>
                        <ImageBackground
                          source={buttonV1Source}
                          style={[styles.navButton, compactStyles.navButton]}
                          resizeMode="stretch"
                        >
                          <Text style={[styles.navButtonText, compactStyles.navButtonText]}>
                            Quests
                          </Text>
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
                          <Text style={[styles.navButtonText, compactStyles.navButtonText]}>
                            Skins
                          </Text>
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
                          <Text style={[styles.navButtonText, compactStyles.navButtonText]}>
                            PvP Ranks
                          </Text>
                        </ImageBackground>
                      </TouchableOpacity>
                    </FocusGlow>
                  </>
                )}
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
              <TouchableOpacity
                onPress={() => {
                  playSfx('ui_click');
                  setShowSettings(true);
                }}
                activeOpacity={0.7}
              >
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
                source={characterImage}
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
                  <Text style={[styles.modalTitle, isCompact && compactStyles.modalTitle]}>
                    Settings
                  </Text>
                  {!isController && (
                    <TouchableOpacity
                      onPress={() => {
                        playSfx('ui_click');
                        setShowSettings(false);
                      }}
                      style={styles.closeButton}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text
                        style={[styles.closeButtonText, isCompact && compactStyles.closeButtonText]}
                      >
                        ✕
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={[styles.modalBody, isCompact && compactStyles.settingsModalBody]}>
                  <FocusGlow active={isController && showSettings && settingsFocus === 0} style={styles.settingGlow}>
                    <View style={styles.settingRow}>
                      <Text style={[styles.settingLabel, isCompact && compactStyles.settingLabel]}>
                        Music volume
                      </Text>
                      <VolumeControls
                        currentVolume={musicVolume}
                        onVolumeChange={setMusicVolume}
                        scale={isCompact ? 2 : 1}
                      />
                    </View>
                  </FocusGlow>

                  <FocusGlow active={isController && showSettings && settingsFocus === 1} style={styles.settingGlow}>
                    <View style={styles.settingRow}>
                      <Text style={[styles.settingLabel, isCompact && compactStyles.settingLabel]}>
                        SFX volume
                      </Text>
                      <VolumeControls
                        currentVolume={sfxVolume}
                        onVolumeChange={setSfxVolume}
                        scale={isCompact ? 2 : 1}
                      />
                    </View>
                  </FocusGlow>

                  <FocusGlow active={isController && showSettings && settingsFocus === 2} style={styles.settingGlow}>
                    <View style={styles.settingRow}>
                      <Text style={[styles.settingLabel, isCompact && compactStyles.settingLabel]}>
                        Combat speed
                      </Text>
                      <SpeedControls
                        currentSpeed={defaultCombatSpeed}
                        onSpeedChange={updateDefaultCombatSpeed}
                        scale={isCompact ? 1.4 : 0.7}
                      />
                    </View>
                  </FocusGlow>

                  <FocusGlow active={isController && showSettings && settingsFocus === 3} style={styles.settingGlow}>
                    <Checkbox
                      label="Auto-open POI"
                      checked={autoOpenPOI}
                      onToggle={toggleAutoOpenPOI}
                      size={isCompact ? 44 : 20}
                      labelStyle={isCompact ? { fontSize: 26 } : undefined}
                    />
                  </FocusGlow>

                  <FocusGlow active={isController && showSettings && settingsFocus === 4}>
                    <TouchableOpacity
                      style={[styles.resetButton, isCompact && compactStyles.resetButton]}
                      onPress={handleDisconnect}
                      activeOpacity={0.7}
                    >
                      <ImageBackground
                        source={buttonV1Source}
                        style={styles.buttonImage}
                        resizeMode="stretch"
                      >
                        <Text
                          style={[styles.disconnectText, isCompact && compactStyles.disconnectText]}
                        >
                          Disconnect
                        </Text>
                      </ImageBackground>
                    </TouchableOpacity>
                  </FocusGlow>

                  {!isGuest && (
                    <FocusGlow active={isController && showSettings && settingsFocus === 5}>
                      <TouchableOpacity
                        style={[styles.resetButton, isCompact && compactStyles.resetButton]}
                        onPress={handleOpenResetWarning}
                        activeOpacity={0.7}
                      >
                        <ImageBackground
                          source={buttonV1Source}
                          style={styles.buttonImage}
                          resizeMode="stretch"
                        >
                          <Text
                            style={[
                              styles.disconnectText,
                              isCompact && compactStyles.disconnectText,
                            ]}
                          >
                            Reset Profile
                          </Text>
                        </ImageBackground>
                      </TouchableOpacity>
                    </FocusGlow>
                  )}
                </View>
                {isController && (
                  <View style={[styles.settingsHints, isCompact && compactStyles.settingsHints]}>
                    {settingsFocus <= 2 ? (
                      <View style={styles.settingsHintRow}>
                        <Image
                          source={iconDirSource}
                          style={[
                            styles.settingsHintIcon,
                            isCompact && compactStyles.settingsHintIcon,
                            { transform: [{ rotate: '-90deg' }] },
                          ]}
                          resizeMode="contain"
                        />
                        <Image
                          source={iconDirSource}
                          style={[
                            styles.settingsHintIcon,
                            isCompact && compactStyles.settingsHintIcon,
                            { transform: [{ rotate: '90deg' }] },
                          ]}
                          resizeMode="contain"
                        />
                        <Text
                          style={[
                            styles.settingsHintText,
                            isCompact && compactStyles.settingsHintText,
                          ]}
                        >
                          {settingsFocus === 2 ? 'Change speed' : 'Change volume'}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.settingsHintRow}>
                        <Image
                          source={iconASource}
                          style={[
                            styles.settingsHintIcon,
                            isCompact && compactStyles.settingsHintIcon,
                          ]}
                          resizeMode="contain"
                        />
                        <Text
                          style={[
                            styles.settingsHintText,
                            isCompact && compactStyles.settingsHintText,
                          ]}
                        >
                          {settingsFocus === 3 ? 'Toggle' : 'Confirm'}
                        </Text>
                      </View>
                    )}
                    <View style={styles.settingsHintRow}>
                      <Image
                        source={iconBSource}
                        style={[
                          styles.settingsHintIcon,
                          isCompact && compactStyles.settingsHintIcon,
                        ]}
                        resizeMode="contain"
                      />
                      <Text
                        style={[
                          styles.settingsHintText,
                          isCompact && compactStyles.settingsHintText,
                        ]}
                      >
                        Close
                      </Text>
                    </View>
                  </View>
                )}
              </ImageBackground>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </InlineModal>

      {/* Reset Warning Modal */}
      <InlineModal
        visible={showResetWarning}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!resetInProgress) {
            playSfx('ui_click');
            setShowResetWarning(false);
          }
        }}
      >
        <TouchableWithoutFeedback
          onPress={() => {
            if (!resetInProgress) {
              playSfx('ui_click');
              setShowResetWarning(false);
            }
          }}
        >
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <ImageBackground
                source={paperPanelSource}
                style={[styles.warningModalContent, isCompact && compactStyles.warningModalContent]}
                resizeMode="stretch"
              >
                <Text
                  style={[
                    styles.modalTitle,
                    isCompact && compactStyles.modalTitle,
                    { color: '#a33a3a' },
                  ]}
                >
                  Warning
                </Text>
                <Text style={[styles.warningText, isCompact && compactStyles.warningText]}>
                  Resetting your profile will permanently delete your on-chain profile for this
                  wallet. This cannot be undone.
                </Text>
                {!!resetError && (
                  <Text
                    style={[styles.warningErrorText, isCompact && compactStyles.warningErrorText]}
                  >
                    {resetError}
                  </Text>
                )}
                <View style={styles.warningActions}>
                  <FocusGlow active={isController && resetWarningFocus === 0}>
                    <TouchableOpacity
                      style={[styles.warningButton, isCompact && compactStyles.warningButton]}
                      onPress={() => {
                        playSfx('ui_click');
                        setShowResetWarning(false);
                      }}
                      disabled={resetInProgress}
                      activeOpacity={0.7}
                    >
                      <ImageBackground
                        source={buttonV1Source}
                        style={styles.buttonImage}
                        resizeMode="stretch"
                      >
                        <Text
                          style={[
                            styles.warningButtonText,
                            isCompact && compactStyles.warningButtonText,
                          ]}
                        >
                          Cancel
                        </Text>
                      </ImageBackground>
                    </TouchableOpacity>
                  </FocusGlow>
                  <FocusGlow active={isController && resetWarningFocus === 1}>
                    <TouchableOpacity
                      style={[styles.warningButton, isCompact && compactStyles.warningButton]}
                      onPress={handleResetProfile}
                      disabled={resetInProgress}
                      activeOpacity={0.7}
                    >
                      <ImageBackground
                        source={buttonV2Source}
                        style={styles.buttonImage}
                        resizeMode="stretch"
                      >
                        <Text
                          style={[
                            styles.warningButtonText,
                            isCompact && compactStyles.warningButtonText,
                            { color: '#a33a3a' },
                          ]}
                        >
                          {resetInProgress ? 'Resetting...' : 'Reset'}
                        </Text>
                      </ImageBackground>
                    </TouchableOpacity>
                  </FocusGlow>
                </View>
                {isController && (
                  <View style={[styles.settingsHints, isCompact && compactStyles.settingsHints]}>
                    <View style={styles.settingsHintRow}>
                      <Image
                        source={iconDirSource}
                        style={[
                          styles.settingsHintIcon,
                          isCompact && compactStyles.settingsHintIcon,
                          { transform: [{ rotate: '90deg' }] },
                        ]}
                        resizeMode="contain"
                      />
                      <Text
                        style={[
                          styles.settingsHintText,
                          isCompact && compactStyles.settingsHintText,
                        ]}
                      >
                        Choose action
                      </Text>
                    </View>
                    <View style={styles.settingsHintRow}>
                      <Image
                        source={iconASource}
                        style={[
                          styles.settingsHintIcon,
                          isCompact && compactStyles.settingsHintIcon,
                        ]}
                        resizeMode="contain"
                      />
                      <Text
                        style={[
                          styles.settingsHintText,
                          isCompact && compactStyles.settingsHintText,
                        ]}
                      >
                        Confirm
                      </Text>
                    </View>
                    <View style={styles.settingsHintRow}>
                      <Image
                        source={iconBSource}
                        style={[
                          styles.settingsHintIcon,
                          isCompact && compactStyles.settingsHintIcon,
                        ]}
                        resizeMode="contain"
                      />
                      <Text
                        style={[
                          styles.settingsHintText,
                          isCompact && compactStyles.settingsHintText,
                        ]}
                      >
                        Back
                      </Text>
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
                <View
                  style={[styles.marketplaceInner, isCompact && compactStyles.marketplaceInner]}
                >
                  <View style={styles.modalHeader}>
                    <Text style={[styles.modalTitle, isCompact && compactStyles.modalTitle]}>
                      Skins
                    </Text>
                    {!isController && (
                      <TouchableOpacity
                        onPress={() => {
                          playSfx('ui_click');
                          setShowSkins(false);
                        }}
                        style={styles.closeButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Text
                          style={[
                            styles.closeButtonText,
                            isCompact && compactStyles.closeButtonText,
                          ]}
                        >
                          ✕
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <ScrollView
                    style={{ flex: 1, width: '100%' }}
                    contentContainerStyle={{ alignItems: 'center', gap: 8, paddingBottom: 8 }}
                  >
                    {skinsLoading ? (
                      <ActivityIndicator
                        color="#3d2b1f"
                        size={isCompact ? 'large' : 'small'}
                        style={{ marginTop: 20 }}
                      />
                    ) : sortedSkins.length === 0 ? (
                      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <Text
                          style={[styles.comingSoonText, isCompact && compactStyles.comingSoonText]}
                        >
                          No skins yet
                        </Text>
                        <Text
                          style={[styles.emptySubtext, isCompact && compactStyles.emptySubtext]}
                        >
                          Visit the Marketplace to browse skins
                        </Text>
                      </View>
                    ) : (
                      <View style={[styles.skinGrid, isCompact && compactStyles.skinGrid]}>
                        {sortedSkins.map((skin, idx) => {
                          const isEquipped = profile?.equippedSkin?.equals(skin.address) ?? false;
                          return (
                            <FocusGlow
                              key={skin.address.toBase58()}
                              active={isController && skinsFocus === idx}
                            >
                              <NftCard
                                name={skin.name}
                                image={getSkinImage(skin.name)}
                                isEquipped={isEquipped}
                                actionLabel={isEquipped ? 'Unequip' : 'Equip'}
                                onAction={
                                  isEquipped
                                    ? async () => {
                                        playSfx('ui_click');
                                        await unequipSkin();
                                        refresh();
                                        fetchUserAssets();
                                      }
                                    : async () => {
                                        playSfx('ui_click');
                                        await equipSkin(skin.address);
                                        refresh();
                                        fetchUserAssets();
                                      }
                                }
                                disabled={equipLoading}
                                isCompact={isCompact}
                              />
                            </FocusGlow>
                          );
                        })}
                      </View>
                    )}
                  </ScrollView>
                  {isController && (
                    <View
                      style={[
                        styles.controllerCloseHint,
                        isCompact && compactStyles.controllerCloseHint,
                      ]}
                    >
                      {sortedSkins.length > 0 && (
                        <>
                          <Image
                            source={iconDirSource}
                            style={{ width: isCompact ? 40 : 18, height: isCompact ? 40 : 18, transform: [{ rotate: '-90deg' }] }}
                            resizeMode="contain"
                          />
                          <Image
                            source={iconDirSource}
                            style={{ width: isCompact ? 40 : 18, height: isCompact ? 40 : 18, transform: [{ rotate: '90deg' }] }}
                            resizeMode="contain"
                          />
                          <Text
                            style={[
                              styles.controllerCloseHintText,
                              isCompact && compactStyles.controllerCloseHintText,
                            ]}
                          >
                            Navigate
                          </Text>
                          <Image
                            source={iconASource}
                            style={{
                              width: isCompact ? 40 : 18,
                              height: isCompact ? 40 : 18,
                              marginLeft: 8,
                            }}
                            resizeMode="contain"
                          />
                          <Text
                            style={[
                              styles.controllerCloseHintText,
                              isCompact && compactStyles.controllerCloseHintText,
                            ]}
                          >
                            {sortedSkins[skinsFocus] &&
                            (profile?.equippedSkin?.equals(sortedSkins[skinsFocus].address) ?? false)
                              ? 'Unequip'
                              : 'Equip'}
                          </Text>
                        </>
                      )}
                      <Image
                        source={iconBSource}
                        style={{
                          width: isCompact ? 40 : 18,
                          height: isCompact ? 40 : 18,
                          marginLeft: 8,
                        }}
                        resizeMode="contain"
                      />
                      <Text
                        style={[
                          styles.controllerCloseHintText,
                          isCompact && compactStyles.controllerCloseHintText,
                        ]}
                      >
                        Close
                      </Text>
                    </View>
                  )}
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
                <View
                  style={[styles.marketplaceInner, isCompact && compactStyles.marketplaceInner]}
                >
                  <View style={styles.modalHeader}>
                    <Text style={[styles.modalTitle, isCompact && compactStyles.modalTitle]}>
                      Quests
                    </Text>
                    {!isController && (
                      <TouchableOpacity
                        onPress={() => {
                          playSfx('ui_click');
                          setShowQuests(false);
                        }}
                        style={styles.closeButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Text
                          style={[
                            styles.closeButtonText,
                            isCompact && compactStyles.closeButtonText,
                          ]}
                        >
                          ✕
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <ScrollView
                    style={{ flex: 1, width: '100%' }}
                    contentContainerStyle={{ gap: 8, paddingBottom: 8, paddingHorizontal: 10 }}
                  >
                    {questsLoading ? (
                      <ActivityIndicator
                        color="#3d2b1f"
                        size={isCompact ? 'large' : 'small'}
                        style={{ marginTop: 20 }}
                      />
                    ) : quests.length === 0 ? (
                      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <Text
                          style={[styles.comingSoonText, isCompact && compactStyles.comingSoonText]}
                        >
                          No active quests
                        </Text>
                      </View>
                    ) : (
                      <>
                        {quests.map((quest, idx) => {
                          const objectiveLabel = getObjectiveLabel(quest.definition);
                          const rewardLabel = getRewardLabel(quest.definition);
                          const qt = quest.definition.questType;
                          const type =
                            'daily' in qt ? 'Daily' : 'weekly' in qt ? 'Weekly' : 'Seasonal';
                          return (
                            <FocusGlow
                              key={quest.definition.questId}
                              active={isController && questsFocus === idx}
                            >
                              <QuestCard
                                objectiveText={objectiveLabel}
                                questType={type}
                                progress={quest.progress?.progress ?? 0}
                                target={quest.definition.objectiveCount}
                                rewardText={rewardLabel}
                                isCompleted={quest.progress?.completed ?? false}
                                isClaimed={quest.progress?.claimed ?? false}
                                isAccepted={quest.progress !== null}
                                onAccept={async () => {
                                  playSfx('ui_click');
                                  await acceptQuest(quest.definition.questId);
                                }}
                                onClaim={async () => {
                                  playSfx('ui_click');
                                  await claimReward(quest.definition.questId);
                                }}
                                disabled={questsLoading}
                                isCompact={isCompact}
                              />
                            </FocusGlow>
                          );
                        })}
                      </>
                    )}
                  </ScrollView>
                  {isController && (
                    <View
                      style={[
                        styles.controllerCloseHint,
                        isCompact && compactStyles.controllerCloseHint,
                      ]}
                    >
                      {quests.length > 0 && (
                        <>
                          <Image
                            source={iconDirSource}
                            style={{ width: isCompact ? 40 : 18, height: isCompact ? 40 : 18 }}
                            resizeMode="contain"
                          />
                          <Text
                            style={[
                              styles.controllerCloseHintText,
                              isCompact && compactStyles.controllerCloseHintText,
                            ]}
                          >
                            Navigate
                          </Text>
                          <Image
                            source={iconASource}
                            style={{
                              width: isCompact ? 40 : 18,
                              height: isCompact ? 40 : 18,
                              marginLeft: 8,
                            }}
                            resizeMode="contain"
                          />
                          <Text
                            style={[
                              styles.controllerCloseHintText,
                              isCompact && compactStyles.controllerCloseHintText,
                            ]}
                          >
                            {quests[questsFocus] && !quests[questsFocus].progress
                              ? 'Accept'
                              : quests[questsFocus]?.progress?.completed &&
                                  !quests[questsFocus]?.progress?.claimed
                                ? 'Claim'
                                : 'Select'}
                          </Text>
                        </>
                      )}
                      <Image
                        source={iconBSource}
                        style={{
                          width: isCompact ? 40 : 18,
                          height: isCompact ? 40 : 18,
                          marginLeft: 8,
                        }}
                        resizeMode="contain"
                      />
                      <Text
                        style={[
                          styles.controllerCloseHintText,
                          isCompact && compactStyles.controllerCloseHintText,
                        ]}
                      >
                        Close
                      </Text>
                    </View>
                  )}
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
                <View
                  style={[styles.marketplaceInner, isCompact && compactStyles.marketplaceInner]}
                >
                  <View style={styles.modalHeader}>
                    <Text style={[styles.modalTitle, isCompact && compactStyles.modalTitle]}>
                      Profile
                    </Text>
                    {!isController && (
                      <TouchableOpacity
                        onPress={() => {
                          playSfx('ui_click');
                          setShowProfile(false);
                        }}
                        style={styles.closeButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Text
                          style={[
                            styles.closeButtonText,
                            isCompact && compactStyles.closeButtonText,
                          ]}
                        >
                          ✕
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <ScrollView
                    style={{ flex: 1, width: '100%' }}
                    contentContainerStyle={{ gap: 16 }}
                  >
                    {/* Name Edit */}
                    <View style={styles.profileSection}>
                      <Text
                        style={[
                          styles.profileSectionTitle,
                          isCompact && compactStyles.profileSectionTitle,
                        ]}
                      >
                        Display Name
                      </Text>
                      <FocusGlow active={isController && showProfile && profileFocus === 0}>
                        <View style={styles.profileInputContainer}>
                          <TextInput
                            style={[
                              styles.profileInput,
                              isCompact && compactStyles.profileInput,
                              profileValidationError && styles.profileInputError,
                            ]}
                            value={profileName}
                            onChangeText={handleProfileNameChange}
                            placeholder="Enter your name"
                            placeholderTextColor="#888888"
                            maxLength={NAME_MAX_LENGTH}
                            editable={!isController && !profileSaving}
                          />
                          <Text
                            style={[
                              styles.profileCharCount,
                              isCompact && compactStyles.profileCharCount,
                            ]}
                          >
                            {profileName.length}/{NAME_MAX_LENGTH}
                          </Text>
                        </View>
                      </FocusGlow>
                      {profileValidationError && (
                        <Text
                          style={[
                            styles.profileErrorText,
                            isCompact && compactStyles.profileFeedbackText,
                          ]}
                        >
                          {profileValidationError}
                        </Text>
                      )}
                      {profileSuccessMessage && (
                        <Text
                          style={[
                            styles.profileSuccessText,
                            isCompact && compactStyles.profileFeedbackText,
                          ]}
                        >
                          {profileSuccessMessage}
                        </Text>
                      )}
                      <FocusGlow active={isController && showProfile && profileFocus === 1}>
                        <TouchableOpacity
                          onPress={handleProfileSave}
                          disabled={isProfileSaveDisabled}
                          activeOpacity={0.7}
                          style={{ alignItems: 'center', marginTop: 4 }}
                        >
                          <ImageBackground
                            source={buttonV3Source}
                            style={[
                              styles.profileSaveButton,
                              isCompact && compactStyles.profileSaveButton,
                              isProfileSaveDisabled && { opacity: 0.5 },
                            ]}
                            resizeMode="stretch"
                          >
                            {profileSaving ? (
                              <ActivityIndicator size="small" color="#3d2b1f" />
                            ) : (
                              <Text
                                style={[
                                  styles.profileSaveButtonText,
                                  isCompact && compactStyles.profileSaveButtonText,
                                ]}
                              >
                                Save
                              </Text>
                            )}
                          </ImageBackground>
                        </TouchableOpacity>
                      </FocusGlow>
                    </View>

                    {/* Statistics */}
                    <View style={styles.profileSection}>
                      <Text
                        style={[
                          styles.profileSectionTitle,
                          isCompact && compactStyles.profileSectionTitle,
                        ]}
                      >
                        Statistics
                      </Text>
                      <View style={styles.profileStatsGrid}>
                        <View style={styles.profileStatRow}>
                          <Text
                            style={[
                              styles.profileStatLabel,
                              isCompact && compactStyles.profileStatText,
                            ]}
                          >
                            Sessions Played
                          </Text>
                          <Text
                            style={[
                              styles.profileStatValue,
                              isCompact && compactStyles.profileStatText,
                            ]}
                          >
                            {profile?.totalRuns ?? 0}
                          </Text>
                        </View>
                        <View style={styles.profileStatRow}>
                          <Text
                            style={[
                              styles.profileStatLabel,
                              isCompact && compactStyles.profileStatText,
                            ]}
                          >
                            Current Level
                          </Text>
                          <Text
                            style={[
                              styles.profileStatValue,
                              isCompact && compactStyles.profileStatText,
                            ]}
                          >
                            {(profile?.currentLevel ?? 0) + 1} / 40
                          </Text>
                        </View>
                        <View style={styles.profileStatRow}>
                          <Text
                            style={[
                              styles.profileStatLabel,
                              isCompact && compactStyles.profileStatText,
                            ]}
                          >
                            Available Sessions
                          </Text>
                          <Text
                            style={[
                              styles.profileStatValue,
                              isCompact && compactStyles.profileStatText,
                            ]}
                          >
                            {profile?.availableRuns ?? 0}
                          </Text>
                        </View>
                        <View style={styles.profileStatRow}>
                          <Text
                            style={[
                              styles.profileStatLabel,
                              isCompact && compactStyles.profileStatText,
                            ]}
                          >
                            Member Since
                          </Text>
                          <Text
                            style={[
                              styles.profileStatValue,
                              isCompact && compactStyles.profileStatText,
                            ]}
                          >
                            {profile?.createdAt ? formatDate(profile.createdAt) : 'N/A'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </ScrollView>
                  {isController && (
                    <View style={[styles.settingsHints, isCompact && compactStyles.settingsHints]}>
                      <View style={styles.settingsHintRow}>
                        <Image
                          source={iconASource}
                          style={[
                            styles.settingsHintIcon,
                            isCompact && compactStyles.settingsHintIcon,
                          ]}
                          resizeMode="contain"
                        />
                        <Text
                          style={[
                            styles.settingsHintText,
                            isCompact && compactStyles.settingsHintText,
                          ]}
                        >
                          {profileFocus === 0 ? 'Edit Name' : 'Save'}
                        </Text>
                      </View>
                      <View style={styles.settingsHintRow}>
                        <Image
                          source={iconBSource}
                          style={[
                            styles.settingsHintIcon,
                            isCompact && compactStyles.settingsHintIcon,
                          ]}
                          resizeMode="contain"
                        />
                        <Text
                          style={[
                            styles.settingsHintText,
                            isCompact && compactStyles.settingsHintText,
                          ]}
                        >
                          Close
                        </Text>
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
                    onPress={() => {
                      playSfx('ui_click');
                      setShowPvP(false);
                    }}
                    style={[styles.pvpCloseButton, isCompact && compactStyles.pvpCloseButton]}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text
                      style={[
                        styles.pvpCloseButtonText,
                        isCompact && compactStyles.pvpCloseButtonText,
                      ]}
                    >
                      ✕
                    </Text>
                  </TouchableOpacity>
                )}
                {isController && (
                  <View style={[styles.modalHintBar, isCompact && compactStyles.modalHintBar]}>
                    <View style={styles.settingsHintRow}>
                      <Image
                        source={iconASource}
                        style={[
                          styles.settingsHintIcon,
                          isCompact && compactStyles.settingsHintIcon,
                        ]}
                        resizeMode="contain"
                      />
                      <Text
                        style={[
                          styles.settingsHintText,
                          isCompact && compactStyles.settingsHintText,
                        ]}
                      >
                        Select
                      </Text>
                    </View>
                    <View style={styles.settingsHintRow}>
                      <Image
                        source={iconBSource}
                        style={[
                          styles.settingsHintIcon,
                          isCompact && compactStyles.settingsHintIcon,
                        ]}
                        resizeMode="contain"
                      />
                      <Text
                        style={[
                          styles.settingsHintText,
                          isCompact && compactStyles.settingsHintText,
                        ]}
                      >
                        Close
                      </Text>
                    </View>
                  </View>
                )}
                <View style={[styles.pvpPapersStack, isCompact && compactStyles.pvpPapersStack]}>
                  <View
                    style={[
                      styles.pvpPaperGauntletWrap,
                      isCompact && compactStyles.pvpPaperGauntletWrap,
                      isController && { zIndex: pvpFocus === 0 ? 10 : 1 },
                    ]}
                  >
                    <FocusGlow active={isController && pvpFocus === 0}>
                      <TouchableOpacity onPress={handleGauntlet} activeOpacity={0.7}>
                        <Image
                          source={gauntletPaperSource}
                          style={[
                            styles.pvpPaperGauntlet,
                            isCompact && compactStyles.pvpPaperGauntlet,
                          ]}
                          resizeMode="contain"
                        />
                      </TouchableOpacity>
                    </FocusGlow>
                  </View>

                  <View
                    style={[
                      styles.pvpPaperDuelsWrap,
                      isCompact && compactStyles.pvpPaperDuelsWrap,
                      isController && { zIndex: pvpFocus === 1 ? 10 : 1 },
                    ]}
                  >
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

                  <View
                    style={[
                      styles.pvpPaperPitDraftWrap,
                      isCompact && compactStyles.pvpPaperPitDraftWrap,
                      isController && { zIndex: pvpFocus === 2 ? 10 : 1 },
                    ]}
                  >
                    <FocusGlow active={isController && pvpFocus === 2}>
                      <TouchableOpacity onPress={handlePitDraft} activeOpacity={0.7}>
                        <Image
                          source={pitDraftPaperSource}
                          style={[
                            styles.pvpPaperPitDraft,
                            isCompact && compactStyles.pvpPaperPitDraft,
                          ]}
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

      <BetaWelcomeModal
        visible={showBetaWelcome}
        onClose={() => setShowBetaWelcome(false)}
      />

      {/* Controller button hints */}
      <ControllerHints hints={controllerHints} horizontal size="large" />
    </Animated.View>
  );
}

function getObjectiveLabel(def: any): string {
  const ot = def.objectiveType;
  const count = def.objectiveCount;
  if ('winBattles' in ot) return `Win ${count} battles`;
  if ('completeLevels' in ot) return `Complete ${count} levels`;
  if ('playPvpMatches' in ot) return `Play ${count} PvP matches`;
  if ('defeatBosses' in ot) return `Defeat ${count} bosses`;
  if ('collectGold' in ot) return `Collect ${count} gold`;
  return `Complete objective (${count})`;
}

function getRewardLabel(def: any): string {
  const rt = def.rewardType;
  if ('gauntletBooster' in rt) return 'Gauntlet Booster';
  if ('skin' in rt) return 'Skin NFT';
  if ('nftItem' in rt) return 'NFT Item';
  return 'Reward';
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
    color: '#000000',
    lineHeight: 16,
  },
  walletAddress: {
    fontFamily: Typography.number,
    fontSize: 11,
    color: '#000000',
    fontWeight: 'bold',
    lineHeight: 12,
  },
  walletBalance: {
    fontFamily: Typography.number,
    fontSize: 10,
    color: '#888888',
    fontWeight: 'bold',
    lineHeight: 11,
    marginTop: 3,
  },
  guestModeDescription: {
    fontFamily: Typography.body,
    fontSize: 10,
    color: '#888888',
    lineHeight: 14,
    marginTop: 6,
    textAlign: 'left',
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
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
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
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
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
    width: 380,
    height: 420,
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
    gap: 20,
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
  settingGlow: {
    width: '100%',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  settingLabel: {
    fontFamily: Typography.header,
    fontSize: 13,
    color: '#3d2b1f',
    width: 90,
    flexShrink: 0,
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
  warningModalContent: {
    width: 320,
    height: 280,
    paddingHorizontal: 26,
    paddingTop: 26,
    paddingBottom: 22,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  warningText: {
    marginTop: 10,
    textAlign: 'center',
    fontFamily: Typography.body,
    fontSize: 14,
    lineHeight: 20,
    color: '#5c4033',
  },
  warningErrorText: {
    marginTop: 10,
    textAlign: 'center',
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#a33a3a',
  },
  warningActions: {
    marginTop: 18,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  warningButton: {
    width: 126,
    height: 44,
  },
  warningButtonText: {
    fontFamily: Typography.button,
    fontSize: 16,
    color: '#3d2b1f',
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
  skinGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
    justifyContent: 'center',
  },
  emptySubtext: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#8a7a6a',
    marginTop: 4,
    textAlign: 'center',
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
  walletBalance: {
    fontSize: 20,
    lineHeight: 22,
  },
  guestModeDescription: {
    fontSize: 20,
    lineHeight: 26,
    marginTop: 12,
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
  emptySubtext: {
    fontSize: 22,
  },
  skinGrid: {
    gap: 32,
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
    width: 760,
    height: 840,
    padding: 80,
  },
  settingsModalBody: {
    flex: 1,
    justifyContent: 'center',
  },
  settingLabel: {
    fontSize: 26,
    width: 180,
  },
  resetButton: {
    width: 360,
    height: 96,
  },
  disconnectText: {
    fontSize: 32,
  },
  warningModalContent: {
    width: 620,
    height: 520,
    paddingHorizontal: 44,
    paddingTop: 42,
    paddingBottom: 32,
  },
  warningText: {
    marginTop: 16,
    fontSize: 30,
    lineHeight: 42,
  },
  warningErrorText: {
    marginTop: 16,
    fontSize: 24,
  },
  warningButton: {
    width: 240,
    height: 84,
  },
  warningButtonText: {
    fontSize: 30,
  },

  // Controller close hint — scaled up for compact
  controllerCloseHint: {
    bottom: 32,
    left: 32,
    gap: 12,
    borderRadius: 0,
    borderWidth: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
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
    borderRadius: 0,
    borderWidth: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  settingsHintIcon: {
    width: 36,
    height: 36,
  },
  settingsHintText: {
    fontSize: 22,
  },
});
