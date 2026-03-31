import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Image,
  Animated,
  Platform,
} from 'react-native';
import { CachedImageBackground } from '../components/common/CachedImageBackground';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useProfile } from '../contexts/ProfileContext';
import { useScreenVariant } from '../contexts/ScreenVariantContext';
import { useWallet, type SupportedWallet } from '../contexts/WalletContext';
import { RootStackParamList } from '../navigation';
import { JupiterIcon } from '../components/wallet/JupiterIcon';
import { PhantomIcon } from '../components/wallet/PhantomIcon';
import { BackpackIcon } from '../components/wallet/BackpackIcon';
import { SolflareIcon } from '../components/wallet/SolflareIcon';
import { useControllerAction } from '../hooks/useControllerAction';
import { ControllerHints, type ButtonHint } from '../components/ui/ControllerHints';
import { ControllerKeyboard } from '../components/ui/ControllerKeyboard';
import { useInputMode } from '../hooks/useInputMode';
import { useAudio } from '../contexts/AudioContext';
import { VolumeControls } from '../components/ui/VolumeControls';
import { FocusGlow } from '../components/ui/FocusGlow';
import { APP_VERSION } from '../constants/app';
import { SOLANA_CONFIG } from '../services/solana/config';
import { Typography } from '../theme/typography';

type AccountScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Account'>;
};

const backButtonSource = require('../../assets/ui/buttons/button-v1.webp');

const SHOW_DEV_WALLET = process.env.EXPO_PUBLIC_SHOW_DEV_WALLET === 'true';

// Jupiter is displayed but disabled (mainnet only) — excluded from selectable IDs
const WALLET_IDS: SupportedWallet[] = SHOW_DEV_WALLET
  ? ['DevKeypair', 'Phantom', 'Backpack', 'Solflare']
  : ['Phantom', 'Backpack', 'Solflare'];

