/**
 * CombatOverlay Component
 *
 * Full-screen modal displaying combat animation replay.
 * Implements state machine: idle -> intro -> turns -> outro -> result
 *
 * @see data-model.md for CombatReplay structure
 * @see contracts/combat-events.md for event types
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Animated,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useCombatReplay } from '@/hooks/useCombatReplay';
import { TurnDisplay } from './TurnDisplay';
import { BossIntro } from './BossIntro';
import { Typography } from '@/theme/typography';
import { BOSSES } from '@/data/bosses';
import type { BossId } from '@/game/engine/types';

// ============================================================================
// Props
// ============================================================================

interface CombatOverlayProps {
  /** Whether the overlay is visible */
  visible: boolean;
  /** Enemy name for display */
  enemyName?: string;
  /** Enemy archetype/type */
  enemyArchetype?: string;
  /** Callback when combat animation completes */
  onComplete?: (playerWon: boolean, goldEarned: number) => void;
  /** Callback when user dismisses the overlay */
  onDismiss?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function CombatOverlay({
  visible,
  enemyName = 'Enemy',
  enemyArchetype,
  onComplete,
  onDismiss,
}: CombatOverlayProps) {
  const combat = useCombatReplay();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const hasCalledComplete = useRef(false);
  const [bossIntroPlaying, setBossIntroPlaying] = useState(false);

  // Animate in when visible
  useEffect(() => {
    if (visible) {
      hasCalledComplete.current = false;
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.8);
    }
  }, [visible, fadeAnim, scaleAnim]);

  // Auto-play when combat data is set
  useEffect(() => {
    if (visible && combat.combatReplay && combat.replayState === 'idle') {
      combat.play();
    }
  }, [visible, combat.combatReplay, combat.replayState]);

  // Start boss intro animation when entering intro state for boss combat
  useEffect(() => {
    if (
      visible &&
      combat.replayState === 'intro' &&
      combat.combatReplay?.isBoss &&
      !bossIntroPlaying
    ) {
      setBossIntroPlaying(true);
    }
  }, [visible, combat.replayState, combat.combatReplay?.isBoss, bossIntroPlaying]);

  // Reset boss intro state when overlay closes
  useEffect(() => {
    if (!visible) {
      setBossIntroPlaying(false);
    }
  }, [visible]);

  // Handle combat completion
  useEffect(() => {
    if (
      combat.replayState === 'result' &&
      combat.playerWon !== null &&
      !hasCalledComplete.current
    ) {
      hasCalledComplete.current = true;
      // Delay to show result
      setTimeout(() => {
        onComplete?.(combat.playerWon!, combat.goldEarned);
      }, 1500);
    }
  }, [combat.replayState, combat.playerWon, combat.goldEarned, onComplete]);

  const handleSkip = useCallback(() => {
    combat.skipToEnd();
  }, [combat]);

  const handleDismiss = useCallback(() => {
    combat.clear();
    onDismiss?.();
  }, [combat, onDismiss]);

  /**
   * Handle boss intro completion - advances to turns phase
   * This is called when the BossIntro animation finishes
   */
  const handleBossIntroComplete = useCallback(() => {
    setBossIntroPlaying(false);
    // The combat state machine will automatically advance from intro to turns
    // after the intro duration - no additional action needed here
  }, []);

  // Render content based on state
  const renderContent = () => {
    switch (combat.replayState) {
      case 'idle':
        return <Text style={styles.loadingText}>Preparing combat...</Text>;

      case 'intro': {
        // Show BossIntro for boss combat, otherwise show regular intro
        if (combat.combatReplay?.isBoss && combat.combatReplay.bossIntro) {
          const bossIntro = combat.combatReplay.bossIntro;
          // Look up boss stats from BOSSES data
          const bossId = bossIntro.bossId as BossId;
          const bossData = BOSSES[bossId];
          // Use bossIntro.bossHp for runtime HP, fallback to BOSSES data for other stats
          const bossHp = bossIntro.bossHp ?? bossData?.stats.hp ?? 0;
          const bossAtk = bossData?.stats.atk ?? 0;
          const bossArm = bossData?.stats.arm ?? 0;
          const bossSpd = bossData?.stats.spd ?? 0;
          const bossName = bossData?.name ?? bossId;

          return (
            <BossIntro
              bossName={bossName}
              week={bossIntro.week as 1 | 2 | 3}
              bossHp={bossHp}
              bossAtk={bossAtk}
              bossArm={bossArm}
              bossSpd={bossSpd}
              isPlaying={bossIntroPlaying}
              onComplete={handleBossIntroComplete}
            />
          );
        }

        // Regular enemy intro
        return (
          <View style={styles.introContainer}>
            <Text style={styles.encounterText}>BATTLE!</Text>
            <Text style={styles.enemyNameText}>{enemyName}</Text>
            {enemyArchetype && <Text style={styles.enemyTypeText}>{enemyArchetype}</Text>}
          </View>
        );
      }

      case 'turns':
        return (
          <TurnDisplay
            turnData={combat.currentTurnData}
            statusEffects={combat.currentStatusEffects}
            turnNumber={combat.currentTurn + 1}
            totalTurns={combat.totalTurns}
          />
        );

      case 'outro':
        return (
          <View style={styles.outroContainer}>
            <Text style={styles.outroText}>{combat.playerWon ? 'VICTORY!' : 'DEFEAT'}</Text>
          </View>
        );

      case 'result':
        return (
          <View style={styles.resultContainer}>
            <Text
              style={[
                styles.resultTitle,
                combat.playerWon ? styles.victoryText : styles.defeatText,
              ]}
            >
              {combat.playerWon ? 'VICTORY!' : 'DEFEAT'}
            </Text>
            {combat.playerWon && combat.goldEarned > 0 && (
              <View style={styles.goldContainer}>
                <Text style={styles.goldText}>+{combat.goldEarned} Gold</Text>
              </View>
            )}
            <View style={styles.statsContainer}>
              <Text style={styles.statText}>Your HP: {combat.finalPlayerHp ?? 0}</Text>
              <Text style={styles.statText}>Enemy HP: {combat.finalEnemyHp ?? 0}</Text>
            </View>
            <TouchableOpacity style={styles.continueButton} onPress={handleDismiss}>
              <Text style={styles.continueButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleDismiss}>
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Animated.View
          style={[
            styles.container,
            {
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {combat.combatReplay?.isBoss ? 'Boss Combat' : 'Combat'}
            </Text>
            {combat.replayState === 'turns' && (
              <Text style={styles.turnCounter}>
                Turn {combat.currentTurn + 1}/{combat.totalTurns}
              </Text>
            )}
          </View>

          {/* Main content */}
          <View style={styles.content}>{renderContent()}</View>

          {/* Skip button (only during animation) */}
          {combat.isPlaying && combat.replayState !== 'result' && (
            <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
              <Text style={styles.skipButtonText}>Skip</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ============================================================================
// Styles
// ============================================================================

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: SCREEN_WIDTH * 0.9,
    maxWidth: 500,
    maxHeight: SCREEN_HEIGHT * 0.8,
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#4a4a6a',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#2a2a4e',
    borderBottomWidth: 1,
    borderBottomColor: '#4a4a6a',
  },
  headerTitle: {
    fontFamily: Typography.header,
    fontSize: 20,
    color: '#ffffff',
  },
  turnCounter: {
    fontFamily: Typography.number,
    fontSize: 14,
    color: '#888888',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    minHeight: 300,
  },
  loadingText: {
    fontFamily: Typography.body,
    fontSize: 16,
    color: '#888888',
  },
  // Intro styles
  introContainer: {
    alignItems: 'center',
  },
  encounterText: {
    fontFamily: Typography.header,
    fontSize: 32,
    color: '#ff6b6b',
    marginBottom: 16,
  },
  enemyNameText: {
    fontFamily: Typography.header,
    fontSize: 24,
    color: '#ffffff',
    marginBottom: 8,
  },
  enemyTypeText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#888888',
  },
  // Outro styles
  outroContainer: {
    alignItems: 'center',
  },
  outroText: {
    fontFamily: Typography.header,
    fontSize: 40,
    color: '#ffffff',
  },
  // Result styles
  resultContainer: {
    alignItems: 'center',
    width: '100%',
  },
  resultTitle: {
    fontFamily: Typography.header,
    fontSize: 36,
    marginBottom: 24,
  },
  victoryText: {
    color: '#4ade80',
  },
  defeatText: {
    color: '#f87171',
  },
  goldContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  goldText: {
    fontFamily: Typography.number,
    fontSize: 24,
    color: '#fbbf24',
  },
  statsContainer: {
    marginBottom: 24,
  },
  statText: {
    fontFamily: Typography.stat,
    fontSize: 14,
    color: '#c8c8c8',
    marginBottom: 4,
  },
  continueButton: {
    backgroundColor: '#4a4a6a',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  continueButtonText: {
    fontFamily: Typography.button,
    fontSize: 16,
    color: '#ffffff',
  },
  skipButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
  },
  skipButtonText: {
    fontFamily: Typography.button,
    fontSize: 12,
    color: '#888888',
  },
});
