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
} from './types';
import { GamePhase, CombatPhase, DEFAULT_STATUS_EFFECTS, TimePhase } from './types';
import { Direction, DIRECTION_DELTA } from '../input/types';
import { isValidTransition } from './state-machine';
import { initializeGame, consumeMoves } from './state-factory';
import { GAME_CONSTANTS } from './constants';
import { TileType, TILE_MOVE_COST, type MapEnemy } from '../map/types';
import { updateFogOfWar } from '../map/fog-of-war';
import {
  movePlayer,
  equipTool,
  addGearToInventory,
  removeGearFromInventory,
  removeGearById,
  increaseInventoryCapacity,
  addGold,
  removeGold,
} from '../entities/player';
import { createCombatState } from '../combat/resolver';
import {
  consumeMove,
  advanceTimePhase,
  shouldTriggerBoss,
} from '../time/progression';
import {
  createPOIInteraction,
  applyPOIOption,
  markPOIVisited,
  markPOIDiscovered,
  findPOIAtPosition,
  activateSurveyBeacon,
} from '../entities/pois';
import { moveEnemiesNight, isWithinSightRange } from '../map/pathfinding';
import { SIGHT_RADIUS } from './constants';
import { RARITY_MULTIPLIER } from '../../data/gear';

// ============================================================================
// Game Actions
// ============================================================================

/**
 * All possible game actions as a discriminated union.
 * Per research.md R3: Using typed actions for state machine transitions.
 */
export type GameAction =
  | { type: 'START_GAME'; seed: number }
  | { type: 'MOVE'; direction: Direction }
  | { type: 'ENTER_COMBAT'; enemyId: string }
  | { type: 'RESOLVE_COMBAT'; result: CombatResult; combat?: CombatState }
  | { type: 'INTERACT_POI'; poiId: string }
  | { type: 'SELECT_POI_OPTION'; optionIndex: number }
  | { type: 'CLOSE_POI' }
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
  | { type: 'SPEND_GOLD'; amount: number };

// ============================================================================
// Action Type Guards
// ============================================================================

export function isStartGameAction(
  action: GameAction
): action is { type: 'START_GAME'; seed: number } {
  return action.type === 'START_GAME';
}

