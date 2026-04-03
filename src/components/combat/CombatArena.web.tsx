/**
 * CombatArena - Web fallback without Skia.
 */

import React, { useMemo } from 'react';
import { Animated, StyleSheet, View, useWindowDimensions, Text } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { CachedImageBackground } from '../common/CachedImageBackground';
import type { CombatantState, StatusEffects } from '../../game/engine/types';
import { DamageNumbers } from './DamageNumbers';
import { EffectNotifications } from './EffectNotifications';
import type { DamageNumber, EffectNotification } from '../../contexts/CombatContext';
import { getEntityImageSource, getEntityCombatScale, getEntityCombatYOffset, getEntityCombatXOffset } from '../game/entityImages';
import { useHitAnimation, useStatusFlashes, useStatGainFlashes, useActiveGlow } from '../../hooks/useHitAnimation';

const defaultMoleImageSource = require('../../../assets/entities/characters/default-mole.webp');
const BATTLEGROUND_BG = require('../../../assets/ui/backgrounds/combat-background.webp');

const GLOW_LAYERS = [
  { size: 1.25, opacity: 0.12 },
  { size: 1.18, opacity: 0.2 },
  { size: 1.12, opacity: 0.35 },
  { size: 1.06, opacity: 0.55 },
];

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
  /** Player skin image source (equipped skin or default mole) */
  playerSkinSource?: ImageSource;
  /** PvP opponent skin image source (their equipped skin or default mole) */
  pvpOpponentSkinSource?: ImageSource;
  /** Per-skin combat scale for the player sprite (default 1) */
  playerCombatScale?: number;
  scale?: number;
}

