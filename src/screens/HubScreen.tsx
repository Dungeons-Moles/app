import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useWallet } from '../contexts/WalletContext';
import { useProfile } from '../contexts/ProfileContext';
import { shortenAddress } from '../utils/storage';
import { RootStackParamList } from '../navigation';

type HubScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Hub'>;
};

export function HubScreen({ navigation }: HubScreenProps) {
  const { wallet, disconnect } = useWallet();
  const { profile, clearProfile } = useProfile();
  const [showSettings, setShowSettings] = useState(false);

  const handleDisconnect = async () => {
    await clearProfile();
    disconnect();
    navigation.reset({
      index: 0,
      routes: [{ name: 'Account' }],
    });
  };

  const handlePlayPvE = () => {
    Alert.alert('Coming Soon', 'PvE Campaign is under development!');
  };

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
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.hubLayout}>
        {/* TOP LEFT - Player Info */}
        <View style={styles.topLeft}>
          <View style={styles.playerPanel}>
            <Text style={styles.playerName}>{profile?.displayName}</Text>
            <View style={styles.walletRow}>
              <View style={styles.walletDot} />
              <Text style={styles.walletAddress}>
                {shortenAddress(wallet.address || '')}
              </Text>
            </View>
          </View>
        </View>

        {/* TOP CENTER - Points */}
        <View style={styles.topCenter}>
          <View style={styles.pointsPanel}>
            <Text style={styles.pointsLabel}>POINTS</Text>
            <Text style={styles.pointsValue}>0</Text>
          </View>
        </View>

        {/* TOP RIGHT - Settings */}
        <View style={styles.topRight}>
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => setShowSettings(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.settingsIcon}>⚙</Text>
          </TouchableOpacity>
        </View>

        {/* CENTER - Character */}
        <View style={styles.center}>
          <Text style={styles.character}>🦦</Text>
        </View>

        {/* BOTTOM LEFT - Secondary Navigation */}
        <View style={styles.bottomLeft}>
          <TouchableOpacity
            style={styles.navButton}
            onPress={handleQuests}
            activeOpacity={0.7}
          >
            <Text style={styles.navButtonText}>Quests</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navButton}
            onPress={handleLeaderboard}
            activeOpacity={0.7}
          >
            <Text style={styles.navButtonText}>Ranks</Text>
          </TouchableOpacity>
        </View>

        {/* BOTTOM RIGHT - Primary Actions */}
        <View style={styles.bottomRight}>
          {/* Shop above play buttons */}
          <TouchableOpacity
            style={styles.shopButton}
            onPress={handleMarketplace}
            activeOpacity={0.7}
          >
            <Text style={styles.shopButtonText}>Shop</Text>
          </TouchableOpacity>

          {/* Campaign and Gauntlet side by side */}
          <View style={styles.playButtonsRow}>
            <TouchableOpacity
              style={styles.campaignButton}
              onPress={handlePlayPvE}
              activeOpacity={0.7}
            >
              <Text style={styles.campaignButtonText}>Campaign</Text>
              <Text style={styles.buttonSub}>PvE</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.gauntletButton}
              onPress={handlePlayPvP}
              activeOpacity={0.7}
            >
              <Text style={styles.gauntletButtonText}>Gauntlet</Text>
              <Text style={styles.gauntletSub}>PvP</Text>
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

            <TouchableOpacity
              style={styles.modalButton}
              onPress={handleDisconnect}
              activeOpacity={0.7}
            >
              <Text style={styles.disconnectText}>Disconnect Wallet</Text>
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
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
    backgroundColor: '#151518',
    borderWidth: 1,
    borderColor: '#2a2a30',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  playerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#c8c8c8',
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  walletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4a7c4a',
    marginRight: 6,
  },
  walletAddress: {
    fontSize: 11,
    color: '#666666',
    fontFamily: 'monospace',
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
    backgroundColor: '#151518',
    borderWidth: 1,
    borderColor: '#2a2a30',
    paddingVertical: 6,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  pointsLabel: {
    fontSize: 10,
    color: '#555555',
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
    backgroundColor: '#151518',
    borderWidth: 1,
    borderColor: '#2a2a30',
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsIcon: {
    fontSize: 18,
    color: '#888888',
  },

  // CENTER - Character
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    backgroundColor: '#151518',
    borderWidth: 1,
    borderColor: '#2a2a30',
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    minWidth: 80,
  },
  navButtonText: {
    fontSize: 12,
    color: '#888888',
    fontWeight: '500',
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
    backgroundColor: '#151518',
    borderWidth: 1,
    borderColor: '#2a2a30',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  shopButtonText: {
    fontSize: 12,
    color: '#888888',
    fontWeight: '500',
  },
  playButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  campaignButton: {
    backgroundColor: '#151518',
    borderWidth: 1,
    borderColor: '#2a2a30',
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    minWidth: 90,
  },
  campaignButtonText: {
    fontSize: 13,
    color: '#888888',
    fontWeight: '600',
  },
  buttonSub: {
    fontSize: 10,
    color: '#555555',
    marginTop: 2,
  },
  gauntletButton: {
    backgroundColor: '#1a1215',
    borderWidth: 1,
    borderColor: '#6b2020',
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    minWidth: 90,
  },
  gauntletButtonText: {
    fontSize: 13,
    color: '#a33a3a',
    fontWeight: '600',
  },
  gauntletSub: {
    fontSize: 10,
    color: '#6b2020',
    marginTop: 2,
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
    color: '#888888',
  },
  disconnectText: {
    fontSize: 14,
    color: '#a33a3a',
  },
});
