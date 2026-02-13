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
const buttonV1Source = require('../../assets/ui/buttons/button-v1.png');
const buttonV4Source = require('../../assets/ui/buttons/button-v4.png');
const defaultMoleImageSource = require('../../assets/entities/characters/default-mole.png');


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

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
        <View style={styles.darkOverlay}>
          <View style={styles.centerContent}>
            {/* Confirm Phase */}
            {pitDraft.phase === 'confirm' && (
              <View style={styles.phaseContainer}>
                <Text style={styles.title}>PIT DRAFT</Text>
                <Text style={styles.subtitle}>PvP Auto-Battle</Text>

                <View style={styles.infoPanel}>
                  <Text style={styles.infoText}>
                    Entry fee: {entryFeeSOL} SOL
                  </Text>
                  <Text style={styles.infoTextSmall}>
                    Winner takes 95% of the pot (0.19 SOL)
                  </Text>
                  <Text style={styles.infoTextSmall}>
                    Items drafted randomly from your unlocked pool
                  </Text>
                </View>

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

                  <TouchableOpacity
                    onPress={pitDraft.enterPitDraft}
                    activeOpacity={0.7}
                    disabled={pitDraft.isLoading}
                  >
                    <ImageBackground
                      source={buttonV4Source}
                      style={[styles.actionButton, pitDraft.isLoading && { opacity: 0.6 }]}
                      resizeMode="stretch"
                    >
                      {pitDraft.isLoading ? (
                        <ActivityIndicator color="#1a1a1a" size="small" />
                      ) : (
                        <Text style={styles.buttonTextPrimary}>Enter Pit Draft</Text>
                      )}
                    </ImageBackground>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  onPress={() => navigation.navigate('PitDraftHistory')}
                  activeOpacity={0.7}
                >
                  <ImageBackground
                    source={buttonV1Source}
                    style={styles.actionButton}
                    resizeMode="stretch"
                  >
                    <Text style={styles.buttonText}>
                      View Match History
                    </Text>
                  </ImageBackground>
                </TouchableOpacity>
              </View>
            )}

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
  container: {
    flex: 1,
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  darkOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  combatContent: {
    flex: 1,
    flexDirection: 'row',
  },

  // Phase containers
  phaseContainer: {
    alignItems: 'center',
    gap: 16,
    maxWidth: 400,
  },
  title: {
    fontFamily: Typography.header,
    fontSize: 32,
    color: '#FABC0F',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontFamily: Typography.body,
    fontSize: 16,
    color: '#c8c8c8',
    textAlign: 'center',
  },

  // Info panel
  infoPanel: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 8,
    padding: 16,
    gap: 8,
    width: '100%',
  },
  infoText: {
    fontFamily: Typography.number,
    fontSize: 18,
    color: '#ffffff',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  infoTextSmall: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: '#999999',
    textAlign: 'center',
    lineHeight: 18,
  },

  // Buttons
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    width: 140,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#3d2b1f',
    marginBottom: 4,
  },
  buttonTextPrimary: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#1a1a1a',
    marginBottom: 4,
  },
  // Queuing
  waitingText: {
    fontFamily: Typography.header,
    fontSize: 22,
    color: '#FABC0F',
    textAlign: 'center',
  },
  noteText: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#666666',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },

  // Result
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
  detailText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#c8c8c8',
    textAlign: 'center',
  },

  // Error
  errorText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#F44336',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Loading
  loadingText: {
    fontFamily: Typography.header,
    fontSize: 20,
    color: '#c8c8c8',
  },

  // Combat layout
  arenaArea: {
    flex: 2,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  controlsArea: {
    marginTop: 12,
  },

  // PvP label
  pvpLabel: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  pvpLabelText: {
    fontFamily: Typography.header,
    fontSize: 14,
    color: '#FABC0F',
    letterSpacing: 2,
  },
});