export const CombatArena = React.memo(function CombatArena({
  player,
  enemy,
  damageNumbers,
  effectNotifications,
  currentTurn = 1,
  activeActor = null,
  playerMaxArm = 0,
  enemyMaxArm = 0,
  playerSkinSource,
  pvpOpponentSkinSource,
  playerCombatScale = 1,
  scale = 1,
}: CombatArenaProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isCompact = scale > 1;
  const arenaWidth = isCompact
    ? Math.min(screenWidth * 0.45, 600)
    : Math.min(screenWidth * 0.5, 400);
  const arenaHeight = isCompact
    ? Math.min(screenHeight * 0.6, 520)
    : 300;

  if (!player || !enemy) {
    return (
      <View style={[styles.container, { width: arenaWidth, height: arenaHeight }]}>
        <View style={styles.placeholder} />
      </View>
    );
  }

  const combatantRadius = 50 * scale;
  const enemyX = arenaWidth * 0.25;
  const playerX = arenaWidth * 0.75;
  const combatantY = arenaHeight * 0.45;

  // Status effects position (below the floor line)
  const statusEffectsY = arenaHeight * 0.75;
  const enemyHit = useHitAnimation(enemy.hp, enemy.arm + enemy.bonusArm);
  const playerHit = useHitAnimation(player.hp, player.arm + player.bonusArm);
  const enemyStatusFlashes = useStatusFlashes(enemy.statusEffects);
  const playerStatusFlashes = useStatusFlashes(player.statusEffects);
  const enemyStatFlashes = useStatGainFlashes(enemy);
  const playerStatFlashes = useStatGainFlashes(player);
  const enemyGlow = useActiveGlow(activeActor === 'enemy');
  const playerGlow = useActiveGlow(activeActor === 'player');

  const enemyEntityScale = getEntityCombatScale(enemy.definitionId);
  const enemyYOffset = getEntityCombatYOffset(enemy.definitionId) * scale;
  const enemyXOffset = getEntityCombatXOffset(enemy.definitionId) * scale;
  const enemyHalf = 40 * scale * enemyEntityScale;
  const enemyFull = 80 * scale * enemyEntityScale;
  const enemyImg = 120 * scale * enemyEntityScale;

  const enemyImageSource =
    enemy.definitionId === 'pvpOpponent'
      ? (pvpOpponentSkinSource ?? defaultMoleImageSource)
      : enemy.definitionId
        ? (getEntityImageSource(enemy.definitionId) ?? defaultMoleImageSource)
        : defaultMoleImageSource;

  return (
    <View style={[styles.container, { width: arenaWidth, height: arenaHeight }]}>
      <CachedImageBackground source={BATTLEGROUND_BG} style={styles.background} contentFit="contain">
        {/* Enemy active glow (layered tinted silhouettes for soft glow) */}
        {GLOW_LAYERS.map((layer, i) => (
          <Animated.View
            key={`eg${i}`}
            style={[
              styles.imageContainer,
              {
                left: enemyX - enemyHalf * layer.size + enemyXOffset,
                top: combatantY - enemyHalf * layer.size + enemyYOffset,
                width: enemyFull * layer.size,
                height: enemyFull * layer.size,
                opacity: Animated.multiply(enemyGlow.opacity, layer.opacity),
                transform: [{ scale: enemyGlow.scale }],
              },
            ]}
          >
            <Image source={enemyImageSource} style={{ width: enemyImg * layer.size, height: enemyImg * layer.size }} contentFit="contain" tintColor="#D4A84B" />
          </Animated.View>
        ))}

        {/* Enemy Image */}
        <Animated.View style={[styles.imageContainer, { left: enemyX - enemyHalf + enemyXOffset, top: combatantY - enemyHalf + enemyYOffset, width: enemyFull, height: enemyFull, opacity: enemyHit.flashOpacity, transform: [{ translateX: enemyHit.shakeX }] }]}>
          <Image source={enemyImageSource} style={{ width: enemyImg, height: enemyImg }} contentFit="contain" />
          {[...enemyStatusFlashes, ...enemyStatFlashes, { color: '#a855f7', opacity: enemyHit.armorFlashOpacity }].map((flash, i) => (
            <Animated.View key={i} style={[styles.tintOverlay, { opacity: flash.opacity }]}>
              <Image source={enemyImageSource} style={{ width: enemyImg, height: enemyImg }} contentFit="contain" tintColor={flash.color} />
            </Animated.View>
          ))}
        </Animated.View>

        {/* Player active glow (layered tinted silhouettes for soft glow) */}
        {GLOW_LAYERS.map((layer, i) => (
          <Animated.View
            key={`pg${i}`}
            style={[
              styles.imageContainer,
              {
                left: playerX - 40 * scale * playerCombatScale * layer.size,
                top: combatantY + 40 * scale - 80 * scale * playerCombatScale * layer.size,
                width: 80 * scale * playerCombatScale * layer.size,
                height: 80 * scale * playerCombatScale * layer.size,
                opacity: Animated.multiply(playerGlow.opacity, layer.opacity),
                transform: [{ scaleX: -1 }, { scale: playerGlow.scale }],
              },
            ]}
          >
            <Image source={playerSkinSource ?? defaultMoleImageSource} style={{ width: 120 * scale * playerCombatScale * layer.size, height: 120 * scale * playerCombatScale * layer.size }} contentFit="contain" tintColor="#D4A84B" />
          </Animated.View>
        ))}

        {/* Player Image */}
        <Animated.View
          style={[
            styles.imageContainer,
            { left: playerX - 40 * scale * playerCombatScale, top: combatantY + 40 * scale - 80 * scale * playerCombatScale, width: 80 * scale * playerCombatScale, height: 80 * scale * playerCombatScale, opacity: playerHit.flashOpacity, transform: [{ scaleX: -1 }, { translateX: playerHit.shakeX }] },
          ]}
        >
          <Image
            source={playerSkinSource ?? defaultMoleImageSource}
            style={{ width: 120 * scale * playerCombatScale, height: 120 * scale * playerCombatScale }}
            contentFit="contain"
          />
          {[...playerStatusFlashes, ...playerStatFlashes, { color: '#a855f7', opacity: playerHit.armorFlashOpacity }].map((flash, i) => (
            <Animated.View key={i} style={[styles.tintOverlay, { opacity: flash.opacity }]}>
              <Image source={playerSkinSource ?? defaultMoleImageSource} style={{ width: 120 * scale * playerCombatScale, height: 120 * scale * playerCombatScale }} contentFit="contain" tintColor={flash.color} />
            </Animated.View>
          ))}
        </Animated.View>

        {/* Overlay damage numbers using separate component */}
        <View style={styles.overlay}>
          <DamageNumbers
            damageNumbers={damageNumbers}
            enemyPosition={{ x: enemyX, y: combatantY - enemyHalf + enemyYOffset - 20 }}
            playerPosition={{ x: playerX, y: combatantY + combatantRadius - combatantRadius * 2 * playerCombatScale - 20 }}
            scale={scale}
          />
          <EffectNotifications
            notifications={effectNotifications}
            enemyPosition={{ x: enemyX, y: combatantY - enemyHalf + enemyYOffset - 40 }}
            playerPosition={{ x: playerX, y: combatantY + combatantRadius - combatantRadius * 2 * playerCombatScale - 40 }}
            scale={scale}
          />
        </View>

        {/* Status effects for enemy (below floor line) */}
        <StatusEffectsRow statusEffects={enemy.statusEffects} x={enemyX} y={statusEffectsY} scale={scale} />

        {/* Status effects for player (below floor line) */}
        <StatusEffectsRow statusEffects={player.statusEffects} x={playerX} y={statusEffectsY} scale={scale} />
      </CachedImageBackground>
    </View>
  );
});

