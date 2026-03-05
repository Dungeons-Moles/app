import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Image,
  Text,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
  Animated,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { Typography } from '@/theme/typography';
import { useGauntlet } from '@/hooks/useGauntlet';
import { useIsFocused } from '@react-navigation/native';
import { useScreenVariant } from '@/contexts/ScreenVariantContext';
import { useSessionIdentity } from '@/contexts/SessionContext';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { deriveGauntletSessionPda } from '@/services/solana/constants';
import { GAUNTLET_ENTRY_LAMPORTS, deriveGauntletPoolVaultPda } from '@/services/solana/gauntlet';
import { GauntletPoolBadge } from '../components/ui/GauntletPoolBadge';
import { useControllerAction } from '../hooks/useControllerAction';
import { ControllerHints, type ButtonHint } from '../components/ui/ControllerHints';
import { useInputMode } from '../hooks/useInputMode';
import { FocusGlow } from '../components/ui/FocusGlow';
import { useAudio } from '../contexts/AudioContext';
import { HubSettingsModal } from '../components/ui/HubSettingsModal';
import { useGame } from '@/contexts/GameContext';
import { usePaymentToken } from '@/hooks/usePaymentToken';
import {
  createSessionSetup,
  resolveSessionSetup,
  rejectSessionSetup,
} from '@/utils/sessionSetupSignal';
import { PaymentTokenSelector, PaymentConfirmationModal } from '@/components/payment';
import { InlineModal } from '@/components/InlineModal';
import { BlurView } from 'expo-blur';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');
const STAINS_BACKGROUND = require('../../assets/ui/backgrounds/stains-background.png');
const GAUNTLET_TITLE = require('../../assets/ui/text/gauntlet.png');
const PVP_MODES_PANEL = require('../../assets/ui/panels/pvp-modes-panel.png');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.png');
const buttonV2Source = require('../../assets/ui/buttons/button-v2.png');
const SOL_PILE = require('../../assets/ui/illustrations/sol-pile.png');
const CHEST = require('../../assets/ui/illustrations/chest.png');
const ECHO_FIGHT = require('../../assets/ui/illustrations/echo-fight.png');
const PAPER_PANEL = require('../../assets/ui/panels/paper-panel.png');
const iconASource = require('../../assets/ui/control-buttons/a.png');
const iconBSource = require('../../assets/ui/control-buttons/b.png');
const engineImageSource = require('../../assets/ui/illustrations/engine.png');
const iconXSource = require('../../assets/ui/control-buttons/x.png');

type GauntletScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Gauntlet'>;
};

