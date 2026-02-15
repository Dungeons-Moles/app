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
import { PublicKey } from '@solana/web3.js';
import { RootStackParamList } from '../navigation';
import { useGame, GamePhase } from '../contexts/GameContext';
import { CombatProvider, useCombat } from '../contexts/CombatContext';
import { useProfile } from '../contexts/ProfileContext';
import { useSession } from '../contexts/SessionContext';
import { useWallet } from '../contexts/WalletContext';
import { useSolanaConnection } from '../contexts/SolanaConnectionContext';
import { useLandscapeLock } from '../hooks/useOrientationLock';
import { useScreenVariant } from '../contexts/ScreenVariantContext';
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
import { getPhaseLabel } from '../utils/phase-labels';
import { createGameplayStateProgram } from '@/services/solana/programs';
import {
  buildFinalizeDuelRunTransaction,
  fetchDuelEntry,
  parseDuelEvents,
} from '@/services/solana/duels';
import { convertItemInstanceToGear, convertItemInstanceToTool } from '@/services/solana/pitDraft';
import type { BackendCombatLogEntry } from '@/services/solana/types/combat_events';
import type { CombatantState, Gear, Tool } from '@/game/engine/types';
import { calculateItemStats } from '@/game/entities/items';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');

type CombatScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Combat'>;
  route: RouteProp<RootStackParamList, 'Combat'>;
};

const SAFE_AREA_EDGES = ['left', 'right'] as const;
const DUEL_BASE_HP = 10;
const DUEL_BASE_ATK = 1;
const DUEL_BASE_ARM = 0;
const DUEL_BASE_SPD = 0;
const DUEL_BASE_DIG = 0;

function buildDuelCombatant(
  name: string,
  isPlayer: boolean,
  definitionId: string,
  tool: Tool | null,
  gear: Gear[]
): CombatantState {
  const itemStats = calculateItemStats(tool, gear);
  const maxHp = DUEL_BASE_HP + (itemStats.hp ?? 0);

  return {
    name,
    emoji: '',
    definitionId,
    isPlayer,
    maxHp,
    hp: maxHp,
    atk: DUEL_BASE_ATK + (itemStats.atk ?? 0),
    arm: DUEL_BASE_ARM + (itemStats.arm ?? 0),
    spd: DUEL_BASE_SPD + (itemStats.spd ?? 0),
    dig: DUEL_BASE_DIG + (itemStats.dig ?? 0),
    bonusAtk: 0,
    bonusArm: 0,
    bonusSpd: 0,
    statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
    strikesPerTurn: 1,
    ignoresArmor: false,
  };
}

/**
 * CombatScreen - Container for combat gameplay
 * Displays the combat arena, player/enemy panels, and combat log in landscape orientation
 */
export function CombatScreen({ navigation, route }: CombatScreenProps) {
  const { defaultCombatSpeed, updateDefaultCombatSpeed } = useProfile();

  return (
    <CombatProvider initialSpeed={defaultCombatSpeed} onSpeedChange={updateDefaultCombatSpeed}>
      <CombatScreenContent navigation={navigation} route={route} />
    </CombatProvider>
  );
}

