/**
 * T058/T128: CombatScreen with combat resolution and navigation
 * Container for combat gameplay with arena, panels, and result display
 * Layout: Enemy (left) - Arena (center) - Player (right)
 * @see specs/001-pve-dungeon-crawler/spec.md User Story 2, FR-048, FR-049
 */

import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ImageBackground, Animated } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { useGame, GamePhase } from '../contexts/GameContext';
import { CombatProvider, useCombat } from '../contexts/CombatContext';
import { useProfile } from '../contexts/ProfileContext';
import { useSession } from '../contexts/SessionContext';
import { useLandscapeLock } from '../hooks/useOrientationLock';
import {
  CombatArena,
  VictoryDefeatDisplay,
  EnemyPanel,
  PlayerPanel,
  SpeedControls,
} from '../components/combat';
import { DebugOverlay } from '../components/game';
import { ENEMY_TRAITS } from '../game/combat/traits';
import { getEntityImageSource } from '../components/game/entityImages';
import { Typography } from '../theme/typography';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');

type CombatScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Combat'>;
};

const SAFE_AREA_EDGES = ['left', 'right'] as const;

/**
 * CombatScreen - Container for combat gameplay
 * Displays the combat arena, player/enemy panels, and combat log in landscape orientation
 */
export function CombatScreen({ navigation }: CombatScreenProps) {
  const { updateDefaultCombatSpeed } = useProfile();
  const initialSpeed = 'normal';

  return (
    <CombatProvider initialSpeed={initialSpeed} onSpeedChange={updateDefaultCombatSpeed}>
      <CombatScreenContent navigation={navigation} />
    </CombatProvider>
  );
}

