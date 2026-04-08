/**
 * GameScreen - Main exploration gameplay screen
 */

import React, { useCallback, useMemo, useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Pressable, Platform, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { CachedImageBackground } from '../components/common/CachedImageBackground';
import { InstantImageBackground } from '../components/common/InstantImageBackground';
import { Connection, PublicKey } from '@solana/web3.js';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { RootStackParamList, CombatParams, type UnlockedItem } from '../navigation';
import { useGame, GamePhase } from '../contexts/GameContext';
import { useSession } from '../contexts/SessionContext';
import { useProfile } from '../contexts/ProfileContext';
import { useGameplayStateContext } from '../contexts/GameplayStateContext';
import { useWallet } from '../contexts/WalletContext';
import { useAudio } from '../contexts/AudioContext';
import { useSettings } from '../contexts/SettingsContext';
import { useSolanaConnection } from '../contexts/SolanaConnectionContext';
import { RunMode, deriveGameStatePda } from '../services/solana/types/gameplay_state';
import { POI_TYPES } from '../services/solana/types/poi_system';
import { convertItemInstanceToGear, convertItemInstanceToTool } from '../services/solana/pitDraft';
import {
  fetchFullSessionState,
  unpackDiscoveryTiles,
  convertDiscoveredEnemies,
  convertDiscoveredPois,
  decodeBossId,
} from '../services/solana/sessionRestore';
import { useNightMovement } from '../hooks/useNightMovement';
import { usePoiInteraction } from '../hooks/usePoiInteraction';
import { DPadControls } from '../components/game/DPadControls';
import {
  TopBar,
  GameCanvas,
  DebugOverlay,
  POIModal,
  FastTravelOverlay,
  ItemTooltip,
  ItemsetTooltip,
  CombatResultFloater,
  DefeatOverlay,
} from '../components/game';
import type { CombatResultIndicator } from '../components/game/CombatResultFloater';
import { Sidebar } from '../components/game/Sidebar';
import { useFocusGlow } from '../components/ui/FocusGlow';
import { PauseMenuModal } from '../components/ui/PauseMenuModal';
import { SkipToEowModal } from '../components/ui/SkipToEowModal';
import { TutorialModal } from '../components/ui/TutorialModal';
import { TUTORIAL_SEEN_KEY } from '../components/ui/tutorialPages';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDirectionInput } from '../hooks/useInput';
import { useLandscapeLock } from '../hooks/useOrientationLock';
import { usePreventBackNavigation } from '../hooks/usePreventBackNavigation';
import { useKeepAwake } from 'expo-keep-awake';
import { useScreenVariant } from '../contexts/ScreenVariantContext';
import { useInputMode } from '../hooks/useInputMode';
import { useControllerAction } from '../hooks/useControllerAction';
import { OverviewPanController } from '../components/game/OverviewPanController';
import { Direction, DIRECTION_DELTA } from '../game/input/types';
import { TileType, MapEnemy, MapPOI } from '../game/map/types';
import { getDiscoveredWaypoints } from '../game/entities/pois';
import {
  canAffordCostAcrossPhases,
  selectWeekBossForLevel,
} from '../game/time/progression';
import { Typography } from '../theme/typography';
import { useEquippedSkinImage } from '../hooks/useEquippedSkinImage';
import { promptTransactionRetry } from '../utils/transaction-alerts';
import { getPhaseLabel } from '../utils/phase-labels';
import {
  GAME_SCREEN_BACKGROUND_IMAGE,
  GAME_SCREEN_STAINS_BACKGROUND,
} from '../constants/criticalImages';
import type {
  Gear,
  GearId,
  Tool,
  CombatantState,
  ItemRarity,
  Position,
} from '../game/engine/types';
import { calculateItemStats } from '@/game/entities/items';
import { normalizeCombatPlayerStats, type CombatPlayerStats } from './combat-player-stats';
import { resolveCombatWithParity } from '../game/combat/parity-resolver';
import type { GauntletCombatVisualEvent } from '@/services/solana/gauntlet';
import {
  fetchGauntletEchoFromDiscovery,
  fetchGauntletEchoFromGameState,
  parseGauntletCombatVisualEvent,
} from '@/services/solana/gauntlet';
import { fetchSessionDiscovery } from '@/services/solana/mapGeneratorClient';
import { createGameplayStateProgram, createMapGeneratorProgram, createPlayerProfileProgram } from '@/services/solana/programs';
import { parseGameplayEvents, extractVictoryData } from '@/services/solana/eventParser';
import { warmMovePlayerCaches, eagerBuildMoveTemplate, syncDiscoveryBoss } from '@/services/solana/gameplayState';
import { SOLANA_CONFIG } from '@/services/solana/config';
import { deriveSessionDiscoveryPda, GAMEPLAY_STATE_PROGRAM_ID } from '@/services/solana/constants';
import { warmErBlockhashCache, startErBlockhashRefresh, stopErBlockhashRefresh, sendSessionSignerTransaction } from '@/services/solana/sessionSigner';
import {
  fetchDuelEntryForSettlement,
  buildSettleDuelPayoutTransaction,
  parseDuelEvents,
  deriveDuelEntryPda,
} from '@/services/solana/duels';
import { calculateCombatBakedItemStats } from '@/game/entities/items';
import {
  ENEMY_DEFINITIONS,
  calculateGoldReward,
  ARCHETYPE_TO_ENEMY_ID,
  deriveEnemyTier,
} from '../game/entities/enemies';
import { BOSSES } from '../data/bosses';
import { scaleBossStats } from '../data/boss-scaling';
import type { BossId } from '../game/engine/types';
import { GAME_CONSTANTS } from '../game/engine/constants';
import Svg, { Path } from 'react-native-svg';

const BACKGROUND_IMAGE = GAME_SCREEN_BACKGROUND_IMAGE;
const STAINS_BACKGROUND = GAME_SCREEN_STAINS_BACKGROUND;
const COIN_ICON = require('../../assets/icons/ui/coin.webp');
const MAP_ICON = require('../../assets/icons/ui/map.webp');
const SIDEBAR_BG = require('../../assets/ui/panels/sidebar.webp');
const SIDEBAR_WIDE_BG = require('../../assets/ui/panels/sidebar-wide.webp');
const ICON_Y = require('../../assets/ui/control-buttons/y.webp');
const BUTTON_V5 = require('../../assets/ui/buttons/button-v5.webp');
const ENGINE_ICON = require('../../assets/ui/illustrations/engine.webp');
const PAPER_PANEL_WIDE = require('../../assets/ui/panels/paper-panel-wide.webp');
const ICON_A = require('../../assets/ui/control-buttons/a.webp');
const ICON_B = require('../../assets/ui/control-buttons/b.webp');
const BUTTON_BG = require('../../assets/ui/buttons/button.webp');

const DUEL_BASE_HP = 20;

const SIDEBAR_WIDTH = 230;
const COMPACT_SIDEBAR_WIDTH = 280;
const NAVBAR_HEIGHT = 60;
const PERF_DEBUG_LOGS = false;
const SESSION_RESTORE_WAIT_TIMEOUT_MS = 25_000;
const SESSION_RESTORE_POLL_MS = 300;


function debugLog(...args: unknown[]) {
  if (__DEV__ && PERF_DEBUG_LOGS) {
    console.log(...args);
  }
}

