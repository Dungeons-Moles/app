/**
 * CombatLayout - Shared combat display layout
 *
 * Renders the 3-column combat layout (EnemyPanel - CombatArena - PlayerPanel)
 * with speed controls, controller hints, armor peak tracking, and VictoryDefeatDisplay.
 * Used by both CombatScreen (PvE) and PitDraftScreen (PvP).
 */

import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, type ImageSourcePropType } from 'react-native';
import { CachedImageBackground } from '../common/CachedImageBackground';
import { useCombat } from '../../contexts/CombatContext';
import type { CombatSpeed } from '../../contexts/CombatContext';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';
import { useInputMode } from '../../hooks/useInputMode';
import { useControllerAction } from '../../hooks/useControllerAction';
import { ControllerHints, type ButtonHint } from '../ui/ControllerHints';
import { CombatArena } from './CombatArena';
import { VictoryDefeatDisplay } from './VictoryDefeatDisplay';
import { EnemyPanel, type EnemyPanelProps } from './EnemyPanel';
import { PlayerPanel, type PlayerPanelProps } from './PlayerPanel';
import { SpeedControls } from './SpeedControls';
import { Typography } from '../../theme/typography';

const BACKGROUND_IMAGE = require('../../../assets/ui/backgrounds/loading-background.webp');

/** Fields provided by CombatLayout from combat state — callers don't need to pass these */
type CombatStateFields =
  | 'hp'
  | 'maxHp'
  | 'atk'
  | 'arm'
  | 'maxArm'
  | 'spd'
  | 'statusEffects'
  | 'scale';

export interface CombatLayoutProps {
  /** Props for EnemyPanel (combat-state fields like hp/atk are filled automatically) */
  enemyPanel: Omit<EnemyPanelProps, CombatStateFields>;
  /** Props for PlayerPanel (combat-state fields like hp/atk are filled automatically) */
  playerPanel: Omit<PlayerPanelProps, CombatStateFields>;
  /** Optional label shown at top center (e.g., "PIT DRAFT") */
  label?: string;
  /** Player skin image source for the combat arena sprites */
  playerSkinSource?: ImageSourcePropType;
  /** PvP opponent skin image source for the combat arena sprites */
  pvpOpponentSkinSource?: ImageSourcePropType;
  /** Per-skin combat scale for the player sprite (default 1) */
  playerCombatScale?: number;
  /** Gold reward shown on VictoryDefeatDisplay (PvE only) */
  goldReward?: number;
  /** Whether this is the final boss victory (PvE only) */
  isFinalVictory?: boolean;
  /** Called when VictoryDefeatDisplay completes its countdown */
  onCombatComplete: () => void;
  /** Extra content rendered inside the arena area (e.g., DebugOverlay) */
  arenaChildren?: React.ReactNode;
}

