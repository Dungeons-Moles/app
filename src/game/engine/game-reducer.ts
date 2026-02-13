/**
 * Game reducer for PvE Dungeon Crawler
 * Pure function that applies actions to produce new state
 * @see specs/001-pve-dungeon-crawler/contracts/game-engine.md
 * @see specs/001-pve-dungeon-crawler/research.md R3
 */

import type {
  GameState,
  CombatResult,
  CombatantState,
  TimeState,
  Position,
  Tool,
  Gear,
  GearId,
  CombatState,
  Player,
  POIInteraction,
} from './types';
import { GamePhase, CombatPhase, DEFAULT_STATUS_EFFECTS, TimePhase } from './types';
// On-chain types inlined to avoid importing from services/solana which requires env vars.
// These must stay in sync with src/services/solana/types/gameplay_state.ts.

/** On-chain Phase enum (mirrors gameplay_state.ts Phase) */
enum OnChainPhase {
  Day1 = 0,
  Night1 = 1,
  Day2 = 2,
  Night2 = 3,
  Day3 = 4,
  Night3 = 5,
}

/** On-chain GameState (subset needed for SYNC_MOVE/SYNC_COMBAT_RESULT) */
interface OnChainGameState {
  positionX: number;
  positionY: number;
  hp: number;
  maxHp: number;
  atk: number;
  arm: number;
  spd: number;
  dig: number;
  gold: number;
  week: number;
  /** Phase as number — compatible with both local OnChainPhase and services/solana Phase */
  phase: number;
  movesRemaining: number;
  totalMoves: number;
  bossFightReady: boolean;
  isDead: boolean;
  campaignLevel: number;
  runMode?: number;
}
import { Direction, DIRECTION_DELTA } from '../input/types';
import { isValidTransition } from './state-machine';
import { initializeGame, consumeMoves } from './state-factory';
import { GAME_CONSTANTS } from './constants';
import { TileType, TILE_MOVE_COST, type MapEnemy, FogState } from '../map/types';
import { updateFogOfWar } from '../map/fog-of-war';
import { calculateDigCost, canDig, executeDig } from '../map/dig';
import {
  movePlayer,
  equipTool,
  addGearToInventory,
  removeGearFromInventory,
  removeGearById,
  increaseInventoryCapacity,
  addGold,
  removeGold,
  refreshPlayerStats,
} from '../entities/player';
import { createCombatState } from '../combat/resolver';
import {
  consumeMove,
  advanceTimePhase,
  shouldTriggerBoss,
  advanceToNextWeek,
  selectDuelWeekBossForSeed,
  selectWeekBossForLevel,
  canAffordCostAcrossPhases,
  consumeMoveAcrossPhases,
} from '../time/progression';
import { SeededRNG } from './rng';
import {
  createPOIInteraction,
  applyPOIOption,
  markPOIVisited,
  markPOIDiscovered,
  findPOIAtPosition,
  activateSurveyBeacon,
  getDiscoveredWaypoints,
  canFastTravel,
} from '../entities/pois';
import { moveEnemiesNight, isWithinSightRange } from '../map/pathfinding';
import { SIGHT_RADIUS } from './constants';
import { getTierFromRarity } from '../../data/gear';
import { BOSSES } from '../../data/bosses';
import { ENEMY_DEFINITIONS } from '../entities/enemies';

/** Selection POIs that require on-chain interact() flow — not auto-triggered in handleSyncMove */
const SELECTION_POIS = new Set(['L1', 'L2', 'L3', 'L4', 'L5', 'L7', 'L8', 'L9', 'L12', 'L13']);

// ============================================================================
// Game Actions
// ============================================================================

/**
 * All possible game actions as a discriminated union.
 * Per research.md R3: Using typed actions for state machine transitions.
 */
export type GameAction =
  | { type: 'START_GAME'; seed: number; restore?: Partial<GameState> }
  | { type: 'RESTORE_GAME'; state: GameState }
  | { type: 'MOVE'; direction: Direction }
  | { type: 'HIGHLIGHT_WALL'; direction: Direction; targetPosition: Position; cost: number }
  | { type: 'BREAK_WALL' }
  | { type: 'CANCEL_WALL_HIGHLIGHT' }
  | { type: 'ACTIVATE_FAST_TRAVEL' }
  | { type: 'CYCLE_FAST_TRAVEL'; direction?: 1 | -1 }
  | { type: 'CONFIRM_FAST_TRAVEL' }
  | { type: 'CANCEL_FAST_TRAVEL' }
  | { type: 'ENTER_COMBAT'; enemyId: string }
  | { type: 'RESOLVE_COMBAT'; result: CombatResult; combat?: CombatState }
  | { type: 'INTERACT_POI'; poiId: string }
  | { type: 'SELECT_POI_OPTION'; optionIndex: number }
  | { type: 'CLOSE_POI' }
  | { type: 'MARK_POI_VISITED'; poiId: string }
  | { type: 'TRIGGER_BOSS' }
  | { type: 'END_GAME'; result: 'VICTORY' | 'DEFEAT' }
  | { type: 'RETURN_TO_MENU' }
  // Item collection actions (T081)
  | { type: 'EQUIP_TOOL'; tool: Tool }
  | { type: 'COLLECT_GEAR'; gear: Gear }
  | { type: 'DISCARD_GEAR'; slotIndex: number }
  | { type: 'DISCARD_GEAR_BY_ID'; gearId: GearId }
  | { type: 'INCREASE_INVENTORY' }
  | { type: 'ADD_GOLD'; amount: number }
  | { type: 'SPEND_GOLD'; amount: number }
  // On-chain-first sync actions
  | { type: 'SYNC_MOVE'; confirmedState: OnChainGameState }
  | { type: 'SYNC_COMBAT_RESULT'; confirmedState: OnChainGameState; result: CombatResult }
  // POI reveal actions (Survey Beacon, Seismic Scanner)
  | { type: 'REVEAL_TILES'; center: Position; radius: number }
  | { type: 'REVEAL_POI_LOCATIONS'; category: number }
  // Enemy position sync (for night movement from on-chain)
  | {
      type: 'SYNC_ENEMY_POSITIONS';
      enemies: Array<{ x: number; y: number; archetypeId: number; tier: number }>;
    }
  // Guest mode fast travel: teleport player to a waypoint position
  | { type: 'FAST_TRAVEL_TO'; destination: Position }
  // Fallback: show POI modal directly when local POI state is unavailable
  | { type: 'SHOW_POI_MODAL'; interaction: POIInteraction };

// ============================================================================
// Action Type Guards
// ============================================================================

export function isStartGameAction(
  action: GameAction
): action is { type: 'START_GAME'; seed: number; restore?: Partial<GameState> } {
  return action.type === 'START_GAME';
}

export function isMoveAction(action: GameAction): action is { type: 'MOVE'; direction: Direction } {
  return action.type === 'MOVE';
}

// ============================================================================
// Game Reducer
// ============================================================================