export function isMoveAction(
  action: GameAction
): action is { type: 'MOVE'; direction: Direction } {
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
      return handleStartGame(state, action.seed);

    case 'MOVE':
      return handleMove(state, action.direction);

    case 'ENTER_COMBAT':
      return handleEnterCombat(state, action.enemyId);

    case 'RESOLVE_COMBAT':
      return handleResolveCombat(state, action.result, action.combat);

    case 'INTERACT_POI':
      return handleInteractPOI(state, action.poiId);

    case 'SELECT_POI_OPTION':
      return handleSelectPOIOption(state, action.optionIndex);

    case 'CLOSE_POI':
      return handleClosePOI(state);

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
function handleStartGame(state: GameState, seed: number): GameState {
  if (!isValidTransition(state.phase, GamePhase.Exploration)) {
    throw new Error(
      `Invalid transition: cannot start game from ${state.phase}`
    );
  }

  // Initialize game with seed (map generation, player setup, etc.)
  return initializeGame(state, seed);
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

  // Check if tile is walkable
  const targetTile = state.map.tiles[targetPos.y][targetPos.x];
  if (targetTile === TileType.Wall) {
    return state; // Can't move into wall
  }

  // Get move cost
  const moveCost = TILE_MOVE_COST[targetTile];

  // Check for enemy at target position
  const enemyAtTarget = state.map.enemies.find(
    e => e.position.x === targetPos.x && e.position.y === targetPos.y
  );

  // Move player
  let newState = {
    ...state,
    player: movePlayer(state.player, targetPos),
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
  const isDayStart = newState.time.phase === TimePhase.Night && advancedTime.phase === TimePhase.Day;
  if (isDayStart) {
    const nuggetSlots = updatedPlayer.inventory.filter((slot) => slot.item.id === 'I8');
    const goldGain = nuggetSlots.reduce(
      (sum, slot) => sum + Math.floor(3 * RARITY_MULTIPLIER[slot.item.currentRarity]),
      0
    );
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
    return {
      ...newState,
      time: {
        ...advancedTime,
        phase: TimePhase.Boss,
      },
      phase: GamePhase.BossFight,
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
 * T052: Handles ENTER_COMBAT action.
 * Transitions to Combat phase with specified enemy.
 * Creates combat state from player and enemy.
 */
function handleEnterCombat(state: GameState, enemyId: string): GameState {
  if (!isValidTransition(state.phase, GamePhase.Combat)) {
    throw new Error(
      `Invalid transition: cannot enter combat from ${state.phase}`
    );
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
  const enemyEmojis: Record<string, string> = {
    TUNNEL_RAT: '🐀',
    CAVE_BAT: '🦇',
    SPORE_SLIME: '🟢',
    RUST_MITE_SWARM: '🐜',
    COLLAPSED_MINER: '🧟',
    SHARD_BEETLE: '🪲',
    TUNNEL_WARDEN: '🦀',
    BURROW_AMBUSHER: '🦂',
  };

  const enemyNames: Record<string, string> = {
    TUNNEL_RAT: 'Tunnel Rat',
    CAVE_BAT: 'Cave Bat',
    SPORE_SLIME: 'Spore Slime',
    RUST_MITE_SWARM: 'Rust Mite Swarm',
    COLLAPSED_MINER: 'Collapsed Miner',
    SHARD_BEETLE: 'Shard Beetle',
    TUNNEL_WARDEN: 'Tunnel Warden',
    BURROW_AMBUSHER: 'Burrow Ambusher',
  };

  return {
    name: enemyNames[enemy.definitionId] || enemy.definitionId,
    emoji: enemyEmojis[enemy.definitionId] || '👾',
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

  // Update player HP from combat result
  let updatedPlayer = {
    ...state.player,
    stats: {
      ...state.player.stats,
      hp: Math.max(0, combatState.player.hp),
      gold: combatState.playerGold,
    },
    statusEffects: { ...combatState.player.statusEffects },
  };

  if (combatState.consumedGearIds.length > 0) {
    for (const gearId of combatState.consumedGearIds) {
      const removal = removeGearById(updatedPlayer, gearId);
      updatedPlayer = removal.player;
    }
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

  return {
    ...state,
    phase: GamePhase.Exploration,
    player: {
      ...updatedPlayer,
      inventoryCapacity: bossSlotBonus,
    },
    rngState: updatedRngState,
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
    (e) =>
      e.position.x === state.player.position.x &&
      e.position.y === state.player.position.y
  );
}

/**
 * T099: Handles INTERACT_POI action.
 * Transitions to POIInteraction phase with specified POI.
 * Creates POI interaction state with generated options.
 */
function handleInteractPOI(state: GameState, poiId: string): GameState {
  if (!isValidTransition(state.phase, GamePhase.POIInteraction)) {
    throw new Error(
      `Invalid transition: cannot interact with POI from ${state.phase}`
    );
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

  // Update the selected option
  newState = {
    ...newState,
    activePOI: newState.activePOI
      ? { ...newState.activePOI, selectedOption: optionIndex }
      : null,
  };

  // Mark POI as visited (except for shops that can be reused)
  const poiId = state.activePOI.poi.id;
  const poiDefId = state.activePOI.poi.definitionId;
  const isReusablePOI = ['L8', 'L9', 'L10', 'L11'].includes(poiDefId);

  if (!isReusablePOI && !option.label.includes('Reroll')) {
    newState = {
      ...newState,
      map: markPOIVisited(newState.map, poiId),
    };
    // Close POI after using it (for non-reusable POIs)
    return handleClosePOI(newState);
  }

  // For reusable POIs, stay in interaction mode (shops, waypoints, etc.)
  // unless they explicitly chose Leave
  return newState;
}

/**
 * Handles CLOSE_POI action.
 * Returns from POI interaction to exploration.
 */
function handleClosePOI(state: GameState): GameState {
  if (!isValidTransition(state.phase, GamePhase.Exploration)) {
    return state;
  }

  return {
    ...state,
    phase: GamePhase.Exploration,
    activePOI: null,
  };
}

/**
 * Handles TRIGGER_BOSS action.
 * Transitions to BossFight phase at end of week.
 * @see T067: Add TRIGGER_BOSS action to game reducer
 */
function handleTriggerBoss(state: GameState): GameState {
  if (!isValidTransition(state.phase, GamePhase.BossFight)) {
    throw new Error(
      `Invalid transition: cannot trigger boss from ${state.phase}`
    );
  }

  // Update time to Boss phase
  const bossTime: TimeState = {
    ...state.time,
    phase: TimePhase.Boss,
    movesRemaining: 0,
  };

  // TODO: Create combat state with week boss using BOSSES[state.time.weekBoss]
  return {
    ...state,
    phase: GamePhase.BossFight,
    time: bossTime,
  };
}

/**
 * Handles END_GAME action.
 * Transitions to Victory or Defeat phase.
 */
function handleEndGame(
  state: GameState,
  result: 'VICTORY' | 'DEFEAT'
): GameState {
  const targetPhase = result === 'VICTORY' ? GamePhase.Victory : GamePhase.Defeat;

  if (!isValidTransition(state.phase, targetPhase)) {
    throw new Error(
      `Invalid transition: cannot end game with ${result} from ${state.phase}`
    );
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
    throw new Error(
      `Invalid transition: cannot return to menu from ${state.phase}`
    );
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
  const enemiesInRange = state.map.enemies.filter(enemy =>
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
  const { updatedEnemies, combatTriggered } = moveEnemiesNight(
    mapForPathfinding,
    playerPos
  );

  // Merge updated enemy positions back into full enemy list
  const updatedEnemyMap = new Map(updatedEnemies.map(e => [e.id, e]));
  const finalEnemies = state.map.enemies.map(enemy =>
    updatedEnemyMap.get(enemy.id) || enemy
  );

  // Create new state with updated enemies
  let newState: GameState = {
    ...state,
    map: {
      ...state.map,
      enemies: finalEnemies,
    },
  };

  // If an enemy reached the player, trigger combat
  if (combatTriggered) {
    const attackingEnemy = finalEnemies.find(e => e.id === combatTriggered);
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
        playerGold: newState.player.stats.gold,
      });

      return {
        ...newState,
        phase: GamePhase.Combat,
        combat: combatState,
      };
    }
  }

  return newState;
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
