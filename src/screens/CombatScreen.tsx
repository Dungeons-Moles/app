/**
 * T058/T128: CombatScreen with combat resolution and navigation
 * Container for combat gameplay with arena, panels, and result display
 * Layout: Enemy (left) - Arena (center) - Player (right)
 * @see specs/001-pve-dungeon-crawler/spec.md User Story 2, FR-048, FR-049
 */

import React, { useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { useGame, GamePhase } from '../contexts/GameContext';
import { CombatProvider, useCombat } from '../contexts/CombatContext';
import { useLandscapeLock } from '../hooks/useOrientationLock';
import {
  CombatArena,
  VictoryDefeatDisplay,
  EnemyPanel,
  PlayerPanel,
} from '../components/combat';
import { DebugOverlay } from '../components/game';

type CombatScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Combat'>;
};

const SAFE_AREA_EDGES = ['left', 'right'] as const;

/**
 * CombatScreen - Container for combat gameplay
 * Displays the combat arena, player/enemy panels, and combat log in landscape orientation
 */
export function CombatScreen({ navigation }: CombatScreenProps) {
  return (
    <CombatProvider>
      <CombatScreenContent navigation={navigation} />
    </CombatProvider>
  );
}

function CombatScreenContent({ navigation }: CombatScreenProps) {
  const { state: gameState, dispatch: gameDispatch } = useGame();
  const {
    state: combatState,
    dispatch: combatDispatch,
    startCombat,
    getDisplayStates,
    getResult,
  } = useCombat();

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
      });
    }
  }, [gameState?.combat, combatState.combat, startCombat, gameState?.rngState]);

  // Auto-advance through combat log for animation
  useEffect(() => {
    if (!combatState.resolvedCombat || combatState.isComplete) return;

    const logLength = combatState.resolvedCombat.log.length;
    if (combatState.currentLogIndex >= logLength - 1) {
      combatDispatch({ type: 'COMPLETE_ANIMATION' });
      return;
    }

    const timer = setTimeout(() => {
      combatDispatch({ type: 'ADVANCE_LOG', index: combatState.currentLogIndex + 1 });
    }, 450);

    return () => clearTimeout(timer);
  }, [combatState.currentLogIndex, combatState.resolvedCombat, combatState.isComplete, combatDispatch]);

  // Handle combat completion
  const handleCombatComplete = useCallback(() => {
    const result = getResult();
    if (!result) return;

    gameDispatch({ type: 'RESOLVE_COMBAT', result, combat: combatState.resolvedCombat ?? undefined });

    if (result === 'DEFEAT') {
      navigation.replace('Hub');
    } else {
      navigation.goBack();
    }
  }, [getResult, gameDispatch, navigation]);

  const { player, enemy } = getDisplayStates();
  const result = getResult();
  const basePlayerArm = combatState.combat
    ? combatState.combat.player.arm + combatState.combat.player.bonusArm
    : player?.arm ?? 0;
  const baseEnemyArm = combatState.combat
    ? combatState.combat.enemy.arm + combatState.combat.enemy.bonusArm
    : enemy?.arm ?? 0;
  const playerMaxArm = player ? Math.max(basePlayerArm, player.arm) : 0;
  const enemyMaxArm = enemy ? Math.max(baseEnemyArm, enemy.arm) : 0;

  // Note: Enemy traits are currently not available in CombatantState
  // This would need to be looked up from enemy definitions if needed
  const enemyTrait = undefined;

  // Extract player equipment for display
  const playerEquipment = useMemo(() => {
    if (!gameState?.player) return { tool: null, gear: [] };
    return {
      tool: gameState.player.equippedTool,
      gear: gameState.player.inventory.map((slot) => slot.item),
    };
  }, [gameState?.player]);

  // Show loading if no combat state
  if (!player || !enemy) {
    return (
      <SafeAreaView style={styles.container} edges={SAFE_AREA_EDGES}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Preparing combat...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={SAFE_AREA_EDGES}>
      <View style={styles.content}>
        {/* Enemy Panel (LEFT) - FR-048 */}
        <View style={styles.sidePanel}>
          <EnemyPanel
            name={enemy.name}
            emoji={enemy.emoji}
            hp={enemy.hp}
            maxHp={enemy.maxHp}
            atk={enemy.atk}
            arm={enemy.arm}
            maxArm={enemyMaxArm}
            spd={enemy.spd}
            statusEffects={enemy.statusEffects}
            trait={enemyTrait}
          />
        </View>

        {/* Combat Arena (CENTER) */}
        <View style={styles.arenaArea}>
          <CombatArena
            player={player}
            enemy={enemy}
            damageNumbers={combatState.damageNumbers}
            isAnimating={combatState.isAnimating}
          />

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
        <View style={styles.sidePanel}>
          <PlayerPanel
            name={player.name}
            emoji={player.emoji}
            hp={player.hp}
            maxHp={player.maxHp}
            atk={player.atk}
            arm={player.arm}
            maxArm={playerMaxArm}
            spd={player.spd}
            statusEffects={player.statusEffects}
            equippedTool={playerEquipment.tool}
            equippedGear={playerEquipment.gear}
          />
        </View>
      </View>

      {/* Victory/Defeat Overlay */}
      {combatState.isComplete && result && (
        <VictoryDefeatDisplay
          result={result}
          onComplete={handleCombatComplete}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
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
    fontSize: 16,
    color: '#888888',
  },
  sidePanel: {
    flex: 1,
    backgroundColor: '#151518',
    borderColor: '#2a2a30',
    borderWidth: 1,
  },
  arenaArea: {
    flex: 2,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
});
