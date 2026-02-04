/**
 * T058/T128: CombatScreen with combat resolution and navigation
 * Container for combat gameplay with arena, panels, and result display
 * Layout: Enemy (left) - Arena (center) - Player (right)
 * @see specs/001-pve-dungeon-crawler/spec.md User Story 2, FR-048, FR-049
 */

import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ImageBackground, Animated } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
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
  route: RouteProp<RootStackParamList, 'Combat'>;
};

const SAFE_AREA_EDGES = ['left', 'right'] as const;

/**
 * CombatScreen - Container for combat gameplay
 * Displays the combat arena, player/enemy panels, and combat log in landscape orientation
 */
export function CombatScreen({ navigation, route }: CombatScreenProps) {
  const { updateDefaultCombatSpeed } = useProfile();
  const initialSpeed = 'normal';

  return (
    <CombatProvider initialSpeed={initialSpeed} onSpeedChange={updateDefaultCombatSpeed}>
      <CombatScreenContent navigation={navigation} route={route} />
    </CombatProvider>
  );
}

function CombatScreenContent({ navigation, route }: CombatScreenProps) {
  const { state: gameState, dispatch: gameDispatch } = useGame();
  const { profile, mode } = useProfile();
  const { endSessionWithBurner, stopAutoCommit, hasActiveSession } = useSession();
  const {
    state: combatState,
    speed,
    setSpeed,
    startCombat,
    startCombatWithLog,
    getDisplayStates,
    getResult,
  } = useCombat();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Get combat input from route params (on-chain mode) or null (guest mode)
  const combatInput = route?.params?.combatInput;
  const isBossFight = combatInput?.isBossFight ?? gameState?.phase === GamePhase.BossFight;
  const currentWeek = combatInput?.week ?? gameState?.time.week ?? 1;

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
    // Skip if combat already started
    if (combatState.combat) return;

    // On-chain mode: use combat input from route params
    if (combatInput) {
      const resolverInput = {
        player: combatInput.player,
        enemy: combatInput.enemy,
        seed: combatInput.seed,
        bossId: combatInput.bossId,
        enemyId: combatInput.enemyId,
        enemyDefinitionId: combatInput.enemyDefinitionId,
        enemyTier: combatInput.enemyTier,
        goldReward: combatInput.goldReward,
        activeItemSets: combatInput.activeItemSets,
        playerGear: combatInput.playerGear,
        playerTool: combatInput.playerTool,
        playerGold: combatInput.playerGold,
      };

      // Use backend log if available (ensures frontend matches on-chain)
      if (combatInput.combatLog && combatInput.combatLog.length > 0) {
        console.log('[CombatScreen] Starting combat with backend log (on-chain mode):', {
          playerHp: combatInput.player.hp,
          playerAtk: combatInput.player.atk,
          enemyName: combatInput.enemy.name,
          enemyHp: combatInput.enemy.hp,
          logEntries: combatInput.combatLog.length,
        });
        startCombatWithLog(resolverInput, combatInput.combatLog);
      } else {
        // Fallback to local resolver if no backend log
        console.log('[CombatScreen] Starting combat (on-chain mode, no backend log):', {
          playerHp: combatInput.player.hp,
          playerAtk: combatInput.player.atk,
          enemyName: combatInput.enemy.name,
          enemyHp: combatInput.enemy.hp,
          enemyAtk: combatInput.enemy.atk,
          seed: combatInput.seed,
          isBossFight: combatInput.isBossFight,
          week: combatInput.week,
          bossId: combatInput.bossId,
        });
        startCombat(resolverInput);
      }
      return;
    }

    // Guest mode: use combat state from GameContext
    if (gameState?.combat) {
      console.log('[CombatScreen] Starting combat (guest mode):', {
        playerHp: gameState.combat.player.hp,
        enemyName: gameState.combat.enemy.name,
        enemyHp: gameState.combat.enemy.hp,
        seed: gameState.rngState,
      });
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
  }, [
    combatInput,
    gameState?.combat,
    combatState.combat,
    startCombat,
    startCombatWithLog,
    gameState?.rngState,
  ]);

  // Handle combat completion - now uses deferred cleanup for instant navigation
  const handleCombatComplete = useCallback(async () => {
    const result = getResult();
    if (!result) return;

    const isVictory = result === 'VICTORY';
    const levelReached = profile?.currentLevel ?? 0;
    const isFinalWeekBoss = isBossFight && currentWeek === 3;
    const isOnChainMode = mode !== 'guest' && combatInput !== undefined;

    console.log('[CombatScreen] Combat complete:', {
      result,
      isVictory,
      isBossFight,
      currentWeek,
      isFinalWeekBoss,
      isOnChainMode,
      levelReached,
      goldReward: combatState.resolvedCombat?.goldReward,
      playerFinalHp: combatState.resolvedCombat?.player.hp,
      enemyFinalHp: combatState.resolvedCombat?.enemy.hp,
    });

    // Stop the auto-commit timer
    stopAutoCommit();

    // For defeat or final week boss victory: end session immediately
    // For regular victory or non-final boss victory: no cleanup needed, continue playing
    const shouldEndSession = !isVictory || isFinalWeekBoss;

    if (shouldEndSession && hasActiveSession && mode !== 'guest') {
      console.log('[CombatScreen] Ending session (shouldEndSession:', shouldEndSession, ')');
      // End session immediately with burner wallet (no user interaction needed)
      // The on-chain program validates game_state.is_dead or game_state.completed
      const endResult = await endSessionWithBurner();
      if (!endResult.success) {
        console.warn('[CombatScreen] Failed to end session:', endResult.error);
        // Continue anyway - navigation should still happen
      }
    }

    // Note: Run result recording is now handled via CPI in end_session
    // No need to call recordRunResult separately - it's done on-chain

    // Update local game state - ONLY for guest mode
    // In on-chain mode, state was already synced via SYNC_MOVE before navigation to CombatScreen
    // Dispatching RESOLVE_COMBAT in on-chain mode would overwrite the on-chain synced HP with
    // the local combat replay result, causing HP desync (e.g., on-chain HP=4 but displays HP=10)
    if (!isOnChainMode) {
      console.log('[CombatScreen] Guest mode: Dispatching RESOLVE_COMBAT with result:', result);
      gameDispatch({
        type: 'RESOLVE_COMBAT',
        result,
        combat: combatState.resolvedCombat ?? undefined,
      });
    } else {
      console.log('[CombatScreen] On-chain mode: Skipping RESOLVE_COMBAT (state already synced)');
    }

    // Navigate based on result
    if (result === 'DEFEAT') {
      // Defeat: show death screen with combat replay info
      console.log('[CombatScreen] Navigating to DeathScreen (defeat)');
      navigation.replace('Death', {
        totalMoves: gameState?.time.movesRemaining,
        level: levelReached,
        week: currentWeek,
        killedBy: combatState.resolvedCombat?.enemy.name,
      });
    } else if (isFinalWeekBoss) {
      // Final week boss victory: show victory screen
      console.log('[CombatScreen] Navigating to Victory screen (final week boss victory)');
      navigation.replace('Victory', {
        level: levelReached,
        totalMoves: gameState?.time.movesRemaining,
      });
    } else {
      // Victory (regular enemy or non-final boss): return to map
      console.log('[CombatScreen] Navigating back to map (victory)');
      navigation.goBack();
    }
  }, [
    getResult,
    gameDispatch,
    navigation,
    isBossFight,
    currentWeek,
    gameState?.time.movesRemaining,
    profile,
    mode,
    combatInput,
    stopAutoCommit,
    hasActiveSession,
    endSessionWithBurner,
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
              isFinalVictory={result === 'VICTORY' && isBossFight && currentWeek === 3}
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
