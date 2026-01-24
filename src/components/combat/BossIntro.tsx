/**
 * BossIntro Component
 *
 * Displays boss introduction before boss combat.
 * Shows boss name, stats, and week number.
 *
 * @see contracts/combat-events.md for BossCombatStartedEvent
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { Typography } from '@/theme/typography';

// ============================================================================
// Props
// ============================================================================

interface BossIntroProps {
  /** Boss name */
  bossName: string;
  /** Boss level/week (1-3) */
  week: number;
  /** Boss HP */
  bossHp: number;
  /** Boss ATK */
  bossAtk: number;
  /** Boss ARM */
  bossArm: number;
  /** Boss SPD */
  bossSpd: number;
  /** Whether the intro is playing */
  isPlaying: boolean;
  /** Callback when intro animation completes */
  onComplete?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function BossIntro({
  bossName,
  week,
  bossHp,
  bossAtk,
  bossArm,
  bossSpd,
  isPlaying,
  onComplete,
}: BossIntroProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const statsAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isPlaying) {
      // Reset animations
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.5);
      statsAnim.setValue(0);

      // Animate intro sequence
      Animated.sequence([
        // Fade in and scale up
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            tension: 50,
            friction: 7,
            useNativeDriver: true,
          }),
        ]),
        // Pause
        Animated.delay(500),
        // Show stats
        Animated.timing(statsAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        // Pause before completing
        Animated.delay(1000),
      ]).start(() => {
        onComplete?.();
      });
    }
  }, [isPlaying, fadeAnim, scaleAnim, statsAnim, onComplete]);

  const weekTitle = getWeekTitle(week);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {/* Week indicator */}
        <Text style={styles.weekText}>WEEK {week} BOSS</Text>

        {/* Boss name */}
        <Text style={styles.bossName}>{bossName}</Text>

        {/* Week subtitle */}
        <Text style={styles.weekSubtitle}>{weekTitle}</Text>

        {/* Stats */}
        <Animated.View style={[styles.statsContainer, { opacity: statsAnim }]}>
          <View style={styles.statRow}>
            <StatBox label="HP" value={bossHp} color="#ef4444" />
            <StatBox label="ATK" value={bossAtk} color="#f97316" />
            <StatBox label="ARM" value={bossArm} color="#3b82f6" />
            <StatBox label="SPD" value={bossSpd} color="#22c55e" />
          </View>
        </Animated.View>

        {/* Battle text */}
        <Text style={styles.battleText}>PREPARE FOR BATTLE!</Text>
      </Animated.View>
    </View>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

interface StatBoxProps {
  label: string;
  value: number;
  color: string;
}

function StatBox({ label, value, color }: StatBoxProps) {
  return (
    <View style={[styles.statBox, { borderColor: color }]}>
      <Text style={[styles.statLabel, { color }]}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function getWeekTitle(week: number): string {
  switch (week) {
    case 1:
      return 'The Guardian';
    case 2:
      return 'The Warden';
    case 3:
      return 'The Overlord';
    default:
      return 'Unknown';
  }
}

// ============================================================================
// Styles
// ============================================================================

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  weekText: {
    fontFamily: Typography.stat,
    fontSize: 14,
    color: '#ef4444',
    letterSpacing: 4,
    marginBottom: 8,
  },
  bossName: {
    fontFamily: Typography.header,
    fontSize: 36,
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
  },
  weekSubtitle: {
    fontFamily: Typography.body,
    fontSize: 18,
    color: '#888888',
    fontStyle: 'italic',
    marginBottom: 32,
  },
  statsContainer: {
    marginBottom: 32,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  statBox: {
    width: 60,
    height: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  statLabel: {
    fontFamily: Typography.stat,
    fontSize: 10,
    marginBottom: 4,
  },
  statValue: {
    fontFamily: Typography.number,
    fontSize: 20,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  battleText: {
    fontFamily: Typography.header,
    fontSize: 20,
    color: '#ef4444',
    letterSpacing: 2,
  },
});
