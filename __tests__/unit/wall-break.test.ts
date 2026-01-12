import { gameReducer } from '../../src/game/engine/game-reducer';
import { createInitialGameState } from '../../src/game/engine/state-factory';
import { GamePhase, TimePhase } from '../../src/game/engine/types';
import { createPlayer } from '../../src/game/entities/player';
import { Direction } from '../../src/game/input/types';
import { calculateWallBreakCost } from '../../src/game/map/wall-break';
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
      expect(calculateWallBreakCost(0)).toBeNull();
    });

    it('returns expected costs for DIG 1-5+ (formula: max(2, 6 - DIG))', () => {
      expect(calculateWallBreakCost(1)).toBe(5);
      expect(calculateWallBreakCost(2)).toBe(4);
      expect(calculateWallBreakCost(3)).toBe(3);
      expect(calculateWallBreakCost(4)).toBe(2);
      expect(calculateWallBreakCost(5)).toBe(2); // minimum cost
      expect(calculateWallBreakCost(10)).toBe(2); // minimum cost
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

    it('does not break wall when moves are insufficient', () => {
      const state = createTestState({ dig: 1, moves: 2 });
      const highlighted = gameReducer(state, { type: 'MOVE', direction: Direction.Up });
      const afterBreak = gameReducer(highlighted, { type: 'MOVE', direction: Direction.Up });

      expect(afterBreak.map.tiles[1][2]).toBe(TileType.Wall);
      expect(afterBreak.time.movesRemaining).toBe(2);
      expect(afterBreak.wallHighlight).toEqual(highlighted.wallHighlight);
    });
  });
});
