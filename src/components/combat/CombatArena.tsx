/**
 * T056: CombatArena with Skia
 * Renders the combat scene with player and enemy combatants
 * @see specs/001-pve-dungeon-crawler/spec.md FR-015, FR-048, FR-049
 */

import React, { useEffect } from 'react';
import {
  Canvas,
  Circle,
  Group,
  Text as SkiaText,
  useFont,
  RoundedRect,
  Line,
  vec,
} from '@shopify/react-native-skia';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
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
  isAnimating,
}: CombatArenaProps) {
  const { width: screenWidth } = useWindowDimensions();
  const arenaWidth = Math.min(screenWidth * 0.5, 400);
  const arenaHeight = 300;

  if (!player || !enemy) {
    return (
      <View style={[styles.container, { width: arenaWidth, height: arenaHeight }]}>
        <Canvas style={{ width: arenaWidth, height: arenaHeight }}>
          <RoundedRect
            x={0}
            y={0}
            width={arenaWidth}
            height={arenaHeight}
            r={16}
            color="#1a1a2e"
          />
        </Canvas>
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
      <Canvas style={{ width: arenaWidth, height: arenaHeight }}>
        {/* Background */}
        <RoundedRect
          x={0}
          y={0}
          width={arenaWidth}
          height={arenaHeight}
          r={16}
          color="#1a1a2e"
        />

        {/* Combat arena floor */}
        <Line
          p1={vec(20, arenaHeight * 0.7)}
          p2={vec(arenaWidth - 20, arenaHeight * 0.7)}
          color="#333355"
          strokeWidth={2}
        />

        {/* Enemy combatant (LEFT) */}
        <Group>
          {/* Enemy body */}
          <Circle
            cx={enemyX}
            cy={combatantY}
            r={combatantRadius}
            color={enemy.hp > 0 ? '#dc2626' : '#4a4a4a'}
          />
          {/* Enemy inner circle */}
          <Circle
            cx={enemyX}
            cy={combatantY}
            r={combatantRadius * 0.7}
            color={enemy.hp > 0 ? '#ef4444' : '#5a5a5a'}
          />

          {/* Enemy HP bar background */}
          <RoundedRect
            x={enemyX - hpBarWidth / 2}
            y={hpBarY}
            width={hpBarWidth}
            height={hpBarHeight}
            r={4}
            color="#2a2a3a"
          />
          {/* Enemy HP bar fill */}
          <RoundedRect
            x={enemyX - hpBarWidth / 2}
            y={hpBarY}
            width={hpBarWidth * enemyHpPercent}
            height={hpBarHeight}
            r={4}
            color={enemyHpPercent > 0.5 ? '#22c55e' : enemyHpPercent > 0.25 ? '#eab308' : '#dc2626'}
          />
        </Group>

        {/* Player combatant (RIGHT) */}
        <Group>
          {/* Player body */}
          <Circle
            cx={playerX}
            cy={combatantY}
            r={combatantRadius}
            color={player.hp > 0 ? '#8b5cf6' : '#4a4a4a'}
          />
          {/* Player inner circle */}
          <Circle
            cx={playerX}
            cy={combatantY}
            r={combatantRadius * 0.7}
            color={player.hp > 0 ? '#a78bfa' : '#5a5a5a'}
          />

          {/* Player HP bar background */}
          <RoundedRect
            x={playerX - hpBarWidth / 2}
            y={hpBarY}
            width={hpBarWidth}
            height={hpBarHeight}
            r={4}
            color="#2a2a3a"
          />
          {/* Player HP bar fill */}
          <RoundedRect
            x={playerX - hpBarWidth / 2}
            y={hpBarY}
            width={hpBarWidth * playerHpPercent}
            height={hpBarHeight}
            r={4}
            color={playerHpPercent > 0.5 ? '#22c55e' : playerHpPercent > 0.25 ? '#eab308' : '#dc2626'}
          />
        </Group>
      </Canvas>

      {/* Overlay damage numbers using separate component */}
      <View style={styles.overlay}>
        <DamageNumbers
          damageNumbers={damageNumbers}
          enemyPosition={{ x: enemyX, y: combatantY - combatantRadius - 20 }}
          playerPosition={{ x: playerX, y: combatantY - combatantRadius - 20 }}
        />
      </View>

      {/* Emoji labels (rendered as React Native Text for emoji support) */}
      <View style={[styles.emojiContainer, { left: enemyX - 20, top: combatantY - 15 }]}>
        <View style={styles.emojiText}>
          <EmojiText>{enemy.emoji}</EmojiText>
        </View>
      </View>
      <View style={[styles.emojiContainer, { left: playerX - 20, top: combatantY - 15 }]}>
        <View style={styles.emojiText}>
          <EmojiText>{player.emoji}</EmojiText>
        </View>
      </View>

      {/* Stats labels below HP bars */}
      <View style={[styles.statsLabel, { left: enemyX - 40, top: hpBarY + 15 }]}>
        <StatsText hp={enemy.hp} maxHp={enemy.maxHp} atk={enemy.atk} arm={enemy.arm} />
      </View>
      <View style={[styles.statsLabel, { left: playerX - 40, top: hpBarY + 15 }]}>
        <StatsText hp={player.hp} maxHp={player.maxHp} atk={player.atk} arm={player.arm} />
      </View>
    </View>
  );
}

// Helper component for emoji rendering
function EmojiText({ children }: { children: string }) {
  const { Text } = require('react-native');
  return <Text style={styles.emoji}>{children}</Text>;
}

// Helper component for stats display
function StatsText({
  hp,
  maxHp,
  atk,
  arm,
}: {
  hp: number;
  maxHp: number;
  atk: number;
  arm: number;
}) {
  const { Text } = require('react-native');
  return (
    <Text style={styles.stats}>
      {hp}/{maxHp} HP | {atk} ATK | {arm} ARM
    </Text>
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
  emojiText: {
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
