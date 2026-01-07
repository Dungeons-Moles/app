/**
 * Game reducer for PvE Dungeon Crawler
 * Pure function that applies actions to produce new state
 * @see specs/001-pve-dungeon-crawler/contracts/game-engine.md
 * @see specs/001-pve-dungeon-crawler/research.md R3
 */

import type { GameState, CombatResult, CombatantState, CombatState, Position } from './types';
import { GamePhase, CombatPhase, DEFAULT_STATUS_EFFECTS, TimePhase } from './types';
import { Direction, DIRECTION_DELTA } from '../input/types';
import { isValidTransition } from './state-machine';
import { initializeGame, consumeMoves } from './state-factory';
import { TileType, TILE_MOVE_COST, type MapEnemy } from '../map/types';
import { updateFogOfWar } from '../map/fog-of-war';
import { movePlayer } from '../entities/player';
import { createCombatState, resolveCombat } from '../combat/resolver';

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
  | { type: 'RESOLVE_COMBAT'; result: CombatResult }
  | { type: 'INTERACT_POI'; poiId: string }
  | { type: 'SELECT_POI_OPTION'; optionIndex: number }
  | { type: 'CLOSE_POI' }
  | { type: 'TRIGGER_BOSS' }
  | { type: 'END_GAME'; result: 'VICTORY' | 'DEFEAT' }
  | { type: 'RETURN_TO_MENU' };

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
      return handleResolveCombat(state, action.result);

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

  // Consume time
  newState = consumeMoves(newState, moveCost);

  // Check for enemy encounter
  if (enemyAtTarget) {
    return {
      ...newState,
      phase: GamePhase.Combat,
      // Combat state would be initialized here in full implementation
    };
  }

  // Check if boss should trigger (Night 3 complete)
  if (
    newState.time.phase === TimePhase.Boss &&
    state.time.phase === TimePhase.Night
  ) {
    return {
      ...newState,
      phase: GamePhase.BossFight,
    };
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
function handleResolveCombat(state: GameState, result: CombatResult): GameState {
  if (state.phase !== GamePhase.Combat && state.phase !== GamePhase.BossFight) {
    return state;
  }

  if (!state.combat) {
    return state;
  }

  // Update player HP from combat result
  const updatedPlayer = {
    ...state.player,
    stats: {
      ...state.player.stats,
      hp: Math.max(0, state.combat.player.hp),
    },
    statusEffects: { ...state.combat.player.statusEffects },
  };

  // Update RNG state from combat
  const updatedRngState = state.combat.rngState;

  if (result === 'DEFEAT') {
    return {
      ...state,
      phase: GamePhase.Defeat,
      player: updatedPlayer,
      rngState: updatedRngState,
      combat: { ...state.combat, result: 'DEFEAT' },
    };
  }

  // Victory - return to exploration (or victory screen for final boss)
  if (state.phase === GamePhase.BossFight && state.time.week === 3) {
    return {
      ...state,
      phase: GamePhase.Victory,
      player: updatedPlayer,
      rngState: updatedRngState,
      combat: { ...state.combat, result: 'VICTORY' },
    };
  }

  // Remove defeated enemy from map
  const enemyToRemove = findEnemyAtPlayerPosition(state);
  const updatedEnemies = enemyToRemove
    ? state.map.enemies.filter((e) => e.id !== enemyToRemove.id)
    : state.map.enemies;

  return {
    ...state,
    phase: GamePhase.Exploration,
    player: updatedPlayer,
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
 * Handles INTERACT_POI action.
 * Transitions to POIInteraction phase with specified POI.
 */
function handleInteractPOI(state: GameState, _poiId: string): GameState {
  if (!isValidTransition(state.phase, GamePhase.POIInteraction)) {
    throw new Error(
      `Invalid transition: cannot interact with POI from ${state.phase}`
    );
  }

  // TODO: Set up POI interaction state
  return {
    ...state,
    phase: GamePhase.POIInteraction,
  };
}

/**
 * Handles SELECT_POI_OPTION action.
 * Applies selected option effect within POI interaction.
 */
function handleSelectPOIOption(state: GameState, _optionIndex: number): GameState {
  if (state.phase !== GamePhase.POIInteraction) {
    return state;
  }

  // TODO: Apply option effect (grant item, heal, etc.)
  return state;
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
 */
function handleTriggerBoss(state: GameState): GameState {
  if (!isValidTransition(state.phase, GamePhase.BossFight)) {
    throw new Error(
      `Invalid transition: cannot trigger boss from ${state.phase}`
    );
  }

  // TODO: Create combat state with week boss
  return {
    ...state,
    phase: GamePhase.BossFight,
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
