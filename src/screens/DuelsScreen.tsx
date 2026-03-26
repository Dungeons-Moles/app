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
import { useDuels } from '@/hooks/useDuels';
import { useIsFocused } from '@react-navigation/native';
import { useScreenVariant } from '@/contexts/ScreenVariantContext';
import { useSessionIdentity } from '@/contexts/SessionContext';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { deriveDuelSessionPda } from '@/services/solana/constants';
import { DUEL_ENTRY_LAMPORTS } from '@/services/solana/duels';
import { useControllerAction } from '../hooks/useControllerAction';
import { ControllerHints, type ButtonHint } from '../components/ui/ControllerHints';
import { useInputMode } from '../hooks/useInputMode';
import { FocusGlow } from '../components/ui/FocusGlow';
import { useAudio } from '../contexts/AudioContext';
import { HubSettingsModal } from '../components/ui/HubSettingsModal';
import { useGame } from '@/contexts/GameContext';
import {
  createSessionSetup,
  resolveSessionSetup,
  rejectSessionSetup,
} from '@/utils/sessionSetupSignal';
import { InlineModal } from '@/components/InlineModal';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.webp');
const STAINS_BACKGROUND = require('../../assets/ui/backgrounds/stains-background.webp');
const DUELS_TITLE = require('../../assets/ui/text/duels.webp');
const PVP_MODES_PANEL = require('../../assets/ui/panels/pvp-modes-panel.webp');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.webp');
const buttonV4Source = require('../../assets/ui/buttons/button-v4.webp');
const SOL_PILE = require('../../assets/ui/illustrations/sol-pile.webp');
const CHEST = require('../../assets/ui/illustrations/chest.webp');
const ECHO_FIGHT = require('../../assets/ui/illustrations/echo-fight.webp');
const PAPER_PANEL = require('../../assets/ui/panels/paper-panel.webp');
const iconASource = require('../../assets/ui/control-buttons/a.webp');
const iconBSource = require('../../assets/ui/control-buttons/b.webp');
const engineImageSource = require('../../assets/ui/illustrations/engine.webp');
const iconXSource = require('../../assets/ui/control-buttons/x.webp');

type DuelsScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Duels'>;
};