function CombatScreenContent({ navigation, route }: CombatScreenProps) {
  const { state: gameState, dispatch: gameDispatch } = useGame();
  const { profile, mode } = useProfile();
  const { wallet, signAndSendTransaction } = useWallet();
  const { connection } = useSolanaConnection();
  const { endSessionWithBurner, stopAutoCommit, hasActiveSession, session, mapSeed, gameplayState } =
    useSession();
  const isResolvingDuelRef = useRef(false);
  const {
    state: combatState,
    speed,
    setSpeed,
    startCombat,
    startCombatWithLog,
    startCombatWithOnchainOutcome,
    getDisplayStates,
    getResult,
  } = useCombat();
  const variant = useScreenVariant();
  const isCompact = variant === 'compact';
  const scale = isCompact ? 2 : 1;
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
        enemyGold: combatInput.enemyGold,
        preserveArmor: combatInput.preserveArmor,
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
      } else if (combatInput.onChainOutcome) {
        // Authoritative fallback: avoid local simulation drift when log parsing is delayed/missing.
        console.log('[CombatScreen] Starting combat with on-chain outcome fallback:', {
          playerHp: combatInput.player.hp,
          enemyName: combatInput.enemy.name,
          finalPlayerHp: combatInput.onChainOutcome.finalPlayerHp,
          playerWon: combatInput.onChainOutcome.playerWon,
        });
        startCombatWithOnchainOutcome(resolverInput, {
          finalPlayerHp: combatInput.onChainOutcome.finalPlayerHp,
          playerWon: combatInput.onChainOutcome.playerWon,
        });
      } else {
        // Last-resort fallback for legacy callers that don't pass on-chain outcome.
        console.log('[CombatScreen] Starting combat (on-chain mode, legacy local fallback):', {
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
    startCombatWithOnchainOutcome,
    gameState?.rngState,
  ]);

  // Handle combat completion - now uses deferred cleanup for instant navigation
  const handleCombatComplete = useCallback(async () => {
    if (isResolvingDuelRef.current) return;
    isResolvingDuelRef.current = true;

    try {
      const localResult = getResult();
      if (!localResult) return;

      if (combatInput?.duelReplay) {
        navigation.replace('Hub');
        return;
      }

    // On-chain outcome is authoritative — override local result if they disagree.
    // This prevents getting stuck when the local resolver shows VICTORY but the
    // player actually died on-chain (or vice-versa).
    const onChainOutcome = combatInput?.onChainOutcome;
    const result: 'VICTORY' | 'DEFEAT' = onChainOutcome
      ? onChainOutcome.playerWon
        ? 'VICTORY'
        : 'DEFEAT'
      : localResult;

    if (onChainOutcome && result !== localResult) {
      console.warn('[CombatScreen] On-chain outcome overrides local result:', {
        localResult,
        onChainResult: result,
        onChainPlayerWon: onChainOutcome.playerWon,
      });
    }

    const isVictory = result === 'VICTORY';
    const levelReached = combatInput?.campaignLevel ?? profile?.currentLevel ?? 1;
    const isFinalWeekBoss = isBossFight && currentWeek === 3;
    const isOnChainMode = mode !== 'guest' && combatInput !== undefined;

    console.log('[CombatScreen] Combat complete:', {
      result,
      localResult,
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

      let duelReplayCombatInput: NonNullable<RootStackParamList['Combat']>['combatInput'] | undefined;

    const tryFinalizeDuelAndBuildReplay = async () => {
      if (!wallet.publicKey || !session || !gameplayState || mapSeed === null) return;

      const duelProgram = createGameplayStateProgram(connection);

      const ourKey = wallet.publicKey.toBase58();
      const duelEntry = await fetchDuelEntry(duelProgram, gameplayState.session);
      if (!duelEntry || duelEntry.player.toBase58() !== ourKey) return;

      const [gameStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('game_state'), gameplayState.session.toBuffer()],
        duelProgram.programId
      );

      const tx = await buildFinalizeDuelRunTransaction(
        connection,
        duelProgram,
        wallet.publicKey,
        gameStatePda,
        gameplayState.session,
        mapSeed,
        duelEntry.matchedCreatorPlayer
      );

      const signature = await signAndSendTransaction(tx);
      await connection.confirmTransaction(signature, 'confirmed');

      const events = await parseDuelEvents(
        connection,
        duelProgram,
        signature
      );

      if (!events.combatVisual || !events.resolved || events.resolved.resolution !== 'completedCombat') {
        return;
      }

      const visual = events.combatVisual;
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

      const player = buildDuelCombatant('You', true, 'player', playerTool, playerGear);
      const enemy = buildDuelCombatant('Opponent', false, 'pvpOpponent', enemyTool, enemyGear);

      const combatLog: BackendCombatLogEntry[] = visual.combatLog.map((entry) => ({
        ...entry,
        isPlayer: isPlayerA ? entry.isPlayer : !entry.isPlayer,
      }));
      const isWinner = events.resolved.winner?.toBase58() === ourKey;

      duelReplayCombatInput = {
        player,
        enemy,
        seed: 0,
        combatLog,
        onChainOutcome: {
          finalPlayerHp: isPlayerA ? visual.finalPlayerAHp : visual.finalPlayerBHp,
          finalPlayerGold: 0,
          playerWon: isWinner,
        },
        duelReplay: true,
        preserveArmor: true,
      };
    };

      if (shouldEndSession && hasActiveSession && mode !== 'guest') {
        try {
          await tryFinalizeDuelAndBuildReplay();
        } catch (duelFinalizeError) {
          console.warn('[CombatScreen] Duel finalization skipped/failed:', duelFinalizeError);
        }

        console.log('[CombatScreen] Ending session (shouldEndSession:', shouldEndSession, ')');
        const endResult = await endSessionWithBurner();
        if (!endResult.success) {
          console.warn('[CombatScreen] Failed to end session:', endResult.error);
        }
      }

      if (duelReplayCombatInput) {
        navigation.replace('Combat', { combatInput: duelReplayCombatInput });
        return;
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
      const resolvedTotalMoves = combatInput?.totalMoves ?? gameState?.totalMoves ?? 0;
      // Convert local TimePhase (DAY/NIGHT) + cycle to on-chain phase number
      const localPhaseNumber = gameState?.time
        ? (gameState.time.cycle - 1) * 2 + (gameState.time.phase === 'NIGHT' ? 1 : 0)
        : 0;
      if (result === 'DEFEAT') {
        console.log('[CombatScreen] Navigating to DeathScreen (defeat)');
        navigation.replace('Death', {
          totalMoves: resolvedTotalMoves,
          level: levelReached,
          week: currentWeek,
          phase: getPhaseLabel(combatInput?.phase ?? localPhaseNumber),
          combatTurns: combatState.resolvedCombat?.turn ?? 0,
          killedBy: combatState.resolvedCombat?.enemy.name,
        });
      } else if (isFinalWeekBoss) {
        console.log('[CombatScreen] Navigating to Victory screen (final week boss victory)');
        navigation.replace('Victory', {
          level: levelReached,
          totalMoves: resolvedTotalMoves,
        });
      } else {
        console.log('[CombatScreen] Navigating back to map (victory)');
        navigation.goBack();
      }
    } finally {
      isResolvingDuelRef.current = false;
    }
  }, [
    getResult,
    gameDispatch,
    navigation,
    isBossFight,
    currentWeek,
    profile,
    mode,
    combatInput,
    stopAutoCommit,
    hasActiveSession,
    endSessionWithBurner,
    combatState.resolvedCombat,
    wallet.publicKey,
    session,
    gameplayState,
    mapSeed,
    connection,
    signAndSendTransaction,
  ]);

  const { player, enemy, playerGold, enemyGold } = getDisplayStates();
  const result = getResult();
  const speedControlsDisabled = !combatState.resolvedCombat || combatState.isComplete;
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
  const playerMaxArm = player
    ? Math.max(basePlayerArm, playerPeakArmRef.current, player.arm)
    : 0;
  const enemyMaxArm = enemy
    ? Math.max(baseEnemyArm, enemyPeakArmRef.current, enemy.arm)
    : 0;

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

  const currentTurn = useMemo(() => {
    const entry = combatState.resolvedCombat?.log[combatState.currentLogIndex];
    return Math.max(1, entry?.turn ?? 1);
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
              <Text style={[styles.loadingText, { fontSize: 20 * scale }]}>
                Preparing combat...
              </Text>
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
              gold={enemyGold ?? combatInput?.enemyGold}
              statusEffects={enemy.statusEffects}
              trait={enemyTrait}
              scale={scale}
            />

            {/* Combat Arena (CENTER) */}
            <View style={[styles.arenaArea, { padding: 16 * scale }]}>
              <CombatArena
                player={player}
                enemy={enemy}
                damageNumbers={combatState.damageNumbers}
                effectNotifications={combatState.effectNotifications}
                isAnimating={combatState.isAnimating}
                currentTurn={currentTurn}
                activeActor={activeActor}
                playerMaxArm={playerMaxArm}
                enemyMaxArm={enemyMaxArm}
                scale={scale}
              />

              <View style={[styles.controlsArea, { marginTop: 12 * scale }]}>
                <SpeedControls
                  currentSpeed={speed}
                  onSpeedChange={setSpeed}
                  disabled={speedControlsDisabled}
                  scale={scale}
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
              gold={playerGold ?? combatInput?.playerGold ?? gameState?.player.stats.gold}
              statusEffects={player.statusEffects}
              equippedTool={playerEquipment.tool}
              equippedGear={playerEquipment.gear}
              scale={scale}
            />
          </View>

          {/* Victory/Defeat Overlay - T075: Pass goldReward for display */}
          {combatState.isComplete && result && (
            <VictoryDefeatDisplay
              result={result}
              goldReward={result === 'VICTORY' ? combatState.resolvedCombat?.goldReward : undefined}
              isFinalVictory={result === 'VICTORY' && isBossFight && currentWeek === 3}
              onComplete={handleCombatComplete}
              scale={scale}
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
    color: '#333',
  },
  arenaArea: {
    flex: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlsArea: {},
});
