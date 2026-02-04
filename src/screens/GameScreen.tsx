/**
 * GameScreen - Main exploration gameplay screen
 */

import React, { useCallback, useMemo, useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, ImageBackground, Image, Pressable } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { RootStackParamList, CombatParams } from '../navigation';
import { useGame, GamePhase } from '../contexts/GameContext';
import { useSession } from '../contexts/SessionContext';
import { useProfile } from '../contexts/ProfileContext';
import { useGameplayStateContext } from '../contexts/GameplayStateContext';
import { useWallet } from '../contexts/WalletContext';
import { deriveSessionPda } from '../services/solana/constants';
import { useNightMovement } from '../hooks/useNightMovement';
import { usePoiInteraction } from '../hooks/usePoiInteraction';
import { useFogPersistence } from '../hooks/useFogPersistence';
import { DPadControls } from '../components/game/DPadControls';
import {
  TopBar,
  GameCanvas,
  DebugOverlay,
  POIModal,
  FastTravelOverlay,
  ItemTooltip,
} from '../components/game';
import { Sidebar } from '../components/game/Sidebar';
import { BurnerBalanceIndicator } from '../components/common/BurnerBalanceIndicator';
import { useDirectionInput } from '../hooks/useInput';
import { useLandscapeLock } from '../hooks/useOrientationLock';
import { Direction, DIRECTION_DELTA } from '../game/input/types';
import { TileType, MapEnemy } from '../game/map/types';
import { canFastTravel, getDiscoveredWaypoints } from '../game/entities/pois';
import { canAffordCostAcrossPhases } from '../game/time/progression';
import { Typography } from '../theme/typography';
import { promptTransactionRetry } from '../utils/transaction-alerts';
import type { Gear, GearId, Tool, CombatantState } from '../game/engine/types';
import type { BackendCombatLogEntry } from '../services/solana/types/combat_events';
import { ENEMY_DEFINITIONS, calculateGoldReward } from '../game/entities/enemies';
import { BOSSES } from '../data/bosses';
import type { BossId } from '../game/engine/types';
import Svg, { Path } from 'react-native-svg';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');
const COIN_ICON = require('../../assets/icons/ui/coin.png');
const MAP_ICON = require('../../assets/icons/ui/map.png');

const SIDEBAR_WIDTH = 230;
const NAVBAR_HEIGHT = 60;

/**
 * Create combat params for CombatScreen from local game state and enemy data
 */
function createCombatParams(
  enemy: MapEnemy,
  playerStats: {
    hp: number;
    maxHp: number;
    atk: number;
    arm: number;
    spd: number;
    dig: number;
    gold: number;
  },
  playerGear: Gear[],
  playerTool: Tool | null,
  activeItemsets: string[],
  seed: number,
  week: 1 | 2 | 3,
  combatLog?: BackendCombatLogEntry[]
): CombatParams {
  const enemyDef = ENEMY_DEFINITIONS[enemy.definitionId];
  const tierStats = enemyDef.tiers[enemy.tier - 1];

  const playerCombatant: CombatantState = {
    name: 'Player',
    emoji: '🧑‍🔧',
    definitionId: 'player',
    isPlayer: true,
    maxHp: playerStats.maxHp,
    hp: playerStats.hp,
    atk: playerStats.atk,
    arm: playerStats.arm,
    spd: playerStats.spd,
    dig: playerStats.dig,
    bonusAtk: 0,
    bonusArm: 0,
    bonusSpd: 0,
    statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
    strikesPerTurn: 1,
    ignoresArmor: false,
  };

  const enemyCombatant: CombatantState = {
    name: enemyDef.name,
    emoji: enemyDef.emoji,
    definitionId: enemy.definitionId,
    isPlayer: false,
    maxHp: tierStats.hp,
    hp: tierStats.hp,
    atk: tierStats.atk,
    arm: tierStats.arm,
    spd: tierStats.spd,
    dig: tierStats.dig,
    bonusAtk: 0,
    bonusArm: 0,
    bonusSpd: 0,
    statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
    strikesPerTurn: 1,
    ignoresArmor: false,
  };

  return {
    player: playerCombatant,
    enemy: enemyCombatant,
    seed,
    enemyId: enemy.definitionId,
    enemyDefinitionId: enemy.definitionId,
    enemyTier: enemy.tier,
    goldReward: calculateGoldReward(enemy.definitionId, enemy.tier),
    activeItemSets: activeItemsets as any[],
    playerGear,
    playerTool,
    playerGold: playerStats.gold,
    week,
    isBossFight: false,
    combatLog,
  };
}

/**
 * Create combat params for boss fight
 */
