/**
 * CombatArena - Web fallback without Skia.
 */

import React from 'react';
import { StyleSheet, View, useWindowDimensions, Text } from 'react-native';
import type { CombatantState } from '../../game/engine/types';
import { DamageNumbers } from './DamageNumbers';
import type { DamageNumber } from '../../contexts/CombatContext';

interface CombatArenaProps {
  player: CombatantState | null;
  enemy: CombatantState | null;
  damageNumbers: DamageNumber[];
  isAnimating: boolean;
}

/**
 * CombatArena renders the battle scene with combatants
 * Enemy on LEFT, Player on RIGHT per spec FR-048/FR-049
 */
export function CombatArena({
  player,
  enemy,
  damageNumbers,
}: CombatArenaProps) {
  const { width: screenWidth } = useWindowDimensions();
  const arenaWidth = Math.min(screenWidth * 0.5, 400);
  const arenaHeight = 300;

  if (!player || !enemy) {
    return (
      <View style={[styles.container, { width: arenaWidth, height: arenaHeight }]}>
        <View style={styles.placeholder} />
      </View>
    );
  }

  const combatantRadius = 40;
  const enemyX = arenaWidth * 0.25;
  const playerX = arenaWidth * 0.75;
  const combatantY = arenaHeight * 0.4;

  // HP bar dimensions
  const hpBarWidth = 60;
  const hpBarHeight = 8;
  const hpBarY = combatantY + combatantRadius + 20;

  // Calculate HP percentages
  const playerHpPercent = Math.max(0, player.hp / player.maxHp);
  const enemyHpPercent = Math.max(0, enemy.hp / enemy.maxHp);

  return (
    <View style={[styles.container, { width: arenaWidth, height: arenaHeight }]}>
      <View style={styles.placeholder} />
      <View style={[styles.floor, { left: 20, top: arenaHeight * 0.7, width: arenaWidth - 40 }]} />

      {/* Enemy combatant (LEFT) */}
      <View
        style={[
          styles.combatantOuter,
          {
            left: enemyX - combatantRadius,
            top: combatantY - combatantRadius,
            width: combatantRadius * 2,
            height: combatantRadius * 2,
            borderRadius: combatantRadius,
            backgroundColor: enemy.hp > 0 ? '#dc2626' : '#4a4a4a',
          },
        ]}
      />
      <View
        style={[
          styles.combatantInner,
          {
            left: enemyX - combatantRadius * 0.7,
            top: combatantY - combatantRadius * 0.7,
            width: combatantRadius * 1.4,
            height: combatantRadius * 1.4,
            borderRadius: combatantRadius * 0.7,
            backgroundColor: enemy.hp > 0 ? '#ef4444' : '#5a5a5a',
          },
        ]}
      />

      {/* Enemy HP bar */}
      <View
        style={[
          styles.hpBarBackground,
          {
            left: enemyX - hpBarWidth / 2,
            top: hpBarY,
            width: hpBarWidth,
            height: hpBarHeight,
          },
        ]}
      />
      <View
        style={[
          styles.hpBarFill,
          {
            left: enemyX - hpBarWidth / 2,
            top: hpBarY,
            width: hpBarWidth * enemyHpPercent,
            height: hpBarHeight,
            backgroundColor:
              enemyHpPercent > 0.5
                ? '#22c55e'
                : enemyHpPercent > 0.25
                ? '#eab308'
                : '#dc2626',
          },
        ]}
      />

      {/* Player combatant (RIGHT) */}
      <View
        style={[
          styles.combatantOuter,
          {
            left: playerX - combatantRadius,
            top: combatantY - combatantRadius,
            width: combatantRadius * 2,
            height: combatantRadius * 2,
            borderRadius: combatantRadius,
            backgroundColor: player.hp > 0 ? '#8b5cf6' : '#4a4a4a',
          },
        ]}
      />
      <View
        style={[
          styles.combatantInner,
          {
            left: playerX - combatantRadius * 0.7,
            top: combatantY - combatantRadius * 0.7,
            width: combatantRadius * 1.4,
            height: combatantRadius * 1.4,
            borderRadius: combatantRadius * 0.7,
            backgroundColor: player.hp > 0 ? '#a78bfa' : '#5a5a5a',
          },
        ]}
      />

      {/* Player HP bar */}
      <View
        style={[
          styles.hpBarBackground,
          {
            left: playerX - hpBarWidth / 2,
            top: hpBarY,
            width: hpBarWidth,
            height: hpBarHeight,
          },
        ]}
      />
      <View
        style={[
          styles.hpBarFill,
          {
            left: playerX - hpBarWidth / 2,
            top: hpBarY,
            width: hpBarWidth * playerHpPercent,
            height: hpBarHeight,
            backgroundColor:
              playerHpPercent > 0.5
                ? '#22c55e'
                : playerHpPercent > 0.25
                ? '#eab308'
                : '#dc2626',
          },
        ]}
      />

      {/* Overlay damage numbers using separate component */}
      <View style={styles.overlay}>
        <DamageNumbers
          damageNumbers={damageNumbers}
          enemyPosition={{ x: enemyX, y: combatantY - combatantRadius - 20 }}
          playerPosition={{ x: playerX, y: combatantY - combatantRadius - 20 }}
        />
      </View>

      {/* Emoji labels */}
      <View style={[styles.emojiContainer, { left: enemyX - 20, top: combatantY - 15 }]}>
        <Text style={styles.emoji}>{enemy.emoji}</Text>
      </View>
      <View style={[styles.emojiContainer, { left: playerX - 20, top: combatantY - 15 }]}>
        <Text style={styles.emoji}>{player.emoji}</Text>
      </View>

      {/* Stats labels below HP bars */}
      <View style={[styles.statsLabel, { left: enemyX - 40, top: hpBarY + 15 }]}>
        <Text style={styles.stats}>
          {enemy.hp}/{enemy.maxHp} HP | {enemy.atk} ATK | {enemy.arm} ARM
        </Text>
      </View>
      <View style={[styles.statsLabel, { left: playerX - 40, top: hpBarY + 15 }]}>
        <Text style={styles.stats}>
          {player.hp}/{player.maxHp} HP | {player.atk} ATK | {player.arm} ARM
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0f0f1a',
    position: 'relative',
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a1a2e',
  },
  floor: {
    position: 'absolute',
    height: 2,
    backgroundColor: '#333355',
  },
  combatantOuter: {
    position: 'absolute',
  },
  combatantInner: {
    position: 'absolute',
  },
  hpBarBackground: {
    position: 'absolute',
    backgroundColor: '#2a2a3a',
    borderRadius: 4,
  },
  hpBarFill: {
    position: 'absolute',
    borderRadius: 4,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
  },
  emojiContainer: {
    position: 'absolute',
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 28,
    textAlign: 'center',
  },
  statsLabel: {
    position: 'absolute',
    width: 80,
    alignItems: 'center',
  },
  stats: {
    fontSize: 8,
    color: '#888888',
    textAlign: 'center',
  },
});
