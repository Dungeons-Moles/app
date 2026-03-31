/**
 * T024: Map Generation Determinism Tests
 * Tests that map generation produces identical results given the same seed.
 * @see specs/001-pve-dungeon-crawler/research.md R1
 */

import { generateMap, MapGenerationParams } from '../../../src/game/map/generator';
import { TileType, FogState } from '../../../src/game/map/types';

describe('Map Generator', () => {
  describe('Determinism', () => {
    it('should produce identical maps with the same seed', () => {
      const params: MapGenerationParams = {
        width: 50,
        height: 50,
        seed: 12345,
      };

      const map1 = generateMap(params);
      const map2 = generateMap(params);

      // Tiles should be identical
      expect(map1.tiles).toEqual(map2.tiles);

      // Spawn position should be identical
      expect(map1.spawn).toEqual(map2.spawn);

      // Mole den position should be identical
      expect(map1.moleDenPosition).toEqual(map2.moleDenPosition);

      // POI positions should be identical
      expect(map1.pois.length).toBe(map2.pois.length);
      for (let i = 0; i < map1.pois.length; i++) {
        expect(map1.pois[i].position).toEqual(map2.pois[i].position);
        expect(map1.pois[i].definitionId).toBe(map2.pois[i].definitionId);
      }

      // Enemy positions should be identical
      expect(map1.enemies.length).toBe(map2.enemies.length);
      for (let i = 0; i < map1.enemies.length; i++) {
        expect(map1.enemies[i].position).toEqual(map2.enemies[i].position);
        expect(map1.enemies[i].definitionId).toBe(map2.enemies[i].definitionId);
        expect(map1.enemies[i].tier).toBe(map2.enemies[i].tier);
      }
    });

    it('should produce different maps with different seeds', () => {
      const params1: MapGenerationParams = { width: 50, height: 50, seed: 12345 };
      const params2: MapGenerationParams = { width: 50, height: 50, seed: 54321 };

      const map1 = generateMap(params1);
      const map2 = generateMap(params2);

      // Maps should differ (extremely unlikely to be identical with different seeds)
      expect(map1.tiles).not.toEqual(map2.tiles);
    });
  });

  describe('Maze Structure', () => {
    it('should generate a fully connected maze (all walkable tiles reachable)', () => {
      const params: MapGenerationParams = {
        width: 50,
        height: 50,
        seed: 42,
      };

      const map = generateMap(params);

      // Find all walkable tiles
      const walkableTiles: Array<{ x: number; y: number }> = [];
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          if (map.tiles[y][x] !== TileType.Wall) {
            walkableTiles.push({ x, y });
          }
        }
      }

      // BFS from spawn to verify connectivity
      const visited = new Set<string>();
      const queue = [map.spawn];
      visited.add(`${map.spawn.x},${map.spawn.y}`);

      while (queue.length > 0) {
        const current = queue.shift()!;
        const neighbors = [
          { x: current.x, y: current.y - 1 },
          { x: current.x, y: current.y + 1 },
          { x: current.x - 1, y: current.y },
          { x: current.x + 1, y: current.y },
        ];

        for (const neighbor of neighbors) {
          const key = `${neighbor.x},${neighbor.y}`;
          if (
            neighbor.x >= 0 &&
            neighbor.x < map.width &&
            neighbor.y >= 0 &&
            neighbor.y < map.height &&
            map.tiles[neighbor.y][neighbor.x] !== TileType.Wall &&
            !visited.has(key)
          ) {
            visited.add(key);
            queue.push(neighbor);
          }
        }
      }

      // All walkable tiles should be reachable
      expect(visited.size).toBe(walkableTiles.length);
    });

    it('should only contain corridor-style paths (no open rooms)', () => {
      const params: MapGenerationParams = {
        width: 50,
        height: 50,
        seed: 99,
      };

      const map = generateMap(params);

      // Check that no 3x3 fully open areas exist (corridor-only constraint)
      // Corridor junctions can have up to 6-7 tiles in a 3x3 area,
      // but a full 3x3 open room would have 9 non-wall tiles
      for (let y = 1; y < map.height - 2; y++) {
        for (let x = 1; x < map.width - 2; x++) {
          if (map.tiles[y][x] !== TileType.Wall) {
            // Count adjacent non-wall tiles in a 3x3 grid centered here
            let nonWallCount = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (map.tiles[y + dy][x + dx] !== TileType.Wall) {
                  nonWallCount++;
                }
              }
            }
            // In a corridor with junctions, we can have up to 7 tiles
            // (center + up to 4 cardinal + some diagonals at junctions)
            // A full 3x3 open room would have 9 non-wall tiles
            expect(nonWallCount).toBeLessThanOrEqual(7);
          }
        }
      }
    });
  });

  describe('Tile Types', () => {
    it('should generate both floor and wall tiles', () => {
      const params: MapGenerationParams = {
        width: 50,
        height: 50,
        seed: 777,
      };

      const map = generateMap(params);

      let floorCount = 0;
      let wallCount = 0;

      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          if (map.tiles[y][x] === TileType.Floor) {
            floorCount++;
          } else if (map.tiles[y][x] === TileType.Wall) {
            wallCount++;
          }
        }
      }

      const total = floorCount + wallCount;
      const floorRatio = total > 0 ? floorCount / total : 0;

      expect(floorCount).toBeGreaterThan(0);
      expect(wallCount).toBeGreaterThan(0);
      expect(floorRatio).toBeGreaterThan(0.1);
      expect(floorRatio).toBeLessThan(0.5);
    });
  });

  describe('Spawn and Mole Den', () => {
    it('should place Mole Den above the spawn position', () => {
      const params: MapGenerationParams = {
        width: 50,
        height: 50,
        seed: 123,
      };

      const map = generateMap(params);

      expect(map.moleDenPosition).toEqual({
        x: map.spawn.x,
        y: map.spawn.y - 1,
      });
    });

    it('should place spawn on a walkable tile', () => {
      const params: MapGenerationParams = {
        width: 50,
        height: 50,
        seed: 456,
      };

      const map = generateMap(params);

      const spawnTile = map.tiles[map.spawn.y][map.spawn.x];
      expect(spawnTile).not.toBe(TileType.Wall);
    });
  });

  describe('POI Placement', () => {
    it('should place Mole Den POI at moleDenPosition', () => {
      const params: MapGenerationParams = {
        width: 50,
        height: 50,
        seed: 789,
      };

      const map = generateMap(params);

      const moleDenPOI = map.pois.find((poi) => poi.definitionId === 'L1');
      expect(moleDenPOI).toBeDefined();
      expect(moleDenPOI!.position).toEqual(map.moleDenPosition);
    });

    it('should not place same POI type within 10 tiles of itself', () => {
      const params: MapGenerationParams = {
        width: 50,
        height: 50,
        seed: 999,
      };

      const map = generateMap(params);

      // Group POIs by type
      const poiByType = new Map<string, Array<{ x: number; y: number }>>();
      for (const poi of map.pois) {
        if (!poiByType.has(poi.definitionId)) {
          poiByType.set(poi.definitionId, []);
        }
        poiByType.get(poi.definitionId)!.push(poi.position);
      }

      // Check spacing for each type
      for (const [type, positions] of poiByType) {
        if (type === 'L1') continue; // Mole Den is fixed, skip

        for (let i = 0; i < positions.length; i++) {
          for (let j = i + 1; j < positions.length; j++) {
            const distance =
              Math.abs(positions[i].x - positions[j].x) +
              Math.abs(positions[i].y - positions[j].y);
            expect(distance).toBeGreaterThanOrEqual(10);
          }
        }
      }
    });
  });

  describe('Enemy Placement', () => {
    it('should place enemies on walkable tiles', () => {
      const params: MapGenerationParams = {
        width: 50,
        height: 50,
        seed: 111,
      };

      const map = generateMap(params);

      for (const enemy of map.enemies) {
        const tile = map.tiles[enemy.position.y][enemy.position.x];
        expect(tile).not.toBe(TileType.Wall);
      }
    });

    it('should not place enemies on spawn or Mole Den positions', () => {
      const params: MapGenerationParams = {
        width: 50,
        height: 50,
        seed: 222,
      };

      const map = generateMap(params);

      for (const enemy of map.enemies) {
        expect(enemy.position).not.toEqual(map.spawn);
        expect(enemy.position).not.toEqual(map.moleDenPosition);
      }
    });

    it('should not place enemies on POI positions', () => {
      const params: MapGenerationParams = {
        width: 50,
        height: 50,
        seed: 333,
      };

      const map = generateMap(params);

      const poiPositions = new Set(
        map.pois.map((poi) => `${poi.position.x},${poi.position.y}`)
      );

      for (const enemy of map.enemies) {
        const key = `${enemy.position.x},${enemy.position.y}`;
        expect(poiPositions.has(key)).toBe(false);
      }
    });
  });

  describe('Fog Initialization', () => {
    it('should initialize all tiles as Hidden', () => {
      const params: MapGenerationParams = {
        width: 50,
        height: 50,
        seed: 444,
      };

      const map = generateMap(params);

      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          expect(map.fog[y][x]).toBe(FogState.Hidden);
        }
      }
    });
  });
});