function createBossCombatParams(
  bossId: BossId,
  playerStats: {
    hp: number;
    maxHp: number;
    atk: number;
    arm: number;
    spd: number;
    dig: number;
    gold: number;
  },
  playerGear: Gear[],
  playerTool: Tool | null,
  activeItemsets: string[],
  seed: number,
  week: 1 | 2 | 3,
  combatLog?: BackendCombatLogEntry[]
): CombatParams {
  const bossDef = BOSSES[bossId];
  if (!bossDef) {
    throw new Error(`Boss definition not found for ID: ${bossId}`);
  }

  const playerCombatant: CombatantState = {
    name: 'Player',
    emoji: '🧑‍🔧',
    definitionId: 'player',
    isPlayer: true,
    maxHp: playerStats.maxHp,
    hp: playerStats.hp,
    atk: playerStats.atk,
    arm: playerStats.arm,
    spd: playerStats.spd,
    dig: playerStats.dig,
    bonusAtk: 0,
    bonusArm: 0,
    bonusSpd: 0,
    statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
    strikesPerTurn: 1,
    ignoresArmor: false,
  };

  const bossCombatant: CombatantState = {
    name: bossDef.name,
    emoji: bossDef.emoji,
    definitionId: bossId,
    isPlayer: false,
    maxHp: bossDef.stats.hp,
    hp: bossDef.stats.hp,
    atk: bossDef.stats.atk,
    arm: bossDef.stats.arm,
    spd: bossDef.stats.spd,
    dig: bossDef.stats.dig,
    bonusAtk: 0,
    bonusArm: 0,
    bonusSpd: 0,
    statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
    strikesPerTurn: 1,
    ignoresArmor: false,
  };

  return {
    player: playerCombatant,
    enemy: bossCombatant,
    seed,
    bossId,
    goldReward: 0, // Bosses don't give gold directly
    activeItemSets: activeItemsets as any[],
    playerGear,
    playerTool,
    playerGold: playerStats.gold,
    week,
    isBossFight: true,
    combatLog,
  };
}

function ThinSeparator({ horizontal = true }: { horizontal?: boolean }) {
  if (horizontal) {
    return (
      <View style={styles.hSeparator}>
        <Svg height="6" width="100%" preserveAspectRatio="none" viewBox="0 0 100 6">
          <Path d="M 0 3 C 20 1, 80 1, 100 3 C 80 5, 20 5, 0 3" fill="black" />
        </Svg>
      </View>
    );
  }
  return (
    <View style={styles.vSeparator}>
      <Svg height="100%" width="6" preserveAspectRatio="none" viewBox="0 0 6 100">
        <Path d="M 3 0 C 1 20, 1 80, 3 100 C 5 80, 5 20, 3 0" fill="black" />
      </Svg>
    </View>
  );
}

function CrossingLines() {
  return (
    <View style={styles.linesOverlay} pointerEvents="none">
      <View style={styles.hLineContainer}>
        <ThinSeparator horizontal={true} />
      </View>
      <View style={styles.vLineContainer}>
        <ThinSeparator horizontal={false} />
      </View>
    </View>
  );
}

type GameScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Game'>;
};

