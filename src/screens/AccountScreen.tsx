import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useProfile } from '../contexts/ProfileContext';
import { shortenAddress } from '../utils/storage';
import { RootStackParamList } from '../navigation';

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
    <View style={styles.container}>
      <Image
        source={require('../../assets/account/background.png')}
        style={styles.backgroundImage}
        resizeMode="stretch"
      />
      <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
        <View style={styles.content}>
          {/* Left Panel - Branding */}
          <View style={styles.leftPanel}>
            <View style={styles.brandingContainer}>
              <Image
                source={require('../../assets/logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
          </View>

          {/* Right Panel - Actions */}
          <View style={styles.rightPanel}>
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#1a1a20" />
                <Text style={styles.loadingText}>
                  {isCreatingProfile ? 'Creating profile...' : 'Loading...'}
                </Text>
              </View>
            ) : canContinue ? (
              <ImageBackground
                source={require('../../assets/account/wooden-panel.png')}
                style={styles.connectedContainer}
                resizeMode="contain"
              >
                <View style={styles.profileCard}>
                  <Text style={styles.profileLabel}>ADVENTURER</Text>
                  <Text style={styles.profileName}>{profile?.displayName}</Text>
                  <View style={styles.walletRow}>
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
                  <ImageBackground
                    source={require('../../assets/account/button.png')}
                    style={styles.buttonImage}
                    resizeMode="contain"
                  >
                    <Text style={styles.continueButtonText}>Enter Game</Text>
                  </ImageBackground>
                </TouchableOpacity>
              </ImageBackground>
            ) : (
              <View style={styles.connectContainer}>
                <Text style={styles.connectTitle}>Profile unavailable</Text>
                <Text style={styles.connectPrompt}>Create a local profile to continue</Text>

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
  },
  brandingContainer: {
    left: 20,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
  },
  logo: {
    width: '100%',
    height: '80%',
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
    color: '#1a1a20',
  },
  // Connected State
  connectedContainer: {
    width: '100%',
    aspectRatio: 0.85,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 20,
  },
  profileCard: {
    width: '80%',
    height: '40%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 42,
    marginBottom: 10,
  },
  profileLabel: {
    fontSize: 12,
    color: '#000000',
    letterSpacing: 1,
    marginBottom: 4,
    fontWeight: 'bold',
  },
  profileName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 8,
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  walletAddress: {
    fontSize: 14,
    color: '#000000',
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  continueButton: {
    width: '60%',
    height: '40%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  continueButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  // Disconnected State
  connectContainer: {
    width: '100%',
    maxWidth: 280,
  },
  connectTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a20',
    marginBottom: 8,
  },
  connectPrompt: {
    fontSize: 12,
    color: '#333333',
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
