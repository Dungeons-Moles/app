import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Image,
  Text,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
  Animated,
  ActivityIndicator,
} from 'react-native';
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
import { useGame } from '@/contexts/GameContext';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');
const STAINS_BACKGROUND = require('../../assets/ui/backgrounds/stains-background.png');
const DUELS_TITLE = require('../../assets/ui/text/duels.png');
const PVP_MODES_PANEL = require('../../assets/ui/panels/pvp-modes-panel.png');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.png');
const buttonV4Source = require('../../assets/ui/buttons/button-v4.png');
const SOL_PILE = require('../../assets/ui/illustrations/sol-pile.png');
const CHEST = require('../../assets/ui/illustrations/chest.png');
const ECHO_FIGHT = require('../../assets/ui/illustrations/echo-fight.png');

type DuelsScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Duels'>;
};

export function DuelsScreen({ navigation }: DuelsScreenProps) {
  const duels = useDuels();
  const { activeSessions } = useSessionIdentity();
  const { dispatch } = useGame();
  const { wallet } = useWallet();
  const { connection } = useSolanaConnection();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const isFocused = useIsFocused();
  const isCompact = useScreenVariant() === 'compact';
  const [hasExistingDuelSessionOnChain, setHasExistingDuelSessionOnChain] = useState(false);

  const duelPdaBase58 = useMemo(() => {
    if (!wallet.publicKey) return null;
    const [pda] = deriveDuelSessionPda(wallet.publicKey);
    return pda.toBase58();
  }, [wallet.publicKey]);

  const hasExistingDuelSessionInList = activeSessions.some(
    (session) => session.sessionPda === duelPdaBase58
  );
  const hasExistingDuelSession = hasExistingDuelSessionOnChain || hasExistingDuelSessionInList;

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
      if (!wallet.publicKey) {
        if (!cancelled) setHasExistingDuelSessionOnChain(false);
        return;
      }
      try {
        const [duelPda] = deriveDuelSessionPda(wallet.publicKey);
        const account = await connection.getAccountInfo(duelPda);
        if (!cancelled) setHasExistingDuelSessionOnChain(account !== null);
      } catch {
        if (!cancelled) setHasExistingDuelSessionOnChain(false);
      }
    };
    checkDuelSession();
    return () => {
      cancelled = true;
    };
  }, [connection, wallet.publicKey, activeSessions.length]);

  useEffect(() => {
    if (duels.phase === 'queued') {
      dispatch({ type: 'RESET_GAME' });
      navigation.replace('Game');
    }
  }, [dispatch, duels.phase, navigation]);

  const handleBack = useCallback(() => {
    duels.reset();
    navigation.goBack();
  }, [duels, navigation]);

  const handleEnter = useCallback(async () => {
    const ok = await duels.enterCurrentSessionDuel();
    if (ok) {
      dispatch({ type: 'RESET_GAME' });
      navigation.navigate('Game');
    }
  }, [dispatch, duels, navigation]);

  const entryFeeSol = DUEL_ENTRY_LAMPORTS / 1_000_000_000;

  // --- Controller navigation ---
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const [panelFocus, setPanelFocus] = useState(1); // 0 = History, 1 = Enter

  const handleHistory = useCallback(() => {
    navigation.navigate('DuelsHistory');
  }, [navigation]);

  useControllerAction(
    {
      onB: handleBack,
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
    },
    isController && isFocused && duels.phase === 'error'
  );

  const controllerHints: ButtonHint[] = [
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
        <ImageBackground
          source={BACKGROUND_IMAGE}
          style={styles.backgroundImage}
          resizeMode="cover"
        >
          <View style={styles.errorOverlay}>
            <View style={styles.errorContent}>
              <Text style={[styles.errorTitle, isCompact && compactStyles.errorTitle]}>DUELS</Text>
              <Text style={[styles.errorText, isCompact && compactStyles.errorText]}>{duels.error}</Text>
              <View style={styles.errorButtonRow}>
                <TouchableOpacity onPress={handleBack} activeOpacity={0.7}>
                  <ImageBackground
                    source={buttonV1Source}
                    style={[styles.errorButton, isCompact && compactStyles.errorButton]}
                    resizeMode="stretch"
                  >
                    <Text style={[styles.errorButtonText, isCompact && compactStyles.errorButtonText]}>
                      Back
                    </Text>
                  </ImageBackground>
                </TouchableOpacity>

                <TouchableOpacity onPress={duels.reset} activeOpacity={0.7}>
                  <ImageBackground
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
                  </ImageBackground>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ImageBackground>
        <ControllerHints hints={errorHints} horizontal />
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
        <Image source={STAINS_BACKGROUND} style={styles.stainsOverlay} resizeMode="cover" />
        <View style={styles.content}>
          {/* Header */}
          <View style={[styles.header, isCompact && compactStyles.header]}>
            {isController ? (
              <View style={[styles.headerButton, isCompact && compactStyles.headerButton]} />
            ) : (
              <TouchableOpacity onPress={handleBack} activeOpacity={0.7}>
                <ImageBackground
                  source={buttonV1Source}
                  style={[styles.headerButton, isCompact && compactStyles.headerButton]}
                  resizeMode="stretch"
                >
                  <Text
                    style={[styles.headerButtonText, isCompact && compactStyles.headerButtonText]}
                  >
                    Back
                  </Text>
                </ImageBackground>
              </TouchableOpacity>
            )}

            <View style={styles.headerSpacer} />
          </View>

          {/* Title */}
          <View style={styles.titleRow}>
            <Image
              source={DUELS_TITLE}
              style={[styles.titleImage, isCompact && compactStyles.titleImage]}
              resizeMode="contain"
            />
          </View>

          {/* Panel with all content overlaid */}
          <View style={styles.centerContent}>
            <View style={[styles.panelWrapper, isCompact && compactStyles.panelWrapper]}>
              <Image
                source={PVP_MODES_PANEL}
                style={styles.pvpModesPanel}
                resizeMode="contain"
              />
              <View
                style={[styles.panelOverlay, isCompact && compactStyles.panelOverlay]}
              >
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

                <View
                  style={[styles.panelButtons, isCompact && compactStyles.panelButtons]}
                >
                  <FocusGlow active={isController && panelFocus === 0}>
                    <TouchableOpacity
                      onPress={() => navigation.navigate('DuelsHistory')}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.panelButtonText,
                          isCompact && compactStyles.panelButtonText,
                        ]}
                      >
                        History
                      </Text>
                    </TouchableOpacity>
                  </FocusGlow>

                  <FocusGlow active={isController && panelFocus === 1}>
                    <TouchableOpacity
                      onPress={handleEnter}
                      activeOpacity={0.7}
                      disabled={duels.isLoading}
                    >
                      <View>
                        <Text
                          style={[
                            styles.panelButtonText,
                            isCompact && compactStyles.panelButtonText,
                            duels.isLoading && { opacity: 0 },
                            hasExistingDuelSession && { marginLeft: -30 },
                          ]}
                        >
                          {hasExistingDuelSession ? 'Resume Session' : 'Enter Duels'}
                        </Text>
                        {duels.isLoading && (
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
      </ImageBackground>
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
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
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
  },
  titleImage: {
    width: 280,
    height: 70,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  panelWrapper: {
    width: '75%',
    maxWidth: 300,
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
  panelRowPot: {
    alignSelf: 'flex-end',
    marginRight: 42,
    marginTop: 8,
  },
  panelRowOpponent: {
    alignSelf: 'flex-start',
    marginLeft: 34,
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
    gap: 76,
    marginTop: 53,
    marginLeft: 32,
  },
  panelButtonText: {
    fontFamily: Typography.button,
    fontWeight: 'bold',
    fontSize: 18,
    color: '#3d2b1f',
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
});

const compactStyles = StyleSheet.create({
  header: {
    marginTop: 12,
  },
  headerButton: {
    width: 140,
    height: 76,
  },
  headerButtonText: {
    fontSize: 28,
    marginBottom: 6,
  },
  titleImage: {
    width: 520,
    height: 130,
    marginBottom: 20,
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
    marginTop: 150,
    marginLeft: 146,
    gap: 220,
  },
  panelButtonText: {
    fontSize: 52,
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
});