/**
 * Pure function that applies an action to produce new state.
 * Per constitution P01: Explicit state machines for game phases.
 *
 * @param state - Current game state
 * @param action - Action to apply
 * @returns New game state after action
 * @throws Error if action causes invalid state transition
 */
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME':
      return handleStartGame(state, action.seed, action.restore);

    case 'RESTORE_GAME':
      return handleRestoreGame(action.state);

    case 'MOVE':
      return handleMove(state, action.direction);

    case 'HIGHLIGHT_WALL':
      return handleHighlightWall(state, action.direction, action.targetPosition, action.cost);

    case 'BREAK_WALL':
      return handleBreakWall(state);

    case 'CANCEL_WALL_HIGHLIGHT':
      return handleCancelWallHighlight(state);

    case 'ACTIVATE_FAST_TRAVEL':
      return handleActivateFastTravel(state);

    case 'CYCLE_FAST_TRAVEL':
      return handleCycleFastTravel(state, action.direction);

    case 'CONFIRM_FAST_TRAVEL':
      return handleConfirmFastTravel(state);

    case 'CANCEL_FAST_TRAVEL':
      return handleCancelFastTravel(state);

    case 'ENTER_COMBAT':
      return handleEnterCombat(state, action.enemyId);

    case 'RESOLVE_COMBAT':
      return handleResolveCombat(state, action.result, action.combat);

    case 'INTERACT_POI':
      return handleInteractPOI(state, action.poiId);

    case 'SHOW_POI_MODAL':
      return {
        ...state,
        phase: GamePhase.POIInteraction,
        activePOI: action.interaction,
      };

    case 'SELECT_POI_OPTION':
      return handleSelectPOIOption(state, action.optionIndex);

    case 'CLOSE_POI':
      return handleClosePOI(state);

    case 'MARK_POI_VISITED':
      return handleMarkPoiVisited(state, action.poiId);

    case 'TRIGGER_BOSS':
      return handleTriggerBoss(state);

    case 'END_GAME':
      return handleEndGame(state, action.result);

    case 'RETURN_TO_MENU':
      return handleReturnToMenu(state);

    // Item collection actions (T081)
    case 'EQUIP_TOOL':
      return handleEquipTool(state, action.tool);

    case 'COLLECT_GEAR':
      return handleCollectGear(state, action.gear);

    case 'DISCARD_GEAR':
      return handleDiscardGear(state, action.slotIndex);

    case 'DISCARD_GEAR_BY_ID':
      return handleDiscardGearById(state, action.gearId);

    case 'INCREASE_INVENTORY':
      return handleIncreaseInventory(state);

    case 'ADD_GOLD':
      return handleAddGold(state, action.amount);

    case 'SPEND_GOLD':
      return handleSpendGold(state, action.amount);

    // On-chain-first sync actions
    case 'SYNC_MOVE':
      return handleSyncMove(state, action.confirmedState);

    case 'SYNC_COMBAT_RESULT':
      return handleSyncCombatResult(state, action.confirmedState, action.result);

    // POI reveal actions (Survey Beacon, Seismic Scanner)
    case 'REVEAL_TILES':
      return handleRevealTiles(state, action.center, action.radius);

    case 'REVEAL_POI_LOCATIONS':
      return handleRevealPoiLocations(state, action.category);

    // Enemy position sync (for night movement from on-chain)
    case 'SYNC_ENEMY_POSITIONS':
      return handleSyncEnemyPositions(state, action.enemies);

    // Guest mode fast travel
    case 'FAST_TRAVEL_TO':
      return {
        ...state,
        player: movePlayer(state.player, action.destination),
      };

    default: {
      // Exhaustive check - TypeScript will error if we miss a case
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

// ============================================================================
// Action Handlers (Skeletons)
// ============================================================================

/**
 * Handles START_GAME action.
 * Transitions from MainMenu to Exploration with initialized game state.
 */
function handleStartGame(state: GameState, seed: number, restore?: Partial<GameState>): GameState {
  if (!isValidTransition(state.phase, GamePhase.Exploration)) {
    throw new Error(`Invalid transition: cannot start game from ${state.phase}`);
  }

  // Initialize game with seed (map generation, player setup, etc.)
  let newState = initializeGame(state, seed);

  // Apply restored state if present (for session resumption)
  if (restore) {
    newState = {
      ...newState,
      ...restore,
      // Ensure we preserve the correct phase if restored
      phase: restore.phase || newState.phase,
      // Map and Player must be merged carefully if provided partially
      player: restore.player ? { ...newState.player, ...restore.player } : newState.player,
      time: restore.time ? { ...newState.time, ...restore.time } : newState.time,
    };
  }

  return newState;
}

/**
 * Handles RESTORE_GAME action.
 * Replaces state entirely with a pre-built GameState from on-chain data.
 * Bypasses initializeGame - used for full session restore.
 *
 * Post-restore fixes:
 * 1. Refresh player stats to apply gear bonuses (e.g., Work Vest +HP)
 * 2. Update fog of war centered on player position
 */
function handleRestoreGame(restoredState: GameState): GameState {
  // Debug: Log all POIs on the map
  const poiCounts: Record<string, number> = {};
  for (const poi of restoredState.map.pois) {
    poiCounts[poi.definitionId] = (poiCounts[poi.definitionId] || 0) + 1;
  }
  console.log('[RESTORE_GAME] POI Summary:');
  console.log('  Total POIs:', restoredState.map.pois.length);
  console.log('  By type:', poiCounts);
  console.log(
    '  All POIs:',
    restoredState.map.pois.map((p) => ({
      id: p.definitionId,
      pos: `(${p.position.x},${p.position.y})`,
      visited: p.visited,
    }))
  );

  // 1. Refresh player stats to include gear bonuses
  // On-chain stores base stats; gear bonuses need to be recalculated
  const refreshedPlayer = refreshPlayerStats(restoredState.player);

  // 2. Update fog of war centered on player position
  // The restored fog might not be centered correctly on the player
  const isDay = restoredState.time.phase === TimePhase.Day;
  const updatedMap = updateFogOfWar(restoredState.map, refreshedPlayer.position, isDay);

  return {
    ...restoredState,
    player: refreshedPlayer,
    map: updatedMap,
  };
}

/**
 * Handles MOVE action.
 * Moves player in direction if valid, consumes time.
 * @see T066: Add time consumption to MOVE action
 */
function handleMove(state: GameState, direction: Direction): GameState {
  if (state.phase !== GamePhase.Exploration) {
    return state; // Ignore move if not exploring
  }

  // Calculate target position
  const delta = DIRECTION_DELTA[direction];
  const targetPos: Position = {
    x: state.player.position.x + delta.x,
    y: state.player.position.y + delta.y,
  };

  // Check bounds
  if (
    targetPos.x < 0 ||
    targetPos.x >= state.map.width ||
    targetPos.y < 0 ||
    targetPos.y >= state.map.height
  ) {
    return state; // Can't move out of bounds
  }

  const targetTile = state.map.tiles[targetPos.y][targetPos.x];
  const hasHighlight = state.wallHighlight !== null;
  const isSameHighlight =
    hasHighlight &&
    state.wallHighlight?.direction === direction &&
    state.wallHighlight?.targetPosition.x === targetPos.x &&
    state.wallHighlight?.targetPosition.y === targetPos.y;

  if (hasHighlight && !isSameHighlight) {
    const canceledState = handleCancelWallHighlight(state);
    return handleMove(canceledState, direction);
  }

  if (targetTile === TileType.Wall) {
    if (isSameHighlight) {
      return handleBreakWall(state);
    }

    const cost = calculateDigCost(state.player.stats.dig);
    if (cost === null) {
      return state;
    }

    if (!canDig(state.map, targetPos)) {
      return state;
    }

    return handleHighlightWall(state, direction, targetPos, cost);
  }

  const clearedState = hasHighlight ? handleCancelWallHighlight(state) : state;

  // Get move cost
  const moveCost = TILE_MOVE_COST[targetTile];

  // Check for enemy at target position
  const enemyAtTarget = clearedState.map.enemies.find(
    (e) => e.position.x === targetPos.x && e.position.y === targetPos.y
  );

  // Move player
  let newState = {
    ...clearedState,
    player: movePlayer(clearedState.player, targetPos),
    totalMoves: (clearedState.totalMoves ?? 0) + 1,
  };

  // Update fog of war
  const isDay = newState.time.phase === TimePhase.Day;
  newState = {
    ...newState,
    map: updateFogOfWar(newState.map, targetPos, isDay),
  };

  // Consume time using time progression system (T066)
  const newTime = consumeMove(newState.time, moveCost);
  const advancedTime = advanceTimePhase(newTime);

  let updatedPlayer = newState.player;
  const isDayStart =
    newState.time.phase === TimePhase.Night && advancedTime.phase === TimePhase.Day;
  if (isDayStart) {
    const nuggetSlots = updatedPlayer.inventory.filter((slot) => slot.item.id === 'I17');
    const nuggetGoldByTier = [3, 6, 9]; // from gear-effects.ts I17 GainGold values
    const goldGain = nuggetSlots.reduce((sum, slot) => {
      const tier = getTierFromRarity(slot.item.currentRarity);
      return sum + nuggetGoldByTier[tier - 1];
    }, 0);
    if (goldGain > 0) {
      updatedPlayer = addGold(updatedPlayer, goldGain);
    }
  }

  newState = {
    ...newState,
    player: updatedPlayer,
    time: advancedTime,
  };

  // Check for enemy encounter - initialize combat properly
  if (enemyAtTarget) {
    // Create player combatant state
    const playerCombatant: CombatantState = {
      name: 'Player',
      emoji: '🦦',
      isPlayer: true,
      maxHp: newState.player.stats.maxHp,
      hp: newState.player.stats.hp,
      atk: newState.player.stats.atk,
      arm: newState.player.stats.arm,
      spd: newState.player.stats.spd,
      dig: newState.player.stats.dig,
      bonusAtk: 0,
      bonusArm: 0,
      bonusSpd: 0,
      statusEffects: { ...newState.player.statusEffects },
      strikesPerTurn: getPlayerStrikesPerTurn(newState),
      ignoresArmor: hasArmorIgnore(newState),
    };

    // Create enemy combatant state
    const enemyCombatant: CombatantState = createEnemyCombatant(enemyAtTarget);

    // Create initial combat state
    const combatState = createCombatState({
      player: playerCombatant,
      enemy: enemyCombatant,
      seed: newState.rngState,
      enemyDefinitionId: enemyAtTarget.definitionId,
      enemyTier: enemyAtTarget.tier,
      playerGold: newState.player.stats.gold,
    });

    return {
      ...newState,
      phase: GamePhase.Combat,
      combat: combatState,
    };
  }

  // Check if boss should trigger (Night 3 complete) (T065)
  if (shouldTriggerBoss(newTime)) {
    // Create player combatant for boss fight
    const playerCombatant: CombatantState = {
      name: 'Player',
      emoji: '🦦',
      isPlayer: true,
      maxHp: newState.player.stats.maxHp,
      hp: newState.player.stats.hp,
      atk: newState.player.stats.atk,
      arm: newState.player.stats.arm,
      spd: newState.player.stats.spd,
      dig: newState.player.stats.dig,
      bonusAtk: 0,
      bonusArm: 0,
      bonusSpd: 0,
      statusEffects: { ...newState.player.statusEffects },
      strikesPerTurn: getPlayerStrikesPerTurn(newState),
      ignoresArmor: hasArmorIgnore(newState),
    };

    // Create boss combatant
    const bossCombatant = createBossCombatant(newState.time.weekBoss);

    // Create combat state for boss fight
    const combatState = createCombatState({
      player: playerCombatant,
      enemy: bossCombatant,
      seed: newState.rngState,
      bossId: newState.time.weekBoss,
      playerGold: newState.player.stats.gold,
    });

    return {
      ...newState,
      time: {
        ...advancedTime,
        phase: TimePhase.Boss,
      },
      phase: GamePhase.BossFight,
      combat: combatState,
    };
  }

  // Check for POI at target position (T099)
  const poiAtTarget = findPOIAtPosition(newState.map, targetPos);
  if (poiAtTarget && !poiAtTarget.visited) {
    // Special case: Survey Beacon (L6) auto-activates on step
    if (poiAtTarget.definitionId === 'L6') {
      newState = activateSurveyBeacon(newState);
      newState = {
        ...newState,
        map: markPOIVisited(newState.map, poiAtTarget.id),
      };
    } else {
      // Create POI interaction if valid
      const interaction = createPOIInteraction(poiAtTarget, newState);
      if (interaction) {
        // Mark Rail Waypoints as discovered
        let updatedMap = newState.map;
        if (poiAtTarget.definitionId === 'L8' && !poiAtTarget.discovered) {
          updatedMap = markPOIDiscovered(newState.map, poiAtTarget.id);
        }
        return {
          ...newState,
          phase: GamePhase.POIInteraction,
          map: updatedMap,
          activePOI: interaction,
        };
      }
    }
  }

  // T133: Move enemies during Night phase
  if (newState.time.phase === TimePhase.Night) {
    newState = handleNightEnemyMovement(newState);
  }

  return newState;
}

/**
 * Handles HIGHLIGHT_WALL action.
 */
function handleHighlightWall(
  state: GameState,
  direction: Direction,
  targetPosition: Position,
  cost: number
): GameState {
  if (state.phase !== GamePhase.Exploration) {
    return state;
  }

  if (state.wallHighlight) {
    return state;
  }

  return {
    ...state,
    wallHighlight: {
      targetPosition,
      direction,
      cost,
    },
  };
}

/**
 * Handles BREAK_WALL action.
 * Supports consuming moves across phase transitions (e.g., 3 moves from Night + 2 from Day).
 */
function handleBreakWall(state: GameState): GameState {
  if (state.phase !== GamePhase.Exploration) {
    return state;
  }

  if (!state.wallHighlight) {
    return state;
  }

  const { targetPosition, cost } = state.wallHighlight;

  if (!canDig(state.map, targetPosition)) {
    return handleCancelWallHighlight(state);
  }

  // Check if we can afford the cost across phase transitions
  if (!canAffordCostAcrossPhases(state.time, cost)) {
    return state;
  }

  let newMap = executeDig(state.map, targetPosition);

  // Consume moves across phases if needed
  const newTime = consumeMoveAcrossPhases(state.time, cost);
  const advancedTime = advanceTimePhase(newTime);

  // Update fog of war based on the resulting phase (after potential phase transition)
  const isDay = advancedTime.phase === TimePhase.Day;
  newMap = updateFogOfWar(newMap, targetPosition, isDay);

  let updatedPlayer: Player = movePlayer(state.player, targetPosition);
  const isDayStart = state.time.phase === TimePhase.Night && advancedTime.phase === TimePhase.Day;
  if (isDayStart) {
    const nuggetSlots = updatedPlayer.inventory.filter((slot) => slot.item.id === 'I17');
    const nuggetGoldByTier = [3, 6, 9]; // from gear-effects.ts I17 GainGold values
    const goldGain = nuggetSlots.reduce((sum, slot) => {
      const tier = getTierFromRarity(slot.item.currentRarity);
      return sum + nuggetGoldByTier[tier - 1];
    }, 0);
    if (goldGain > 0) {
      updatedPlayer = addGold(updatedPlayer, goldGain);
    }
  }

  let newState: GameState = {
    ...state,
    map: newMap,
    time: advancedTime,
    player: updatedPlayer,
    wallHighlight: null,
  };

  if (shouldTriggerBoss(newTime)) {
    // Create player combatant for boss fight
    const playerCombatant: CombatantState = {
      name: 'Player',
      emoji: '🦦',
      isPlayer: true,
      maxHp: newState.player.stats.maxHp,
      hp: newState.player.stats.hp,
      atk: newState.player.stats.atk,
      arm: newState.player.stats.arm,
      spd: newState.player.stats.spd,
      dig: newState.player.stats.dig,
      bonusAtk: 0,
      bonusArm: 0,
      bonusSpd: 0,
      statusEffects: { ...newState.player.statusEffects },
      strikesPerTurn: getPlayerStrikesPerTurn(newState),
      ignoresArmor: hasArmorIgnore(newState),
    };

    // Create boss combatant
    const bossCombatant = createBossCombatant(newState.time.weekBoss);

    // Create combat state for boss fight
    const combatState = createCombatState({
      player: playerCombatant,
      enemy: bossCombatant,
      seed: newState.rngState,
      bossId: newState.time.weekBoss,
      playerGold: newState.player.stats.gold,
    });

    return {
      ...newState,
      time: {
        ...advancedTime,
        phase: TimePhase.Boss,
      },
      phase: GamePhase.BossFight,
      combat: combatState,
    };
  }

  if (newState.time.phase === TimePhase.Night) {
    newState = handleNightEnemyMovement(newState);
  }

  return newState;
}

/**
 * Handles CANCEL_WALL_HIGHLIGHT action.
 */
function handleCancelWallHighlight(state: GameState): GameState {
  if (!state.wallHighlight) {
    return state;
  }

  return {
    ...state,
    wallHighlight: null,
  };
}

// ============================================================================
// Fast Travel Handlers (US5)
// ============================================================================

function getFastTravelWaypoints(state: GameState) {
  const { x, y } = state.player.position;
  return getDiscoveredWaypoints(state.map).filter(
    (poi) => poi.position.x !== x || poi.position.y !== y
  );
}

function handleActivateFastTravel(state: GameState): GameState {
  if (state.phase !== GamePhase.Exploration) {
    return state;
  }

  if (state.fastTravel?.active) {
    return state;
  }

  if (!canFastTravel(state.map)) {
    return state;
  }

  const availableWaypoints = getFastTravelWaypoints(state);
  if (availableWaypoints.length === 0) {
    return state;
  }

  // Select the nearest waypoint by Manhattan distance
  const { x, y } = state.player.position;
  let nearestIndex = 0;
  let nearestDist = Infinity;
  for (let i = 0; i < availableWaypoints.length; i++) {
    const wp = availableWaypoints[i];
    const dist = Math.abs(wp.position.x - x) + Math.abs(wp.position.y - y);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestIndex = i;
    }
  }

  return {
    ...state,
    fastTravel: {
      active: true,
      selectedIndex: nearestIndex,
    },
  };
}

