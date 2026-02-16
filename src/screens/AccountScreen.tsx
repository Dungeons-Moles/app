import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  ImageBackground,
  TextInput,
  Animated,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useProfile } from '../contexts/ProfileContext';
import { useScreenVariant } from '../contexts/ScreenVariantContext';
import { useWallet, type SupportedWallet } from '../contexts/WalletContext';
import { RootStackParamList } from '../navigation';
import { JupiterIcon } from '../components/wallet/JupiterIcon';
import { PhantomIcon } from '../components/wallet/PhantomIcon';
import { useControllerAction } from '../hooks/useControllerAction';
import { ControllerHints, type ButtonHint } from '../components/ui/ControllerHints';
import { ControllerKeyboard } from '../components/ui/ControllerKeyboard';

type AccountScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Account'>;
};

const WALLET_IDS: SupportedWallet[] = ['Jupiter', 'Phantom', 'DevKeypair'];

export function AccountScreen({ navigation }: AccountScreenProps) {
  const {
    profile,
    createProfile,
    isLoading: isProfileLoading,
    error: profileError,
    loginAsGuest,
    mode,
  } = useProfile();
  const { wallet, connect, isConnecting, error: walletError } = useWallet();
  const screenVariant = useScreenVariant();
  const isCompact = screenVariant === 'compact';
  const [selectedWallet, setSelectedWallet] = useState<SupportedWallet>('Jupiter');
  const [profileName, setProfileName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const hasInitialized = useRef(false);
  const [guestModeActivated, setGuestModeActivated] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [panelDimensions, setPanelDimensions] = useState<{ width: number; height: number } | null>(
    null
  );
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Derived state
  const showLoading =
    isActionLoading || isConnecting || (!hasInitialized.current && isProfileLoading);
  const isConnected = wallet.isConnected;
  const errorMessage = localError ?? walletError ?? profileError;

  // --- Handlers ---

  const handleSignIn = useCallback(async () => {
    setLocalError(null);
    const result = await connect(selectedWallet);
    if (!result) {
      return;
    }
  }, [connect, selectedWallet]);

  const handlePlayAsGuest = useCallback(() => {
    setLocalError(null);
    setGuestModeActivated(true);
    loginAsGuest();
  }, [loginAsGuest]);

  const handleCreateProfile = useCallback(async () => {
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
        navigation.replace('Hub');
      } else {
        setLocalError(result.error ?? 'Failed to create profile');
      }
    } finally {
      setIsActionLoading(false);
    }
  }, [profileName, createProfile, navigation]);

  const handleDPadLeft = useCallback(() => {
    setSelectedWallet((prev) => {
      const idx = WALLET_IDS.indexOf(prev);
      return WALLET_IDS[(idx - 1 + WALLET_IDS.length) % WALLET_IDS.length];
    });
  }, []);

  const handleDPadRight = useCallback(() => {
    setSelectedWallet((prev) => {
      const idx = WALLET_IDS.indexOf(prev);
      return WALLET_IDS[(idx + 1) % WALLET_IDS.length];
    });
  }, []);

  // --- Controller integration ---

  const hasName = profileName.trim().length > 0;

  const handleOpenKeyboard = useCallback(() => {
    setShowKeyboard(true);
  }, []);

  const handleKeyboardSubmit = useCallback((name: string) => {
    setProfileName(name);
    setShowKeyboard(false);
  }, []);

  const handleKeyboardCancel = useCallback(() => {
    setShowKeyboard(false);
  }, []);

  const handleClearName = useCallback(() => {
    setProfileName('');
  }, []);

  useControllerAction(
    {
      onA: !isConnected ? handleSignIn : hasName ? handleCreateProfile : handleOpenKeyboard,
      onB: isConnected && hasName ? handleClearName : undefined,
      onDPadLeft: !isConnected ? handleDPadLeft : undefined,
      onDPadRight: !isConnected ? handleDPadRight : undefined,
      onSelect: !isConnected ? handlePlayAsGuest : undefined,
    },
    !showLoading && !showKeyboard
  );

  const controllerHints: ButtonHint[] = !isConnected
    ? [
        { button: 'DPadLeftRight', label: 'Select Wallet' },
        { button: 'A', label: 'Sign In' },
        { button: 'Select', label: 'Play as Guest' },
      ]
    : hasName
      ? [
          { button: 'A', label: 'Create Profile' },
          { button: 'B', label: 'Clear Name' },
        ]
      : [{ button: 'A', label: 'Enter Name' }];

  // --- Effects ---

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    if (!isProfileLoading && !hasInitialized.current) {
      hasInitialized.current = true;
    }
  }, [isProfileLoading]);

  useEffect(() => {
    if (isConnected && profile && !isProfileLoading) {
      navigation.replace('Hub');
    }
  }, [isConnected, profile, isProfileLoading, navigation]);

  useEffect(() => {
    if (guestModeActivated && mode === 'guest' && !isConnected) {
      navigation.replace('Hub');
    }
  }, [guestModeActivated, mode, isConnected, navigation]);

  const handlePanelLayout = (event: any) => {
    const { width, height } = event.nativeEvent.layout;
    const availableWidth = width - 64;
    const availableHeight = height;
    const ratio = 0.85;

    let w = availableWidth;
    let h = w / ratio;

    if (h > availableHeight) {
      h = availableHeight;
      w = h * ratio;
    }

    if (
      !panelDimensions ||
      Math.abs(panelDimensions.width - w) > 1 ||
      Math.abs(panelDimensions.height - h) > 1
    ) {
      setPanelDimensions({ width: w, height: h });
    }
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Image
        source={
          screenVariant === 'compact'
            ? require('../../assets/ui/backgrounds/account-background-compact.png')
            : require('../../assets/ui/backgrounds/account-background-wide.png')
        }
        style={styles.backgroundImage}
        resizeMode="stretch"
      />
      <View style={styles.content}>
        {/* Left Panel - Branding */}
        <View style={styles.leftPanel}>
          <View style={styles.brandingContainer}>
            <Image
              source={require('../../assets/branding/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* Right Panel - Actions */}
        <View style={styles.rightPanel} onLayout={handlePanelLayout}>
          <ImageBackground
            source={require('../../assets/ui/panels/wooden-panel.png')}
            style={[
              styles.panel,
              panelDimensions
                ? { width: panelDimensions.width, height: panelDimensions.height }
                : { opacity: 0 },
            ]}
            resizeMode="contain"
          >
            <View style={[styles.topSlot, isCompact && { top: '19%' }]}>
              {!isConnected ? (
                <>
                  <Text style={[styles.profileLabel, isCompact && { fontSize: 22 }]}>SUPPORTED WALLETS</Text>
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
                          isCompact && { width: 96, height: 96 },
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
                          size={isCompact ? 64 : 36}
                        />
                      </TouchableOpacity>
                    ))}
                    {/* TEMPORARY: Dev Keypair option for local development. Remove when Phantom issues are resolved. */}
                    <TouchableOpacity
                      style={[
                        styles.walletOption,
                        isCompact && { width: 96, height: 96 },
                        'DevKeypair' === selectedWallet && styles.walletOptionSelected,
                      ]}
                      onPress={() => setSelectedWallet('DevKeypair')}
                      activeOpacity={0.7}
                      disabled={showLoading}
                    >
                      <Text
                        style={{
                          fontSize: isCompact ? 18 : 10,
                          fontWeight: 'bold',
                          color:
                            'DevKeypair' === selectedWallet
                              ? styles.walletIconActive.color
                              : styles.walletIconInactive.color,
                          textAlign: 'center',
                        }}
                      >
                        DEV{'\n'}KEY
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.walletHint, isCompact && { fontSize: 20 }]}>Select a wallet to sign in</Text>
                </>
              ) : (
                <>
                  <Text style={[styles.profileLabel, isCompact && { fontSize: 22, marginBottom: 20 }]}>CREATE PROFILE</Text>
                  <TextInput
                    style={[styles.profileInput, isCompact && { fontSize: 20, paddingVertical: 14, width: '85%' }]}
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

            <View style={[styles.buttonSlot, isCompact && { width: '60%', aspectRatio: 3.0 }]}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={!isConnected ? handleSignIn : handleCreateProfile}
                activeOpacity={0.7}
                disabled={showLoading}
              >
                <ImageBackground
                  source={require('../../assets/ui/buttons/button.png')}
                  style={styles.buttonImage}
                  resizeMode="contain"
                >
                  {showLoading ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator size={isCompact ? 'large' : 'small'} color="#ffffff" />
                      <Text style={[styles.primaryButtonText, isCompact && { fontSize: 32 }, { marginLeft: 8 }]}>Loading...</Text>
                    </View>
                  ) : (
                    <Text style={[styles.primaryButtonText, isCompact && { fontSize: 32 }]}>
                      {!isConnected ? 'Sign In' : 'Create Profile'}
                    </Text>
                  )}
                </ImageBackground>
              </TouchableOpacity>
            </View>

            {/* Guest Mode Link - only show when not connected (T002) */}
            {!isConnected && (
              <View style={[styles.guestSlot, isCompact && { bottom: '13%' }]}>
                <TouchableOpacity onPress={handlePlayAsGuest} disabled={showLoading}>
                  <Text style={[styles.guestText, isCompact && { fontSize: 22 }]}>or play as guest</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={[styles.errorSlot, isCompact && { bottom: '14%' }]}>
              {errorMessage ? <Text style={[styles.errorText, isCompact && { fontSize: 16 }]}>{errorMessage}</Text> : null}
            </View>
          </ImageBackground>
        </View>
      </View>

      {/* On-screen keyboard for controller mode */}
      <ControllerKeyboard
        visible={showKeyboard}
        value={profileName}
        maxLength={32}
        placeholder="Adventurer name"
        onSubmit={handleKeyboardSubmit}
        onCancel={handleKeyboardCancel}
      />

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
    aspectRatio: 0.85,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
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
    marginBottom: 12,
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
    color: 'rgba(95, 85, 72, 0.3)',
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
    position: 'absolute',
    bottom: '14%',
    width: '50%',
    aspectRatio: 3.2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topSlot: {
    position: 'absolute',
    top: '16%',
    width: '80%',
    alignItems: 'center',
  },
  buttonSlot: {
    position: 'absolute',
    bottom: '20%',
    width: '50%',
    aspectRatio: 3.2,
  },
  primaryButton: {
    width: '100%',
    height: '100%',
  },
  errorSlot: {
    position: 'absolute',
    bottom: '10%',
    width: '70%',
    alignItems: 'center',
  },
  guestSlot: {
    position: 'absolute',
    bottom: '15%',
    width: '70%',
    alignItems: 'center',
  },
  guestText: {
    fontSize: 14,
    color: '#666666',
    textDecorationLine: 'underline',
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
