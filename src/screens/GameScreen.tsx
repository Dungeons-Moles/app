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
import { useSolanaConnection } from '../contexts/SolanaConnectionContext';
import { RunMode } from '../services/solana/types/gameplay_state';
import { convertItemInstanceToGear, convertItemInstanceToTool } from '../services/solana/pitDraft';
import { fetchFullSessionState } from '../services/solana/sessionRestore';
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
import { useScreenVariant } from '../contexts/ScreenVariantContext';
import { useInputMode } from '../hooks/useInputMode';
import { useControllerAction } from '../hooks/useControllerAction';
import { usePsg1Input } from 'psg1-sim';
import { Direction, DIRECTION_DELTA } from '../game/input/types';
import { TileType, MapEnemy, MapPOI } from '../game/map/types';
import { getDiscoveredWaypoints } from '../game/entities/pois';
import { canAffordCostAcrossPhases, selectDuelWeekBossForSeed } from '../game/time/progression';
import { Typography } from '../theme/typography';
import { promptTransactionRetry } from '../utils/transaction-alerts';
import { getPhaseLabel } from '../utils/phase-labels';
import type {
  Gear,
  GearId,
  Tool,
  CombatantState,
  ItemRarity,
  Position,
} from '../game/engine/types';
import type { BackendCombatLogEntry } from '../services/solana/types/combat_events';
import { calculateItemStats } from '@/game/entities/items';
import type { GauntletCombatVisualEvent } from '@/services/solana/gauntlet';
import {
  ENEMY_DEFINITIONS,
  calculateGoldReward,
  ARCHETYPE_TO_ENEMY_ID,
  deriveEnemyTier,
} from '../game/entities/enemies';
import { BOSSES } from '../data/bosses';
import type { BossId } from '../game/engine/types';
import Svg, { Path } from 'react-native-svg';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');
const COIN_ICON = require('../../assets/icons/ui/coin.png');
const MAP_ICON = require('../../assets/icons/ui/map.png');
const SIDEBAR_BG = require('../../assets/ui/panels/sidebar.png');
const ICON_Y = require('../../assets/ui/control-buttons/y.png');

const SIDEBAR_WIDTH = 230;
const COMPACT_SIDEBAR_WIDTH = 280;
const NAVBAR_HEIGHT = 60;

type PlayerStats = {
  hp: number;
  maxHp: number;
  atk: number;
  arm: number;
  spd: number;
  dig: number;
  gold: number;
};

function buildPlayerCombatant(stats: PlayerStats): CombatantState {
  return {
    name: 'Player',
    emoji: '🧑‍🔧',
    definitionId: 'player',
    isPlayer: true,
    maxHp: stats.maxHp,
    hp: stats.hp,
    atk: stats.atk,
    arm: stats.arm,
    spd: stats.spd,
    dig: stats.dig,
    bonusAtk: 0,
    bonusArm: 0,
    bonusSpd: 0,
    statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
    strikesPerTurn: 1,
    ignoresArmor: false,
  };
}

function buildEnemyCombatant(
  name: string,
  emoji: string,
  definitionId: string,
  stats: { hp: number; atk: number; arm: number; spd: number; dig: number }
): CombatantState {
  return {
    name,
    emoji,
    definitionId,
    isPlayer: false,
    maxHp: stats.hp,
    hp: stats.hp,
    atk: stats.atk,
    arm: stats.arm,
    spd: stats.spd,
    dig: stats.dig,
    bonusAtk: 0,
    bonusArm: 0,
    bonusSpd: 0,
    statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
    strikesPerTurn: 1,
    ignoresArmor: false,
  };
}

/**
 * Create combat params for CombatScreen from local game state and enemy data
 */
function createCombatParams(
  enemy: MapEnemy,
  playerStats: PlayerStats,
  playerGear: Gear[],
  playerTool: Tool | null,
  activeItemsets: string[],
  seed: number,
  week: 1 | 2 | 3,
  combatLog?: BackendCombatLogEntry[],
  onChainOutcome?: {
    finalPlayerHp: number;
    finalPlayerGold: number;
    playerWon: boolean;
  }
): CombatParams {
  const enemyDef = ENEMY_DEFINITIONS[enemy.definitionId];
  const tierStats = enemyDef.tiers[enemy.tier - 1];

  return {
    player: buildPlayerCombatant(playerStats),
    enemy: buildEnemyCombatant(enemyDef.name, enemyDef.emoji, enemy.definitionId, tierStats),
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
    onChainOutcome,
  };
}

/**
 * Create combat params for boss fight
 */
function createBossCombatParams(
  bossId: BossId,
  playerStats: PlayerStats,
  playerGear: Gear[],
  playerTool: Tool | null,
  activeItemsets: string[],
  seed: number,
  week: 1 | 2 | 3,
  combatLog?: BackendCombatLogEntry[],
  onChainOutcome?: {
    finalPlayerHp: number;
    finalPlayerGold: number;
    playerWon: boolean;
  }
): CombatParams {
  const bossDef = BOSSES[bossId];
  if (!bossDef) {
    throw new Error(`Boss definition not found for ID: ${bossId}`);
  }

  return {
    player: buildPlayerCombatant(playerStats),
    enemy: buildEnemyCombatant(bossDef.name, bossDef.emoji, bossId, bossDef.stats),
    seed,
    bossId,
    goldReward: 0,
    activeItemSets: activeItemsets as any[],
    playerGear,
    playerTool,
    playerGold: playerStats.gold,
    week,
    isBossFight: true,
    combatLog,
    onChainOutcome,
  };
}