function handleCycleFastTravel(state: GameState, direction: 1 | -1 = 1): GameState {
  if (state.phase !== GamePhase.Exploration) {
    return state;
  }

  if (!state.fastTravel?.active) {
    return state;
  }

  const availableWaypoints = getFastTravelWaypoints(state);
  if (availableWaypoints.length === 0) {
    return {
      ...state,
      fastTravel: null,
    };
  }

  const nextIndex =
    (state.fastTravel.selectedIndex + direction + availableWaypoints.length) %
    availableWaypoints.length;

  return {
    ...state,
    fastTravel: {
      active: true,
      selectedIndex: nextIndex,
    },
  };
}

function handleConfirmFastTravel(state: GameState): GameState {
  if (state.phase !== GamePhase.Exploration) {
    return state;
  }

  if (!state.fastTravel?.active) {
    return state;
  }

  const availableWaypoints = getFastTravelWaypoints(state);
  const selectedWaypoint =
    availableWaypoints[state.fastTravel.selectedIndex] ?? availableWaypoints[0];
  if (!selectedWaypoint) {
    return {
      ...state,
      fastTravel: null,
    };
  }

  return {
    ...state,
    player: movePlayer(state.player, selectedWaypoint.position),
    fastTravel: null,
  };
}

function handleCancelFastTravel(state: GameState): GameState {
  if (!state.fastTravel) {
    return state;
  }

  return {
    ...state,
    fastTravel: null,
  };
}

