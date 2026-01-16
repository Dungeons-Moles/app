import React, { useState, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useProfile } from '../contexts/ProfileContext';
import { useGame, GamePhase } from '../contexts/GameContext';
import { shortenAddress } from '../utils/storage';
import { RootStackParamList } from '../navigation';
import { SpeedControls } from '../components/combat';
import { ProfileCard } from '../components/profile/ProfileCard';
import { Typography } from '../theme/typography';
import type { CombatSpeed } from '../contexts/CombatContext';

const defaultMoleImageSource = require('../../assets/characters/default-mole.png');
const backgroundImageSource = require('../../assets/hub/background.png');
const buttonV1Source = require('../../assets/hub/button-v1.png');
const buttonV2Source = require('../../assets/hub/button-v2.png');
const buttonV3Source = require('../../assets/hub/button-v3.png');
const buttonV4Source = require('../../assets/hub/button-v4.png');
const paperPanelSource = require('../../assets/hub/paper-panel.png');
const engineImageSource = require('../../assets/hub/engine.png');
const walletImageSource = require('../../assets/hub/wallet.png');

type HubScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Hub'>;
};

export function HubScreen({ navigation }: HubScreenProps) {
  const { profile, clearProfile, updateDefaultCombatSpeed } = useProfile();
  const { state: gameState, dispatch } = useGame();
  const [showSettings, setShowSettings] = useState(false);
  const [combatSpeed, setCombatSpeed] = useState<CombatSpeed>('normal');

  const handleResetProfile = async () => {
    await clearProfile();
    navigation.reset({
      index: 0,
      routes: [{ name: 'Account' }],
    });
  };

  const handlePlayPvE = useCallback(() => {
    // Generate a random seed for the game
    const seed = Math.floor(Math.random() * 2147483647);

    if (gameState?.phase === GamePhase.Defeat || gameState?.phase === GamePhase.Victory) {
      dispatch({ type: 'RETURN_TO_MENU' });
    }

    // Start the game with the seed
    dispatch({ type: 'START_GAME', seed });

    // Navigate to the game screen
    navigation.navigate('Game');
  }, [dispatch, navigation, gameState?.phase]);

  const handlePlayPvP = () => {
    Alert.alert('Coming Soon', 'PvP Gauntlet is under development!');
  };

  const handleMarketplace = () => {
    Alert.alert('Coming Soon', 'Marketplace is under development!');
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

  return (
    <View style={styles.container}>
      <Image source={backgroundImageSource} style={styles.backgroundImage} resizeMode="stretch" />
      <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
        <View style={styles.hubLayout}>
          {/* TOP LEFT - Player Info */}
          <View style={styles.topLeft}>
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
                <Text style={styles.playerName} numberOfLines={1}>
                  {profile?.name ?? 'Adventurer'}
                </Text>
                {profile?.owner ? (
                  <Text style={styles.walletAddress}>
                    {shortenAddress(profile.owner.toBase58())}
                  </Text>
                ) : null}
              </View>
            </ImageBackground>
            {profile ? (
              <View style={styles.profileCardWrapper}>
                <ProfileCard profile={profile} />
              </View>
            ) : null}
          </View>

          {/* TOP CENTER - Points */}
          <View style={styles.topCenter}>
            <ImageBackground
              source={buttonV3Source}
              style={styles.pointsPanel}
              resizeMode="stretch"
            >
              <Text style={styles.pointsLabel}>POINTS</Text>
              <Text style={[styles.pointsValue, { color: '#FABC0F' }]}>0</Text>
            </ImageBackground>
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
              <View style={styles.characterShadow} />
              <Image
                source={defaultMoleImageSource}
                style={styles.characterImage}
                resizeMode="contain"
              />
            </View>
          </View>

          {/* BOTTOM LEFT - Secondary Navigation */}
          <View style={styles.bottomLeft}>
            <TouchableOpacity onPress={handleQuests} activeOpacity={0.7}>
              <ImageBackground
                source={buttonV1Source}
                style={styles.navButton}
                resizeMode="stretch"
              >
                <Text style={styles.navButtonText}>Quests</Text>
              </ImageBackground>
            </TouchableOpacity>

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
          </View>

          {/* BOTTOM RIGHT - Primary Actions */}
          <View style={styles.bottomRight}>
            {/* Marketplace above play buttons */}
            <TouchableOpacity onPress={handleMarketplace} activeOpacity={0.7}>
              <ImageBackground
                source={buttonV1Source}
                style={styles.shopButton}
                resizeMode="stretch"
              >
                <Text style={styles.shopButtonText}>Marketplace</Text>
              </ImageBackground>
            </TouchableOpacity>

            {/* Campaign and Gauntlet side by side */}
            <View style={styles.playButtonsRow}>
              <TouchableOpacity onPress={handlePlayPvE} activeOpacity={0.7}>
                <ImageBackground
                  source={buttonV4Source}
                  style={styles.campaignButton}
                  resizeMode="stretch"
                >
                  <Text style={styles.campaignButtonText}>Campaign</Text>
                  <Text style={styles.buttonSub}>{(profile?.currentLevel ?? 0) + 1} / 80</Text>
                </ImageBackground>
              </TouchableOpacity>

              <TouchableOpacity onPress={handlePlayPvP} activeOpacity={0.7}>
                <ImageBackground
                  source={buttonV2Source}
                  style={styles.gauntletButton}
                  resizeMode="stretch"
                >
                  <Text style={styles.gauntletButtonText}>PVP</Text>
                </ImageBackground>
              </TouchableOpacity>
            </View>
          </View>
        </View>

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
                        <Text style={styles.disconnectText}>Reset Profile</Text>
                      </ImageBackground>
                    </TouchableOpacity>
                  </View>
                </ImageBackground>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </SafeAreaView>
    </View>
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
    top: 16,
    left: 16,
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
    top: 16,
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
    top: 16,
    right: 16,
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
    borderRadius: 10,
    backgroundColor: '#BAA071',
    opacity: 0.5,
    zIndex: 0,
  },
  character: {
    fontSize: 80,
  },

  // BOTTOM LEFT - Secondary Navigation
  bottomLeft: {
    position: 'absolute',
    bottom: 16,
    left: 16,
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
  sideBySideRow: {
    flexDirection: 'row',
    gap: 8,
  },

  // BOTTOM RIGHT - Primary Actions
  bottomRight: {
    position: 'absolute',
    bottom: 16,
    right: 16,
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
    width: 380,
    height: 380,
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
    color: '#a33a3a', // Red color
  },
});
