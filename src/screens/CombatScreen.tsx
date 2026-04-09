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
import { RootStackParamList, type UnlockedItem } from '../navigation';
import { useGame, GamePhase } from '../contexts/GameContext';
import { CombatProvider, useCombat } from '../contexts/CombatContext';
import { useAudio, type BgmTrack } from '../contexts/AudioContext';
import { useSettings } from '../contexts/SettingsContext';
import { useProfile } from '../contexts/ProfileContext';
import { useSession } from '../contexts/SessionContext';
import { useWallet } from '../contexts/WalletContext';
import { useSolanaConnection } from '../contexts/SolanaConnectionContext';
import { useLandscapeLock } from '../hooks/useOrientationLock';
import { usePreventBackNavigation } from '../hooks/usePreventBackNavigation';
import { useKeepAwake } from 'expo-keep-awake';
import { CombatLayout } from '../components/combat';
import { DebugOverlay } from '../components/game';
import { ENEMY_TRAITS, type EnemyId } from '../game/combat/traits';
import { BOSSES } from '../data/bosses';
import type { BossId } from '../game/engine/types';
import { getEntityImageSource } from '../components/game/entityImages';
import { useEquippedSkinImage, getEquippedSkinCombatScale } from '../hooks/useEquippedSkinImage';
import { getPhaseLabel } from '../utils/phase-labels';
import { parseGameplayEvents, extractVictoryData } from '@/services/solana/eventParser';
import { createGameplayStateProgram, createPlayerProfileProgram } from '@/services/solana/programs';
import { RunMode } from '@/services/solana/types/gameplay_state';
import {
  buildSettleDuelPayoutTransaction,
  fetchDuelEntryForSettlement,
  parseDuelEvents,
} from '@/services/solana/duels';
import { sendSessionSignerTransaction } from '@/services/solana/sessionSigner';
import { convertItemInstanceToGear, convertItemInstanceToTool } from '@/services/solana/pitDraft';
import type { CombatantState, Gear, Tool } from '@/game/engine/types';
import { calculateCombatBakedItemStats } from '@/game/entities/items';

type CombatScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Combat'>;
  route: RouteProp<RootStackParamList, 'Combat'>;
};

const DUEL_BASE_HP = 20;
const DUEL_BASE_DIG = 0;