// Status effects row component
interface StatusEffectsRowProps {
  statusEffects: StatusEffects;
  x: number;
  y: number;
  scale?: number;
}

const STATUS_ICONS = {
  chill: require('../../../assets/icons/status-effects/chill.webp'),
  shrapnel: require('../../../assets/icons/status-effects/shrapnel.webp'),
  rust: require('../../../assets/icons/status-effects/rust.webp'),
  bleed: require('../../../assets/icons/status-effects/bleed.webp'),
};

function StatusEffectsRow({ statusEffects, x, y, scale = 1 }: StatusEffectsRowProps) {
  const effects: { type: 'chill' | 'shrapnel' | 'rust' | 'bleed'; stacks: number }[] = [];

  if (statusEffects.chill > 0) effects.push({ type: 'chill', stacks: statusEffects.chill });
  if (statusEffects.shrapnel > 0) effects.push({ type: 'shrapnel', stacks: statusEffects.shrapnel });
  if (statusEffects.rust > 0) effects.push({ type: 'rust', stacks: statusEffects.rust });
  if (statusEffects.bleed > 0) effects.push({ type: 'bleed', stacks: statusEffects.bleed });

  if (effects.length === 0) return null;

  const config = {
    chill: { color: '#5CAEC8' },
    shrapnel: { color: '#6E7784' },
    rust: { color: '#A4542A' },
    bleed: { color: '#B33A3F' },
  };

  const gap = 4 * scale;
  const isGrid = effects.length > 2;
  const badgeWidth = 42 * scale;
  const cols = isGrid ? 2 : effects.length;
  const totalWidth = cols * badgeWidth + (cols - 1) * gap;
  const startX = x - totalWidth / 2;
  const adjustedY = isGrid ? y - 20 * scale : y;

  return (
    <View style={[styles.statusGrid, { left: startX, top: adjustedY, width: totalWidth, gap }]}>
      {effects.map((effect) => {
        const { color } = config[effect.type];
        return (
          <View key={effect.type} style={[styles.statusBadge, { borderColor: color, paddingHorizontal: 4 * scale, paddingVertical: 2 * scale }]}>
            <Image source={STATUS_ICONS[effect.type]} style={{ width: 18 * scale, height: 18 * scale }} />
            <Text style={{ fontSize: 11 * scale, fontWeight: 'bold', marginLeft: 2 * scale, color }}>{effect.stacks}</Text>
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
  placeholder: {
    ...StyleSheet.absoluteFillObject,
  },
  floor: {
    position: 'absolute',
    height: 2,
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
  tintOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  combatantImage: {
    width: 120,
    height: 120,
  },
  statusGrid: {
    position: 'absolute',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    backgroundColor: 'transparent',
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