export function DuelsScreen({ navigation }: DuelsScreenProps) {
  const duels = useDuels();
  const { overrideAndStartDuelGame, fetchSessionNonces } = useSessionIdentity();
  const { dispatch } = useGame();
  const { wallet, disconnect } = useWallet();
  const { connection } = useSolanaConnection();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const isFocused = useIsFocused();
  const isCompact = useScreenVariant() === 'compact';
  const [hasExistingDuelSessionOnChain, setHasExistingDuelSessionOnChain] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  const { playSfx } = useAudio();
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showSessionExistsModal, setShowSessionExistsModal] = useState(false);

  const hasExistingDuelSession = hasExistingDuelSessionOnChain;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  useEffect(() => {
    let cancelled = false;
    const checkDuelSession = async () => {
      if (!cancelled) setIsCheckingSession(true);
      if (!wallet.publicKey) {
        if (!cancelled) {
          setHasExistingDuelSessionOnChain(false);
          setIsCheckingSession(false);
        }
        return;
      }
      try {
        const nonces = await fetchSessionNonces();
        const [duelPda] = deriveDuelSessionPda(wallet.publicKey, nonces.duel);
        const account = await connection.getAccountInfo(duelPda);
        if (!cancelled) setHasExistingDuelSessionOnChain(account !== null);
      } catch {
        if (!cancelled) setHasExistingDuelSessionOnChain(false);
      } finally {
        if (!cancelled) setIsCheckingSession(false);
      }
    };
    checkDuelSession();
    return () => {
      cancelled = true;
    };
  }, [connection, wallet.publicKey, fetchSessionNonces]);

  const handleBack = useCallback(() => {
    playSfx('ui_back');
    duels.reset();
    navigation.goBack();
  }, [duels, navigation, playSfx]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    navigation.reset({
      index: 0,
      routes: [{ name: 'Account' }],
    });
  }, [disconnect, navigation]);

  const handleEnterDirect = useCallback(async () => {
    let navigatedToLoading = false;
    const ok = await duels.enterCurrentSessionDuel(() => {
      if (navigatedToLoading) return;
      createSessionSetup();
      navigation.navigate('SessionLoading', { mode: 'duel' });
      navigatedToLoading = true;
    });
    if (ok) {
      dispatch({ type: 'RESET_GAME' });
      if (!navigatedToLoading) {
        // Setup completed before the onCommitted callback fired — navigate
        // through SessionLoadingScreen anyway so assets get preloaded.
        createSessionSetup();
        navigation.navigate('SessionLoading', { mode: 'duel' });
      }
      resolveSessionSetup();
      return;
    }
    if (navigatedToLoading) {
      rejectSessionSetup(duels.error ?? 'Failed to enter duel.');
    }
  }, [dispatch, duels, navigation]);

  const handleEnter = useCallback(async () => {
    playSfx('ui_click');
    if (hasExistingDuelSession) {
      setShowSessionExistsModal(true);
      return;
    }
    await handleEnterDirect();
  }, [hasExistingDuelSession, handleEnterDirect, playSfx]);

  const handleResumeExistingSession = useCallback(async () => {
    setShowSessionExistsModal(false);
    await handleEnterDirect();
  }, [handleEnterDirect]);

  const handleOverrideExistingSession = useCallback(async () => {
    setShowSessionExistsModal(false);
    let navigatedToLoading = false;
    const overrideResult = await overrideAndStartDuelGame(() => {
      if (navigatedToLoading) return;
      createSessionSetup();
      navigation.navigate('SessionLoading', { mode: 'duel' });
      navigatedToLoading = true;
    });
    if (!overrideResult.success) {
      if (navigatedToLoading) {
        rejectSessionSetup(overrideResult.error ?? 'Failed to override duel session.');
      } else {
        Alert.alert('Override Failed', overrideResult.error ?? 'Failed to override duel session.');
      }
      return;
    }
    if (!navigatedToLoading) {
      createSessionSetup();
      navigation.navigate('SessionLoading', { mode: 'duel' });
    }
    dispatch({ type: 'RESET_GAME' });
    resolveSessionSetup();
  }, [overrideAndStartDuelGame, navigation, dispatch]);

  const entryFeeSol = DUEL_ENTRY_LAMPORTS / 1_000_000_000;

  // --- Controller navigation ---
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const [panelFocus, setPanelFocus] = useState(1); // 0 = History, 1 = Enter
  const [panelWidth, setPanelWidth] = useState(300);
  const buttonFontSize = isCompact ? 52 : panelWidth * 0.06;

  const handleHistory = useCallback(() => {
    playSfx('ui_click');
    navigation.navigate('DuelsHistory');
  }, [navigation, playSfx]);

  useControllerAction(
    showSessionExistsModal
      ? {
          onA: handleResumeExistingSession,
          onB: () => { playSfx('ui_back'); setShowSessionExistsModal(false); },
          onX: handleOverrideExistingSession,
        }
      : showSettingsModal
      ? {}
      : {
          onB: handleBack,
          onStart: () => setShowSettingsModal(true),
          onA: panelFocus === 0 ? handleHistory : !duels.isLoading ? handleEnter : undefined,
          onDPadLeft: () => setPanelFocus(0),
          onDPadRight: () => setPanelFocus(1),
        },
    isController && isFocused && duels.phase !== 'error'
  );

  useControllerAction(
    {
      onA: duels.reset,
      onB: handleBack,
      onStart: () => setShowSettingsModal(true),
    },
    isController && isFocused && duels.phase === 'error' && !showSettingsModal
  );

  const controllerHints: ButtonHint[] = showSessionExistsModal
    ? [
        { button: 'A', label: 'Resume' },
        { button: 'B', label: 'Cancel' },
        { button: 'X', label: 'Override' },
      ]
    : [
        { button: 'DPadLeftRight', label: 'Switch' },
        { button: 'A', label: 'Select' },
        { button: 'B', label: 'Back' },
      ];
  const errorHints: ButtonHint[] = [
    { button: 'A', label: 'Try Again' },
    { button: 'B', label: 'Back' },
  ];

  if (duels.phase === 'error') {
    return (
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <CachedImageBackground
          source={BACKGROUND_IMAGE}
          style={styles.backgroundImage}
          resizeMode="cover"
        >
          <View style={styles.errorOverlay}>
            <View style={styles.errorContent}>
              <Text style={[styles.errorTitle, isCompact && compactStyles.errorTitle]}>DUELS</Text>
              <Text style={[styles.errorText, isCompact && compactStyles.errorText]}>
                {duels.error}
              </Text>
              <View style={styles.errorButtonRow}>
                <TouchableOpacity onPress={handleBack} activeOpacity={0.7}>
                  <CachedImageBackground
                    source={buttonV1Source}
                    style={[styles.errorButton, isCompact && compactStyles.errorButton]}
                    resizeMode="stretch"
                  >
                    <Text
                      style={[styles.errorButtonText, isCompact && compactStyles.errorButtonText]}
                    >
                      Back
                    </Text>
                  </CachedImageBackground>
                </TouchableOpacity>

                <TouchableOpacity onPress={duels.reset} activeOpacity={0.7}>
                  <CachedImageBackground
                    source={buttonV4Source}
                    style={[styles.errorButton, isCompact && compactStyles.errorButton]}
                    resizeMode="stretch"
                  >
                    <Text
                      style={[
                        styles.errorButtonTextPrimary,
                        isCompact && compactStyles.errorButtonTextPrimary,
                      ]}
                    >
                      Try Again
                    </Text>
                  </CachedImageBackground>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </CachedImageBackground>
        <HubSettingsModal
          visible={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          onDisconnect={handleDisconnect}
        />
        <ControllerHints hints={errorHints} horizontal />
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <CachedImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
        <Image source={STAINS_BACKGROUND} style={styles.stainsOverlay} resizeMode="cover" />
        {!isCompact && !isController && (
          <View style={styles.topRight}>
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
          </View>

          {/* Title */}
          <View style={[styles.titleRow, isCompact && compactStyles.titleRow]}>
            <Image
              source={DUELS_TITLE}
              style={[styles.titleImage, isCompact && compactStyles.titleImage]}
              resizeMode="contain"
            />
          </View>

          {/* Panel with all content overlaid */}
          <View style={styles.centerContent}>
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
                    styles.panelRowPot,
                    isCompact && compactStyles.panelRowPot,
                  ]}
                >
                  <Text style={[styles.panelTextBody, isCompact && compactStyles.panelText]}>
                    Winner takes{'\n'}it all
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
                    styles.panelRowOpponent,
                    isCompact && compactStyles.panelRowOpponent,
                  ]}
                >
                  <Text style={[styles.panelTextBody, isCompact && compactStyles.panelText]}>
                    At week 3 end,{'\n'}you fight another player
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
                      onPress={() => navigation.navigate('DuelsHistory')}
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
                      disabled={duels.isLoading || isCheckingSession}
                    >
                      <View>
                        <Text
                          style={[
                            styles.panelButtonText,
                            { fontSize: buttonFontSize },
                            (duels.isLoading || isCheckingSession) && { opacity: 0 },
                          ]}
                        >
                          {hasExistingDuelSession ? 'Resume' : 'Enter'}
                        </Text>
                        {(duels.isLoading || isCheckingSession) && (
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

          </View>
        </View>
      </CachedImageBackground>
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
              You already have an active duel session. Resume it to continue your run.
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
  panelRowPot: {
    alignSelf: 'flex-end',
    marginRight: 42,
    marginTop: 8,
  },
  panelRowOpponent: {
    alignSelf: 'flex-start',
    marginLeft: 29,
    marginTop: 9,
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
  panelIcon: {
    width: 40,
    height: 40,
  },
  panelButtons: {
    flexDirection: 'row',
    marginTop: 'auto',
    marginBottom: '-2%',
    marginHorizontal: -16, // cancel panelOverlay padding so buttons align with image edges
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
  // Error phase styles
  errorOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  errorContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 14,
  },
  errorTitle: {
    fontFamily: Typography.header,
    fontSize: 32,
    color: '#FABC0F',
    textAlign: 'center',
  },
  errorText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#ff8f8f',
    textAlign: 'center',
    maxWidth: '90%',
  },
  errorButtonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  errorButton: {
    width: 180,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorButtonText: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#3d2b1f',
    marginBottom: 4,
  },
  errorButtonTextPrimary: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#1a1a1a',
    marginBottom: 4,
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
    marginTop: 40,
  },
  titleImage: {
    width: 510,
    height: 105,
    marginBottom: 12,
  },
  panelWrapper: {
    width: '95%',
    maxWidth: 900,
    aspectRatio: 1.2,
  },
  panelOverlay: {
    padding: 0,
  },
  panelRowFee: {
    marginTop: 52,
    marginLeft: 140,
    gap: 12,
  },
  panelRowPot: {
    marginTop: -20,
    marginRight: 112,
    gap: 72,
  },
  panelRowOpponent: {
    marginTop: -18,
    marginLeft: 150,
    gap: 40,
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
  errorTitle: {
    fontSize: 64,
  },
  errorText: {
    fontSize: 32,
    maxWidth: 900,
  },
  errorButton: {
    width: 280,
    height: 90,
  },
  errorButtonText: {
    fontSize: 30,
    marginBottom: 6,
  },
  errorButtonTextPrimary: {
    fontSize: 30,
    marginBottom: 6,
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