/**
 * T052: Handles ENTER_COMBAT action.
 * Transitions to Combat phase with specified enemy.
 * Creates combat state from player and enemy.
 */
function handleEnterCombat(state: GameState, enemyId: string): GameState {
  if (!isValidTransition(state.phase, GamePhase.Combat)) {
    throw new Error(`Invalid transition: cannot enter combat from ${state.phase}`);
  }

  // Find enemy on map
  const enemy = state.map.enemies.find((e) => e.id === enemyId);
  if (!enemy) {
    throw new Error(`Enemy not found: ${enemyId}`);
  }

  // Create player combatant state from current player
  const playerCombatant: CombatantState = {
    name: 'Player',
    emoji: '🦦',
    isPlayer: true,
    maxHp: state.player.stats.maxHp,
    hp: state.player.stats.hp,
    atk: state.player.stats.atk,
    arm: state.player.stats.arm,
    spd: state.player.stats.spd,
    dig: state.player.stats.dig,
    bonusAtk: 0,
    bonusArm: 0,
    bonusSpd: 0,
    statusEffects: { ...state.player.statusEffects },
    strikesPerTurn: getPlayerStrikesPerTurn(state),
    ignoresArmor: hasArmorIgnore(state),
  };

  // Create enemy combatant state
  const enemyCombatant: CombatantState = createEnemyCombatant(enemy);

  // Create initial combat state
  const combatState = createCombatState({
    player: playerCombatant,
    enemy: enemyCombatant,
    seed: state.rngState,
    enemyDefinitionId: enemy.definitionId,
    enemyTier: enemy.tier,
    playerGold: state.player.stats.gold,
  });

  return {
    ...state,
    phase: GamePhase.Combat,
    combat: combatState,
  };
}

/**
 * Create enemy combatant state from map enemy
 */
function createEnemyCombatant(enemy: MapEnemy): CombatantState {
  const def = ENEMY_DEFINITIONS[enemy.definitionId];

  return {
    name: def ? def.name : enemy.definitionId,
    emoji: def ? def.emoji : '👾',
    definitionId: enemy.definitionId,
    isPlayer: false,
    maxHp: enemy.stats.hp,
    hp: enemy.stats.hp,
    atk: enemy.stats.atk,
    arm: enemy.stats.arm,
    spd: enemy.stats.spd,
    dig: 0,
    bonusAtk: 0,
    bonusArm: 0,
    bonusSpd: 0,
    statusEffects: { ...DEFAULT_STATUS_EFFECTS },
    strikesPerTurn: 1, // Most enemies strike once, traits may modify
    ignoresArmor: false,
  };
}

/**
 * Create a boss combatant from a BossId
 */
function createBossCombatant(bossId: string): CombatantState {
  const boss = BOSSES[bossId as keyof typeof BOSSES];
  if (!boss) {
    throw new Error(`Unknown boss: ${bossId}`);
  }

  return {
    name: boss.name,
    emoji: boss.emoji,
    definitionId: boss.id,
    isPlayer: false,
    maxHp: boss.stats.hp,
    hp: boss.stats.hp,
    atk: boss.stats.atk,
    arm: boss.stats.arm,
    spd: boss.stats.spd,
    dig: boss.stats.dig ?? 0,
    bonusAtk: 0,
    bonusArm: 0,
    bonusSpd: 0,
    statusEffects: { ...DEFAULT_STATUS_EFFECTS },
    strikesPerTurn: 1, // Boss traits may modify this
    ignoresArmor: false,
  };
}

/**
 * Calculate player strikes per turn based on equipped tool
 */
function getPlayerStrikesPerTurn(state: GameState): number {
  const tool = state.player.equippedTool;
  if (!tool) return 1;

  // T3: Twin Picks - strike twice
  if (tool.id === 'T3') return 2;
  // T5: Pneumatic Drill - strike 3 times
  if (tool.id === 'T5') return 3;

  return 1;
}

/**
 * Check if player has armor ignore (Shadow Burrowblade T6)
 */
function hasArmorIgnore(state: GameState): boolean {
  const tool = state.player.equippedTool;
  if (!tool) return false;

  // T6: Shadow Burrowblade - strikes ignore armor
  return tool.id === 'T6';
}

/**
 * T053: Handles RESOLVE_COMBAT action.
 * Applies combat result and transitions appropriately.
 * Updates player HP and removes defeated enemy from map.
 */
function handleResolveCombat(
  state: GameState,
  result: CombatResult,
  combatOverride?: CombatState
): GameState {
  if (state.phase !== GamePhase.Combat && state.phase !== GamePhase.BossFight) {
    return state;
  }

  const combatState = combatOverride ?? state.combat;
  if (!combatState) {
    return state;
  }

  const goldReward = result === 'VICTORY' ? combatState.goldReward : 0;
  const totalGold = combatState.playerGold + goldReward;

  const preCombatMaxHp = state.combat?.player.maxHp ?? state.player.stats.maxHp;
  const temporaryMaxHpBonus = Math.max(0, combatState.player.maxHp - preCombatMaxHp);

  // Update player HP from combat result, removing any temporary HP granted by combat-only effects.
  // Example: Crystal Crown temporarily increases maxHp and hp at battle start; that bonus should not persist.
  const postCombatHp = Math.min(
    preCombatMaxHp,
    Math.max(0, combatState.player.hp - temporaryMaxHpBonus)
  );

  let updatedPlayer = {
    ...state.player,
    baseStats: {
      ...state.player.baseStats,
      hp: postCombatHp,
      gold: totalGold,
    },
    stats: {
      ...state.player.stats,
      hp: postCombatHp,
      gold: totalGold,
    },
    statusEffects: { ...combatState.player.statusEffects },
  };

  if (combatState.consumedGearIds.length > 0) {
    for (const gearId of combatState.consumedGearIds) {
      const removal = removeGearById(updatedPlayer, gearId);
      updatedPlayer = removal.player;
    }
  }

  if (updatedPlayer.stats.hp > updatedPlayer.stats.maxHp) {
    const clampedHp = updatedPlayer.stats.maxHp;
    updatedPlayer = {
      ...updatedPlayer,
      baseStats: {
        ...updatedPlayer.baseStats,
        hp: clampedHp,
      },
      stats: {
        ...updatedPlayer.stats,
        hp: clampedHp,
      },
    };
  }

  // Update RNG state from combat
  const updatedRngState = combatState.rngState;

  if (result === 'DEFEAT') {
    return {
      ...state,
      phase: GamePhase.Defeat,
      player: updatedPlayer,
      rngState: updatedRngState,
      combat: { ...combatState, result: 'DEFEAT' },
    };
  }

  // Victory - return to exploration (or victory screen for final boss)
  if (state.phase === GamePhase.BossFight && state.time.week === 3) {
    return {
      ...state,
      phase: GamePhase.Victory,
      player: updatedPlayer,
      rngState: updatedRngState,
      combat: { ...combatState, result: 'VICTORY' },
    };
  }

  const bossSlotBonus =
    state.phase === GamePhase.BossFight
      ? Math.min(
          updatedPlayer.inventoryCapacity + GAME_CONSTANTS.INVENTORY_SLOTS_PER_WEEK,
          GAME_CONSTANTS.MAX_INVENTORY_SLOTS
        )
      : updatedPlayer.inventoryCapacity;

  // Remove defeated enemy from map
  const enemyToRemove = findEnemyAtPlayerPosition(state);
  const updatedEnemies = enemyToRemove
    ? state.map.enemies.filter((e) => e.id !== enemyToRemove.id)
    : state.map.enemies;

  // Advance to next week after boss victory (weeks 1-2)
  let newTime = state.time;
  let finalRngState = updatedRngState;
  if (state.phase === GamePhase.BossFight && state.time.week < 3) {
    const rng = new SeededRNG(updatedRngState);
    const nextWeekTime = advanceToNextWeek(state.time, rng);
    if (nextWeekTime) {
      newTime = nextWeekTime;
      finalRngState = rng.getState();
    }
  }

  return {
    ...state,
    phase: GamePhase.Exploration,
    player: {
      ...updatedPlayer,
      inventoryCapacity: bossSlotBonus,
    },
    time: newTime,
    rngState: finalRngState,
    map: {
      ...state.map,
      enemies: updatedEnemies,
    },
    combat: null,
  };
}

