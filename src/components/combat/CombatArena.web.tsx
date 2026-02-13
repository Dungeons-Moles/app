/**
 * CombatArena - Web fallback without Skia.
 */

import React, { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions, Text, Image, ImageBackground } from 'react-native';
import type { CombatantState, StatusEffects } from '../../game/engine/types';
import { DamageNumbers } from './DamageNumbers';
import { EffectNotifications } from './EffectNotifications';
import type { DamageNumber, EffectNotification } from '../../contexts/CombatContext';
import { getEntityImageSource } from '../game/entityImages';

const defaultMoleImageSource = require('../../../assets/entities/characters/default-mole.png');
const BATTLEGROUND_BG = require('../../../assets/ui/backgrounds/combat-background.png');

interface CombatArenaProps {
  player: CombatantState | null;
  enemy: CombatantState | null;
  damageNumbers: DamageNumber[];
  effectNotifications: EffectNotification[];
  isAnimating: boolean;
  currentTurn?: number;
  activeActor?: 'player' | 'enemy' | null;
  playerMaxArm?: number;
  enemyMaxArm?: number;
}

export function CombatArena({
  player,
  enemy,
  damageNumbers,
  effectNotifications,
  currentTurn = 1,
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
        <View style={styles.placeholder} />
      </View>
    );
  }

  const combatantRadius = 50;
  const enemyX = arenaWidth * 0.25;
  const playerX = arenaWidth * 0.75;
  const combatantY = arenaHeight * 0.45;

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

  // Status effects position (below the floor line)
  const statusEffectsY = arenaHeight * 0.75;
  const enemyImageSource =
    enemy.definitionId === 'pvpOpponent'
      ? defaultMoleImageSource
      : enemy.definitionId
        ? (getEntityImageSource(enemy.definitionId) ?? defaultMoleImageSource)
        : defaultMoleImageSource;

  return (
    <View style={[styles.container, { width: arenaWidth, height: arenaHeight }]}>
      <View style={styles.turnBadge}>
        <Text style={styles.turnBadgeText}>Turn {currentTurn}</Text>
      </View>
      <ImageBackground source={BATTLEGROUND_BG} style={styles.background} resizeMode="contain">
        {/* Enemy combatant (LEFT) */}
        {activeActor === 'enemy' ? (
          <View
            style={[
              styles.activeRing,
              {
                left: enemyX - combatantRadius,
                top: combatantY - combatantRadius,
                width: combatantRadius * 2,
                height: combatantRadius * 2,
                borderRadius: combatantRadius,
              },
            ]}
          />
        ) : null}

        {/* Enemy Image */}
        <View style={[styles.imageContainer, { left: enemyX - 40, top: combatantY - 40 }]}>
          <Image source={enemyImageSource} style={styles.combatantImage} resizeMode="contain" />
        </View>

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
                enemyHpPercent > 0.5 ? '#22c55e' : enemyHpPercent > 0.25 ? '#eab308' : '#dc2626',
            },
          ]}
        />

        {/* Enemy Armor bar */}
        <View
          style={[
            styles.armBarBackground,
            {
              left: enemyX - hpBarWidth / 2,
              top: armBarY,
              width: hpBarWidth,
              height: armBarHeight,
            },
          ]}
        />
        <View
          style={[
            styles.armBarFill,
            {
              left: enemyX - hpBarWidth / 2,
              top: armBarY,
              width: hpBarWidth * enemyArmPercent,
              height: armBarHeight,
            },
          ]}
        />

        {/* Player combatant (RIGHT) */}
        {activeActor === 'player' ? (
          <View
            style={[
              styles.activeRing,
              {
                left: playerX - combatantRadius,
                top: combatantY - combatantRadius,
                width: combatantRadius * 2,
                height: combatantRadius * 2,
                borderRadius: combatantRadius,
              },
            ]}
          />
        ) : null}

        {/* Player Image */}
        <View
          style={[
            styles.imageContainer,
            { left: playerX - 40, top: combatantY - 40, transform: [{ scaleX: -1 }] },
          ]}
        >
          <Image
            source={defaultMoleImageSource}
            style={styles.combatantImage}
            resizeMode="contain"
          />
        </View>

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
                playerHpPercent > 0.5 ? '#22c55e' : playerHpPercent > 0.25 ? '#eab308' : '#dc2626',
            },
          ]}
        />

        {/* Player Armor bar */}
        <View
          style={[
            styles.armBarBackground,
            {
              left: playerX - hpBarWidth / 2,
              top: armBarY,
              width: hpBarWidth,
              height: armBarHeight,
            },
          ]}
        />
        <View
          style={[
            styles.armBarFill,
            {
              left: playerX - hpBarWidth / 2,
              top: armBarY,
              width: hpBarWidth * playerArmPercent,
              height: armBarHeight,
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
          <EffectNotifications
            notifications={effectNotifications}
            enemyPosition={{ x: enemyX, y: combatantY - combatantRadius - 40 }}
            playerPosition={{ x: playerX, y: combatantY - combatantRadius - 40 }}
          />
        </View>

        {/* Status effects for enemy (below floor line) */}
        <StatusEffectsRow statusEffects={enemy.statusEffects} x={enemyX} y={statusEffectsY} />

        {/* Status effects for player (below floor line) */}
        <StatusEffectsRow statusEffects={player.statusEffects} x={playerX} y={statusEffectsY} />
      </ImageBackground>
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
      {effects.map((effect) => {
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

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    position: 'relative',
  },
  background: {
    width: '100%',
    height: '100%',
  },
  turnBadge: {
    position: 'absolute',
    top: 18,
    alignSelf: 'center',
    zIndex: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  turnBadgeText: {
    color: '#f8e4b5',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
  },
  floor: {
    position: 'absolute',
    height: 2,
  },
  activeRing: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: 'black',
    backgroundColor: 'transparent',
  },
  hpBarBackground: {
    position: 'absolute',
    backgroundColor: '#2a2a3a',
  },
  hpBarFill: {
    position: 'absolute',
  },
  armBarBackground: {
    position: 'absolute',
    backgroundColor: '#2a2a3a',
  },
  armBarFill: {
    position: 'absolute',
    backgroundColor: '#a855f7',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
  },
  imageContainer: {
    position: 'absolute',
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  combatantImage: {
    width: 120,
    height: 120,
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
