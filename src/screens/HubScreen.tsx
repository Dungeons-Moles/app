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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useProfile } from '../contexts/ProfileContext';
import { useGame, GamePhase } from '../contexts/GameContext';
import { shortenAddress } from '../utils/storage';
import { RootStackParamList } from '../navigation';
import { SpeedControls } from '../components/combat';

const defaultMoleImageSource = require('../../assets/characters/default-mole.png');
const backgroundImageSource = require('../../assets/hub/background.png');
const buttonV1Source = require('../../assets/hub/button-v1.png');
const buttonV2Source = require('../../assets/hub/button-v2.png');
const buttonV3Source = require('../../assets/hub/button-v3.png');
const engineImageSource = require('../../assets/hub/engine.png');
const walletImageSource = require('../../assets/hub/wallet.png');

type HubScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Hub'>;
};

export function HubScreen({ navigation }: HubScreenProps) {
  const { profile, clearProfile, updateDefaultCombatSpeed } = useProfile();
  const { state: gameState, dispatch } = useGame();
  const [showSettings, setShowSettings] = useState(false);

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
                  {profile?.displayName}
                </Text>
                {profile?.walletAddress ? (
                  <Text style={styles.walletAddress}>{shortenAddress(profile.walletAddress)}</Text>
                ) : null}
              </View>
            </ImageBackground>
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

            <TouchableOpacity onPress={handleLeaderboard} activeOpacity={0.7}>
              <ImageBackground
                source={buttonV1Source}
                style={styles.navButton}
                resizeMode="stretch"
              >
                <Text style={styles.navButtonText}>Ranks</Text>
              </ImageBackground>
            </TouchableOpacity>
          </View>

          {/* BOTTOM RIGHT - Primary Actions */}
          <View style={styles.bottomRight}>
            {/* Shop above play buttons */}
            <TouchableOpacity onPress={handleMarketplace} activeOpacity={0.7}>
              <ImageBackground
                source={buttonV1Source}
                style={styles.shopButton}
                resizeMode="stretch"
              >
                <Text style={styles.shopButtonText}>Shop</Text>
              </ImageBackground>
            </TouchableOpacity>

            {/* Campaign and Gauntlet side by side */}
            <View style={styles.playButtonsRow}>
              <TouchableOpacity onPress={handlePlayPvE} activeOpacity={0.7}>
                <ImageBackground
                  source={buttonV1Source}
                  style={styles.campaignButton}
                  resizeMode="stretch"
                >
                  <Text style={styles.campaignButtonText}>Campaign</Text>
                  <Text style={styles.buttonSub}>PvE</Text>
                </ImageBackground>
              </TouchableOpacity>

              <TouchableOpacity onPress={handlePlayPvP} activeOpacity={0.7}>
                <ImageBackground
                  source={buttonV2Source}
                  style={styles.gauntletButton}
                  resizeMode="stretch"
                >
                  <Text style={styles.gauntletButtonText}>Gauntlet</Text>
                  <Text style={styles.gauntletSub}>PvP</Text>
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
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Settings</Text>

              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Default combat speed</Text>
                <SpeedControls
                  currentSpeed={profile?.defaultCombatSpeed ?? 'normal'}
                  onSpeedChange={updateDefaultCombatSpeed}
                />
              </View>

              <TouchableOpacity
                style={styles.modalButton}
                onPress={handleResetProfile}
                activeOpacity={0.7}
              >
                <Text style={styles.disconnectText}>Reset Profile</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => setShowSettings(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
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
  playerPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 4,
    width: 160, // (46 height * 2.6 ratio)
    height: 53,
    ...(Platform.OS === 'web' ? { width: 160, height: 53 } : {}),
  },
  avatarContainer: {
    width: 40,
    height: 39,
    borderRadius: 2,
    overflow: 'hidden',
    marginLeft: 2,
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
    fontSize: 12, // Bigger
    fontWeight: '600',
    color: '#c8c8c8',
    lineHeight: 14,
  },
  walletAddress: {
    fontSize: 10, // Bigger
    color: '#888888',
    fontFamily: 'monospace',
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
    fontSize: 10,
    letterSpacing: 1,
  },
  pointsValue: {
    fontSize: 16,
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
    marginTop: 50,
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
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
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
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: 100,
    height: 45,
  },
  shopButtonText: {
    fontSize: 12,
    fontWeight: '500',
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
    fontSize: 13,
    fontWeight: '600',
  },
  buttonSub: {
    fontSize: 10,
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
    fontSize: 13,
    fontWeight: '600',
  },
  gauntletSub: {
    fontSize: 10,
    color: '#a33a3a',
    marginTop: 2,
    marginBottom: 4,
  },

  // MODAL
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#151518',
    borderWidth: 1,
    borderColor: '#2a2a30',
    padding: 24,
    width: '100%',
    maxWidth: 300,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#c8c8c8',
    marginBottom: 20,
    textAlign: 'center',
  },
  settingRow: {
    gap: 10,
    marginBottom: 16,
  },
  settingLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalButton: {
    backgroundColor: '#0a0a0f',
    borderWidth: 1,
    borderColor: '#2a2a30',
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  modalButtonText: {
    fontSize: 14,
  },
  disconnectText: {
    fontSize: 14,
    color: '#a33a3a',
  },
});
