/**
 * T025: Fog of War Visibility Tests
 * Tests visibility calculations for fog of war system.
 * @see specs/001-pve-dungeon-crawler/research.md R1
 * @see specs/001-pve-dungeon-crawler/data-model.md
 */

import {
  updateFogOfWar,
  getTilesInRadius,
  isLineOfSightClear,
} from '../../../src/game/map/fog-of-war';
import { TileType, FogState, GameMap } from '../../../src/game/map/types';
import type { Position } from '../../../src/game/engine/types';
import { SIGHT_RADIUS } from '../../../src/game/engine/constants';

/**
 * Helper to create a test map with specific layout
 */
function createTestMap(
  width: number,
  height: number,
  customTiles?: TileType[][]
): GameMap {
  const tiles: TileType[][] = customTiles || [];
  const fog: FogState[][] = [];

  if (!customTiles) {
    // Default: all floor tiles
    for (let y = 0; y < height; y++) {
      tiles[y] = [];
      for (let x = 0; x < width; x++) {
        tiles[y][x] = TileType.Floor;
      }
    }
  }

  // Initialize fog as hidden
  for (let y = 0; y < height; y++) {
    fog[y] = [];
    for (let x = 0; x < width; x++) {
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

describe('Fog of War', () => {
  describe('getTilesInRadius', () => {
    it('should return all tiles within the given radius', () => {
      const center: Position = { x: 5, y: 5 };
      const radius = 3;

      const tiles = getTilesInRadius(center, radius);

      const effectiveRadius = radius + 0.5;
      const maxDistance = effectiveRadius * effectiveRadius;

      // Check that tiles are within circular radius
      for (const tile of tiles) {
        const dx = tile.x - center.x;
        const dy = tile.y - center.y;
        const distance = dx * dx + dy * dy;
        expect(distance).toBeLessThanOrEqual(maxDistance);
      }

      // Should include center tile
      expect(tiles.some((t) => t.x === center.x && t.y === center.y)).toBe(true);

      // Should include tiles at exact radius distance
      expect(tiles.some((t) => t.x === center.x && t.y === center.y - radius)).toBe(true);
      expect(tiles.some((t) => t.x === center.x && t.y === center.y + radius)).toBe(true);
      expect(tiles.some((t) => t.x === center.x - radius && t.y === center.y)).toBe(true);
      expect(tiles.some((t) => t.x === center.x + radius && t.y === center.y)).toBe(true);
    });

    it('should return tiles in a circle-like pattern for radius 2', () => {
      const center: Position = { x: 5, y: 5 };
      const radius = 2;

      const tiles = getTilesInRadius(center, radius);

      // Radius 2 with circular fill (inclusive with rounding)
      expect(tiles.length).toBe(21);
      expect(tiles).toEqual(expect.arrayContaining([
        { x: 5, y: 3 },
        { x: 7, y: 5 },
        { x: 6, y: 6 },
        { x: 4, y: 7 },
      ]));
      expect(tiles).not.toContainEqual({ x: 3, y: 3 });
      expect(tiles).not.toContainEqual({ x: 7, y: 7 });
    });
  });

  describe('isLineOfSightClear', () => {
    it('should return true for clear line of sight', () => {
      const map = createTestMap(10, 10);
      const from: Position = { x: 2, y: 2 };
      const to: Position = { x: 7, y: 2 };

      const result = isLineOfSightClear(map, from, to);

      expect(result).toBe(true);
    });

    it('should return false when wall blocks line of sight', () => {
      const map = createTestMap(10, 10);
      // Place a wall between positions
      map.tiles[2][4] = TileType.Wall;

      const from: Position = { x: 2, y: 2 };
      const to: Position = { x: 7, y: 2 };

      const result = isLineOfSightClear(map, from, to);

      expect(result).toBe(false);
    });

    it('should work for diagonal lines', () => {
      const map = createTestMap(10, 10);
      const from: Position = { x: 2, y: 2 };
      const to: Position = { x: 5, y: 5 };

      const result = isLineOfSightClear(map, from, to);

      expect(result).toBe(true);
    });

    it('should return true for same position', () => {
      const map = createTestMap(10, 10);
      const pos: Position = { x: 5, y: 5 };

      const result = isLineOfSightClear(map, pos, pos);

      expect(result).toBe(true);
    });

    it('should return true for adjacent tiles', () => {
      const map = createTestMap(10, 10);
      const from: Position = { x: 5, y: 5 };
      const to: Position = { x: 5, y: 6 };

      const result = isLineOfSightClear(map, from, to);

      expect(result).toBe(true);
    });
  });

  describe('updateFogOfWar', () => {
    it('should set tiles within radius to Visible during Day', () => {
      const map = createTestMap(15, 15);
      const playerPos: Position = { x: 7, y: 7 };

      const updatedMap = updateFogOfWar(map, playerPos, true);

      // Check tiles within day sight radius are Visible
      const visibleTiles = getTilesInRadius(playerPos, SIGHT_RADIUS.day);
      for (const tile of visibleTiles) {
        if (tile.x >= 0 && tile.x < map.width && tile.y >= 0 && tile.y < map.height) {
          expect(updatedMap.fog[tile.y][tile.x]).toBe(FogState.Visible);
        }
      }
    });

    it('should use smaller radius during Night', () => {
      const map = createTestMap(15, 15);
      const playerPos: Position = { x: 7, y: 7 };

      const updatedMap = updateFogOfWar(map, playerPos, false);

      // Check tiles within night sight radius are Visible
      const visibleTiles = getTilesInRadius(playerPos, SIGHT_RADIUS.night);
      for (const tile of visibleTiles) {
        if (tile.x >= 0 && tile.x < map.width && tile.y >= 0 && tile.y < map.height) {
          expect(updatedMap.fog[tile.y][tile.x]).toBe(FogState.Visible);
        }
      }

      // Tiles outside night radius but within day radius should not be visible
      // (unless they were previously revealed)
      const nightVisibleSet = new Set(
        getTilesInRadius(playerPos, SIGHT_RADIUS.night).map((t) => `${t.x},${t.y}`)
      );
      const dayOnlyTiles = getTilesInRadius(playerPos, SIGHT_RADIUS.day).filter(
        (t) => !nightVisibleSet.has(`${t.x},${t.y}`)
      );

      for (const tile of dayOnlyTiles) {
        if (tile.x >= 0 && tile.x < map.width && tile.y >= 0 && tile.y < map.height) {
          expect(updatedMap.fog[tile.y][tile.x]).not.toBe(FogState.Visible);
        }
      }
    });

    it('should keep previously visible tiles as Revealed after moving away', () => {
      let map = createTestMap(20, 20);
      const initialPos: Position = { x: 5, y: 5 };
      const newPos: Position = { x: 15, y: 15 };

      // First update at initial position
      map = updateFogOfWar(map, initialPos, true);

      // Move to new position
      map = updateFogOfWar(map, newPos, true);

      // Tiles near initial position should now be Revealed (not Visible, not Hidden)
      const initialVisibleTiles = getTilesInRadius(initialPos, SIGHT_RADIUS.day);
      const currentVisibleTiles = getTilesInRadius(newPos, SIGHT_RADIUS.day);
      const currentVisibleSet = new Set(
        currentVisibleTiles.map((t) => `${t.x},${t.y}`)
      );

      for (const tile of initialVisibleTiles) {
        if (
          tile.x >= 0 &&
          tile.x < map.width &&
          tile.y >= 0 &&
          tile.y < map.height &&
          !currentVisibleSet.has(`${tile.x},${tile.y}`)
        ) {
          expect(map.fog[tile.y][tile.x]).toBe(FogState.Revealed);
        }
      }
    });

    it('should reveal tiles even when walls are in the way', () => {
      // Create map with a wall barrier
      const map = createTestMap(15, 15);
      // Create vertical wall at x=5
      for (let y = 0; y < 15; y++) {
        map.tiles[y][5] = TileType.Wall;
      }

      const playerPos: Position = { x: 3, y: 7 };
      const updatedMap = updateFogOfWar(map, playerPos, true);

      // Tiles beyond the wall should still be Visible
      expect(updatedMap.fog[7][6]).toBe(FogState.Visible);
      expect(updatedMap.fog[7][7]).toBe(FogState.Visible);
    });

    it('should reveal initial radius of 6 at game start', () => {
      const map = createTestMap(20, 20);
      const spawnPos: Position = { x: 10, y: 10 };
      const initialRadius = 6;

      // First visibility update with initial radius
      const tilesInRadius = getTilesInRadius(spawnPos, initialRadius);
      const updatedMap = updateFogOfWar(map, spawnPos, true, initialRadius);

      // All tiles within radius 7 should be visible
      for (const tile of tilesInRadius) {
        if (tile.x >= 0 && tile.x < map.width && tile.y >= 0 && tile.y < map.height) {
          expect(updatedMap.fog[tile.y][tile.x]).toBe(FogState.Visible);
        }
      }
    });

    it('should not mutate the original map', () => {
      const map = createTestMap(10, 10);
      const originalFog = map.fog.map((row) => [...row]);
      const playerPos: Position = { x: 5, y: 5 };

      updateFogOfWar(map, playerPos, true);

      // Original should be unchanged
      expect(map.fog).toEqual(originalFog);
    });
  });

  describe('Visibility with different tile types', () => {
    it('should see through Floor tiles', () => {
      const map = createTestMap(10, 10);
      const from: Position = { x: 2, y: 5 };
      const to: Position = { x: 7, y: 5 };

      const result = isLineOfSightClear(map, from, to);

      expect(result).toBe(true);
    });

    it('should not see through Wall tiles', () => {
      const map = createTestMap(10, 10);
      map.tiles[5][4] = TileType.Wall;

      const from: Position = { x: 2, y: 5 };
      const to: Position = { x: 7, y: 5 };

      const result = isLineOfSightClear(map, from, to);

      expect(result).toBe(false);
    });
  });
});
