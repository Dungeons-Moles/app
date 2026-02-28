/**
 * GameScreen - Main exploration gameplay screen
 */

import React, { useCallback, useMemo, useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, ImageBackground, Image, Pressable } from 'react-native';
import { Connection, PublicKey } from '@solana/web3.js';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { RootStackParamList, CombatParams } from '../navigation';
import { useGame, GamePhase } from '../contexts/GameContext';
import { useSession } from '../contexts/SessionContext';
import { useProfile } from '../contexts/ProfileContext';
import { useGameplayStateContext } from '../contexts/GameplayStateContext';
import { useWallet } from '../contexts/WalletContext';
import { useAudio } from '../contexts/AudioContext';
import { useSettings } from '../contexts/SettingsContext';
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
  ItemsetTooltip,
} from '../components/game';
import { Sidebar } from '../components/game/Sidebar';
import { useFocusGlow } from '../components/ui/FocusGlow';
import { PauseMenuModal } from '../components/ui/PauseMenuModal';
import { TutorialModal } from '../components/ui/TutorialModal';
import { TUTORIAL_SEEN_KEY } from '../components/ui/tutorialPages';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDirectionInput } from '../hooks/useInput';
import { useLandscapeLock } from '../hooks/useOrientationLock';
import { useScreenVariant } from '../contexts/ScreenVariantContext';
import { useInputMode } from '../hooks/useInputMode';
import { useControllerAction } from '../hooks/useControllerAction';
import { OverviewPanController } from '../components/game/OverviewPanController';
import { Direction, DIRECTION_DELTA } from '../game/input/types';
import { TileType, MapEnemy, MapPOI } from '../game/map/types';
import { getDiscoveredWaypoints } from '../game/entities/pois';
import {
  canAffordCostAcrossPhases,
  selectDuelWeekBossForSeed,
  selectWeekBossForLevel,
} from '../game/time/progression';
import { Typography } from '../theme/typography';
import { useEquippedSkinImage } from '../hooks/useEquippedSkinImage';
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
import { LogAction, type BackendCombatLogEntry } from '../services/solana/types/combat_events';
import { calculateItemStats } from '@/game/entities/items';
import type { GauntletCombatVisualEvent } from '@/services/solana/gauntlet';
import { fetchGauntletEchoFromGameState } from '@/services/solana/gauntlet';
import { createGameplayStateProgram } from '@/services/solana/programs';
import { getGameStatePda } from '@/services/solana/gameplayState';
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
const PERF_DEBUG_LOGS = false;

function debugLog(...args: unknown[]) {
  if (__DEV__ && PERF_DEBUG_LOGS) {
    console.log(...args);
  }
}

type PlayerStats = {
  hp: number;
  maxHp: number;
  atk: number;
  arm: number;
  spd: number;
  dig: number;
  gold: number;
};

type InventoryFocusTarget = 'none' | 'player' | 'enemy';

