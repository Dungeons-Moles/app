/**
 * T056: CombatArena with Skia
 * Renders the combat scene with player and enemy combatants
 * @see specs/001-pve-dungeon-crawler/spec.md FR-015, FR-048, FR-049
 *
 * IMPORTANT: the layout math here (arena dimensions, combatant boxes, sprite
 * sizes, positions) is kept 1:1 with CombatArena.web.tsx. The two files share
 * no code, so any layout change must be mirrored in both or the PSG1 and the
 * web simulator diverge. Only the rendering medium differs — this file draws
 * the background with Skia, the web file uses an <ImageBackground>.
 */

import React from 'react';
import {
  Canvas,
  Rect,
  Image,
  useImage,
} from '@shopify/react-native-skia';
import { Animated, StyleSheet, View, useWindowDimensions, Image as RNImage, Text, type ImageSourcePropType } from 'react-native';
import type { CombatantState, StatusEffects } from '../../game/engine/types';
import { DamageNumbers } from './DamageNumbers';
import { EffectNotifications } from './EffectNotifications';
import type { DamageNumber, EffectNotification } from '../../contexts/CombatContext';
import { getEntityImageSource, getEntityCombatScale, getEntityCombatYOffset, getEntityCombatXOffset } from '../game/entityImages';
import { useHitAnimation, useStatusFlashes, useStatGainFlashes, useActiveGlow } from '../../hooks/useHitAnimation';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../ScaledCanvas';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';

const BATTLEGROUND_BG = require('../../../assets/ui/backgrounds/combat-background.webp');
const DEFAULT_MOLE = require('../../../assets/entities/characters/default-mole.webp');

// Layered glow: outer layers are larger and more transparent, inner layers are tighter and brighter.
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
  playerSkinSource?: ImageSourcePropType;
  /** PvP opponent skin image source (their equipped skin or default mole) */
  pvpOpponentSkinSource?: ImageSourcePropType;
  /** Per-skin combat scale for the player sprite (default 1) */
  playerCombatScale?: number;
  /** Scale factor for compact/mobile views (default 1) */
  scale?: number;
}

/**
 * CombatArena renders the battle scene with combatants
 * Enemy on LEFT, Player on RIGHT per spec FR-048/FR-049
 */
