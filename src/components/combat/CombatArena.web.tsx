/**
 * CombatArena - Web fallback without Skia.
 */

import React, { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions, Text, Image, ImageBackground, type ImageSourcePropType } from 'react-native';
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
  /** Player skin image source (equipped skin or default mole) */
  playerSkinSource?: ImageSourcePropType;
  /** PvP opponent skin image source (their equipped skin or default mole) */
  pvpOpponentSkinSource?: ImageSourcePropType;
  scale?: number;
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
  playerSkinSource,
  pvpOpponentSkinSource,
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
  const enemyImageSource =
    enemy.definitionId === 'pvpOpponent'
      ? (pvpOpponentSkinSource ?? defaultMoleImageSource)
      : enemy.definitionId
        ? (getEntityImageSource(enemy.definitionId) ?? defaultMoleImageSource)
        : defaultMoleImageSource;

  return (
    <View style={[styles.container, { width: arenaWidth, height: arenaHeight }]}>
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
        <View style={[styles.imageContainer, { left: enemyX - 40 * scale, top: combatantY - 40 * scale, width: 80 * scale, height: 80 * scale }]}>
          <Image source={enemyImageSource} style={{ width: 120 * scale, height: 120 * scale }} resizeMode="contain" />
        </View>

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
            { left: playerX - 40 * scale, top: combatantY - 40 * scale, width: 80 * scale, height: 80 * scale, transform: [{ scaleX: -1 }] },
          ]}
        >
          <Image
            source={playerSkinSource ?? defaultMoleImageSource}
            style={{ width: 120 * scale, height: 120 * scale }}
            resizeMode="contain"
          />
        </View>

        {/* Overlay damage numbers using separate component */}
        <View style={styles.overlay}>
          <DamageNumbers
            damageNumbers={damageNumbers}
            enemyPosition={{ x: enemyX, y: combatantY - combatantRadius - 20 }}
            playerPosition={{ x: playerX, y: combatantY - combatantRadius - 20 }}
            scale={scale}
          />
          <EffectNotifications
            notifications={effectNotifications}
            enemyPosition={{ x: enemyX, y: combatantY - combatantRadius - 40 }}
            playerPosition={{ x: playerX, y: combatantY - combatantRadius - 40 }}
            scale={scale}
          />
        </View>

        {/* Status effects for enemy (below floor line) */}
        <StatusEffectsRow statusEffects={enemy.statusEffects} x={enemyX} y={statusEffectsY} scale={scale} />

        {/* Status effects for player (below floor line) */}
        <StatusEffectsRow statusEffects={player.statusEffects} x={playerX} y={statusEffectsY} scale={scale} />
      </ImageBackground>
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

const STATUS_ICONS = {
  chill: require('../../../assets/icons/status-effects/chill.png'),
  shrapnel: require('../../../assets/icons/status-effects/shrapnel.png'),
  rust: require('../../../assets/icons/status-effects/rust.png'),
  bleed: require('../../../assets/icons/status-effects/bleed.png'),
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
  activeRing: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: 'black',
    backgroundColor: 'transparent',
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
