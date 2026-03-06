import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Image,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { CachedImageBackground } from '../components/common/CachedImageBackground';
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

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.webp');
const STAINS_BACKGROUND = require('../../assets/ui/backgrounds/stains-background.webp');
const GAUNTLET_TITLE = require('../../assets/ui/text/gauntlet.webp');
const PVP_MODES_PANEL = require('../../assets/ui/panels/pvp-modes-panel.webp');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.webp');
const buttonV2Source = require('../../assets/ui/buttons/button-v2.webp');
const buttonV4Source = require('../../assets/ui/buttons/button-v4.webp');
const SOL_PILE = require('../../assets/ui/illustrations/sol-pile.webp');
const CHEST = require('../../assets/ui/illustrations/chest.webp');
const ECHO_FIGHT = require('../../assets/ui/illustrations/echo-fight.webp');
const PAPER_PANEL = require('../../assets/ui/panels/paper-panel.webp');
const iconASource = require('../../assets/ui/control-buttons/a.webp');
const iconBSource = require('../../assets/ui/control-buttons/b.webp');
const engineImageSource = require('../../assets/ui/illustrations/engine.webp');
const iconXSource = require('../../assets/ui/control-buttons/x.webp');

type GauntletScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Gauntlet'>;
};

export function GauntletScreen({ navigation }: GauntletScreenProps) {
  const gauntlet = useGauntlet();
  const { overrideAndStartGauntletGame, fetchSessionNonces } = useSessionIdentity();
  const { dispatch } = useGame();
  const { wallet, disconnect } = useWallet();
  const { connection } = useSolanaConnection();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const isFocused = useIsFocused();
  const isCompact = useScreenVariant() === 'compact';
  const [hasExistingGauntletSessionOnChain, setHasExistingGauntletSessionOnChain] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
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
      if (!cancelled) setIsCheckingSession(true);
      if (!wallet.publicKey) {
        if (!cancelled) {
          setHasExistingGauntletSessionOnChain(false);
          setIsCheckingSession(false);
        }
        return;
      }
      try {
        const nonces = await fetchSessionNonces();
        const [gauntletPda] = deriveGauntletSessionPda(wallet.publicKey, nonces.gauntlet);
        const account = await connection.getAccountInfo(gauntletPda);
        if (!cancelled) setHasExistingGauntletSessionOnChain(account !== null);
      } catch {
        if (!cancelled) setHasExistingGauntletSessionOnChain(false);
      } finally {
        if (!cancelled) setIsCheckingSession(false);
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
      if (!navigatedToLoading) {
        createSessionSetup();
        navigation.navigate('SessionLoading', { mode: 'gauntlet' });
      }
      resolveSessionSetup();
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
    let navigatedToLoading = false;
    const overrideResult = await overrideAndStartGauntletGame(() => {
      if (navigatedToLoading) return;
      createSessionSetup();
      navigation.navigate('SessionLoading', { mode: 'gauntlet' });
      navigatedToLoading = true;
    });
    if (!overrideResult.success) {
      setIsEntryTransitioning(false);
      if (navigatedToLoading) {
        rejectSessionSetup(overrideResult.error ?? 'Failed to override gauntlet session.');
      } else {
        Alert.alert(
          'Override Failed',
          overrideResult.error ?? 'Failed to override gauntlet session.'
        );
      }
      return;
    }
    if (!navigatedToLoading) {
      createSessionSetup();
      navigation.navigate('SessionLoading', { mode: 'gauntlet' });
    }
    dispatch({ type: 'RESET_GAME' });
    resolveSessionSetup();
  }, [overrideAndStartGauntletGame, navigation, dispatch]);

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
  const [panelWidth, setPanelWidth] = useState(300);
  const buttonFontSize = isCompact ? 52 : panelWidth * 0.06;

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
      <CachedImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
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
              <CachedImageBackground
                source={buttonV1Source}
                style={styles.settingsBtn}
                resizeMode="stretch"
              >
                <Image
                  source={engineImageSource}
                  style={styles.settingsIconImage}
                  resizeMode="contain"
                />
              </CachedImageBackground>
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
            <CachedImageBackground
              source={buttonV2Source}
              style={styles.backButtonMobile}
              resizeMode="stretch"
            >
              <Text style={styles.backButtonTextMobile}>Ranking</Text>
            </CachedImageBackground>
          </TouchableOpacity>
        )}
        {!isCompact && !isController && (
          <TouchableOpacity onPress={handleBack} activeOpacity={0.7} style={styles.backButtonAbsolute}>
            <CachedImageBackground source={buttonV1Source} style={styles.backButtonMobile} resizeMode="stretch">
              <Text style={styles.backButtonTextMobile}>Back</Text>
            </CachedImageBackground>
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
                  <CachedImageBackground
                    source={buttonV1Source}
                    style={[styles.headerButton, compactStyles.headerButton]}
                    resizeMode="stretch"
                  >
                    <Text style={[styles.headerButtonText, compactStyles.headerButtonText]}>
                      Back
                    </Text>
                  </CachedImageBackground>
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
                  <CachedImageBackground
                    source={buttonV2Source}
                    style={[styles.headerButton, compactStyles.headerButton]}
                    resizeMode="stretch"
                  >
                    <Text
                      style={[styles.headerButtonText, compactStyles.headerButtonText]}
                    >
                      Ranking
                    </Text>
                  </CachedImageBackground>
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
            <View
              style={[styles.panelWrapper, isCompact && compactStyles.panelWrapper]}
              onLayout={(e) => setPanelWidth(e.nativeEvent.layout.width)}
            >
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
                  <FocusGlow style={{ flex: 1 }} active={isController && panelFocus === 0}>
                    <TouchableOpacity
                      onPress={() => navigation.navigate('GauntletHistory')}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[styles.panelButtonText, { fontSize: buttonFontSize }]}
                      >
                        History
                      </Text>
                    </TouchableOpacity>
                  </FocusGlow>

                  <FocusGlow style={{ flex: 1 }} active={isController && panelFocus === 1}>
                    <TouchableOpacity
                      onPress={handleEnter}
                      activeOpacity={0.7}
                      disabled={gauntlet.isLoading || isEntryTransitioning || isCheckingSession}
                    >
                      <View>
                        <Text
                          style={[
                            styles.panelButtonText,
                            { fontSize: buttonFontSize },
                            (gauntlet.isLoading || isEntryTransitioning || isCheckingSession) && { opacity: 0 },
                          ]}
                        >
                          {hasExistingGauntletSession ? 'Resume' : 'Enter'}
                        </Text>
                        {(gauntlet.isLoading || isEntryTransitioning || isCheckingSession) && (
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
      </CachedImageBackground>
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
          <CachedImageBackground
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
                <TouchableOpacity onPress={() => setShowSessionExistsModal(false)}>
                  <CachedImageBackground
                    source={buttonV1Source}
                    resizeMode="stretch"
                    style={styles.modalButtonBg}
                  >
                    <Text style={styles.modalButtonTextSecondary}>Cancel</Text>
                  </CachedImageBackground>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleOverrideExistingSession}>
                  <CachedImageBackground
                    source={buttonV1Source}
                    resizeMode="stretch"
                    style={styles.modalButtonBg}
                  >
                    <Text style={styles.modalButtonTextSecondary}>Override</Text>
                  </CachedImageBackground>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleResumeExistingSession}>
                  <CachedImageBackground
                    source={buttonV4Source}
                    resizeMode="stretch"
                    style={styles.modalButtonBg}
                  >
                    <Text style={styles.modalButtonTextPrimary}>Resume</Text>
                  </CachedImageBackground>
                </TouchableOpacity>
              </View>
            )}
          </CachedImageBackground>
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
    flexDirection: 'column',
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
    marginTop: 'auto',
    marginBottom: '-2%',
    marginHorizontal: -16,
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
    textAlign: 'center',
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
  modalButtonBg: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
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
    marginHorizontal: 0,
    marginTop: 150,
    marginBottom: 0,
  },
  tokenSelectorWrap: {
    alignItems: 'center',
    marginTop: 10,
  },
  modalContent: {
    width: 860,
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
