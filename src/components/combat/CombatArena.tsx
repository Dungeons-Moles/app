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
import type { CombatantState, StatusEffects } from '../../game/engine/types';
import { DamageNumbers } from './DamageNumbers';
import { EffectNotifications } from './EffectNotifications';
import type { DamageNumber, EffectNotification } from '../../contexts/CombatContext';

interface CombatArenaProps {
  player: CombatantState | null;
  enemy: CombatantState | null;
  damageNumbers: DamageNumber[];
  effectNotifications: EffectNotification[];
  isAnimating: boolean;
  activeActor?: 'player' | 'enemy' | null;
  playerMaxArm?: number;
  enemyMaxArm?: number;
}

/**
 * CombatArena renders the battle scene with combatants
 * Enemy on LEFT, Player on RIGHT per spec FR-048/FR-049
 */
export function CombatArena({
  player,
  enemy,
  damageNumbers,
  effectNotifications,
  isAnimating,
  activeActor = null,
  playerMaxArm = 0,
  enemyMaxArm = 0,
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

  // Armor bar dimensions
  const armBarHeight = 6;
  const armBarY = hpBarY + hpBarHeight + 4;

  // Calculate HP percentages
  const playerHpPercent = Math.max(0, player.hp / player.maxHp);
  const enemyHpPercent = Math.max(0, enemy.hp / enemy.maxHp);

  // Calculate Armor percentages
  const playerArmPercent = playerMaxArm > 0 ? Math.max(0, player.arm / playerMaxArm) : 0;
  const enemyArmPercent = enemyMaxArm > 0 ? Math.max(0, enemy.arm / enemyMaxArm) : 0;
  const ringColor = '#333355';
  const ringStrokeWidth = 4;

  // Status effects position (below the floor line)
  const statusEffectsY = arenaHeight * 0.75;

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
          {activeActor === 'enemy' ? (
            <Circle
              cx={enemyX}
              cy={combatantY}
              r={combatantRadius}
              color={ringColor}
              style="stroke"
              strokeWidth={ringStrokeWidth}
            />
          ) : null}

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

          {/* Enemy Armor bar background */}
          <RoundedRect
            x={enemyX - hpBarWidth / 2}
            y={armBarY}
            width={hpBarWidth}
            height={armBarHeight}
            r={3}
            color="#2a2a3a"
          />
          {/* Enemy Armor bar fill */}
          <RoundedRect
            x={enemyX - hpBarWidth / 2}
            y={armBarY}
            width={hpBarWidth * enemyArmPercent}
            height={armBarHeight}
            r={3}
            color="#a855f7"
          />
        </Group>

        {/* Player combatant (RIGHT) */}
        <Group>
          {activeActor === 'player' ? (
            <Circle
              cx={playerX}
              cy={combatantY}
              r={combatantRadius}
              color={ringColor}
              style="stroke"
              strokeWidth={ringStrokeWidth}
            />
          ) : null}

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

          {/* Player Armor bar background */}
          <RoundedRect
            x={playerX - hpBarWidth / 2}
            y={armBarY}
            width={hpBarWidth}
            height={armBarHeight}
            r={3}
            color="#2a2a3a"
          />
          {/* Player Armor bar fill */}
          <RoundedRect
            x={playerX - hpBarWidth / 2}
            y={armBarY}
            width={hpBarWidth * playerArmPercent}
            height={armBarHeight}
            r={3}
            color="#a855f7"
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
        <EffectNotifications
          notifications={effectNotifications}
          enemyPosition={{ x: enemyX, y: combatantY - combatantRadius - 40 }}
          playerPosition={{ x: playerX, y: combatantY - combatantRadius - 40 }}
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

      {/* Status effects for enemy (below floor line) */}
      <StatusEffectsRow
        statusEffects={enemy.statusEffects}
        x={enemyX}
        y={statusEffectsY}
      />

      {/* Status effects for player (below floor line) */}
      <StatusEffectsRow
        statusEffects={player.statusEffects}
        x={playerX}
        y={statusEffectsY}
      />
    </View>
  );
}

// Status effects row component
interface StatusEffectsRowProps {
  statusEffects: StatusEffects;
  x: number;
  y: number;
}

function StatusEffectsRow({ statusEffects, x, y }: StatusEffectsRowProps) {
  const { Text } = require('react-native');
  const effects: { type: 'chill' | 'shrapnel' | 'rust'; stacks: number }[] = [];

  if (statusEffects.chill > 0) {
    effects.push({ type: 'chill', stacks: statusEffects.chill });
  }
  if (statusEffects.shrapnel > 0) {
    effects.push({ type: 'shrapnel', stacks: statusEffects.shrapnel });
  }
  if (statusEffects.rust > 0) {
    effects.push({ type: 'rust', stacks: statusEffects.rust });
  }

  if (effects.length === 0) {
    return null;
  }

  const config = {
    chill: { emoji: '❄️', color: '#60a5fa' },
    shrapnel: { emoji: '💥', color: '#f97316' },
    rust: { emoji: '🦠', color: '#a16207' },
  };

  const badgeWidth = 28;
  const totalWidth = effects.length * badgeWidth + (effects.length - 1) * 4;
  const startX = x - totalWidth / 2;

  return (
    <View style={[styles.statusRow, { left: startX, top: y }]}>
      {effects.map((effect, index) => {
        const { emoji, color } = config[effect.type];
        return (
          <View key={effect.type} style={[styles.statusBadge, { borderColor: color }]}>
            <Text style={styles.statusEmoji}>{emoji}</Text>
            <Text style={[styles.statusStacks, { color }]}>{effect.stacks}</Text>
          </View>
        );
      })}
    </View>
  );
}

// Helper component for emoji rendering
function EmojiText({ children }: { children: string }) {
  const { Text } = require('react-native');
  return <Text style={styles.emoji}>{children}</Text>;
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
  statusRow: {
    position: 'absolute',
    flexDirection: 'row',
    gap: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    backgroundColor: '#1a1a2e',
  },
  statusEmoji: {
    fontSize: 10,
  },
  statusStacks: {
    fontSize: 9,
    fontWeight: 'bold',
    marginLeft: 2,
  },
});