export const CombatLayout = React.memo(function CombatLayout({
  enemyPanel,
  playerPanel,
  label,
  playerSkinSource,
  pvpOpponentSkinSource,
  playerCombatScale,
  goldReward,
  isFinalVictory,
  onCombatComplete,
  arenaChildren,
}: CombatLayoutProps) {
  const { state: combatState, speed, setSpeed, displayStates, getResult } = useCombat();

  const variant = useScreenVariant();
  const isCompact = variant === 'compact';
  const scale = isCompact ? 2 : 1;

  // Start hidden and fade in after a short delay so Skia images
  // (combat background, character sprites) have time to decode.
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }, 350);
    return () => clearTimeout(timer);
  }, []);

  // --- Controller: speed cycling ---
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const SPEED_ORDER: CombatSpeed[] = ['paused', 'normal', 'fast', 'super-fast'];

  const speedControlsDisabled = !combatState.resolvedCombat || combatState.isComplete;

  const cycleSpeed = useCallback(
    (direction: 1 | -1) => {
      if (speedControlsDisabled) return;
      const idx = SPEED_ORDER.indexOf(speed);
      const next = idx + direction;
      if (next >= 0 && next < SPEED_ORDER.length) {
        setSpeed(SPEED_ORDER[next]);
      }
    },
    [speed, setSpeed, speedControlsDisabled]
  );

  useControllerAction(
    {
      onDPadRight: () => cycleSpeed(1),
      onDPadLeft: () => cycleSpeed(-1),
    },
    isController
  );

  const controllerHints: ButtonHint[] = [{ button: 'DPadLeftRight', label: 'Speed' }];

  // --- Armor peak tracking ---
  const combatRef = useRef(combatState.combat);
  const playerPeakArmRef = useRef(0);
  const enemyPeakArmRef = useRef(0);

  if (combatRef.current !== combatState.combat) {
    combatRef.current = combatState.combat;
    playerPeakArmRef.current = combatState.combat
      ? combatState.combat.player.arm + combatState.combat.player.bonusArm
      : 0;
    enemyPeakArmRef.current = combatState.combat
      ? combatState.combat.enemy.arm + combatState.combat.enemy.bonusArm
      : 0;
  }

  const { player, enemy, playerGold, enemyGold } = displayStates;
  const result = getResult();

  if (player) {
    playerPeakArmRef.current = Math.max(playerPeakArmRef.current, player.arm);
  }
  if (enemy) {
    enemyPeakArmRef.current = Math.max(enemyPeakArmRef.current, enemy.arm);
  }

  const basePlayerArm = combatState.combat
    ? combatState.combat.player.arm + combatState.combat.player.bonusArm
    : (player?.arm ?? 0);
  const baseEnemyArm = combatState.combat
    ? combatState.combat.enemy.arm + combatState.combat.enemy.bonusArm
    : (enemy?.arm ?? 0);
  const playerMaxArm = player ? Math.max(basePlayerArm, playerPeakArmRef.current, player.arm) : 0;
  const enemyMaxArm = enemy ? Math.max(baseEnemyArm, enemyPeakArmRef.current, enemy.arm) : 0;

  // --- Turn / actor computation ---
  // Use activeActorLogIndex (which can lead currentLogIndex) so the glow
  // animation starts before the combat action effects are applied.
  const activeActor = useMemo(() => {
    const entry = combatState.resolvedCombat?.log[combatState.activeActorLogIndex];
    if (
      entry?.result.source?.id === 'shrapnel' &&
      entry.result.source.kind === 'status' &&
      (entry.actor === 'player' || entry.actor === 'enemy')
    ) {
      return entry.actor;
    }
    if (entry?.timing === 'PLAYER_ATTACK') return 'player';
    if (entry?.timing === 'ENEMY_ATTACK') return 'enemy';
    return null;
  }, [combatState.activeActorLogIndex, combatState.resolvedCombat]);

  const currentTurn = useMemo(() => {
    const entry = combatState.resolvedCombat?.log[combatState.currentLogIndex];
    return Math.max(1, entry?.turn ?? 1);
  }, [combatState.currentLogIndex, combatState.resolvedCombat]);

  // --- Loading state ---
  if (!player || !enemy) {
    return (
      <View style={styles.container}>
        <CachedImageBackground
          source={BACKGROUND_IMAGE}
          style={styles.backgroundImage}
          resizeMode="cover"
        >
          <View style={styles.darkOverlay}>
            <View style={styles.loadingContainer}>
              <Text style={[styles.loadingText, { fontSize: 20 * scale }]}>
                Preparing combat...
              </Text>
            </View>
          </View>
        </CachedImageBackground>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <CachedImageBackground
        source={BACKGROUND_IMAGE}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <View style={styles.darkOverlay}>
          {/* Optional label (e.g., "PIT DRAFT") */}
          {label && (
            <View style={styles.topLabel}>
              <Text style={styles.topLabelText}>{label}</Text>
            </View>
          )}

          <View style={styles.content}>
            {/* Enemy Panel (LEFT) */}
            <EnemyPanel
              {...enemyPanel}
              hp={enemy.hp}
              maxHp={enemy.maxHp}
              atk={enemy.atk}
              arm={enemy.arm}
              maxArm={enemyMaxArm}
              spd={enemy.spd}
              gold={enemyPanel.gold ?? enemyGold}
              statusEffects={enemy.statusEffects}
              scale={scale}
            />

            {/* Combat Arena (CENTER) */}
            <View style={[styles.arenaArea, { padding: 16 * scale }]}>
              <View
                style={[
                  styles.turnBadge,
                  {
                    paddingHorizontal: 10 * scale,
                    paddingVertical: 4 * scale,
                    marginBottom: 6 * scale,
                  },
                ]}
              >
                <Text style={[styles.turnBadgeText, { fontSize: 13 * scale }]}>
                  Turn {currentTurn}
                </Text>
              </View>
              <CombatArena
                player={player}
                enemy={enemy}
                damageNumbers={combatState.damageNumbers}
                effectNotifications={combatState.effectNotifications}
                isAnimating={combatState.isAnimating}
                currentTurn={currentTurn}
                activeActor={activeActor}
                playerSkinSource={playerSkinSource}
                pvpOpponentSkinSource={pvpOpponentSkinSource}
                playerCombatScale={playerCombatScale}
                scale={scale}
              />

              <View style={[styles.controlsArea, { marginTop: isCompact ? 24 : -4 }]}>
                <SpeedControls
                  currentSpeed={speed}
                  onSpeedChange={setSpeed}
                  disabled={speedControlsDisabled}
                  scale={scale}
                />
              </View>

              {arenaChildren}
            </View>

            {/* Player Panel (RIGHT) */}
            <PlayerPanel
              {...playerPanel}
              hp={player.hp}
              maxHp={player.maxHp}
              atk={player.atk}
              arm={player.arm}
              maxArm={playerMaxArm}
              spd={player.spd}
              gold={playerPanel.gold ?? playerGold}
              statusEffects={player.statusEffects}
              scale={scale}
            />
          </View>

          {/* Victory/Defeat Overlay */}
          {combatState.isComplete && result && (
            <VictoryDefeatDisplay
              result={result}
              goldReward={result === 'VICTORY' ? goldReward : undefined}
              isFinalVictory={isFinalVictory}
              onComplete={onCombatComplete}
              scale={scale}
            />
          )}
          {!combatState.isComplete && <ControllerHints hints={controllerHints} horizontal />}
        </View>
      </CachedImageBackground>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F0DD',
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  darkOverlay: {
    flex: 1,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: Typography.header,
    color: '#333',
  },
  arenaArea: {
    flex: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlsArea: {},
  turnBadge: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: 6,
  },
  turnBadgeText: {
    color: '#f8e4b5',
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  topLabel: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  topLabelText: {
    fontFamily: Typography.header,
    fontSize: 14,
    color: '#FABC0F',
    letterSpacing: 2,
  },
});
