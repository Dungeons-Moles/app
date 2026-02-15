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

import React, { useEffect, useCallback, useRef, useMemo } from 'react';
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
import { useScreenVariant } from '../contexts/ScreenVariantContext';
import { usePitDraft } from '../hooks/usePitDraft';
import { useLandscapeLock } from '../hooks/useOrientationLock';
import {
  CombatArena,
  VictoryDefeatDisplay,
  EnemyPanel,
  PlayerPanel,
  SpeedControls,
} from '../components/combat';
import { Typography } from '../theme/typography';
import { PIT_DRAFT_ENTRY_LAMPORTS } from '../services/solana/pitDraft';

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
  route: import('@react-navigation/native').RouteProp<RootStackParamList, 'PitDraft'>;
};

export function PitDraftScreen({ navigation, route }: PitDraftScreenProps) {
  const { defaultCombatSpeed, updateDefaultCombatSpeed } = useProfile();
  const pitDraft = usePitDraft();
  const debugResult = route.params?.debugResult;

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

  return <PitDraftContent navigation={navigation} pitDraft={pitDraft} debugResult={debugResult} />;
}

// ============================================================================
// Main Content (non-combat phases)
// ============================================================================

interface PitDraftContentProps {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PitDraft'>;
  pitDraft: ReturnType<typeof usePitDraft>;
  debugResult?: 'victory' | 'defeat';
}