export function GameScreen({ navigation }: GameScreenProps) {
  const { state, dispatch, overviewMode, toggleOverviewMode, panOverview, zoomOverview } =
    useGame();
  const { mode } = useProfile();
  const {
    hasActiveSession,
    movePlayer,
    gameplayState: onChainState,
    gameplaySyncStatus,
    sessionKey,
    burnerBalance,
    isBurnerLowBalance,
    topUpBurner,
    currentLevel,
    forceAbandonCurrentSession,
  } = useSession();
  const { wallet } = useWallet();
  const { refreshMapEntities } = useGameplayStateContext();
  const nightMovement = useNightMovement();
  const poiInteraction = usePoiInteraction();
  const isFocused = useIsFocused();

  // Derive session PDA for refreshing map entities after moves
  const sessionPda = useMemo(() => {
    if (!wallet.publicKey || currentLevel === null) return null;
    const [pda] = deriveSessionPda(wallet.publicKey, currentLevel);
    return pda;
  }, [wallet.publicKey, currentLevel]);

  // Persist fog of war state to AsyncStorage for session restore
  useFogPersistence({
    sessionKey,
    fog: state?.map.fog ?? null,
    isActive: hasActiveSession,
  });
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [wallBreakFeedback, setWallBreakFeedback] = useState<string | null>(null);
  const [isMovePending, setIsMovePending] = useState(false);
  const [isExitingSession, setIsExitingSession] = useState(false);
  // Use a ref for synchronous pending check to prevent race conditions with rapid clicks
  const isMovePendingRef = useRef(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  // Ref to skip mismatch-detection after POI interactions (updated synchronously)
  const skipMismatchDetectionRef = useRef(false);
  const skipMismatchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
  }, []);

  // Cleanup skip mismatch timeout on unmount
  useEffect(() => {
    return () => {
      if (skipMismatchTimeoutRef.current) {
        clearTimeout(skipMismatchTimeoutRef.current);
      }
    };
  }, []);

  // On-chain state drift correction: periodically sync local state from on-chain.
  // This catches any drift from missed events or reconnection scenarios.
  // With on-chain-first movement, this should rarely trigger during normal play.
  useEffect(() => {
    if (
      !state ||
      !onChainState ||
      mode === 'guest' ||
      gameplaySyncStatus !== 'synced' ||
      state.phase !== GamePhase.Exploration ||
      isMovePending ||
      // Skip when screen isn't focused (e.g., during CombatScreen)
      // Prevents stale onChainState from overwriting correct HP after combat
      !isFocused ||
      // Skip during/after POI interactions - the hook handles its own state sync
      // Use ref for synchronous check (state-based checks have timing issues)
      skipMismatchDetectionRef.current ||
      poiInteraction.isInteracting
    ) {
      return;
    }

    // Compare baseStats.hp (not stats.hp) because on-chain stores base HP only,
    // while stats.hp includes gear bonuses (e.g., Work Vest +4 HP).
    // Using stats.hp would cause constant mismatch when +HP gear is equipped.
    const hasMismatch =
      state.player.position.x !== onChainState.positionX ||
      state.player.position.y !== onChainState.positionY ||
      // Compare stats.hp (includes gear bonuses) with on-chain HP (also includes gear bonuses)
      // Don't compare baseStats.hp which is the raw base HP without gear
      state.player.stats.hp !== onChainState.hp ||
      state.time.movesRemaining !== onChainState.movesRemaining;

    if (hasMismatch) {
      console.log('[GameScreen] Mismatch detected, syncing:', {
        localHp: state.player.stats.hp,
        onChainHp: onChainState.hp,
        localPos: state.player.position,
        onChainPos: { x: onChainState.positionX, y: onChainState.positionY },
      });
      dispatch({ type: 'SYNC_MOVE', confirmedState: onChainState });
    }
  }, [
    dispatch,
    gameplaySyncStatus,
    mode,
    onChainState,
    state,
    isMovePending,
    isFocused,
    poiInteraction.isInteracting,
  ]);

  const showWallBreakFeedback = useCallback((message: string) => {
    if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
    setWallBreakFeedback(message);
    feedbackTimeout.current = setTimeout(() => {
      setWallBreakFeedback(null);
      feedbackTimeout.current = null;
    }, 3500);
  }, []);

  // Debug: Exit session handler for quick testing
  const handleDebugExitSession = useCallback(async () => {
    if (isExitingSession) return;
    setIsExitingSession(true);
    try {
      console.log('[GameScreen] Debug: Force abandoning session...');
      const result = await forceAbandonCurrentSession();
      if (result.success) {
        console.log('[GameScreen] Debug: Session abandoned successfully');
        navigation.replace('Hub');
      } else {
        console.error('[GameScreen] Debug: Failed to abandon session:', result.error);
        showWallBreakFeedback(result.error || 'Failed to exit session');
      }
    } catch (error) {
      console.error('[GameScreen] Debug: Error abandoning session:', error);
      showWallBreakFeedback('Error exiting session');
    } finally {
      setIsExitingSession(false);
    }
  }, [isExitingSession, forceAbandonCurrentSession, navigation, showWallBreakFeedback]);

  const discoveredWaypoints = useMemo(
    () => (state ? getDiscoveredWaypoints(state.map) : []),
    [state?.map]
  );
  const fastTravelAvailable = useMemo(
    () => state?.phase === GamePhase.Exploration && canFastTravel(state.map),
    [state?.map, state?.phase]
  );

  useLandscapeLock();

  const handleDirection = useCallback(
    (direction: Direction) => {
      console.log(
        '[GameScreen] handleDirection called:',
        direction,
        '| mode:',
        mode,
        '| hasActiveSession:',
        hasActiveSession,
        '| phase:',
        state?.phase,
        '| isMovePending:',
        isMovePendingRef.current
      );
      // Use ref for synchronous check to prevent race conditions with rapid clicks
      if (
        !state ||
        state.phase !== GamePhase.Exploration ||
        overviewMode.active ||
        state.fastTravel?.active ||
        isMovePendingRef.current
      )
        return;

      const delta = DIRECTION_DELTA[direction];
      const targetPos = {
        x: state.player.position.x + delta.x,
        y: state.player.position.y + delta.y,
      };
      const inBounds =
        targetPos.x >= 0 &&
        targetPos.x < state.map.width &&
        targetPos.y >= 0 &&
        targetPos.y < state.map.height;

      if (!inBounds) return;

      // Guest mode: use local reducer (preserves offline play)
      if (mode === 'guest' || !hasActiveSession) {
        console.log('[GameScreen] Using local MOVE (guest or no session)');
        dispatch({ type: 'MOVE', direction });
        return;
      }
      console.log('[GameScreen] Using on-chain move path');

      // On-chain mode: validate locally first, then send on-chain
      const isWall = state.map.tiles[targetPos.y][targetPos.x] === TileType.Wall;
      if (isWall) {
        const isHighlighted =
          state.wallHighlight &&
          state.wallHighlight.direction === direction &&
          state.wallHighlight.targetPosition.x === targetPos.x &&
          state.wallHighlight.targetPosition.y === targetPos.y;

        if (!isHighlighted) {
          // First tap on wall: show highlight (local only, no transaction)
          dispatch({ type: 'MOVE', direction });
          if (state.player.stats.dig < 1) showWallBreakFeedback('Requires DIG to break walls');
          return;
        }

        // Second tap on highlighted wall: check cost before sending
        if (
          state.wallHighlight &&
          !canAffordCostAcrossPhases(state.time, state.wallHighlight.cost)
        ) {
          showWallBreakFeedback(`Not enough moves (need ${state.wallHighlight.cost})`);
          return;
        }
      }

      // On-chain-first: send transaction, await confirmation, then sync local state
      isMovePendingRef.current = true;
      setIsMovePending(true);
      console.log('[GameScreen] Sending on-chain move to', targetPos.x, targetPos.y);

      // Store pre-combat state for potential combat replay
      // Note: HP/gold are captured inside .then() from result.previousState (on-chain truth)
      // to avoid desync where local React state is stale. Gear/tool are captured here
      // since they don't change during move.
      const preCombatGear = state.player.inventory.map((slot) => slot.item);
      const preCombatTool = state.player.equippedTool;
      const preCombatItemsets = state.player.activeItemsets ?? [];
      const preCombatSeed = state.rngState;
      const currentWeek = state.time.week;

      // Find enemy at target position (for combat replay)
      const enemyAtTarget = state.map.enemies.find(
        (e) => e.position.x === targetPos.x && e.position.y === targetPos.y
      );

      movePlayer({ targetX: targetPos.x, targetY: targetPos.y })
        .then((result) => {
          console.log(
            '[GameScreen] movePlayer result:',
            JSON.stringify({
              success: result.success,
              hasNewState: !!result.newState,
              combatOccurred: result.combatOccurred,
              isDead: result.isDead,
            })
          );
          if (!result.success) {
            showWallBreakFeedback('Movement failed on-chain');
            void promptTransactionRetry({
              title: 'Movement Failed',
              message: 'The on-chain transaction failed.',
            }).then((shouldRetry) => {
              if (shouldRetry) {
                // Retry the same move
                isMovePendingRef.current = true;
                setIsMovePending(true);
                movePlayer({ targetX: targetPos.x, targetY: targetPos.y })
                  .then((retryResult) => {
                    if (retryResult.success && retryResult.newState) {
                      dispatch({ type: 'SYNC_MOVE', confirmedState: retryResult.newState });
                    }
                  })
                  .finally(() => {
                    isMovePendingRef.current = false;
                    setIsMovePending(false);
                  });
              }
            });
            return;
          }

          if (result.newState) {
            // Update local state from confirmed on-chain state
            dispatch({ type: 'SYNC_MOVE', confirmedState: result.newState });

            // Refresh map entities (enemies/POIs) to get updated positions
            // During night phases, enemies move toward the player after each player move
            // Only sync enemy positions during night when enemies actually move
            const isNightPhase =
              result.newState.phase === 1 || // Night1
              result.newState.phase === 3 || // Night2
              result.newState.phase === 5; // Night3

            if (sessionPda && isNightPhase) {
              refreshMapEntities(sessionPda)
                .then((data) => {
                  if (data?.enemies && data.enemies.length > 0) {
                    console.log(
                      '[GameScreen] Syncing enemy positions, count:',
                      data.enemies.length
                    );
                    // Sync enemy positions from on-chain to local game state
                    dispatch({ type: 'SYNC_ENEMY_POSITIONS', enemies: data.enemies });
                  }
                })
                .catch((err) =>
                  console.warn('[GameScreen] Failed to refresh map entities after move:', err)
                );
            }

            // Build preCombatPlayerStats from a mix of on-chain and local state:
            // - HP and Gold: from on-chain previousState (authoritative for these values)
            // - ATK, ARM, SPD, DIG, MaxHP: from local state (on-chain doesn't store these,
            //   they're derived from PlayerInventory and calculated client-side)
            const preCombatPlayerStats = result.previousState
              ? {
                  // HP from on-chain is authoritative
                  hp: result.previousState.hp,
                  // Gold from on-chain is authoritative
                  gold: result.previousState.gold,
                  // Stats derived from gear - use local state which has calculated bonuses
                  // On-chain returns defaults (ATK=1, ARM=0) since it doesn't store these
                  maxHp: state.player.stats.maxHp,
                  atk: state.player.stats.atk,
                  arm: state.player.stats.arm,
                  spd: state.player.stats.spd,
                  dig: state.player.stats.dig,
                }
              : {
                  // Fallback to local state if previousState unavailable (shouldn't happen)
                  hp: state.player.stats.hp,
                  maxHp: state.player.stats.maxHp,
                  atk: state.player.stats.atk,
                  arm: state.player.stats.arm,
                  spd: state.player.stats.spd,
                  dig: state.player.stats.dig,
                  gold: state.player.stats.gold,
                };

            // Handle combat - always go through CombatScreen for visualization
            // This includes deaths from combat (CombatScreen will navigate to DeathScreen)
            if (result.combatOccurred) {
              // Find enemy - check both target position and player's current position
              // During night, enemies move toward player, so combat might occur at player's position
              let combatEnemy = enemyAtTarget;
              if (!combatEnemy) {
                // Check for enemy at player's current position (night combat)
                combatEnemy = state.map.enemies.find(
                  (e) =>
                    e.position.x === state.player.position.x &&
                    e.position.y === state.player.position.y
                );
                if (combatEnemy) {
                  console.log(
                    '[GameScreen] Found enemy at player position (night combat):',
                    combatEnemy.definitionId
                  );
                }
              }

              if (combatEnemy) {
                // Combat was resolved on-chain during move_player.
                // Navigate to CombatScreen to show combat replay.
                console.log('[GameScreen] Combat occurred with enemy:', {
                  enemyId: combatEnemy.definitionId,
                  enemyTier: combatEnemy.tier,
                  enemyPosition: combatEnemy.position,
                  preCombatPlayerHp: preCombatPlayerStats.hp,
                  postCombatPlayerHp: result.newState.hp,
                  goldBefore: preCombatPlayerStats.gold,
                  goldAfter: result.newState.gold,
                  playerDied: result.isDead,
                });
                const combatParams = createCombatParams(
                  combatEnemy,
                  preCombatPlayerStats,
                  preCombatGear,
                  preCombatTool,
                  preCombatItemsets,
                  preCombatSeed,
                  currentWeek,
                  result.combatLog
                );
                console.log('[GameScreen] Navigating to CombatScreen with params:', {
                  playerHp: combatParams.player.hp,
                  playerAtk: combatParams.player.atk,
                  enemyName: combatParams.enemy.name,
                  enemyHp: combatParams.enemy.hp,
                  seed: combatParams.seed,
                  week: combatParams.week,
                  isBossFight: combatParams.isBossFight,
                  playerDied: result.isDead,
                  hasCombatLog: !!result.combatLog,
                  combatLogLength: result.combatLog?.length ?? 0,
                });
                navigation.navigate('Combat', { combatInput: combatParams });
              } else {
                // Combat occurred but couldn't find enemy - this shouldn't happen
                // Log error for debugging, but we must still show combat
                console.error(
                  '[GameScreen] Combat occurred but no enemy found at target or player position!',
                  {
                    targetPos: targetPos,
                    playerPos: state.player.position,
                    enemyCount: state.map.enemies.length,
                    isDead: result.isDead,
                  }
                );
                // If player died, at least navigate to death screen
                if (result.isDead) {
                  navigation.navigate('Death', {
                    totalMoves: result.newState.totalMoves,
                    level: result.newState.campaignLevel,
                    week: result.newState.week,
                    killedBy: 'Unknown enemy',
                  });
                }
              }
            } else if (result.isDead) {
              // Non-combat death (shouldn't normally happen, but handle edge case)
              console.log('[GameScreen] Player died (non-combat), navigating to DeathScreen');
              navigation.navigate('Death', {
                totalMoves: result.newState.totalMoves,
                level: result.newState.campaignLevel,
                week: result.newState.week,
              });
            } else if (result.bossFightReady) {
              // Boss fight ready — create combat params and navigate to Combat.
              // Use the week boss from time state
              const weekBoss = state.time.weekBoss;
              console.log(
                '[GameScreen] Boss fight ready, weekBoss:',
                weekBoss,
                'week:',
                currentWeek
              );
              if (weekBoss) {
                const bossCombatParams = createBossCombatParams(
                  weekBoss,
                  preCombatPlayerStats,
                  preCombatGear,
                  preCombatTool,
                  preCombatItemsets,
                  preCombatSeed,
                  currentWeek
                );
                console.log('[GameScreen] Navigating to CombatScreen for boss fight:', {
                  bossId: weekBoss,
                  bossName: bossCombatParams.enemy.name,
                  bossHp: bossCombatParams.enemy.hp,
                  playerHp: bossCombatParams.player.hp,
                  week: currentWeek,
                  isFinalWeek: currentWeek === 3,
                });
                navigation.navigate('Combat', { combatInput: bossCombatParams });
              } else {
                // Fallback to local boss fight handling if no weekBoss defined
                console.log('[GameScreen] No weekBoss defined, using local boss fight handling');
                dispatch({ type: 'TRIGGER_BOSS' });
              }
            }
          }
        })
        .catch((err) => {
          console.error('[GameScreen] movePlayer error:', err);
          showWallBreakFeedback('Movement sync error');
        })
        .finally(() => {
          isMovePendingRef.current = false;
          setIsMovePending(false);
        });
    },
    [
      dispatch,
      overviewMode.active,
      showWallBreakFeedback,
      state,
      mode,
      hasActiveSession,
      movePlayer,
      isMovePending,
      navigation,
      sessionPda,
      refreshMapEntities,
    ]
  );

  useDirectionInput(handleDirection, {
    enabled: state?.phase === GamePhase.Exploration && !state.fastTravel?.active,
    blocked: overviewMode.active || Boolean(state?.fastTravel?.active),
  });

  const disabledDirections = useMemo(() => {
    if (!state) return [];
    if (overviewMode.active || state.fastTravel?.active)
      return [Direction.Up, Direction.Down, Direction.Left, Direction.Right];
    const disabled: Direction[] = [];
    const { x, y } = state.player.position;
    const directions = [
      { dir: Direction.Up, dx: 0, dy: -1 },
      { dir: Direction.Down, dx: 0, dy: 1 },
      { dir: Direction.Left, dx: -1, dy: 0 },
      { dir: Direction.Right, dx: 1, dy: 0 },
    ];
    for (const { dir, dx, dy } of directions) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= state.map.width || ny < 0 || ny >= state.map.height) disabled.push(dir);
    }
    return disabled;
  }, [state, overviewMode.active]);

  // Navigate to CombatScreen when game phase transitions to Combat or BossFight.
  // In on-chain mode, combat navigation is handled directly by handleDirection.
  // This effect only applies to guest mode where the local reducer triggers combat.
  useEffect(() => {
    if (
      mode === 'guest' &&
      (state?.phase === GamePhase.Combat || state?.phase === GamePhase.BossFight)
    ) {
      navigation.navigate('Combat');
    }
  }, [state?.phase, navigation, mode]);

  // Auto-trigger POI interaction when player moves onto a POI
  // Track position to only trigger on actual position changes
  // Uses shouldAutoOpen instead of canInteract to skip auto-open for POIs with unmet preconditions
  // (e.g., inventory full for pick-item POIs, already has oil for Tool Oil Rack)
  const prevPositionRef = useRef<{ x: number; y: number } | null>(null);
  // Track last auto-triggered position to prevent re-triggering when modal closes
  const lastAutoTriggeredPosRef = useRef<{ x: number; y: number } | null>(null);

  // Extract stable values from poiInteraction to avoid re-triggering on every hook state change
  const { shouldAutoOpen, isInteracting, interact: poiInteract } = poiInteraction;

  useEffect(() => {
    if (!state?.player?.position || state.phase !== GamePhase.Exploration) return;
    const currentPos = state.player.position;
    const prevPos = prevPositionRef.current;
    const lastAutoPos = lastAutoTriggeredPosRef.current;

    // Only trigger if position actually changed and POI should auto-open
    // Also prevent re-triggering at the same position after modal close
    const positionChanged = prevPos && (prevPos.x !== currentPos.x || prevPos.y !== currentPos.y);
    const alreadyTriggeredHere =
      lastAutoPos && lastAutoPos.x === currentPos.x && lastAutoPos.y === currentPos.y;

    if (positionChanged && shouldAutoOpen && !isInteracting && !alreadyTriggeredHere) {
      console.log('[GameScreen] Auto-triggering POI interaction at', currentPos.x, currentPos.y);
      lastAutoTriggeredPosRef.current = { x: currentPos.x, y: currentPos.y };
      poiInteract();
    }

    // Clear last auto-triggered position when player moves away from it
    if (lastAutoPos && (lastAutoPos.x !== currentPos.x || lastAutoPos.y !== currentPos.y)) {
      lastAutoTriggeredPosRef.current = null;
    }

    prevPositionRef.current = { x: currentPos.x, y: currentPos.y };
  }, [state?.player?.position, state?.phase, shouldAutoOpen, isInteracting, poiInteract]);

  const handlePOIClose = useCallback(() => {
    setKilnSelection({ gearId: null, emoji: '', count: 0 });
    setScrapSelection(null);
    poiInteraction.clearCacheOffers();
    dispatch({ type: 'CLOSE_POI' });
  }, [dispatch, poiInteraction]);

  const handlePOIOption = useCallback(
    (optionIndex: number) => {
      console.log(
        '[GameScreen] handlePOIOption called | optionIndex:',
        optionIndex,
        '| deferredPoiType:',
        poiInteraction.deferredPoiType,
        '| hasCacheOffers:',
        !!(poiInteraction.cacheOfferOptions && poiInteraction.cacheOfferOptions.length > 0),
        '| cacheOfferCount:',
        poiInteraction.cacheOfferOptions?.length ?? 0
      );
      setKilnSelection({ gearId: null, emoji: '', count: 0 });
      setScrapSelection(null);

      // For deferred-selection POIs (Tool Oil, Scanner, Shop), confirm on-chain
      if (poiInteraction.deferredPoiType !== null) {
        // Skip mismatch-detection during POI interaction to prevent stale state from reverting changes
        skipMismatchDetectionRef.current = true;
        if (skipMismatchTimeoutRef.current) {
          clearTimeout(skipMismatchTimeoutRef.current);
        }

        // Capture item before on-chain call (shop purchases update cacheOfferOptions)
        const selectedItem = poiInteraction.cacheOfferOptions?.[optionIndex]?.item;
        console.log(
          '[GameScreen] handlePOIOption: DEFERRED path | type:',
          poiInteraction.deferredPoiType,
          '| selectedItem:',
          selectedItem?.name ?? 'none'
        );
        poiInteraction.confirmPoiSelection(optionIndex).then((result) => {
          console.log('[GameScreen] confirmPoiSelection result:', result);
          if (result.success) {
            // For shop purchases (keepOpen), add item to local inventory after confirmation
            if (result.keepOpen && selectedItem) {
              console.log(
                '[GameScreen] Adding purchased item to inventory after on-chain confirmation:',
                selectedItem.name
              );
              if ('currentRarity' in selectedItem) {
                dispatch({ type: 'COLLECT_GEAR', gear: selectedItem as Gear });
              } else {
                dispatch({ type: 'EQUIP_TOOL', tool: selectedItem as Tool });
              }
            }
            if (!result.keepOpen) {
              dispatch({ type: 'CLOSE_POI' });
            }
          } else if (result.error) {
            // Close modal and show error as top-center feedback toast
            dispatch({ type: 'CLOSE_POI' });
            showWallBreakFeedback(result.error);
          }
          // Reset skip flag after a delay to allow state to fully propagate
          skipMismatchTimeoutRef.current = setTimeout(() => {
            skipMismatchDetectionRef.current = false;
          }, 1000);
        });
        return;
      }

      // For pick-item POIs with on-chain offers, send on-chain transaction
      if (poiInteraction.cacheOfferOptions && poiInteraction.cacheOfferOptions.length > 0) {
        // Skip mismatch-detection during POI interaction to prevent stale state from reverting changes
        skipMismatchDetectionRef.current = true;
        if (skipMismatchTimeoutRef.current) {
          clearTimeout(skipMismatchTimeoutRef.current);
        }

        // Capture item before on-chain call (selectCacheOffer clears cacheOfferOptions)
        const selectedItem = poiInteraction.cacheOfferOptions[optionIndex]?.item;
        console.log(
          '[GameScreen] handlePOIOption: ON-CHAIN pick-item path | selectedItem:',
          selectedItem?.name ?? 'none'
        );
        poiInteraction.selectCacheOffer(optionIndex).then((result) => {
          console.log('[GameScreen] selectCacheOffer result:', result);
          if (result.success) {
            // Add item to inventory only after blockchain confirmation
            if (selectedItem) {
              console.log(
                '[GameScreen] Adding item to inventory after on-chain confirmation:',
                selectedItem.name
              );
              if ('currentRarity' in selectedItem) {
                dispatch({ type: 'COLLECT_GEAR', gear: selectedItem as Gear });
              } else {
                dispatch({ type: 'EQUIP_TOOL', tool: selectedItem as Tool });
              }
            }
            dispatch({ type: 'CLOSE_POI' });
          } else if (result.error) {
            // Close modal and show error as top-center feedback toast
            dispatch({ type: 'CLOSE_POI' });
            showWallBreakFeedback(result.error);
          }
          // Reset skip flag after a delay to allow state to fully propagate
          skipMismatchTimeoutRef.current = setTimeout(() => {
            skipMismatchDetectionRef.current = false;
          }, 1000);
        });
        return;
      }

      // Default: local-only dispatch for auto-trigger POIs (L1, L5, L8, L10, L11, L14)
      console.log(
        '[GameScreen] handlePOIOption: LOCAL fallback path | activePOI:',
        state?.activePOI?.poi?.definitionId
      );
      dispatch({ type: 'SELECT_POI_OPTION', optionIndex });
    },
    [dispatch, poiInteraction, state?.activePOI?.poi?.definitionId]
  );

  // Override POI interaction options with on-chain cache offers when available
  const effectiveInteraction = useMemo(() => {
    if (!state?.activePOI) return null;
    if (poiInteraction.cacheOfferOptions && poiInteraction.cacheOfferOptions.length > 0) {
      return {
        ...state.activePOI,
        options: poiInteraction.cacheOfferOptions,
      };
    }
    return state.activePOI;
  }, [state?.activePOI, poiInteraction.cacheOfferOptions]);

  const [kilnSelection, setKilnSelection] = useState<{
    gearId: GearId | null;
    emoji: string;
    count: number;
  }>({ gearId: null, emoji: '', count: 0 });
  const [scrapSelection, setScrapSelection] = useState<Gear | null>(null);

  const [inspectedItem, setInspectedItem] = useState<Tool | Gear | null>(null);
  const [isTooltipVisible, setTooltipVisible] = useState(false);

  const handleInspectItem = useCallback((item: Tool | Gear) => {
    setInspectedItem(item);
    setTooltipVisible(true);
  }, []);
  const handleInspectTool = useCallback((tool: Tool) => {
    setInspectedItem(tool);
    setTooltipVisible(true);
  }, []);
  const handleCloseTooltip = useCallback(() => setTooltipVisible(false), []);

  const handleInventoryItemPress = useCallback(
    (item: Tool | Gear) => {
      if (state?.phase !== GamePhase.POIInteraction) return;

      // Rune Kiln (L11) Logic
      if (state.activePOI?.poi.definitionId === 'L11' && 'currentRarity' in item) {
        if (item.currentRarity !== 'COMMON' && item.currentRarity !== 'GILDED') return;
        const availableCount = state.player.inventory.filter(
          (slot) => slot.item.id === item.id
        ).length;
        if (availableCount === 0) return;
        setKilnSelection((prev) => {
          if (!prev.gearId || prev.gearId !== item.id)
            return { gearId: item.id, emoji: item.emoji, count: 1 };
          const maxCount = Math.min(2, availableCount);
          return prev.count < maxCount ? { ...prev, count: prev.count + 1 } : prev;
        });
        return;
      }

      // Scrap Chute (L14) Logic
      if (state.activePOI?.poi.definitionId === 'L14' && 'currentRarity' in item) {
        setScrapSelection(item as Gear);
      }
    },
    [state]
  );

  const kilnFuseOptionIndex = useMemo(() => {
    if (
      state?.activePOI?.poi.definitionId !== 'L11' ||
      !kilnSelection.gearId ||
      kilnSelection.count < 2
    )
      return null;
    const options = state.activePOI.options ?? [];
    const index = options.findIndex(
      (opt) => opt.item && 'currentRarity' in opt.item && opt.item.id === kilnSelection.gearId
    );
    return index >= 0 ? index : null;
  }, [state, kilnSelection]);

  const scrapOptionIndex = useMemo(() => {
    if (state?.activePOI?.poi.definitionId !== 'L14' || !scrapSelection) return null;
    const options = state.activePOI.options ?? [];
    return options.findIndex((opt) => opt.item === scrapSelection);
  }, [state, scrapSelection]);

  const handleKilnSlotPress = useCallback(() => {
    setKilnSelection((prev) => {
      if (!prev.gearId || prev.count === 0) return prev;
      return prev.count - 1 <= 0
        ? { gearId: null, emoji: '', count: 0 }
        : { ...prev, count: prev.count - 1 };
    });
  }, []);

  const handleScrapSlotPress = useCallback(() => {
    setScrapSelection(null);
  }, []);

  const isRuneKilnActive =
    state?.phase === GamePhase.POIInteraction && state.activePOI?.poi.definitionId === 'L11';

  if (!state) {
    return (
      <View style={styles.container}>
        <ImageBackground
          source={BACKGROUND_IMAGE}
          style={styles.backgroundImage}
          resizeMode="cover"
        >
          <View style={styles.darkOverlay}>
            <View style={styles.loading}>
              <Text style={styles.loadingText}>Loading...</Text>
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
          <View style={styles.fullLayout}>
            {/* Top Area */}
            <View style={styles.topRow}>
              <View style={styles.navbarArea}>
                <View style={styles.navbarLeft}>
                  <Pressable style={styles.mapToggleButton} onPress={toggleOverviewMode}>
                    <Image source={MAP_ICON} style={styles.mapIcon} resizeMode="contain" />
                  </Pressable>
                  {mode !== 'guest' && hasActiveSession && (
                    <Pressable onPress={() => topUpBurner()}>
                      <BurnerBalanceIndicator
                        balance={burnerBalance}
                        isLowBalance={isBurnerLowBalance}
                        compact
                      />
                    </Pressable>
                  )}
                </View>
                <View style={styles.navbarCenter}>
                  <Text style={styles.weekText}>Week {state.time.week}</Text>
                  <TopBar time={state.time} />
                </View>
                <View style={styles.navbarRight}>
                  <View style={styles.goldDisplay}>
                    <Image source={COIN_ICON} style={styles.coinIcon} resizeMode="contain" />
                    <Text style={styles.goldValue}>{state.player.stats.gold}</Text>
                  </View>
                  {/* Debug: Exit session button for quick testing */}
                  {__DEV__ && mode !== 'guest' && hasActiveSession && (
                    <Pressable
                      style={styles.debugExitButton}
                      onPress={handleDebugExitSession}
                      disabled={isExitingSession}
                    >
                      <Text style={styles.debugExitText}>{isExitingSession ? '...' : 'X'}</Text>
                    </Pressable>
                  )}
                </View>
              </View>
              <View style={styles.bossTopContainer}>
                <Sidebar
                  time={state.time}
                  stats={state.player.stats}
                  inventory={state.player.inventory}
                  inventoryCapacity={state.player.inventoryCapacity}
                  equippedTool={state.player.equippedTool}
                  activeItemsets={state.player.activeItemsets}
                  onlyBoss={true}
                />
              </View>
            </View>

            {/* Bottom Area */}
            <View style={styles.bottomRow}>
              <View style={styles.mapAreaContainer}>
                <GameCanvas
                  map={state.map}
                  playerPosition={state.player.position}
                  playerFacing={state.player.facing}
                  timePhase={state.time.phase}
                  wallHighlight={state.wallHighlight}
                  overviewMode={overviewMode}
                  onPanOverview={panOverview}
                  onZoomOverview={zoomOverview}
                  feedbackMessage={wallBreakFeedback}
                />
                <DebugOverlay
                  debug={state.debug}
                  seed={state.seed}
                  phase={state.phase}
                  time={state.time}
                />

                <View
                  style={styles.dpadOverlay}
                  pointerEvents={overviewMode.active || state.fastTravel?.active ? 'none' : 'auto'}
                >
                  <DPadControls
                    onDirection={handleDirection}
                    size={120}
                    disabledDirections={disabledDirections}
                    onCenterPress={
                      poiInteraction.canInteract && state.phase === GamePhase.Exploration
                        ? () => {
                            console.log(
                              '[GameScreen] A button pressed | currentPoi:',
                              poiInteraction.currentPoi
                                ? {
                                    x: poiInteraction.currentPoi.x,
                                    y: poiInteraction.currentPoi.y,
                                    poiType: poiInteraction.currentPoi.poiType,
                                  }
                                : null
                            );
                            poiInteraction.interact();
                          }
                        : undefined
                    }
                    centerDisabled={poiInteraction.isInteracting}
                  />
                </View>

                {state.fastTravel?.active && (
                  <FastTravelOverlay
                    waypoints={discoveredWaypoints}
                    selectedIndex={state.fastTravel.selectedIndex}
                    currentPosition={state.player.position}
                    overviewMode={overviewMode}
                    onCycle={() => dispatch({ type: 'CYCLE_FAST_TRAVEL' })}
                    onConfirm={() => dispatch({ type: 'CONFIRM_FAST_TRAVEL' })}
                    onCancel={() => dispatch({ type: 'CANCEL_FAST_TRAVEL' })}
                  />
                )}
                <POIModal
                  visible={state.phase === GamePhase.POIInteraction}
                  interaction={effectiveInteraction}
                  onSelectOption={handlePOIOption}
                  onClose={handlePOIClose}
                  kilnSelection={kilnSelection}
                  kilnFuseOptionIndex={kilnFuseOptionIndex}
                  onKilnSlotPress={handleKilnSlotPress}
                  scrapSelection={scrapSelection}
                  scrapOptionIndex={scrapOptionIndex}
                  onScrapSlotPress={handleScrapSlotPress}
                  equippedTool={state.player.equippedTool}
                />
              </View>
              <View style={styles.sidebarBottomContainer}>
                <Sidebar
                  time={state.time}
                  stats={state.player.stats}
                  inventory={state.player.inventory}
                  inventoryCapacity={state.player.inventoryCapacity}
                  equippedTool={state.player.equippedTool}
                  activeItemsets={state.player.activeItemsets}
                  onItemInspect={handleInspectItem}
                  onToolInspect={handleInspectTool}
                  isRuneKilnActive={isRuneKilnActive}
                  handleInventoryItemPress={handleInventoryItemPress}
                  onlyContent={true}
                />
              </View>
            </View>

            {/* Crossing Separators */}
            <CrossingLines />
          </View>

          <ItemTooltip
            item={inspectedItem}
            visible={isTooltipVisible}
            onClose={handleCloseTooltip}
          />
        </View>
      </ImageBackground>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backgroundImage: { flex: 1, width: '100%', height: '100%' },
  darkOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.15)' },
  fullLayout: { flex: 1 },
  topRow: { height: NAVBAR_HEIGHT, flexDirection: 'row' },
  navbarArea: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15 },
  navbarLeft: { width: 100, justifyContent: 'center', alignItems: 'flex-start', gap: 2 },
  navbarCenter: { flex: 1, justifyContent: 'center' },
  navbarRight: { width: 80, justifyContent: 'center', alignItems: 'flex-end' },
  weekText: {
    alignSelf: 'center',
    fontFamily: Typography.header,
    fontSize: 12,
    color: '#000000',
    fontWeight: 'bold',
  },
  bossTopContainer: { width: SIDEBAR_WIDTH },
  bottomRow: { flex: 1, flexDirection: 'row' },
  mapAreaContainer: {
    flex: 1,
    backgroundColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
  },
  sidebarBottomContainer: { width: SIDEBAR_WIDTH, padding: 6 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontFamily: Typography.header, fontSize: 20, color: '#666666' },
  dpadOverlay: { position: 'absolute', bottom: 24, left: 24 },
  goldDisplay: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coinIcon: { width: 28, height: 28 },
  goldValue: { fontFamily: Typography.number, fontSize: 24, fontWeight: 'bold', color: '#000000' },
  mapToggleButton: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  mapIcon: { width: 32, height: 32 },

  // Crossing Line Styles
  linesOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 20 },
  hLineContainer: { position: 'absolute', top: NAVBAR_HEIGHT - 3, left: 0, right: 0, height: 6 },
  hSeparator: { width: '100%', height: 6 },
  vLineContainer: { position: 'absolute', top: 0, bottom: 0, right: SIDEBAR_WIDTH - 3, width: 6 },
  vSeparator: { height: '100%', width: 6 },

  // Debug exit button (DEV only)
  debugExitButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#dc3545',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  debugExitText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
