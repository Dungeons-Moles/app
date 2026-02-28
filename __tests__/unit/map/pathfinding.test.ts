/**
 * Tests for enemy pathfinding during Night phase
 * Uses greedy step algorithm matching on-chain select_enemy_step.
 * @see T132, T133
 */

import { TileType, FogState, type GameMap, type MapEnemy } from '../../../src/game/map/types';
import {
  getNextEnemyMove,
  moveEnemiesNight,
  isAdjacent,
  isWithinSightRange,
} from '../../../src/game/map/pathfinding';
import type { Position } from '../../../src/game/engine/types';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a simple test map from string representation
 * '#' = Wall, '.' = Floor, 'P' = Player position marker
 */
function createTestMap(grid: string[]): GameMap {
  const height = grid.length;
  const width = grid[0].length;

  const tiles: TileType[][] = [];
  const fog: FogState[][] = [];

  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    fog[y] = [];
    for (let x = 0; x < width; x++) {
      const char = grid[y][x];
      tiles[y][x] = char === '#' ? TileType.Wall : TileType.Floor;
      fog[y][x] = FogState.Revealed;
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

function createEnemy(id: string, position: Position): MapEnemy {
  return {
    id,
    definitionId: 'TUNNEL_RAT',
    tier: 1,
    position,
    stats: { hp: 3, atk: 1, arm: 0, spd: 2 },
    discovered: false,
  };
}

// ============================================================================
// getNextEnemyMove Tests (greedy step algorithm)
// ============================================================================

describe('getNextEnemyMove', () => {
  it('returns next step toward player (x-axis priority)', () => {
    const map = createTestMap([
      '#####',
      '#...#',
      '#####',
    ]);
    const enemy = createEnemy('enemy1', { x: 1, y: 1 });
    const playerPosition = { x: 3, y: 1 };

    const nextMove = getNextEnemyMove(map, enemy, playerPosition, []);

    expect(nextMove).toEqual({ x: 2, y: 1 });
  });

  it('returns null when wall blocks and no alternative axis', () => {
    const map = createTestMap([
      '#####',
      '#.#.#',
      '#####',
    ]);
    const enemy = createEnemy('enemy1', { x: 1, y: 1 });
    const playerPosition = { x: 3, y: 1 };

    const nextMove = getNextEnemyMove(map, enemy, playerPosition, []);

    // dx=2, dy=0. Only xStep=(2,1) which is wall. yStep=null. No valid move.
    expect(nextMove).toBeNull();
  });

  it('returns player position when adjacent', () => {
    const map = createTestMap([
      '#####',
      '#...#',
      '#####',
    ]);
    const enemy = createEnemy('enemy1', { x: 2, y: 1 });
    const playerPosition = { x: 3, y: 1 };

    const nextMove = getNextEnemyMove(map, enemy, playerPosition, []);

    expect(nextMove).toEqual({ x: 3, y: 1 });
  });

  it('falls back to secondary axis when primary is blocked', () => {
    const map = createTestMap([
      '#####',
      '#.#.#',
      '#...#',
      '#####',
    ]);
    const enemy = createEnemy('enemy1', { x: 1, y: 1 });
    const playerPosition = { x: 3, y: 2 };

    const nextMove = getNextEnemyMove(map, enemy, playerPosition, []);

    // dx=2, dy=1. |dx|>=|dy| so xStep=(2,1) tried first = wall.
    // Falls back to yStep=(1,2) = floor. Returns (1,2).
    expect(nextMove).toEqual({ x: 1, y: 2 });
  });

  it('prioritizes y-axis when dy > dx', () => {
    const map = createTestMap([
      '#####',
      '#...#',
      '#...#',
      '#...#',
      '#####',
    ]);
    const enemy = createEnemy('enemy1', { x: 1, y: 1 });
    const playerPosition = { x: 2, y: 3 };

    const nextMove = getNextEnemyMove(map, enemy, playerPosition, []);

    // dx=1, dy=2. |dy|>|dx| so yStep=(1,2) tried first = floor.
    expect(nextMove).toEqual({ x: 1, y: 2 });
  });

  it('avoids tiles occupied by other enemies', () => {
    const map = createTestMap([
      '#####',
      '#...#',
      '#...#',
      '#####',
    ]);
    const enemy = createEnemy('enemy1', { x: 1, y: 1 });
    const otherEnemy = createEnemy('enemy2', { x: 2, y: 1 });
    const playerPosition = { x: 3, y: 1 };

    const nextMove = getNextEnemyMove(map, enemy, playerPosition, [enemy, otherEnemy]);

    // dx=2, dy=0. xStep=(2,1) is occupied by enemy2. yStep=null (dy=0). No valid move.
    expect(nextMove).toBeNull();
  });
});

// ============================================================================
// moveEnemiesNight Tests
// ============================================================================

describe('moveEnemiesNight', () => {
  it('moves enemies within Chebyshev distance 1-3 toward player', () => {
    const map = createTestMap([
      '#######',
      '#.....#',
      '#######',
    ]);
    map.enemies = [createEnemy('enemy1', { x: 3, y: 1 })];
    const playerPosition = { x: 5, y: 1 };

    // Chebyshev distance = max(|3-5|,|1-1|) = 2, within range 1-3
    const result = moveEnemiesNight(map, playerPosition, playerPosition);

    expect(result.updatedEnemies).toHaveLength(1);
    expect(result.updatedEnemies[0].position).toEqual({ x: 4, y: 1 });
    expect(result.combatTriggered).toBeNull();
  });

  it('does not move enemies outside Chebyshev distance 3', () => {
    const map = createTestMap([
      '#########',
      '#.......#',
      '#########',
    ]);
    map.enemies = [createEnemy('enemy1', { x: 1, y: 1 })];
    const playerPosition = { x: 7, y: 1 };

    // Chebyshev distance = max(|1-7|,|1-1|) = 6, out of range
    const result = moveEnemiesNight(map, playerPosition, playerPosition);

    expect(result.updatedEnemies[0].position).toEqual({ x: 1, y: 1 });
    expect(result.combatTriggered).toBeNull();
  });

  it('triggers combat when enemy reaches player', () => {
    const map = createTestMap([
      '#####',
      '#...#',
      '#####',
    ]);
    map.enemies = [createEnemy('enemy1', { x: 2, y: 1 })];
    const playerPosition = { x: 3, y: 1 };

    const result = moveEnemiesNight(map, playerPosition, playerPosition);

    expect(result.combatTriggered).toBe('enemy1');
    expect(result.updatedEnemies[0].position).toEqual({ x: 3, y: 1 });
  });

  it('only first enemy can reach player tile (playerTileBlocked)', () => {
    const map = createTestMap([
      '#######',
      '#.....#',
      '#######',
    ]);
    map.enemies = [
      createEnemy('enemy1', { x: 4, y: 1 }),
      createEnemy('enemy2', { x: 3, y: 1 }),
    ];
    const playerPosition = { x: 5, y: 1 };

    // Sorted by id: enemy1 first (x=4), then enemy2 (x=3)
    // enemy1: Chebyshev=1, steps to (5,1) = player. playerTileBlocked = true.
    // enemy2: Chebyshev=2, xStep=(4,1) which enemy1 vacated. Moves to (4,1).
    const result = moveEnemiesNight(map, playerPosition, playerPosition);

    expect(result.combatTriggered).toBe('enemy1');
    const enemy1 = result.updatedEnemies.find((e) => e.id === 'enemy1');
    const enemy2 = result.updatedEnemies.find((e) => e.id === 'enemy2');
    expect(enemy1!.position).toEqual({ x: 5, y: 1 });
    expect(enemy2!.position).toEqual({ x: 4, y: 1 });
  });

  it('processes enemies in deterministic order (sorted by id)', () => {
    const map = createTestMap([
      '#######',
      '#.....#',
      '#.....#',
      '#######',
    ]);
    map.enemies = [
      createEnemy('enemy2', { x: 3, y: 1 }),
      createEnemy('enemy1', { x: 3, y: 2 }),
    ];
    const playerPosition = { x: 5, y: 1 };

    const map2 = {
      ...map,
      enemies: [
        createEnemy('enemy2', { x: 3, y: 1 }),
        createEnemy('enemy1', { x: 3, y: 2 }),
      ],
    };

    const result1 = moveEnemiesNight(map, playerPosition, playerPosition);
    const result2 = moveEnemiesNight(map2, playerPosition, playerPosition);

    expect(
      result1.updatedEnemies.map((e) => ({ id: e.id, pos: e.position }))
    ).toEqual(result2.updatedEnemies.map((e) => ({ id: e.id, pos: e.position })));
  });

  it('keeps enemy in place when blocked by wall', () => {
    const map = createTestMap([
      '#####',
      '#.#.#',
      '#####',
    ]);
    map.enemies = [createEnemy('enemy1', { x: 1, y: 1 })];
    const playerPosition = { x: 3, y: 1 };

    // Chebyshev = 2, in range. But wall at (2,1) and dy=0, so no valid move.
    const result = moveEnemiesNight(map, playerPosition, playerPosition);

    expect(result.updatedEnemies[0].position).toEqual({ x: 1, y: 1 });
    expect(result.combatTriggered).toBeNull();
  });

  it('handles multiple enemies without collision', () => {
    const map = createTestMap([
      '#######',
      '#.....#',
      '#######',
    ]);
    map.enemies = [
      createEnemy('enemy1', { x: 3, y: 1 }),
      createEnemy('enemy2', { x: 4, y: 1 }),
    ];
    const playerPosition = { x: 5, y: 1 };

    // enemy1: Chebyshev=2, enemy2: Chebyshev=1. Both in range.
    const result = moveEnemiesNight(map, playerPosition, playerPosition);

    const positions = result.updatedEnemies.map((e) => e.position);
    const positionStrings = positions.map((p) => `${p.x},${p.y}`);

    // No duplicate positions
    const uniquePositions = new Set(positionStrings);
    expect(uniquePositions.size).toBe(positions.length);
  });

  it('updates occupied grid as enemies move', () => {
    const map = createTestMap([
      '#######',
      '#.....#',
      '#######',
    ]);
    map.enemies = [
      createEnemy('enemy1', { x: 4, y: 1 }),
      createEnemy('enemy2', { x: 3, y: 1 }),
    ];
    const playerPosition = { x: 5, y: 1 };

    // Sorted by id: enemy1 (x=4) first, enemy2 (x=3) second.
    // enemy1 moves to (5,1) player tile. Vacates (4,1).
    // enemy2 can now move to (4,1) since enemy1 left.
    const result = moveEnemiesNight(map, playerPosition, playerPosition);

    const enemy2 = result.updatedEnemies.find((e) => e.id === 'enemy2');
    expect(enemy2!.position).toEqual({ x: 4, y: 1 });
  });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('isAdjacent', () => {
  it('returns true for adjacent positions', () => {
    expect(isAdjacent({ x: 1, y: 1 }, { x: 2, y: 1 })).toBe(true);
    expect(isAdjacent({ x: 1, y: 1 }, { x: 0, y: 1 })).toBe(true);
    expect(isAdjacent({ x: 1, y: 1 }, { x: 1, y: 2 })).toBe(true);
    expect(isAdjacent({ x: 1, y: 1 }, { x: 1, y: 0 })).toBe(true);
  });

  it('returns false for non-adjacent positions', () => {
    expect(isAdjacent({ x: 1, y: 1 }, { x: 3, y: 1 })).toBe(false);
    expect(isAdjacent({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(false);
    expect(isAdjacent({ x: 1, y: 1 }, { x: 2, y: 2 })).toBe(false);
  });
});

describe('isWithinSightRange', () => {
  it('returns true when within range', () => {
    expect(isWithinSightRange({ x: 2, y: 2 }, { x: 1, y: 1 }, 3)).toBe(true);
    expect(isWithinSightRange({ x: 4, y: 1 }, { x: 1, y: 1 }, 3)).toBe(true);
    expect(isWithinSightRange({ x: 1, y: 4 }, { x: 1, y: 1 }, 3)).toBe(true);
  });

  it('returns false when outside range', () => {
    expect(isWithinSightRange({ x: 5, y: 1 }, { x: 1, y: 1 }, 3)).toBe(false);
    expect(isWithinSightRange({ x: 1, y: 5 }, { x: 1, y: 1 }, 3)).toBe(false);
  });

  it('returns true when exactly at range boundary', () => {
    expect(isWithinSightRange({ x: 4, y: 1 }, { x: 1, y: 1 }, 3)).toBe(true);
    expect(isWithinSightRange({ x: 2, y: 3 }, { x: 1, y: 1 }, 3)).toBe(true);
  });
});