function PitDraftContent({ navigation, pitDraft, debugResult }: PitDraftContentProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const isCompact = useScreenVariant() === 'compact';

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

  const entryFeeSOL = PIT_DRAFT_ENTRY_LAMPORTS / 1_000_000_000;

  // DEBUG: Show mock result phase when debugResult param is passed
  if (debugResult) {
    const isWinner = debugResult === 'victory';
    return (
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
          <Image source={STAINS_BACKGROUND} style={styles.stainsOverlay} resizeMode="cover" />
          <View style={styles.resultOverlay}>
            <View style={styles.centerContent}>
              {isCompact ? (
                // Compact (non-mobile): vertical layout, everything ~2x bigger
                <View style={styles.resultContainerCompact}>
                  {/* Pit Draft Title */}
                  <Image
                    source={PIT_DRAFT_TITLE}
                    style={styles.resultTitleImageCompact}
                    resizeMode="contain"
                  />

                  {/* Victory or Defeat stamp + illustration */}
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
                      <Text style={styles.payoutTextCompact}>+0.002 SOL</Text>
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

                  {/* Turns stat in frame */}
                  <View style={styles.resultStatFrameCompact}>
                    <Image source={SQUARE_FRAME} style={styles.resultStatFrameBg} resizeMode="stretch" />
                    <Text style={styles.resultStatValueCompact}>8</Text>
                    <Text style={styles.resultStatLabelCompact}>Turns</Text>
                  </View>

                  {/* Button */}
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
                // Mobile: horizontal flex layout
                <View style={styles.resultRow}>
                  {/* Left column: title, stamp, illustration */}
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

                  {/* Right column: payout, turns, button */}
                  <View style={styles.resultRightColumn}>
                    {isWinner && (
                      <Text style={styles.payoutText}>+0.002 SOL</Text>
                    )}

                    <View style={styles.resultStatFrame}>
                      <Image source={SQUARE_FRAME} style={styles.resultStatFrameBg} resizeMode="stretch" />
                      <Text style={styles.resultStatValue}>8</Text>
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

                    <TouchableOpacity
                      onPress={pitDraft.enterPitDraft}
                      activeOpacity={0.7}
                      disabled={pitDraft.isLoading}
                    >
                      {pitDraft.isLoading ? (
                        <ActivityIndicator color="#3d2b1f" size="small" />
                      ) : (
                        <Text
                          style={[
                            styles.panelButtonText,
                            isCompact && compactStyles.panelButtonText,
                          ]}
                        >
                          Enter Pit Draft
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </ImageBackground>
      </Animated.View>
    );
  }

  // Other phases use the original dark overlay layout
  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
        <View style={styles.darkOverlay}>
          <View style={styles.centerContent}>
            {/* Queuing Phase */}
            {pitDraft.phase === 'queuing' && (
              <View style={styles.phaseContainer}>
                <Text style={styles.title}>PIT DRAFT</Text>

                <Animated.View style={{ opacity: pulseAnim }}>
                  <Text style={styles.waitingText}>Waiting for opponent...</Text>
                </Animated.View>

                <Text style={styles.infoTextSmall}>
                  Your entry has been recorded on-chain.
                  {'\n'}The match will resolve when another player joins.
                </Text>

                <TouchableOpacity onPress={handleBack} activeOpacity={0.7} style={{ marginTop: 24 }}>
                  <ImageBackground
                    source={buttonV1Source}
                    style={styles.actionButton}
                    resizeMode="stretch"
                  >
                    <Text style={styles.buttonText}>Back to Hub</Text>
                  </ImageBackground>
                </TouchableOpacity>

                <Text style={styles.noteText}>
                  The match will still happen if you leave this screen.
                </Text>
              </View>
            )}

            {/* Matched Phase (brief transition) */}
            {pitDraft.phase === 'matched' && (
              <View style={styles.phaseContainer}>
                <Text style={styles.title}>MATCH FOUND</Text>
                <ActivityIndicator color="#FABC0F" size="large" />
              </View>
            )}

            {/* Result Phase */}
            {pitDraft.phase === 'result' && pitDraft.matchData && (
              <View style={styles.phaseContainer}>
                <Text style={styles.title}>PIT DRAFT</Text>

                {pitDraft.matchData.isWinner ? (
                  <>
                    <Text style={styles.victoryText}>VICTORY</Text>
                    <Text style={styles.payoutText}>
                      +{(pitDraft.matchData.resolved.winnerPayout / 1_000_000_000).toFixed(3)} SOL
                    </Text>
                  </>
                ) : (
                  <Text style={styles.defeatText}>DEFEAT</Text>
                )}

                <View style={styles.matchDetails}>
                  <Text style={styles.detailText}>
                    Turns: {pitDraft.matchData.resolved.turnsTaken}
                  </Text>
                </View>

                <TouchableOpacity onPress={handleBack} activeOpacity={0.7} style={{ marginTop: 24 }}>
                  <ImageBackground
                    source={buttonV4Source}
                    style={styles.actionButton}
                    resizeMode="stretch"
                  >
                    <Text style={styles.buttonTextPrimary}>Back to Hub</Text>
                  </ImageBackground>
                </TouchableOpacity>
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
  const {
    state: combatState,
    speed,
    setSpeed,
    startCombatWithLog,
    getDisplayStates,
    getResult,
  } = useCombat();

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, []);

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

  const { player, enemy, playerGold, enemyGold } = getDisplayStates();
  const result = getResult();
  const speedControlsDisabled = !combatState.resolvedCombat || combatState.isComplete;
  const combatRef = useRef(combatState.combat);
  const playerPeakArmRef = useRef(0);
  const enemyPeakArmRef = useRef(0);

  if (combatRef.current !== combatState.combat) {
    combatRef.current = combatState.combat;
    playerPeakArmRef.current = combatState.combat
      ? combatState.combat.player.arm + combatState.combat.player.bonusArm
      : 0;
    enemyPeakArmRef.current = combatState.combat
      ? combatState.combat.enemy.arm + combatState.combat.enemy.bonusArm
      : 0;
  }

  if (player) {
    playerPeakArmRef.current = Math.max(playerPeakArmRef.current, player.arm);
  }
  if (enemy) {
    enemyPeakArmRef.current = Math.max(enemyPeakArmRef.current, enemy.arm);
  }

  const basePlayerArm = combatState.combat
    ? combatState.combat.player.arm + combatState.combat.player.bonusArm
    : (player?.arm ?? 0);
  const baseEnemyArm = combatState.combat
    ? combatState.combat.enemy.arm + combatState.combat.enemy.bonusArm
    : (enemy?.arm ?? 0);
  const playerMaxArm = player
    ? Math.max(basePlayerArm, playerPeakArmRef.current, player.arm)
    : 0;
  const enemyMaxArm = enemy
    ? Math.max(baseEnemyArm, enemyPeakArmRef.current, enemy.arm)
    : 0;

  const activeActor = useMemo(() => {
    const entry = combatState.resolvedCombat?.log[combatState.currentLogIndex];
    if (entry?.actor === 'player' || entry?.actor === 'enemy') {
      return entry.actor;
    }
    return null;
  }, [combatState.currentLogIndex, combatState.resolvedCombat]);

  const currentTurn = useMemo(() => {
    const entry = combatState.resolvedCombat?.log[combatState.currentLogIndex];
    return Math.max(1, entry?.turn ?? 1);
  }, [combatState.currentLogIndex, combatState.resolvedCombat]);

  if (!player || !enemy) {
    return (
      <View style={styles.container}>
        <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
          <View style={styles.darkOverlay}>
            <View style={styles.centerContent}>
              <Text style={styles.loadingText}>Preparing combat...</Text>
            </View>
          </View>
        </ImageBackground>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
        <View style={styles.darkOverlay}>
          {/* PvP Label */}
          <View style={styles.pvpLabel}>
            <Text style={styles.pvpLabelText}>PIT DRAFT</Text>
          </View>

          <View style={styles.combatContent}>
            {/* Enemy (Opponent) Panel - LEFT */}
            <EnemyPanel
              name="Opponent"
              emoji=""
              imageSource={defaultMoleImageSource}
              hp={enemy.hp}
              maxHp={enemy.maxHp}
              atk={enemy.atk}
              arm={enemy.arm}
              maxArm={enemyMaxArm}
              spd={enemy.spd}
              dig={enemy.dig}
              gold={enemyGold}
              statusEffects={enemy.statusEffects}
              subtitle={pitDraft.matchData?.opponentProfileName}
              equippedTool={pitDraft.matchData?.enemyTool}
              equippedGear={pitDraft.matchData?.enemyGear}
            />

            {/* Combat Arena - CENTER */}
            <View style={styles.arenaArea}>
              <CombatArena
                player={player}
                enemy={enemy}
                damageNumbers={combatState.damageNumbers}
                effectNotifications={combatState.effectNotifications}
                isAnimating={combatState.isAnimating}
                currentTurn={currentTurn}
                activeActor={activeActor}
                playerMaxArm={playerMaxArm}
                enemyMaxArm={enemyMaxArm}
              />

              <View style={styles.controlsArea}>
                <SpeedControls
                  currentSpeed={speed}
                  onSpeedChange={setSpeed}
                  disabled={speedControlsDisabled}
                />
              </View>
            </View>

            {/* Player Panel - RIGHT */}
            <PlayerPanel
              name="You"
              emoji=""
              hp={player.hp}
              maxHp={player.maxHp}
              atk={player.atk}
              arm={player.arm}
              maxArm={playerMaxArm}
              spd={player.spd}
              dig={player.dig}
              gold={playerGold}
              statusEffects={player.statusEffects}
              subtitle={pitDraft.matchData?.playerProfileName}
              equippedTool={pitDraft.matchData?.playerTool}
              equippedGear={pitDraft.matchData?.playerGear}
            />
          </View>

          {/* Victory/Defeat Overlay */}
          {combatState.isComplete && result && (
            <VictoryDefeatDisplay
              result={result}
              onComplete={handleCombatComplete}
            />
          )}
        </View>
      </ImageBackground>
    </Animated.View>
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
  combatContent: { flex: 1, flexDirection: 'row' },

  // Confirm phase (Gauntlet-style layout)
  stainsOverlay: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  confirmContent: {
    flex: 1,
    padding: 16,
  },
  confirmHeader: {
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
  confirmCenterContent: {
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

  // Debug result phase — shared
  resultOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
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

  // Debug result — mobile (landscape row layout)
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

  // Debug result — compact (non-mobile, ~2x bigger)
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
  infoTextSmall: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: '#999999',
    textAlign: 'center',
    lineHeight: 18,
  },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  actionButton: { width: 140, height: 52, justifyContent: 'center', alignItems: 'center' },
  buttonText: { fontFamily: Typography.button, fontSize: 14, color: '#3d2b1f', marginBottom: 4 },
  buttonTextPrimary: { fontFamily: Typography.button, fontSize: 14, color: '#1a1a1a', marginBottom: 4 },
  waitingText: { fontFamily: Typography.header, fontSize: 22, color: '#FABC0F', textAlign: 'center' },
  noteText: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#666666',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  victoryText: {
    fontFamily: Typography.header,
    fontSize: 36,
    color: '#4CAF50',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
  defeatText: {
    fontFamily: Typography.header,
    fontSize: 36,
    color: '#F44336',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
  payoutText: {
    fontFamily: Typography.number,
    fontSize: 24,
    color: '#FABC0F',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  matchDetails: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  detailText: { fontFamily: Typography.body, fontSize: 14, color: '#c8c8c8', textAlign: 'center' },
  errorText: { fontFamily: Typography.body, fontSize: 14, color: '#F44336', textAlign: 'center', lineHeight: 20 },
  loadingText: { fontFamily: Typography.header, fontSize: 20, color: '#c8c8c8' },

  // Combat layout
  arenaArea: { flex: 2, justifyContent: 'center', alignItems: 'center', padding: 16 },
  controlsArea: { marginTop: 12 },
  pvpLabel: { position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  pvpLabelText: { fontFamily: Typography.header, fontSize: 14, color: '#FABC0F', letterSpacing: 2 },
});

const compactStyles = StyleSheet.create({
  confirmHeader: {
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
  panelButtons: {
    marginTop: 150,
    marginLeft: 146,
    gap: 190,
  },
  panelButtonText: {
    fontSize: 52,
  },
});