type PlayerStats = CombatPlayerStats;

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
  week: number,
  onChainOutcome?: {
    finalPlayerHp: number;
    finalPlayerGold: number;
    playerWon: boolean;
  }
): CombatParams {
  const enemyDef = ENEMY_DEFINITIONS[enemy.definitionId];
  const tierStats = enemyDef.tiers[enemy.tier - 1];
  const normalizedPlayerStats = normalizeCombatPlayerStats(playerStats, playerGear, playerTool);

  return {
    player: buildPlayerCombatant(normalizedPlayerStats),
    enemy: buildEnemyCombatant(enemyDef.name, enemyDef.emoji, enemy.definitionId, tierStats),
    seed,
    enemyId: enemy.definitionId,
    enemyDefinitionId: enemy.definitionId,
    enemyTier: enemy.tier,
    goldReward: calculateGoldReward(enemy.definitionId, enemy.tier),
    activeItemSets: activeItemsets as any[],
    playerGear,
    playerTool,
    playerGold: normalizedPlayerStats.gold,
    week,
    isBossFight: false,
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
  onChainOutcome?: {
    finalPlayerHp: number;
    finalPlayerGold: number;
    playerWon: boolean;
  },
  campaignLevel?: number
): CombatParams {
  const bossDef = BOSSES[bossId];
  if (!bossDef) {
    throw new Error(`Boss definition not found for ID: ${bossId}`);
  }
  const normalizedPlayerStats = normalizeCombatPlayerStats(playerStats, playerGear, playerTool);
  const bossStats = campaignLevel
    ? scaleBossStats(bossDef.stats, campaignLevel, week)
    : bossDef.stats;

  return {
    player: buildPlayerCombatant(normalizedPlayerStats),
    enemy: buildEnemyCombatant(bossDef.name, bossDef.emoji, bossId, bossStats),
    seed,
    bossId,
    enemyDefinitionId: bossId,
    goldReward: 0,
    activeItemSets: activeItemsets as any[],
    playerGear,
    playerTool,
    playerGold: normalizedPlayerStats.gold,
    week,
    isBossFight: true,
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
  const normalizedPlayerStats = normalizeCombatPlayerStats(playerStats, playerGear, playerTool);

  return {
    player: buildPlayerCombatant(normalizedPlayerStats),
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
    playerGold: normalizedPlayerStats.gold,
    enemyTool: echoTool,
    enemyGear: echoGear,
    week,
    isBossFight: true,
    onChainOutcome: {
      finalPlayerHp: visual.finalPlayerHp,
      finalPlayerGold: playerGold,
      playerWon: visual.playerWon,
    },
  };
}

/**
 * Build fallback gauntlet combat params from on-chain echo data when visual parsing fails.
 * CombatScreen replays these fights through the local parity resolver and then applies the
 * authoritative on-chain outcome (win/loss and final HP/gold).
 */
async function buildFallbackGauntletCombatParams(
  connection: Connection,
  sessionPda: PublicKey,
  week: number,
  confirmedState: { hp: number; gold: number; isDead: boolean },
  playerStats: PlayerStats,
  playerGear: Gear[],
  playerTool: Tool | null,
  activeItemsets: string[],
  seed: number
): Promise<CombatParams | null> {
  try {
    // Primary: fetch from GauntletEchoes PDA (week-indexed, always has the correct week).
    // Fallback: SessionDiscovery.currentEchoData (single slot, may be stale/overwritten).
    const gameplayProgram = createGameplayStateProgram(connection);
    let echoPreview = await fetchGauntletEchoFromGameState(gameplayProgram, sessionPda, week);
    if (!echoPreview) {
      const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);
      const discovery = await fetchSessionDiscovery(
        createMapGeneratorProgram(connection),
        sessionDiscoveryPda
      );
      echoPreview = fetchGauntletEchoFromDiscovery(discovery);
    }
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
      week,
      isBossFight: true,
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
 * Parse the item unlock from the settle_session_result transaction.
 */
async function parseItemUnlockFromSettle(
  conn: Connection,
  settleSignature: string
): Promise<UnlockedItem | undefined> {
  try {
    const profileProgram = createPlayerProfileProgram(conn);
    const events = await parseGameplayEvents(conn, profileProgram, settleSignature);
    const victoryData = extractVictoryData(events);
    return victoryData.itemUnlocked;
  } catch (err) {
    console.warn('[GameScreen] Failed to parse item unlock from settle:', err);
    return undefined;
  }
}

/**
 * Navigate to CombatScreen with combat params and on-chain metadata.
 */
function navigateToCombat(
  navigation: NativeStackNavigationProp<RootStackParamList, 'Game'>,
  combatParams: CombatParams,
  meta: { campaignLevel: number; totalMoves: number; phase: number; runMode?: number; enemiesDefeated: number },
) {
  navigation.navigate('Combat', {
    combatInput: {
      ...combatParams,
      campaignLevel: meta.campaignLevel,
      totalMoves: meta.totalMoves,
      phase: meta.phase,
      runMode: meta.runMode,
      enemiesDefeated: meta.enemiesDefeated,
    },
  });
}

/**
 * Navigate to DeathScreen with run summary data.
 */
function navigateToDeath(
  navigation: NativeStackNavigationProp<RootStackParamList, 'Game'>,
  meta: { totalMoves: number; campaignLevel: number; week: number; phase: number; runMode?: number; enemiesDefeated: number },
  killedBy?: string
) {
  navigation.navigate('Death', {
    totalMoves: meta.totalMoves,
    level: meta.campaignLevel,
    week: meta.week,
    phase: getPhaseLabel(meta.phase),
    enemiesDefeated: meta.enemiesDefeated,
    killedBy,
    runMode: meta.runMode,
  });
}

const ThinSeparator = React.memo(function ThinSeparator({ horizontal = true }: { horizontal?: boolean }) {
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
});

const CrossingLines = React.memo(function CrossingLines({ navbarHeight, isCompact }: { navbarHeight: number; isCompact: boolean }) {
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
});

const ICON_28 = { width: 28, height: 28 } as const;
const COMPACT_BUTTON_ROW = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 };
const COMPACT_BUTTON_ROW_WIDE = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 24, marginTop: 8 };
const TOUCH_BUTTON_ROW = { flexDirection: 'row' as const, gap: 16, marginTop: 8 };

type WeaponSwapModalProps = {
  toolName: string;
  equippedToolName: string;
  isCompact: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const WeaponSwapModal = React.memo(function WeaponSwapModal({
  toolName,
  equippedToolName,
  isCompact,
  onCancel,
  onConfirm,
}: WeaponSwapModalProps) {
  return (
    <View style={styles.duelCompleteOverlay}>
      <CachedImageBackground
        source={PAPER_PANEL_WIDE}
        resizeMode="stretch"
        style={[styles.duelCompletePanel, isCompact && styles.duelCompletePanelCompact]}
      >
        <Text style={[styles.duelCompleteTitle, isCompact && styles.duelCompleteTitleCompact]}>Replace Weapon?</Text>
        <Text style={[styles.duelCompleteMessage, isCompact && styles.duelCompleteMessageCompact]}>
          You already have {equippedToolName} equipped.
          {'\n\n'}
          Picking {toolName} will replace your current weapon permanently.
        </Text>
        {isCompact ? (
          <View style={COMPACT_BUTTON_ROW_WIDE}>
            <View style={COMPACT_BUTTON_ROW}>
              <Image source={ICON_B} style={ICON_28} />
              <Text style={[styles.duelCompleteButtonText, styles.duelCompleteButtonTextCompact]}>Cancel</Text>
            </View>
            <View style={COMPACT_BUTTON_ROW}>
              <Image source={ICON_A} style={ICON_28} />
              <Text style={[styles.duelCompleteButtonText, styles.duelCompleteButtonTextCompact]}>Replace</Text>
            </View>
          </View>
        ) : (
          <View style={TOUCH_BUTTON_ROW}>
            <Pressable onPress={onCancel}>
              <CachedImageBackground
                source={BUTTON_BG}
                resizeMode="stretch"
                style={styles.duelCompleteButton}
              >
                <Text style={styles.duelCompleteButtonText}>Cancel</Text>
              </CachedImageBackground>
            </Pressable>
            <Pressable onPress={onConfirm}>
              <CachedImageBackground
                source={BUTTON_BG}
                resizeMode="stretch"
                style={styles.duelCompleteButton}
              >
                <Text style={styles.duelCompleteButtonText}>Replace</Text>
              </CachedImageBackground>
            </Pressable>
          </View>
        )}
      </CachedImageBackground>
    </View>
  );
});

type DuelCompleteOverlayProps = {
  isCompact: boolean;
  onOk: () => void;
};

const DuelCompleteOverlay = React.memo(function DuelCompleteOverlay({
  isCompact,
  onOk,
}: DuelCompleteOverlayProps) {
  return (
    <View style={styles.duelCompleteOverlay}>
      <CachedImageBackground
        source={PAPER_PANEL_WIDE}
        resizeMode="stretch"
        style={[styles.duelCompletePanel, isCompact && styles.duelCompletePanelCompact]}
      >
        <Text style={[styles.duelCompleteTitle, isCompact && styles.duelCompleteTitleCompact]}>Duel Run Complete!</Text>
        <Text style={[styles.duelCompleteMessage, isCompact && styles.duelCompleteMessageCompact]}>
          Your run is finished. Your opponent hasn't completed their run yet.
          {'\n\n'}
          You can check the outcome on the Duels History screen when they're done.
        </Text>
        <Pressable onPress={onOk}>
          {isCompact ? (
            <View style={COMPACT_BUTTON_ROW}>
              <Image source={ICON_A} style={ICON_28} />
              <Text style={[styles.duelCompleteButtonText, styles.duelCompleteButtonTextCompact]}>OK</Text>
            </View>
          ) : (
            <CachedImageBackground
              source={BUTTON_BG}
              resizeMode="stretch"
              style={styles.duelCompleteButton}
            >
              <Text style={styles.duelCompleteButtonText}>OK</Text>
            </CachedImageBackground>
          )}
        </Pressable>
      </CachedImageBackground>
    </View>
  );
});

type GameScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Game'>;
};

export function GameScreen({ navigation }: GameScreenProps) {
  usePreventBackNavigation();
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
    skipToEndOfWeek,
    gameplayState: onChainState,
    gameplaySyncStatus,
    sessionPda,
    currentLevel,
    forceAbandonCurrentSession,
    getSessionSignerKeypair,
    stopAutoCommit,
    queueEndGame,
    undelegateCurrentSession,
    endSessionWithSessionSigner,
  } = useSession();
  const { wallet } = useWallet();
  const { connection, gameplayConnection, gameplayReadConnection } = useSolanaConnection();
  const {
    gameState: gameplayContextState,
  } = useGameplayStateContext();
  const variant = useScreenVariant();
  const nightMovement = useNightMovement();
  const poiInteraction = usePoiInteraction();
  const { playBgm, playSfx } = useAudio();
  const { autoOpenPOI, autoResolveCombat } = useSettings();
  const isFocused = useIsFocused();
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const stateRef = useRef(state);
  stateRef.current = state;
  const gameplayWriteConnection = useMemo(() => {
    const gameplayEndpoint = gameplayConnection.rpcEndpoint.replace(/\/+$/, '');
    const readEndpoint = gameplayReadConnection.rpcEndpoint.replace(/\/+$/, '');
    const directEndpoint = SOLANA_CONFIG.directErRpcUrl.replace(/\/+$/, '');
    const isRouter = gameplayEndpoint.includes('router.magicblock.app');
    const hasResolvedValidator =
      readEndpoint !== directEndpoint && !readEndpoint.includes('router.magicblock.app');
    return isRouter && hasResolvedValidator ? gameplayReadConnection : gameplayConnection;
  }, [gameplayConnection, gameplayReadConnection]);

  // Pre-warm the actual gameplay write connection, not just the read connection.
  // On native, writes may use a resolved validator endpoint instead of the router;
  // warming the wrong connection leaves blockhash fetches cold on the hot path.
  useEffect(() => {
    if (isFocused && gameplayWriteConnection) {
      warmErBlockhashCache(gameplayWriteConnection);
      startErBlockhashRefresh(gameplayWriteConnection);
      if (sessionPda) {
        const program = createGameplayStateProgram(gameplayWriteConnection);
        const signerKp = getSessionSignerKeypair();
        // Warm caches then eagerly build template once caches are populated.
        const warmPromise = warmMovePlayerCaches(gameplayWriteConnection, program, sessionPda);
        if (signerKp) {
          warmPromise.then(() => {
            const [gsPda] = deriveGameStatePda(sessionPda);
            return eagerBuildMoveTemplate(
              gameplayWriteConnection,
              gsPda,
              sessionPda,
              signerKp,
            );
          }).catch(() => {});
        }
      }
      return () => { stopErBlockhashRefresh(); };
    }
    return undefined;
  }, [isFocused, gameplayWriteConnection, sessionPda, getSessionSignerKeypair]);
  const onChainStateRef = useRef(onChainState);
  onChainStateRef.current = onChainState;
  const canTriggerCurrentPoiByPhase = poiInteraction.canInteract;

  const feedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [wallBreakFeedback, setWallBreakFeedback] = useState<string | null>(null);
  const [isMovePending, setIsMovePending] = useState(false);
  const [isExitingSession, setIsExitingSession] = useState(false);
  const [duelCompleteVisible, setDuelCompleteVisible] = useState(false);
  const [pendingWeaponSwap, setPendingWeaponSwap] = useState<{ optionIndex: number; toolName: string } | null>(null);
  const [isDuelFinalizing, setIsDuelFinalizing] = useState(false);
  const isDuelFinalizingRef = useRef(false);
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const [showSkipToEow, setShowSkipToEow] = useState(false);
  const [isSkippingToEow, setIsSkippingToEow] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [isFastTravelMode, setIsFastTravelMode] = useState(false);
  const [fastTravelCameraTarget, setFastTravelCameraTarget] = useState<Position | null>(null);
  const [fastTravelDestinations, setFastTravelDestinations] = useState<Position[]>([]);
  const [fastTravelSelectedIndex, setFastTravelSelectedIndex] = useState(0);
  // Suppress POI auto-open on the tile we just restored onto.
  // Resume should rebuild the screen first; the player can still interact manually.
  const lastAutoTriggeredPosRef = useRef<{ x: number; y: number } | null>(null);
  // Use a ref for synchronous pending check to prevent race conditions with rapid clicks
  const isMovePendingRef = useRef(false);
  // Start hidden and fade in once the component tree has mounted + rendered,
  // covering the brief flash where tiles/enemies/POIs haven't painted yet.
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
  const [combatResultIndicators, setCombatResultIndicators] = useState<CombatResultIndicator[]>([]);
  const combatResultIdRef = useRef(0);
  const pendingBossSidebarRefreshRef = useRef(false);
  const duelWeek3FinalizeRequestedRef = useRef<string | null>(null);
  const [defeatOverlayVisible, setDefeatOverlayVisible] = useState(false);
  const defeatMetaRef = useRef<{
    killedBy?: string;
    totalMoves: number;
    level: number;
    week: number;
    phase: number;
    runMode?: number;
    enemiesDefeated: number;
  } | null>(null);

  // Fade in once game state is ready, giving expo-image time to render
  // cached assets into the component tree. On mobile, even cached images
  // load asynchronously so we need a short delay before revealing.
  const hasFadedInRef = useRef(false);
  useEffect(() => {
    if (!state || hasFadedInRef.current) return;
    hasFadedInRef.current = true;
    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }, 500);
    return () => clearTimeout(timer);
  }, [state, fadeAnim]);

  // Auto-show tutorial on first session entry
  useEffect(() => {
    AsyncStorage.getItem(TUTORIAL_SEEN_KEY).then((seen) => {
      if (!seen) setShowTutorial(true);
    });
  }, []);

  const handleCombatResultComplete = useCallback((id: string) => {
    setCombatResultIndicators((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const handleDefeatOverlayComplete = useCallback(() => {
    setDefeatOverlayVisible(false);
    const meta = defeatMetaRef.current;
    if (!meta) return;

    // Queue deferred cleanup — runs via processPendingCleanups when user reaches
    // CampaignSelectScreen. Can't teardown here because GameScreen's ER connections
    // (WebSocket subscriptions, gameplay hooks) must be unmounted first.
    if (hasActiveSession && mode !== 'guest') {
      stopAutoCommit();
      const levelReached = meta.level;
      console.log('[GameScreen] Auto-resolve defeat: queueing deferred session cleanup');
      void queueEndGame(levelReached, false).catch((err) => {
        console.error('[GameScreen] Failed to queue deferred cleanup:', err);
      });
    }

    // Navigate to DeathScreen using reset (same as CombatScreen)
    navigation.reset({
      index: 0,
      routes: [
        {
          name: 'Death',
          params: {
            totalMoves: meta.totalMoves,
            level: meta.level,
            week: meta.week,
            phase: getPhaseLabel(meta.phase),
            enemiesDefeated: meta.enemiesDefeated,
            killedBy: meta.killedBy,
            runMode: meta.runMode,
          },
        },
      ],
    });
  }, [hasActiveSession, mode, stopAutoCommit, queueEndGame, navigation]);

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

    const hasPositionalMismatch =
      localPosX !== chainPosX ||
      localPosY !== chainPosY ||
      localMovesRemaining !== chainMovesRemaining;
    const hasHpMismatch = localHp !== chainHp;

    // Temporary combat parity mode: on-chain combat screens currently use the frontend
    // parity resolver for visualization and post-combat local state. While that is active,
    // exploration safety-sync should not overwrite HP-only mismatches from chain.
    const hasMismatch = hasPositionalMismatch || false;

    if (hasMismatch) {
      debugLog('[GameScreen] Mismatch detected, syncing:', {
        localBaseHp: currentState.player.baseStats.hp,
        localStatsHp: localHp,
        onChainHp: chainHp,
        localPos: currentState.player.position,
        onChainPos: { x: chainPosX, y: chainPosY },
      });
      dispatch({ type: 'SYNC_MOVE', confirmedState: currentOnChain });
    } else if (hasHpMismatch) {
      debugLog('[GameScreen] Ignoring HP-only on-chain mismatch while combat uses local parity replay:', {
        localBaseHp: currentState.player.baseStats.hp,
        localStatsHp: localHp,
        onChainHp: chainHp,
      });
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
  const gauntletBossRetryRef = useRef(0);
  const isRestoringSessionRef = useRef(false);
  // Snapshot of the player's HP before the last move/POI interaction.
  // Used by the boss useEffect when the boss was already resolved inline
  // and on-chain state only has post-boss HP.
  const preBossHpRef = useRef<number | null>(null);

  // Reset isTriggeringBossRef when screen regains focus (e.g., returning from
  // CombatScreen/VictoryScreen). This ensures future boss fights can trigger.
  // Do NOT reset if bossFightReady is still true — the boss hasn't been resolved
  // yet and resetting would cause the boss useEffect to double-fire with stale
  // on-chain state (especially on localnet where fire-and-forget tx confirmations
  // can lag behind the state fetch).
  useEffect(() => {
    if (isFocused && !onChainState?.bossFightReady) {
      isTriggeringBossRef.current = false;
      gauntletBossRetryRef.current = 0;
    }
  }, [isFocused, onChainState?.bossFightReady]);

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

    let cancelled = false;
    (async () => {
      const deadline = Date.now() + SESSION_RESTORE_WAIT_TIMEOUT_MS;
      let restored = null;
      while (!cancelled && Date.now() < deadline && !restored) {
        restored = await fetchFullSessionState(gameplayReadConnection, sessionPda, undefined, {
          silentMissingData: true,
        }).catch((err) => {
          debugLog('[GameScreen] Auto-restore fetch retry failed:', err);
          return null;
        });

        if (restored) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, SESSION_RESTORE_POLL_MS));
      }

      if (!restored) {
        console.warn('[GameScreen] Auto-restore failed: session state was not readable in time');
        return;
      }

      if (!cancelled) {
        lastAutoTriggeredPosRef.current = {
          x: restored.player.position.x,
          y: restored.player.position.y,
        };
        dispatch({ type: 'RESTORE_GAME', state: restored });
        debugLog('[GameScreen] Auto-restore completed');
      }
    })()
      .catch((err) => {
        console.error('[GameScreen] Auto-restore failed with error:', err);
      })
      .finally(() => {
        isRestoringSessionRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [isFocused, state, hasActiveSession, sessionPda, currentLevel, gameplayReadConnection, dispatch]);

  /**
   * Full resync from on-chain state. Fetches GameState, Inventory, and SessionDiscovery
   * and dispatches RESTORE_GAME to replace the entire local state.
   * Used when the local state may be out of sync (failed moves, multi-tab play, etc.).
   */
  const resyncFromChain = useCallback(async () => {
    if (!sessionPda || !gameplayReadConnection) return;
    debugLog('[GameScreen] resyncFromChain: fetching full state from chain...');
    try {
      const restored = await fetchFullSessionState(gameplayReadConnection, sessionPda, undefined, {
        silentMissingData: true,
      });
      if (restored) {
        dispatch({ type: 'RESTORE_GAME', state: restored });
        debugLog('[GameScreen] resyncFromChain: state restored successfully');
      } else {
        console.warn('[GameScreen] resyncFromChain: failed to fetch session state');
      }
    } catch (err) {
      console.error('[GameScreen] resyncFromChain: error:', err);
    }
  }, [sessionPda, gameplayReadConnection, dispatch]);

  const navigateToBossCombat = useCallback((
    combatParams: CombatParams,
    meta: { campaignLevel: number; totalMoves: number; phase: number; runMode?: number; enemiesDefeated: number }
  ) => {
    pendingBossSidebarRefreshRef.current = true;
    navigateToCombat(navigation, combatParams, meta);
  }, [navigation]);

  useEffect(() => {
    if (
      !isFocused ||
      !pendingBossSidebarRefreshRef.current ||
      !state ||
      state.phase !== GamePhase.Exploration ||
      mode === 'guest' ||
      !hasActiveSession
    ) {
      return;
    }

    pendingBossSidebarRefreshRef.current = false;
    void resyncFromChain();
  }, [hasActiveSession, isFocused, mode, resyncFromChain, state?.phase]);

  useEffect(() => {
    const requiresSeparateBossTrigger =
      onChainState?.runMode === RunMode.Gauntlet ||
      onChainState?.runMode === RunMode.Duel;
    if (
      !isFocused ||
      !onChainState?.bossFightReady ||
      !state ||
      mode === 'guest' ||
      isTriggeringBossRef.current ||
      isMovePending ||
      state.phase === GamePhase.POIInteraction ||
      (!requiresSeparateBossTrigger && state.time.phase !== 'BOSS')
    ) {
      return;
    }

    // Duel and Gauntlet weekly combats are resolved via trigger_boss_fight
    // (separate tx). On resume, local phase may still be NIGHT3, so do not
    // require the reducer to already be in BOSS phase for these modes.
    if (requiresSeparateBossTrigger) {
      isTriggeringBossRef.current = true;

      if (onChainState.isDead) {
        // Gauntlet echo already resolved (e.g. player returned after death).
        if (onChainState.runMode === RunMode.Gauntlet && sessionPda && state) {
          buildFallbackGauntletCombatParams(
            gameplayReadConnection,
            sessionPda,
            onChainState.week,
            { hp: onChainState.hp, gold: onChainState.gold, isDead: true },
            {
              hp: (preBossHpRef.current != null && preBossHpRef.current > 0)
                ? preBossHpRef.current
                : Math.max(state.player.stats.maxHp, 1),
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
                navigateToBossCombat(params, onChainState);
              } else {
                navigateToDeath(navigation, onChainState, `Week ${onChainState.week} Echo`);
              }
            })
            .catch(() => {
              navigateToDeath(navigation, onChainState, `Week ${onChainState.week} Echo`);
            });
        } else {
          navigateToDeath(
            navigation,
            onChainState,
            `Week ${onChainState.week} ${onChainState.runMode === RunMode.Duel ? 'Boss' : 'Echo'}`
          );
        }
      } else {
        // Weekly combat not yet resolved — call trigger_boss_fight on-chain.
        if (gauntletBossRetryRef.current >= 2) {
          console.error('[GameScreen] Weekly triggerBoss exceeded retry limit');
          navigateToDeath(
            navigation,
            onChainState,
            `Week ${onChainState.week} ${onChainState.runMode === RunMode.Duel ? 'Boss' : 'Echo'}`
          );
          return;
        }
        gauntletBossRetryRef.current += 1;

        const healedOrCurrentHp =
          onChainState.hp > 0
            ? onChainState.hp
            : (preBossHpRef.current != null && preBossHpRef.current > 0)
              ? preBossHpRef.current
              : Math.max(state.player.stats.maxHp, 1);
        const preCombatPlayerStats = {
          hp: healedOrCurrentHp,
          maxHp: state.player.stats.maxHp,
          atk: state.player.stats.atk,
          arm: state.player.stats.arm,
          spd: state.player.stats.spd,
          dig: state.player.stats.dig,
          gold: onChainState.gold,
        };
        const preCombatGear = state.player.inventory.map((slot) => slot.item);
        const preCombatTool = state.player.equippedTool;
        const preCombatItemsets = state.player.activeItemsets ?? [];
        const preCombatSeed = state.rngState;
        const currentWeek = state.time.week;

        triggerBoss()
          .then(async (bossResult) => {
            if (!bossResult.success || !bossResult.newState) {
              console.error('[GameScreen] Weekly triggerBoss failed');
              isTriggeringBossRef.current = false;
              return;
            }

            if (onChainState.runMode === RunMode.Gauntlet) {
              // Happy path: use visual event from trigger_boss_fight tx
              if (bossResult.gauntletVisual) {
                const gauntletCombatParams = createGauntletCombatParams(
                  bossResult.gauntletVisual,
                  preCombatPlayerStats,
                  preCombatGear,
                  preCombatTool,
                  preCombatItemsets,
                  preCombatSeed,
                  currentWeek,
                  bossResult.newState.gold
                );
                navigateToBossCombat(gauntletCombatParams, bossResult.newState);
                return;
              }

              // Fallback: build combat params from on-chain echo data
              if (sessionPda) {
                const fallback = await buildFallbackGauntletCombatParams(
                  gameplayReadConnection,
                  sessionPda,
                  currentWeek,
                  {
                    hp: bossResult.newState.hp,
                    gold: bossResult.newState.gold,
                    isDead: !!bossResult.isDead,
                  },
                  preCombatPlayerStats,
                  preCombatGear,
                  preCombatTool,
                  preCombatItemsets,
                  preCombatSeed
                );
                if (fallback) {
                  navigateToBossCombat(fallback, bossResult.newState);
                  return;
                }
              }
            } else {
              const foughtBoss = state?.time.weekBoss ?? null;
              if (foughtBoss) {
                const bossCombatParams = createBossCombatParams(
                  foughtBoss,
                  {
                    hp: preCombatPlayerStats.hp,
                    maxHp: preCombatPlayerStats.maxHp,
                    atk: preCombatPlayerStats.atk,
                    arm: preCombatPlayerStats.arm,
                    spd: preCombatPlayerStats.spd,
                    dig: preCombatPlayerStats.dig,
                    gold: bossResult.newState.gold,
                  },
                  preCombatGear,
                  preCombatTool,
                  preCombatItemsets,
                  preCombatSeed,
                  currentWeek as 1 | 2 | 3,
                  {
                    finalPlayerHp: bossResult.newState.hp,
                    finalPlayerGold: bossResult.newState.gold,
                    playerWon: !bossResult.isDead,
                  },
                  onChainState.campaignLevel ?? currentLevel ?? undefined
                );
                navigateToBossCombat(bossCombatParams, bossResult.newState);
                return;
              }
            }

            // Fallback: dead → DeathScreen, alive → check completion or continue
            if (bossResult.isDead) {
              navigateToDeath(
                navigation,
                bossResult.newState,
                `Week ${currentWeek} ${onChainState.runMode === RunMode.Duel ? 'Boss' : 'Echo'}`
              );
            } else if (bossResult.newState.completed) {
              stopAutoCommit();
              let itemUnlocked: UnlockedItem | undefined;
              if (hasActiveSession) {
                const endResult = await endSessionWithSessionSigner();
                if (endResult.success && endResult.settleSignature) {
                  itemUnlocked = await parseItemUnlockFromSettle(connection, endResult.settleSignature);
                } else {
                  void queueEndGame(bossResult.newState.campaignLevel, true).catch(() => {});
                }
              }
              navigation.replace('Victory', {
                level: bossResult.newState.campaignLevel,
                totalMoves: bossResult.newState.totalMoves,
                enemiesDefeated: bossResult.newState.enemiesDefeated,
                levelUnlocked: bossResult.newState.campaignLevel + 1,
                itemUnlocked,
                runMode: bossResult.newState.runMode,
                gauntletPoints: bossResult.newState.gauntletPointsEarned,
              });
            } else {
              // Player won — sync new state to local reducer so bossFightReady=false
              // before allowing the Boss useEffect to re-evaluate.
              dispatch({ type: 'SYNC_MOVE', confirmedState: bossResult.newState! });
              isTriggeringBossRef.current = false;
            }
          })
          .catch((err) => {
            console.error('[GameScreen] triggerBoss error in boss useEffect:', err);
            isTriggeringBossRef.current = false;
          });
      }
      return;
    }

    const resolvedWeekBoss: BossId | null =
      state.time.weekBoss ?? null;
    console.log('[GameScreen] Boss useEffect fired:', {
      weekBoss: resolvedWeekBoss,
      localWeek: state.time.week,
      onChainWeek: onChainState.week,
      isTriggeringBoss: isTriggeringBossRef.current,
    });
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
      // Campaign resolves the boss inline on-chain (either inside move_player
      // or when a POI interaction exhausts remaining moves).
      // The move handler normally navigates to CombatScreen for these cases, but
      // when the boss is triggered by a POI interaction (e.g., Rest Alcove consuming
      // the last moves on Night 3), the move handler doesn't fire. This guard
      // catches both scenarios and shows CombatScreen via the
      // local resolver so the player always sees the boss fight animation.
      //
      // skip_to_eow sets bossFightReady=true WITHOUT resolving — the boss
      // must still be resolved via triggerBoss(). Since bossFightReady is a
      // prerequisite for this useEffect (line 950), it's always true here.
      // When the boss WAS resolved inline (normal move_player), the confirmed
      // state has bossFightReady=false, so the useEffect never fires for that
      // case — the move handler navigates to CombatScreen directly instead.
      // Therefore this path is only reached when the boss is NOT yet resolved
      // (skip_to_eow or session restore), and we should always call triggerBoss().
      const bossAlreadyResolvedInline = false;

      if (bossAlreadyResolvedInline) {
        // When the player won, the week already advanced on-chain, so
        // state.time.weekBoss points at the NEXT week's boss. Compute the
        // correct (just-fought) boss from the previous week instead.
        const playerWon = !onChainState.isDead;
        const foughtWeek = (playerWon
          ? Math.max(1, (state.time.week as number) - 1)
          : state.time.week) as 1 | 2 | 3;
        // For Duel mode, bosses are VRF-selected (not deterministic from level+week).
        // SYNC_MOVE preserves the old weekBoss for Duel/Gauntlet when the week advances,
        // so state.time.weekBoss still holds the just-fought boss.
        // For Campaign mode, use the deterministic level-based selection.
        const foughtBoss: BossId | null =
          onChainState.runMode === RunMode.Duel
            ? state.time.weekBoss ?? null
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
        // Use the pre-move/POI HP snapshot as the pre-boss starting HP.
        // By this point, on-chain state has the post-boss HP (boss resolved inline)
        // and SYNC_MOVE already synced it to local state. preBossHpRef captures
        // the HP before the move/POI that triggered the boss.
        const snapshotHp = preBossHpRef.current;
        const localHp = state.player.stats.hp;
        const preBossHp = snapshotHp != null && snapshotHp > 0
          ? snapshotHp
          : localHp > 0
            ? localHp
            : Math.max(state.player.stats.maxHp, 1);
        const playerStats = {
          hp: preBossHp,
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
          {
            finalPlayerHp: onChainState.hp,
            finalPlayerGold: onChainState.gold,
            playerWon,
          },
          onChainState.campaignLevel
        );
        navigateToBossCombat(bossCombatParams, {
          campaignLevel: onChainState.campaignLevel,
          totalMoves: onChainState.totalMoves,
          phase: onChainState.phase,
          runMode: onChainState.runMode,
          enemiesDefeated: onChainState.enemiesDefeated,
        });

        return;
      }

      // Build player stats from on-chain state (post-move, pre-boss).
      // Captured outside try so it's available in the catch fallback.
      // Prefer on-chain HP, then pre-boss snapshot, then local state, then maxHp.
      const fallbackHp = onChainState.hp > 0
        ? onChainState.hp
        : (preBossHpRef.current != null && preBossHpRef.current > 0)
          ? preBossHpRef.current
          : state.player.stats.hp > 0
            ? state.player.stats.hp
            : Math.max(state.player.stats.maxHp, 1);
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
          state.time.week as 1 | 2 | 3,
          bossResult.success && bossResult.newState
            ? {
                finalPlayerHp: bossResult.newState.hp,
                finalPlayerGold: bossResult.newState.gold,
                playerWon: !bossResult.isDead,
              }
            : undefined,
          onChainState?.campaignLevel ?? currentLevel ?? undefined
        );

        debugLog('[GameScreen] Navigating to CombatScreen for weekly fight:', {
          bossId: resolvedWeekBoss ?? null,
          enemyName: bossCombatParams.enemy.name,
          playerHp: playerStats.hp,
          week: state.time.week,
          hasOnChainOutcome: bossResult.success,
        });

        // Keep local exploration state aligned with the confirmed post-boss
        // chain state before showing the replay. Without this, skip-to-EOW can
        // return from CombatScreen to the stale pre-boss week/sidebar state.
        if (
          bossResult.success &&
          bossResult.newState &&
          !bossResult.isDead &&
          !bossResult.newState.completed
        ) {
          dispatch({ type: 'SYNC_MOVE', confirmedState: bossResult.newState });
        }

        navigateToBossCombat(bossCombatParams, {
          campaignLevel: bossResult.newState?.campaignLevel ?? onChainState.campaignLevel,
          totalMoves: bossResult.newState?.totalMoves ?? onChainState.totalMoves,
          phase: bossResult.newState?.phase ?? onChainState.phase,
          runMode: bossResult.newState?.runMode ?? onChainState.runMode,
          enemiesDefeated: bossResult.newState?.enemiesDefeated ?? onChainState.enemiesDefeated,
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
            state.time.week as 1 | 2 | 3,
            undefined,
            onChainState?.campaignLevel ?? currentLevel ?? undefined
          );

          console.warn('[GameScreen] Boss fight on-chain failed, falling back to local resolver:', {
            bossId: resolvedWeekBoss,
            playerHp: playerStats.hp,
          });

          navigateToBossCombat(bossCombatParams, {
            campaignLevel: onChainState.campaignLevel,
            totalMoves: onChainState.totalMoves,
            phase: onChainState.phase,
            runMode: onChainState.runMode,
            enemiesDefeated: onChainState.enemiesDefeated,
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
        // Do NOT reset isTriggeringBossRef here — the focus-return effect
        // handles it once bossFightReady is confirmed false on-chain.
        // Resetting here would allow the boss useEffect to double-fire if
        // the on-chain state hasn't refreshed yet (fire-and-forget latency).
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
    triggerBoss,
    navigation,
    sessionPda,
    gameplayReadConnection,
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
      isMovePending ||
      poiInteraction.isInteracting
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
    poiInteraction.isInteracting,
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
    // Source waypoints from the local game reducer map (populated by SYNC_DISCOVERY).
    return getDiscoveredWaypoints(state.map);
  }, [state?.map]);

  const isFastTravelActive = isFastTravelMode && fastTravelDestinations.length > 0;
  const hasOtherDiscoveredWaypoints = useMemo(() => {
    if (!state?.player?.position) return false;
    return discoveredWaypoints.some(
      (wp) =>
        wp.position.x !== state.player.position.x || wp.position.y !== state.player.position.y
    );
  }, [discoveredWaypoints, state?.player?.position]);
  const canTriggerCurrentPoiInteraction = canTriggerCurrentPoiByPhase || !!poiInteraction.blockedReason;

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


  useLandscapeLock();
  useKeepAwake();

  // Duel week 3: finalize the duel run and show appropriate UI.
  // First player sees a "waiting for opponent" modal.
  // Second player sees the PvP combat animation.
  const handleDuelWeek3Completion = useCallback(async () => {
    if (!sessionPda || !wallet.publicKey || isDuelFinalizingRef.current) return;
    isDuelFinalizingRef.current = true;
    setIsDuelFinalizing(true);

    try {
      const duelProgram = createGameplayStateProgram(connection);
      const sessionSignerKeypair = getSessionSignerKeypair();
      if (!sessionSignerKeypair) {
        console.error('[GameScreen] Duel week 3: no session signer keypair');
        await queueEndGame(0, true);
        navigation.reset({ index: 1, routes: [{ name: 'Hub' }, { name: 'Duels' }] });
        return;
      }

      const [gameStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('game_state'), sessionPda.toBuffer()],
        GAMEPLAY_STATE_PROGRAM_ID
      );

      // Step 1: Undelegate from ER.
      const undelegateResult = await undelegateCurrentSession();
      if (!undelegateResult.success) {
        console.warn('[GameScreen] Duel week 3: undelegate failed:', undelegateResult.error);
      }

      const duelEntry = await fetchDuelEntryForSettlement(duelProgram, sessionPda);
      if (!duelEntry) {
        console.warn('[GameScreen] Duel week 3: no DuelEntry found after undelegation');
        await queueEndGame(0, true);
        navigation.reset({ index: 1, routes: [{ name: 'Hub' }, { name: 'Duels' }] });
        return;
      }
      const wasMatched = !!duelEntry.matchedCreatorPlayer;

      // Step 2: Settle duel on base (captures loadout, resolves PvP, handles payouts).
      console.log('[GameScreen] Duel week 3: settling with matchedCreator:', duelEntry.matchedCreatorPlayer?.toBase58() ?? 'null');
      const settleTx = await buildSettleDuelPayoutTransaction(
        connection,
        duelProgram,
        wallet.publicKey,
        sessionSignerKeypair.publicKey,
        gameStatePda,
        sessionPda,
        duelEntry.matchedCreatorPlayer
      );
      const settleSig = await sendSessionSignerTransaction(connection, settleTx, sessionSignerKeypair);
      await connection.confirmTransaction(settleSig, 'confirmed');
      console.log('[GameScreen] Duel week 3: settle_duel_payout confirmed', settleSig);

      const events = await parseDuelEvents(connection, duelProgram, settleSig);
      console.log('[GameScreen] Duel week 3: parsed events:', {
        hasCombatVisual: !!events.combatVisual,
        hasResolved: !!events.resolved,
        resolution: events.resolved?.resolution ?? 'none',
        wasMatched,
      });

      // Second player: PvP combat was resolved on-chain
      if (
        events.combatVisual &&
        events.resolved?.resolution === 'completedCombat'
      ) {
        const visual = events.combatVisual;
        const ourKey = wallet.publicKey.toBase58();
        const isPlayerA = visual.playerA.toBase58() === ourKey;

        const ourToolInstance = isPlayerA ? visual.playerATool : visual.playerBTool;
        const ourGearInstances = isPlayerA ? visual.playerAGear : visual.playerBGear;
        const oppToolInstance = isPlayerA ? visual.playerBTool : visual.playerATool;
        const oppGearInstances = isPlayerA ? visual.playerBGear : visual.playerAGear;

        const playerTool = ourToolInstance ? convertItemInstanceToTool(ourToolInstance) : null;
        const playerGear = ourGearInstances
          .filter((g): g is NonNullable<typeof g> => g !== null)
          .map((g) => convertItemInstanceToGear(g))
          .filter((g): g is Gear => g !== null);

        const enemyTool = oppToolInstance ? convertItemInstanceToTool(oppToolInstance) : null;
        const enemyGear = oppGearInstances
          .filter((g): g is NonNullable<typeof g> => g !== null)
          .map((g) => convertItemInstanceToGear(g))
          .filter((g): g is Gear => g !== null);

        const playerItemStats = calculateCombatBakedItemStats(playerTool, playerGear);
        const enemyItemStats = calculateCombatBakedItemStats(enemyTool, enemyGear);
        const playerMaxHp = DUEL_BASE_HP + (playerItemStats.hp ?? 0);
        const enemyMaxHp = DUEL_BASE_HP + (enemyItemStats.hp ?? 0);

        const isWinner = events.resolved.winner?.toBase58() === ourKey;
        const finalPlayerHp = isPlayerA ? visual.finalPlayerAHp : visual.finalPlayerBHp;
        const finalEnemyHp = isPlayerA ? visual.finalPlayerBHp : visual.finalPlayerAHp;

        const combatParams: CombatParams = {
          player: {
            name: 'You', emoji: '', definitionId: 'player', isPlayer: true,
            maxHp: playerMaxHp, hp: playerMaxHp,
            atk: playerItemStats.atk ?? 0, arm: playerItemStats.arm ?? 0,
            spd: playerItemStats.spd ?? 0, dig: playerItemStats.dig ?? 0,
            bonusAtk: 0, bonusArm: 0, bonusSpd: 0,
            statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
            strikesPerTurn: 1, ignoresArmor: false,
          },
          enemy: {
            name: 'Opponent', emoji: '', definitionId: 'pvpOpponent', isPlayer: false,
            maxHp: enemyMaxHp, hp: enemyMaxHp,
            atk: enemyItemStats.atk ?? 0, arm: enemyItemStats.arm ?? 0,
            spd: enemyItemStats.spd ?? 0, dig: enemyItemStats.dig ?? 0,
            bonusAtk: 0, bonusArm: 0, bonusSpd: 0,
            statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
            strikesPerTurn: 1, ignoresArmor: false,
          },
          seed: Number(visual.seed % BigInt(2 ** 32)),
          enemyDefinitionId: 'pvpOpponent' as any,
          goldReward: 0,
          activeItemSets: [],
          playerGear,
          playerTool,
          playerGold: 0,
          enemyTool,
          enemyGear,
          week: 3 as 1 | 2 | 3,
          isBossFight: false,
          pvpPlayerActsFirstOnTie: !isPlayerA,
          pvpTieBreakerFavorPlayer: isPlayerA === (Number(visual.seed % BigInt(2)) === 0),
          onChainOutcome: {
            finalPlayerHp: finalPlayerHp,
            finalPlayerGold: 0,
            playerWon: isWinner,
          },
        };

        await queueEndGame(0, true);
        navigateToCombat(navigation, combatParams, {
          campaignLevel: 0,
          totalMoves: onChainState?.totalMoves ?? 0,
          phase: onChainState?.phase ?? 0,
          runMode: onChainState?.runMode,
          enemiesDefeated: onChainState?.enemiesDefeated ?? 0,
        });
        return;
      }

      if (events.resolved?.resolution === 'opponentEliminated') {
        await endSessionWithSessionSigner().catch((err) => {
          console.warn('[GameScreen] Duel week 3: endSession after opponent elimination failed:', err);
          return queueEndGame(0, true);
        });
        navigation.reset({ index: 1, routes: [{ name: 'Hub' }, { name: 'Duels' }] });
        return;
      }

      if (wasMatched) {
        throw new Error('Matched duel settlement completed without PvP resolution event');
      }

      // First player: opponent hasn't finished yet — end session properly
      await endSessionWithSessionSigner().catch((err) => {
        console.warn('[GameScreen] Duel week 3: endSession failed, queuing cleanup:', err);
        return queueEndGame(0, true);
      });
      setDuelCompleteVisible(true);
    } catch (err) {
      console.error('[GameScreen] Duel week 3 completion failed:', err);
      await endSessionWithSessionSigner().catch(() => queueEndGame(0, true).catch(() => {}));
      navigation.reset({ index: 1, routes: [{ name: 'Hub' }, { name: 'Duels' }] });
    } finally {
      isDuelFinalizingRef.current = false;
      setIsDuelFinalizing(false);
    }
  }, [
    sessionPda, wallet.publicKey, connection, gameplayReadConnection,
    undelegateCurrentSession, getSessionSignerKeypair, queueEndGame, endSessionWithSessionSigner,
    navigation, onChainState,
  ]);

  useEffect(() => {
    if (mode === 'guest' || !sessionPda || !onChainState) return;

    const shouldFinalizeDuelWeek3 =
      onChainState.runMode === RunMode.Duel &&
      onChainState.completed &&
      !onChainState.isDead &&
      !duelCompleteVisible &&
      !isDuelFinalizing;

    if (!shouldFinalizeDuelWeek3) {
      if (!onChainState.completed) {
        duelWeek3FinalizeRequestedRef.current = null;
      }
      return;
    }

    const finalizeKey = `${sessionPda.toBase58()}:${onChainState.week}:${onChainState.completed}`;
    if (duelWeek3FinalizeRequestedRef.current === finalizeKey) return;

    duelWeek3FinalizeRequestedRef.current = finalizeKey;
    handleDuelWeek3Completion();
  }, [
    mode,
    sessionPda,
    onChainState,
    duelCompleteVisible,
    isDuelFinalizing,
    handleDuelWeek3Completion,
  ]);

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

        dispatch({ type: 'MOVE', direction, autoOpenPOI });
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

      // On-chain: send transaction, await confirmation, then sync local state
      const tTap = Date.now();
      isMovePendingRef.current = true;

      // Safety timeout: if the move promise hangs (WS listener stall, network issue),
      // reset the guard after 5s so the player isn't permanently stuck.
      const moveSafetyTimeout = setTimeout(() => {
        if (isMovePendingRef.current) {
          console.warn('[GameScreen] Move safety timeout — resetting isMovePending');
          isMovePendingRef.current = false;
          setIsMovePending(false);
        }
      }, 5000);
      // Defer setIsMovePending(true) — the ref is enough for the synchronous guard.
      // Setting state here triggers a full re-render before the TX send, adding
      // 100-300ms of render blocking to the perceived move latency.

      // Snapshot HP before move for the boss useEffect fallback.
      preBossHpRef.current = onChainState?.hp ?? state.player.stats.hp;

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

      console.log(`[perf] tap→send: ${Date.now() - tTap}ms`);
      movePlayer({ targetX: targetPos.x, targetY: targetPos.y })
        .then(async (result) => {
          console.log(`[perf] tap→moveResult: ${Date.now() - tTap}ms`);
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
            console.warn('[GameScreen] Move failed, resyncing. bossFightReady:', result.bossFightReady,
              'bossResolvedInline:', result.bossResolvedInline);
            // Resync full state from chain to recover from any mismatch
            const prevPos = stateRef.current?.player?.position;
            resyncFromChain().then(() => {
              const newPos = stateRef.current?.player?.position;
              const posChanged = prevPos && newPos &&
                (prevPos.x !== newPos.x || prevPos.y !== newPos.y);
              showWallBreakFeedback(posChanged ? 'Synced state on-chain' : 'Movement failed');
            });
            return;
          }

          if (!result.newState) {
            // TX may have confirmed but state fetch failed — full resync
            debugLog('[GameScreen] Move succeeded but newState is null, resyncing...');
            resyncFromChain();
            return;
          }

          {
            // Extract updated weekBoss from SessionDiscovery (for Duel/Gauntlet VRF-based bosses)
            const discoveryBossId = result.discovery
              ? decodeBossId(result.discovery.currentBossId) ?? undefined
              : undefined;

            // Prevent the boss useEffect from racing with the move handler.
            // SYNC_MOVE below will set bossFightReady + isDead on the next render,
            // but the move handler needs to navigate to CombatScreen first.
            if (result.bossResolvedInline || result.bossFightReady) {
              isTriggeringBossRef.current = true;
            }

            // Update local state from confirmed on-chain state
            dispatch({ type: 'SYNC_MOVE', confirmedState: result.newState, weekBoss: discoveryBossId });
            console.log(`[perf] tap→dispatch: ${Date.now() - tTap}ms`);

            // Sync newly revealed tiles, enemies, and POIs from SessionDiscovery
            // (fetched in parallel with the move confirmation — no extra latency)
            if (result.discovery) {
              const discovery = result.discovery;
              const tiles = unpackDiscoveryTiles(discovery, discovery.mapWidth, discovery.mapHeight);
              const enemies = convertDiscoveredEnemies(discovery.discoveredEnemies, discovery.discoveredEnemyCount);
              const pois = convertDiscoveredPois(discovery.discoveredPois, discovery.discoveredPoiCount);
              dispatch({ type: 'SYNC_DISCOVERY', tiles, enemies, pois });
            }

            // When WS missed discovery delivery (common on mobile), a background
            // fetch is in-flight. Consume it to patch fog-of-war without blocking.
            if (result.lazyDiscovery) {
              void result.lazyDiscovery.then((lazy) => {
                if (lazy) {
                  const tiles = unpackDiscoveryTiles(lazy, lazy.mapWidth, lazy.mapHeight);
                  const enemies = convertDiscoveredEnemies(lazy.discoveredEnemies, lazy.discoveredEnemyCount);
                  const pois = convertDiscoveredPois(lazy.discoveredPois, lazy.discoveredPoiCount);
                  dispatch({ type: 'SYNC_DISCOVERY', tiles, enemies, pois });
                }
              });
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
            if (result.bossResolvedInline || result.bossFightReady) {
              console.log('[GameScreen] Boss check:', {
                bossResolvedInline: result.bossResolvedInline,
                previousPhase: result.previousState?.phase,
                previousWeek: result.previousState?.week,
                newWeek: result.newState?.week,
                isDead: result.isDead,
                weekBoss: state.time.weekBoss,
              });
            }
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

                  navigateToBossCombat(gauntletCombatParams, result.newState);
                  return;
                }

                // Fallback: visual parsing failed, build params from on-chain echo data
                console.warn(
                  '[GameScreen] Gauntlet visual parsing failed, attempting fallback from on-chain echo data'
                );
                if (sessionPda) {
                  const fallback = await buildFallbackGauntletCombatParams(
                    gameplayReadConnection,
                    sessionPda,
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
                    navigateToBossCombat(fallback, result.newState);
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

              // Campaign / Duel: boss fight auto-resolved inline in move_player.
              // Compute the fought boss from previousState.week (the week BEFORE the
              // boss was resolved). state.time.weekBoss may already point to the NEXT
              // week's boss if a resync (RESTORE_GAME) ran between clicks.
              const foughtWeekForInline = (result.previousState?.week ?? currentWeek) as 1 | 2 | 3;
              // Use the boss ID from the BossCombatStarted event (authoritative).
              // Falls back to state.time.weekBoss for Duel or selectWeekBossForLevel for Campaign.
              const resolvedWeekBoss: BossId | null =
                (result.inlineBossId as BossId | undefined) ??
                (result.newState.runMode === RunMode.Duel
                  ? state.time.weekBoss ?? null
                  : result.previousState
                    ? selectWeekBossForLevel(
                        result.previousState.campaignLevel ?? onChainState!.campaignLevel,
                        foughtWeekForInline
                      )
                    : state.time.weekBoss ?? null);

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
                  foughtWeekForInline,
                  {
                    finalPlayerHp: result.newState.hp,
                    finalPlayerGold: result.newState.gold,
                    playerWon: !result.isDead,
                  },
                  onChainState?.campaignLevel ?? currentLevel ?? undefined
                );

                debugLog(
                  '[GameScreen] Inline boss resolved in move_player, navigating to CombatScreen:',
                  {
                    bossId: resolvedWeekBoss,
                    preBossHp: bossPlayerHp,
                    postBossHp: result.newState.hp,
                    playerWon: !result.isDead,
                  }
                );

                navigateToBossCombat(bossCombatParams, result.newState);

                // Fire-and-forget: re-fetch discovery bossId for the new week's sidebar.
                // The parallel discovery fetch may have returned stale data (ER race).
                // This completes while the player watches the combat animation.
                if (!result.isDead && sessionPda && result.newState) {
                  const confirmedForBoss = result.newState;
                  const [sdPda] = deriveSessionDiscoveryPda(sessionPda);
                  fetchSessionDiscovery(
                    createMapGeneratorProgram(gameplayReadConnection),
                    sdPda
                  )
                    .then((fresh) => {
                      if (fresh) {
                        const freshBossId = decodeBossId(fresh.currentBossId);
                        if (freshBossId) {
                          dispatch({
                            type: 'SYNC_MOVE',
                            confirmedState: confirmedForBoss,
                            weekBoss: freshBossId,
                          });
                        }
                      }
                    })
                    .catch(() => {});
                }
                return; // Skip field enemy combat handling below
              }
            }

            // Boss combat requires a separate trigger_boss_fight call.
            // move_player sets boss_fight_ready = true but does NOT resolve the boss
            // inline (heap exhaustion constraint). Call triggerBoss() here in the
            // move handler to avoid a race with the boss useEffect.
            // Skip if player died to a field enemy on this move — the death handler
            // below will navigate to DeathScreen instead.
            if (
              !result.bossResolvedInline &&
              result.bossFightReady &&
              !result.isDead
            ) {
              isTriggeringBossRef.current = true;
              console.log('[GameScreen] Boss not resolved inline, calling triggerBoss from move handler');
              triggerBoss()
                .then(async (bossResult) => {
                  if (!bossResult.success || !bossResult.newState) {
                    console.error('[GameScreen] triggerBoss failed in move handler');
                    isTriggeringBossRef.current = false;
                    return;
                  }

                  if (result.newState?.runMode === RunMode.Gauntlet) {
                    // Gauntlet: build combat params from on-chain echo data
                    if (sessionPda) {
                      const fallback = await buildFallbackGauntletCombatParams(
                        gameplayReadConnection,
                        sessionPda,
                        currentWeek,
                        {
                          hp: bossResult.newState.hp,
                          gold: bossResult.newState.gold,
                          isDead: !!bossResult.isDead,
                        },
                        preCombatPlayerStats,
                        preCombatGear,
                        preCombatTool,
                        preCombatItemsets,
                        preCombatSeed
                      );
                      if (fallback) {
                        navigateToBossCombat(fallback, bossResult.newState);
                        return;
                      }
                    }
                  } else {
                    // Duel: regular boss fight resolved via triggerBoss
                    const foughtBoss = state?.time.weekBoss ?? null;
                    if (foughtBoss) {
                      const bossCombatParams = createBossCombatParams(
                        foughtBoss,
                        {
                          hp: preCombatPlayerStats.hp,
                          maxHp: preCombatPlayerStats.maxHp,
                          atk: preCombatPlayerStats.atk,
                          arm: preCombatPlayerStats.arm,
                          spd: preCombatPlayerStats.spd,
                          dig: preCombatPlayerStats.dig,
                          gold: bossResult.newState.gold,
                        },
                        preCombatGear,
                        preCombatTool,
                        preCombatItemsets,
                        preCombatSeed,
                        currentWeek as 1 | 2 | 3,
                        {
                          finalPlayerHp: bossResult.newState.hp,
                          finalPlayerGold: bossResult.newState.gold,
                          playerWon: !bossResult.isDead,
                        },
                        onChainState?.campaignLevel ?? currentLevel ?? undefined
                      );
                      navigateToBossCombat(bossCombatParams, bossResult.newState);
                      return;
                    }
                  }

                  if (bossResult.isDead) {
                    navigateToDeath(navigation, bossResult.newState, `Week ${currentWeek} Boss`);
                  } else if (bossResult.newState.completed) {
                    // Final week won — navigate to Victory
                    stopAutoCommit();
                    let itemUnlocked: UnlockedItem | undefined;
                    if (hasActiveSession) {
                      const endResult = await endSessionWithSessionSigner();
                      if (endResult.success && endResult.settleSignature) {
                        itemUnlocked = await parseItemUnlockFromSettle(connection, endResult.settleSignature);
                      } else {
                        void queueEndGame(bossResult.newState.campaignLevel, true).catch(() => {});
                      }
                    }
                    navigation.replace('Victory', {
                      level: bossResult.newState.campaignLevel,
                      totalMoves: bossResult.newState.totalMoves,
                      enemiesDefeated: bossResult.newState.enemiesDefeated,
                      levelUnlocked: bossResult.newState.campaignLevel + 1,
                      itemUnlocked,
                      runMode: bossResult.newState.runMode,
                      gauntletPoints: bossResult.newState.gauntletPointsEarned,
                    });
                  } else {
                    // Player won — state advanced to next week.
                    // Sync the new on-chain state to local reducer FIRST to prevent
                    // the Boss useEffect from re-triggering with stale bossFightReady.
                    dispatch({ type: 'SYNC_MOVE', confirmedState: bossResult.newState! });

                    // Sync boss ID from SessionDiscovery for the new week.
                    if (sessionPda && onChainState) {
                      const signerKp = getSessionSignerKeypair();
                      if (signerKp) {
                        const [gsaPda] = PublicKey.findProgramAddressSync(
                          [Buffer.from('game_state'), sessionPda.toBuffer()],
                          GAMEPLAY_STATE_PROGRAM_ID
                        );
                        syncDiscoveryBoss(
                          gameplayReadConnection,
                          createGameplayStateProgram(gameplayReadConnection),
                          gsaPda,
                          sessionPda,
                          signerKp
                        ).then(async () => {
                          const [sdPda] = deriveSessionDiscoveryPda(sessionPda);
                          const fresh = await fetchSessionDiscovery(
                            createMapGeneratorProgram(gameplayReadConnection),
                            sdPda
                          ).catch(() => null);
                          if (fresh) {
                            const newBossId = decodeBossId(fresh.currentBossId);
                            if (newBossId) {
                              dispatch({ type: 'SYNC_MOVE', confirmedState: bossResult.newState!, weekBoss: newBossId });
                            }
                          }
                        }).catch(() => {});
                      }
                    }
                    isTriggeringBossRef.current = false;
                  }
                })
                .catch((err) => {
                  console.error('[GameScreen] triggerBoss error in move handler:', err);
                  isTriggeringBossRef.current = false;
                });
              return;
            }

            // Duel week 3: no boss fight — handle duel completion.
            // On-chain sets completed=true and bossFightReady=false for this case.
            if (
              !result.bossResolvedInline &&
              result.newState?.runMode === RunMode.Duel &&
              result.newState?.completed &&
              !result.isDead
            ) {
              handleDuelWeek3Completion();
              return;
            }

            // Handle combat - always go through CombatScreen for visualization.
            // Day combat metadata parsing is intentionally skipped in useGameplayState.move()
            // to save an RPC call, so zero-damage wins against an enemy on the target tile
            // must still open CombatScreen based on the pre-move local map state.
            const shouldShowCombat =
              result.combatOccurred || (!!enemyAtTarget && !result.bossResolvedInline);

            if (shouldShowCombat) {
              // Suppress POI auto-trigger at this position: combat takes priority.
              // After combat the player can manually open the POI with the A button.
              lastAutoTriggeredPosRef.current = { x: targetPos.x, y: targetPos.y };

              // Compute deltas early — auto-resolve needs them even without enemy ID.
              const hpDelta = result.newState.hp - preCombatPlayerStats.hp;
              const goldDelta = result.newState.gold - preCombatPlayerStats.gold;

              // Auto-resolve: show floating indicators on map regardless of enemy ID.
              // During night phase, enemies move on-chain and local state has stale
              // positions, so combatEnemy/combatEnemyInfo may both be null. The
              // indicator only needs hp/gold deltas, not which enemy was fought.
              if (autoResolveCombat) {
                debugLog('[GameScreen] Auto-resolve combat:', {
                  preCombatPlayerHp: preCombatPlayerStats.hp,
                  postCombatPlayerHp: result.newState.hp,
                  goldBefore: preCombatPlayerStats.gold,
                  goldAfter: result.newState.gold,
                  playerDied: result.isDead,
                });
                if (hpDelta !== 0 || goldDelta > 0) {
                  combatResultIdRef.current += 1;
                  setCombatResultIndicators((prev) => [
                    ...prev,
                    {
                      id: `cr_${combatResultIdRef.current}`,
                      goldDelta: Math.max(0, goldDelta),
                      hpDelta,
                    },
                  ]);
                }
                // In gauntlet, boss_fight_ready is set on the last Night3 move but
                // the echo is NOT resolved inline (separate trigger_boss_fight IX).
                // If the player died here, it was a field enemy — not the echo.
                const isFieldEnemyDeath = result.isDead && (
                  !result.bossFightReady ||
                  (result.newState.runMode === RunMode.Gauntlet && !result.bossResolvedInline)
                );
                if (isFieldEnemyDeath) {
                  // Find enemy for death screen metadata (best-effort)
                  const combatEnemy = enemyAtTarget ?? state.map.enemies.find(
                    (e) =>
                      e.position.x === state.player.position.x &&
                      e.position.y === state.player.position.y
                  );
                  defeatMetaRef.current = {
                    killedBy: combatEnemy?.definitionId,
                    totalMoves: result.newState.totalMoves,
                    level: result.newState.campaignLevel,
                    week: result.newState.week,
                    phase: result.newState.phase,
                    runMode: result.newState.runMode,
                    enemiesDefeated: result.newState.enemiesDefeated,
                  };
                  setDefeatOverlayVisible(true);
                }
              } else {
              // Non-auto-resolve: need enemy identity for CombatScreen replay.
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

              if (combatEnemy || result.combatEnemyInfo) {
                debugLog('[GameScreen] Combat occurred:', {
                  enemyId: combatEnemy?.definitionId ?? result.combatEnemyInfo?.archetype,
                  preCombatPlayerHp: preCombatPlayerStats.hp,
                  postCombatPlayerHp: result.newState.hp,
                  goldBefore: preCombatPlayerStats.gold,
                  goldAfter: result.newState.gold,
                  playerDied: result.isDead,
                });

                if (combatEnemy) {
                  // Navigate to CombatScreen to show combat replay
                  const combatParams = createCombatParams(
                    combatEnemy,
                    preCombatPlayerStats,
                    preCombatGear,
                    preCombatTool,
                    preCombatItemsets,
                    preCombatSeed,
                    currentWeek,
                    {
                      finalPlayerHp: result.newState.hp,
                      finalPlayerGold: result.newState.gold,
                      playerWon: !result.isDead,
                    }
                  );
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
                    if (result.isDead && (!result.bossFightReady ||
                        (result.newState.runMode === RunMode.Gauntlet && !result.bossResolvedInline))) {
                      navigateToDeath(navigation, result.newState, 'Unknown enemy');
                    }
                  }
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
                // In gauntlet, bossFightReady doesn't mean the echo killed the player
                // (echo requires separate trigger_boss_fight) — it's a field enemy death.
                if (result.isDead && (!result.bossFightReady ||
                    (result.newState.runMode === RunMode.Gauntlet && !result.bossResolvedInline))) {
                  navigateToDeath(navigation, result.newState, 'Unknown enemy');
                }
              }
              } // close non-auto-resolve else
            } else if (result.isDead && (!result.bossFightReady ||
                (result.newState?.runMode === RunMode.Gauntlet && !result.bossResolvedInline))) {
              // Non-combat death (shouldn't normally happen, but handle edge case).
              debugLog('[GameScreen] Player died (non-combat), navigating to DeathScreen');
              navigateToDeath(navigation, result.newState);
            }
          }
        })
        .catch((err) => {
          console.error('[GameScreen] movePlayer error:', err);
          showWallBreakFeedback('Movement sync error');
          // Resync on unexpected errors too
          resyncFromChain();
        })
        .finally(() => {
          console.log(`[perf] tap→done: ${Date.now() - tTap}ms`);
          clearTimeout(moveSafetyTimeout);
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
      getSessionSignerKeypair,
      gameplayReadConnection,
      isFastTravelActive,
      fastTravelDestinations.length,
      resyncFromChain,
      autoResolveCombat,
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

    // Use ref for latest position to avoid stale closure after fast travel
    const currentPos = stateRef.current?.player?.position ?? state.player.position;

    // Prevent fast traveling to current position (stale closure)
    if (
      currentPos.x === dest.x &&
      currentPos.y === dest.y
    ) {
      console.warn('[GameScreen] Fast travel dest === current position, skipping');
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

    // Optimistically move the player to the destination so the UI updates immediately.
    // executeFastTravel also dispatches SYNC_MOVE internally after the chain fetch,
    // but that fetch can return stale data if the ER hasn't committed the write yet.
    // FAST_TRAVEL_TO guarantees the local position matches the destination right away.
    lastAutoTriggeredPosRef.current = { x: dest.x, y: dest.y };
    dispatch({ type: 'FAST_TRAVEL_TO', destination: dest });
    setIsFastTravelMode(false);
    setFastTravelDestinations([]);

    poiInteraction.executeFastTravel(currentPos, dest).then(async (result) => {
      if (result.success) {
        // Fetch SessionDiscovery to sync discovery state after fast travel
        if (sessionPda && gameplayReadConnection) {
          try {
            const [sdPda] = deriveSessionDiscoveryPda(sessionPda);
            const sd = await fetchSessionDiscovery(
              createMapGeneratorProgram(gameplayReadConnection), sdPda
            ).catch(() => null);
            if (sd) {
              const sdTiles = unpackDiscoveryTiles(sd, sd.mapWidth, sd.mapHeight);
              const sdEnemies = convertDiscoveredEnemies(sd.discoveredEnemies, sd.discoveredEnemyCount);
              const sdPois = convertDiscoveredPois(sd.discoveredPois, sd.discoveredPoiCount);
              dispatch({ type: 'SYNC_DISCOVERY', tiles: sdTiles, enemies: sdEnemies, pois: sdPois });
            }
          } catch (err) {
            console.warn('[GameScreen] Failed to refresh discovery after fast travel:', err);
          }
        }
      } else if (result.error) {
        showWallBreakFeedback(result.error);
      }
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
    gameplayReadConnection,
    showWallBreakFeedback,
  ]);

  // Derive max gear slots from the session's maxWeeks (3 for campaign/duel/guest, 5 for gauntlet).
  // Guest mode has no onChainState, so defaults to TOTAL_WEEKS (3) → 8 slots.
  const resolvedSessionRunMode = onChainState?.runMode ?? gameplayContextState?.runMode;
  const sessionMaxWeeks =
    onChainState?.maxWeeks ??
    gameplayContextState?.maxWeeks ??
    (resolvedSessionRunMode === RunMode.Gauntlet ? 5 : GAME_CONSTANTS.TOTAL_WEEKS);
  const runMaxGearSlots =
    GAME_CONSTANTS.INITIAL_INVENTORY_SLOTS +
    (sessionMaxWeeks - 1) * GAME_CONSTANTS.INVENTORY_SLOTS_PER_WEEK;
  const isGauntletLayout = sessionMaxWeeks > GAME_CONSTANTS.TOTAL_WEEKS;
  const activeItemsetsCount = state?.player?.activeItemsets?.length ?? 0;
  const totalPlayerSlots = runMaxGearSlots + 1 + activeItemsetsCount; // gear slots + weapon slot + itemset slots

  const getPlayerItemAtSlot = useCallback(
    (index: number): Tool | Gear | null => {
      if (!state) return null;
      if (index === runMaxGearSlots) return state.player.equippedTool;
      const slot = state.player.inventory.find((s) => s.index === index);
      return slot?.item ?? null;
    },
    [state, runMaxGearSlots]
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
    isController && isFocused && !!state && !isPOIModalOpen && !showPauseMenu && !showSkipToEow && !showTutorial;

  // Compact view sidebar toggle via X — kept separate so it works even when POI modal is open
  const [isCompactSidebarVisible, setIsCompactSidebarVisible] = useState(true);
  const sidebarToggleEnabled = isController && isFocused && !!state && !showPauseMenu && !showSkipToEow && !showTutorial;

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
              if (prev > runMaxGearSlots) return runMaxGearSlots;
              if (prev === runMaxGearSlots) {
                // Weapon → last gear row (column 0)
                const lastRowStart = Math.max(
                  0,
                  runMaxGearSlots - (runMaxGearSlots % 4 || 4)
                );
                return Math.min(lastRowStart, runMaxGearSlots - 1);
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
              if (prev > runMaxGearSlots) {
                const lastItemsetIndex = runMaxGearSlots + activeItemsetsCount;
                if (prev >= lastItemsetIndex) return prev;
                return prev + 1;
              }
              // At weapon — go to first itemset if any
              if (prev === runMaxGearSlots) {
                if (activeItemsetsCount > 0) return runMaxGearSlots + 1;
                return prev;
              }
              // In gear zone
              const nextRow = prev + 4;
              if (nextRow >= runMaxGearSlots) return runMaxGearSlots;
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
              if (prev > runMaxGearSlots) {
                if (prev <= runMaxGearSlots + 1) return prev;
                return prev - 1;
              }
              if (prev === runMaxGearSlots) return prev; // weapon, no left/right
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
              if (prev > runMaxGearSlots) {
                const lastItemsetIndex = runMaxGearSlots + activeItemsetsCount;
                if (prev >= lastItemsetIndex) return prev;
                return prev + 1;
              }
              if (prev === runMaxGearSlots) return prev; // weapon, no left/right
              if (prev % 4 === 3) return prev;
              if (prev + 1 >= runMaxGearSlots) return prev;
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
          if (focusedSlotIndex > runMaxGearSlots) {
            // Itemset slot
            const itemsetIndex = focusedSlotIndex - runMaxGearSlots - 1;
            const itemsetId = state?.player?.activeItemsets?.[itemsetIndex];
            if (itemsetId)
              handleInspectItemset(itemsetId as import('../game/engine/types').ItemsetId);
          } else if (focusedSlotIndex === runMaxGearSlots) {
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
        } else if (canTriggerCurrentPoiInteraction && state?.phase === GamePhase.Exploration) {
          tryOpenCurrentPoiInteraction();
        }
      },
      onB: () => {
        playSfx('ui_back');
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

        playSfx('ui_hover');
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

        playSfx('ui_hover');
        if (inventoryFocus === 'enemy') {
          setInventoryFocus('none');
        } else {
          setInventoryFocus('enemy');
          setFocusedSlotIndex(0);
        }
      },
      onStart: () => {
        playSfx('ui_click');
        setShowPauseMenu(true);
      },
      onSelect: () => {
        playSfx('ui_click');
        setShowTutorial(true);
      },
    },
    controllerEnabled
  );

  // Controller A button to dismiss duel completion modal
  useControllerAction(
    {
      onA: () => {
        if (duelCompleteVisible) {
          setDuelCompleteVisible(false);
          playBgm('hub');
          navigation.reset({ index: 1, routes: [{ name: 'Hub' }, { name: 'Duels' }] });
        }
      },
    },
    isController && duelCompleteVisible
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

  const tryOpenCurrentPoiInteraction = useCallback(() => {
    if (!state || state.phase !== GamePhase.Exploration) return;

    // Show toast feedback when POI is completely unusable instead of opening modal
    if (poiInteraction.blockedReason) {
      showWallBreakFeedback(poiInteraction.blockedReason);
      playSfx('ui_error');
      return;
    }

    if (!poiInteraction.canInteract) return;
    // Snapshot HP before POI (POI can consume last moves and trigger inline boss).
    preBossHpRef.current = onChainState?.hp ?? state.player.stats.hp;
    poiInteraction.interact();
  }, [
    state,
    poiInteraction.blockedReason,
    poiInteraction.canInteract,
    poiInteraction.interact,
    showWallBreakFeedback,
    playSfx,
  ]);

  // Navigate to CombatScreen when game phase transitions to Combat or BossFight.
  // In on-chain mode, combat navigation is handled directly by handleDirection.
  // This effect only applies to guest mode where the local reducer triggers combat.
  useEffect(() => {
    if (
      mode === 'guest' &&
      (state?.phase === GamePhase.Combat || state?.phase === GamePhase.BossFight)
    ) {
      // Auto-resolve field enemy combat (not boss fights) without opening CombatScreen
      if (autoResolveCombat && state.phase === GamePhase.Combat && state.combat) {
        const preCombatHp = state.combat.player.hp;
        const preCombatGold = state.player.stats.gold;
        const playerGear = state.player.inventory.map((slot) => slot.item);
        const resolved = resolveCombatWithParity({
          player: state.combat.player,
          enemy: state.combat.enemy,
          seed: state.rngState,
          playerGear,
          playerTool: state.player.equippedTool,
          playerGold: state.player.stats.gold,
          enemyDefinitionId: state.combat.enemyDefinitionId,
          enemyId: state.combat.enemyDefinitionId as import('../game/combat/traits').EnemyId,
          enemyTier: state.combat.enemyTier,
        });
        const combatResult = resolved.player.hp > 0 ? 'VICTORY' : 'DEFEAT';
        dispatch({ type: 'RESOLVE_COMBAT', result: combatResult, combat: resolved });

        const postCombatHp = Math.min(state.player.stats.maxHp, Math.max(0, resolved.player.hp));
        const hpDelta = postCombatHp - preCombatHp;
        const goldReward = combatResult === 'VICTORY' ? (resolved.goldReward ?? 0) : 0;
        const goldDelta = goldReward;

        if (hpDelta !== 0 || goldDelta > 0) {
          combatResultIdRef.current += 1;
          setCombatResultIndicators((prev) => [
            ...prev,
            {
              id: `cr_${combatResultIdRef.current}`,
              goldDelta: Math.max(0, goldDelta),
              hpDelta,
            },
          ]);
        }

        if (combatResult === 'DEFEAT') {
          const localPhaseNumber = state.time
            ? (state.time.cycle - 1) * 2 + (state.time.phase === 'NIGHT' ? 1 : 0)
            : 0;
          defeatMetaRef.current = {
            killedBy: resolved.enemy.name,
            totalMoves: state.totalMoves ?? 0,
            level: profile?.currentLevel ?? 1,
            week: state.time.week,
            phase: localPhaseNumber,
            enemiesDefeated: 0,
          };
          setDefeatOverlayVisible(true);
        }
        return;
      }
      navigation.navigate('Combat');
    }
  }, [state?.phase, navigation, mode, autoResolveCombat, dispatch]);

  // Auto-trigger POI interaction when player moves onto a POI.
  // Uses shouldAutoOpen instead of canInteract to skip auto-open for POIs with unmet preconditions
  // (e.g., inventory full for pick-item POIs, already has oil for Tool Oil Rack).
  // lastAutoTriggeredPosRef prevents re-triggering at the same position after modal close.
  // We intentionally do NOT gate on "position changed" because shouldAutoOpen can resolve
  // one render after the position update (on-chain POI data loads asynchronously).
  // Extract stable values from poiInteraction to avoid re-triggering on every hook state change.
  // poiInteract is stored in a ref because it has 15+ deps and changes reference frequently,
  // but the effect only needs to call it — not re-run when it changes.
  const { shouldAutoOpen, isInteracting, interact: poiInteract, currentPoi } = poiInteraction;
  const poiInteractRef = useRef(poiInteract);
  poiInteractRef.current = poiInteract;

  const isSurveyBeacon = currentPoi?.poiType === POI_TYPES.SURVEY_BEACON;

  useEffect(() => {
    // Survey Beacon always auto-triggers regardless of the auto-open setting
    if (!autoOpenPOI && !isSurveyBeacon) return;
    if (!state?.player?.position || state.phase !== GamePhase.Exploration || !isFocused) return;
    const currentPos = state.player.position;
    const lastAutoPos = lastAutoTriggeredPosRef.current;

    const alreadyTriggeredHere =
      lastAutoPos && lastAutoPos.x === currentPos.x && lastAutoPos.y === currentPos.y;

    if (shouldAutoOpen && !isInteracting && !alreadyTriggeredHere && canTriggerCurrentPoiInteraction) {
      debugLog('[GameScreen] Auto-triggering POI interaction at', currentPos.x, currentPos.y);
      // Always mark as triggered to prevent infinite retry loops on persistent errors
      // (e.g., VRF not fulfilled). The player can manually retry by stepping off and back.
      lastAutoTriggeredPosRef.current = { x: currentPos.x, y: currentPos.y };
      void poiInteractRef.current();
    }

    // Clear last auto-triggered position when player moves away from it
    if (lastAutoPos && (lastAutoPos.x !== currentPos.x || lastAutoPos.y !== currentPos.y)) {
      lastAutoTriggeredPosRef.current = null;
    }
  }, [
    autoOpenPOI,
    isSurveyBeacon,
    state?.player?.position,
    state?.phase,
    shouldAutoOpen,
    isInteracting,
    isFocused,
    canTriggerCurrentPoiInteraction,
  ]);

  useEffect(() => {
    if (!state?.player?.position || state.phase !== GamePhase.Exploration || !isFocused) return;
    if (!poiInteraction.currentPoi) return;

    const currentPos = state.player.position;
    const lastAutoPos = lastAutoTriggeredPosRef.current;
    const alreadyTriggeredHere =
      !!lastAutoPos && lastAutoPos.x === currentPos.x && lastAutoPos.y === currentPos.y;

    console.warn('[GameScreen] POI auto-open gates', {
      position: currentPos,
      poiType: poiInteraction.currentPoi.poiType,
      autoOpenPOI,
      shouldAutoOpen,
      isInteracting,
      canTriggerCurrentPoiInteraction,
      alreadyTriggeredHere,
      isFocused,
      phase: state.phase,
    });
  }, [
    autoOpenPOI,
    canTriggerCurrentPoiInteraction,
    isFocused,
    isInteracting,
    poiInteraction.currentPoi,
    shouldAutoOpen,
    state?.phase,
    state?.player?.position,
  ]);

  const handleFastTravel = useCallback(() => {
    // Use ref for latest position to avoid stale closure after fast travel
    const currentPos = stateRef.current?.player?.position;
    if (!currentPos) {
      return;
    }

    // Always use discoveredWaypoints as the source of truth for destinations.
    // activePOI.options may be stale or unavailable if the modal was opened via
    // SHOW_POI_MODAL fallback (which doesn't generate options).
    const destinations = discoveredWaypoints
      .map((wp) => wp.position)
      .filter((pos) => pos.x !== currentPos.x || pos.y !== currentPos.y)
      .filter((pos, index, arr) => arr.findIndex((p) => p.x === pos.x && p.y === pos.y) === index);

    if (destinations.length === 0) {
      showWallBreakFeedback('No other waypoints discovered');
      return;
    }

    let nearestIndex = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < destinations.length; i++) {
      const dest = destinations[i];
      const dist = Math.abs(dest.x - currentPos.x) + Math.abs(dest.y - currentPos.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIndex = i;
      }
    }

    // Prevent auto-open effect from immediately reopening the waypoint modal
    // after we close it to enter fast-travel selection.
    lastAutoTriggeredPosRef.current = { x: currentPos.x, y: currentPos.y };

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
      // Guard against double-tap while a POI interaction is in progress
      if (poiInteraction.isInteracting) {
        debugLog('[GameScreen] handlePOIOption BLOCKED: interaction already in progress');
        return;
      }

      // Weapon swap confirmation: if picking a tool and player already has a non-default weapon
      {
        const equippedTool = state?.player?.equippedTool;
        const hasRealWeapon = equippedTool && equippedTool.id !== 'T0';
        if (hasRealWeapon) {
          const selectedItem =
            poiInteraction.cacheOfferOptions?.[optionIndex]?.item ??
            state?.activePOI?.options?.[optionIndex]?.item;
          if (selectedItem && 'rarity' in selectedItem && !('currentRarity' in selectedItem)) {
            // It's a tool — prompt confirmation before proceeding
            setPendingWeaponSwap({ optionIndex, toolName: selectedItem.name });
            return;
          }
        }
      }

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
            // Boss/echo resolved during POI (e.g., Rest Alcove on Night 3) — show CombatScreen
            if (result.bossResolved && state) {
              const {
                playerWon,
                finalPlayerHp,
                finalPlayerGold,
                totalMoves,
                phase,
                runMode,
                campaignLevel,
                preBossPlayerHp,
                turnsTaken,
                finalEnemyHp,
                signature,
              } = result.bossResolved;
              // state.time.week is pre-POI (closure captures pre-dispatch value),
              // which is the correct fought week for both wins and losses.
              const foughtWeek = state.time.week as 1 | 2 | 3;

              // Gauntlet: echo combat resolved inline via skip_to_day.
              if (runMode === RunMode.Gauntlet && sessionPda) {
                isTriggeringBossRef.current = true;
                const preCombatPlayerStats = {
                  hp: preBossPlayerHp ?? Math.max(state.player.stats.maxHp, 1),
                  maxHp: state.player.stats.maxHp,
                  atk: state.player.stats.atk,
                  arm: state.player.stats.arm,
                  spd: state.player.stats.spd,
                  dig: state.player.stats.dig,
                  gold: finalPlayerGold,
                };
                const preCombatGear = state.player.inventory.map((slot) => slot.item);
                const preCombatTool = state.player.equippedTool;
                const preCombatItemsets = state.player.activeItemsets ?? [];
                const preCombatSeed = state.rngState;
                const navMeta = {
                  campaignLevel,
                  totalMoves,
                  phase,
                  runMode,
                  enemiesDefeated: onChainState?.enemiesDefeated ?? 0,
                };
                const deathMeta = {
                  campaignLevel,
                  totalMoves,
                  week: foughtWeek,
                  phase,
                  runMode,
                  enemiesDefeated: onChainState?.enemiesDefeated ?? 0,
                };

                // Happy path: parse visual event from the skip_to_day tx signature
                (async () => {
                  let visual: GauntletCombatVisualEvent | null = null;
                  if (signature) {
                    try {
                      visual = await parseGauntletCombatVisualEvent(
                        gameplayReadConnection,
                        signature
                      );
                    } catch {
                      // fall through to fallback
                    }
                  }

                  if (visual) {
                    const gauntletCombatParams = createGauntletCombatParams(
                      visual,
                      preCombatPlayerStats,
                      preCombatGear,
                      preCombatTool,
                      preCombatItemsets,
                      preCombatSeed,
                      foughtWeek,
                      finalPlayerGold
                    );
                    navigateToBossCombat(gauntletCombatParams, navMeta);
                    return;
                  }

                  // Fallback: build from on-chain echo data
                  const fallback = await buildFallbackGauntletCombatParams(
                    gameplayReadConnection,
                    sessionPda,
                    foughtWeek,
                    { hp: finalPlayerHp, gold: finalPlayerGold, isDead: !playerWon },
                    preCombatPlayerStats,
                    preCombatGear,
                    preCombatTool,
                    preCombatItemsets,
                    preCombatSeed
                  );
                  if (fallback) {
                    navigateToBossCombat(fallback, navMeta);
                  } else if (!playerWon) {
                    navigateToDeath(navigation, deathMeta, `Week ${foughtWeek} Echo`);
                  }
                })().catch(() => {
                  if (!playerWon) {
                    navigateToDeath(navigation, deathMeta, `Week ${foughtWeek} Echo`);
                  }
                });
              } else if (
                runMode === RunMode.Duel &&
                playerWon &&
                foughtWeek >= 3
              ) {
                // Duel week 3: no boss fight — handle duel completion.
                // Use foughtWeek (from local state) instead of onChainState.completed
                // which may be stale when the POI callback fires.
                handleDuelWeek3Completion();
              } else {
                // Campaign / Duel: boss fight resolved inline
                const foughtBoss: BossId | null =
                  runMode === RunMode.Duel
                    ? state.time.weekBoss ?? null
                    : state.time.weekBoss ?? null;

                if (foughtBoss) {
                  debugLog('[GameScreen] Boss resolved during POI, navigating to CombatScreen:', {
                    playerWon,
                    foughtWeek,
                    foughtBoss,
                    preBossPlayerHp,
                    turnsTaken,
                    finalEnemyHp,
                    signature,
                  });
                  const playerStats = {
                    hp: preBossPlayerHp ?? Math.max(state.player.stats.hp, 1),
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
                    { finalPlayerHp, finalPlayerGold, playerWon },
                    campaignLevel ?? currentLevel ?? undefined
                  );
                  navigateToBossCombat(bossCombatParams, {
                    campaignLevel,
                    totalMoves,
                    phase,
                    runMode,
                    enemiesDefeated: onChainState?.enemiesDefeated ?? 0,
                  });

                }
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
    [dispatch, poiInteraction, state?.activePOI?.poi?.definitionId, state?.player?.equippedTool, playSfx]
  );

  // Weapon swap confirmation: proceed with tool pick and close all modals
  const handleConfirmWeaponSwap = useCallback(() => {
    if (!pendingWeaponSwap) return;
    const { optionIndex } = pendingWeaponSwap;
    setPendingWeaponSwap(null);

    skipMismatchDetectionRef.current = true;
    if (skipMismatchTimeoutRef.current) clearTimeout(skipMismatchTimeoutRef.current);

    const closePoi = () => {
      dispatch({ type: 'CLOSE_POI' });
      skipMismatchTimeoutRef.current = setTimeout(() => {
        skipMismatchDetectionRef.current = false;
      }, 1000);
    };

    if (poiInteraction.deferredPoiType !== null) {
      // Smuggler Hatch (deferred/shop path)
      poiInteraction.confirmPoiSelection(optionIndex).then((result) => {
        if (result.success) {
          closePoi();
        } else if (result.error) {
          closePoi();
          showWallBreakFeedback(result.error);
        }
      });
    } else if (poiInteraction.cacheOfferOptions && poiInteraction.cacheOfferOptions.length > 0) {
      // Tool Crate (pick-item path)
      const selectedItem = poiInteraction.cacheOfferOptions[optionIndex]?.item;
      poiInteraction.selectCacheOffer(optionIndex).then((result) => {
        if (result.success) {
          if (selectedItem && !('currentRarity' in selectedItem)) {
            dispatch({ type: 'EQUIP_TOOL', tool: selectedItem as Tool });
          }
          closePoi();
        } else if (result.error) {
          closePoi();
          showWallBreakFeedback(result.error);
        }
      });
    } else {
      // Guest / local-only path
      playSfx('ui_click');
      dispatch({ type: 'SELECT_POI_OPTION', optionIndex });
    }
  }, [pendingWeaponSwap, poiInteraction, dispatch, showWallBreakFeedback, playSfx]);

  const handleCancelWeaponSwap = useCallback(() => {
    setPendingWeaponSwap(null);
  }, []);

  // Controller A/B for weapon swap confirmation modal
  useControllerAction(
    {
      onA: handleConfirmWeaponSwap,
      onB: handleCancelWeaponSwap,
    },
    isController && !!pendingWeaponSwap
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
        if (item.currentRarity === 'GOLDEN') return;
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
    [state?.phase, state?.activePOI, state?.player?.inventory]
  );

  const activePOI = state?.activePOI;
  const kilnFuseOptionIndex = useMemo(() => {
    if (
      activePOI?.poi.definitionId !== 'L11' ||
      !kilnSelection.gearId ||
      !kilnSelection.rarity ||
      kilnSelection.count < 2
    )
      return null;
    const options = activePOI.options ?? [];
    const index = options.findIndex(
      (opt) =>
        opt.item &&
        'currentRarity' in opt.item &&
        opt.item.id === kilnSelection.gearId &&
        (opt.item as Gear).currentRarity === kilnSelection.rarity
    );
    return index >= 0 ? index : null;
  }, [activePOI, kilnSelection]);

  const scrapOptionIndex = useMemo(() => {
    if (activePOI?.poi.definitionId !== 'L14' || !scrapSelection) return null;
    const options = activePOI.options ?? [];
    return options.findIndex(
      (opt) => opt.item && 'id' in opt.item && opt.item.id === scrapSelection.id
    );
  }, [activePOI, scrapSelection]);

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
      // Rune Kiln: only show gear with 2+ copies (non-Golden), deduplicated
      const gearCounts = new Map<string, { gear: Gear; count: number }>();
      for (const slot of playerInventory) {
        const item = slot.item;
        if (!('currentRarity' in item) || item.currentRarity === 'GOLDEN') continue;
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
  const scaledStyles = useMemo(() => ({
    navbarPadding: { paddingHorizontal: 15 * navScale } as const,
    navbarLeftWidth: { width: 100 * navScale } as const,
    navbarRightWidth: { width: 80 * navScale } as const,
    mapButtonRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2 * navScale },
    mapButton: { width: 36 * navScale, height: 36 * navScale, justifyContent: 'center' as const, alignItems: 'center' as const },
    mapIconSize: { width: 32 * navScale, height: 32 * navScale },
    controllerIcon: { width: 14 * navScale, height: 14 * navScale },
    weekFontSize: { fontSize: 12 * navScale },
    goldGap: { gap: 6 * navScale },
    coinSize: { width: 28 * navScale, height: 28 * navScale },
    goldFontSize: { fontSize: 24 * navScale },
  }), [navScale]);
  const playerTime = state?.time;
  const playerStats = state?.player?.stats;
  const playerInventoryCapacity = state?.player?.inventoryCapacity;
  const playerEquippedTool = state?.player?.equippedTool;
  const playerActiveItemsets = state?.player?.activeItemsets;
  const onChainRunMode = onChainState?.runMode;
  const sharedSidebarProps = useMemo(
    () =>
      playerTime
        ? {
            time: playerTime,
            stats: playerStats!,
            inventory: playerInventory!,
            inventoryCapacity: playerInventoryCapacity!,
            maxGearSlots: runMaxGearSlots,
            isGauntletLayout,
            equippedTool: playerEquippedTool!,
            activeItemsets: playerActiveItemsets!,
            runMode: onChainRunMode,
          }
        : null,
    [
      playerTime,
      playerStats,
      playerInventory,
      playerInventoryCapacity,
      playerEquippedTool,
      playerActiveItemsets,
      runMaxGearSlots,
      isGauntletLayout,
      onChainRunMode,
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

  // Skip to EOW handlers
  const handleSkullPress = useCallback(() => {
    // Don't allow skip if not in exploration phase
    if (!state || state.phase !== GamePhase.Exploration) return;
    // In on-chain mode, also check on-chain guards
    if (mode !== 'guest' && onChainState) {
      if (onChainState.bossFightReady || onChainState.isDead || onChainState.completed) return;
    }
    playSfx('ui_click');
    setShowSkipToEow(true);
  }, [state, mode, onChainState, playSfx]);

  const handleSkipToEowClose = useCallback(() => setShowSkipToEow(false), []);
  const handleOpenTutorialFromPause = useCallback(() => {
    setShowPauseMenu(false);
    setShowTutorial(true);
  }, []);
  const handleCloseTutorial = useCallback(() => setShowTutorial(false), []);
  const handleOpenPauseMenu = useCallback(() => {
    playSfx('ui_click');
    setShowPauseMenu(true);
  }, [playSfx]);
  const handleDuelCompleteOk = useCallback(() => {
    setDuelCompleteVisible(false);
    playBgm('hub');
    navigation.reset({ index: 1, routes: [{ name: 'Hub' }, { name: 'Duels' }] });
  }, [playBgm, navigation]);

  const handleSkipToEowConfirm = useCallback(async () => {
    setIsSkippingToEow(true);
    try {
      if (mode === 'guest') {
        // Guest mode: dispatch TRIGGER_BOSS directly to local reducer
        setShowSkipToEow(false);
        dispatch({ type: 'TRIGGER_BOSS' });
      } else {
        const result = await skipToEndOfWeek();

        if (result.success && result.newState) {
          const ns = result.newState;

          // Duel week 3: no boss fight — on-chain sets completed=true.
          // Trigger the duel finalization flow (waiting-for-opponent / PvP).
          // Keep the skip modal visible during finalization so the player
          // sees "Finalizing..." instead of a frozen game screen.
          if (ns.runMode === RunMode.Duel && ns.completed && !ns.isDead) {
            dispatch({ type: 'SYNC_MOVE', confirmedState: ns });
            await handleDuelWeek3Completion();
            setShowSkipToEow(false);
            return;
          }

          setShowSkipToEow(false);

          // SYNC_MOVE detects bossFightReady=true and sets local phase to Boss.
          // The boss useEffect then fires and calls triggerBoss() to resolve
          // the boss/echo on-chain, same path for all run modes.
          dispatch({ type: 'SYNC_MOVE', confirmedState: ns });
        }
      }
    } catch (err) {
      console.error('[GameScreen] skipToEndOfWeek failed:', err);
    } finally {
      setIsSkippingToEow(false);
    }
  }, [mode, skipToEndOfWeek, dispatch, handleDuelWeek3Completion]);

  const handleReturnToHub = useCallback(() => {
    setShowPauseMenu(false);
    navigation.replace('Hub');
  }, [navigation]);
  const handleDpadCenterPress = useMemo(() => {
    if (isFastTravelActive) {
      return handleFastTravelConfirm;
    }
    if (state && canTriggerCurrentPoiInteraction && state.phase === GamePhase.Exploration) {
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
        tryOpenCurrentPoiInteraction();
      };
    }
    return undefined;
  }, [
    isFastTravelActive,
    handleFastTravelConfirm,
    canTriggerCurrentPoiInteraction,
    poiInteraction.currentPoi,
    tryOpenCurrentPoiInteraction,
    state,
  ]);

  if (!state || !sharedSidebarProps) {
    // No game state yet — show same background as SessionLoadingScreen.
    return <View style={styles.fadeContainer} />;
  }

  return (
    <View style={styles.fadeContainer}>
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <OverviewPanController
        isController={isController}
        overviewActive={overviewMode.active}
        isFastTravelActive={isFastTravelActive}
        panOverview={panOverview}
      />
      <InstantImageBackground
        source={BACKGROUND_IMAGE}
        style={styles.backgroundImage}
        contentFit="cover"
      >
        <View style={styles.darkOverlay}>
          <View style={styles.fullLayout}>
            {/* Top Area */}
            <View style={[styles.topRow, { height: navbarHeight }]}>
              <View style={[styles.navbarArea, scaledStyles.navbarPadding]}>
                <View style={[styles.navbarLeft, scaledStyles.navbarLeftWidth]}>
                  <View style={scaledStyles.mapButtonRow}>
                    <Pressable
                      style={scaledStyles.mapButton}
                      onPress={handleToggleOverview}
                      disabled={isFastTravelActive}
                    >
                      <Image
                        source={MAP_ICON}
                        style={scaledStyles.mapIconSize}
                        contentFit="contain"
                      />
                    </Pressable>
                    {isController && (
                      <Image
                        source={ICON_Y}
                        style={scaledStyles.controllerIcon}
                        contentFit="contain"
                      />
                    )}
                  </View>
                </View>
                <View style={styles.navbarCenter}>
                  <Text style={[styles.weekText, scaledStyles.weekFontSize]}>
                    Week {state.time.week}
                  </Text>
                  <TopBar time={state.time} scale={navScale} onSkullPress={handleSkullPress} />
                </View>
                <View style={[styles.navbarRight, scaledStyles.navbarRightWidth]}>
                  <View style={[styles.goldDisplay, scaledStyles.goldGap]}>
                    <Image
                      source={COIN_ICON}
                      style={scaledStyles.coinSize}
                      contentFit="contain"
                    />
                    <Text style={[styles.goldValue, scaledStyles.goldFontSize]}>
                      {state.player.stats.gold}
                    </Text>
                  </View>
                </View>
              </View>
              {!isCompact && (
                <View style={[styles.bossTopContainer, { flexDirection: 'row', alignItems: 'center' }]}>
                  <View style={{ flex: 1 }}>
                    <Sidebar {...sharedSidebarProps} onlyBoss={true} />
                  </View>
                  {!isController && (
                    <Pressable
                      style={styles.pauseButtonOverlay}
                      onPress={handleOpenPauseMenu}
                    >
                      <CachedImageBackground
                        source={BUTTON_V5}
                        style={styles.pauseButtonBg}
                        contentFit="fill"
                      >
                        <Image source={ENGINE_ICON} style={styles.pauseButtonIcon} contentFit="contain" />
                      </CachedImageBackground>
                    </Pressable>
                  )}
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

                <CombatResultFloater
                  indicators={combatResultIndicators}
                  onComplete={handleCombatResultComplete}
                />

                {isFastTravelActive && (
                  <FastTravelOverlay
                    waypoints={discoveredWaypoints}
                    selectedIndex={fastTravelSelectedIndex}
                    currentPosition={state.player.position}
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
                controllerDisabled={!!pendingWeaponSwap}
              />
            )}
            {showPauseMenu && (
              <PauseMenuModal
                visible={true}
                onClose={handlePauseClose}
                onReturnToHub={handleReturnToHub}
                onAbandonSession={mode !== 'guest' ? handleDebugExitSession : undefined}
                isAbandoning={isExitingSession}
                onOpenTutorial={handleOpenTutorialFromPause}
              />
            )}

            {showSkipToEow && (
              <SkipToEowModal
                visible={true}
                onClose={handleSkipToEowClose}
                onConfirm={handleSkipToEowConfirm}
                isSkipping={isSkippingToEow}
              />
            )}

            {/* intentionally empty — duel completion overlay moved to inline position below */}
          </View>

          {isCompact && isCompactSidebarVisible && !showTutorial && (
            <View
              style={[styles.floatingSidebarWrapper, { top: navbarHeight }]}
              pointerEvents="box-none"
            >
              <CachedImageBackground
                ref={sidebarEnemyRef}
                source={onChainState?.runMode === RunMode.Duel && state.time.week === 3 ? SIDEBAR_WIDE_BG : SIDEBAR_BG}
                style={styles.floatingBossPanel}
                imageStyle={{ height: '100%' }}
                contentFit="fill"
              >
                <Sidebar
                  {...sharedSidebarProps}
                  onlyBoss={true}
                  inlineBoss={true}
                  echoFocusIndex={inventoryFocus === 'enemy' ? focusedSlotIndex : null}
                  onEchoEquipmentLoaded={handleEchoEquipmentLoaded}
                />
              </CachedImageBackground>
              <CachedImageBackground
                ref={sidebarPlayerRef}
                source={SIDEBAR_BG}
                style={styles.floatingSidebarPanel}
                imageStyle={{ height: '100%' }}
                contentFit="fill"
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
              </CachedImageBackground>
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
        {pendingWeaponSwap && (
          <WeaponSwapModal
            toolName={pendingWeaponSwap.toolName}
            equippedToolName={state?.player?.equippedTool?.name ?? 'a weapon'}
            isCompact={isCompact}
            onCancel={handleCancelWeaponSwap}
            onConfirm={handleConfirmWeaponSwap}
          />
        )}
        <TutorialModal visible={showTutorial} onClose={handleCloseTutorial} />
        <DefeatOverlay visible={defeatOverlayVisible} onComplete={handleDefeatOverlayComplete} />
        {duelCompleteVisible && (
          <DuelCompleteOverlay isCompact={isCompact} onOk={handleDuelCompleteOk} />
        )}
        </View>
      </InstantImageBackground>
    </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fadeContainer: { flex: 1, backgroundColor: '#F5F0DD' },
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
  bossTopContainer: { width: SIDEBAR_WIDTH, zIndex: 110 },
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
  sidebarBottomContainer: { width: SIDEBAR_WIDTH, padding: 6, zIndex: 110 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontFamily: Typography.header, fontSize: 20, color: '#666666' },
  dpadOverlay: { position: 'absolute', bottom: 24, left: 24 },
  pauseButtonOverlay: { marginLeft: 3, marginRight: 6 },
  pauseButtonBg: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  pauseButtonIcon: { width: 28, height: 28, marginBottom: 6 },
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

  // Duel week 3 completion modal
  duelCompleteOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200,
  },
  duelCompletePanel: {
    padding: 36,
    maxWidth: 400,
    alignItems: 'center',
  },
  duelCompleteTitle: {
    fontFamily: Typography.header,
    color: '#3d2b1f',
    fontSize: 22,
    textAlign: 'center',
    marginBottom: 12,
  },
  duelCompleteMessage: {
    fontFamily: Typography.body,
    color: '#3d2b1f',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  duelCompleteButton: {
    backgroundColor: '#8B6914',
    paddingHorizontal: 32,
    paddingVertical: 10,
    borderRadius: 8,
  },
  duelCompleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  duelCompletePanelCompact: {
    padding: 48,
    maxWidth: 500,
    transform: [{ scale: 1.45 }],
  },
  duelCompleteTitleCompact: {
    fontSize: 26,
  },
  duelCompleteMessageCompact: {
    fontSize: 16,
    lineHeight: 24,
  },
  duelCompleteButtonCompact: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  duelCompleteButtonTextCompact: {
    color: '#3d2b1f',
  },
});