/**
 * Find enemy at player's current position
 */
function findEnemyAtPlayerPosition(state: GameState): MapEnemy | undefined {
  return state.map.enemies.find(
    (e) => e.position.x === state.player.position.x && e.position.y === state.player.position.y
  );
}

/**
 * T099: Handles INTERACT_POI action.
 * Transitions to POIInteraction phase with specified POI.
 * Creates POI interaction state with generated options.
 */
function handleInteractPOI(state: GameState, poiId: string): GameState {
  if (!isValidTransition(state.phase, GamePhase.POIInteraction)) {
    throw new Error(`Invalid transition: cannot interact with POI from ${state.phase}`);
  }

  // Find the POI on the map
  const poi = state.map.pois.find((p) => p.id === poiId);
  if (!poi) {
    throw new Error(`POI not found: ${poiId}`);
  }

  // Create the POI interaction state
  const interaction = createPOIInteraction(poi, state);
  if (!interaction) {
    // POI cannot be interacted with (e.g., night-only during day)
    return state;
  }

  // Mark POI as discovered (for Rail Waypoints)
  let updatedMap = state.map;
  if (poi.definitionId === 'L8' && !poi.discovered) {
    updatedMap = markPOIDiscovered(state.map, poiId);
  }

  return {
    ...state,
    phase: GamePhase.POIInteraction,
    map: updatedMap,
    activePOI: interaction,
  };
}

/**
 * T099: Handles SELECT_POI_OPTION action.
 * Applies selected option effect within POI interaction.
 */
function handleSelectPOIOption(state: GameState, optionIndex: number): GameState {
  if (state.phase !== GamePhase.POIInteraction) {
    return state;
  }

  if (!state.activePOI) {
    return state;
  }

  const options = state.activePOI.options;
  if (!options || optionIndex < 0 || optionIndex >= options.length) {
    return state;
  }

  const option = options[optionIndex];

  // Check if it's the "Leave" option
  if (option.label === 'Leave') {
    return handleClosePOI(state);
  }

  // Check if option is disabled
  if (option.disabled) {
    return state;
  }

  // Apply the POI option effects
  let newState = applyPOIOption(state, optionIndex);

  // If the effect wasn't applied (e.g. inventory full), don't mark POI as visited
  if (newState === state) {
    return state;
  }

  // Update the selected option
  newState = {
    ...newState,
    activePOI: newState.activePOI ? { ...newState.activePOI, selectedOption: optionIndex } : null,
  };

  // Mark POI as visited (except for persistent POIs)
  const poiId = state.activePOI.poi.id;
  const poiDefId = state.activePOI.poi.definitionId;
  const isPersistentPOI = ['L4', 'L8', 'L9', 'L10', 'L11'].includes(poiDefId);
  const keepInteractionOpen = ['L8', 'L9', 'L10', 'L11'].includes(poiDefId);

  if (!isPersistentPOI && !option.label.includes('Reroll')) {
    newState = {
      ...newState,
      map: markPOIVisited(newState.map, poiId),
    };
    // Close POI after using it (for non-reusable POIs)
    return handleClosePOI(newState);
  }

  // For persistent POIs, optionally stay in interaction mode (shops, waypoints, etc.)
  // unless they explicitly chose Leave
  if (!keepInteractionOpen && !option.label.includes('Reroll')) {
    return handleClosePOI(newState);
  }

  return newState;
}

/**
 * Handles CLOSE_POI action.
 * Returns from POI interaction to exploration, or triggers boss fight
 * if a time-skip POI (Mole Den, Rest Alcove) advanced past Night 3.
 */
function handleClosePOI(state: GameState): GameState {
  if (!isValidTransition(state.phase, GamePhase.Exploration)) {
    return state;
  }

  const closedState: GameState = {
    ...state,
    phase: GamePhase.Exploration,
    activePOI: null,
  };

  // If the POI effect advanced time to Boss phase (e.g. Mole Den/Rest Alcove on Night 3),
  // trigger the boss fight instead of returning to exploration
  if (closedState.time.phase === TimePhase.Boss) {
    return handleTriggerBoss(closedState);
  }

  return closedState;
}

/**
 * Handles MARK_POI_VISITED action.
 * Marks a POI as visited without changing the game phase.
 * Used for on-chain POI interactions where we handle item equipping separately.
 */
function handleMarkPoiVisited(state: GameState, poiId: string): GameState {
  return {
    ...state,
    map: markPOIVisited(state.map, poiId),
  };
}

/**
 * Handles TRIGGER_BOSS action.
 * Transitions to BossFight phase at end of week.
 * @see T067: Add TRIGGER_BOSS action to game reducer
 */
function handleTriggerBoss(state: GameState): GameState {
  if (!isValidTransition(state.phase, GamePhase.BossFight)) {
    throw new Error(`Invalid transition: cannot trigger boss from ${state.phase}`);
  }

  // Update time to Boss phase
  const bossTime: TimeState = {
    ...state.time,
    phase: TimePhase.Boss,
    movesRemaining: 0,
  };

  // Create player combatant for boss fight
  const playerCombatant: CombatantState = {
    name: 'Player',
    emoji: '🦦',
    isPlayer: true,
    maxHp: state.player.stats.maxHp,
    hp: state.player.stats.hp,
    atk: state.player.stats.atk,
    arm: state.player.stats.arm,
    spd: state.player.stats.spd,
    dig: state.player.stats.dig,
    bonusAtk: 0,
    bonusArm: 0,
    bonusSpd: 0,
    statusEffects: { ...state.player.statusEffects },
    strikesPerTurn: getPlayerStrikesPerTurn(state),
    ignoresArmor: hasArmorIgnore(state),
  };

  // Create boss combatant
  const bossCombatant = createBossCombatant(state.time.weekBoss);

  // Create combat state for boss fight
  const combatState = createCombatState({
    player: playerCombatant,
    enemy: bossCombatant,
    seed: state.rngState,
    bossId: state.time.weekBoss,
    playerGold: state.player.stats.gold,
  });

  return {
    ...state,
    phase: GamePhase.BossFight,
    time: bossTime,
    combat: combatState,
  };
}

/**
 * Handles END_GAME action.
 * Transitions to Victory or Defeat phase.
 */
function handleEndGame(state: GameState, result: 'VICTORY' | 'DEFEAT'): GameState {
  const targetPhase = result === 'VICTORY' ? GamePhase.Victory : GamePhase.Defeat;

  if (!isValidTransition(state.phase, targetPhase)) {
    throw new Error(`Invalid transition: cannot end game with ${result} from ${state.phase}`);
  }

  return {
    ...state,
    phase: targetPhase,
  };
}

/**
 * Handles RETURN_TO_MENU action.
 * Returns to main menu from Victory or Defeat.
 */
function handleReturnToMenu(state: GameState): GameState {
  if (!isValidTransition(state.phase, GamePhase.MainMenu)) {
    throw new Error(`Invalid transition: cannot return to menu from ${state.phase}`);
  }

  // TODO: Reset game state to initial values
  return {
    ...state,
    phase: GamePhase.MainMenu,
    combat: null,
    activePOI: null,
  };
}

