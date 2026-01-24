/**
 * TurnDisplay Component
 *
 * Displays a single combat turn with attack animations and damage numbers.
 *
 * @see contracts/combat-events.md for TurnExecutedEvent
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Typography } from '@/theme/typography';
import type { TurnExecutedEvent, StatusAppliedEvent } from '@/services/solana/types/combat_events';

// ============================================================================
// Props
// ============================================================================

interface TurnDisplayProps {
  /** Turn data from combat events */
  turnData: TurnExecutedEvent | null;
  /** Status effects applied this turn */
  statusEffects: StatusAppliedEvent[];
  /** Current turn number (1-indexed for display) */
  turnNumber: number;
  /** Total number of turns */
  totalTurns: number;
}

// ============================================================================
// Component
// ============================================================================

export function TurnDisplay({
  turnData,
  statusEffects,
  turnNumber,
  totalTurns,
}: TurnDisplayProps) {
  const playerAttackAnim = useRef(new Animated.Value(0)).current;
  const enemyAttackAnim = useRef(new Animated.Value(0)).current;
  const damageAnim = useRef(new Animated.Value(0)).current;

  // Animate on turn change
  useEffect(() => {
    if (!turnData) return;

    // Reset animations
    playerAttackAnim.setValue(0);
    enemyAttackAnim.setValue(0);
    damageAnim.setValue(0);

    // Sequence: player attacks, then enemy attacks
    Animated.sequence([
      // Player attack animation
      Animated.timing(playerAttackAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      // Pause
      Animated.delay(100),
      // Enemy attack animation
      Animated.timing(enemyAttackAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      // Show damage
      Animated.timing(damageAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  }, [turnData, turnNumber]);

  if (!turnData) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading turn...</Text>
      </View>
    );
  }

  const playerDamage = turnData.playerDamage;
  const enemyDamage = turnData.enemyDamage;
  const playerMissed = playerDamage === 0;
  const enemyMissed = enemyDamage === 0;

  // Animation transforms
  const playerTranslate = playerAttackAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 20, 0],
  });

  const enemyTranslate = enemyAttackAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -20, 0],
  });

  return (
    <View style={styles.container}>
      {/* Turn indicator */}
      <View style={styles.turnIndicator}>
        <Text style={styles.turnText}>Turn {turnNumber}</Text>
      </View>

      {/* Combat arena */}
      <View style={styles.arena}>
        {/* Player side */}
        <View style={styles.combatantContainer}>
          <Animated.View
            style={[
              styles.combatantBox,
              styles.playerBox,
              { transform: [{ translateX: playerTranslate }] },
            ]}
          >
            <Text style={styles.combatantEmoji}>You</Text>
            <Text style={styles.combatantLabel}>Player</Text>
          </Animated.View>

          {/* Player's attack result */}
          <Animated.View
            style={[
              styles.damageContainer,
              { opacity: damageAnim },
            ]}
          >
            {playerMissed ? (
              <Text style={styles.missText}>MISS</Text>
            ) : (
              <Text style={[styles.damageText, styles.damageDealt]}>
                -{playerDamage}
              </Text>
            )}
          </Animated.View>
        </View>

        {/* VS indicator */}
        <View style={styles.vsContainer}>
          <Text style={styles.vsText}>VS</Text>
        </View>

        {/* Enemy side */}
        <View style={styles.combatantContainer}>
          <Animated.View
            style={[
              styles.combatantBox,
              styles.enemyBox,
              { transform: [{ translateX: enemyTranslate }] },
            ]}
          >
            <Text style={styles.combatantEmoji}>Enemy</Text>
            <Text style={styles.combatantLabel}>Enemy</Text>
          </Animated.View>

          {/* Enemy's attack result */}
          <Animated.View
            style={[
              styles.damageContainer,
              { opacity: damageAnim },
            ]}
          >
            {enemyMissed ? (
              <Text style={styles.missText}>MISS</Text>
            ) : (
              <Text style={[styles.damageText, styles.damageTaken]}>
                -{enemyDamage}
              </Text>
            )}
          </Animated.View>
        </View>
      </View>

      {/* HP bars */}
      <View style={styles.hpBarsContainer}>
        <View style={styles.hpBarRow}>
          <Text style={styles.hpLabel}>You</Text>
          <View style={styles.hpBarBackground}>
            <View
              style={[
                styles.hpBarFill,
                styles.playerHpBar,
                { width: `${Math.max(0, (turnData.playerHp / Math.max(turnData.playerHp + enemyDamage, 1)) * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.hpValue}>{turnData.playerHp}</Text>
        </View>

        <View style={styles.hpBarRow}>
          <Text style={styles.hpLabel}>Enemy</Text>
          <View style={styles.hpBarBackground}>
            <View
              style={[
                styles.hpBarFill,
                styles.enemyHpBar,
                { width: `${Math.max(0, (turnData.enemyHp / Math.max(turnData.enemyHp + playerDamage, 1)) * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.hpValue}>{turnData.enemyHp}</Text>
        </View>
      </View>

      {/* Status effects */}
      {statusEffects.length > 0 && (
        <View style={styles.statusContainer}>
          {statusEffects.map((effect, index) => (
            <View key={index} style={styles.statusBadge}>
              <Text style={styles.statusText}>
                {effect.effectType}: {effect.stacks}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#888888',
  },
  turnIndicator: {
    marginBottom: 16,
  },
  turnText: {
    fontFamily: Typography.header,
    fontSize: 18,
    color: '#ffffff',
  },
  arena: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    width: '100%',
  },
  combatantContainer: {
    alignItems: 'center',
    flex: 1,
  },
  combatantBox: {
    width: 80,
    height: 80,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  playerBox: {
    backgroundColor: '#2563eb',
    borderWidth: 2,
    borderColor: '#3b82f6',
  },
  enemyBox: {
    backgroundColor: '#dc2626',
    borderWidth: 2,
    borderColor: '#ef4444',
  },
  combatantEmoji: {
    fontSize: 10,
    fontFamily: Typography.number,
    color: '#ffffff',
  },
  combatantLabel: {
    fontFamily: Typography.stat,
    fontSize: 12,
    color: '#ffffff',
    marginTop: 4,
  },
  vsContainer: {
    paddingHorizontal: 16,
  },
  vsText: {
    fontFamily: Typography.header,
    fontSize: 20,
    color: '#888888',
  },
  damageContainer: {
    height: 24,
    justifyContent: 'center',
  },
  damageText: {
    fontFamily: Typography.number,
    fontSize: 18,
    fontWeight: 'bold',
  },
  damageDealt: {
    color: '#4ade80',
  },
  damageTaken: {
    color: '#f87171',
  },
  missText: {
    fontFamily: Typography.stat,
    fontSize: 14,
    color: '#888888',
    fontStyle: 'italic',
  },
  hpBarsContainer: {
    width: '100%',
    paddingHorizontal: 16,
  },
  hpBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  hpLabel: {
    fontFamily: Typography.stat,
    fontSize: 12,
    color: '#888888',
    width: 50,
  },
  hpBarBackground: {
    flex: 1,
    height: 12,
    backgroundColor: '#333333',
    borderRadius: 6,
    overflow: 'hidden',
    marginHorizontal: 8,
  },
  hpBarFill: {
    height: '100%',
    borderRadius: 6,
  },
  playerHpBar: {
    backgroundColor: '#4ade80',
  },
  enemyHpBar: {
    backgroundColor: '#f87171',
  },
  hpValue: {
    fontFamily: Typography.number,
    fontSize: 12,
    color: '#ffffff',
    width: 40,
    textAlign: 'right',
  },
  statusContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 16,
    gap: 8,
  },
  statusBadge: {
    backgroundColor: '#4a4a6a',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  statusText: {
    fontFamily: Typography.stat,
    fontSize: 10,
    color: '#c8c8c8',
  },
});
