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
  Rect,
  Image,
  useImage,
} from '@shopify/react-native-skia';
import { StyleSheet, View, useWindowDimensions, Image as RNImage, Text } from 'react-native';
import type { CombatantState, StatusEffects } from '../../game/engine/types';
import { DamageNumbers } from './DamageNumbers';
import { EffectNotifications } from './EffectNotifications';
import type { DamageNumber, EffectNotification } from '../../contexts/CombatContext';
import { useSkiaEntityImages } from '../../hooks/useEntityImages';

const BATTLEGROUND_BG = require('../../../assets/ui/backgrounds/combat-background.png');
const DEFAULT_MOLE = require('../../../assets/entities/characters/default-mole.png');

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
  /** Scale factor for compact/mobile views (default 1) */
  scale?: number;
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
  currentTurn = 1,
  activeActor = null,
  playerMaxArm = 0,
  enemyMaxArm = 0,
  scale = 1,
}: CombatArenaProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const arenaWidth = scale > 1
    ? Math.min(screenWidth * 0.5, 900)
    : Math.min(screenWidth * 0.5, 400);
  const arenaHeight = scale > 1 ? Math.min(screenHeight * 0.85, 800) : 300;
  const entityImages = useSkiaEntityImages();
  const bgImage = useImage(BATTLEGROUND_BG);
  const moleImage = useImage(DEFAULT_MOLE);

  if (!player || !enemy) {
    return (
      <View style={[styles.container, { width: arenaWidth, height: arenaHeight }]}>
        <Canvas style={{ width: arenaWidth, height: arenaHeight }}>
          <Rect x={0} y={0} width={arenaWidth} height={arenaHeight} color="transparent" />
        </Canvas>
      </View>
    );
  }

  const combatantRadius = 40 * scale;
  const enemyX = arenaWidth * 0.25;
  const playerX = arenaWidth * 0.75;
  const combatantY = arenaHeight * 0.4;

  // Resolve enemy Skia image.
  // PvP: use moleImage from useImage() — a separate SkImage instance from the player's.
  // On web (CanvasKit), reusing the same SkImage object in two <Image> nodes can fail.
  // PvE: use entityImages lookup (each enemy type has its own unique image).
  const enemySkiaImage =
    enemy.definitionId === 'pvpOpponent'
      ? (moleImage ?? entityImages.player ?? null)
      : (entityImages[enemy.definitionId ?? ''] ?? moleImage ?? entityImages.player ?? null);

  const ringColor = '#333355';
  const ringStrokeWidth = 4;

  // Status effects position (below the floor line)
  const statusEffectsY = arenaHeight * 0.75;

  return (
    <View style={[styles.container, { width: arenaWidth, height: arenaHeight }]}>
      <View
        style={[
          styles.turnBadge,
          {
            top: 18 * scale,
            paddingHorizontal: 10 * scale,
            paddingVertical: 4 * scale,
          },
        ]}
      >
        <Text style={[styles.turnBadgeText, { fontSize: 13 * scale }]}>Turn {currentTurn}</Text>
      </View>
      <Canvas style={{ width: arenaWidth, height: arenaHeight }}>
        {/* Background */}
        {bgImage ? (
          <Image
            image={bgImage}
            x={0}
            y={0}
            width={arenaWidth}
            height={arenaHeight}
            fit="contain"
          />
        ) : (
          <Rect x={0} y={0} width={arenaWidth} height={arenaHeight} color="#1a1a2e" />
        )}

        {/* Combat arena floor - Removed line as image provides it */}
        {/* <Line ... /> */}

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

          {/* Enemy Image */}
          {enemySkiaImage && (
            <Image
              image={enemySkiaImage}
              x={enemyX - combatantRadius}
              y={combatantY - combatantRadius}
              width={combatantRadius * 2}
              height={combatantRadius * 2}
              fit="contain"
            />
          )}

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

          {/* Player Image */}
          {entityImages.player && (
            <Group origin={{ x: playerX, y: combatantY }} transform={[{ scaleX: -1 }]}>
              <Image
                image={entityImages.player}
                x={playerX - combatantRadius}
                y={combatantY - combatantRadius}
                width={combatantRadius * 2}
                height={combatantRadius * 2}
                fit="contain"
              />
            </Group>
          )}

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

      {/* Status effects for enemy (below floor line) */}
      <StatusEffectsRow statusEffects={enemy.statusEffects} x={enemyX} y={statusEffectsY} scale={scale} />

      {/* Status effects for player (below floor line) */}
      <StatusEffectsRow statusEffects={player.statusEffects} x={playerX} y={statusEffectsY} scale={scale} />
    </View>
  );
}

// Status effects row component
interface StatusEffectsRowProps {
  statusEffects: StatusEffects;
  x: number;
  y: number;
  scale?: number;
}

function StatusEffectsRow({ statusEffects, x, y, scale = 1 }: StatusEffectsRowProps) {
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

  const badgeWidth = 28 * scale;
  const totalWidth = effects.length * badgeWidth + (effects.length - 1) * 4 * scale;
  const startX = x - totalWidth / 2;

  return (
    <View style={[styles.statusRow, { left: startX, top: y, gap: 4 * scale }]}>
      {effects.map((effect, index) => {
        const { emoji, color } = config[effect.type];
        return (
          <View
            key={effect.type}
            style={[
              styles.statusBadge,
              {
                borderColor: color,
                paddingHorizontal: 4 * scale,
                paddingVertical: 2 * scale,
              },
            ]}
          >
            <Text style={{ fontSize: 10 * scale }}>{emoji}</Text>
            <Text style={{ fontSize: 9 * scale, fontWeight: 'bold', marginLeft: 2 * scale, color }}>
              {effect.stacks}
            </Text>
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
  overlay: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
  },
  turnBadge: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: 6,
  },
  turnBadgeText: {
    color: '#f8e4b5',
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  statusRow: {
    position: 'absolute',
    flexDirection: 'row',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    backgroundColor: '#1a1a2e',
  },
});