// ============================================================================
// Night Enemy Movement (T133)
// ============================================================================

/**
 * Handle enemy movement during Night phase.
 * Enemies within sight range move toward the player.
 * If an enemy reaches the player tile, combat triggers.
 */
function handleNightEnemyMovement(state: GameState): GameState {
  const playerPos = state.player.position;

  // Filter enemies within Night sight range
  const enemiesInRange = state.map.enemies.filter((enemy) =>
    isWithinSightRange(enemy.position, playerPos, SIGHT_RADIUS.night)
  );

  // If no enemies in range, no movement needed
  if (enemiesInRange.length === 0) {
    return state;
  }

  // Create a map with only enemies in range for movement
  const mapForPathfinding = {
    ...state.map,
    enemies: enemiesInRange,
  };

  // Move enemies toward player
  const { updatedEnemies, combatTriggered } = moveEnemiesNight(mapForPathfinding, playerPos);

  // Merge updated enemy positions back into full enemy list
  const updatedEnemyMap = new Map(updatedEnemies.map((e) => [e.id, e]));
  const finalEnemies = state.map.enemies.map((enemy) => updatedEnemyMap.get(enemy.id) || enemy);

  // Create new state with updated enemies
  const newState: GameState = {
    ...state,
    map: {
      ...state.map,
      enemies: finalEnemies,
    },
  };

  // If an enemy reached the player, trigger combat
  if (combatTriggered) {
    const attackingEnemy = finalEnemies.find((e) => e.id === combatTriggered);
    if (attackingEnemy) {
      // Create player combatant state from current player
      const playerCombatant: CombatantState = {
        name: 'Player',
        emoji: '🦦',
        isPlayer: true,
        maxHp: newState.player.stats.maxHp,
        hp: newState.player.stats.hp,
        atk: newState.player.stats.atk,
        arm: newState.player.stats.arm,
        spd: newState.player.stats.spd,
        dig: newState.player.stats.dig,
        bonusAtk: 0,
        bonusArm: 0,
        bonusSpd: 0,
        statusEffects: { ...newState.player.statusEffects },
        strikesPerTurn: getPlayerStrikesPerTurn(newState),
        ignoresArmor: hasArmorIgnore(newState),
      };

      // Create enemy combatant state
      const enemyCombatant: CombatantState = createEnemyCombatant(attackingEnemy);

      // Create initial combat state
      const combatState = createCombatState({
        player: playerCombatant,
        enemy: enemyCombatant,
        seed: newState.rngState,
        enemyDefinitionId: attackingEnemy.definitionId,
        enemyTier: attackingEnemy.tier,
        playerGold: newState.player.stats.gold,
      });

      return {
        ...newState,
        phase: GamePhase.Combat,
        combat: combatState,
        wallHighlight: null,
      };
    }
  }

  return newState;
}

// ============================================================================
// On-Chain-First Sync Handlers
// ============================================================================

/**
 * Maps on-chain Phase enum value to local TimePhase + cycle.
 */
function mapOnChainPhase(phase: number): { timePhase: TimePhase; cycle: 1 | 2 | 3 } {
  switch (phase) {
    case OnChainPhase.Day1:
      return { timePhase: TimePhase.Day, cycle: 1 };
    case OnChainPhase.Night1:
      return { timePhase: TimePhase.Night, cycle: 1 };
    case OnChainPhase.Day2:
      return { timePhase: TimePhase.Day, cycle: 2 };
    case OnChainPhase.Night2:
      return { timePhase: TimePhase.Night, cycle: 2 };
    case OnChainPhase.Day3:
      return { timePhase: TimePhase.Day, cycle: 3 };
    case OnChainPhase.Night3:
      return { timePhase: TimePhase.Night, cycle: 3 };
    default:
      return { timePhase: TimePhase.Day, cycle: 1 };
  }
}

/**
 * Handles SYNC_MOVE action.
 * Updates local game state from confirmed on-chain state after a move_player transaction.
 * This is the on-chain-first equivalent of the old MOVE action for non-guest mode.
 */
function handleSyncMove(state: GameState, confirmedState: OnChainGameState): GameState {
  // Debug: Log HP values to track sync issues
  console.log('[handleSyncMove] HP sync:', {
    previousBaseHp: state.player.baseStats.hp,
    previousStatsHp: state.player.stats.hp,
    onChainHp: confirmedState.hp,
    previousGold: state.player.stats.gold,
    onChainGold: confirmedState.gold,
  });

  const { timePhase, cycle } = mapOnChainPhase(confirmedState.phase);

  const targetPos: Position = {
    x: confirmedState.positionX,
    y: confirmedState.positionY,
  };

  // Update fog of war for new position
  const isDay = timePhase === TimePhase.Day;
  const updatedMap = updateFogOfWar(state.map, targetPos, isDay);

  // Remove any defeated enemies at the target position
  // (on-chain move_player marks enemies as defeated)
  const updatedEnemies = updatedMap.enemies.filter(
    (e) => !(e.position.x === targetPos.x && e.position.y === targetPos.y)
  );

  // Determine facing direction from movement delta
  const dx = targetPos.x - state.player.position.x;
  const newFacing: 'left' | 'right' = dx < 0 ? 'left' : dx > 0 ? 'right' : state.player.facing;

  // Sync player state from on-chain.
  // On-chain HP already includes gear bonuses (e.g., Work Vest +4 HP).
  // We must subtract the gear HP bonus before storing as baseStats.hp to avoid
  // double-counting when refreshPlayerStats recalculates derived stats.
  //
  // The gear HP bonus is calculated from equipped gear stats (hp property).
  // This matches how calculateItemStats computes HP from gear.
  const gearItems = state.player.inventory.map((slot) => slot.item);
  const gearHpBonus = gearItems.reduce((total, gear) => total + (gear.stats.hp ?? 0), 0);

  // baseHp = onChainHp - gearBonus (but never below 0)
  // When refreshPlayerStats runs, it will add gearBonus back, giving us onChainHp
  const baseHp = Math.max(0, confirmedState.hp - gearHpBonus);

  const syncedPlayer: Player = {
    ...state.player,
    position: targetPos,
    facing: newFacing,
    baseStats: {
      ...state.player.baseStats,
      hp: baseHp,
      gold: confirmedState.gold,
    },
    stats: {
      ...state.player.stats,
      gold: confirmedState.gold,
      // HP will be recalculated by refreshPlayerStats to include gear bonuses
    },
  };

  // Recalculate derived stats (HP, ATK, ARM, SPD, DIG) from inventory
  // This ensures gear bonuses like +HP from Work Vest are applied correctly
  const updatedPlayer = refreshPlayerStats(syncedPlayer);

  // Debug: Log final HP after recalculation
  console.log('[handleSyncMove] HP after refresh:', {
    finalBaseHp: updatedPlayer.baseStats.hp,
    finalStatsHp: updatedPlayer.stats.hp,
  });

  // Sync time state from on-chain
  const syncedWeek = confirmedState.week as 1 | 2 | 3;
  const syncedWeekBoss =
    syncedWeek !== state.time.week
      ? confirmedState.runMode === 1 && (syncedWeek === 1 || syncedWeek === 2)
        ? selectDuelWeekBossForSeed(state.seed, syncedWeek)
        : selectWeekBossForLevel(confirmedState.campaignLevel, syncedWeek)
      : state.time.weekBoss;
  const updatedTime: TimeState = {
    ...state.time,
    week: syncedWeek,
    phase: timePhase,
    cycle,
    movesRemaining: confirmedState.movesRemaining,
    // Update weekBoss if the week changed (e.g., after boss victory advanced the week on-chain)
    weekBoss: syncedWeekBoss,
  };

  // Check for wall break: if tile at target was a wall, convert it to floor
  let finalMap = { ...updatedMap, enemies: updatedEnemies };
  if (
    targetPos.y >= 0 &&
    targetPos.y < finalMap.height &&
    targetPos.x >= 0 &&
    targetPos.x < finalMap.width
  ) {
    const targetTile = finalMap.tiles[targetPos.y][targetPos.x];
    if (targetTile === TileType.Wall) {
      // On-chain confirmed the move to a wall tile, so it was dug
      const newTiles = finalMap.tiles.map((row, y) =>
        y === targetPos.y ? row.map((tile, x) => (x === targetPos.x ? TileType.Floor : tile)) : row
      );
      finalMap = { ...finalMap, tiles: newTiles };
    }
  }

  // Check for POI at target position
  const poiAtTarget = findPOIAtPosition(finalMap, targetPos);
  if (poiAtTarget && !poiAtTarget.visited) {
    // Survey Beacon auto-activates
    if (poiAtTarget.definitionId === 'L6') {
      let newState: GameState = {
        ...state,
        player: updatedPlayer,
        map: finalMap,
        time: updatedTime,
        wallHighlight: null,
      };
      newState = activateSurveyBeacon(newState);
      newState = {
        ...newState,
        map: markPOIVisited(newState.map, poiAtTarget.id),
      };
      return newState;
    }

    // Selection POIs: stay in Exploration so "Interact" button triggers on-chain flow
    if (SELECTION_POIS.has(poiAtTarget.definitionId)) {
      // Fall through — usePoiInteraction.canInteract will detect the POI
      // and the "Interact" button will appear in Exploration phase
    } else {
      // Auto-trigger POIs (L1, L5, L8, L10, L11, L14): existing behavior
      const tempState: GameState = {
        ...state,
        player: updatedPlayer,
        map: finalMap,
        time: updatedTime,
      };
      const interaction = createPOIInteraction(poiAtTarget, tempState);
      if (interaction) {
        let interactionMap = finalMap;
        if (poiAtTarget.definitionId === 'L8' && !poiAtTarget.discovered) {
          interactionMap = markPOIDiscovered(finalMap, poiAtTarget.id);
        }
        return {
          ...state,
          phase: GamePhase.POIInteraction,
          player: updatedPlayer,
          map: interactionMap,
          time: updatedTime,
          activePOI: interaction,
          wallHighlight: null,
        };
      }
    }
  }

  // Handle boss fight ready — takes priority over isDead because the boss fight
  // animation must be shown to the player before navigating to the Death screen.
  // When both flags are true (e.g., field combat death on the same move that
  // triggered the boss phase), the boss useEffect will fire and show CombatScreen.
  if (confirmedState.bossFightReady) {
    return {
      ...state,
      player: updatedPlayer,
      map: finalMap,
      time: {
        ...updatedTime,
        phase: TimePhase.Boss,
      },
      wallHighlight: null,
    };
  }

  // Handle player death (only when no boss fight pending)
  if (confirmedState.isDead) {
    return {
      ...state,
      phase: GamePhase.Defeat,
      player: updatedPlayer,
      map: finalMap,
      time: updatedTime,
      wallHighlight: null,
    };
  }

  return {
    ...state,
    phase: GamePhase.Exploration,
    player: updatedPlayer,
    map: finalMap,
    time: updatedTime,
    wallHighlight: null,
  };
}