export function GauntletScreen({ navigation }: GauntletScreenProps) {
  const gauntlet = useGauntlet();
  const { overrideGauntletSession, fetchSessionNonces } = useSessionIdentity();
  const { dispatch } = useGame();
  const { wallet, disconnect } = useWallet();
  const { connection } = useSolanaConnection();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const isFocused = useIsFocused();
  const isCompact = useScreenVariant() === 'compact';
  const [hasExistingGauntletSessionOnChain, setHasExistingGauntletSessionOnChain] = useState(false);
  const lastShownErrorRef = useRef<string | null>(null);

  const { playSfx } = useAudio();
  const payment = usePaymentToken(BigInt(GAUNTLET_ENTRY_LAMPORTS));
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showSessionExistsModal, setShowSessionExistsModal] = useState(false);
  const [isEntryTransitioning, setIsEntryTransitioning] = useState(false);
  const [poolLamports, setPoolLamports] = useState<bigint | null>(null);

  // Reset transitioning state if user returns to this screen (e.g. Game screen navigated back)
  const prevIsFocusedRef = useRef(false);
  useEffect(() => {
    if (isFocused && !prevIsFocusedRef.current) {
      setIsEntryTransitioning(false);
      gauntlet.reset();
      lastShownErrorRef.current = null;
    }
    prevIsFocusedRef.current = isFocused;
  }, [isFocused, gauntlet]);

  // Show alert when gauntlet entry fails (e.g. VRF timeout)
  useEffect(() => {
    if (gauntlet.phase === 'error' && gauntlet.error && gauntlet.error !== lastShownErrorRef.current) {
      lastShownErrorRef.current = gauntlet.error;
      Alert.alert('Entry Failed', gauntlet.error);
    }
  }, [gauntlet.phase, gauntlet.error]);

  const hasExistingGauntletSession = hasExistingGauntletSessionOnChain;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  useEffect(() => {
    let cancelled = false;
    const checkGauntletSession = async () => {
      if (!wallet.publicKey) {
        if (!cancelled) setHasExistingGauntletSessionOnChain(false);
        return;
      }
      try {
        const nonces = await fetchSessionNonces();
        const [gauntletPda] = deriveGauntletSessionPda(wallet.publicKey, nonces.gauntlet);
        const account = await connection.getAccountInfo(gauntletPda);
        if (!cancelled) setHasExistingGauntletSessionOnChain(account !== null);
      } catch {
        if (!cancelled) setHasExistingGauntletSessionOnChain(false);
      }
    };
    checkGauntletSession();
    return () => {
      cancelled = true;
    };
  }, [connection, wallet.publicKey, fetchSessionNonces]);

  useEffect(() => {
    if (!isFocused) return;
    let cancelled = false;
    const fetchPool = async () => {
      try {
        const [vaultPda] = deriveGauntletPoolVaultPda();
        const balance = await connection.getBalance(vaultPda);
        if (!cancelled) setPoolLamports(BigInt(balance));
      } catch {
        if (!cancelled) setPoolLamports(null);
      }
    };
    fetchPool();
    return () => { cancelled = true; };
  }, [isFocused, connection]);

  const handleBack = useCallback(() => {
    playSfx('ui_back');
    gauntlet.reset();
    navigation.goBack();
  }, [gauntlet, navigation, playSfx]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    navigation.reset({
      index: 0,
      routes: [{ name: 'Account' }],
    });
  }, [disconnect, navigation]);

  const handleEnterDirect = useCallback(async () => {
    setIsEntryTransitioning(true);
    let navigatedToLoading = false;
    const ok = await gauntlet.enterGauntlet(() => {
      if (navigatedToLoading) return;
      createSessionSetup();
      navigation.navigate('SessionLoading', { mode: 'gauntlet' });
      navigatedToLoading = true;
    });
    if (ok) {
      dispatch({ type: 'RESET_GAME' });
      if (navigatedToLoading) {
        resolveSessionSetup();
      } else {
        navigation.navigate('Game');
      }
      return;
    }
    if (navigatedToLoading) {
      rejectSessionSetup(gauntlet.error ?? 'Failed to enter gauntlet.');
    }
    setIsEntryTransitioning(false);
  }, [dispatch, gauntlet, navigation]);

  const handleEnter = useCallback(async () => {
    playSfx('ui_click');
    if (hasExistingGauntletSession) {
      setShowSessionExistsModal(true);
      return;
    }
    if (!payment.selectedToken.isNative && payment.quote) {
      setShowPaymentModal(true);
      return;
    }
    await handleEnterDirect();
  }, [hasExistingGauntletSession, payment.selectedToken, payment.quote, handleEnterDirect, playSfx]);

  const handleResumeExistingSession = useCallback(async () => {
    setShowSessionExistsModal(false);
    await handleEnterDirect();
  }, [handleEnterDirect]);

  const handleOverrideExistingSession = useCallback(async () => {
    setIsEntryTransitioning(true);
    setShowSessionExistsModal(false);
    const overrideResult = await overrideGauntletSession();
    if (!overrideResult.success) {
      setIsEntryTransitioning(false);
      Alert.alert(
        'Override Failed',
        overrideResult.error ?? 'Failed to override gauntlet session.'
      );
      return;
    }
    await handleEnterDirect();
  }, [overrideGauntletSession, handleEnterDirect]);

  const handlePaymentConfirm = useCallback(async () => {
    setShowPaymentModal(false);
    // On devnet: proceed with SOL payment (swap is mocked)
    // On mainnet: would compose swap+pay tx here
    await handleEnterDirect();
  }, [handleEnterDirect]);

  const entryFeeSol = GAUNTLET_ENTRY_LAMPORTS / 1_000_000_000;

  // --- Controller navigation ---
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const [panelFocus, setPanelFocus] = useState(1); // 0 = History, 1 = Enter

  const handleHistory = useCallback(() => {
    playSfx('ui_click');
    navigation.navigate('GauntletHistory');
  }, [navigation, playSfx]);

  const handleRanking = useCallback(() => {
    playSfx('ui_click');
    navigation.navigate('GauntletRanking');
  }, [navigation, playSfx]);

  const cycleToken = useCallback(
    (dir: -1 | 1) => {
      const tokens = payment.supportedTokens;
      const idx = tokens.findIndex((t) => t.symbol === payment.selectedToken.symbol);
      const next = idx + dir;
      if (next >= 0 && next < tokens.length) {
        playSfx('ui_hover');
        payment.setSelectedToken(tokens[next]);
      }
    },
    [payment]
  );

  useControllerAction(
    showSessionExistsModal
      ? {
          onA: !isEntryTransitioning ? handleResumeExistingSession : undefined,
          onB: !isEntryTransitioning ? () => { playSfx('ui_back'); setShowSessionExistsModal(false); } : undefined,
          onX: !isEntryTransitioning ? handleOverrideExistingSession : undefined,
        }
      : showPaymentModal || showSettingsModal
      ? {} // Modal has its own controller handler
      : {
          onB: handleBack,
          onStart: () => setShowSettingsModal(true),
          onA:
            panelFocus === 0
              ? handleHistory
              : !gauntlet.isLoading && !isEntryTransitioning
                ? handleEnter
                : undefined,
          onDPadLeft: () => setPanelFocus(0),
          onDPadRight: () => setPanelFocus(1),
          onL1: () => cycleToken(-1),
          onR1: () => cycleToken(1),
          onY: handleRanking,
        },
    isController && isFocused
  );

  const controllerHints: ButtonHint[] = showSessionExistsModal
    ? [
        { button: 'A', label: 'Resume' },
        { button: 'B', label: 'Cancel' },
        { button: 'X', label: 'Override' },
      ]
    : [
        { button: 'L1R1', label: 'Currency' },
        { button: 'DPadLeftRight', label: 'Switch' },
        { button: 'A', label: 'Select' },
        { button: 'Y', label: 'Ranking' },
        { button: 'B', label: 'Back' },
      ];

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
        <Image source={STAINS_BACKGROUND} style={styles.stainsOverlay} resizeMode="cover" />
        {!isCompact && !isController && (
          <View style={styles.topRight}>
            <GauntletPoolBadge poolLamports={poolLamports} />
            <TouchableOpacity
              onPress={() => {
                playSfx('ui_click');
                setShowSettingsModal(true);
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
          </View>
        )}
        {!isCompact && !isController && (
          <TouchableOpacity
            onPress={() => {
              playSfx('ui_click');
              navigation.navigate('GauntletRanking');
            }}
            activeOpacity={0.7}
            style={styles.rankingButtonAbsolute}
          >
            <ImageBackground
              source={buttonV2Source}
              style={styles.backButtonMobile}
              resizeMode="stretch"
            >
              <Text style={styles.backButtonTextMobile}>Ranking</Text>
            </ImageBackground>
          </TouchableOpacity>
        )}
        {!isCompact && !isController && (
          <TouchableOpacity onPress={handleBack} activeOpacity={0.7} style={styles.backButtonAbsolute}>
            <ImageBackground source={buttonV1Source} style={styles.backButtonMobile} resizeMode="stretch">
              <Text style={styles.backButtonTextMobile}>Back</Text>
            </ImageBackground>
          </TouchableOpacity>
        )}
        <View style={styles.content}>
          {/* Header */}
          <View style={[styles.header, isCompact && compactStyles.header]}>
            {isCompact ? (
              isController ? (
                <View style={[styles.headerButton, compactStyles.headerButton]} />
              ) : (
                <TouchableOpacity onPress={handleBack} activeOpacity={0.7}>
                  <ImageBackground
                    source={buttonV1Source}
                    style={[styles.headerButton, compactStyles.headerButton]}
                    resizeMode="stretch"
                  >
                    <Text style={[styles.headerButtonText, compactStyles.headerButtonText]}>
                      Back
                    </Text>
                  </ImageBackground>
                </TouchableOpacity>
              )
            ) : (
              <View style={styles.headerButton} />
            )}

            <View style={styles.headerSpacer} />

            {isCompact && (
              isController ? (
                <View style={[styles.headerButton, compactStyles.headerButton]} />
              ) : (
                <TouchableOpacity
                  onPress={() => navigation.navigate('GauntletRanking')}
                  activeOpacity={0.7}
                >
                  <ImageBackground
                    source={buttonV2Source}
                    style={[styles.headerButton, compactStyles.headerButton]}
                    resizeMode="stretch"
                  >
                    <Text
                      style={[styles.headerButtonText, compactStyles.headerButtonText]}
                    >
                      Ranking
                    </Text>
                  </ImageBackground>
                </TouchableOpacity>
              )
            )}
          </View>

          {/* Pool badge (compact only — wide has it in topRight) */}
          {isCompact && (
            <View style={compactStyles.poolBadge}>
              <GauntletPoolBadge poolLamports={poolLamports} size="lg" />
            </View>
          )}

          {/* Title */}
          <View style={[styles.titleRow, isCompact && compactStyles.titleRow]}>
            <Image
              source={GAUNTLET_TITLE}
              style={[styles.titleImage, isCompact && compactStyles.titleImage]}
              resizeMode="contain"
            />
          </View>

          {/* Panel with all content overlaid */}
          <View style={[styles.centerContent, isCompact && compactStyles.centerContent]}>
            <View style={[
              styles.panelWrapper,
              isCompact && compactStyles.panelWrapper,
            ]}>
              <Image source={PVP_MODES_PANEL} style={styles.pvpModesPanel} resizeMode="contain" />
              <View style={[styles.panelOverlay, isCompact && compactStyles.panelOverlay]}>
                <View
                  style={[
                    styles.panelRow,
                    styles.panelRowFee,
                    isCompact && compactStyles.panelRowFee,
                  ]}
                >
                  <Text style={[styles.panelTextFee, isCompact && compactStyles.panelText]}>
                    Entry fee: {entryFeeSol} SOL
                  </Text>
                  <Image
                    source={SOL_PILE}
                    style={[styles.panelIcon, isCompact && compactStyles.panelIcon]}
                    resizeMode="contain"
                  />
                </View>
                <View
                  style={[
                    styles.panelRow,
                    styles.panelRowPrizes,
                    isCompact && compactStyles.panelRowPrizes,
                  ]}
                >
                  <Text style={[styles.panelTextBody, isCompact && compactStyles.panelText]}>
                    Compete for{'\n'}weekly prizes
                  </Text>
                  <Image
                    source={CHEST}
                    style={[styles.panelIcon, isCompact && compactStyles.panelIcon]}
                    resizeMode="contain"
                  />
                </View>
                <View
                  style={[
                    styles.panelRow,
                    styles.panelRowEcho,
                    isCompact && compactStyles.panelRowEcho,
                  ]}
                >
                  <Text style={[styles.panelTextBody, isCompact && compactStyles.panelText]}>
                    At each week end,{'\n'}fight an echo build
                  </Text>
                  <Image
                    source={ECHO_FIGHT}
                    style={[styles.panelIcon, isCompact && compactStyles.panelIcon]}
                    resizeMode="contain"
                  />
                </View>

                <View style={[styles.panelButtons, isCompact && compactStyles.panelButtons]}>
                  <FocusGlow active={isController && panelFocus === 0}>
                    <TouchableOpacity
                      onPress={() => navigation.navigate('GauntletHistory')}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[styles.panelButtonText, isCompact && compactStyles.panelButtonText]}
                      >
                        History
                      </Text>
                    </TouchableOpacity>
                  </FocusGlow>

                  <FocusGlow active={isController && panelFocus === 1}>
                    <TouchableOpacity
                      onPress={handleEnter}
                      activeOpacity={0.7}
                      disabled={gauntlet.isLoading || isEntryTransitioning}
                    >
                      <View>
                        <Text
                          style={[
                            styles.panelButtonText,
                            isCompact && compactStyles.panelButtonText,
                            (gauntlet.isLoading || isEntryTransitioning) && { opacity: 0 },
                          ]}
                        >
                          {hasExistingGauntletSession ? 'Resume Session' : 'Enter Gauntlet'}
                        </Text>
                        {(gauntlet.isLoading || isEntryTransitioning) && (
                          <ActivityIndicator
                            color="#3d2b1f"
                            size={isCompact ? 'large' : 'small'}
                            style={StyleSheet.absoluteFill}
                          />
                        )}
                      </View>
                    </TouchableOpacity>
                  </FocusGlow>
                </View>
              </View>
            </View>

            {/* Token selector — below the panel */}
            {isCompact ? (
              <View style={compactStyles.tokenSelectorWrap}>
                <PaymentTokenSelector
                  tokens={payment.supportedTokens}
                  selectedToken={payment.selectedToken}
                  onSelectToken={payment.setSelectedToken}
                  quote={payment.quote}
                  isQuoteLoading={payment.isQuoteLoading}
                  solUsdPrice={payment.solUsdPrice}
                  requiredLamports={BigInt(GAUNTLET_ENTRY_LAMPORTS)}
                  isCompact={isCompact}
                  isController={isController}
                />
              </View>
            ) : (
              <BlurView
                intensity={40}
                tint="light"
                experimentalBlurMethod="dimezisBlurView"
                style={[styles.tokenSelectorWrap, styles.tokenSelectorBlur]}
              >
                <PaymentTokenSelector
                  tokens={payment.supportedTokens}
                  selectedToken={payment.selectedToken}
                  onSelectToken={payment.setSelectedToken}
                  quote={payment.quote}
                  isQuoteLoading={payment.isQuoteLoading}
                  solUsdPrice={payment.solUsdPrice}
                  requiredLamports={BigInt(GAUNTLET_ENTRY_LAMPORTS)}
                  isCompact={false}
                  isController={isController}
                  grid
                />
              </BlurView>
            )}
          </View>
        </View>
      </ImageBackground>
      {payment.quote && (
        <PaymentConfirmationModal
          visible={showPaymentModal}
          quote={payment.quote}
          isDevnet={payment.isDevnet}
          isCompact={isCompact}
          onConfirm={handlePaymentConfirm}
          onCancel={() => setShowPaymentModal(false)}
        />
      )}
      <InlineModal
        visible={showSessionExistsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSessionExistsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <ImageBackground
            source={PAPER_PANEL}
            resizeMode="stretch"
            style={[styles.modalContent, isCompact && compactStyles.modalContent]}
          >
            <Text style={[styles.modalTitle, isCompact && compactStyles.modalTitle]}>
              Session Already Exists
            </Text>
            <Text style={[styles.modalText, isCompact && compactStyles.modalText]}>
              You already have an active gauntlet session. Resume it to continue your run.
            </Text>
            {isCompact ? (
              <View style={compactStyles.modalHintRow}>
                <View style={compactStyles.modalHintItem}>
                  <Image
                    source={iconBSource}
                    style={compactStyles.modalHintIcon}
                    resizeMode="contain"
                  />
                  <Text style={compactStyles.modalHintLabel}>Cancel</Text>
                </View>
                <View style={compactStyles.modalHintItem}>
                  <Image
                    source={iconXSource}
                    style={compactStyles.modalHintIcon}
                    resizeMode="contain"
                  />
                  <Text style={compactStyles.modalHintLabel}>Override</Text>
                </View>
                <View style={compactStyles.modalHintItem}>
                  <Image
                    source={iconASource}
                    style={compactStyles.modalHintIcon}
                    resizeMode="contain"
                  />
                  <Text style={compactStyles.modalHintLabel}>Resume</Text>
                </View>
              </View>
            ) : (
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalButtonSecondary}
                  onPress={() => setShowSessionExistsModal(false)}
                >
                  <Text style={styles.modalButtonTextSecondary}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalButtonSecondary}
                  onPress={handleOverrideExistingSession}
                >
                  <Text style={styles.modalButtonTextSecondary}>Override</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalButtonPrimary} onPress={handleResumeExistingSession}>
                  <Text style={styles.modalButtonTextPrimary}>Resume</Text>
                </TouchableOpacity>
              </View>
            )}
          </ImageBackground>
        </View>
      </InlineModal>
      <HubSettingsModal
        visible={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onDisconnect={handleDisconnect}
      />
      <ControllerHints hints={controllerHints} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backgroundImage: { flex: 1, width: '100%', height: '100%' },
  stainsOverlay: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 0,
  },
  backButtonAbsolute: {
    position: 'absolute',
    top: 24,
    left: 16,
    zIndex: 10,
  },
  rankingButtonAbsolute: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    zIndex: 10,
  },
  backButtonMobile: {
    width: 90,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonTextMobile: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#3d2b1f',
    marginBottom: 4,
  },
  headerSpacer: { flex: 1 },
  headerButton: {
    width: 90,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonText: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#3d2b1f',
    marginBottom: 4,
  },
  titleRow: {
    alignItems: 'center',
    marginTop: -8,
  },
  titleImage: {
    width: 220,
    height: 48,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelWrapper: {
    width: 300,
    aspectRatio: 1.2,
  },
  pvpModesPanel: {
    width: '100%',
    height: '100%',
  },
  panelOverlay: {
    ...StyleSheet.absoluteFillObject,
    padding: 16,
  },
  panelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  panelRowFee: {
    alignSelf: 'flex-start',
    marginLeft: 30,
    marginTop: 9,
  },
  panelRowPrizes: {
    alignSelf: 'flex-end',
    marginRight: 42,
    marginTop: 8,
  },
  panelRowEcho: {
    alignSelf: 'flex-start',
    marginLeft: 34,
    marginTop: 9,
  },
  panelIcon: {
    width: 40,
    height: 40,
  },
  panelButtons: {
    flexDirection: 'row',
    gap: 62,
    marginTop: 53,
    marginLeft: 32,
  },
  panelTextFee: {
    fontFamily: Typography.number,
    fontSize: 14,
    color: '#3d2b1f',
    fontWeight: 'bold',
  },
  panelTextBody: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#3d2b1f',
  },
  tokenSelectorWrap: {
    position: 'absolute',
    right: 32,
    top: '36%',
    transform: [{ translateY: -40 }],
    alignItems: 'center',
  },
  tokenSelectorBlur: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(61, 43, 31, 0.2)',
    padding: 10,
    overflow: 'hidden',
  },
  panelButtonText: {
    fontFamily: Typography.button,
    fontWeight: 'bold',
    fontSize: 18,
    color: '#3d2b1f',
  },
  topRight: {
    position: 'absolute',
    top: 24,
    right: 24,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topRightButton: {
    width: 120,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topRightButtonText: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#3d2b1f',
    marginBottom: 4,
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
    marginBottom: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(25, 15, 10, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: 360,
    height: 300,
    padding: 36,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  modalTitle: {
    fontFamily: Typography.header,
    fontSize: 24,
    color: '#3d2b1f',
    textAlign: 'center',
    marginBottom: 10,
  },
  modalText: {
    fontFamily: Typography.body,
    fontSize: 15,
    color: '#3d2b1f',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 18,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalButtonPrimary: {
    flex: 1,
    backgroundColor: '#8ad66f',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#5f8f4d',
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalButtonSecondary: {
    flex: 1,
    backgroundColor: '#e6c7a7',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#7f5539',
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalButtonTextPrimary: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#1f2f1a',
  },
  modalButtonTextSecondary: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#3d2b1f',
  },
});

const compactStyles = StyleSheet.create({
  poolBadge: {
    position: 'absolute' as const,
    top: 24,
    right: 8,
    zIndex: 15,
  },
  header: {
    marginTop: 0,
  },
  headerButton: {
    width: 140,
    height: 64,
  },
  headerButtonText: {
    fontSize: 28,
    marginBottom: 6,
  },
  titleRow: {
    marginTop: 0,
  },
  titleImage: {
    width: 510,
    height: 105,
    marginBottom: 12,
  },
  centerContent: {},
  panelWrapper: {
    width: '95%',
    maxWidth: 900,
    aspectRatio: 1.2,
  },
  panelOverlay: {
    ...StyleSheet.absoluteFillObject,
    padding: 0,
  },
  panelRowFee: {
    marginTop: 52,
    marginLeft: 140,
    gap: 12,
  },
  panelRowPrizes: {
    marginTop: -20,
    marginRight: 112,
    alignSelf: 'flex-end',
    gap: 72,
  },
  panelRowEcho: {
    marginTop: -18,
    marginLeft: 150,
    gap: 72,
  },
  panelText: {
    fontSize: 36,
  },
  panelIcon: {
    width: 162,
    height: 162,
  },
  panelButtons: {
    flexDirection: 'row',
    marginTop: 150,
    marginLeft: 146,
    gap: 190,
  },
  panelButtonText: {
    fontSize: 52,
  },
  tokenSelectorWrap: {
    alignItems: 'center',
    marginTop: 10,
  },
  modalContent: {
    width: 860,
    height: 380,
    padding: 50,
  },
  modalTitle: {
    fontSize: 52,
    marginBottom: 16,
  },
  modalText: {
    fontSize: 34,
    lineHeight: 46,
    marginBottom: 22,
  },
  modalHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 30,
    marginTop: 8,
  },
  modalHintItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalHintIcon: {
    width: 72,
    height: 72,
  },
  modalHintLabel: {
    fontFamily: Typography.button,
    fontSize: 28,
    color: '#3d2b1f',
  },
});
