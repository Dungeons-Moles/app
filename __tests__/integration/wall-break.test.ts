import { gameReducer } from '../../src/game/engine/game-reducer';
import { createInitialGameState } from '../../src/game/engine/state-factory';
import { Direction } from '../../src/game/input/types';
import { calculateDigCost, canDig } from '../../src/game/map/dig';
import { TileType } from '../../src/game/map/types';
import type { GameState } from '../../src/game/engine/types';

const TEST_SEED = 4242;

const DIRECTION_OFFSETS = [
  { direction: Direction.Up, dx: 0, dy: -1 },
  { direction: Direction.Down, dx: 0, dy: 1 },
  { direction: Direction.Left, dx: -1, dy: 0 },
  { direction: Direction.Right, dx: 1, dy: 0 },
] as const;

function findDiggableSetup(state: GameState) {
  for (let y = 1; y < state.map.height - 1; y++) {
    for (let x = 1; x < state.map.width - 1; x++) {
      // Find a diggable wall
      if (canDig(state.map, { x, y })) {
        // Find adjacent floor to stand on
        for (const entry of DIRECTION_OFFSETS) {
          const px = x - entry.dx; // Player position (reverse of direction)
          const py = y - entry.dy;
          if (state.map.tiles[py]?.[px] === TileType.Floor) {
            return {
              playerPos: { x: px, y: py },
              direction: entry.direction,
              targetPos: { x, y },
            };
          }
        }
      }
    }
  }
  return null;
}

describe('Wall Break Integration', () => {
  it('highlights and breaks a wall', () => {
    let state = createInitialGameState();
    // Initialize game to generate map
    state = gameReducer(state, { type: 'START_GAME', seed: TEST_SEED });

    const setup = findDiggableSetup(state);

    expect(setup).not.toBeNull();
    if (!setup) return;

    // Move player to setup position
    state = {
      ...state,
      player: {
        ...state.player,
        position: setup.playerPos,
      },
    };

    // 1. Highlight
    const highlightedState = gameReducer(state, {
      type: 'MOVE',
      direction: setup.direction,
    });

    expect(highlightedState.wallHighlight).not.toBeNull();
    expect(highlightedState.wallHighlight?.direction).toBe(setup.direction);

    // 2. Break
    const afterBreak = gameReducer(highlightedState, {
      type: 'MOVE',
      direction: setup.direction,
    });

    // Verify wall is gone
    const { x, y } = setup.targetPos;
    expect(afterBreak.map.tiles[y][x]).toBe(TileType.Floor);

    // Verify time consumed
    const cost = calculateDigCost(state.player.stats.dig) ?? 0;
    expect(afterBreak.time.movesRemaining).toBe(state.time.movesRemaining - cost);
  });
});
