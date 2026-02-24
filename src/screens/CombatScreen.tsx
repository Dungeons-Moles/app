/**
 * T058/T128: CombatScreen with combat resolution and navigation
 * Container for combat gameplay with arena, panels, and result display
 * Layout: Enemy (left) - Arena (center) - Player (right)
 * @see specs/001-pve-dungeon-crawler/spec.md User Story 2, FR-048, FR-049
 */

import React, { useEffect, useCallback, useMemo, useRef } from 'react';
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
import { CombatLayout } from '../components/combat';
import { DebugOverlay } from '../components/game';
import { ENEMY_TRAITS, type EnemyId } from '../game/combat/traits';
import { getEntityImageSource } from '../components/game/entityImages';

const defaultMoleImageSource = require('../../assets/entities/characters/default-mole.png');
import { useEquippedSkinImage } from '../hooks/useEquippedSkinImage';
import { getPhaseLabel } from '../utils/phase-labels';
import { createGameplayStateProgram } from '@/services/solana/programs';
import { RunMode } from '@/services/solana/types/gameplay_state';
import {
  buildFinalizeDuelRunTransaction,
  fetchDuelEntry,
  parseDuelEvents,
} from '@/services/solana/duels';
import { sendSessionSignerTransaction } from '@/services/solana/sessionSigner';
import { convertItemInstanceToGear, convertItemInstanceToTool } from '@/services/solana/pitDraft';
import type { BackendCombatLogEntry } from '@/services/solana/types/combat_events';
import type { CombatantState, Gear, Tool } from '@/game/engine/types';
import { calculateItemStats } from '@/game/entities/items';

type CombatScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Combat'>;
  route: RouteProp<RootStackParamList, 'Combat'>;
};

