import { gameReducer } from '../../src/game/engine/game-reducer';
import { createInitialGameState } from '../../src/game/engine/state-factory';
import { GamePhase, TimePhase } from '../../src/game/engine/types';
import { createPlayer } from '../../src/game/entities/player';
import { Direction } from '../../src/game/input/types';
import { calculateDigCost } from '../../src/game/map/dig';
import { FogState, GameMap, TileType } from '../../src/game/map/types';

function createTestMap(): GameMap {
  const width = 5;
  const height = 5;
  const tiles: TileType[][] = [];
  const fog: FogState[][] = [];

  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    fog[y] = [];
    for (let x = 0; x < width; x++) {
      tiles[y][x] = TileType.Floor;
      fog[y][x] = FogState.Visible;
    }
  }

  // Perimeter wall for canBreakWall checks
  tiles[0][0] = TileType.Wall;
  // Interior wall north of player
  tiles[1][2] = TileType.Wall;

  return {
    width,
    height,
    tiles,
    fog,
    enemies: [],
    pois: [],
    moleDenPosition: { x: 2, y: 1 },
  };
}

function createTestState({ dig = 2, moves = 10 }: { dig?: number; moves?: number } = {}) {
  const baseState = createInitialGameState();
  const player = createPlayer({ x: 2, y: 2 });
  const map = createTestMap();

  return {
    ...baseState,
    phase: GamePhase.Exploration,
    player: {
      ...player,
      baseStats: { ...player.baseStats, dig },
      stats: { ...player.stats, dig },
    },
    map,
    time: {
      ...baseState.time,
      phase: TimePhase.Day,
      movesRemaining: moves,
    },
    wallHighlight: null,
    fastTravel: null,
  };
}

describe('Wall Break', () => {
  describe('Cost Calculation', () => {
    it('returns null for DIG 0', () => {
      expect(calculateDigCost(0)).toBeNull();
    });

    it('returns expected costs for DIG 1-5+ (formula: max(2, 6 - DIG))', () => {
      expect(calculateDigCost(1)).toBe(5);
      expect(calculateDigCost(2)).toBe(4);
      expect(calculateDigCost(3)).toBe(3);
      expect(calculateDigCost(4)).toBe(2);
      expect(calculateDigCost(5)).toBe(2); // minimum cost
      expect(calculateDigCost(10)).toBe(2); // minimum cost
    });
  });

  describe('State Machine', () => {
    it('highlights wall on first tap toward a wall', () => {
      const state = createTestState({ dig: 2, moves: 10 });
      const next = gameReducer(state, { type: 'MOVE', direction: Direction.Up });

      expect(next.wallHighlight).toEqual({
        targetPosition: { x: 2, y: 1 },
        direction: Direction.Up,
        cost: 4, // max(2, 6 - 2) = 4
      });
      expect(next.player.position).toEqual(state.player.position);
      expect(next.time.movesRemaining).toBe(state.time.movesRemaining);
    });

    it('breaks highlighted wall on second tap and consumes moves', () => {
      const state = createTestState({ dig: 2, moves: 10 });
      const highlighted = gameReducer(state, { type: 'MOVE', direction: Direction.Up });
      const afterBreak = gameReducer(highlighted, { type: 'MOVE', direction: Direction.Up });

      expect(afterBreak.wallHighlight).toBeNull();
      expect(afterBreak.map.tiles[1][2]).toBe(TileType.Floor);
      expect(afterBreak.time.movesRemaining).toBe(6); // 10 - 4 = 6
      expect(afterBreak.player.position).toEqual({ x: 2, y: 1 });
    });

    it('cancels highlight when moving a different direction', () => {
      const state = createTestState({ dig: 2, moves: 10 });
      const highlighted = gameReducer(state, { type: 'MOVE', direction: Direction.Up });
      const afterMove = gameReducer(highlighted, { type: 'MOVE', direction: Direction.Right });

      expect(afterMove.wallHighlight).toBeNull();
      expect(afterMove.player.position).toEqual({ x: 3, y: 2 });
      expect(afterMove.time.movesRemaining).toBe(9);
    });

    it('does not highlight wall when DIG is 0', () => {
      const state = createTestState({ dig: 0, moves: 10 });
      const next = gameReducer(state, { type: 'MOVE', direction: Direction.Up });

      expect(next.wallHighlight).toBeNull();
      expect(next.player.position).toEqual(state.player.position);
      expect(next.time.movesRemaining).toBe(state.time.movesRemaining);
    });

    it('does not break wall when moves are insufficient (Night 3, cannot span phases)', () => {
      // Night 3 cannot span to another phase, so we need exactly enough moves
      const state = createTestState({ dig: 1, moves: 2 });
      // Set to Night 3 (which cannot span to another phase)
      const stateNight3 = {
        ...state,
        time: {
          ...state.time,
          phase: TimePhase.Night,
          cycle: 3 as 1 | 2 | 3,
          movesRemaining: 2,
        },
      };
      const highlighted = gameReducer(stateNight3, { type: 'MOVE', direction: Direction.Up });
      const afterBreak = gameReducer(highlighted, { type: 'MOVE', direction: Direction.Up });

      // Wall should NOT be broken because Night 3 only has 2 moves and cost is 5
      expect(afterBreak.map.tiles[1][2]).toBe(TileType.Wall);
      expect(afterBreak.time.movesRemaining).toBe(2);
      expect(afterBreak.wallHighlight).toEqual(highlighted.wallHighlight);
    });

    it('breaks wall by spanning moves across day-to-night transition', () => {
      // Day phase with only 3 moves, wall costs 5 (DIG=1)
      // Should span: 3 from Day + 2 from Night = 5 total
      const state = createTestState({ dig: 1, moves: 3 });
      const highlighted = gameReducer(state, { type: 'MOVE', direction: Direction.Up });
      const afterBreak = gameReducer(highlighted, { type: 'MOVE', direction: Direction.Up });

      // Wall SHOULD be broken by spanning phases
      expect(afterBreak.map.tiles[1][2]).toBe(TileType.Floor);
      // Should have transitioned to Night with (30 - 2) = 28 moves remaining
      expect(afterBreak.time.phase).toBe(TimePhase.Night);
      expect(afterBreak.time.movesRemaining).toBe(28);
      expect(afterBreak.player.position).toEqual({ x: 2, y: 1 });
    });

    it('breaks wall by spanning moves across night-to-day transition', () => {
      // Night 1 with only 3 moves, wall costs 5 (DIG=1)
      // Should span: 3 from Night + 2 from Day = 5 total
      const state = createTestState({ dig: 1, moves: 3 });
      const stateNight1 = {
        ...state,
        time: {
          ...state.time,
          phase: TimePhase.Night,
          cycle: 1 as 1 | 2 | 3,
          movesRemaining: 3,
        },
      };
      const highlighted = gameReducer(stateNight1, { type: 'MOVE', direction: Direction.Up });
      const afterBreak = gameReducer(highlighted, { type: 'MOVE', direction: Direction.Up });

      // Wall SHOULD be broken by spanning phases
      expect(afterBreak.map.tiles[1][2]).toBe(TileType.Floor);
      // Should have transitioned to Day 2 with (50 - 2) = 48 moves remaining
      expect(afterBreak.time.phase).toBe(TimePhase.Day);
      expect(afterBreak.time.cycle).toBe(2);
      expect(afterBreak.time.movesRemaining).toBe(48);
      expect(afterBreak.player.position).toEqual({ x: 2, y: 1 });
    });
  });
});