function createGauntletCombatParams(
  visual: GauntletCombatVisualEvent,
  playerStats: PlayerStats,
  playerGear: Gear[],
  playerTool: Tool | null,
  activeItemsets: string[],
  seed: number,
  week: number,
  playerGold: number
): CombatParams {
  const echoTool = visual.echoTool ? convertItemInstanceToTool(visual.echoTool) : null;
  const echoGear = visual.echoGear
    .filter((g): g is NonNullable<typeof g> => g !== null)
    .map((g) => convertItemInstanceToGear(g))
    .filter((g): g is Gear => g !== null);

  const echoStats = calculateItemStats(echoTool, echoGear);
  const echoMaxHp = 10 + (echoStats.hp ?? 0);

  return {
    player: buildPlayerCombatant(playerStats),
    enemy: buildEnemyCombatant('Echo', '🪞', 'gauntlet_echo', {
      hp: echoMaxHp,
      atk: echoStats.atk ?? 1,
      arm: echoStats.arm ?? 0,
      spd: echoStats.spd ?? 0,
      dig: echoStats.dig ?? 0,
    }),
    seed,
    goldReward: 0,
    activeItemSets: activeItemsets as any[],
    playerGear,
    playerTool,
    playerGold,
    week: Math.min(Math.max(week, 1), 3) as 1 | 2 | 3,
    isBossFight: false,
    combatLog: visual.combatLog,
    onChainOutcome: {
      finalPlayerHp: visual.finalPlayerHp,
      finalPlayerGold: playerGold,
      playerWon: visual.playerWon,
    },
  };
}

/**
 * Navigate to CombatScreen with combat params and on-chain metadata.
 */
function navigateToCombat(
  navigation: NativeStackNavigationProp<RootStackParamList, 'Game'>,
  combatParams: CombatParams,
  meta: { campaignLevel: number; totalMoves: number; phase: number }
) {
  navigation.navigate('Combat', {
    combatInput: {
      ...combatParams,
      campaignLevel: meta.campaignLevel,
      totalMoves: meta.totalMoves,
      phase: meta.phase,
    },
  });
}

/**
 * Navigate to DeathScreen with run summary data.
 */
function navigateToDeath(
  navigation: NativeStackNavigationProp<RootStackParamList, 'Game'>,
  meta: { totalMoves: number; campaignLevel: number; week: number; phase: number },
  killedBy?: string
) {
  navigation.navigate('Death', {
    totalMoves: meta.totalMoves,
    level: meta.campaignLevel,
    week: meta.week,
    phase: getPhaseLabel(meta.phase),
    killedBy,
  });
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

function CrossingLines({ navbarHeight, isCompact }: { navbarHeight: number; isCompact: boolean }) {
  return (
    <View style={styles.linesOverlay} pointerEvents="none">
      <View style={[styles.hLineContainer, { top: navbarHeight - 3 }]}>
        <ThinSeparator horizontal={true} />
      </View>
      {!isCompact && (
        <View style={styles.vLineContainer}>
          <ThinSeparator horizontal={false} />
        </View>
      )}
    </View>
  );
}

type GameScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Game'>;
};