/**
 * Handles SYNC_COMBAT_RESULT action.
 * Updates local game state from confirmed on-chain state after combat resolution.
 */
function handleSyncCombatResult(
  state: GameState,
  confirmedState: OnChainGameState,
  result: CombatResult
): GameState {
  const { timePhase, cycle } = mapOnChainPhase(confirmedState.phase);

  const targetPos: Position = {
    x: confirmedState.positionX,
    y: confirmedState.positionY,
  };

  // Remove defeated enemy at player position
  const updatedEnemies = state.map.enemies.filter(
    (e) => !(e.position.x === targetPos.x && e.position.y === targetPos.y)
  );

  // Sync player state from on-chain, then recalculate derived stats.
  // On-chain HP already includes gear bonuses (e.g., Work Vest +4 HP).
  // We must subtract the gear HP bonus before storing as baseStats.hp to avoid
  // double-counting when refreshPlayerStats recalculates derived stats.
  const gearItems = state.player.inventory.map((slot) => slot.item);
  const gearHpBonus = gearItems.reduce((total, gear) => total + (gear.stats.hp ?? 0), 0);
  const baseHp = Math.max(0, confirmedState.hp - gearHpBonus);

  const syncedPlayer: Player = {
    ...state.player,
    position: targetPos,
    baseStats: {
      ...state.player.baseStats,
      hp: baseHp,
      gold: confirmedState.gold,
    },
    stats: {
      ...state.player.stats,
      gold: confirmedState.gold,
    },
  };

  // Recalculate derived stats (HP, ATK, ARM, SPD, DIG) from inventory.
  // This ensures gear bonuses are applied correctly and HP is capped at maxHP.
  const updatedPlayer = refreshPlayerStats(syncedPlayer);

  const syncedWeek2 = confirmedState.week as 1 | 2 | 3;
  const syncedWeekBoss2 =
    syncedWeek2 !== state.time.week
      ? confirmedState.runMode === 1 && (syncedWeek2 === 1 || syncedWeek2 === 2)
        ? selectDuelWeekBossForSeed(state.seed, syncedWeek2)
        : selectWeekBossForLevel(confirmedState.campaignLevel, syncedWeek2)
      : state.time.weekBoss;
  const updatedTime: TimeState = {
    ...state.time,
    week: syncedWeek2,
    phase: timePhase,
    cycle,
    movesRemaining: confirmedState.movesRemaining,
    weekBoss: syncedWeekBoss2,
  };

  if (result === 'DEFEAT' || confirmedState.isDead) {
    return {
      ...state,
      phase: GamePhase.Defeat,
      player: updatedPlayer,
      map: { ...state.map, enemies: updatedEnemies },
      time: updatedTime,
      combat: state.combat ? { ...state.combat, result: 'DEFEAT' } : null,
    };
  }

  return {
    ...state,
    phase: GamePhase.Exploration,
    player: updatedPlayer,
    map: { ...state.map, enemies: updatedEnemies },
    time: updatedTime,
    combat: null,
  };
}

// ============================================================================
// Item Collection Action Handlers (T081)
// ============================================================================

/**
 * Handles EQUIP_TOOL action.
 * Equips a tool to the player's weapon slot.
 */
function handleEquipTool(state: GameState, tool: Tool): GameState {
  const updatedPlayer = equipTool(state.player, tool);
  return {
    ...state,
    player: updatedPlayer,
  };
}

/**
 * Handles COLLECT_GEAR action.
 * Adds gear to player inventory if space available.
 */
function handleCollectGear(state: GameState, gear: Gear): GameState {
  const updatedPlayer = addGearToInventory(state.player, gear);
  if (!updatedPlayer) {
    // Inventory full - return unchanged state
    return state;
  }
  return {
    ...state,
    player: updatedPlayer,
  };
}

/**
 * Handles DISCARD_GEAR action.
 * Removes gear from inventory by slot index.
 */
function handleDiscardGear(state: GameState, slotIndex: number): GameState {
  const { player } = removeGearFromInventory(state.player, slotIndex);
  return {
    ...state,
    player,
  };
}

/**
 * Handles DISCARD_GEAR_BY_ID action.
 * Removes gear from inventory by gear ID.
 */
function handleDiscardGearById(state: GameState, gearId: GearId): GameState {
  const { player } = removeGearById(state.player, gearId);
  return {
    ...state,
    player,
  };
}

/**
 * Handles INCREASE_INVENTORY action.
 * Increases inventory capacity (called at start of Day).
 */
function handleIncreaseInventory(state: GameState): GameState {
  const updatedPlayer = increaseInventoryCapacity(state.player);
  return {
    ...state,
    player: updatedPlayer,
  };
}

/**
 * Handles ADD_GOLD action.
 * Adds gold to the player.
 */
function handleAddGold(state: GameState, amount: number): GameState {
  const updatedPlayer = addGold(state.player, amount);
  return {
    ...state,
    player: updatedPlayer,
  };
}

/**
 * Handles SPEND_GOLD action.
 * Removes gold from player if they can afford it.
 */
function handleSpendGold(state: GameState, amount: number): GameState {
  const { player, success } = removeGold(state.player, amount);
  if (!success) {
    // Insufficient gold - return unchanged state
    return state;
  }
  return {
    ...state,
    player,
  };
}

// ============================================================================
// POI Reveal Action Handlers (Fog Persistence)
// ============================================================================

/**
 * Category to POI definition ID mapping for Seismic Scanner.
 * Matches the on-chain category enum:
 * - 0 = Items (Supply Cache, Tool Crate, Tool Oil, Geode Vault, Counter Cache)
 * - 1 = Upgrades (Rusty Anvil, Rune Kiln, Scrap Chute)
 * - 2 = Utility (Mole Den, Rest Alcove, Survey Beacon, Rail Waypoint, Seismic Scanner)
 * - 3 = Shop (Smuggler Hatch)
 */
