import React, { useState, useCallback, useRef, useEffect } from 'react';
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
import { MAX_CAMPAIGN_LEVEL } from '../hooks/useMapGenerator';
import type { CombatSpeed } from '../contexts/CombatContext';

const defaultMoleImageSource = require('../../assets/entities/characters/default-mole.png');
const backgroundImageSource = require('../../assets/ui/backgrounds/hub-background.png');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.png');
const buttonV2Source = require('../../assets/ui/buttons/button-v2.png');
const buttonV3Source = require('../../assets/ui/buttons/button-v3.png');
const buttonV4Source = require('../../assets/ui/buttons/button-v4.png');
const paperPanelSource = require('../../assets/ui/panels/paper-panel.png');
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
    updateDefaultCombatSpeed,
    refresh,
    mode,
  } = useProfile();
  const isGuest = mode === 'guest';
  const { activeSessions } = useSession();
  const { state: gameState, dispatch } = useGame();
  const { purchaseRuns, availableRuns } = useProfile();
  const [showSettings, setShowSettings] = useState(false);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [marketplaceTab, setMarketplaceTab] = useState<'skins' | 'items' | 'pve'>('pve');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [combatSpeed, setCombatSpeed] = useState<CombatSpeed>('normal');
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

      if (gameState?.phase === GamePhase.Defeat || gameState?.phase === GamePhase.Victory) {
        dispatch({ type: 'RETURN_TO_MENU' });
      }

      dispatch({ type: 'START_GAME', seed });
      navigation.navigate('Game');
    } else {
      // Navigate to campaign selection screen
      navigation.navigate('CampaignSelect');
    }
  }, [navigation, isGuest, dispatch, gameState?.phase]);

  const handlePlayPvP = () => {
    Alert.alert('Coming Soon', 'PvP Gauntlet is under development!');
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
    Alert.alert('Coming Soon', 'Leaderboard is under development!');
  };

  const handleQuests = () => {
    Alert.alert('Coming Soon', 'Quests are under development!');
  };

  const handleSkins = () => {
    Alert.alert('Coming Soon', 'Skins are under development!');
  };

  const handleItems = () => {
    Alert.alert('Coming Soon', 'Items are under development!');
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Image source={backgroundImageSource} style={styles.backgroundImage} resizeMode="stretch" />
      <ScrollView
        contentContainerStyle={{ flex: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FABC0F" />
        }
      >
        <View style={styles.hubLayout}>
          {/* TOP LEFT - Player Info */}
          <View style={styles.topLeft}>
            <TouchableOpacity
              onPress={() => navigation.navigate('ProfileSettings')}
              activeOpacity={0.8}
            >
              <ImageBackground
                source={walletImageSource}
                style={styles.playerPanel}
                resizeMode="stretch"
              >
                {/* Avatar Square */}
                <View style={styles.avatarContainer}>
                  <Image
                    source={defaultMoleImageSource}
                    style={styles.avatarImage}
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
                      <Text style={styles.playerName} numberOfLines={1}>
                        {profile?.name ?? 'Adventurer'}
                      </Text>
                      {isGuest ? (
                        <Text style={styles.walletAddress}>(GUEST)</Text>
                      ) : profile?.owner ? (
                        <Text style={styles.walletAddress}>
                          {shortenAddress(profile.owner.toBase58())}
                        </Text>
                      ) : null}
                    </>
                  )}
                </View>
              </ImageBackground>
            </TouchableOpacity>

            {/* Items Button - Below Profile */}
            {!isGuest && (
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

          </View>

          {/* TOP CENTER - Points */}
          <View style={styles.topCenter}>
            {!isGuest && (
              <ImageBackground
                source={buttonV3Source}
                style={styles.pointsPanel}
                resizeMode="stretch"
              >
                <Text style={styles.pointsLabel}>POINTS</Text>
                <Text style={[styles.pointsValue, { color: '#FABC0F' }]}>0</Text>
              </ImageBackground>
            )}
          </View>

          {/* TOP RIGHT - Settings */}
          <View style={styles.topRight}>
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
          </View>

          {/* CENTER - Character */}
          <View style={styles.center}>
            <View style={styles.characterContainer}>
              <View style={styles.characterShadow}>
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
                  <Ellipse cx="50" cy="11" rx="50" ry="11" fill="url(#diagonalLines)" />
                </Svg>
              </View>
              <Image
                source={defaultMoleImageSource}
                style={styles.characterImage}
                resizeMode="contain"
              />
            </View>
          </View>

          {/* BOTTOM LEFT - Secondary Navigation */}
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
                <TouchableOpacity onPress={handleLeaderboard} activeOpacity={0.7}>
                  <ImageBackground
                    source={buttonV1Source}
                    style={styles.navButton}
                    resizeMode="stretch"
                  >
                    <Text style={styles.navButtonText}>Ranks</Text>
                  </ImageBackground>
                </TouchableOpacity>

                <TouchableOpacity onPress={handleSkins} activeOpacity={0.7}>
                  <ImageBackground
                    source={buttonV1Source}
                    style={styles.navButton}
                    resizeMode="stretch"
                  >
                    <Text style={styles.navButtonText}>Skins</Text>
                  </ImageBackground>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* BOTTOM RIGHT - Primary Actions */}
          <View style={styles.bottomRight}>
            {/* Marketplace above play buttons - hidden for guests */}
            {!isGuest && (
              <TouchableOpacity onPress={handleMarketplace} activeOpacity={0.7}>
                <ImageBackground
                  source={buttonV1Source}
                  style={styles.shopButton}
                  resizeMode="stretch"
                >
                  <Text style={styles.shopButtonText}>Marketplace</Text>
                </ImageBackground>
              </TouchableOpacity>
            )}

            {/* Campaign/Play and PVP side by side */}
            <View style={styles.playButtonsRow}>
              <TouchableOpacity onPress={handlePlayPvE} activeOpacity={0.7}>
                <ImageBackground
                  source={buttonV4Source}
                  style={styles.campaignButton}
                  resizeMode="stretch"
                >
                  <Text style={styles.campaignButtonText}>{isGuest ? 'Play' : 'Campaign'}</Text>
                  {isLoading ? (
                    <Skeleton width={50} height={12} style={{ marginTop: 4, marginBottom: 2 }} />
                  ) : (
                    !isGuest && (
                      <Text style={styles.buttonSub}>
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
                    style={styles.gauntletButton}
                    resizeMode="stretch"
                  >
                    <Text style={styles.gauntletButtonText}>PVP</Text>
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
                      currentSpeed={combatSpeed}
                      onSpeedChange={(speed) => {
                        setCombatSpeed(speed);
                        updateDefaultCombatSpeed(speed);
                      }}
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

                        <Text style={styles.bundleCurrent}>
                          Current: {availableRuns} sessions
                        </Text>

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
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    width: 100,
    height: 53,
  },
  pointsLabel: {
    fontFamily: Typography.header,
    fontSize: 12,
    letterSpacing: 1,
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
    marginBottom: 30,
    position: 'relative',
  },
  modalTitle: {
    fontFamily: Typography.header,
    fontSize: 32,
    marginTop: 12,
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
});