export function GameScreen({ navigation }: GameScreenProps) {
  const {
    state,
    dispatch,
    overviewMode,
    toggleOverviewMode,
    panOverview,
    zoomOverview,
    resetOverviewCamera,
  } = useGame();
  const { mode } = useProfile();
  const {
    hasActiveSession,
    movePlayer,
    triggerBoss,
    gameplayState: onChainState,
    gameplaySyncStatus,
    sessionKey,
    sessionPda,
    burnerBalance,
    isBurnerLowBalance,
    topUpBurner,
    mapSeed,
    currentLevel,
    forceAbandonCurrentSession,
  } = useSession();
  const { wallet } = useWallet();
  const { connection } = useSolanaConnection();
  const { refreshMapEntities, pois: onChainPois } = useGameplayStateContext();
  const variant = useScreenVariant();
  const nightMovement = useNightMovement();
  const poiInteraction = usePoiInteraction();
  const isFocused = useIsFocused();
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const psg1Input = usePsg1Input();

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
  const [isFastTravelMode, setIsFastTravelMode] = useState(false);
  const [fastTravelCameraTarget, setFastTravelCameraTarget] = useState<Position | null>(null);
  const [fastTravelDestinations, setFastTravelDestinations] = useState<Position[]>([]);
  const [fastTravelSelectedIndex, setFastTravelSelectedIndex] = useState(0);
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

  // Boss fight detection: trigger boss fight when on-chain state has bossFightReady.
  // This handles all cases: direct (no field combat on last move) and deferred
  // (returning from field enemy CombatScreen after the same move set bossFightReady).
  const isTriggeringBossRef = useRef(false);
  const isRestoringSessionRef = useRef(false);

  useEffect(() => {
    if (!isFocused || state || !hasActiveSession || !sessionPda || isRestoringSessionRef.current) {
      return;
    }

    isRestoringSessionRef.current = true;
    console.log('[GameScreen] Auto-restoring active session from chain...', {
      sessionPda: sessionPda.toBase58(),
      currentLevel,
    });

    fetchFullSessionState(connection, sessionPda)
      .then((restored) => {
        if (!restored) {
          console.warn('[GameScreen] Auto-restore failed: fetchFullSessionState returned null');
          return;
        }
        dispatch({ type: 'RESTORE_GAME', state: restored });
        console.log('[GameScreen] Auto-restore completed');
      })
      .catch((err) => {
        console.error('[GameScreen] Auto-restore failed with error:', err);
      })
      .finally(() => {
        isRestoringSessionRef.current = false;
      });
  }, [isFocused, state, hasActiveSession, sessionPda, currentLevel, connection, dispatch]);

  useEffect(() => {
    if (
      !isFocused ||
      !onChainState?.bossFightReady ||
      !state ||
      mode === 'guest' ||
      isTriggeringBossRef.current ||
      isMovePending
    ) {
      return;
    }

    const isGauntletRun = onChainState.runMode === RunMode.Gauntlet;
    const resolvedWeekBoss: BossId | null =
      onChainState.runMode === RunMode.Duel &&
      (state.time.week === 1 || state.time.week === 2) &&
      mapSeed != null
        ? selectDuelWeekBossForSeed(mapSeed, state.time.week)
        : (state.time.weekBoss ?? null);
    if (!isGauntletRun && !resolvedWeekBoss) {
      console.warn('[GameScreen] bossFightReady but no weekBoss defined');
      return;
    }

    isTriggeringBossRef.current = true;
    console.log('[GameScreen] Weekly fight detected via on-chain state, triggering:', {
      weekBoss: resolvedWeekBoss ?? null,
      resolvedWeekBoss: resolvedWeekBoss ?? null,
      runMode: onChainState.runMode,
      week: state.time.week,
      playerHp: onChainState.hp,
    });

    (async () => {
      // Build player stats from on-chain state (post-move, pre-boss).
      // Captured outside try so it's available in the catch fallback.
      // When on-chain HP is 0 (boss fight already resolved inline or field death),
      // use local stats as fallback so the local resolver produces a multi-turn combat.
      const fallbackHp = onChainState.hp > 0 ? onChainState.hp : Math.max(state.player.stats.hp, 1);
      const playerStats = {
        hp: fallbackHp,
        maxHp: state.player.stats.maxHp,
        atk: state.player.stats.atk,
        arm: state.player.stats.arm,
        spd: state.player.stats.spd,
        dig: state.player.stats.dig,
        gold: onChainState.gold,
      };

      try {
        // Trigger weekly combat on-chain (boss in campaign/duel, echo in gauntlet)
        const bossResult = await triggerBoss();
        if (!bossResult.success) {
          console.error('[GameScreen] triggerBoss on-chain weekly resolver failed');
        }

        const bossCombatParams = isGauntletRun
          ? createGauntletCombatParams(
              bossResult.gauntletVisual!,
              playerStats,
              state.player.inventory.map((slot) => slot.item),
              state.player.equippedTool,
              state.player.activeItemsets ?? [],
              state.rngState,
              state.time.week,
              bossResult.newState?.gold ?? onChainState.gold
            )
          : createBossCombatParams(
              resolvedWeekBoss!,
              playerStats,
              state.player.inventory.map((slot) => slot.item),
              state.player.equippedTool,
              state.player.activeItemsets ?? [],
              state.rngState,
              state.time.week,
              bossResult.combatLog,
              bossResult.success && bossResult.newState
                ? {
                    finalPlayerHp: bossResult.newState.hp,
                    finalPlayerGold: bossResult.newState.gold,
                    playerWon: !bossResult.isDead,
                  }
                : undefined
            );

        console.log('[GameScreen] Navigating to CombatScreen for weekly fight:', {
          isGauntletRun,
          bossId: resolvedWeekBoss ?? null,
          resolvedWeekBoss: resolvedWeekBoss ?? null,
          enemyName: bossCombatParams.enemy.name,
          playerHp: playerStats.hp,
          week: state.time.week,
          hasOnChainOutcome: bossResult.success,
          hasCombatLog: !!bossResult.combatLog || !!bossResult.gauntletVisual?.combatLog,
          combatLogEntries:
            bossResult.combatLog?.length ?? bossResult.gauntletVisual?.combatLog?.length ?? 0,
        });

        navigateToCombat(navigation, bossCombatParams, {
          campaignLevel: bossResult.newState?.campaignLevel ?? onChainState.campaignLevel,
          totalMoves: bossResult.newState?.totalMoves ?? onChainState.totalMoves,
          phase: bossResult.newState?.phase ?? onChainState.phase,
        });
      } catch (err) {
        console.error('[GameScreen] Boss fight trigger error:', err);
        // CRITICAL: Always show CombatScreen for boss fights — never silently fail.
        // Fall back to local combat resolver so the player sees the boss fight animation.
        try {
          if (!resolvedWeekBoss) {
            throw new Error('No week boss available for local fallback');
          }

          const bossCombatParams = createBossCombatParams(
            resolvedWeekBoss,
            playerStats,
            state.player.inventory.map((slot) => slot.item),
            state.player.equippedTool,
            state.player.activeItemsets ?? [],
            state.rngState,
            state.time.week
          );

          console.warn('[GameScreen] Boss fight on-chain failed, falling back to local resolver:', {
            bossId: resolvedWeekBoss,
            playerHp: playerStats.hp,
          });

          navigateToCombat(navigation, bossCombatParams, {
            campaignLevel: onChainState.campaignLevel,
            totalMoves: onChainState.totalMoves,
            phase: onChainState.phase,
          });
        } catch (fallbackErr) {
          // Boss definition missing — navigate to Death as last resort so the user isn't stuck.
          console.error(
            '[GameScreen] Boss combat params failed, navigating to Death:',
            fallbackErr
          );
          const bossName = BOSSES[resolvedWeekBoss]?.name ?? resolvedWeekBoss;
          navigateToDeath(navigation, onChainState, bossName);
        }
      } finally {
        isTriggeringBossRef.current = false;
      }
    })();
  }, [
    isFocused,
    onChainState?.bossFightReady,
    onChainState?.hp,
    onChainState?.gold,
    onChainState?.campaignLevel,
    onChainState?.totalMoves,
    onChainState?.phase,
    onChainState?.runMode,
    state,
    mode,
    isMovePending,
    mapSeed,
    triggerBoss,
    navigation,
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

  const discoveredWaypoints = useMemo(() => {
    if (!state) return [];

    // Primary source: local map discovery (same source used by rail waypoint POI options).
    const merged = new Map<string, MapPOI>();
    for (const poi of getDiscoveredWaypoints(state.map)) {
      merged.set(`${poi.position.x},${poi.position.y}`, poi);
    }

    // Secondary source: on-chain consumed waypoints. Merge (don't replace), so we never
    // lose locally discovered/visible destinations during fast-travel selection.
    const onChainWaypoints: MapPOI[] = onChainPois
      .map((poi, index) => ({ poi, index }))
      .filter(({ poi }) => poi.poiType === 8 && poi.consumed)
      .map(({ poi, index }) => ({
        id: `chain-waypoint-${index}-${poi.x}-${poi.y}`,
        definitionId: 'L8',
        position: { x: poi.x, y: poi.y },
        visited: true,
        discovered: true,
      }));

    for (const poi of onChainWaypoints) {
      const key = `${poi.position.x},${poi.position.y}`;
      if (!merged.has(key)) {
        merged.set(key, poi);
      }
    }

    return Array.from(merged.values());
  }, [state, onChainPois]);

  const isFastTravelActive = isFastTravelMode && fastTravelDestinations.length > 0;

  useEffect(() => {
    if (!isFastTravelActive) {
      setFastTravelSelectedIndex(0);
      setFastTravelCameraTarget(null);
      return;
    }

    setFastTravelSelectedIndex((prev) =>
      prev >= 0 && prev < fastTravelDestinations.length ? prev : 0
    );
  }, [isFastTravelActive, isFastTravelMode, fastTravelDestinations.length]);

  useEffect(() => {
    if (!isFastTravelActive) {
      setFastTravelCameraTarget(null);
      return;
    }
    const target = fastTravelDestinations[fastTravelSelectedIndex] ?? fastTravelDestinations[0];
    setFastTravelCameraTarget(target ?? null);
  }, [isFastTravelActive, fastTravelDestinations, fastTravelSelectedIndex]);

  useEffect(() => {
    // Fast travel should not open map-overview pan mode.
    // If overview is open from earlier, close it so camera focus is deterministic.
    if (isFastTravelActive && overviewMode.active) {
      toggleOverviewMode();
      resetOverviewCamera();
    }
  }, [isFastTravelActive, overviewMode.active, toggleOverviewMode, resetOverviewCamera]);

  // Compute the camera focus position during fast travel
  const fastTravelFocus = useMemo(() => {
    if (!isFastTravelActive) return undefined;
    return (
      fastTravelCameraTarget ??
      fastTravelDestinations[fastTravelSelectedIndex] ??
      fastTravelDestinations[0]
    );
  }, [isFastTravelActive, fastTravelCameraTarget, fastTravelSelectedIndex, fastTravelDestinations]);

  const fastTravelOverlayWaypoints = useMemo<MapPOI[]>(() => {
    if (!state?.player?.position) return discoveredWaypoints;
    if (!isFastTravelActive) return discoveredWaypoints;

    const points: MapPOI[] = [
      {
        id: `fast-travel-current-${state.player.position.x}-${state.player.position.y}`,
        definitionId: 'L8',
        position: { ...state.player.position },
        visited: true,
        discovered: true,
      },
      ...fastTravelDestinations.map((pos, index) => ({
        id: `fast-travel-destination-${index}-${pos.x}-${pos.y}`,
        definitionId: 'L8' as const,
        position: pos,
        visited: true,
        discovered: true,
      })),
    ];
    return points;
  }, [state?.player?.position, discoveredWaypoints, isFastTravelActive, fastTravelDestinations]);

  useLandscapeLock();

  const handleDirection = useCallback(
    (direction: Direction) => {
      if (isFastTravelActive) {
        if (direction === Direction.Left) {
          setFastTravelSelectedIndex(
            (prev) => (prev - 1 + fastTravelDestinations.length) % fastTravelDestinations.length
          );
        } else if (direction === Direction.Right) {
          setFastTravelSelectedIndex((prev) => (prev + 1) % fastTravelDestinations.length);
        }
        return;
      }

      // Use ref for synchronous check to prevent race conditions with rapid clicks
      if (
        !state ||
        state.phase !== GamePhase.Exploration ||
        overviewMode.active ||
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
              // Suppress POI auto-trigger at this position: combat takes priority.
              // After combat the player can manually open the POI with the A button.
              lastAutoTriggeredPosRef.current = { x: targetPos.x, y: targetPos.y };
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
                  result.combatLog,
                  {
                    finalPlayerHp: result.newState.hp,
                    finalPlayerGold: result.newState.gold,
                    playerWon: !result.isDead,
                  }
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
                navigateToCombat(navigation, combatParams, result.newState);
              } else if (result.combatEnemyInfo) {
                // Night combat fallback: enemy walked onto player's new position during
                // night movement. Local state has stale enemy positions, but we have the
                // enemy archetype + HP from the on-chain CombatStarted event.
                const enemyId = ARCHETYPE_TO_ENEMY_ID[result.combatEnemyInfo.archetype];
                if (enemyId) {
                  const tier = deriveEnemyTier(enemyId, result.combatEnemyInfo.hp);
                  const enemyDef = ENEMY_DEFINITIONS[enemyId];
                  const tierStats = enemyDef.tiers[tier - 1];
                  console.log(
                    '[GameScreen] Night combat fallback: archetype=',
                    result.combatEnemyInfo.archetype,
                    'enemyId=',
                    enemyId,
                    'tier=',
                    tier
                  );
                  const syntheticEnemy: MapEnemy = {
                    id: `night_combat_${enemyId}_${tier}`,
                    definitionId: enemyId,
                    tier,
                    position: targetPos,
                    stats: {
                      hp: tierStats.hp,
                      atk: tierStats.atk,
                      arm: tierStats.arm,
                      spd: tierStats.spd,
                    },
                    discovered: true,
                  };
                  const combatParams = createCombatParams(
                    syntheticEnemy,
                    preCombatPlayerStats,
                    preCombatGear,
                    preCombatTool,
                    preCombatItemsets,
                    preCombatSeed,
                    currentWeek,
                    result.combatLog,
                    {
                      finalPlayerHp: result.newState.hp,
                      finalPlayerGold: result.newState.gold,
                      playerWon: !result.isDead,
                    }
                  );
                  navigateToCombat(navigation, combatParams, result.newState);
                } else {
                  console.error(
                    '[GameScreen] Unknown enemy archetype:',
                    result.combatEnemyInfo.archetype
                  );
                  if (result.isDead && !result.bossFightReady) {
                    navigateToDeath(navigation, result.newState, 'Unknown enemy');
                  }
                  // When bossFightReady is true, the boss useEffect will trigger
                  // CombatScreen for the boss fight instead of skipping to Death.
                }
              } else {
                // Combat occurred but couldn't find enemy and no event data available
                console.error(
                  '[GameScreen] Combat occurred but no enemy found and no combat event data!',
                  {
                    targetPos: targetPos,
                    playerPos: state.player.position,
                    enemyCount: state.map.enemies.length,
                    isDead: result.isDead,
                  }
                );
                // If player died and no boss fight pending, navigate to death screen.
                // When bossFightReady, the boss useEffect will show CombatScreen first.
                if (result.isDead && !result.bossFightReady) {
                  navigateToDeath(navigation, result.newState, 'Unknown enemy');
                }
              }
            } else if (result.isDead && !result.bossFightReady) {
              // Non-combat death (shouldn't normally happen, but handle edge case).
              // Skip when bossFightReady — the boss useEffect will show CombatScreen first.
              console.log('[GameScreen] Player died (non-combat), navigating to DeathScreen');
              navigateToDeath(navigation, result.newState);
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
      isFastTravelActive,
      fastTravelDestinations.length,
    ]
  );

  const handleFastTravelConfirm = useCallback(() => {
    if (!state || !isFastTravelActive) {
      return;
    }

    const dest = fastTravelDestinations[fastTravelSelectedIndex] ?? fastTravelDestinations[0];
    if (!dest) {
      setIsFastTravelMode(false);
      setFastTravelDestinations([]);
      return;
    }

    // Guest mode: teleport player locally
    if (mode === 'guest' || !hasActiveSession) {
      console.log('[GameScreen] Guest mode fast travel to', dest.x, dest.y);
      lastAutoTriggeredPosRef.current = { x: dest.x, y: dest.y };
      dispatch({ type: 'FAST_TRAVEL_TO', destination: dest });
      setIsFastTravelMode(false);
      setFastTravelDestinations([]);
      return;
    }

    // Skip mismatch detection during fast travel to prevent stale on-chain state from reverting position
    skipMismatchDetectionRef.current = true;
    if (skipMismatchTimeoutRef.current) {
      clearTimeout(skipMismatchTimeoutRef.current);
    }

    poiInteraction.executeFastTravel(state.player.position, dest).then((result) => {
      if (result.success && result.newState) {
        dispatch({
          type: 'SYNC_MOVE',
          confirmedState: result.newState,
        });
        // Prevent auto-trigger from reopening the waypoint modal at the destination
        lastAutoTriggeredPosRef.current = { x: dest.x, y: dest.y };
        if (sessionPda) {
          refreshMapEntities(sessionPda).catch((err) =>
            console.warn('[GameScreen] Failed to refresh after fast travel:', err)
          );
        }
      } else if (result.error) {
        showWallBreakFeedback(result.error);
      }
      setIsFastTravelMode(false);
      setFastTravelDestinations([]);
      // Reset skip flag after a delay to allow on-chain state to propagate
      skipMismatchTimeoutRef.current = setTimeout(() => {
        skipMismatchDetectionRef.current = false;
      }, 1000);
    });
  }, [
    state,
    isFastTravelActive,
    fastTravelDestinations,
    fastTravelSelectedIndex,
    mode,
    hasActiveSession,
    poiInteraction,
    dispatch,
    sessionPda,
    refreshMapEntities,
    showWallBreakFeedback,
  ]);

  useDirectionInput(handleDirection, {
    enabled: state?.phase === GamePhase.Exploration && !isController,
    blocked: overviewMode.active && !isFastTravelActive,
  });

  // --- Controller: D-PAD for movement, Y for map, A for POI/fast-travel confirm ---
  const isPOIModalOpen = state?.phase === GamePhase.POIInteraction;
  const controllerEnabled = isController && isFocused && !!state && !isPOIModalOpen;
  useControllerAction(
    {
      onDPadUp: () => handleDirection(Direction.Up),
      onDPadDown: () => handleDirection(Direction.Down),
      onDPadLeft: () => handleDirection(Direction.Left),
      onDPadRight: () => handleDirection(Direction.Right),
      onY: () => {
        if (!isFastTravelActive) toggleOverviewMode();
      },
      onA: () => {
        if (isFastTravelActive) {
          handleFastTravelConfirm();
        } else if (
          poiInteraction.canInteract &&
          state?.phase === GamePhase.Exploration
        ) {
          poiInteraction.interact();
        }
      },
      onB: () => {
        if (isFastTravelActive) {
          setIsFastTravelMode(false);
          setFastTravelDestinations([]);
        } else if (overviewMode.active) {
          toggleOverviewMode();
        }
      },
    },
    controllerEnabled,
  );

  // --- Controller: L3 joystick for panning the overview map ---
  const panIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!isController || !overviewMode.active || isFastTravelActive) {
      if (panIntervalRef.current) {
        clearInterval(panIntervalRef.current);
        panIntervalRef.current = null;
      }
      return;
    }

    const { x, y } = psg1Input.leftStick;
    const DEAD_ZONE = 0.15;
    const isIdle = Math.abs(x) < DEAD_ZONE && Math.abs(y) < DEAD_ZONE;

    if (isIdle) {
      if (panIntervalRef.current) {
        clearInterval(panIntervalRef.current);
        panIntervalRef.current = null;
      }
      return;
    }

    // Start continuous panning at 60fps-ish interval
    if (panIntervalRef.current) clearInterval(panIntervalRef.current);
    const PAN_SPEED = 8;
    panIntervalRef.current = setInterval(() => {
      const sx = psg1Input.leftStick.x;
      const sy = psg1Input.leftStick.y;
      if (Math.abs(sx) >= DEAD_ZONE || Math.abs(sy) >= DEAD_ZONE) {
        panOverview({
          x: Math.round(sx * PAN_SPEED),
          y: Math.round(sy * PAN_SPEED),
        });
      }
    }, 50);

    return () => {
      if (panIntervalRef.current) {
        clearInterval(panIntervalRef.current);
        panIntervalRef.current = null;
      }
    };
  }, [
    isController,
    overviewMode.active,
    isFastTravelActive,
    psg1Input.leftStick.x,
    psg1Input.leftStick.y,
    panOverview,
  ]);

  const disabledDirections = useMemo(() => {
    if (!state) return [];
    if (overviewMode.active && !isFastTravelActive)
      return [Direction.Up, Direction.Down, Direction.Left, Direction.Right];
    if (isFastTravelActive) return [Direction.Up, Direction.Down];
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
  }, [state, overviewMode.active, isFastTravelActive]);

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

  // Auto-trigger POI interaction when player moves onto a POI.
  // Uses shouldAutoOpen instead of canInteract to skip auto-open for POIs with unmet preconditions
  // (e.g., inventory full for pick-item POIs, already has oil for Tool Oil Rack).
  // lastAutoTriggeredPosRef prevents re-triggering at the same position after modal close.
  // We intentionally do NOT gate on "position changed" because shouldAutoOpen can resolve
  // one render after the position update (on-chain POI data loads asynchronously).
  const lastAutoTriggeredPosRef = useRef<{ x: number; y: number } | null>(null);

  // Extract stable values from poiInteraction to avoid re-triggering on every hook state change
  const { shouldAutoOpen, isInteracting, interact: poiInteract } = poiInteraction;

  useEffect(() => {
    if (!state?.player?.position || state.phase !== GamePhase.Exploration || !isFocused) return;
    const currentPos = state.player.position;
    const lastAutoPos = lastAutoTriggeredPosRef.current;

    const alreadyTriggeredHere =
      lastAutoPos && lastAutoPos.x === currentPos.x && lastAutoPos.y === currentPos.y;

    if (shouldAutoOpen && !isInteracting && !alreadyTriggeredHere) {
      console.log('[GameScreen] Auto-triggering POI interaction at', currentPos.x, currentPos.y);
      lastAutoTriggeredPosRef.current = { x: currentPos.x, y: currentPos.y };
      poiInteract();
    }

    // Clear last auto-triggered position when player moves away from it
    if (lastAutoPos && (lastAutoPos.x !== currentPos.x || lastAutoPos.y !== currentPos.y)) {
      lastAutoTriggeredPosRef.current = null;
    }
  }, [
    state?.player?.position,
    state?.phase,
    shouldAutoOpen,
    isInteracting,
    poiInteract,
    isFocused,
  ]);

  const handleFastTravel = useCallback(() => {
    if (!state?.player?.position) {
      return;
    }

    // Always use discoveredWaypoints as the source of truth for destinations.
    // activePOI.options may be stale or unavailable if the modal was opened via
    // SHOW_POI_MODAL fallback (which doesn't generate options).
    const destinations = discoveredWaypoints
      .map((wp) => wp.position)
      .filter((pos) => pos.x !== state.player.position.x || pos.y !== state.player.position.y)
      .filter((pos, index, arr) => arr.findIndex((p) => p.x === pos.x && p.y === pos.y) === index);

    if (destinations.length === 0) {
      showWallBreakFeedback('No other waypoints discovered');
      return;
    }

    let nearestIndex = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < destinations.length; i++) {
      const dest = destinations[i];
      const dist =
        Math.abs(dest.x - state.player.position.x) + Math.abs(dest.y - state.player.position.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIndex = i;
      }
    }

    // Prevent auto-open effect from immediately reopening the waypoint modal
    // after we close it to enter fast-travel selection.
    lastAutoTriggeredPosRef.current = {
      x: state.player.position.x,
      y: state.player.position.y,
    };

    // Clear deferred POI state from the waypoint interaction before entering fast travel
    poiInteraction.clearCacheOffers();
    dispatch({ type: 'CLOSE_POI' });
    setFastTravelDestinations(destinations);
    setFastTravelSelectedIndex(nearestIndex);
    setFastTravelCameraTarget(destinations[nearestIndex] ?? destinations[0] ?? null);
    setIsFastTravelMode(true);
  }, [dispatch, state, discoveredWaypoints, showWallBreakFeedback, poiInteraction]);

  const handlePOIClose = useCallback(() => {
    // Prevent auto-trigger from reopening the modal at this position
    if (state?.player?.position) {
      lastAutoTriggeredPosRef.current = {
        x: state.player.position.x,
        y: state.player.position.y,
      };
    }
    setKilnSelection({ gearId: null, rarity: null, emoji: '', count: 0 });
    setScrapSelection(null);
    poiInteraction.clearCacheOffers();
    dispatch({ type: 'CLOSE_POI' });
  }, [dispatch, poiInteraction, state?.player?.position]);

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
      setKilnSelection({ gearId: null, rarity: null, emoji: '', count: 0 });
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

      // Default: local-only dispatch for auto-trigger POIs (L1, L5, L8, L11, L14)
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
    rarity: ItemRarity | null;
    emoji: string;
    count: number;
  }>({ gearId: null, rarity: null, emoji: '', count: 0 });
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
        const gear = item as Gear;
        const availableCount = state.player.inventory.filter(
          (slot) =>
            slot.item.id === gear.id &&
            'currentRarity' in slot.item &&
            (slot.item as Gear).currentRarity === gear.currentRarity
        ).length;
        if (availableCount === 0) return;
        setKilnSelection((prev) => {
          // Different item or different rarity → replace selection
          if (!prev.gearId || prev.gearId !== gear.id || prev.rarity !== gear.currentRarity)
            return { gearId: gear.id, rarity: gear.currentRarity, emoji: gear.emoji, count: 1 };
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
      !kilnSelection.rarity ||
      kilnSelection.count < 2
    )
      return null;
    const options = state.activePOI.options ?? [];
    const index = options.findIndex(
      (opt) =>
        opt.item &&
        'currentRarity' in opt.item &&
        opt.item.id === kilnSelection.gearId &&
        (opt.item as Gear).currentRarity === kilnSelection.rarity
    );
    return index >= 0 ? index : null;
  }, [state, kilnSelection]);

  const scrapOptionIndex = useMemo(() => {
    if (state?.activePOI?.poi.definitionId !== 'L14' || !scrapSelection) return null;
    const options = state.activePOI.options ?? [];
    return options.findIndex(
      (opt) => opt.item && 'id' in opt.item && opt.item.id === scrapSelection.id
    );
  }, [state, scrapSelection]);

  const handleControllerGearSelect = useCallback(
    (gear: Gear) => {
      if (!state || state.phase !== GamePhase.POIInteraction) return;
      handleInventoryItemPress(gear);
    },
    [state, handleInventoryItemPress]
  );

  const handleKilnSlotPress = useCallback(() => {
    setKilnSelection((prev) => {
      if (!prev.gearId || prev.count === 0) return prev;
      return prev.count - 1 <= 0
        ? { gearId: null, rarity: null, emoji: '', count: 0 }
        : { ...prev, count: prev.count - 1 };
    });
  }, []);

  const handleScrapSlotPress = useCallback(() => {
    setScrapSelection(null);
  }, []);

  const isItemSelectPoiActive =
    state?.phase === GamePhase.POIInteraction &&
    (state.activePOI?.poi.definitionId === 'L11' || state.activePOI?.poi.definitionId === 'L14');

  // Filtered gear for controller-mode inventory cycling in Rune Kiln / Scrap Chute
  const selectableGear = useMemo(() => {
    if (!state || !isItemSelectPoiActive) return [];
    const poiDefId = state.activePOI?.poi.definitionId;
    return state.player.inventory
      .map((slot) => slot.item)
      .filter((item): item is Gear => {
        if (!('currentRarity' in item)) return false;
        // Rune Kiln: only COMMON or GILDED gear
        if (poiDefId === 'L11') {
          return item.currentRarity === 'COMMON' || item.currentRarity === 'GILDED';
        }
        return true; // Scrap Chute: any gear
      });
  }, [state, isItemSelectPoiActive]);

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

  const maxGearSlots = onChainState?.runMode === RunMode.Gauntlet ? 12 : 8;
  const isGauntletLayout = onChainState?.runMode === RunMode.Gauntlet;
  const isCompact = variant === 'compact';
  const navScale = isCompact ? 2 : 1;
  const navbarHeight = NAVBAR_HEIGHT * navScale;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
        <View style={styles.darkOverlay}>
          <View style={styles.fullLayout}>
            {/* Top Area */}
            <View style={[styles.topRow, { height: navbarHeight }]}>
              <View style={[styles.navbarArea, { paddingHorizontal: 15 * navScale }]}>
                <View style={[styles.navbarLeft, { width: 100 * navScale }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 * navScale }}>
                    <Pressable
                      style={{
                        width: 36 * navScale,
                        height: 36 * navScale,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                      onPress={toggleOverviewMode}
                      disabled={isFastTravelActive}
                    >
                      <Image
                        source={MAP_ICON}
                        style={{ width: 32 * navScale, height: 32 * navScale }}
                        resizeMode="contain"
                      />
                    </Pressable>
                    {isController && (
                      <Image
                        source={ICON_Y}
                        style={{ width: 14 * navScale, height: 14 * navScale }}
                        resizeMode="contain"
                      />
                    )}
                  </View>
                </View>
                <View style={styles.navbarCenter}>
                  <Text style={[styles.weekText, { fontSize: 12 * navScale }]}>
                    Week {state.time.week}
                  </Text>
                  <TopBar time={state.time} scale={navScale} />
                </View>
                <View style={[styles.navbarRight, { width: 80 * navScale }]}>
                  <View style={[styles.goldDisplay, { gap: 6 * navScale }]}>
                    <Image
                      source={COIN_ICON}
                      style={{ width: 28 * navScale, height: 28 * navScale }}
                      resizeMode="contain"
                    />
                    <Text style={[styles.goldValue, { fontSize: 24 * navScale }]}>
                      {state.player.stats.gold}
                    </Text>
                  </View>
                </View>
              </View>
              {!isCompact && (
                <View style={styles.bossTopContainer}>
                  <Sidebar
                    time={state.time}
                    stats={state.player.stats}
                    inventory={state.player.inventory}
                    inventoryCapacity={state.player.inventoryCapacity}
                    maxGearSlots={maxGearSlots}
                    isGauntletLayout={isGauntletLayout}
                    equippedTool={state.player.equippedTool}
                    activeItemsets={state.player.activeItemsets}
                    onlyBoss={true}
                  />
                </View>
              )}
            </View>

            {/* Bottom Area */}
            <View style={styles.bottomRow}>
              <View style={[styles.mapAreaContainer, isCompact && { flex: 1 }]}>
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
                  cameraFocusOverride={fastTravelFocus}
                />
                {mode !== 'guest' && hasActiveSession && (
                  <>
                    <Pressable style={styles.burnerOverlay} onPress={() => topUpBurner()}>
                      <BurnerBalanceIndicator
                        balance={burnerBalance}
                        isLowBalance={isBurnerLowBalance}
                        compact
                      />
                    </Pressable>
                    <Pressable
                      style={styles.exitSessionOverlay}
                      onPress={handleDebugExitSession}
                      disabled={isExitingSession}
                    >
                      <Text style={styles.debugExitText}>{isExitingSession ? '...' : 'X'}</Text>
                    </Pressable>
                  </>
                )}
                <DebugOverlay
                  debug={state.debug}
                  seed={state.seed}
                  phase={state.phase}
                  time={state.time}
                />

                {isFastTravelActive && (
                  <FastTravelOverlay
                    waypoints={fastTravelOverlayWaypoints}
                    selectedIndex={fastTravelSelectedIndex}
                    currentPosition={state.player.position}
                    overviewMode={overviewMode}
                    onCycle={() =>
                      setFastTravelSelectedIndex((prev) =>
                        fastTravelDestinations.length > 0
                          ? (prev + 1) % fastTravelDestinations.length
                          : 0
                      )
                    }
                    onConfirm={handleFastTravelConfirm}
                    onCancel={() => {
                      setIsFastTravelMode(false);
                      setFastTravelDestinations([]);
                    }}
                  />
                )}

                {!isController && (
                  <View
                    style={styles.dpadOverlay}
                    pointerEvents={overviewMode.active && !isFastTravelActive ? 'none' : 'auto'}
                  >
                    <DPadControls
                      onDirection={handleDirection}
                      size={120}
                      disabledDirections={disabledDirections}
                      onCenterPress={
                        isFastTravelActive
                          ? handleFastTravelConfirm
                          : poiInteraction.canInteract && state.phase === GamePhase.Exploration
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
                )}
              </View>
              {!isCompact && (
                <View style={styles.sidebarBottomContainer}>
                  <Sidebar
                    time={state.time}
                    stats={state.player.stats}
                    inventory={state.player.inventory}
                    inventoryCapacity={state.player.inventoryCapacity}
                    maxGearSlots={maxGearSlots}
                    isGauntletLayout={isGauntletLayout}
                    equippedTool={state.player.equippedTool}
                    activeItemsets={state.player.activeItemsets}
                    onItemInspect={handleInspectItem}
                    onToolInspect={handleInspectTool}
                    isRuneKilnActive={isItemSelectPoiActive}
                    handleInventoryItemPress={handleInventoryItemPress}
                    onlyContent={true}
                  />
                </View>
              )}
            </View>

            {/* Crossing Separators */}
            <CrossingLines navbarHeight={navbarHeight} isCompact={isCompact} />

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
              onFastTravel={handleFastTravel}
              selectableGear={selectableGear}
              onGearSelect={handleControllerGearSelect}
            />
          </View>

          {isCompact && (
            <View
              style={[styles.floatingSidebarWrapper, { top: navbarHeight }]}
              pointerEvents="box-none"
            >
              <ImageBackground
                source={SIDEBAR_BG}
                style={styles.floatingBossPanel}
                imageStyle={{ height: '100%' }}
                resizeMode="stretch"
              >
                <Sidebar
                  time={state.time}
                  stats={state.player.stats}
                  inventory={state.player.inventory}
                  inventoryCapacity={state.player.inventoryCapacity}
                  maxGearSlots={maxGearSlots}
                  isGauntletLayout={isGauntletLayout}
                  equippedTool={state.player.equippedTool}
                  activeItemsets={state.player.activeItemsets}
                  onlyBoss={true}
                  inlineBoss={true}
                />
              </ImageBackground>
              <ImageBackground
                source={SIDEBAR_BG}
                style={styles.floatingSidebarPanel}
                imageStyle={{ height: '100%' }}
                resizeMode="stretch"
              >
                <Sidebar
                  time={state.time}
                  stats={state.player.stats}
                  inventory={state.player.inventory}
                  inventoryCapacity={state.player.inventoryCapacity}
                  maxGearSlots={maxGearSlots}
                  isGauntletLayout={isGauntletLayout}
                  equippedTool={state.player.equippedTool}
                  activeItemsets={state.player.activeItemsets}
                  onItemInspect={handleInspectItem}
                  onToolInspect={handleInspectTool}
                  isRuneKilnActive={isItemSelectPoiActive}
                  handleInventoryItemPress={handleInventoryItemPress}
                  onlyContent={true}
                  floatingCompact={true}
                />
              </ImageBackground>
            </View>
          )}

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
  bossTopContainerCompact: { width: SIDEBAR_WIDTH, justifyContent: 'center', alignItems: 'center' },
  navbarDivider: {
    width: 2,
    height: '60%',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignSelf: 'center',
  },
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
  burnerOverlay: { position: 'absolute', top: 8, left: 8, zIndex: 10 },
  exitSessionOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#dc3545',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  goldDisplay: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coinIcon: { width: 28, height: 28 },
  goldValue: { fontFamily: Typography.number, fontSize: 24, fontWeight: 'bold', color: '#000000' },
  mapToggleButton: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  mapIcon: { width: 32, height: 32 },

  // Floating sidebar (compact mode)
  floatingSidebarWrapper: {
    position: 'absolute',
    right: 6,
    top: NAVBAR_HEIGHT,
    bottom: 0,
    justifyContent: 'center',
    gap: 24,
    zIndex: 150,
  },
  floatingBossPanel: {
    width: COMPACT_SIDEBAR_WIDTH,
    padding: 10,
    flexGrow: 0,
    overflow: 'hidden',
  },
  floatingSidebarPanel: {
    width: COMPACT_SIDEBAR_WIDTH,
    maxHeight: '60%',
    flexGrow: 0,
    overflow: 'hidden',
  },

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
