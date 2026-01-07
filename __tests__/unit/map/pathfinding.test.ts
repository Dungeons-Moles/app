/**
 * Tests for enemy pathfinding during Night phase
 * @see T132, T133
 */

import { SeededRNG } from '../../../src/game/engine/rng';
import { TileType, FogState, type GameMap, type MapEnemy } from '../../../src/game/map/types';
import {
  findPath,
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
 * '#' = Wall, '.' = Empty Tunnel, 'P' = Player position marker
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
      tiles[y][x] = char === '#' ? TileType.Wall : TileType.EmptyTunnel;
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
  };
}

// ============================================================================
// findPath Tests
// ============================================================================

describe('findPath', () => {
  it('finds direct path in open corridor', () => {
    const map = createTestMap([
      '#####',
      '#...#',
      '#####',
    ]);
    const rng = new SeededRNG(12345);

    const path = findPath(map, { x: 1, y: 1 }, { x: 3, y: 1 }, [], rng);

    expect(path).toHaveLength(2);
    expect(path[0]).toEqual({ x: 2, y: 1 });
    expect(path[1]).toEqual({ x: 3, y: 1 });
  });

  it('returns empty array when start equals goal', () => {
    const map = createTestMap([
      '#####',
      '#...#',
      '#####',
    ]);
    const rng = new SeededRNG(12345);

    const path = findPath(map, { x: 1, y: 1 }, { x: 1, y: 1 }, [], rng);

    expect(path).toHaveLength(0);
  });

  it('finds path around obstacles', () => {
    const map = createTestMap([
      '#####',
      '#.#.#',
      '#...#',
      '#####',
    ]);
    const rng = new SeededRNG(12345);

    const path = findPath(map, { x: 1, y: 1 }, { x: 3, y: 1 }, [], rng);

    // Should go down, right, right, up
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual({ x: 3, y: 1 });
  });

  it('returns empty array when no path exists', () => {
    const map = createTestMap([
      '#####',
      '#.#.#',
      '#####',
    ]);
    const rng = new SeededRNG(12345);

    const path = findPath(map, { x: 1, y: 1 }, { x: 3, y: 1 }, [], rng);

    expect(path).toHaveLength(0);
  });

  it('avoids tiles occupied by other enemies', () => {
    const map = createTestMap([
      '#####',
      '#...#',
      '#####',
    ]);
    const enemies = [
      createEnemy('enemy1', { x: 2, y: 1 }),
    ];
    const rng = new SeededRNG(12345);

    const path = findPath(map, { x: 1, y: 1 }, { x: 3, y: 1 }, enemies, rng);

    // Should not be able to pass through occupied tile
    // In a single-row corridor, no path exists
    expect(path).toHaveLength(0);
  });

  it('allows path to goal even if occupied (player position)', () => {
    const map = createTestMap([
      '#####',
      '#...#',
      '#####',
    ]);
    // Enemy at middle position
    const enemies = [createEnemy('enemy1', { x: 1, y: 1 })];
    const rng = new SeededRNG(12345);

    // Path from enemy position to player (at goal)
    const path = findPath(map, { x: 1, y: 1 }, { x: 3, y: 1 }, enemies, rng);

    expect(path).toHaveLength(2);
    expect(path[path.length - 1]).toEqual({ x: 3, y: 1 });
  });

  it('is deterministic with same seed', () => {
    const map = createTestMap([
      '#######',
      '#.....#',
      '#.###.#',
      '#.....#',
      '#######',
    ]);

    const rng1 = new SeededRNG(12345);
    const rng2 = new SeededRNG(12345);

    const path1 = findPath(map, { x: 1, y: 1 }, { x: 5, y: 3 }, [], rng1);
    const path2 = findPath(map, { x: 1, y: 1 }, { x: 5, y: 3 }, [], rng2);

    expect(path1).toEqual(path2);
  });
});

// ============================================================================
// getNextEnemyMove Tests
// ============================================================================

