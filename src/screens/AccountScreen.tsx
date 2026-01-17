import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  ImageBackground,
  TextInput,
  Platform,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useProfile } from '../contexts/ProfileContext';
import { useWallet, type SupportedWallet } from '../contexts/WalletContext';
import { RootStackParamList } from '../navigation';
import { JupiterIcon } from '../components/wallet/JupiterIcon';
import { PhantomIcon } from '../components/wallet/PhantomIcon';

type AccountScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Account'>;
};

export function AccountScreen({ navigation }: AccountScreenProps) {
  const { profile, createProfile, isLoading: isProfileLoading, error: profileError } = useProfile();
  const { wallet, connect, isConnecting, error: walletError } = useWallet();
  const [selectedWallet, setSelectedWallet] = useState<SupportedWallet>('Jupiter');
  const [profileName, setProfileName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const hasInitialized = useRef(false);

  // Track when initial load completes to prevent flickering
  useEffect(() => {
    if (!isProfileLoading && !hasInitialized.current) {
      hasInitialized.current = true;
    }
  }, [isProfileLoading]);

  // Only show loading for user-initiated actions OR initial load
  const showLoading =
    isActionLoading || isConnecting || (!hasInitialized.current && isProfileLoading);
  const isConnected = wallet.isConnected;
  const errorMessage = localError ?? walletError ?? profileError;

  // Navigate to Hub if profile exists
  useEffect(() => {
    if (isConnected && profile && !isProfileLoading) {
      navigation.replace('Hub');
    }
  }, [isConnected, profile, isProfileLoading, navigation]);

  const handleSignIn = async () => {
    setLocalError(null);
    const result = await connect(selectedWallet);
    if (!result) {
      return;
    }
  };

  const handleCreateProfile = async () => {
    if (!profileName.trim()) {
      setLocalError('Enter a display name to continue');
      return;
    }

    if (profileName.trim().length > 32) {
      setLocalError('Name must be 32 characters or less');
      return;
    }

    setLocalError(null);
    setIsActionLoading(true);
    try {
      const result = await createProfile(profileName.trim());
      if (result.success) {
        // Navigate to Hub after successful profile creation
        navigation.replace('Hub');
      } else {
        setLocalError(result.error ?? 'Failed to create profile');
      }
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/account/background.png')}
        style={styles.backgroundImage}
        resizeMode="stretch"
      />
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
          <ImageBackground
            source={require('../../assets/account/wooden-panel.png')}
            style={styles.panel}
            resizeMode="contain"
          >
            <View style={styles.panelContent}>
              {!isConnected ? (
                <>
                  <Text style={styles.profileLabel}>SUPPORTED WALLETS</Text>
                  <View style={styles.walletOptions}>
                    {(
                      [
                        { id: 'Jupiter' as const, Icon: JupiterIcon },
                        { id: 'Phantom' as const, Icon: PhantomIcon },
                      ] as const
                    ).map(({ id, Icon }) => (
                      <TouchableOpacity
                        key={id}
                        style={[
                          styles.walletOption,
                          id === selectedWallet && styles.walletOptionSelected,
                        ]}
                        onPress={() => setSelectedWallet(id)}
                        activeOpacity={0.7}
                        disabled={showLoading}
                      >
                        <Icon
                          color={
                            id === selectedWallet
                              ? styles.walletIconActive.color
                              : styles.walletIconInactive.color
                          }
                          size={36}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.walletHint}>Select a wallet to sign in</Text>
                </>
              ) : (
                <>
                  <Text style={styles.profileLabel}>CREATE PROFILE</Text>
                  <TextInput
                    style={styles.profileInput}
                    placeholder="Adventurer name"
                    placeholderTextColor="#999999"
                    value={profileName}
                    onChangeText={setProfileName}
                    maxLength={32}
                    autoCapitalize="words"
                    editable={!showLoading}
                  />
                </>
              )}
            </View>

            <View style={styles.buttonWrapper}>
              <TouchableOpacity
                style={[styles.primaryButton, isConnected ? styles.createProfileButton : null]}
                onPress={!isConnected ? () => handleSignIn() : handleCreateProfile}
                activeOpacity={0.7}
                disabled={showLoading}
              >
                <ImageBackground
                  source={require('../../assets/account/button.png')}
                  style={styles.buttonImage}
                  resizeMode="contain"
                >
                  {showLoading ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator size="small" color="#ffffff" />
                      <Text style={[styles.primaryButtonText, { marginLeft: 8 }]}>Loading...</Text>
                    </View>
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {!isConnected ? 'Sign In' : 'Create Profile'}
                    </Text>
                  )}
                </ImageBackground>
              </TouchableOpacity>
            </View>

            <View style={styles.errorSlot}>
              {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
            </View>
          </ImageBackground>
        </View>
      </View>
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
  panel: {
    width: '100%',
    aspectRatio: 0.85,
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? { height: 380 } : {}),
  },
  panelContent: {
    width: '80%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 30,
  },
  profileLabel: {
    fontSize: 12,
    color: '#000000',
    letterSpacing: 1,
    marginBottom: 8,
    fontWeight: 'bold',
  },
  profileName: {
    fontSize: 26,
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
  walletOptions: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 8,
  },
  walletOption: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletOptionSelected: {},
  walletOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
  },
  walletOptionTextSelected: {
    color: '#000000',
  },
  walletIconActive: {
    color: '#000000',
  },
  walletIconInactive: {
    color: '#5f5548',
  },
  walletHint: {
    fontSize: 12,
    color: '#333333',
    textAlign: 'center',
  },
  profileInput: {
    width: '75%',
    backgroundColor: '#f4e4bc',
    borderWidth: 1,
    borderColor: '#d4c49c',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#000000',
  },
  buttonWrapper: {
    width: '50%',
    height: '40%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButton: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  createProfileButton: {
    paddingTop: 49,
  },
  errorSlot: {
    position: 'absolute',
    width: '65%',
    alignItems: 'center',
  },
  buttonImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 12,
    color: '#a33a3a',
    textAlign: 'center',
  },
});