const POI_CATEGORY_MAP: Record<number, string[]> = {
  0: ['L2', 'L3', 'L4', 'L12', 'L13'], // Items
  1: ['L10', 'L11', 'L14'], // Upgrades
  2: ['L1', 'L5', 'L6', 'L7', 'L8'], // Utility
  3: ['L9'], // Shop
};

/**
 * Handles REVEAL_TILES action.
 * Reveals all tiles within a radius from a center position.
 * Used by Survey Beacon (radius 13).
 */
function handleRevealTiles(state: GameState, center: Position, radius: number): GameState {
  // Create deep copy of fog
  const newFog: FogState[][] = state.map.fog.map((row) => [...row]);

  // Reveal all tiles within radius (using Manhattan distance like activateSurveyBeacon)
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist <= radius) {
        const x = center.x + dx;
        const y = center.y + dy;
        if (x >= 0 && x < state.map.width && y >= 0 && y < state.map.height) {
          if (newFog[y][x] === FogState.Hidden) {
            newFog[y][x] = FogState.Revealed;
          }
        }
      }
    }
  }

  // Mark enemies in revealed area as discovered
  const visibleKeys = new Set<string>();
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist <= radius) {
        const x = center.x + dx;
        const y = center.y + dy;
        if (x >= 0 && x < state.map.width && y >= 0 && y < state.map.height) {
          visibleKeys.add(`${x},${y}`);
        }
      }
    }
  }

  const updatedEnemies = state.map.enemies.map((enemy) => {
    const key = `${enemy.position.x},${enemy.position.y}`;
    if (visibleKeys.has(key)) {
      return { ...enemy, discovered: true };
    }
    return enemy;
  });

  return {
    ...state,
    map: {
      ...state.map,
      fog: newFog,
      enemies: updatedEnemies,
    },
  };
}

/**
 * Handles REVEAL_POI_LOCATIONS action.
 * Reveals the tile positions of all POIs matching a specific category.
 * Used by Seismic Scanner.
 */
function handleRevealPoiLocations(state: GameState, category: number): GameState {
  const poiDefIds = POI_CATEGORY_MAP[category];
  if (!poiDefIds) {
    console.warn('[gameReducer] Unknown POI category:', category);
    return state;
  }

  // Find all POIs matching the category
  const matchingPois = state.map.pois.filter(
    (poi) => poiDefIds.includes(poi.definitionId) && !poi.visited
  );

  if (matchingPois.length === 0) {
    return state;
  }

  // Create deep copy of fog
  const newFog: FogState[][] = state.map.fog.map((row) => [...row]);

  // Reveal the tile at each matching POI's position
  for (const poi of matchingPois) {
    const { x, y } = poi.position;
    if (x >= 0 && x < state.map.width && y >= 0 && y < state.map.height) {
      if (newFog[y][x] === FogState.Hidden) {
        newFog[y][x] = FogState.Revealed;
      }
    }
  }

  return {
    ...state,
    map: {
      ...state.map,
      fog: newFog,
    },
  };
}

// ============================================================================
// Enemy Position Sync Handler (Night Movement)
// ============================================================================

/**
 * Handles SYNC_ENEMY_POSITIONS action.
 * Updates enemy positions in the local map from on-chain data.
 * Used after player moves during night phase when enemies move toward player.
 *
 * Matching strategy:
 * - Match enemies by position (exact match from on-chain to local)
 * - Only update positions for enemies that moved
 * - Keep all local enemies that don't have an on-chain match (conservative approach)
 */
function handleSyncEnemyPositions(
  state: GameState,
  onChainEnemies: Array<{ x: number; y: number; archetypeId: number; tier: number }>
): GameState {
  console.log('[SYNC_ENEMY_POSITIONS] On-chain enemies:', onChainEnemies.length);
  console.log('[SYNC_ENEMY_POSITIONS] Local enemies:', state.map.enemies.length);

  // Safety check: if on-chain has far fewer enemies than local, skip sync
  // (could indicate a fetch error or data mismatch)
  if (onChainEnemies.length === 0 || onChainEnemies.length < state.map.enemies.length * 0.5) {
    console.log('[SYNC_ENEMY_POSITIONS] Skipping sync - on-chain count too low');
    return state;
  }

  // Create a map of on-chain enemy positions for quick lookup
  // Key: "archetype_tier_x_y" for exact position match
  const onChainByPosition = new Map<string, (typeof onChainEnemies)[0]>();
  for (const enemy of onChainEnemies) {
    const key = `${enemy.archetypeId}_${enemy.tier}_${enemy.x}_${enemy.y}`;
    onChainByPosition.set(key, enemy);
  }

  // Create a set of all on-chain positions for existence check
  const onChainPositions = new Set(onChainEnemies.map((e) => `${e.x}_${e.y}`));

  // Track which on-chain enemies have been matched
  const matchedOnChainKeys = new Set<string>();

  const updatedEnemies: typeof state.map.enemies = [];

  for (const localEnemy of state.map.enemies) {
    const localArchetype = getArchetypeIdFromDefinitionId(localEnemy.definitionId);
    // On-chain tier is 0-based (0=T1, 1=T2, 2=T3), local is 1-based (1, 2, 3)
    const localTierOnChain = localEnemy.tier - 1;
    const localKey = `${localArchetype}_${localTierOnChain}_${localEnemy.position.x}_${localEnemy.position.y}`;

    // First, check if enemy is still at same position on-chain
    if (onChainByPosition.has(localKey)) {
      matchedOnChainKeys.add(localKey);
      updatedEnemies.push(localEnemy); // No change needed
      continue;
    }

    // Enemy not at same position - look for matching enemy that moved
    // Find on-chain enemy with same archetype+tier that's nearby
    let bestMatch: { key: string; enemy: (typeof onChainEnemies)[0]; distance: number } | null =
      null;

    for (const [key, onChainEnemy] of onChainByPosition.entries()) {
      if (matchedOnChainKeys.has(key)) continue;
      // Compare on-chain tier (0-based) with converted local tier
      if (onChainEnemy.archetypeId !== localArchetype || onChainEnemy.tier !== localTierOnChain) {
        continue;
      }

      const distance =
        Math.abs(onChainEnemy.x - localEnemy.position.x) +
        Math.abs(onChainEnemy.y - localEnemy.position.y);

      // Night movement moves enemies 1 tile at a time, so look for nearby matches
      if (distance <= 3 && (!bestMatch || distance < bestMatch.distance)) {
        bestMatch = { key, enemy: onChainEnemy, distance };
      }
    }

    if (bestMatch) {
      matchedOnChainKeys.add(bestMatch.key);
      console.log(
        `[SYNC_ENEMY_POSITIONS] Enemy ${localEnemy.definitionId} moved: (${localEnemy.position.x},${localEnemy.position.y}) -> (${bestMatch.enemy.x},${bestMatch.enemy.y})`
      );
      updatedEnemies.push({
        ...localEnemy,
        position: { x: bestMatch.enemy.x, y: bestMatch.enemy.y },
      });
      continue;
    }

    // No match found — enemy was defeated on-chain and removed. Drop it from local state.
    console.log(
      `[SYNC_ENEMY_POSITIONS] Enemy ${localEnemy.definitionId} at (${localEnemy.position.x},${localEnemy.position.y}) not found on-chain, removing (defeated)`
    );
  }

  return {
    ...state,
    map: {
      ...state.map,
      enemies: updatedEnemies,
    },
  };
}

/**
 * Maps enemy definition ID (e.g., "TUNNEL_RAT") to on-chain archetype ID (0-11).
 * Must match ARCHETYPE_TO_ENEMY_ID in sessionRestore.ts.
 */
const ENEMY_ID_TO_ARCHETYPE: Record<string, number> = {
  TUNNEL_RAT: 0,
  CAVE_BAT: 1,
  SPORE_SLIME: 2,
  RUST_MITE_SWARM: 3,
  COLLAPSED_MINER: 4,
  SHARD_BEETLE: 5,
  TUNNEL_WARDEN: 6,
  BURROW_AMBUSHER: 7,
  FROST_WISP: 8,
  POWDER_TICK: 9,
  COIN_SLUG: 10,
  BLOOD_MOSQUITO: 11,
};

function getArchetypeIdFromDefinitionId(definitionId: string): number {
  return ENEMY_ID_TO_ARCHETYPE[definitionId] ?? -1;
}