export const CombatArena = React.memo(function CombatArena({
  player,
  enemy,
  damageNumbers,
  effectNotifications,
  isAnimating,
  currentTurn = 1,
  activeActor = null,
  playerMaxArm = 0,
  enemyMaxArm = 0,
  playerSkinSource,
  pvpOpponentSkinSource,
  playerCombatScale = 1,
  scale = 1,
}: CombatArenaProps) {
  // On the compact variant the app renders inside the fixed 1240x1080
  // ScaledCanvas; useWindowDimensions() reports the smaller real device size
  // (~729x635 on the PSG1), so size against the virtual canvas instead. The
  // arena formula below is identical to CombatArena.web.tsx.
  const window = useWindowDimensions();
  const isCompact = useScreenVariant() === 'compact';
  const screenWidth = isCompact ? CANVAS_WIDTH : window.width;
  const screenHeight = isCompact ? CANVAS_HEIGHT : window.height;
  const arenaWidth = isCompact
    ? Math.min(screenWidth * 0.45, 600)
    : Math.min(screenWidth * 0.5, 400);
  const arenaHeight = isCompact ? Math.min(screenHeight * 0.6, 520) : 300;
  const bgImage = useImage(BATTLEGROUND_BG);

  const enemyHit = useHitAnimation(enemy?.hp, enemy != null ? enemy.arm + enemy.bonusArm : undefined);
  const playerHit = useHitAnimation(player?.hp, player != null ? player.arm + player.bonusArm : undefined);
  const enemyStatusFlashes = useStatusFlashes(enemy?.statusEffects);
  const playerStatusFlashes = useStatusFlashes(player?.statusEffects);
  const enemyStatFlashes = useStatGainFlashes(enemy);
  const playerStatFlashes = useStatGainFlashes(player);
  const enemyGlow = useActiveGlow(activeActor === 'enemy');
  const playerGlow = useActiveGlow(activeActor === 'player');

  if (!player || !enemy) {
    return (
      <View style={[styles.container, { width: arenaWidth, height: arenaHeight }]}>
        <Canvas style={{ width: arenaWidth, height: arenaHeight }}>
          <Rect x={0} y={0} width={arenaWidth} height={arenaHeight} color="transparent" />
        </Canvas>
      </View>
    );
  }

  const combatantRadius = 50 * scale;
  const enemyX = arenaWidth * 0.25;
  const playerX = arenaWidth * 0.75;
  const combatantY = arenaHeight * 0.45;
  // Status effects position (below the floor line)
  const statusEffectsY = arenaHeight * 0.75;

  const enemyEntityScale = getEntityCombatScale(enemy.definitionId);
  const enemyYOffset = getEntityCombatYOffset(enemy.definitionId) * scale;
  const enemyXOffset = getEntityCombatXOffset(enemy.definitionId) * scale;

  // Sprite boxes — kept identical to CombatArena.web.tsx. `*Half` is the
  // hitbox radius, `*Full` the hitbox box, `*Img` the (larger) rendered image.
  const enemyHalf = 40 * scale * enemyEntityScale;
  const enemyFull = 80 * scale * enemyEntityScale;
  const enemyImg = 120 * scale * enemyEntityScale;
  const playerHalf = 40 * scale * playerCombatScale;
  const playerFull = 80 * scale * playerCombatScale;
  const playerImg = 120 * scale * playerCombatScale;
  // The player stands on a floor line 40*scale below combatantY (web parity).
  const playerFloorY = combatantY + 40 * scale;

  const enemyImageSource =
    enemy.definitionId === 'pvpOpponent'
      ? (pvpOpponentSkinSource ?? DEFAULT_MOLE)
      : enemy.definitionId
        ? (getEntityImageSource(enemy.definitionId) ?? DEFAULT_MOLE)
        : DEFAULT_MOLE;

  return (
    <View style={[styles.container, { width: arenaWidth, height: arenaHeight }]}>
      {/* Background only in Canvas */}
      <Canvas style={{ width: arenaWidth, height: arenaHeight }}>
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
          <Rect x={0} y={0} width={arenaWidth} height={arenaHeight} color="#F5F0DD" />
        )}
      </Canvas>

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
          <RNImage
            source={enemyImageSource}
            style={{
              width: enemyImg * layer.size,
              height: enemyImg * layer.size,
              tintColor: '#D4A84B',
            }}
            resizeMode="contain"
          />
        </Animated.View>
      ))}
      {/* Enemy combatant (LEFT) */}
      <Animated.View
        style={[
          styles.imageContainer,
          {
            left: enemyX - enemyHalf + enemyXOffset,
            top: combatantY - enemyHalf + enemyYOffset,
            width: enemyFull,
            height: enemyFull,
            opacity: enemyHit.flashOpacity,
            transform: [{ translateX: enemyHit.shakeX }],
          },
        ]}
      >
        <RNImage
          source={enemyImageSource}
          style={{ width: enemyImg, height: enemyImg }}
          resizeMode="contain"
        />
        {[...enemyStatusFlashes, ...enemyStatFlashes, { color: '#a855f7', opacity: enemyHit.armorFlashOpacity }].map((flash, i) => (
          <Animated.View key={i} style={[styles.tintOverlay, { opacity: flash.opacity }]}>
            <RNImage
              source={enemyImageSource}
              style={{ width: enemyImg, height: enemyImg, tintColor: flash.color }}
              resizeMode="contain"
            />
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
              left: playerX - playerHalf * layer.size,
              top: playerFloorY - playerFull * layer.size,
              width: playerFull * layer.size,
              height: playerFull * layer.size,
              opacity: Animated.multiply(playerGlow.opacity, layer.opacity),
              transform: [{ scaleX: -1 }, { scale: playerGlow.scale }],
            },
          ]}
        >
          <RNImage
            source={playerSkinSource ?? DEFAULT_MOLE}
            style={{
              width: playerImg * layer.size,
              height: playerImg * layer.size,
              tintColor: '#D4A84B',
            }}
            resizeMode="contain"
          />
        </Animated.View>
      ))}
      {/* Player combatant (RIGHT) */}
      <Animated.View
        style={[
          styles.imageContainer,
          {
            left: playerX - playerHalf,
            top: playerFloorY - playerFull,
            width: playerFull,
            height: playerFull,
            opacity: playerHit.flashOpacity,
            transform: [{ scaleX: -1 }, { translateX: playerHit.shakeX }],
          },
        ]}
      >
        <RNImage
          source={playerSkinSource ?? DEFAULT_MOLE}
          style={{ width: playerImg, height: playerImg }}
          resizeMode="contain"
        />
        {[...playerStatusFlashes, ...playerStatFlashes, { color: '#a855f7', opacity: playerHit.armorFlashOpacity }].map((flash, i) => (
          <Animated.View key={i} style={[styles.tintOverlay, { opacity: flash.opacity }]}>
            <RNImage
              source={playerSkinSource ?? DEFAULT_MOLE}
              style={{ width: playerImg, height: playerImg, tintColor: flash.color }}
              resizeMode="contain"
            />
          </Animated.View>
        ))}
      </Animated.View>

      {/* Overlay damage numbers */}
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
            <RNImage source={STATUS_ICONS[effect.type]} style={{ width: 18 * scale, height: 18 * scale }} />
            <Text style={{ fontSize: 11 * scale, fontWeight: 'bold', marginLeft: 2 * scale, color }}>
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
  imageContainer: {
    position: 'absolute',
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
  statusGrid: {
    position: 'absolute',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
});
