/**
 * UnlockAnimation - Item unlock celebration animation
 * T054: Create UnlockAnimation component in src/components/items/UnlockAnimation.tsx (glow, slide-in)
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Typography } from '../../theme/typography';
import type { ItemStats } from '../../game/engine/types';

interface UnlockAnimationProps {
  /** Item emoji/icon */
  emoji: string;
  /** Item name */
  name: string;
  /** Item stats */
  stats?: ItemStats;
  /** Set name if part of a set */
  setName?: string;
  /** Callback when animation completes */
  onComplete?: () => void;
  /** Animation duration in ms */
  duration?: number;
}

export function UnlockAnimation({
  emoji,
  name,
  stats,
  setName,
  onComplete,
  duration = 2000,
}: UnlockAnimationProps) {
  const slideAnim = useRef(new Animated.Value(100)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Start animation sequence
    Animated.sequence([
      // Initial slide in and fade
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
          easing: Easing.out(Easing.back(1.5)),
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
          easing: Easing.out(Easing.back(1.2)),
        }),
      ]),
      // Glow pulse effect
      Animated.parallel([
        Animated.loop(
          Animated.sequence([
            Animated.timing(glowAnim, {
              toValue: 1,
              duration: 600,
              useNativeDriver: true,
            }),
            Animated.timing(glowAnim, {
              toValue: 0.5,
              duration: 600,
              useNativeDriver: true,
            }),
          ]),
          { iterations: Math.floor((duration - 400) / 1200) }
        ),
        // Subtle rotation
        Animated.loop(
          Animated.sequence([
            Animated.timing(rotateAnim, {
              toValue: 1,
              duration: 800,
              useNativeDriver: true,
              easing: Easing.inOut(Easing.ease),
            }),
            Animated.timing(rotateAnim, {
              toValue: 0,
              duration: 800,
              useNativeDriver: true,
              easing: Easing.inOut(Easing.ease),
            }),
          ]),
          { iterations: Math.floor((duration - 400) / 1600) }
        ),
      ]),
    ]).start(() => {
      onComplete?.();
    });
  }, [slideAnim, fadeAnim, scaleAnim, glowAnim, rotateAnim, duration, onComplete]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['-3deg', '3deg'],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }, { scale: scaleAnim }, { rotate }],
        },
      ]}
    >
      {/* Glow background */}
      <Animated.View
        style={[
          styles.glowBackground,
          {
            opacity: glowAnim,
          },
        ]}
      />

      {/* Item card */}
      <View style={styles.itemCard}>
        {/* Emoji container */}
        <View style={styles.emojiContainer}>
          <Text style={styles.emoji}>{emoji}</Text>
        </View>

        {/* Item name */}
        <Text style={styles.itemName}>{name}</Text>

        {/* Set name if applicable */}
        {setName && <Text style={styles.setName}>{setName}</Text>}

        {/* Stats preview */}
        {stats && (
          <View style={styles.statsContainer}>
            {stats.atk !== undefined && stats.atk !== 0 && (
              <View style={styles.statBadge}>
                <Text style={styles.statText}>
                  {stats.atk > 0 ? '+' : ''}
                  {stats.atk} ATK
                </Text>
              </View>
            )}
            {stats.arm !== undefined && stats.arm !== 0 && (
              <View style={styles.statBadge}>
                <Text style={styles.statText}>
                  {stats.arm > 0 ? '+' : ''}
                  {stats.arm} ARM
                </Text>
              </View>
            )}
            {stats.spd !== undefined && stats.spd !== 0 && (
              <View style={styles.statBadge}>
                <Text style={styles.statText}>
                  {stats.spd > 0 ? '+' : ''}
                  {stats.spd} SPD
                </Text>
              </View>
            )}
            {stats.dig !== undefined && stats.dig !== 0 && (
              <View style={styles.statBadge}>
                <Text style={styles.statText}>
                  {stats.dig > 0 ? '+' : ''}
                  {stats.dig} DIG
                </Text>
              </View>
            )}
            {stats.hp !== undefined && stats.hp !== 0 && (
              <View style={styles.statBadge}>
                <Text style={styles.statText}>
                  {stats.hp > 0 ? '+' : ''}
                  {stats.hp} HP
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Unlock label */}
        <View style={styles.unlockLabel}>
          <Text style={styles.unlockText}>UNLOCKED!</Text>
        </View>
      </View>

      {/* Particle decorations */}
      <View style={styles.particles}>
        <Text style={styles.particle}>{'*'}</Text>
        <Text style={[styles.particle, styles.particleLeft]}>{'*'}</Text>
        <Text style={[styles.particle, styles.particleRight]}>{'*'}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  glowBackground: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#8866FF',
    shadowColor: '#8866FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
  },
  itemCard: {
    backgroundColor: 'rgba(50, 40, 70, 0.95)',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#8866FF',
    minWidth: 200,
  },
  emojiContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(136, 102, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#AA88FF',
  },
  emoji: {
    fontSize: 48,
  },
  itemName: {
    fontFamily: Typography.header,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
  },
  setName: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#AA88FF',
    marginBottom: 12,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  statBadge: {
    backgroundColor: 'rgba(136, 102, 255, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#8866FF',
  },
  statText: {
    fontFamily: Typography.number,
    fontSize: 14,
    color: '#CCBBFF',
    fontWeight: 'bold',
  },
  unlockLabel: {
    backgroundColor: '#44AA44',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
  },
  unlockText: {
    fontFamily: Typography.button,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  particles: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    position: 'absolute',
    fontSize: 24,
    color: '#FFD700',
    top: 0,
  },
  particleLeft: {
    left: 20,
    top: '30%',
  },
  particleRight: {
    right: 20,
    top: '30%',
  },
});
