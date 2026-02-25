/**
 * PitDraftScreen - Pit Draft PvP mode
 *
 * Single screen managing the full Pit Draft flow through internal phases:
 * - confirm: Show entry fee, confirm payment
 * - queuing: Waiting for opponent (poll queue)
 * - matched: Match found, preparing combat display
 * - combat: Combat replay (CombatProvider + CombatArena)
 * - result: Show win/loss + payout
 * - error: Error state
 */

import React, { useEffect, useCallback, useRef, useState } from 'react';
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
import { CombatProvider, useCombat } from '../contexts/CombatContext';
import { useProfile } from '../contexts/ProfileContext';
import { useIsFocused } from '@react-navigation/native';
import { useScreenVariant } from '../contexts/ScreenVariantContext';
import { usePitDraft } from '../hooks/usePitDraft';
import { useLandscapeLock } from '../hooks/useOrientationLock';
import { CombatLayout } from '../components/combat';
import { Typography } from '../theme/typography';
import { PIT_DRAFT_ENTRY_LAMPORTS } from '../services/solana/pitDraft';
import { useControllerAction } from '../hooks/useControllerAction';
import { ControllerHints, type ButtonHint } from '../components/ui/ControllerHints';
import { useInputMode } from '../hooks/useInputMode';
import { FocusGlow } from '../components/ui/FocusGlow';
import { useEquippedSkinImage } from '../hooks/useEquippedSkinImage';
import { useAudio } from '../contexts/AudioContext';
import { usePaymentToken } from '@/hooks/usePaymentToken';
import { PaymentTokenSelector, PaymentConfirmationModal } from '@/components/payment';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');
const STAINS_BACKGROUND = require('../../assets/ui/backgrounds/stains-background.png');
const PIT_DRAFT_TITLE = require('../../assets/ui/text/pit-draft.png');
const PVP_MODES_PANEL = require('../../assets/ui/panels/pvp-modes-panel.png');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.png');
const buttonV4Source = require('../../assets/ui/buttons/button-v4.png');
const defaultMoleImageSource = require('../../assets/entities/characters/default-mole.png');
const SOL_PILE = require('../../assets/ui/illustrations/sol-pile.png');
const CHEST = require('../../assets/ui/illustrations/chest.png');
const ITEMS = require('../../assets/ui/illustrations/items.png');
const VICTORY_TEXT = require('../../assets/ui/text/victory.png');
const DEFEAT_TEXT = require('../../assets/ui/text/defeat.png');
const VICTORY_IMAGE = require('../../assets/ui/illustrations/victory-image.png');
const DEFEAT_IMAGE_ILLUST = require('../../assets/ui/illustrations/defeat-image.png');
const SQUARE_FRAME = require('../../assets/ui/frames/square.png');
const BUTTON_BG = require('../../assets/ui/buttons/button.png');
const BUTTON_GREEN = require('../../assets/ui/buttons/button-green.png');

type PitDraftScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PitDraft'>;
};

export function PitDraftScreen({ navigation }: PitDraftScreenProps) {
  const { defaultCombatSpeed, updateDefaultCombatSpeed } = useProfile();
  const pitDraft = usePitDraft();

  // Lock to landscape orientation
  useLandscapeLock();

  // Only wrap in CombatProvider when we have match data for combat phase
  if (pitDraft.phase === 'combat' && pitDraft.matchData) {
    return (
      <CombatProvider initialSpeed={defaultCombatSpeed} onSpeedChange={updateDefaultCombatSpeed}>
        <CombatPhaseContent navigation={navigation} pitDraft={pitDraft} />
      </CombatProvider>
    );
  }

  return <PitDraftContent navigation={navigation} pitDraft={pitDraft} />;
}

// ============================================================================
// Main Content (non-combat phases)
// ============================================================================

interface PitDraftContentProps {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PitDraft'>;
  pitDraft: ReturnType<typeof usePitDraft>;
}