function buildPlayerCombatant(stats: PlayerStats): CombatantState {
  // Defensive normalization: combat UI must never receive hp > maxHp.
  const normalizedMaxHp = Math.max(1, stats.maxHp);
  const normalizedHp = Math.min(Math.max(0, stats.hp), normalizedMaxHp);

  return {
    name: 'Player',
    emoji: '🧑‍🔧',
    definitionId: 'player',
    isPlayer: true,
    maxHp: normalizedMaxHp,
    hp: normalizedHp,
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
    enemyDefinitionId: bossId,
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
  // Limit echo gear to the week's capacity (+2 per week, matching on-chain progression)
  const maxGearSlots = Math.min(4 + (week - 1) * 2, 12);
  const echoGear = visual.echoGear
    .slice(0, maxGearSlots)
    .filter((g): g is NonNullable<typeof g> => g !== null)
    .map((g) => convertItemInstanceToGear(g))
    .filter((g): g is Gear => g !== null);

  const echoStats = calculateItemStats(echoTool, echoGear);
  const echoMaxHp = 15 + (echoStats.hp ?? 0);

  return {
    player: buildPlayerCombatant(playerStats),
    enemy: buildEnemyCombatant('Echo', '🪞', 'pvpOpponent', {
      hp: echoMaxHp,
      atk: echoStats.atk ?? 1,
      arm: echoStats.arm ?? 0,
      spd: echoStats.spd ?? 0,
      dig: echoStats.dig ?? 0,
    }),
    seed,
    enemyDefinitionId: 'pvpOpponent' as any,
    goldReward: 0,
    activeItemSets: activeItemsets as any[],
    playerGear,
    playerTool,
    playerGold,
    enemyTool: echoTool,
    enemyGear: echoGear,
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
 * Infer player's HP at combat start from backend combat log + final HP.
 * Uses raw on-chain final HP when available (can be negative before state clamp).
 */
function inferPlayerStartHpFromBackendLog(
  combatLog: BackendCombatLogEntry[] | undefined,
  finalPlayerHp: number | undefined
): number | null {
  if (!combatLog?.length || finalPlayerHp == null) return null;

  let playerDamageTaken = 0;
  let playerHealing = 0;

  for (const entry of combatLog) {
    switch (entry.action) {
      case LogAction.Attack:
        // Attack logs attacker side. isPlayer=false means enemy attacked player.
        if (!entry.isPlayer && entry.value > 0) playerDamageTaken += entry.value;
        break;
      case LogAction.StatusDamage:
        // StatusDamage logs target side. isPlayer=true means player took it.
        if (entry.isPlayer && entry.value > 0) playerDamageTaken += entry.value;
        break;
      case LogAction.NonWeaponDamage:
        // NonWeaponDamage logs target side. isPlayer=true means player took it.
        if (entry.isPlayer && entry.value > 0) playerDamageTaken += entry.value;
        break;
      case LogAction.ShrapnelRetaliation:
        // ShrapnelRetaliation logs attacker side. isPlayer=true means player took it.
        if (entry.isPlayer && entry.value > 0) playerDamageTaken += entry.value;
        break;
      case LogAction.Heal:
        // Heal logs target side. isPlayer=true means player healed.
        if (entry.isPlayer && entry.value > 0) playerHealing += entry.value;
        break;
      default:
        break;
    }
  }

  const inferred = finalPlayerHp + playerDamageTaken - playerHealing;
  return inferred > 0 ? inferred : null;
}

/**
 * Build fallback gauntlet combat params from on-chain echo data when visual parsing fails.
 * CombatScreen handles missing combatLog via startCombatWithOnchainOutcome — it runs the
 * local combat resolver for animation, then overrides with the on-chain outcome (win/loss).
 */
async function buildFallbackGauntletCombatParams(
  connection: Connection,
  gameStatePda: PublicKey,
  week: number,
  confirmedState: { hp: number; gold: number; isDead: boolean },
  playerStats: PlayerStats,
  playerGear: Gear[],
  playerTool: Tool | null,
  activeItemsets: string[],
  seed: number
): Promise<CombatParams | null> {
  try {
    const program = createGameplayStateProgram(connection);
    const echoPreview = await fetchGauntletEchoFromGameState(program, gameStatePda, week);
    if (!echoPreview) {
      console.warn('[GameScreen] buildFallbackGauntletCombatParams: no echo data for week', week);
      return null;
    }

    const echoTool = echoPreview.tool ? convertItemInstanceToTool(echoPreview.tool) : null;
    const maxGearSlots = Math.min(4 + (week - 1) * 2, 12);
    const echoGear = echoPreview.gear
      .slice(0, maxGearSlots)
      .filter((g): g is NonNullable<typeof g> => g !== null)
      .map((g) => convertItemInstanceToGear(g))
      .filter((g): g is Gear => g !== null);

    const echoStats = calculateItemStats(echoTool, echoGear);
    const echoMaxHp = 15 + (echoStats.hp ?? 0);

    return {
      player: buildPlayerCombatant(playerStats),
      enemy: buildEnemyCombatant('Echo', '🪞', 'pvpOpponent', {
        hp: echoMaxHp,
        atk: echoStats.atk ?? 1,
        arm: echoStats.arm ?? 0,
        spd: echoStats.spd ?? 0,
        dig: echoStats.dig ?? 0,
      }),
      seed,
      enemyDefinitionId: 'pvpOpponent' as any,
      goldReward: 0,
      activeItemSets: activeItemsets as any[],
      playerGear,
      playerTool,
      playerGold: playerStats.gold,
      enemyTool: echoTool,
      enemyGear: echoGear,
      week: Math.min(Math.max(week, 1), 3) as 1 | 2 | 3,
      isBossFight: false,
      // No combatLog — CombatScreen will use local resolver + outcome override
      onChainOutcome: {
        finalPlayerHp: confirmedState.hp,
        finalPlayerGold: confirmedState.gold,
        playerWon: !confirmedState.isDead,
      },
    };
  } catch (err) {
    console.warn('[GameScreen] buildFallbackGauntletCombatParams failed:', err);
    return null;
  }
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
  const { mode, profile } = useProfile();
  const playerSkinSource = useEquippedSkinImage(profile?.equippedSkin);
  const {
    hasActiveSession,
    movePlayer,
    triggerBoss,
    gameplayState: onChainState,
    gameplaySyncStatus,
    sessionKey,
    sessionPda,
    mapSeed,
    currentLevel,
    forceAbandonCurrentSession,
  } = useSession();
  const { wallet } = useWallet();
  const { gameplayConnection } = useSolanaConnection();
  const { refreshMapEntities, pois: onChainPois } = useGameplayStateContext();
  const variant = useScreenVariant();
  const nightMovement = useNightMovement();
  const poiInteraction = usePoiInteraction();
  const { playBgm, playSfx } = useAudio();
  const { autoOpenPOI } = useSettings();
  const isFocused = useIsFocused();
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const stateRef = useRef(state);
  stateRef.current = state;
  const onChainStateRef = useRef(onChainState);
  onChainStateRef.current = onChainState;

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
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
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
  const [inventoryFocus, setInventoryFocus] = useState<InventoryFocusTarget>('none');
  const [focusedSlotIndex, setFocusedSlotIndex] = useState(0);
  const sidebarPlayerRef = useFocusGlow(inventoryFocus === 'player');
  const sidebarEnemyRef = useFocusGlow(inventoryFocus === 'enemy');
  const [totalEchoSlots, setTotalEchoSlots] = useState(0);
  const echoEquipmentRef = useRef<{ gear: Gear[]; tool: Tool | null }>({ gear: [], tool: null });

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
  }, []);

  // Auto-show tutorial on first session entry
  useEffect(() => {
    AsyncStorage.getItem(TUTORIAL_SEEN_KEY).then((seen) => {
      if (!seen) setShowTutorial(true);
    });
  }, []);

  // Auto-close tutorial on combat/boss transitions
  useEffect(() => {
    if (state?.phase === GamePhase.Combat || state?.phase === GamePhase.BossFight) {
      setShowTutorial(false);
    }
  }, [state?.phase]);

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
  // Deps use specific scalar fields instead of full `state`/`onChainState` objects
  // to avoid re-firing on every unrelated state change.
  const localPosX = state?.player?.position?.x;
  const localPosY = state?.player?.position?.y;
  const localHp = state?.player?.stats?.hp;
  const localMovesRemaining = state?.time?.movesRemaining;
  const localPhase = state?.phase;
  const chainPosX = onChainState?.positionX;
  const chainPosY = onChainState?.positionY;
  const chainHp = onChainState?.hp;
  const chainMovesRemaining = onChainState?.movesRemaining;
  const onChainSessionMatchesActive =
    !!onChainState && !!sessionPda && onChainState.session.equals(sessionPda);
  useEffect(() => {
    const currentState = stateRef.current;
    const currentOnChain = onChainStateRef.current;
    if (
      !currentState ||
      !currentOnChain ||
      !onChainSessionMatchesActive ||
      mode === 'guest' ||
      gameplaySyncStatus !== 'synced' ||
      localPhase !== GamePhase.Exploration ||
      isMovePending ||
      !isFocused ||
      skipMismatchDetectionRef.current ||
      poiInteraction.isInteracting
    ) {
      return;
    }

    const hasMismatch =
      localPosX !== chainPosX ||
      localPosY !== chainPosY ||
      localHp !== chainHp ||
      localMovesRemaining !== chainMovesRemaining;

    if (hasMismatch) {
      debugLog('[GameScreen] Mismatch detected, syncing:', {
        localBaseHp: currentState.player.baseStats.hp,
        localStatsHp: localHp,
        onChainHp: chainHp,
        localPos: currentState.player.position,
        onChainPos: { x: chainPosX, y: chainPosY },
      });
      dispatch({ type: 'SYNC_MOVE', confirmedState: currentOnChain });
    }
  }, [
    dispatch,
    gameplaySyncStatus,
    mode,
    localPosX,
    localPosY,
    localHp,
    localMovesRemaining,
    localPhase,
    chainPosX,
    chainPosY,
    chainHp,
    chainMovesRemaining,
    onChainSessionMatchesActive,
    isMovePending,
    isFocused,
    poiInteraction.isInteracting,
  ]);

  // Boss fight detection: trigger boss fight when on-chain state has bossFightReady.
  // This handles all cases: direct (no field combat on last move) and deferred
  // (returning from field enemy CombatScreen after the same move set bossFightReady).
  const isTriggeringBossRef = useRef(false);
  const isRestoringSessionRef = useRef(false);

  // Reset isTriggeringBossRef when screen regains focus (e.g., returning from
  // CombatScreen/VictoryScreen). This ensures future boss fights can trigger.
  useEffect(() => {
    if (isFocused) {
      isTriggeringBossRef.current = false;
    }
  }, [isFocused]);

  // Audio: Handle exploration BGM based on phase + night transition SFX
  // Track whether this is the first BGM play for the current session.
  // On session entry (start/resume), play from the beginning; within a session
  // (e.g. returning from combat), resume from saved position.
  const sessionFreshBgmRef = useRef(true);
  useEffect(() => {
    if (!state) {
      sessionFreshBgmRef.current = true;
    }
  }, [state]);

  const prevPhaseRef = useRef(state?.time?.phase);
  useEffect(() => {
    if (!state || !isFocused) return;

    const currentPhase = state.time?.phase;
    const isNight = currentPhase === 'NIGHT';

    // Play night transition SFX when switching from DAY to NIGHT
    if (isNight && prevPhaseRef.current === 'DAY') {
      playSfx('phase_night');
    }
    prevPhaseRef.current = currentPhase;

    // On session entry, start exploration music from the beginning.
    // Within an active session (e.g. returning from combat), resume from saved position.
    const shouldResume = !sessionFreshBgmRef.current;
    sessionFreshBgmRef.current = false;

    playBgm(isNight ? 'exploration_night' : 'exploration_day', { resume: shouldResume, crossfade: true });
  }, [state?.time?.phase, isFocused, playBgm, playSfx]);

  useEffect(() => {
    if (!isFocused || state || !hasActiveSession || !sessionPda || isRestoringSessionRef.current) {
      return;
    }

    isRestoringSessionRef.current = true;
    debugLog('[GameScreen] Auto-restoring active session from chain...', {
      sessionPda: sessionPda.toBase58(),
      currentLevel,
    });

    fetchFullSessionState(gameplayConnection, sessionPda)
      .then((restored) => {
        if (!restored) {
          console.warn('[GameScreen] Auto-restore failed: fetchFullSessionState returned null');
          return;
        }
        dispatch({ type: 'RESTORE_GAME', state: restored });
        debugLog('[GameScreen] Auto-restore completed');
      })
      .catch((err) => {
        console.error('[GameScreen] Auto-restore failed with error:', err);
      })
      .finally(() => {
        isRestoringSessionRef.current = false;
      });
  }, [isFocused, state, hasActiveSession, sessionPda, currentLevel, gameplayConnection, dispatch]);

  useEffect(() => {
    if (
      !isFocused ||
      !onChainState?.bossFightReady ||
      !state ||
      mode === 'guest' ||
      isTriggeringBossRef.current ||
      isMovePending ||
      state.phase === GamePhase.POIInteraction
    ) {
      return;
    }

    // Gauntlet echo combat normally resolves inline in move_player — the move
    // handler navigates to CombatScreen. This fires as a safety net when:
    // (a) move handler missed the echo (visual parsing failure), or
    // (b) skip_to_day set bossFightReady without resolving the echo.
    if (onChainState.runMode === RunMode.Gauntlet) {
      if (onChainState.isDead) {
        isTriggeringBossRef.current = true;
        // Try to show echo combat with on-chain data before falling back to DeathScreen
        if (sessionPda && state) {
          const [gsPda] = getGameStatePda(sessionPda);
          buildFallbackGauntletCombatParams(
            gameplayConnection,
            gsPda,
            onChainState.week,
            { hp: onChainState.hp, gold: onChainState.gold, isDead: true },
            {
              hp: Math.max(state.player.stats.maxHp, 1),
              maxHp: state.player.stats.maxHp,
              atk: state.player.stats.atk,
              arm: state.player.stats.arm,
              spd: state.player.stats.spd,
              dig: state.player.stats.dig,
              gold: onChainState.gold,
            },
            state.player.inventory.map((slot) => slot.item),
            state.player.equippedTool,
            state.player.activeItemsets ?? [],
            state.rngState
          )
            .then((params) => {
              if (params) {
                navigateToCombat(navigation, params, onChainState);
              } else {
                navigateToDeath(navigation, onChainState, `Week ${onChainState.week} Echo`);
              }
            })
            .catch(() => {
              navigateToDeath(navigation, onChainState, `Week ${onChainState.week} Echo`);
            });
        } else {
          navigateToDeath(navigation, onChainState, `Week ${onChainState.week} Echo`);
        }
      }
      return;
    }

    const resolvedWeekBoss: BossId | null =
      onChainState.runMode === RunMode.Duel &&
      (state.time.week === 1 || state.time.week === 2) &&
      mapSeed != null
        ? selectDuelWeekBossForSeed(mapSeed, state.time.week)
        : (state.time.weekBoss ?? null);
    if (!resolvedWeekBoss) {
      console.warn('[GameScreen] bossFightReady but no weekBoss defined');
      return;
    }

    // Guard: if local HP doesn't match on-chain HP, sync first and let the
    // effect re-run on the next render with the correct HP value.
    if (state.player.stats.hp !== onChainState.hp) {
      dispatch({ type: 'SYNC_MOVE', confirmedState: onChainState });
      return;
    }

    isTriggeringBossRef.current = true;
    debugLog('[GameScreen] Weekly fight detected via on-chain state, triggering:', {
      weekBoss: resolvedWeekBoss ?? null,
      resolvedWeekBoss: resolvedWeekBoss ?? null,
      runMode: onChainState.runMode,
      week: state.time.week,
      playerHp: onChainState.hp,
    });

    (async () => {
      // Campaign and Duel (weeks 1-2) resolve the boss inline on-chain (either
      // inside move_player or when a POI interaction exhausts remaining moves).
      // The move handler normally navigates to CombatScreen for these cases, but
      // when the boss is triggered by a POI interaction (e.g., Rest Alcove consuming
      // the last moves on Night 3), the move handler doesn't fire. This guard
      // catches both scenarios — wins AND losses — and shows CombatScreen via the
      // local resolver so the player always sees the boss fight animation.
      const bossAlreadyResolvedInline =
        onChainState.runMode === RunMode.Campaign ||
        (onChainState.runMode === RunMode.Duel &&
          // For deaths the week stays the same; for wins the week already advanced.
          // Week 1 death → state.time.week=1, Week 1 win → state.time.week=2.
          // Week 2 death → state.time.week=2, Week 2 win → state.time.week=3.
          // So we check both the current week and the previous week.
          (state.time.week <= 2 || (!onChainState.isDead && state.time.week === 3)));

      if (bossAlreadyResolvedInline) {
        // When the player won, the week already advanced on-chain, so
        // resolvedWeekBoss points at the NEXT week's boss. Compute the
        // correct (just-fought) boss from the previous week instead.
        const playerWon = !onChainState.isDead;
        const foughtWeek = playerWon ? ((state.time.week - 1) as 1 | 2 | 3) : state.time.week;
        const foughtBoss: BossId | null =
          onChainState.runMode === RunMode.Duel &&
          (foughtWeek === 1 || foughtWeek === 2) &&
          mapSeed != null
            ? selectDuelWeekBossForSeed(mapSeed, foughtWeek)
            : selectWeekBossForLevel(onChainState.campaignLevel, foughtWeek);

        if (!foughtBoss) {
          console.warn(
            '[GameScreen] Boss already resolved inline but no boss ID for week',
            foughtWeek
          );
          isTriggeringBossRef.current = false;
          return;
        }

        debugLog(
          '[GameScreen] Boss already resolved inline, navigating to CombatScreen with local resolver:',
          { playerWon, foughtWeek, foughtBoss }
        );
        const playerStats = {
          hp: Math.max(state.player.stats.maxHp, 1),
          maxHp: state.player.stats.maxHp,
          atk: state.player.stats.atk,
          arm: state.player.stats.arm,
          spd: state.player.stats.spd,
          dig: state.player.stats.dig,
          gold: onChainState.gold,
        };
        const bossCombatParams = createBossCombatParams(
          foughtBoss,
          playerStats,
          state.player.inventory.map((slot) => slot.item),
          state.player.equippedTool,
          state.player.activeItemsets ?? [],
          state.rngState,
          foughtWeek,
          undefined, // No combat log available — local resolver will simulate
          {
            finalPlayerHp: onChainState.hp,
            finalPlayerGold: onChainState.gold,
            playerWon,
          }
        );
        navigateToCombat(navigation, bossCombatParams, {
          campaignLevel: onChainState.campaignLevel,
          totalMoves: onChainState.totalMoves,
          phase: onChainState.phase,
        });
        return;
      }

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
        // Trigger weekly combat on-chain (boss/echo for Gauntlet, or Duel week 3)
        const bossResult = await triggerBoss();
        if (!bossResult.success) {
          console.error('[GameScreen] triggerBoss on-chain weekly resolver failed');
        }

        const bossCombatParams = createBossCombatParams(
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

        debugLog('[GameScreen] Navigating to CombatScreen for weekly fight:', {
          bossId: resolvedWeekBoss ?? null,
          enemyName: bossCombatParams.enemy.name,
          playerHp: playerStats.hp,
          week: state.time.week,
          hasOnChainOutcome: bossResult.success,
          hasCombatLog: !!bossResult.combatLog,
          combatLogEntries: bossResult.combatLog?.length ?? 0,
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
    sessionPda,
    gameplayConnection,
  ]);

  // Dead gauntlet session recovery: when a gauntlet player is dead but no
  // boss or combat handler navigated to DeathScreen (e.g., visual parsing
  // failed, or session was resumed after death).
  useEffect(() => {
    if (
      !isFocused ||
      !onChainState?.isDead ||
      onChainState?.runMode !== RunMode.Gauntlet ||
      !state ||
      mode === 'guest' ||
      isTriggeringBossRef.current ||
      isMovePending
    ) {
      return;
    }

    debugLog('[GameScreen] Dead gauntlet session detected, navigating to DeathScreen');
    isTriggeringBossRef.current = true;
    navigateToDeath(navigation, onChainState, `Week ${onChainState.week} Echo`);
  }, [
    isFocused,
    onChainState?.isDead,
    onChainState?.runMode,
    onChainState?.totalMoves,
    onChainState?.campaignLevel,
    onChainState?.week,
    onChainState?.phase,
    state,
    mode,
    isMovePending,
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
      debugLog('[GameScreen] Debug: Force abandoning session...');
      const result = await forceAbandonCurrentSession();
      if (result.success) {
        debugLog('[GameScreen] Debug: Session abandoned successfully');
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
    if (!state?.map) return [];

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
  }, [state?.map, onChainPois]);

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

      // Read state from ref — avoids rebuilding this callback on every state change
      const state = stateRef.current;

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
        debugLog('[GameScreen] Using local MOVE (guest or no session)');

        // Play movement audio and show feedback matching on-chain behavior
        const isWall = state.map.tiles[targetPos.y][targetPos.x] === TileType.Wall;
        if (isWall) {
          const isHighlighted =
            state.wallHighlight &&
            state.wallHighlight.direction === direction &&
            state.wallHighlight.targetPosition.x === targetPos.x &&
            state.wallHighlight.targetPosition.y === targetPos.y;

          if (!isHighlighted) {
            // First tap on wall: highlighting or error
            if (state.player.stats.dig < 1) {
              showWallBreakFeedback('Requires DIG to break walls');
              playSfx('ui_error');
            } else {
              playSfx('ui_hover');
            }
          } else {
            // Second tap on highlighted wall: breaking or error
            if (
              state.wallHighlight &&
              !canAffordCostAcrossPhases(state.time, state.wallHighlight.cost)
            ) {
              showWallBreakFeedback(`Not enough moves (need ${state.wallHighlight.cost})`);
              playSfx('ui_error');
            } else {
              playSfx('move_dig');
            }
          }
        } else {
          playSfx('move_floor');
        }

        dispatch({ type: 'MOVE', direction });
        return;
      }
      debugLog('[GameScreen] Using on-chain move path');

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
          if (state.player.stats.dig < 1) {
            showWallBreakFeedback('Requires DIG to break walls');
            playSfx('ui_error');
          } else {
            // Highlighting a wall
            playSfx('ui_hover');
          }
          return;
        }

        // Second tap on highlighted wall: check cost before sending
        if (
          state.wallHighlight &&
          !canAffordCostAcrossPhases(state.time, state.wallHighlight.cost)
        ) {
          showWallBreakFeedback(`Not enough moves (need ${state.wallHighlight.cost})`);
          playSfx('ui_error');
          return;
        }
      }

      // Play appropriate movement sound immediately upon confirming the move direction
      playSfx(isWall ? 'move_dig' : 'move_floor');

      // On-chain-first: send transaction, await confirmation, then sync local state
      isMovePendingRef.current = true;
      setIsMovePending(true);
      debugLog('[GameScreen] Sending on-chain move to', targetPos.x, targetPos.y);

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
        .then(async (result) => {
          debugLog(
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
            // Use previousState phase: on the last night move, newState has already
            // transitioned to the next day, but enemies moved during the night phase
            const wasNightPhase = result.previousState
              ? result.previousState.phase === 1 || // Night1
                result.previousState.phase === 3 || // Night2
                result.previousState.phase === 5 // Night3
              : false;

            if (sessionPda && wasNightPhase) {
              refreshMapEntities(sessionPda)
                .then((data) => {
                  if (data?.enemies && data.enemies.length > 0) {
                    debugLog(
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

            // Handle inline boss resolution (Campaign, Duel weeks 1-2, Gauntlet).
            // The boss fight was already resolved inside move_player on-chain —
            // no separate trigger_boss_fight transaction is needed.
            if (result.bossResolvedInline && result.newState) {
              // Gauntlet: echo combat auto-resolved inline in move_player
              if (result.newState.runMode === RunMode.Gauntlet) {
                isTriggeringBossRef.current = true;

                if (result.gauntletCombatVisual) {
                  // Happy path: visual parsed → navigate with full combat log
                  const gauntletCombatParams = createGauntletCombatParams(
                    result.gauntletCombatVisual,
                    preCombatPlayerStats,
                    preCombatGear,
                    preCombatTool,
                    preCombatItemsets,
                    preCombatSeed,
                    currentWeek,
                    result.newState.gold
                  );

                  debugLog(
                    '[GameScreen] Inline gauntlet echo resolved in move_player, navigating to CombatScreen:',
                    {
                      week: currentWeek,
                      playerWon: result.gauntletCombatVisual.playerWon,
                      postHp: result.newState.hp,
                    }
                  );

                  navigateToCombat(navigation, gauntletCombatParams, result.newState);
                  return;
                }

                // Fallback: visual parsing failed, build params from on-chain echo data
                console.warn(
                  '[GameScreen] Gauntlet visual parsing failed, attempting fallback from on-chain echo data'
                );
                if (sessionPda) {
                  const [gsPda] = getGameStatePda(sessionPda);
                  const fallback = await buildFallbackGauntletCombatParams(
                    gameplayConnection,
                    gsPda,
                    currentWeek,
                    { hp: result.newState.hp, gold: result.newState.gold, isDead: !!result.isDead },
                    preCombatPlayerStats,
                    preCombatGear,
                    preCombatTool,
                    preCombatItemsets,
                    preCombatSeed
                  );
                  if (fallback) {
                    debugLog(
                      '[GameScreen] Fallback gauntlet combat params built, navigating to CombatScreen'
                    );
                    navigateToCombat(navigation, fallback, result.newState);
                    return;
                  }
                }

                // Last resort: dead → DeathScreen, alive → state already advanced
                if (result.isDead) {
                  navigateToDeath(navigation, result.newState, `Week ${currentWeek} Echo`);
                  return;
                }
                // Player won, state advanced to next week, continue exploration
                return;
              }

              // Campaign / Duel: boss fight auto-resolved inline in move_player
              const resolvedWeekBoss: BossId | null =
                result.newState.runMode === RunMode.Duel &&
                (currentWeek === 1 || currentWeek === 2) &&
                mapSeed != null
                  ? selectDuelWeekBossForSeed(mapSeed, currentWeek)
                  : (state.time.weekBoss ?? null);

              if (resolvedWeekBoss) {
                // Prevent the boss useEffect from also triggering
                isTriggeringBossRef.current = true;

                const bossPlayerHp = result.preBossPlayerHp ?? preCombatPlayerStats.hp;
                const bossPlayerStats: PlayerStats = {
                  hp: bossPlayerHp,
                  maxHp: preCombatPlayerStats.maxHp,
                  atk: preCombatPlayerStats.atk,
                  arm: preCombatPlayerStats.arm,
                  spd: preCombatPlayerStats.spd,
                  dig: preCombatPlayerStats.dig,
                  gold: preCombatPlayerStats.gold,
                };

                const bossCombatParams = createBossCombatParams(
                  resolvedWeekBoss,
                  bossPlayerStats,
                  preCombatGear,
                  preCombatTool,
                  preCombatItemsets,
                  preCombatSeed,
                  currentWeek,
                  result.bossCombatLog,
                  {
                    finalPlayerHp: result.newState.hp,
                    finalPlayerGold: result.newState.gold,
                    playerWon: !result.isDead,
                  }
                );

                debugLog(
                  '[GameScreen] Inline boss resolved in move_player, navigating to CombatScreen:',
                  {
                    bossId: resolvedWeekBoss,
                    preBossHp: bossPlayerHp,
                    postBossHp: result.newState.hp,
                    playerWon: !result.isDead,
                    hasCombatLog: !!result.bossCombatLog,
                    combatLogEntries: result.bossCombatLog?.length ?? 0,
                  }
                );

                navigateToCombat(navigation, bossCombatParams, result.newState);
                return; // Skip field enemy combat handling below
              }
            }

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
                  debugLog(
                    '[GameScreen] Found enemy at player position (night combat):',
                    combatEnemy.definitionId
                  );
                }
              }

              if (combatEnemy) {
                // Combat was resolved on-chain during move_player.
                // Navigate to CombatScreen to show combat replay.
                debugLog('[GameScreen] Combat occurred with enemy:', {
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
                debugLog('[GameScreen] Navigating to CombatScreen with params:', {
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
                  debugLog(
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
              debugLog('[GameScreen] Player died (non-combat), navigating to DeathScreen');
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
      mode,
      hasActiveSession,
      movePlayer,
      isMovePending,
      navigation,
      sessionPda,
      mapSeed,
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

    playSfx('ui_click');
    // Guest mode: teleport player locally
    if (mode === 'guest' || !hasActiveSession) {
      debugLog('[GameScreen] Guest mode fast travel to', dest.x, dest.y);
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

  const maxGearSlots = onChainState?.runMode === RunMode.Gauntlet ? 12 : 8;
  const isGauntletLayout = onChainState?.runMode === RunMode.Gauntlet;
  const activeItemsetsCount = state?.player?.activeItemsets?.length ?? 0;
  const totalPlayerSlots = maxGearSlots + 1 + activeItemsetsCount; // gear slots + weapon slot + itemset slots

  const getPlayerItemAtSlot = useCallback(
    (index: number): Tool | Gear | null => {
      if (!state) return null;
      if (index === maxGearSlots) return state.player.equippedTool;
      const slot = state.player.inventory.find((s) => s.index === index);
      return slot?.item ?? null;
    },
    [state, maxGearSlots]
  );

  const getEchoItemAtSlot = useCallback(
    (index: number): Tool | Gear | null => {
      if (totalEchoSlots === 0) return null;
      const weaponIndex = totalEchoSlots - 1;
      if (index === weaponIndex) return echoEquipmentRef.current.tool;
      return echoEquipmentRef.current.gear[index] ?? null;
    },
    [totalEchoSlots]
  );

  const handleEchoEquipmentLoaded = useCallback(
    (gear: Gear[], tool: Tool | null, slotCount: number) => {
      echoEquipmentRef.current = { gear, tool };
      setTotalEchoSlots(slotCount);
    },
    []
  );

  useDirectionInput(handleDirection, {
    enabled: state?.phase === GamePhase.Exploration && !isController,
    blocked: overviewMode.active && !isFastTravelActive,
  });

  // --- Controller: D-PAD for movement, Y for map, A for POI/fast-travel confirm ---
  // When inventoryFocus is active, D-PAD navigates the 4-column inventory grid,
  // A inspects items, and B/R1/L1 exits focus mode.
  const isPOIModalOpen = state?.phase === GamePhase.POIInteraction;
  const controllerEnabled =
    isController && isFocused && !!state && !isPOIModalOpen && !showPauseMenu && !showTutorial;

  // Compact view sidebar toggle via X — kept separate so it works even when POI modal is open
  const [isCompactSidebarVisible, setIsCompactSidebarVisible] = useState(true);
  const sidebarToggleEnabled = isController && isFocused && !!state && !showPauseMenu && !showTutorial;

  useControllerAction(
    {
      onX: () => {
        const isCompact = variant === 'compact';
        if (isCompact) {
          if (inventoryFocus !== 'none' && isCompactSidebarVisible) {
            return; // Ignore hiding if currently focused on inventory
          }
          setIsCompactSidebarVisible((prev) => !prev);
        }
      },
    },
    sidebarToggleEnabled
  );

  useControllerAction(
    {
      onDPadUp: () => {
        if (inventoryFocus !== 'none') {
          setFocusedSlotIndex((prev) => {
            if (inventoryFocus === 'player') {
              // If in itemset zone, go back to weapon
              if (prev > maxGearSlots) return maxGearSlots;
              if (prev === maxGearSlots) {
                // Weapon → last gear row (column 0)
                const lastRowStart = Math.max(0, maxGearSlots - (maxGearSlots % 4 || 4));
                return Math.min(lastRowStart, maxGearSlots - 1);
              }
              if (prev >= 4) return prev - 4;
              return prev;
            }
            // echo focus (no itemsets, original logic)
            const gearMax = totalEchoSlots - 1;
            if (prev === gearMax) {
              const lastRowStart = Math.max(0, gearMax - (gearMax % 4 || 4));
              return Math.min(lastRowStart, gearMax - 1);
            }
            if (prev >= 4) return prev - 4;
            return prev;
          });
          return;
        }
        handleDirection(Direction.Up);
      },
      onDPadDown: () => {
        if (inventoryFocus !== 'none') {
          setFocusedSlotIndex((prev) => {
            if (inventoryFocus === 'player') {
              // In itemset zone
              if (prev > maxGearSlots) {
                const lastItemsetIndex = maxGearSlots + activeItemsetsCount;
                if (prev >= lastItemsetIndex) return prev;
                return prev + 1;
              }
              // At weapon — go to first itemset if any
              if (prev === maxGearSlots) {
                if (activeItemsetsCount > 0) return maxGearSlots + 1;
                return prev;
              }
              // In gear zone
              const nextRow = prev + 4;
              if (nextRow >= maxGearSlots) return maxGearSlots;
              return nextRow;
            }
            // echo focus (no itemsets, original logic)
            const gearMax = totalEchoSlots - 1;
            if (prev >= gearMax) return prev;
            const nextRow = prev + 4;
            if (nextRow >= gearMax) return gearMax;
            return nextRow;
          });
          return;
        }
        handleDirection(Direction.Down);
      },
      onDPadLeft: () => {
        if (inventoryFocus !== 'none') {
          setFocusedSlotIndex((prev) => {
            if (inventoryFocus === 'player') {
              // In itemset zone — navigate left between itemsets
              if (prev > maxGearSlots) {
                if (prev <= maxGearSlots + 1) return prev;
                return prev - 1;
              }
              if (prev === maxGearSlots) return prev; // weapon, no left/right
              if (prev % 4 === 0) return prev;
              return prev - 1;
            }
            // echo focus
            const gearMax = totalEchoSlots - 1;
            if (prev === gearMax) return prev;
            if (prev % 4 === 0) return prev;
            return prev - 1;
          });
          return;
        }
        handleDirection(Direction.Left);
      },
      onDPadRight: () => {
        if (inventoryFocus !== 'none') {
          setFocusedSlotIndex((prev) => {
            if (inventoryFocus === 'player') {
              // In itemset zone — navigate right between itemsets
              if (prev > maxGearSlots) {
                const lastItemsetIndex = maxGearSlots + activeItemsetsCount;
                if (prev >= lastItemsetIndex) return prev;
                return prev + 1;
              }
              if (prev === maxGearSlots) return prev; // weapon, no left/right
              if (prev % 4 === 3) return prev;
              if (prev + 1 >= maxGearSlots) return prev;
              return prev + 1;
            }
            // echo focus
            const gearMax = totalEchoSlots - 1;
            if (prev === gearMax) return prev;
            if (prev % 4 === 3) return prev;
            if (prev + 1 >= gearMax) return prev;
            return prev + 1;
          });
          return;
        }
        handleDirection(Direction.Right);
      },
      onY: () => {
        if (!isFastTravelActive) {
          playSfx('map_reveal');
          toggleOverviewMode();
        }
      },
      onA: () => {
        if (inventoryFocus === 'player') {
          if (focusedSlotIndex > maxGearSlots) {
            // Itemset slot
            const itemsetIndex = focusedSlotIndex - maxGearSlots - 1;
            const itemsetId = state?.player?.activeItemsets?.[itemsetIndex];
            if (itemsetId)
              handleInspectItemset(itemsetId as import('../game/engine/types').ItemsetId);
          } else if (focusedSlotIndex === maxGearSlots) {
            if (state?.player?.equippedTool) handleInspectTool(state.player.equippedTool);
          } else {
            const item = getPlayerItemAtSlot(focusedSlotIndex);
            if (item) handleInspectItem(item);
          }
          return;
        }
        if (inventoryFocus === 'enemy') {
          const item = getEchoItemAtSlot(focusedSlotIndex);
          if (item) handleInspectItem(item);
          return;
        }
        if (isFastTravelActive) {
          handleFastTravelConfirm();
        } else if (poiInteraction.canInteract && state?.phase === GamePhase.Exploration) {
          poiInteraction.interact();
        }
      },
      onB: () => {
        if (isItemsetTooltipVisible) {
          handleCloseItemsetTooltip();
          return;
        }
        if (isTooltipVisible) {
          handleCloseTooltip();
          return;
        }
        if (inventoryFocus !== 'none') {
          setInventoryFocus('none');
          return;
        }
        if (isFastTravelActive) {
          setIsFastTravelMode(false);
          setFastTravelDestinations([]);
        } else if (overviewMode.active) {
          toggleOverviewMode();
        }
      },
      onR1: () => {
        const isCompact = variant === 'compact';
        if (isCompact && !isCompactSidebarVisible) return;

        if (inventoryFocus === 'player') {
          setInventoryFocus('none');
        } else {
          setInventoryFocus('player');
          setFocusedSlotIndex(0);
        }
      },
      onL1: () => {
        if (!isGauntletLayout) return;

        const isCompact = variant === 'compact';
        if (isCompact && !isCompactSidebarVisible) return;

        if (inventoryFocus === 'enemy') {
          setInventoryFocus('none');
        } else {
          setInventoryFocus('enemy');
          setFocusedSlotIndex(0);
        }
      },
      onStart: () => setShowPauseMenu(true),
      onSelect: () => setShowTutorial(true),
    },
    controllerEnabled
  );

  // Reset inventory focus when leaving exploration phase
  useEffect(() => {
    if (state?.phase !== GamePhase.Exploration) {
      setInventoryFocus('none');
    }
  }, [state?.phase]);

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

  // Extract stable values from poiInteraction to avoid re-triggering on every hook state change.
  // poiInteract is stored in a ref because it has 15+ deps and changes reference frequently,
  // but the effect only needs to call it — not re-run when it changes.
  const { shouldAutoOpen, isInteracting, interact: poiInteract } = poiInteraction;
  const poiInteractRef = useRef(poiInteract);
  poiInteractRef.current = poiInteract;

  useEffect(() => {
    if (!autoOpenPOI) return;
    if (!state?.player?.position || state.phase !== GamePhase.Exploration || !isFocused) return;
    const currentPos = state.player.position;
    const lastAutoPos = lastAutoTriggeredPosRef.current;

    const alreadyTriggeredHere =
      lastAutoPos && lastAutoPos.x === currentPos.x && lastAutoPos.y === currentPos.y;

    if (shouldAutoOpen && !isInteracting && !alreadyTriggeredHere) {
      debugLog('[GameScreen] Auto-triggering POI interaction at', currentPos.x, currentPos.y);
      lastAutoTriggeredPosRef.current = { x: currentPos.x, y: currentPos.y };
      poiInteractRef.current();
    }

    // Clear last auto-triggered position when player moves away from it
    if (lastAutoPos && (lastAutoPos.x !== currentPos.x || lastAutoPos.y !== currentPos.y)) {
      lastAutoTriggeredPosRef.current = null;
    }
  }, [
    autoOpenPOI,
    state?.player?.position,
    state?.phase,
    shouldAutoOpen,
    isInteracting,
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
      debugLog(
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
        debugLog(
          '[GameScreen] handlePOIOption: DEFERRED path | type:',
          poiInteraction.deferredPoiType,
          '| selectedItem:',
          selectedItem?.name ?? 'none'
        );
        poiInteraction.confirmPoiSelection(optionIndex).then((result) => {
          debugLog('[GameScreen] confirmPoiSelection result:', result);
          if (result.success) {
            // Boss resolved during POI (e.g., Rest Alcove on Night 3) — show CombatScreen
            if (result.bossResolved && state) {
              const {
                playerWon,
                finalPlayerHp,
                finalPlayerGold,
                totalMoves,
                phase,
                combatLog,
                preBossPlayerHp,
                turnsTaken,
                finalEnemyHp,
                rawFinalPlayerHp,
                signature,
              } = result.bossResolved;
              // state.time.week is pre-POI (closure captures pre-dispatch value),
              // which is the correct fought week for both wins and losses.
              const foughtWeek = state.time.week as 1 | 2 | 3;
              const foughtBoss: BossId | null =
                onChainState?.runMode === RunMode.Duel &&
                (foughtWeek === 1 || foughtWeek === 2) &&
                mapSeed != null
                  ? selectDuelWeekBossForSeed(mapSeed, foughtWeek)
                  : selectWeekBossForLevel(onChainState?.campaignLevel ?? 0, foughtWeek);

              if (foughtBoss) {
                debugLog('[GameScreen] Boss resolved during POI, navigating to CombatScreen:', {
                  playerWon,
                  foughtWeek,
                  foughtBoss,
                  hasCombatLog: !!combatLog,
                  combatLogEntries: combatLog?.length ?? 0,
                  preBossPlayerHp,
                  turnsTaken,
                  finalEnemyHp,
                  rawFinalPlayerHp,
                  signature,
                });
                const playerStats = {
                  hp:
                    preBossPlayerHp ??
                    inferPlayerStartHpFromBackendLog(
                      combatLog,
                      rawFinalPlayerHp ?? finalPlayerHp
                    ) ??
                    Math.max(state.player.stats.hp, 1),
                  maxHp: state.player.stats.maxHp,
                  atk: state.player.stats.atk,
                  arm: state.player.stats.arm,
                  spd: state.player.stats.spd,
                  dig: state.player.stats.dig,
                  gold: finalPlayerGold,
                };
                const bossCombatParams = createBossCombatParams(
                  foughtBoss,
                  playerStats,
                  state.player.inventory.map((slot) => slot.item),
                  state.player.equippedTool,
                  state.player.activeItemsets ?? [],
                  state.rngState,
                  foughtWeek,
                  combatLog,
                  { finalPlayerHp, finalPlayerGold, playerWon }
                );
                navigateToCombat(navigation, bossCombatParams, {
                  campaignLevel: onChainState?.campaignLevel ?? 0,
                  totalMoves,
                  phase,
                });
              }
              // usePoiInteraction already dispatched CLOSE_POI — skip the one below
              skipMismatchTimeoutRef.current = setTimeout(() => {
                skipMismatchDetectionRef.current = false;
              }, 1000);
              return;
            }

            // Inventory is already synced via SYNC_INVENTORY dispatched by the hook
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
        debugLog(
          '[GameScreen] handlePOIOption: ON-CHAIN pick-item path | selectedItem:',
          selectedItem?.name ?? 'none'
        );
        poiInteraction.selectCacheOffer(optionIndex).then((result) => {
          debugLog('[GameScreen] selectCacheOffer result:', result);
          if (result.success) {
            // Add item to inventory only after blockchain confirmation
            if (selectedItem) {
              debugLog(
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
      debugLog(
        '[GameScreen] handlePOIOption: LOCAL fallback path | activePOI:',
        state?.activePOI?.poi?.definitionId
      );
      playSfx('ui_click');
      dispatch({ type: 'SELECT_POI_OPTION', optionIndex });
    },
    [dispatch, poiInteraction, state?.activePOI?.poi?.definitionId, playSfx]
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
  const [inspectedItemset, setInspectedItemset] = useState<
    import('../game/engine/types').ItemsetId | null
  >(null);
  const [isItemsetTooltipVisible, setItemsetTooltipVisible] = useState(false);

  const handleInspectItem = useCallback((item: Tool | Gear) => {
    setInspectedItem(item);
    setTooltipVisible(true);
  }, []);
  const handleInspectTool = useCallback((tool: Tool) => {
    setInspectedItem(tool);
    setTooltipVisible(true);
  }, []);
  const handleCloseTooltip = useCallback(() => setTooltipVisible(false), []);
  const handleInspectItemset = useCallback((id: import('../game/engine/types').ItemsetId) => {
    setInspectedItemset(id);
    setItemsetTooltipVisible(true);
  }, []);
  const handleCloseItemsetTooltip = useCallback(() => setItemsetTooltipVisible(false), []);

  const handleInventoryItemPress = useCallback(
    (item: Tool | Gear) => {
      if (state?.phase !== GamePhase.POIInteraction) return;

      // Rune Kiln (L11) Logic
      if (state.activePOI?.poi.definitionId === 'L11' && 'currentRarity' in item) {
        if (item.currentRarity === 'DIAMOND') return;
        const gear = item as Gear;
        const availableCount = state.player.inventory.filter(
          (slot) =>
            slot.item.id === gear.id &&
            'currentRarity' in slot.item &&
            (slot.item as Gear).currentRarity === gear.currentRarity
        ).length;
        if (availableCount < 2) return;
        // Single click fills both slots immediately
        setKilnSelection({
          gearId: gear.id,
          rarity: gear.currentRarity,
          emoji: gear.emoji,
          count: 2,
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
    setKilnSelection({ gearId: null, rarity: null, emoji: '', count: 0 });
  }, []);

  const handleScrapSlotPress = useCallback(() => {
    setScrapSelection(null);
  }, []);

  const isItemSelectPoiActive =
    state?.phase === GamePhase.POIInteraction &&
    (state.activePOI?.poi.definitionId === 'L11' || state.activePOI?.poi.definitionId === 'L14');

  // Filtered gear for controller-mode inventory cycling in Rune Kiln / Scrap Chute
  const playerInventory = state?.player?.inventory;
  const activePoiDefId = state?.activePOI?.poi?.definitionId;
  const selectableGear = useMemo(() => {
    if (!playerInventory || !isItemSelectPoiActive) return [];

    if (activePoiDefId === 'L11') {
      // Rune Kiln: only show gear with 2+ copies (non-Diamond), deduplicated
      const gearCounts = new Map<string, { gear: Gear; count: number }>();
      for (const slot of playerInventory) {
        const item = slot.item;
        if (!('currentRarity' in item) || item.currentRarity === 'DIAMOND') continue;
        const gear = item as Gear;
        const key = `${gear.id}:${gear.currentRarity}`;
        const existing = gearCounts.get(key);
        if (existing) {
          existing.count++;
        } else {
          gearCounts.set(key, { gear, count: 1 });
        }
      }
      // Only include items with 2+ copies, show one of each
      return Array.from(gearCounts.values())
        .filter((entry) => entry.count >= 2)
        .map((entry) => entry.gear);
    }

    // Scrap Chute: any gear
    return playerInventory
      .map((slot) => slot.item)
      .filter((item): item is Gear => 'currentRarity' in item);
  }, [playerInventory, activePoiDefId, isItemSelectPoiActive]);

  const isCompact = variant === 'compact';
  const navScale = isCompact ? 2 : 1;
  const navbarHeight = NAVBAR_HEIGHT * navScale;
  const sharedSidebarProps = useMemo(
    () =>
      state
        ? {
            time: state.time,
            stats: state.player.stats,
            inventory: state.player.inventory,
            inventoryCapacity: state.player.inventoryCapacity,
            maxGearSlots,
            isGauntletLayout,
            equippedTool: state.player.equippedTool,
            activeItemsets: state.player.activeItemsets,
          }
        : null,
    [
      state,
      maxGearSlots,
      isGauntletLayout,
    ]
  );
  const handleToggleOverview = useCallback(() => {
    playSfx('map_reveal');
    toggleOverviewMode();
  }, [playSfx, toggleOverviewMode]);
  const handleFastTravelCycle = useCallback(() => {
    setFastTravelSelectedIndex((prev) =>
      fastTravelDestinations.length > 0 ? (prev + 1) % fastTravelDestinations.length : 0
    );
  }, [fastTravelDestinations.length]);
  const handleFastTravelCancel = useCallback(() => {
    setIsFastTravelMode(false);
    setFastTravelDestinations([]);
  }, []);
  const handlePauseClose = useCallback(() => setShowPauseMenu(false), []);
  const handleReturnToHub = useCallback(() => {
    setShowPauseMenu(false);
    navigation.replace('Hub');
  }, [navigation]);
  const handleDpadCenterPress = useMemo(() => {
    if (isFastTravelActive) {
      return handleFastTravelConfirm;
    }
    if (state && poiInteraction.canInteract && state.phase === GamePhase.Exploration) {
      return () => {
        debugLog(
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
      };
    }
    return undefined;
  }, [
    isFastTravelActive,
    handleFastTravelConfirm,
    poiInteraction.canInteract,
    poiInteraction.currentPoi,
    poiInteraction.interact,
    state,
  ]);

  if (!state || !sharedSidebarProps) {
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
      <OverviewPanController
        isController={isController}
        overviewActive={overviewMode.active}
        isFastTravelActive={isFastTravelActive}
        panOverview={panOverview}
      />
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
                      onPress={handleToggleOverview}
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
                  <Sidebar {...sharedSidebarProps} onlyBoss={true} />
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
                  playerSkinSource={playerSkinSource}
                />
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
                    onCycle={handleFastTravelCycle}
                    onConfirm={handleFastTravelConfirm}
                    onCancel={handleFastTravelCancel}
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
                      onCenterPress={handleDpadCenterPress}
                      centerDisabled={poiInteraction.isInteracting}
                    />
                  </View>
                )}
              </View>
              {!isCompact && (
                <View ref={sidebarPlayerRef} style={styles.sidebarBottomContainer}>
                  <Sidebar
                    {...sharedSidebarProps}
                    onItemInspect={handleInspectItem}
                    onToolInspect={handleInspectTool}
                    onItemsetPress={handleInspectItemset}
                    isRuneKilnActive={isItemSelectPoiActive}
                    handleInventoryItemPress={handleInventoryItemPress}
                    onlyContent={true}
                    controllerFocusIndex={inventoryFocus === 'player' ? focusedSlotIndex : null}
                  />
                </View>
              )}
            </View>

            {/* Crossing Separators */}
            <CrossingLines navbarHeight={navbarHeight} isCompact={isCompact} />

            {state.phase === GamePhase.POIInteraction && (
              <POIModal
                visible={true}
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
                centerInCompact={isCompact && !isCompactSidebarVisible}
              />
            )}
            {showPauseMenu && (
              <PauseMenuModal
                visible={true}
                onClose={handlePauseClose}
                onReturnToHub={handleReturnToHub}
                onAbandonSession={handleDebugExitSession}
                isAbandoning={isExitingSession}
              />
            )}
          </View>

          {isCompact && isCompactSidebarVisible && !showTutorial && (
            <View
              style={[styles.floatingSidebarWrapper, { top: navbarHeight }]}
              pointerEvents="box-none"
            >
              <ImageBackground
                ref={sidebarEnemyRef}
                source={SIDEBAR_BG}
                style={styles.floatingBossPanel}
                imageStyle={{ height: '100%' }}
                resizeMode="stretch"
              >
                <Sidebar
                  {...sharedSidebarProps}
                  onlyBoss={true}
                  inlineBoss={true}
                  echoFocusIndex={inventoryFocus === 'enemy' ? focusedSlotIndex : null}
                  onEchoEquipmentLoaded={handleEchoEquipmentLoaded}
                />
              </ImageBackground>
              <ImageBackground
                ref={sidebarPlayerRef}
                source={SIDEBAR_BG}
                style={styles.floatingSidebarPanel}
                imageStyle={{ height: '100%' }}
                resizeMode="stretch"
              >
                <Sidebar
                  {...sharedSidebarProps}
                  onItemInspect={handleInspectItem}
                  onToolInspect={handleInspectTool}
                  onItemsetPress={handleInspectItemset}
                  isRuneKilnActive={isItemSelectPoiActive}
                  handleInventoryItemPress={handleInventoryItemPress}
                  onlyContent={true}
                  floatingCompact={true}
                  controllerFocusIndex={inventoryFocus === 'player' ? focusedSlotIndex : null}
                />
              </ImageBackground>
            </View>
          )}

          {isTooltipVisible && (
            <ItemTooltip item={inspectedItem} visible={true} onClose={handleCloseTooltip} />
          )}
          {isItemsetTooltipVisible && (
            <ItemsetTooltip
              itemsetId={inspectedItemset}
              visible={true}
              onClose={handleCloseItemsetTooltip}
            />
          )}
        <TutorialModal visible={showTutorial} onClose={() => setShowTutorial(false)} />
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
});