describe('getNextEnemyMove', () => {
  it('returns next step toward player', () => {
    const map = createTestMap([
      '#####',
      '#...#',
      '#####',
    ]);
    const enemy = createEnemy('enemy1', { x: 1, y: 1 });
    const playerPosition = { x: 3, y: 1 };
    const rng = new SeededRNG(12345);

    const nextMove = getNextEnemyMove(map, enemy, playerPosition, [], rng);

    expect(nextMove).toEqual({ x: 2, y: 1 });
  });

  it('returns null when no path exists', () => {
    const map = createTestMap([
      '#####',
      '#.#.#',
      '#####',
    ]);
    const enemy = createEnemy('enemy1', { x: 1, y: 1 });
    const playerPosition = { x: 3, y: 1 };
    const rng = new SeededRNG(12345);

    const nextMove = getNextEnemyMove(map, enemy, playerPosition, [], rng);

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
    const rng = new SeededRNG(12345);

    const nextMove = getNextEnemyMove(map, enemy, playerPosition, [], rng);

    expect(nextMove).toEqual({ x: 3, y: 1 });
  });
});

// ============================================================================
// moveEnemiesNight Tests
// ============================================================================

describe('moveEnemiesNight', () => {
  it('moves enemies toward player', () => {
    const map = createTestMap([
      '#####',
      '#...#',
      '#####',
    ]);
    map.enemies = [createEnemy('enemy1', { x: 1, y: 1 })];
    const playerPosition = { x: 3, y: 1 };
    const rng = new SeededRNG(12345);

    const result = moveEnemiesNight(map, playerPosition, rng);

    expect(result.updatedEnemies).toHaveLength(1);
    expect(result.updatedEnemies[0].position).toEqual({ x: 2, y: 1 });
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
    const rng = new SeededRNG(12345);

    const result = moveEnemiesNight(map, playerPosition, rng);

    expect(result.combatTriggered).toBe('enemy1');
    expect(result.updatedEnemies[0].position).toEqual({ x: 3, y: 1 });
  });

  it('processes enemies in deterministic order', () => {
    const map = createTestMap([
      '#######',
      '#.....#',
      '#.....#',
      '#######',
    ]);
    map.enemies = [
      createEnemy('enemy2', { x: 1, y: 1 }),
      createEnemy('enemy1', { x: 1, y: 2 }),
    ];
    const playerPosition = { x: 5, y: 1 };
    const rng1 = new SeededRNG(12345);
    const rng2 = new SeededRNG(12345);

    // Reset enemies for second run
    const map2 = { ...map, enemies: [
      createEnemy('enemy2', { x: 1, y: 1 }),
      createEnemy('enemy1', { x: 1, y: 2 }),
    ]};

    const result1 = moveEnemiesNight(map, playerPosition, rng1);
    const result2 = moveEnemiesNight(map2, playerPosition, rng2);

    // Results should be identical
    expect(result1.updatedEnemies.map(e => ({ id: e.id, pos: e.position })))
      .toEqual(result2.updatedEnemies.map(e => ({ id: e.id, pos: e.position })));
  });

  it('keeps enemy in place when blocked', () => {
    const map = createTestMap([
      '#####',
      '#.#.#',
      '#####',
    ]);
    map.enemies = [createEnemy('enemy1', { x: 1, y: 1 })];
    const playerPosition = { x: 3, y: 1 };
    const rng = new SeededRNG(12345);

    const result = moveEnemiesNight(map, playerPosition, rng);

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
      createEnemy('enemy1', { x: 1, y: 1 }),
      createEnemy('enemy2', { x: 2, y: 1 }),
    ];
    const playerPosition = { x: 5, y: 1 };
    const rng = new SeededRNG(12345);

    const result = moveEnemiesNight(map, playerPosition, rng);

    // Both enemies should move toward player
    const positions = result.updatedEnemies.map(e => e.position);
    const positionStrings = positions.map(p => `${p.x},${p.y}`);

    // No duplicate positions
    const uniquePositions = new Set(positionStrings);
    expect(uniquePositions.size).toBe(positions.length);
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