function CombatScreenContent({ navigation }: CombatScreenProps) {
  const { state: gameState, dispatch: gameDispatch } = useGame();
  const { profile, recordRunResult, mode } = useProfile();
  const { queueEndGame, stopAutoCommit, hasActiveSession } = useSession();
  const {
    state: combatState,
    speed,
    setSpeed,
    startCombat,
    getDisplayStates,
    getResult,
  } = useCombat();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, []);

  // Lock to landscape orientation (FR-044)
  useLandscapeLock();

  // Start combat when screen loads
  useEffect(() => {
    if (gameState?.combat && !combatState.combat) {
      const playerGear = gameState.player.inventory.map((slot) => slot.item);
      startCombat({
        player: gameState.combat.player,
        enemy: gameState.combat.enemy,
        seed: gameState.rngState,
        playerGear,
        playerTool: gameState.player.equippedTool,
        playerGold: gameState.player.stats.gold,
        enemyDefinitionId: gameState.combat.enemyDefinitionId,
        enemyId: gameState.combat.enemyDefinitionId,
        enemyTier: gameState.combat.enemyTier,
      });
    }
  }, [gameState?.combat, combatState.combat, startCombat, gameState?.rngState]);

  // Handle combat completion - now uses deferred cleanup for instant navigation
  const handleCombatComplete = useCallback(async () => {
    const result = getResult();
    if (!result) return;

    // Determine if this was a boss fight (victory means boss defeated)
    const wasBossFight = gameState?.phase === GamePhase.BossFight;
    const isVictory = result === 'VICTORY';
    const levelReached = profile?.currentLevel ?? 0;

    // Stop the auto-commit timer
    stopAutoCommit();

    // Queue cleanup for later processing (no signature needed, instant return)
    // Only queue if we have an active session and not in guest mode
    if (hasActiveSession && mode !== 'guest') {
      console.log('[CombatScreen] Queueing deferred cleanup');
      await queueEndGame(levelReached, isVictory && wasBossFight);
    }

    // Record run result - this may also be deferred in cached mode
    if (profile && mode !== 'guest') {
      // Fire and forget - don't await, let it happen in background
      recordRunResult(levelReached, isVictory && wasBossFight).catch((error) => {
        console.warn('[CombatScreen] Failed to record run result:', error);
      });
    }

    // Update local game state
    if (mode !== 'guest' && hasActiveSession) {
      // On-chain mode: combat result is already on-chain.
      // Dispatch SYNC_COMBAT_RESULT if we have on-chain state available,
      // otherwise fall back to local RESOLVE_COMBAT.
      gameDispatch({
        type: 'RESOLVE_COMBAT',
        result,
        combat: combatState.resolvedCombat ?? undefined,
      });
    } else {
      // Guest mode: resolve combat locally
      gameDispatch({
        type: 'RESOLVE_COMBAT',
        result,
        combat: combatState.resolvedCombat ?? undefined,
      });
    }

    // Navigate immediately - no waiting for signatures!
    if (result === 'DEFEAT') {
      navigation.replace('Hub');
    } else {
      navigation.goBack();
    }
  }, [
    getResult,
    gameDispatch,
    navigation,
    gameState?.phase,
    profile,
    mode,
    stopAutoCommit,
    hasActiveSession,
    queueEndGame,
    recordRunResult,
    combatState.resolvedCombat,
  ]);

  const { player, enemy } = getDisplayStates();
  const result = getResult();
  const speedControlsDisabled = !combatState.resolvedCombat || combatState.isComplete;
  const basePlayerArm = combatState.combat
    ? combatState.combat.player.arm + combatState.combat.player.bonusArm
    : (player?.arm ?? 0);
  const baseEnemyArm = combatState.combat
    ? combatState.combat.enemy.arm + combatState.combat.enemy.bonusArm
    : (enemy?.arm ?? 0);
  const playerMaxArm = player ? Math.max(basePlayerArm, player.arm) : 0;
  const enemyMaxArm = enemy ? Math.max(baseEnemyArm, enemy.arm) : 0;

  // Look up enemy trait from the combat state's enemy definition ID
  const enemyTrait = useMemo(() => {
    const enemyId = combatState.combat?.enemyDefinitionId;
    if (!enemyId) return undefined;
    const trait = ENEMY_TRAITS[enemyId];
    return trait ? { name: trait.name, description: trait.description } : undefined;
  }, [combatState.combat?.enemyDefinitionId]);

  // Extract player equipment for display
  const playerEquipment = useMemo(() => {
    if (!gameState?.player) return { tool: null, gear: [] };
    return {
      tool: gameState.player.equippedTool,
      gear: gameState.player.inventory.map((slot) => slot.item),
    };
  }, [gameState?.player]);

  const activeActor = useMemo(() => {
    const entry = combatState.resolvedCombat?.log[combatState.currentLogIndex];
    if (entry?.actor === 'player' || entry?.actor === 'enemy') {
      return entry.actor;
    }
    return null;
  }, [combatState.currentLogIndex, combatState.resolvedCombat]);

  // Show loading if no combat state
  if (!player || !enemy) {
    return (
      <View style={styles.container}>
        <ImageBackground
          source={BACKGROUND_IMAGE}
          style={styles.backgroundImage}
          resizeMode="cover"
        >
          <View style={styles.darkOverlay}>
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>Preparing combat...</Text>
            </View>
          </View>
        </ImageBackground>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
        <View style={styles.darkOverlay}>
          <View style={styles.content}>
            {/* Enemy Panel (LEFT) - FR-048 */}
            <EnemyPanel
              name={enemy.name}
              emoji={enemy.emoji}
              imageSource={
                enemy.definitionId ? getEntityImageSource(enemy.definitionId) : undefined
              }
              hp={enemy.hp}
              maxHp={enemy.maxHp}
              atk={enemy.atk}
              arm={enemy.arm}
              maxArm={enemyMaxArm}
              spd={enemy.spd}
              dig={0}
              statusEffects={enemy.statusEffects}
              trait={enemyTrait}
            />

            {/* Combat Arena (CENTER) */}
            <View style={styles.arenaArea}>
              <CombatArena
                player={player}
                enemy={enemy}
                damageNumbers={combatState.damageNumbers}
                effectNotifications={combatState.effectNotifications}
                isAnimating={combatState.isAnimating}
                activeActor={activeActor}
                playerMaxArm={playerMaxArm}
                enemyMaxArm={enemyMaxArm}
              />

              <View style={styles.controlsArea}>
                <SpeedControls
                  currentSpeed={speed}
                  onSpeedChange={setSpeed}
                  disabled={speedControlsDisabled}
                />
              </View>

              {/* Debug Overlay - P15: Debug Tooling Isolation */}
              {gameState && (
                <DebugOverlay
                  debug={gameState.debug}
                  seed={gameState.seed}
                  phase={gameState.phase}
                  time={gameState.time}
                />
              )}
            </View>

            {/* Player Panel (RIGHT) - FR-049 */}
            <PlayerPanel
              name={player.name}
              emoji={player.emoji}
              hp={player.hp}
              maxHp={player.maxHp}
              atk={player.atk}
              arm={player.arm}
              maxArm={playerMaxArm}
              spd={player.spd}
              dig={gameState?.player.stats.dig ?? 0}
              gold={gameState?.player.stats.gold}
              statusEffects={player.statusEffects}
              equippedTool={playerEquipment.tool}
              equippedGear={playerEquipment.gear}
            />
          </View>

          {/* Victory/Defeat Overlay - T075: Pass goldReward for display */}
          {combatState.isComplete && result && (
            <VictoryDefeatDisplay
              result={result}
              goldReward={result === 'VICTORY' ? combatState.resolvedCombat?.goldReward : undefined}
              onComplete={handleCombatComplete}
            />
          )}
        </View>
      </ImageBackground>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    fontSize: 20,
    color: '#333',
  },
  arenaArea: {
    flex: 2,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  controlsArea: {
    marginTop: 12,
  },
});
