import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useProfile } from '../contexts/ProfileContext';
import { shortenAddress } from '../utils/storage';
import { RootStackParamList } from '../navigation';
import { GameCanvas } from '../game/GameCanvas';

type AccountScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Account'>;
};

// Wallet login disabled: create a local guest profile on startup.
const GUEST_WALLET_ADDRESS = 'GUEST0000';

export function AccountScreen({ navigation }: AccountScreenProps) {
  const { profile, isLoading: isProfileLoading, createProfile } = useProfile();
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);

  useEffect(() => {
    if (isProfileLoading || profile || isCreatingProfile) {
      return;
    }

    setIsCreatingProfile(true);
    createProfile(GUEST_WALLET_ADDRESS)
      .catch((error) => {
        console.error('Failed to create guest profile:', error);
      })
      .finally(() => setIsCreatingProfile(false));
  }, [createProfile, isCreatingProfile, isProfileLoading, profile]);

  const handleContinue = () => {
    navigation.navigate('Hub');
  };

  const isLoading = isProfileLoading || isCreatingProfile;
  const canContinue = Boolean(profile);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.content}>
        {/* Left Panel - Branding */}
        <View style={styles.leftPanel}>
          <View style={styles.brandingContainer}>
            <GameCanvas width={140} height={140} />
            <Text style={styles.title}>Dungeons & Moles</Text>
          </View>
        </View>

        {/* Right Panel - Actions */}
        <View style={styles.rightPanel}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#888888" />
              <Text style={styles.loadingText}>
                {isCreatingProfile ? 'Creating profile...' : 'Loading...'}
              </Text>
            </View>
          ) : canContinue ? (
            <View style={styles.connectedContainer}>
              <View style={styles.profileCard}>
                <Text style={styles.profileLabel}>ADVENTURER</Text>
                <Text style={styles.profileName}>{profile?.displayName}</Text>
                <View style={styles.walletRow}>
                  <View style={styles.walletDot} />
                  <Text style={styles.walletAddress}>
                    {shortenAddress(profile?.walletAddress || '')}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.continueButton}
                onPress={handleContinue}
                activeOpacity={0.7}
              >
                <Text style={styles.continueButtonText}>Enter Game</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.connectContainer}>
              <Text style={styles.connectTitle}>Profile unavailable</Text>
              <Text style={styles.connectPrompt}>
                Create a local profile to continue
              </Text>

              <TouchableOpacity
                style={styles.connectButton}
                onPress={() => {
                  setIsCreatingProfile(true);
                  createProfile(GUEST_WALLET_ADDRESS)
                    .catch((error) => {
                      console.error('Failed to create guest profile:', error);
                    })
                    .finally(() => setIsCreatingProfile(false));
                }}
                disabled={isLoading}
                activeOpacity={0.7}
              >
                <Text style={styles.connectButtonText}>Create Profile</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  // Left Panel - Branding
  leftPanel: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    borderRightWidth: 1,
    borderRightColor: '#1a1a20',
  },
  brandingContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#c8c8c8',
    marginTop: 16,
    textAlign: 'center',
  },
  // Right Panel - Actions
  rightPanel: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingContainer: {
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#666666',
  },
  // Connected State
  connectedContainer: {
    width: '100%',
    maxWidth: 280,
  },
  profileCard: {
    backgroundColor: '#151518',
    borderWidth: 1,
    borderColor: '#2a2a30',
    padding: 16,
    marginBottom: 16,
  },
  profileLabel: {
    fontSize: 10,
    color: '#555555',
    letterSpacing: 1,
    marginBottom: 4,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#c8c8c8',
    marginBottom: 8,
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  continueButton: {
    backgroundColor: '#1a1215',
    borderWidth: 1,
    borderColor: '#6b2020',
    paddingVertical: 14,
    alignItems: 'center',
  },
  continueButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#a33a3a',
  },
  // Disconnected State
  connectContainer: {
    width: '100%',
    maxWidth: 280,
  },
  connectTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#c8c8c8',
    marginBottom: 8,
  },
  connectPrompt: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 20,
  },
  connectButton: {
    backgroundColor: '#151518',
    borderWidth: 1,
    borderColor: '#2a2a30',
    paddingVertical: 14,
    alignItems: 'center',
  },
  connectButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888888',
  },
  errorText: {
    marginTop: 12,
    fontSize: 12,
    color: '#a33a3a',
  },
});