function buildDuelCombatant(
  name: string,
  isPlayer: boolean,
  definitionId: string,
  tool: Tool | null,
  gear: Gear[]
): CombatantState {
  const itemStats = calculateCombatBakedItemStats(tool, gear);
  const maxHp = DUEL_BASE_HP + (itemStats.hp ?? 0);

  return {
    name,
    emoji: '',
    definitionId,
    isPlayer,
    maxHp,
    hp: maxHp,
    atk: itemStats.atk ?? 0,
    arm: itemStats.arm ?? 0,
    spd: itemStats.spd ?? 0,
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
  usePreventBackNavigation();

  return (
    <CombatProvider initialSpeed={defaultCombatSpeed} onSpeedChange={updateDefaultCombatSpeed}>
      <CombatScreenContent navigation={navigation} route={route} />
    </CombatProvider>
  );
}

function CombatScreenContent({ navigation, route }: CombatScreenProps) {
  const { state: gameState, dispatch: gameDispatch } = useGame();
  const { profile, mode, refresh: refreshProfile } = useProfile();
  const playerSkinSource = useEquippedSkinImage(profile?.equippedSkin);
  const playerCombatScale = getEquippedSkinCombatScale(profile?.equippedSkin);
  const { wallet, signAndSendTransaction } = useWallet();
  const { connection } = useSolanaConnection();
  const { playBgm } = useAudio();
  const { autoResolveCombat } = useSettings();
  const {
    endSessionWithSessionSigner,
    undelegateCurrentSession,
    queueEndGame,
    stopAutoCommit,
    hasActiveSession,
    session,
    gameplayState,
    getSessionSignerKeypair,
  } = useSession();
  const isResolvingDuelRef = useRef(false);
  // Session teardown promise started eagerly during combat animation.
  // By the time the countdown finishes, the teardown is usually already done.
  const sessionEndPromiseRef = useRef<Promise<import('../types/solana').TransactionResult> | null>(
    null
  );
  const {
    state: combatState,
    startCombat,
    startCombatWithOnchainOutcome,
    displayStates,
    getResult,
  } = useCombat();

  // Get combat input from route params (on-chain mode) or null (guest mode)
  const combatInput = route?.params?.combatInput;
  const pvpOpponentSkinPubkey = useMemo(() => {
    const skinKey = combatInput?.pvpOpponentSkinPubkey;
    if (!skinKey) return null;
    try {
      return new PublicKey(skinKey);
    } catch {
      return null;
    }
  }, [combatInput?.pvpOpponentSkinPubkey]);
  const pvpOpponentSkinSource = useEquippedSkinImage(pvpOpponentSkinPubkey);
  const isBossFight = combatInput?.isBossFight ?? gameState?.phase === GamePhase.BossFight;
  const currentWeek = combatInput?.week ?? gameState?.time.week ?? 1;

  // Lock to landscape orientation (FR-044)
  useLandscapeLock();
  useKeepAwake();

  // Start combat when screen loads
  useEffect(() => {
    // Play combat music immediately, unless auto-resolve is on for a non-boss fight
    // (field enemy combat is resolved without showing CombatScreen in normal flow,
    // so combat music should not play when the setting is enabled).
    const finalWeek = (combatInput?.runMode ?? gameplayState?.runMode) === RunMode.Gauntlet ? 5 : 3;
    const track: BgmTrack = isBossFight
      ? currentWeek === finalWeek
        ? 'boss_week_3'
        : 'boss_week_1_2'
      : 'standard_combat';
    if (!autoResolveCombat || isBossFight) {
      playBgm(track, { crossfade: true, resume: false });
    }

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
        enemyGear: combatInput.enemyGear,
        enemyTool: combatInput.enemyTool,
        playerGold: combatInput.playerGold,
        enemyGold: combatInput.enemyGold,
        enemyActiveItemSets: combatInput.enemyActiveItemSets,
        preserveArmor: combatInput.preserveArmor,
        pvpTieBreakerFavorPlayer: combatInput.pvpTieBreakerFavorPlayer,
        pvpPlayerActsFirstOnTie: combatInput.pvpPlayerActsFirstOnTie,
      };

      // Temporary safety switch: on-chain combat currently uses the same parity resolver
      // path as guest/simulator for visualization, while preserving the authoritative
      // on-chain outcome when it is available.
      if (combatInput.onChainOutcome) {
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
    startCombatWithOnchainOutcome,
    gameState?.rngState,
    isBossFight,
    playBgm,
    autoResolveCombat,
  ]);

  // Eagerly start session teardown during combat animation.
  // The animation takes several seconds — plenty of time for undelegate + settle + end.
  // The promise is awaited in handleCombatComplete so navigation doesn't block.
  // Skip for duels — they have a special finalize flow that must run before teardown.
  useEffect(() => {
    if (sessionEndPromiseRef.current) return; // already started
    if (mode === 'guest' || !hasActiveSession) return;
    if (!combatInput?.onChainOutcome) return;
    if (combatInput.duelReplay || gameplayState?.runMode === RunMode.Duel) return;

    const maxWeeks = (combatInput?.runMode ?? gameplayState?.runMode) === RunMode.Gauntlet ? 5 : 3;
    const isFinal = isBossFight && currentWeek === maxWeeks;
    const willDie = !combatInput.onChainOutcome.playerWon;

    // Start teardown for: final boss (win or lose) or any defeat
    if (isFinal || willDie) {
      console.log('[CombatScreen] Starting eager session teardown during animation');
      sessionEndPromiseRef.current = endSessionWithSessionSigner();
    }
  }, [
    mode,
    hasActiveSession,
    combatInput,
    isBossFight,
    currentWeek,
    endSessionWithSessionSigner,
    gameplayState?.runMode,
  ]);

  // Handle combat completion - now uses deferred cleanup for instant navigation
  const handleCombatComplete = useCallback(async () => {
    if (isResolvingDuelRef.current) return;
    isResolvingDuelRef.current = true;

    try {
      const localResult = getResult();
      if (!localResult) return;

      if (combatInput?.simulatorMode) {
        navigation.goBack();
        return;
      }

      if (combatInput?.duelReplay) {
        playBgm('hub', { crossfade: true, resume: false });
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
      // Gauntlet has 5 weeks, Campaign/Duel have 3.
      const maxWeeks =
        (combatInput?.runMode ?? gameplayState?.runMode) === RunMode.Gauntlet ? 5 : 3;
      const isFinalWeekBoss = isBossFight && currentWeek === maxWeeks;
      const isOnChainMode = mode !== 'guest' && combatInput !== undefined;
      // Prefer runMode from combatInput (preserved at navigation time) over
      // gameplayState which may be cleared by session teardown.
      const capturedRunMode = combatInput?.runMode ?? gameplayState?.runMode;

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

      let duelReplayCombatInput:
        | NonNullable<RootStackParamList['Combat']>['combatInput']
        | undefined;

      const tryFinalizeDuelAndBuildReplay = async () => {
        if (!wallet.publicKey || !session || !gameplayState) return;

        // Undelegate session from ER before sending finalize_duel_run to base chain.
        // Without this, game_state is still owned by the delegation program and the
        // base chain instruction fails with AccountOwnedByWrongProgram.
        const undelegateResult = await undelegateCurrentSession();
        if (!undelegateResult.success) {
          console.warn(
            '[CombatScreen] Failed to undelegate before duel finalization:',
            undelegateResult.error
          );
          return;
        }

        const duelProgram = createGameplayStateProgram(connection);

        const ourKey = wallet.publicKey.toBase58();
        const duelEntry = await fetchDuelEntryForSettlement(duelProgram, gameplayState.session);
        if (!duelEntry || duelEntry.player.toBase58() !== ourKey) return;
        const wasMatched = !!duelEntry.matchedCreatorPlayer;

        const [gameStatePda] = PublicKey.findProgramAddressSync(
          [Buffer.from('game_state'), gameplayState.session.toBuffer()],
          duelProgram.programId
        );

        const sessionSignerKeypair = getSessionSignerKeypair();
        if (!sessionSignerKeypair) return;

        const tx = await buildSettleDuelPayoutTransaction(
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

        const events = await parseDuelEvents(connection, duelProgram, signature);

        if (!events.resolved) {
          if (wasMatched) {
            throw new Error('Matched duel settlement missing DuelResolved event');
          }
          return;
        }

        if (events.resolved.resolution === 'opponentEliminated') {
          return;
        }

        if (events.resolved.resolution !== 'completedCombat') {
          if (wasMatched) {
            throw new Error(`Unexpected matched duel resolution: ${events.resolved.resolution}`);
          }
          return;
        }

        if (!events.combatVisual) {
          throw new Error('Completed duel settlement missing DuelCombatVisual event');
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

        const isWinner = events.resolved.winner?.toBase58() === ourKey;

        duelReplayCombatInput = {
          player,
          enemy,
          seed: Number(visual.seed % BigInt(2 ** 32)),
          pvpPlayerActsFirstOnTie: !isPlayerA,
          pvpTieBreakerFavorPlayer: isPlayerA === (Number(visual.seed % BigInt(2)) === 0),
          onChainOutcome: {
            finalPlayerHp: isPlayerA ? visual.finalPlayerAHp : visual.finalPlayerBHp,
            finalPlayerGold: 0,
            playerWon: isWinner,
          },
          duelReplay: true,
          preserveArmor: true,
        };
      };

      let settleSignature: string | undefined;

      // If the eager teardown already completed, hasActiveSession may be false.
      // Retrieve the settle signature from the eager promise before checking hasActiveSession.
      const eagerPromise = sessionEndPromiseRef.current;

      if (shouldEndSession && hasActiveSession && mode !== 'guest') {
        const isDuelRun = gameplayState?.runMode === RunMode.Duel;
        // Only try duel finalization if settlement hasn't already happened
        // (onChainOutcome is set when GameScreen's handleDuelWeek3Completion already settled).
        if (isDuelRun && !combatInput?.onChainOutcome) {
          try {
            await tryFinalizeDuelAndBuildReplay();
          } catch (duelFinalizeError) {
            console.warn('[CombatScreen] Duel finalization skipped/failed:', duelFinalizeError);
          }
        }

        // Await the eagerly-started teardown (or start one now if the eager effect didn't fire).
        const endPromise = eagerPromise ?? endSessionWithSessionSigner();
        const endResult = await endPromise;

        if (endResult.success) {
          settleSignature = endResult.settleSignature ?? endResult.signature;
          await refreshProfile().catch((err) => {
            console.warn('[CombatScreen] Profile refresh after session end failed:', err);
          });
        } else {
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
      } else if (shouldEndSession && eagerPromise && mode !== 'guest') {
        // Eager teardown already completed (hasActiveSession is now false).
        // Await the result to get the settleSignature for item unlock parsing.
        const endResult = await eagerPromise;
        if (endResult.success) {
          settleSignature = endResult.settleSignature ?? endResult.signature;
        }
      }

      if (duelReplayCombatInput) {
        navigation.replace('Combat', { combatInput: duelReplayCombatInput });
        return;
      }

      // Note: Run result recording is now handled via CPI in end_session
      // No need to call recordRunResult separately - it's done on-chain

      // Temporary parity mode: on-chain combat visuals are resolved through the same
      // frontend resolver path as guest/simulator, so the local exploration state must
      // follow that same resolved combat state when returning to the map.
      console.log('[CombatScreen] Dispatching RESOLVE_COMBAT with resolved state:', {
        isOnChainMode,
        result,
        playerFinalHp: combatState.resolvedCombat?.player.hp,
      });
      gameDispatch({
        type: 'RESOLVE_COMBAT',
        result,
        combat: combatState.resolvedCombat ?? undefined,
      });

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
          routes: [
            {
              name: 'Death',
              params: {
                totalMoves: resolvedTotalMoves,
                level: levelReached,
                week: currentWeek,
                phase: getPhaseLabel(combatInput?.phase ?? localPhaseNumber),
                killedBy: combatState.resolvedCombat?.enemy.name,
                runMode: capturedRunMode,
                enemiesDefeated: combatInput?.enemiesDefeated ?? (gameState?.enemiesDefeated ?? 0),
              },
            },
          ],
        });
      } else if (isFinalWeekBoss) {
        console.log('[CombatScreen] Navigating to Victory screen (final week boss victory)');

        // Parse the actual unlocked item from the on-chain settle transaction.
        // The static getUnlockedItemForLevel() uses all-items.ts IDs which don't match
        // on-chain pool indices (different set ordering), so we only trust on-chain events.
        let itemUnlocked: UnlockedItem | undefined;
        if (settleSignature && mode !== 'guest') {
          try {
            console.log(
              '[CombatScreen] Parsing item unlock from settle signature:',
              settleSignature
            );
            const profileProgram = createPlayerProfileProgram(connection);
            const events = await parseGameplayEvents(connection, profileProgram, settleSignature);
            const victoryData = extractVictoryData(events);
            console.log('[CombatScreen] Victory data from settle events:', {
              hasItemUnlocked: !!victoryData.itemUnlocked,
              itemName: victoryData.itemUnlocked?.name,
              levelUnlocked: victoryData.levelUnlocked,
            });
            if (victoryData.itemUnlocked) {
              itemUnlocked = victoryData.itemUnlocked;
            }
          } catch (parseErr) {
            console.warn('[CombatScreen] Failed to parse item unlock event:', parseErr);
          }
        } else {
          console.log('[CombatScreen] No settle signature available for item unlock parsing:', {
            settleSignature,
            mode,
          });
        }

        navigation.replace('Victory', {
          level: levelReached,
          totalMoves: resolvedTotalMoves,
          enemiesDefeated: combatInput?.enemiesDefeated ?? ((gameState?.enemiesDefeated ?? 0) + 1),
          levelUnlocked: levelReached + 1,
          itemUnlocked,
          runMode: capturedRunMode,
          gauntletPoints:
            typeof gameplayState?.gauntletPointsEarned === 'number'
              ? gameplayState.gauntletPointsEarned
              : gameplayState?.gauntletPointsEarned != null
                ? Number(
                    (gameplayState.gauntletPointsEarned as { toString: () => string }).toString()
                  )
                : undefined,
        });
      } else {
        console.log('[CombatScreen] Navigating back to map (victory)');
        navigation.navigate('Game');
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
    connection,
    refreshProfile,
    signAndSendTransaction,
    getSessionSignerKeypair,
  ]);

  // Look up enemy traits: boss abilities for boss fights, field enemy trait otherwise
  const enemyTraits = useMemo(() => {
    if (isBossFight && combatInput?.bossId) {
      const boss = BOSSES[combatInput.bossId as BossId];
      if (boss?.abilities.length) {
        return boss.abilities.map((a) => ({ name: a.name, description: a.description }));
      }
    }
    const enemyId = combatState.combat?.enemyDefinitionId;
    if (!enemyId) return undefined;
    const trait = ENEMY_TRAITS[enemyId as EnemyId];
    return trait ? [{ name: trait.name, description: trait.description }] : undefined;
  }, [isBossFight, combatInput?.bossId, combatState.combat?.enemyDefinitionId]);

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
  const enemyDig = displayStates.enemy?.dig ?? combatInput?.enemy.dig ?? 0;
  const playerDig =
    displayStates.player?.dig ?? combatInput?.player.dig ?? gameState?.player.stats.dig ?? 0;
  const victoryGoldReward = combatInput?.historyReplay
    ? undefined
    : combatState.resolvedCombat?.goldReward;

  return (
    <CombatLayout
      playerSkinSource={playerSkinSource}
      pvpOpponentSkinSource={pvpOpponentSkinSource}
      playerCombatScale={playerCombatScale}
      enemyPanel={{
        name: combatState.combat?.enemy.name ?? 'Enemy',
        emoji: combatState.combat?.enemy.emoji ?? '',
        imageSource:
          (combatState.combat?.enemyDefinitionId as string) === 'pvpOpponent'
            ? pvpOpponentSkinSource
            : combatState.combat?.enemyDefinitionId
              ? getEntityImageSource(combatState.combat.enemyDefinitionId)
              : undefined,
        dig: enemyDig,
        gold: enemyGold ?? combatInput?.enemyGold,
        traits: enemyTraits,
        equippedTool: combatInput?.enemyTool,
        equippedGear: combatInput?.enemyGear ?? [],
        tier: !isBossFight ? (combatInput?.enemyTier ?? gameState?.combat?.enemyTier) : undefined,
      }}
      playerPanel={{
        name: combatState.combat?.player.name ?? 'Player',
        emoji: combatState.combat?.player.emoji ?? '',
        imageSource: playerSkinSource,
        dig: playerDig,
        gold: playerGold ?? combatInput?.playerGold ?? gameState?.player.stats.gold,
        equippedTool: playerEquipment.tool,
        equippedGear: playerEquipment.gear,
      }}
      goldReward={victoryGoldReward}
      isFinalVictory={
        isBossFight &&
        currentWeek ===
          ((combatInput?.runMode ?? gameplayState?.runMode) === RunMode.Gauntlet ? 5 : 3)
      }
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
