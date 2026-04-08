/**
 * State Factory for PvE Dungeon Crawler
 * Creates initial game state and handles state initialization.
 * @see specs/001-pve-dungeon-crawler/data-model.md
 */

import type { GameState, Player, TimeState, BossId } from './types';
import {
  GamePhase,
  TimePhase,
  DEFAULT_STATUS_EFFECTS,
  DEFAULT_DEBUG_STATE,
  type BossSelectionMode,
  type GuestDifficultyId,
} from './types';
import type { GameMap } from '../map/types';
import { TileType, FogState } from '../map/types';
import { GAME_CONSTANTS, PHASE_MOVES } from './constants';
import { SeededRNG } from './rng';
import { generateMap, toGameMap } from '../map/generator';
import { applyInitialVisibility } from '../map/fog-of-war';
import { createPlayer } from '../entities/player';
import { selectBossForRun } from './run-config';
import { createStarterBitmask } from '../../services/solana/types/item_pool';

// ============================================================================
// Initial State Creation
// ============================================================================

/**
 * Create initial game state before game starts (at main menu).
 */
export function createInitialGameState(): GameState {
  return {
    phase: GamePhase.MainMenu,
    seed: 0,
    rngState: 0,
    campaignLevel: 1,
    bossSelectionMode: 'random',
    player: createEmptyPlayer(),
    map: createEmptyMap(),
    time: createInitialTimeState('B-A-W1-01'),
    combat: null,
    activePOI: null,
    wallHighlight: null,
    fastTravel: null,
    debug: DEFAULT_DEBUG_STATE,
    totalMoves: 0,
    enemiesDefeated: 0,
  };
}

/**
 * Initialize game state when starting a new game.
 */
export function initializeGame(
  state: GameState,
  seed: number,
  options?: {
    campaignLevel?: number;
    bossSelectionMode?: BossSelectionMode;
    guestDifficultyId?: GuestDifficultyId;
  }
): GameState {
  const rng = new SeededRNG(seed);
  const campaignLevel = options?.campaignLevel ?? state.campaignLevel ?? 1;
  const bossSelectionMode = options?.bossSelectionMode ?? state.bossSelectionMode ?? 'random';

  // Generate map
  const generated = generateMap({
    width: GAME_CONSTANTS.MAP_WIDTH,
    height: GAME_CONSTANTS.MAP_HEIGHT,
    seed,
    campaignLevel,
  });

  // Convert to GameMap
  let gameMap = toGameMap(generated);

  // Apply initial visibility
  gameMap = applyInitialVisibility(gameMap, generated.spawn);

  // Create player at spawn
  const player = createPlayer(generated.spawn, campaignLevel);

  const weekBoss = selectBossForRun(1, campaignLevel, bossSelectionMode, rng);

  // Create time state
  const time = createInitialTimeState(weekBoss);

  return {
    ...state,
    phase: GamePhase.Exploration,
    seed,
    rngState: rng.getState(),
    campaignLevel,
    bossSelectionMode,
    guestDifficultyId: options?.guestDifficultyId,
    player,
    map: gameMap,
    time,
    combat: null,
    activePOI: null,
    wallHighlight: null,
    fastTravel: null,
    totalMoves: 0,
    enemiesDefeated: 0,
    activeItemPool: state.activeItemPool ?? createStarterBitmask(),
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function createEmptyPlayer(): Player {
  return {
    position: { x: 0, y: 0 },
    baseStats: {
      hp: GAME_CONSTANTS.INITIAL_HP,
      maxHp: GAME_CONSTANTS.INITIAL_HP,
      atk: GAME_CONSTANTS.INITIAL_ATK,
      arm: GAME_CONSTANTS.INITIAL_ARM,
      spd: GAME_CONSTANTS.INITIAL_SPD,
      dig: GAME_CONSTANTS.INITIAL_DIG,
      gold: GAME_CONSTANTS.INITIAL_GOLD,
    },
    stats: {
      hp: GAME_CONSTANTS.INITIAL_HP,
      maxHp: GAME_CONSTANTS.INITIAL_HP,
      atk: GAME_CONSTANTS.INITIAL_ATK,
      arm: GAME_CONSTANTS.INITIAL_ARM,
      spd: GAME_CONSTANTS.INITIAL_SPD,
      dig: GAME_CONSTANTS.INITIAL_DIG,
      gold: GAME_CONSTANTS.INITIAL_GOLD,
    },
    equippedTool: null,
    inventory: [],
    inventoryCapacity: GAME_CONSTANTS.INITIAL_INVENTORY_SLOTS,
    statusEffects: { ...DEFAULT_STATUS_EFFECTS },
    activeItemsets: [],
    facing: 'right',
  };
}

function createEmptyMap(): GameMap {
  const width = GAME_CONSTANTS.MAP_WIDTH;
  const height = GAME_CONSTANTS.MAP_HEIGHT;

  const tiles: TileType[][] = [];
  const fog: FogState[][] = [];

  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    fog[y] = [];
    for (let x = 0; x < width; x++) {
      tiles[y][x] = TileType.Wall;
      fog[y][x] = FogState.Hidden;
    }
  }

  return {
    width,
    height,
    tiles,
    fog,
    enemies: [],
    pois: [],
    moleDenPosition: { x: 0, y: 0 },
  };
}

function createInitialTimeState(weekBoss: BossId): TimeState {
  return {
    week: 1,
    phase: TimePhase.Day,
    cycle: 1,
    movesRemaining: PHASE_MOVES[TimePhase.Day],
    weekBoss,
  };
}

// ============================================================================
// Time Transitions
// ============================================================================

/**
 * Consume moves and handle phase transitions.
 */
export function consumeMoves(state: GameState, moves: number): GameState {
  let time = { ...state.time };
  time.movesRemaining -= moves;

  // Check for phase transition
  if (time.movesRemaining <= 0) {
    time = transitionTimePhase(time, state.seed);
  }

  return {
    ...state,
    time,
  };
}

/**
 * Transition to next time phase.
 */
function transitionTimePhase(time: TimeState, seed: number): TimeState {
  const rng = new SeededRNG(seed + time.week * 100 + time.cycle * 10);

  if (time.phase === TimePhase.Day) {
    // Day -> Night
    return {
      ...time,
      phase: TimePhase.Night,
      movesRemaining: PHASE_MOVES[TimePhase.Night],
    };
  }

  if (time.phase === TimePhase.Night) {
    if (time.cycle >= GAME_CONSTANTS.CYCLES_PER_WEEK) {
      // Night 3 -> Boss
      return {
        ...time,
        phase: TimePhase.Boss,
        movesRemaining: 0,
      };
    }

    // Night -> Next Day
    return {
      ...time,
      phase: TimePhase.Day,
      cycle: (time.cycle + 1) as 1 | 2 | 3,
      movesRemaining: PHASE_MOVES[TimePhase.Day],
    };
  }

  // Boss phase doesn't transition
  return time;
}

/**
 * Advance to next week after boss defeat.
 */
export function advanceWeek(state: GameState): GameState {
  const rng = new SeededRNG(state.seed + state.time.week * 1000);

  const newWeek = Math.min(3, state.time.week + 1) as 1 | 2 | 3;
  const newBoss = selectBossForRun(newWeek, state.campaignLevel, state.bossSelectionMode, rng);

  return {
    ...state,
    time: {
      week: newWeek,
      phase: TimePhase.Day,
      cycle: 1,
      movesRemaining: PHASE_MOVES[TimePhase.Day],
      weekBoss: newBoss,
    },
  };
}