export function AccountScreen({ navigation }: AccountScreenProps) {
  const {
    profile,
    createProfile,
    isLoading: isProfileLoading,
    error: profileError,
    loginAsGuest,
    mode,
  } = useProfile();
  const { wallet, connect, disconnect, isConnecting, error: walletError } = useWallet();
  const { playBgm, playSfx, isInitialLoading, musicVolume, setMusicVolume, sfxVolume, setSfxVolume } = useAudio();
  const screenVariant = useScreenVariant();
  const isCompact = screenVariant === 'compact';
  const isNative = Platform.OS !== 'web';
  const isFocused = useIsFocused();
  const isController = useInputMode() === 'controller';
  const [selectedWallet, setSelectedWallet] = useState<SupportedWallet>(
    SHOW_DEV_WALLET ? 'DevKeypair' : 'Phantom'
  );
  const [profileName, setProfileName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isSignInChecking, setIsSignInChecking] = useState(false);
  const hasInitialized = useRef(false);
  const sawProfileLoadRef = useRef(false);
  const [guestModeActivated, setGuestModeActivated] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsFocus, setSettingsFocus] = useState(0);
  const [panelDimensions, setPanelDimensions] = useState<{ width: number; height: number } | null>(
    null
  );
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Derived state
  const showLoading =
    isActionLoading ||
    isSignInChecking ||
    isConnecting ||
    (!hasInitialized.current && isProfileLoading);
  const isConnected = wallet.isConnected;
  const showWalletSelection = !isConnected || isSignInChecking;
  const isCheckingExistingProfile =
    isConnected && !profile && (isSignInChecking || isProfileLoading);
  const showCreateProfile = isConnected && !profile && !isCheckingExistingProfile;
  const errorMessage = localError ?? walletError ?? profileError;

  // --- Handlers ---

  const handleSignIn = useCallback(async () => {
    playSfx('ui_click');
    setLocalError(null);
    setIsSignInChecking(true);
    sawProfileLoadRef.current = false;
    try {
      const result = await connect(selectedWallet);
      if (!result) {
        setIsSignInChecking(false);
        return;
      }
      // Wallet connected — isSignInChecking stays true.
      // ProfileContext auto-fetches when wallet.publicKey changes.
      // The effect below clears isSignInChecking once profile state settles.
    } catch {
      setIsSignInChecking(false);
    }
  }, [connect, selectedWallet, playSfx]);

  const handlePlayAsGuest = useCallback(() => {
    playSfx('ui_click');
    setLocalError(null);
    setGuestModeActivated(true);
    loginAsGuest();
  }, [loginAsGuest, playSfx]);

  const handleCreateProfile = useCallback(async () => {
    if (!profileName.trim()) {
      playSfx('ui_error');
      setLocalError('Enter a display name to continue');
      return;
    }

    if (profileName.trim().length > 32) {
      playSfx('ui_error');
      setLocalError('Name must be 32 characters or less');
      return;
    }

    playSfx('ui_click');
    setLocalError(null);
    setIsActionLoading(true);
    try {
      const result = await createProfile(profileName.trim());
      if (result.success) {
        navigation.replace('Hub');
      } else {
        playSfx('ui_error');
        setLocalError(result.error ?? 'Failed to create profile');
      }
    } finally {
      setIsActionLoading(false);
    }
  }, [profileName, createProfile, navigation, playSfx]);

  const handleDPadLeft = useCallback(() => {
    playSfx('ui_hover');
    setSelectedWallet((prev) => {
      const idx = WALLET_IDS.indexOf(prev);
      return WALLET_IDS[(idx - 1 + WALLET_IDS.length) % WALLET_IDS.length];
    });
  }, [playSfx]);

  const handleDPadRight = useCallback(() => {
    playSfx('ui_hover');
    setSelectedWallet((prev) => {
      const idx = WALLET_IDS.indexOf(prev);
      return WALLET_IDS[(idx + 1) % WALLET_IDS.length];
    });
  }, [playSfx]);

  // --- Controller integration ---

  const hasName = profileName.trim().length > 0;

  const handleOpenKeyboard = useCallback(() => {
    playSfx('ui_click');
    setShowKeyboard(true);
  }, [playSfx]);

  const handleKeyboardSubmit = useCallback(
    (name: string) => {
      playSfx('ui_click');
      setProfileName(name);
      setShowKeyboard(false);
    },
    [playSfx]
  );

  const handleKeyboardCancel = useCallback(() => {
    playSfx('ui_click');
    setShowKeyboard(false);
  }, [playSfx]);

  const handleClearName = useCallback(() => {
    playSfx('ui_back');
    setProfileName('');
  }, [playSfx]);

  const handleGoBackToSignIn = useCallback(() => {
    playSfx('ui_back');
    setProfileName('');
    setLocalError(null);
    disconnect();
  }, [playSfx, disconnect]);

  const handleToggleSettings = useCallback(() => {
    playSfx('ui_click');
    setShowSettings((prev) => !prev);
    setSettingsFocus(0);
  }, [playSfx]);

  const handleCloseSettings = useCallback(() => {
    playSfx('ui_back');
    setShowSettings(false);
  }, [playSfx]);

  useControllerAction(
    {
      onDPadUp: () => setSettingsFocus((p) => Math.max(0, p - 1)),
      onDPadDown: () => setSettingsFocus((p) => Math.min(1, p + 1)),
      onDPadLeft:
        settingsFocus === 0
          ? () => setMusicVolume(Math.round(Math.max(0, musicVolume - 0.1) * 10) / 10)
          : () => setSfxVolume(Math.round(Math.max(0, sfxVolume - 0.1) * 10) / 10),
      onDPadRight:
        settingsFocus === 0
          ? () => setMusicVolume(Math.round(Math.min(1, musicVolume + 0.1) * 10) / 10)
          : () => setSfxVolume(Math.round(Math.min(1, sfxVolume + 0.1) * 10) / 10),
      onB: handleCloseSettings,
    },
    isController && isFocused && showSettings
  );

  useControllerAction(
    {
      onStart: handleToggleSettings,
    },
    isController && isFocused && !showSettings && !showKeyboard
  );

  useControllerAction(
    {
      onA: showWalletSelection
        ? handleSignIn
        : showCreateProfile
          ? hasName
            ? handleCreateProfile
            : handleOpenKeyboard
          : undefined,
      onB: showCreateProfile ? (hasName ? handleClearName : handleGoBackToSignIn) : undefined,
      onDPadLeft: showWalletSelection ? handleDPadLeft : undefined,
      onDPadRight: showWalletSelection ? handleDPadRight : undefined,
      onSelect: showWalletSelection ? handlePlayAsGuest : undefined,
    },
    isController && isFocused && !showLoading && !showKeyboard && !showSettings
  );

  const controllerHints: ButtonHint[] = showWalletSelection
    ? [
        { button: 'DPadLeftRight', label: 'Select Wallet' },
        { button: 'A', label: 'Sign In' },
        { button: 'Select', label: 'Play as Guest' },
        { button: 'Start', label: 'Settings' },
      ]
    : isCheckingExistingProfile
      ? [
          { button: 'A', label: 'Checking Profile' },
          { button: 'Start', label: 'Settings' },
        ]
    : hasName
      ? [
          { button: 'A', label: 'Create Profile' },
          { button: 'B', label: 'Clear Name' },
          { button: 'Start', label: 'Settings' },
        ]
      : [
          { button: 'A', label: 'Enter Name' },
          { button: 'B', label: 'Back' },
          { button: 'Start', label: 'Settings' },
        ];

  // --- Effects ---

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  useFocusEffect(
    useCallback(() => {
      if (!isInitialLoading) {
        playBgm('title');
      }
    }, [playBgm, isInitialLoading])
  );

  useEffect(() => {
    if (!isProfileLoading && !hasInitialized.current) {
      hasInitialized.current = true;
    }
  }, [isProfileLoading]);

  // Clear isSignInChecking once the profile auto-fetch cycle completes after connect.
  // We wait for isProfileLoading to go true→false (a full load cycle) so we don't
  // clear prematurely on a stale isProfileLoading=false before the fetch starts.
  useEffect(() => {
    if (!isSignInChecking || !isConnected) return;
    if (profile) {
      // Profile found — navigation effect below handles Hub redirect.
      setIsSignInChecking(false);
      return;
    }
    if (isProfileLoading) {
      sawProfileLoadRef.current = true;
      return;
    }
    if (sawProfileLoadRef.current) {
      // Load cycle finished with no profile — show create profile form.
      setIsSignInChecking(false);
      sawProfileLoadRef.current = false;
    }
  }, [isSignInChecking, isConnected, profile, isProfileLoading]);

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
            ? require('../../assets/ui/backgrounds/account-background-compact.webp')
            : require('../../assets/ui/backgrounds/account-background-wide.webp')
        }
        style={styles.backgroundImage}
        resizeMode="stretch"
      />
      <View style={styles.content}>
        {/* Left Panel - Branding */}
        <View style={styles.leftPanel}>
          <View style={styles.brandingContainer}>
            <Image
              source={require('../../assets/branding/logo.webp')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* Right Panel - Actions */}
        <View style={styles.rightPanel} onLayout={handlePanelLayout}>
          <CachedImageBackground
            source={require('../../assets/ui/panels/wooden-panel.webp')}
            style={[
              styles.panel,
              panelDimensions
                ? { width: panelDimensions.width, height: panelDimensions.height }
                : { opacity: 0 },
            ]}
            resizeMode="contain"
          >
            <View style={[styles.topSlot, isCompact ? { top: '19%' } : { top: '15%' }]}>
              {showWalletSelection ? (
                <>
                  <Text style={[styles.profileLabel, isCompact && { fontSize: 22 }]}>
                    SUPPORTED WALLETS
                  </Text>
                  <View
                    style={[
                      styles.walletOptions,
                      !isCompact && panelDimensions && { gap: Math.max(1, Math.min(8, (panelDimensions.width - 300) / 15)) },
                    ]}
                  >
                    {SHOW_DEV_WALLET && (
                      <TouchableOpacity
                        style={[
                          styles.walletOption,
                          isCompact && { width: 96, height: 96 },
                          !isNative &&
                            'DevKeypair' === selectedWallet &&
                            styles.walletOptionSelected,
                        ]}
                        onPress={
                          !isNative
                            ? () => {
                                playSfx('ui_click');
                                setSelectedWallet('DevKeypair');
                              }
                            : undefined
                        }
                        activeOpacity={!isNative ? 0.7 : 1}
                        disabled={showLoading}
                      >
                        <Text
                          style={{
                            fontSize: isCompact ? 18 : 10,
                            fontWeight: 'bold',
                            color:
                              !isNative
                                ? 'DevKeypair' === selectedWallet
                                  ? styles.walletIconActive.color
                                  : styles.walletIconInactive.color
                                : styles.walletIconActive.color,
                            textAlign: 'center',
                          }}
                        >
                          DEV{'\n'}KEY
                        </Text>
                      </TouchableOpacity>
                    )}
                    {(
                      [
                        { id: 'Phantom' as const, Icon: PhantomIcon },
                        { id: 'Backpack' as const, Icon: BackpackIcon },
                        { id: 'Solflare' as const, Icon: SolflareIcon },
                      ] as const
                    ).map(({ id, Icon }) => (
                      <TouchableOpacity
                        key={id}
                        style={[
                          styles.walletOption,
                          isCompact && { width: 96, height: 96 },
                          !isNative && id === selectedWallet && styles.walletOptionSelected,
                        ]}
                        onPress={
                          !isNative
                            ? () => {
                                playSfx('ui_click');
                                setSelectedWallet(id);
                              }
                            : undefined
                        }
                        activeOpacity={!isNative ? 0.7 : 1}
                        disabled={showLoading}
                      >
                        <Icon
                          color={
                            !isNative
                              ? id === selectedWallet
                                ? styles.walletIconActive.color
                                : styles.walletIconInactive.color
                              : styles.walletIconActive.color
                          }
                          size={
                            id === 'Solflare'
                              ? isCompact ? 52 : 28
                              : isCompact ? 64 : 36
                          }
                        />
                      </TouchableOpacity>
                    ))}
                    {/* Jupiter — disabled, mainnet only; hidden on localnet */}
                    {!SOLANA_CONFIG.isLocalValidator && (
                      <View
                        style={[
                          styles.walletOption,
                          isCompact && { width: 96, height: 96 },
                          { overflow: 'hidden' },
                        ]}
                      >
                        <JupiterIcon
                          color={styles.walletIconInactive.color}
                          size={isCompact ? 64 : 36}
                        />
                        <View
                          style={[
                            styles.mainnetBanner,
                            isCompact ? styles.mainnetBannerNativeCompact : styles.mainnetBannerNative,
                          ]}
                        >
                          <Text
                            style={[
                              styles.mainnetBannerText,
                              isCompact && { fontSize: 14 },
                            ]}
                          >
                            MAINNET
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                  {!isNative && (
                    <Text style={[styles.walletHint, isCompact && { fontSize: 20 }]}>
                      Select a wallet to sign in
                    </Text>
                  )}
                </>
              ) : isCheckingExistingProfile ? (
                <View style={{ marginTop: 32 }}>
                  <Text style={[styles.profileLabel, isCompact && { fontSize: 22 }]}>
                    CHECKING PROFILE
                  </Text>
                  <Text style={[styles.walletHint, isCompact && { fontSize: 20 }]}>
                    Verifying account...
                  </Text>
                </View>
              ) : profile ? null : (
                <>
                  <Text
                    style={[styles.profileLabel, isCompact && { fontSize: 22, marginBottom: 20 }]}
                  >
                    CREATE PROFILE
                  </Text>
                  <Pressable
                    style={[
                      styles.profileInput,
                      isCompact && { paddingVertical: 14, width: '85%' },
                    ]}
                    onPress={showLoading ? undefined : handleOpenKeyboard}
                  >
                    <Text
                      style={[
                        styles.profileInputText,
                        !profileName && styles.profileInputPlaceholder,
                        isCompact && { fontSize: 20 },
                      ]}
                    >
                      {profileName || 'Adventurer name'}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>

            <View style={[styles.buttonSlot, isCompact && { width: '60%', aspectRatio: 3.0 }]}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={
                  showWalletSelection
                    ? handleSignIn
                    : isCheckingExistingProfile
                      ? undefined
                      : handleCreateProfile
                }
                activeOpacity={0.7}
                disabled={showLoading || (isConnected && !!profile) || isCheckingExistingProfile}
              >
                <CachedImageBackground
                  source={require('../../assets/ui/buttons/button.webp')}
                  style={styles.buttonImage}
                  resizeMode="contain"
                >
                  {showLoading ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator size={isCompact ? 'large' : 'small'} color="#ffffff" />
                      <Text
                        style={[
                          styles.primaryButtonText,
                          isCompact && { fontSize: 32 },
                          { marginLeft: 8 },
                        ]}
                      >
                        Loading...
                      </Text>
                    </View>
                  ) : (
                    <Text style={[styles.primaryButtonText, isCompact && { fontSize: 32 }]}>
                      {showWalletSelection
                        ? 'Sign In'
                        : isCheckingExistingProfile
                          ? 'Checking...'
                          : 'Create Profile'}
                    </Text>
                  )}
                </CachedImageBackground>
              </TouchableOpacity>
            </View>

            {/* Guest Mode Link - only show when not connected (T002) */}
            {showWalletSelection && (
              <View style={[styles.guestSlot, isCompact && { bottom: '13%' }]}>
                <TouchableOpacity onPress={handlePlayAsGuest} disabled={showLoading}>
                  <Text style={[styles.guestText, isCompact && { fontSize: 22 }]}>
                    or play as guest
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={[styles.errorSlot, isCompact && { bottom: '14%' }]}>
              {errorMessage ? (
                <Text style={[styles.errorText, isCompact && { fontSize: 16 }]}>
                  {errorMessage}
                </Text>
              ) : null}
            </View>
          </CachedImageBackground>
        </View>
      </View>

      {/* Back button - mobile only, on Create Profile screen */}
      {showCreateProfile && !isCompact && (
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleGoBackToSignIn}
          activeOpacity={0.7}
          disabled={showLoading}
        >
          <CachedImageBackground
            source={backButtonSource}
            style={styles.backButtonImage}
            resizeMode="stretch"
          >
            <Text style={styles.backButtonText}>Back</Text>
          </CachedImageBackground>
        </TouchableOpacity>
      )}

      {/* Settings overlay */}
      {showSettings && (
        <TouchableWithoutFeedback onPress={handleCloseSettings}>
          <View style={styles.settingsOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <CachedImageBackground
                source={require('../../assets/ui/panels/paper-panel-wide.webp')}
                style={[styles.settingsPanel, isCompact && styles.settingsPanelCompact]}
                resizeMode="stretch"
              >
                <Text style={[styles.settingsTitle, isCompact && styles.settingsTitleCompact]}>
                  Settings
                </Text>
                <View style={styles.settingsBody}>
                  <FocusGlow active={isController && settingsFocus === 0} style={{ width: '100%' }}>
                    <View style={styles.settingRow}>
                      <Text style={[styles.settingLabel, isCompact && styles.settingLabelCompact]}>
                        Music volume
                      </Text>
                      <VolumeControls
                        currentVolume={musicVolume}
                        onVolumeChange={setMusicVolume}
                        scale={isCompact ? 2 : 0.8}
                      />
                    </View>
                  </FocusGlow>
                  <FocusGlow active={isController && settingsFocus === 1} style={{ width: '100%' }}>
                    <View style={styles.settingRow}>
                      <Text style={[styles.settingLabel, isCompact && styles.settingLabelCompact]}>
                        SFX volume
                      </Text>
                      <VolumeControls
                        currentVolume={sfxVolume}
                        onVolumeChange={setSfxVolume}
                        scale={isCompact ? 2 : 0.8}
                      />
                    </View>
                  </FocusGlow>
                </View>
                {isController && (
                  <View style={[styles.settingsHints, isCompact && styles.settingsHintsCompact]}>
                    <View style={styles.settingsHintRow}>
                      <Image
                        source={require('../../assets/ui/control-buttons/direction.webp')}
                        style={[styles.settingsHintIcon, isCompact && styles.settingsHintIconCompact, { transform: [{ rotate: '-90deg' }] }]}
                        resizeMode="contain"
                      />
                      <Image
                        source={require('../../assets/ui/control-buttons/direction.webp')}
                        style={[styles.settingsHintIcon, isCompact && styles.settingsHintIconCompact, { transform: [{ rotate: '90deg' }] }]}
                        resizeMode="contain"
                      />
                      <Text style={[styles.settingsHintText, isCompact && styles.settingsHintTextCompact]}>Change volume</Text>
                    </View>
                    <View style={styles.settingsHintRow}>
                      <Image
                        source={require('../../assets/ui/control-buttons/b.webp')}
                        style={[styles.settingsHintIcon, isCompact && styles.settingsHintIconCompact]}
                        resizeMode="contain"
                      />
                      <Text style={[styles.settingsHintText, isCompact && styles.settingsHintTextCompact]}>Close</Text>
                    </View>
                  </View>
                )}
                {!isController && (
                  <TouchableOpacity
                    onPress={handleCloseSettings}
                    style={styles.settingsCloseButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={[styles.settingsCloseText, isCompact && { fontSize: 44 }]}>✕</Text>
                  </TouchableOpacity>
                )}
              </CachedImageBackground>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      )}

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

      {/* Settings button (touch mode) */}
      {!isController && (
        <TouchableOpacity
          style={[styles.settingsButton, isCompact && styles.settingsButtonCompact]}
          onPress={handleToggleSettings}
          activeOpacity={0.7}
        >
          <CachedImageBackground
            source={require('../../assets/ui/buttons/button-v1.webp')}
            style={styles.settingsButtonBg}
            resizeMode="stretch"
          >
            <Image
              source={require('../../assets/ui/illustrations/engine.webp')}
              style={[styles.settingsButtonIcon, isCompact && styles.settingsButtonIconCompact]}
              resizeMode="contain"
            />
          </CachedImageBackground>
        </TouchableOpacity>
      )}

      <View style={[styles.versionLabel, isCompact && styles.versionLabelCompact]}>
        <Text style={[styles.versionText, isCompact && styles.versionTextCompact]}>
          Alpha v{APP_VERSION}
        </Text>
      </View>
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
  mainnetBanner: {
    position: 'absolute',
    backgroundColor: '#a33a3a',
    paddingHorizontal: 40,
    paddingVertical: 3,
    transform: [{ rotate: '35deg' }],
  },
  mainnetBannerNative: {
    backgroundColor: '#a33a3a',
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  mainnetBannerNativeCompact: {
    backgroundColor: '#a33a3a',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
  },
  mainnetBannerText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 0.5,
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
    justifyContent: 'center',
  },
  profileInputText: {
    color: '#000000',
    fontSize: 14,
  },
  profileInputPlaceholder: {
    color: '#999999',
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
    top: '20%',
    width: '80%',
    alignItems: 'center',
  },
  buttonSlot: {
    position: 'absolute',
    bottom: '23%',
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
    bottom: '14%',
    width: '70%',
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    bottom: 16,
    left: 16,
  },
  backButtonImage: {
    width: 80,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontFamily: Typography.button,
    fontSize: 16,
    marginBottom: 4,
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
  versionLabel: {
    position: 'absolute',
    top: 14,
    left: 14,
    zIndex: 100,
    backgroundColor: '#a33a3a',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  versionLabelCompact: {
    top: 24,
    left: 24,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  versionText: {
    fontSize: 12,
    color: '#ffffff',
    fontFamily: 'Inter-Regular',
    fontWeight: 'bold',
  },
  versionTextCompact: {
    fontSize: 18,
  },
  settingsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200,
  },
  settingsPanel: {
    width: 380,
    height: 200,
    padding: 44,
    paddingTop: 30,
    paddingBottom: 48,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  settingsPanelCompact: {
    width: 760,
    height: 420,
    padding: 90,
    paddingTop: 60,
    paddingBottom: 100,
  },
  settingsTitle: {
    fontFamily: Typography.header,
    fontSize: 22,
    color: '#3d2b1f',
    marginBottom: 12,
  },
  settingsTitleCompact: {
    fontSize: 42,
    marginBottom: 24,
  },
  settingsBody: {
    width: '100%',
    alignItems: 'center',
    gap: 10,
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
  settingLabelCompact: {
    fontSize: 26,
    width: 180,
  },
  settingsCloseButton: {
    position: 'absolute',
    right: 20,
    top: 12,
    padding: 10,
  },
  settingsCloseText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#5c4033',
  },
  settingsHints: {
    position: 'absolute',
    bottom: 14,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  settingsHintsCompact: {
    bottom: 36,
    left: 24,
    gap: 24,
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
  settingsHintIconCompact: {
    width: 36,
    height: 36,
  },
  settingsHintText: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#5c4033',
  },
  settingsHintTextCompact: {
    fontSize: 22,
  },
  settingsButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 100,
    width: 36,
    height: 36,
  },
  settingsButtonCompact: {
    top: 24,
    right: 24,
    width: 60,
    height: 60,
  },
  settingsButtonBg: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsButtonIcon: {
    width: 18,
    height: 18,
    marginBottom: 2,
  },
  settingsButtonIconCompact: {
    width: 30,
    height: 30,
    marginBottom: 4,
  },
});
