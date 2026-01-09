import { gameReducer } from '../../src/game/engine/game-reducer';
import { createInitialGameState } from '../../src/game/engine/state-factory';
import { Direction } from '../../src/game/input/types';
import { calculateWallBreakCost } from '../../src/game/map/wall-break';
import { TileType } from '../../src/game/map/types';

const TEST_SEED = 4242;

const DIRECTION_OFFSETS = [
  { direction: Direction.Up, dx: 0, dy: -1 },
  { direction: Direction.Down, dx: 0, dy: 1 },
  { direction: Direction.Left, dx: -1, dy: 0 },
  { direction: Direction.Right, dx: 1, dy: 0 },
] as const;

function findBreakTarget(state: ReturnType<typeof gameReducer>) {
  const { x, y } = state.player.position;
  for (const entry of DIRECTION_OFFSETS) {
    const targetX = x + entry.dx;
    const targetY = y + entry.dy;
    if (
      targetX > 0 &&
      targetX < state.map.width - 1 &&
      targetY > 0 &&
      targetY < state.map.height - 1
    ) {
      return {
        direction: entry.direction,
        position: { x: targetX, y: targetY },
      };
    }
  }

  throw new Error('No breakable adjacent tile found for wall break test.');
}

describe('Wall Break Integration', () => {
  it('executes double-tap flow to break a wall', () => {
    const initialState = createInitialGameState();
    let state = gameReducer(initialState, { type: 'START_GAME', seed: TEST_SEED });

    const { direction, position } = findBreakTarget(state);
    const tiles = state.map.tiles.map(row => [...row]);
    tiles[position.y][position.x] = TileType.Wall;

    state = {
      ...state,
      player: {
        ...state.player,
        baseStats: { ...state.player.baseStats, dig: 2 },
        stats: { ...state.player.stats, dig: 2 },
      },
      time: {
        ...state.time,
        movesRemaining: 10,
      },
      map: {
        ...state.map,
        tiles,
      },
    };

    const highlighted = gameReducer(state, { type: 'MOVE', direction });
    expect(highlighted.wallHighlight).not.toBeNull();

    const afterBreak = gameReducer(highlighted, { type: 'MOVE', direction });
    const cost = calculateWallBreakCost(2) ?? 0;

    expect(afterBreak.map.tiles[position.y][position.x]).toBe(TileType.Floor);
    expect(afterBreak.time.movesRemaining).toBe(highlighted.time.movesRemaining - cost);
  });
});