function PitDraftContent({ navigation, pitDraft }: PitDraftContentProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const isFocused = useIsFocused();
  const isCompact = useScreenVariant() === 'compact';
  const { playBgm } = useAudio();

  const payment = usePaymentToken(BigInt(PIT_DRAFT_ENTRY_LAMPORTS));
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Play victory/defeat music on result phase
  useEffect(() => {
    if (pitDraft.phase === 'result' && pitDraft.matchData) {
      playBgm(pitDraft.matchData.isWinner ? 'victory' : 'defeat', { crossfade: true });
    }
  }, [pitDraft.phase, pitDraft.matchData, playBgm]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  // Pulse animation for queuing phase
  useEffect(() => {
    if (pitDraft.phase !== 'queuing') return;

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.5,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pitDraft.phase]);

  // Auto-transition from matched to combat
  useEffect(() => {
    if (pitDraft.phase === 'matched') {
      const timer = setTimeout(() => {
        pitDraft.startCombatPhase();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [pitDraft.phase]);

  const handleBack = useCallback(() => {
    pitDraft.reset();
    navigation.goBack();
  }, [navigation, pitDraft]);

  // --- Controller navigation ---
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const [panelFocus, setPanelFocus] = useState(1); // 0 = History, 1 = Enter

  const handleHistory = useCallback(() => {
    navigation.navigate('PitDraftHistory');
  }, [navigation]);

  const handleEnterDirect = useCallback(() => {
    pitDraft.enterPitDraft();
  }, [pitDraft]);

  const handleEnter = useCallback(async () => {
    if (!payment.selectedToken.isNative && payment.quote) {
      setShowPaymentModal(true);
      return;
    }
    handleEnterDirect();
  }, [payment.selectedToken, payment.quote, handleEnterDirect]);

  const handlePaymentConfirm = useCallback(() => {
    setShowPaymentModal(false);
    handleEnterDirect();
  }, [handleEnterDirect]);

  const cycleToken = useCallback(
    (dir: -1 | 1) => {
      const tokens = payment.supportedTokens;
      const idx = tokens.findIndex((t) => t.symbol === payment.selectedToken.symbol);
      const next = idx + dir;
      if (next >= 0 && next < tokens.length) {
        payment.setSelectedToken(tokens[next]);
      }
    },
    [payment]
  );

  useControllerAction(
    showPaymentModal
      ? {}
      : {
          onB: handleBack,
          onA: panelFocus === 0 ? handleHistory : !pitDraft.isLoading ? handleEnter : undefined,
          onDPadLeft: () => setPanelFocus(0),
          onDPadRight: () => setPanelFocus(1),
          onL1: () => cycleToken(-1),
          onR1: () => cycleToken(1),
        },
    isController && isFocused && (pitDraft.phase === 'confirm' || pitDraft.phase === 'queuing')
  );

  // Controller for result/error phases
  useControllerAction(
    {
      onA: pitDraft.phase === 'result' ? handleBack : pitDraft.phase === 'error' ? pitDraft.reset : undefined,
      onB: pitDraft.phase === 'error' ? handleBack : undefined,
    },
    isController && isFocused && (pitDraft.phase === 'result' || pitDraft.phase === 'error'),
  );

  const resultHints: ButtonHint[] = pitDraft.phase === 'error'
    ? [{ button: 'A', label: 'Try Again' }, { button: 'B', label: 'Back' }]
    : [{ button: 'A', label: 'Back to Hub' }];

  const controllerHints: ButtonHint[] = [
    { button: 'L1R1', label: 'Currency' },
    { button: 'DPadLeftRight', label: 'Switch' },
    { button: 'A', label: 'Select' },
    { button: 'B', label: 'Back' },
  ];

  const entryFeeSOL = PIT_DRAFT_ENTRY_LAMPORTS / 1_000_000_000;

  // Result phase — illustrated layout with stains background
  if (pitDraft.phase === 'result' && pitDraft.matchData) {
    const isWinner = pitDraft.matchData.isWinner;
    const payoutSOL = (pitDraft.matchData.resolved.winnerPayout / 1_000_000_000).toFixed(3);
    const turns = pitDraft.matchData.resolved.turnsTaken;

    return (
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
          <Image source={STAINS_BACKGROUND} style={styles.stainsOverlay} resizeMode="cover" />
          <View style={styles.resultOverlay}>
            <View style={styles.centerContent}>
              {isCompact ? (
                <View style={styles.resultContainerCompact}>
                  <Image
                    source={PIT_DRAFT_TITLE}
                    style={styles.resultTitleImageCompact}
                    resizeMode="contain"
                  />

                  {isWinner ? (
                    <>
                      <Image
                        source={VICTORY_TEXT}
                        style={styles.resultStampImageCompact}
                        resizeMode="contain"
                        // @ts-ignore – RN supports tintColor on Image
                        tintColor="#44BB44"
                      />
                      <Image
                        source={VICTORY_IMAGE}
                        style={styles.resultIllustrationCompact}
                        resizeMode="contain"
                      />
                      <Text style={styles.payoutTextCompact}>+{payoutSOL} SOL</Text>
                    </>
                  ) : (
                    <>
                      <Image
                        source={DEFEAT_TEXT}
                        style={styles.resultStampImageCompact}
                        resizeMode="contain"
                        // @ts-ignore – RN supports tintColor on Image
                        tintColor="#CC4444"
                      />
                      <Image
                        source={DEFEAT_IMAGE_ILLUST}
                        style={styles.resultIllustrationCompact}
                        resizeMode="contain"
                      />
                    </>
                  )}

                  <View style={styles.resultStatFrameCompact}>
                    <Image source={SQUARE_FRAME} style={styles.resultStatFrameBg} resizeMode="stretch" />
                    <Text style={styles.resultStatValueCompact}>{turns}</Text>
                    <Text style={styles.resultStatLabelCompact}>Turns</Text>
                  </View>

                  <View style={styles.resultButtonSlotCompact}>
                    <TouchableOpacity onPress={handleBack} activeOpacity={0.7} style={styles.resultButtonPressable}>
                      <ImageBackground
                        source={isWinner ? BUTTON_GREEN : BUTTON_BG}
                        style={styles.resultButtonImage}
                        resizeMode="contain"
                      >
                        <Text style={styles.resultButtonTextCompact}>Back to Hub</Text>
                      </ImageBackground>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.resultRow}>
                  <View style={styles.resultLeftColumn}>
                    <Image
                      source={PIT_DRAFT_TITLE}
                      style={styles.resultTitleImage}
                      resizeMode="contain"
                    />
                    {isWinner ? (
                      <>
                        <Image
                          source={VICTORY_TEXT}
                          style={styles.resultStampImage}
                          resizeMode="contain"
                          // @ts-ignore – RN supports tintColor on Image
                          tintColor="#44BB44"
                        />
                        <Image
                          source={VICTORY_IMAGE}
                          style={styles.resultIllustration}
                          resizeMode="contain"
                        />
                      </>
                    ) : (
                      <>
                        <Image
                          source={DEFEAT_TEXT}
                          style={styles.resultStampImage}
                          resizeMode="contain"
                          // @ts-ignore – RN supports tintColor on Image
                          tintColor="#CC4444"
                        />
                        <Image
                          source={DEFEAT_IMAGE_ILLUST}
                          style={styles.resultIllustration}
                          resizeMode="contain"
                        />
                      </>
                    )}
                  </View>

                  <View style={styles.resultRightColumn}>
                    {isWinner && (
                      <Text style={styles.payoutText}>+{payoutSOL} SOL</Text>
                    )}

                    <View style={styles.resultStatFrame}>
                      <Image source={SQUARE_FRAME} style={styles.resultStatFrameBg} resizeMode="stretch" />
                      <Text style={styles.resultStatValue}>{turns}</Text>
                      <Text style={styles.resultStatLabel}>Turns</Text>
                    </View>

                    <View style={styles.resultButtonSlot}>
                      <TouchableOpacity onPress={handleBack} activeOpacity={0.7} style={styles.resultButtonPressable}>
                        <ImageBackground
                          source={isWinner ? BUTTON_GREEN : BUTTON_BG}
                          style={styles.resultButtonImage}
                          resizeMode="contain"
                        >
                          <Text style={styles.resultButtonText}>Back to Hub</Text>
                        </ImageBackground>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            </View>
          </View>
        </ImageBackground>
        <ControllerHints hints={resultHints} horizontal />
      </Animated.View>
    );
  }

  // Confirm phase uses the new Gauntlet-style layout
  if (pitDraft.phase === 'confirm') {
    return (
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
          <Image source={STAINS_BACKGROUND} style={styles.stainsOverlay} resizeMode="cover" />
          <View style={styles.confirmContent}>
            {/* Header */}
            <View style={[styles.confirmHeader, isCompact && compactStyles.confirmHeader]}>
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
                source={PIT_DRAFT_TITLE}
                style={[styles.titleImage, isCompact && compactStyles.titleImage]}
                resizeMode="contain"
              />
            </View>

            {/* Panel with all content overlaid */}
            <View style={styles.confirmCenterContent}>
              <View style={[styles.panelWrapper, isCompact && compactStyles.panelWrapper]}>
                <Image
                  source={PVP_MODES_PANEL}
                  style={styles.pvpModesPanel}
                  resizeMode="contain"
                />
                <View
                  style={[styles.panelOverlay, isCompact && compactStyles.panelOverlay]}
                >
                  <View style={[styles.panelRow, styles.panelRowFee, isCompact && compactStyles.panelRowFee]}>
                    <Text style={[styles.panelTextFee, isCompact && compactStyles.panelText]}>
                      Entry fee: {entryFeeSOL} SOL
                    </Text>
                    <Image source={SOL_PILE} style={[styles.panelIcon, isCompact && compactStyles.panelIcon]} resizeMode="contain" />
                  </View>
                  <View style={[styles.panelRow, styles.panelRowPot, isCompact && compactStyles.panelRowPot]}>
                    <Text style={[styles.panelTextBody, isCompact && compactStyles.panelText]}>
                      Winner takes{'\n'}it all
                    </Text>
                    <Image source={CHEST} style={[styles.panelIcon, isCompact && compactStyles.panelIcon]} resizeMode="contain" />
                  </View>
                  <View style={[styles.panelRow, styles.panelRowItems, isCompact && compactStyles.panelRowItems]}>
                    <Text style={[styles.panelTextBody, isCompact && compactStyles.panelText]}>
                      Items drafted from{'\n'}your unlocked pool
                    </Text>
                    <Image source={ITEMS} style={[styles.panelIcon, isCompact && compactStyles.panelIcon]} resizeMode="contain" />
                  </View>

                  <View
                    style={[styles.panelButtons, isCompact && compactStyles.panelButtons]}
                  >
                    <FocusGlow active={isController && panelFocus === 0}>
                      <TouchableOpacity
                        onPress={() => navigation.navigate('PitDraftHistory')}
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
                        disabled={pitDraft.isLoading}
                      >
                        <View>
                          <Text
                            style={[
                              styles.panelButtonText,
                              isCompact && compactStyles.panelButtonText,
                              pitDraft.isLoading && { opacity: 0 },
                            ]}
                          >
                            Enter Pit Draft
                          </Text>
                          {pitDraft.isLoading && (
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
              <View style={[styles.tokenSelectorWrap, isCompact && compactStyles.tokenSelectorWrap]}>
                <PaymentTokenSelector
                  tokens={payment.supportedTokens}
                  selectedToken={payment.selectedToken}
                  onSelectToken={payment.setSelectedToken}
                  quote={payment.quote}
                  isQuoteLoading={payment.isQuoteLoading}
                  solUsdPrice={payment.solUsdPrice}
                  requiredLamports={BigInt(PIT_DRAFT_ENTRY_LAMPORTS)}
                  isCompact={isCompact}
                  isController={isController}
                />
              </View>
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
        <ControllerHints hints={controllerHints} />
      </Animated.View>
    );
  }

  // Queuing phase — matches the confirm phase visual style
  if (pitDraft.phase === 'queuing') {
    const queuingHints: ButtonHint[] = [{ button: 'B', label: 'Back' }];

    return (
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
          <Image source={STAINS_BACKGROUND} style={styles.stainsOverlay} resizeMode="cover" />
          <View style={styles.confirmContent}>
            {/* Header */}
            <View style={[styles.confirmHeader, isCompact && compactStyles.confirmHeader]}>
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
                source={PIT_DRAFT_TITLE}
                style={[styles.titleImage, isCompact && compactStyles.titleImage]}
                resizeMode="contain"
              />
            </View>

            {/* Waiting content */}
            <View style={styles.confirmCenterContent}>
              <Animated.View style={[styles.queuingContent, { opacity: pulseAnim }]}>
                <Text style={[styles.queuingText, isCompact && compactStyles.queuingText]}>
                  Waiting for opponent...
                </Text>
              </Animated.View>

              <Text style={[styles.queuingInfo, isCompact && compactStyles.queuingInfo]}>
                Your entry has been recorded on-chain.
                {'\n'}The match will resolve when another player joins.
              </Text>

              <Text style={[styles.queuingNote, isCompact && compactStyles.queuingNote]}>
                The match will still happen if you leave this screen.
              </Text>
            </View>
          </View>
        </ImageBackground>
        <ControllerHints hints={queuingHints} horizontal />
      </Animated.View>
    );
  }

  // Other phases use the original dark overlay layout
  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
        <View style={styles.darkOverlay}>
          <View style={styles.centerContent}>
            {/* Matched Phase (brief transition) */}
            {pitDraft.phase === 'matched' && (
              <View style={styles.phaseContainer}>
                <Text style={styles.title}>MATCH FOUND</Text>
                <ActivityIndicator color="#FABC0F" size="large" />
              </View>
            )}

            {/* Error Phase */}
            {pitDraft.phase === 'error' && (
              <View style={styles.phaseContainer}>
                <Text style={styles.title}>PIT DRAFT</Text>
                <Text style={styles.errorText}>{pitDraft.error}</Text>

                <View style={styles.buttonRow}>
                  <TouchableOpacity onPress={handleBack} activeOpacity={0.7}>
                    <ImageBackground
                      source={buttonV1Source}
                      style={styles.actionButton}
                      resizeMode="stretch"
                    >
                      <Text style={styles.buttonText}>Back</Text>
                    </ImageBackground>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={pitDraft.reset} activeOpacity={0.7}>
                    <ImageBackground
                      source={buttonV4Source}
                      style={styles.actionButton}
                      resizeMode="stretch"
                    >
                      <Text style={styles.buttonTextPrimary}>Try Again</Text>
                    </ImageBackground>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </ImageBackground>
      {pitDraft.phase === 'error' && (
        <ControllerHints hints={resultHints} horizontal />
      )}
    </Animated.View>
  );
}

// ============================================================================
// Combat Phase Content (inside CombatProvider)
// ============================================================================

interface CombatPhaseContentProps {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PitDraft'>;
  pitDraft: ReturnType<typeof usePitDraft>;
}

function CombatPhaseContent({ pitDraft }: CombatPhaseContentProps) {
  const { profile } = useProfile();
  const { playBgm } = useAudio();
  const playerSkinSource = useEquippedSkinImage(profile?.equippedSkin);
  const opponentSkinSource = useEquippedSkinImage(pitDraft.matchData?.opponentSkinPubkey ?? null);
  const { state: combatState, startCombatWithLog } = useCombat();

  // Play combat music when combat phase starts
  useEffect(() => {
    playBgm('standard_combat', { crossfade: true, resume: false });
  }, [playBgm]);

  // Start combat replay when component mounts
  useEffect(() => {
    if (combatState.combat || !pitDraft.matchData) return;

    const { player, enemy, combatLog } = pitDraft.matchData;

    const resolverInput = {
      player,
      enemy,
      seed: 0, // Not used when replaying from log
      playerGold: pitDraft.matchData.playerGold,
      enemyGold: pitDraft.matchData.enemyGold,
      preserveArmor: true,
    };

    startCombatWithLog(resolverInput, combatLog);
  }, [pitDraft.matchData, combatState.combat, startCombatWithLog]);

  // Handle combat completion
  const handleCombatComplete = useCallback(() => {
    pitDraft.showResult();
  }, [pitDraft]);

  return (
    <CombatLayout
      label="PIT DRAFT"
      playerSkinSource={playerSkinSource}
      pvpOpponentSkinSource={opponentSkinSource}
      enemyPanel={{
        name: 'Opponent',
        emoji: '',
        imageSource: opponentSkinSource,
        dig: pitDraft.matchData?.enemy.dig ?? 0,
        subtitle: pitDraft.matchData?.opponentProfileName,
        equippedTool: pitDraft.matchData?.enemyTool,
        equippedGear: pitDraft.matchData?.enemyGear,
      }}
      playerPanel={{
        name: 'You',
        emoji: '',
        imageSource: playerSkinSource,
        dig: pitDraft.matchData?.player.dig ?? 0,
        subtitle: pitDraft.matchData?.playerProfileName,
        equippedTool: pitDraft.matchData?.playerTool,
        equippedGear: pitDraft.matchData?.playerGear,
      }}
      onCombatComplete={handleCombatComplete}
    />
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: { flex: 1 },
  backgroundImage: { flex: 1, width: '100%', height: '100%' },
  darkOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.3)' },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },

  // Confirm phase (Gauntlet-style layout)
  stainsOverlay: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  confirmContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  confirmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 0,
  },
  headerSpacer: { flex: 1 },
  headerButton: {
    width: 90,
    height: 36,
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
    width: 265,
    height: 58,
  },
  confirmCenterContent: {
    flex: 1,
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
  panelRowItems: {
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
  tokenSelectorWrap: {
    alignItems: 'center',
    marginTop: 0,
  },
  panelButtons: {
    flexDirection: 'row',
    gap: 62,
    marginTop: 53,
    marginLeft: 32,
  },
  panelButtonText: {
    fontFamily: Typography.button,
    fontWeight: 'bold',
    fontSize: 18,
    color: '#3d2b1f',
  },

  // Queuing phase
  queuingContent: {
    alignItems: 'center',
  },
  queuingText: {
    fontFamily: Typography.header,
    fontSize: 22,
    color: '#3d2b1f',
    textAlign: 'center',
  },
  queuingInfo: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: '#5c4033',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 16,
  },
  queuingNote: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#8a7a6a',
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },

  // Result phase — shared
  resultOverlay: {
    flex: 1,
  },
  resultStatFrameBg: {
    position: 'absolute' as const,
    width: '100%',
    height: '100%',
  },
  resultButtonPressable: {
    width: '100%',
    height: '100%',
  },
  resultButtonImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Result — mobile (landscape row layout)
  resultRow: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 700,
    gap: 0,
  },
  resultLeftColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    maxWidth: 280,
    gap: 8,
  },
  resultRightColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    maxWidth: 240,
    gap: 16,
  },
  resultTitleImage: {
    width: 200,
    height: 50,
    marginBottom: 4,
  },
  resultStampImage: {
    width: 180,
    height: 80,
  },
  resultIllustration: {
    width: 120,
    height: 120,
  },
  resultStatFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  resultStatValue: {
    fontFamily: Typography.number,
    fontSize: 22,
    fontWeight: 'bold' as const,
    color: '#000000',
  },
  resultStatLabel: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#1A1A1A',
    marginTop: 2,
  },
  resultButtonSlot: {
    width: 200,
    aspectRatio: 3.2,
    marginTop: 8,
  },
  resultButtonText: {
    fontFamily: Typography.button,
    fontSize: 15,
    fontWeight: 'bold' as const,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },

  // Result — compact (non-mobile, ~2x bigger)
  resultContainerCompact: {
    alignItems: 'center',
    gap: 20,
    maxWidth: 800,
  },
  resultTitleImageCompact: {
    width: 400,
    height: 100,
    marginBottom: 8,
  },
  resultStampImageCompact: {
    width: 360,
    height: 160,
  },
  resultIllustrationCompact: {
    width: 320,
    height: 320,
    marginTop: -40,
    marginBottom: -40,
  },
  payoutTextCompact: {
    fontFamily: Typography.number,
    fontSize: 48,
    color: '#FABC0F',
    textAlign: 'center' as const,
    fontWeight: 'bold' as const,
  },
  resultStatFrameCompact: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 160,
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  resultStatValueCompact: {
    fontFamily: Typography.number,
    fontSize: 44,
    fontWeight: 'bold' as const,
    color: '#000000',
  },
  resultStatLabelCompact: {
    fontFamily: Typography.body,
    fontSize: 24,
    color: '#1A1A1A',
    marginTop: 4,
  },
  resultButtonSlotCompact: {
    width: 400,
    aspectRatio: 3.2,
    marginTop: 16,
  },
  resultButtonTextCompact: {
    fontFamily: Typography.button,
    fontSize: 32,
    fontWeight: 'bold' as const,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },

  // Other phases
  phaseContainer: { alignItems: 'center', gap: 16, maxWidth: 400 },
  title: {
    fontFamily: Typography.header,
    fontSize: 32,
    color: '#FABC0F',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  actionButton: { width: 140, height: 52, justifyContent: 'center', alignItems: 'center' },
  buttonText: { fontFamily: Typography.button, fontSize: 14, color: '#3d2b1f', marginBottom: 4 },
  buttonTextPrimary: { fontFamily: Typography.button, fontSize: 14, color: '#1a1a1a', marginBottom: 4 },
  payoutText: {
    fontFamily: Typography.number,
    fontSize: 24,
    color: '#FABC0F',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  errorText: { fontFamily: Typography.body, fontSize: 14, color: '#F44336', textAlign: 'center', lineHeight: 20 },

});

const compactStyles = StyleSheet.create({
  confirmHeader: {
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
  panelRowItems: {
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
  tokenSelectorWrap: {
    marginTop: 10,
  },
  panelButtons: {
    marginTop: 150,
    marginLeft: 146,
    gap: 190,
  },
  panelButtonText: {
    fontSize: 52,
  },
  queuingText: {
    fontSize: 44,
  },
  queuingInfo: {
    fontSize: 26,
    lineHeight: 36,
    marginTop: 32,
  },
  queuingNote: {
    fontSize: 20,
    marginTop: 24,
  },
});