// On-chain base values (ATK/ARM/SPD start at 0; bonuses come from BattleStart log entries)
const DUEL_BASE_HP = 20;
const DUEL_BASE_ATK = 0;
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
    atk: DUEL_BASE_ATK,
    arm: DUEL_BASE_ARM,
    spd: DUEL_BASE_SPD,
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
  const playerSkinSource = useEquippedSkinImage(profile?.equippedSkin);
  const { wallet, signAndSendTransaction } = useWallet();
  const { connection } = useSolanaConnection();
  const { endSessionWithSessionSigner, undelegateCurrentSession, queueEndGame, stopAutoCommit, hasActiveSession, session, mapSeed, gameplayState, getSessionSignerKeypair } =
    useSession();
  const isResolvingDuelRef = useRef(false);
  const {
    state: combatState,
    startCombat,
    startCombatWithLog,
    startCombatWithOnchainOutcome,
    displayStates,
    getResult,
  } = useCombat();

  // Get combat input from route params (on-chain mode) or null (guest mode)
  const combatInput = route?.params?.combatInput;
  const isBossFight = combatInput?.isBossFight ?? gameState?.phase === GamePhase.BossFight;
  const currentWeek = combatInput?.week ?? gameState?.time.week ?? 1;

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
        const onChainResult = combatInput.onChainOutcome
          ? combatInput.onChainOutcome.playerWon
            ? ('VICTORY' as const)
            : ('DEFEAT' as const)
          : undefined;
        startCombatWithLog(resolverInput, combatInput.combatLog, onChainResult);
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
        enemyId: gameState.combat.enemyDefinitionId as EnemyId,
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
        if (combatInput.historyReplay) {
          navigation.goBack();
        } else {
          navigation.replace('Hub');
        }
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

      // Undelegate session from ER before sending finalize_duel_run to base chain.
      // Without this, game_state is still owned by the delegation program and the
      // base chain instruction fails with AccountOwnedByWrongProgram.
      const undelegateResult = await undelegateCurrentSession();
      if (!undelegateResult.success) {
        console.warn('[CombatScreen] Failed to undelegate before duel finalization:', undelegateResult.error);
        return;
      }

      const duelProgram = createGameplayStateProgram(connection);

      const ourKey = wallet.publicKey.toBase58();
      const duelEntry = await fetchDuelEntry(duelProgram, gameplayState.session);
      if (!duelEntry || duelEntry.player.toBase58() !== ourKey) return;

      const [gameStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('game_state'), gameplayState.session.toBuffer()],
        duelProgram.programId
      );

      const sessionSignerKeypair = getSessionSignerKeypair();
      if (!sessionSignerKeypair) return;

      const tx = await buildFinalizeDuelRunTransaction(
        connection,
        duelProgram,
        wallet.publicKey,
        sessionSignerKeypair.publicKey,
        gameStatePda,
        gameplayState.session,
        duelEntry.matchedCreatorPlayer
      );

      const signature = await sendSessionSignerTransaction(connection, tx, sessionSignerKeypair);
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
        const isDuelRun = gameplayState?.runMode === RunMode.Duel;
        if (isDuelRun) {
          try {
            await tryFinalizeDuelAndBuildReplay();
          } catch (duelFinalizeError) {
            console.warn('[CombatScreen] Duel finalization skipped/failed:', duelFinalizeError);
          }
        }

        if (isVictory) {
          // Victory: end session in background (state changes are fine since
          // we navigate to VictoryScreen/Hub which handle them naturally).
          console.log('[CombatScreen] Ending session in background (victory)');
          void (async () => {
            const endResult = await endSessionWithSessionSigner();
            if (!endResult.success) {
              console.warn('[CombatScreen] Failed to end session:', endResult.error);
              try {
                await queueEndGame(levelReached, isVictory);
                console.log('[CombatScreen] Immediate end failed; deferred cleanup queued');
              } catch (queueError) {
                console.error(
                  '[CombatScreen] Failed to queue deferred cleanup after end failure:',
                  queueError
                );
              }
            }
          })();
        } else {
          // Defeat: queue deferred cleanup instead of ending session immediately.
          // endSessionWithSessionSigner modifies React state across multiple context
          // providers, which causes cascading re-renders that visibly blink the
          // DeathScreen on web. The queued cleanup runs via processPendingCleanups
          // when the user returns to HubScreen or CampaignSelectScreen.
          console.log('[CombatScreen] Queueing deferred session cleanup (defeat)');
          void queueEndGame(levelReached, false).catch((err) => {
            console.error('[CombatScreen] Failed to queue deferred cleanup:', err);
          });
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
        // Use reset to remove GameScreen from the stack. On web, hidden
        // screens behind the current one still live in the DOM; when session
        // state changes trigger re-renders in GameScreen, the layout churn
        // causes visible flickering on the DeathScreen.
        navigation.reset({
          index: 0,
          routes: [{
            name: 'Death',
            params: {
              totalMoves: resolvedTotalMoves,
              level: levelReached,
              week: currentWeek,
              phase: getPhaseLabel(combatInput?.phase ?? localPhaseNumber),
              combatTurns: combatState.resolvedCombat?.turn ?? 0,
              killedBy: combatState.resolvedCombat?.enemy.name,
            },
          }],
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
    endSessionWithSessionSigner,
    undelegateCurrentSession,
    queueEndGame,
    combatState.resolvedCombat,
    wallet.publicKey,
    session,
    gameplayState,
    mapSeed,
    connection,
    signAndSendTransaction,
    getSessionSignerKeypair,
  ]);

  // Look up enemy trait from the combat state's enemy definition ID
  const enemyTrait = useMemo(() => {
    const enemyId = combatState.combat?.enemyDefinitionId;
    if (!enemyId) return undefined;
    const trait = ENEMY_TRAITS[enemyId as EnemyId];
    return trait ? { name: trait.name, description: trait.description } : undefined;
  }, [combatState.combat?.enemyDefinitionId]);

  // Extract player equipment for display
  const playerEquipment = useMemo(() => {
    if (gameState?.player) {
      return {
        tool: gameState.player.equippedTool,
        gear: gameState.player.inventory.map((slot) => slot.item),
      };
    }
    // Fallback to combatInput for replay mode
    if (combatInput) {
      return {
        tool: combatInput.playerTool ?? null,
        gear: combatInput.playerGear ?? [],
      };
    }
    return { tool: null, gear: [] };
  }, [gameState?.player, combatInput]);

  // Get display states for gold fallback
  const { playerGold, enemyGold } = displayStates;

  return (
    <CombatLayout
      playerSkinSource={playerSkinSource}
      enemyPanel={{
        name: combatState.combat?.enemy.name ?? 'Enemy',
        emoji: combatState.combat?.enemy.emoji ?? '',
        imageSource:
          (combatState.combat?.enemyDefinitionId as string) === 'pvpOpponent'
            ? defaultMoleImageSource
            : combatState.combat?.enemyDefinitionId
              ? getEntityImageSource(combatState.combat.enemyDefinitionId)
              : undefined,
        dig: 0,
        gold: enemyGold ?? combatInput?.enemyGold,
        trait: enemyTrait,
        equippedTool: combatInput?.enemyTool,
        equippedGear: combatInput?.enemyGear ?? [],
      }}
      playerPanel={{
        name: combatState.combat?.player.name ?? 'Player',
        emoji: combatState.combat?.player.emoji ?? '',
        imageSource: playerSkinSource,
        dig: gameState?.player.stats.dig ?? 0,
        gold: playerGold ?? combatInput?.playerGold ?? gameState?.player.stats.gold,
        equippedTool: playerEquipment.tool,
        equippedGear: playerEquipment.gear,
      }}
      goldReward={combatState.resolvedCombat?.goldReward}
      isFinalVictory={isBossFight && currentWeek === 3}
      onCombatComplete={handleCombatComplete}
      arenaChildren={
        gameState ? (
          <DebugOverlay
            debug={gameState.debug}
            seed={gameState.seed}
            phase={gameState.phase}
            time={gameState.time}
          />
        ) : undefined
      }
    />
  );
}
