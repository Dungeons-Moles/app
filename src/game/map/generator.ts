/**
 * Map Generator for PvE Dungeon Crawler
 * Uses recursive backtracker algorithm to generate corridor-based mazes.
 * @see specs/001-pve-dungeon-crawler/research.md R1
 */

import { SeededRNG } from '../engine/rng';
import { GAME_CONSTANTS } from '../engine/constants';
import type { Position } from '../engine/types';
import { TileType, FogState, GameMap, MapEnemy, MapPOI, EnemyId, POIId } from './types';

// ============================================================================
// Types
// ============================================================================

export interface MapGenerationParams {
  width: number;
  height: number;
  seed: number;
}

export interface GeneratedMap {
  width: number;
  height: number;
  tiles: TileType[][];
  fog: FogState[][];
  spawn: Position;
  moleDenPosition: Position;
  pois: MapPOI[];
  enemies: MapEnemy[];
}

// ============================================================================
// Constants
// ============================================================================

const TILE_DISTRIBUTION = {
  emptyThreshold: 0.50,  // 50% empty
  softThreshold: 0.85,   // 35% soft (50-85)
  // Remaining 15% hard
};

const POI_DENSITY = {
  COMMON: 0.08,
  UNCOMMON: 0.04,
  RARE: 0.02,
};

const POI_DEFINITIONS: Array<{ id: POIId; rarity: 'COMMON' | 'UNCOMMON' | 'RARE' }> = [
  { id: 'L2', rarity: 'COMMON' },    // Supply Cache
  { id: 'L4', rarity: 'COMMON' },    // Tool Oil Rack
  { id: 'L5', rarity: 'COMMON' },    // Rest Alcove
  { id: 'L6', rarity: 'COMMON' },    // Survey Beacon
  { id: 'L3', rarity: 'UNCOMMON' },  // Tool Crate
  { id: 'L7', rarity: 'UNCOMMON' },  // Seismic Scanner
  { id: 'L8', rarity: 'UNCOMMON' },  // Rail Waypoint
  { id: 'L9', rarity: 'UNCOMMON' },  // Smuggler Hatch
  { id: 'L10', rarity: 'UNCOMMON' }, // Rusty Anvil
  { id: 'L11', rarity: 'RARE' },     // Crusher Golem
  { id: 'L12', rarity: 'RARE' },     // Geode Vault
];

const ENEMY_IDS: EnemyId[] = [
  'TUNNEL_RAT',
  'CAVE_BAT',
  'SPORE_SLIME',
  'RUST_MITE_SWARM',
  'COLLAPSED_MINER',
  'SHARD_BEETLE',
  'TUNNEL_WARDEN',
  'BURROW_AMBUSHER',
];

const ENEMY_STATS: Record<EnemyId, Array<{ hp: number; atk: number; arm: number; spd: number }>> = {
  'TUNNEL_RAT': [
    { hp: 3, atk: 1, arm: 0, spd: 2 },
    { hp: 5, atk: 2, arm: 0, spd: 3 },
    { hp: 7, atk: 3, arm: 0, spd: 4 },
  ],
  'CAVE_BAT': [
    { hp: 4, atk: 1, arm: 0, spd: 2 },
    { hp: 6, atk: 2, arm: 0, spd: 3 },
    { hp: 8, atk: 3, arm: 0, spd: 4 },
  ],
  'SPORE_SLIME': [
    { hp: 6, atk: 1, arm: 2, spd: 0 },
    { hp: 9, atk: 2, arm: 3, spd: 0 },
    { hp: 12, atk: 3, arm: 4, spd: 0 },
  ],
  'RUST_MITE_SWARM': [
    { hp: 5, atk: 1, arm: 0, spd: 3 },
    { hp: 8, atk: 2, arm: 0, spd: 4 },
    { hp: 11, atk: 3, arm: 0, spd: 5 },
  ],
  'COLLAPSED_MINER': [
    { hp: 8, atk: 2, arm: 0, spd: 1 },
    { hp: 12, atk: 3, arm: 0, spd: 2 },
    { hp: 16, atk: 4, arm: 0, spd: 3 },
  ],
  'SHARD_BEETLE': [
    { hp: 7, atk: 1, arm: 3, spd: 1 },
    { hp: 10, atk: 2, arm: 4, spd: 1 },
    { hp: 13, atk: 3, arm: 5, spd: 2 },
  ],
  'TUNNEL_WARDEN': [
    { hp: 6, atk: 2, arm: 4, spd: 2 },
    { hp: 9, atk: 3, arm: 6, spd: 3 },
    { hp: 12, atk: 4, arm: 8, spd: 4 },
  ],
  'BURROW_AMBUSHER': [
    { hp: 5, atk: 4, arm: 0, spd: 3 },
    { hp: 8, atk: 6, arm: 0, spd: 4 },
    { hp: 11, atk: 8, arm: 0, spd: 5 },
  ],
};

// ============================================================================
// Main Generation Function
// ============================================================================

/**
 * Generate a complete dungeon map with maze, tiles, POIs, and enemies.
 */
export function generateMap(params: MapGenerationParams): GeneratedMap {
  const rng = new SeededRNG(params.seed);

  // Step 1: Generate maze skeleton
  const { tiles, walkableTiles } = generateMazeSkeleton(params.width, params.height, rng);

  // Step 2: Assign tile types to passages
  assignTileTypes(tiles, walkableTiles, rng);

  // Step 3: Initialize fog as hidden
  const fog = initializeFog(params.width, params.height);

  // Step 4: Find spawn point
  const spawn = findSpawnPoint(walkableTiles, rng);

  // Step 5: Place Mole Den adjacent to spawn
  const moleDenPosition = placeMoleDen(spawn, tiles, params.width, params.height, rng);

  // Step 6: Place POIs
  const pois = placePOIs(walkableTiles, spawn, moleDenPosition, rng);

  // Step 7: Place enemies
  const enemies = placeEnemies(walkableTiles, spawn, moleDenPosition, pois, rng);

  return {
    width: params.width,
    height: params.height,
    tiles,
    fog,
    spawn,
    moleDenPosition,
    pois,
    enemies,
  };
}

// ============================================================================
// Maze Generation (Recursive Backtracker)
// ============================================================================

interface MazeResult {
  tiles: TileType[][];
  walkableTiles: Position[];
}

/**
 * Generate maze skeleton using recursive backtracker algorithm.
 * Produces corridor-only layout (no open rooms).
 */
function generateMazeSkeleton(width: number, height: number, rng: SeededRNG): MazeResult {
  // Initialize all as walls
  const tiles: TileType[][] = [];
  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) {
      tiles[y][x] = TileType.Wall;
    }
  }

  // Track visited cells (maze uses 2-cell spacing for walls between corridors)
  const cellWidth = Math.floor((width - 1) / 2);
  const cellHeight = Math.floor((height - 1) / 2);

  if (cellWidth < 2 || cellHeight < 2) {
    // Map too small for maze generation
    // Create simple corridor
    const walkableTiles: Position[] = [];
    for (let y = 1; y < height - 1; y++) {
      tiles[y][1] = TileType.EmptyTunnel;
      walkableTiles.push({ x: 1, y });
    }
    return { tiles, walkableTiles };
  }

  const visited: boolean[][] = [];
  for (let y = 0; y < cellHeight; y++) {
    visited[y] = [];
    for (let x = 0; x < cellWidth; x++) {
      visited[y][x] = false;
    }
  }

  // Stack for backtracking
  const stack: Position[] = [];
  const walkableTiles: Position[] = [];

  // Start at a random cell
  const startCellX = rng.nextInt(0, cellWidth - 1);
  const startCellY = rng.nextInt(0, cellHeight - 1);

  // Convert cell coords to tile coords
  const cellToTile = (cellX: number, cellY: number): Position => ({
    x: cellX * 2 + 1,
    y: cellY * 2 + 1,
  });

  // Mark starting cell
  visited[startCellY][startCellX] = true;
  const startTile = cellToTile(startCellX, startCellY);
  tiles[startTile.y][startTile.x] = TileType.EmptyTunnel;
  walkableTiles.push(startTile);
  stack.push({ x: startCellX, y: startCellY });

  // Direction vectors for neighboring cells
  const directions = [
    { dx: 0, dy: -1 }, // Up
    { dx: 0, dy: 1 },  // Down
    { dx: -1, dy: 0 }, // Left
    { dx: 1, dy: 0 },  // Right
  ];

  while (stack.length > 0) {
    const current = stack[stack.length - 1];

    // Find unvisited neighbors
    const unvisitedNeighbors: Array<{ cell: Position; dir: { dx: number; dy: number } }> = [];

    for (const dir of directions) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;

      if (nx >= 0 && nx < cellWidth && ny >= 0 && ny < cellHeight && !visited[ny][nx]) {
        unvisitedNeighbors.push({ cell: { x: nx, y: ny }, dir });
      }
    }

    if (unvisitedNeighbors.length > 0) {
      // Pick random unvisited neighbor
      const { cell: next, dir } = rng.pick(unvisitedNeighbors);

      // Remove wall between current and next
      const wallX = current.x * 2 + 1 + dir.dx;
      const wallY = current.y * 2 + 1 + dir.dy;
      tiles[wallY][wallX] = TileType.EmptyTunnel;
      walkableTiles.push({ x: wallX, y: wallY });

      // Mark next cell as passage
      visited[next.y][next.x] = true;
      const nextTile = cellToTile(next.x, next.y);
      tiles[nextTile.y][nextTile.x] = TileType.EmptyTunnel;
      walkableTiles.push(nextTile);

      stack.push(next);
    } else {
      // Backtrack
      stack.pop();
    }
  }

  return { tiles, walkableTiles };
}

// ============================================================================
// Tile Type Assignment (T028)
// ============================================================================

/**
 * Assign tile types (Empty/Soft/Hard) to walkable tiles.
 */
function assignTileTypes(
  tiles: TileType[][],
  walkableTiles: Position[],
  rng: SeededRNG
): void {
  for (const pos of walkableTiles) {
    const roll = rng.next();
    if (roll < TILE_DISTRIBUTION.emptyThreshold) {
      tiles[pos.y][pos.x] = TileType.EmptyTunnel;
    } else if (roll < TILE_DISTRIBUTION.softThreshold) {
      tiles[pos.y][pos.x] = TileType.SoftEarth;
    } else {
      tiles[pos.y][pos.x] = TileType.HardRock;
    }
  }
}

// ============================================================================
// Fog Initialization
// ============================================================================

function initializeFog(width: number, height: number): FogState[][] {
  const fog: FogState[][] = [];
  for (let y = 0; y < height; y++) {
    fog[y] = [];
    for (let x = 0; x < width; x++) {
      fog[y][x] = FogState.Hidden;
    }
  }
  return fog;
}

// ============================================================================
// Spawn Point
// ============================================================================

function findSpawnPoint(walkableTiles: Position[], rng: SeededRNG): Position {
  // Pick a random walkable tile as spawn
  return rng.pick(walkableTiles);
}

// ============================================================================
// Mole Den Placement
// ============================================================================

function placeMoleDen(
  spawn: Position,
  tiles: TileType[][],
  width: number,
  height: number,
  rng: SeededRNG
): Position {
  // Find adjacent walkable tiles
  const directions = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ];

  const validPositions: Position[] = [];
  for (const dir of directions) {
    const nx = spawn.x + dir.x;
    const ny = spawn.y + dir.y;
    if (
      nx >= 0 && nx < width &&
      ny >= 0 && ny < height &&
      tiles[ny][nx] !== TileType.Wall
    ) {
      validPositions.push({ x: nx, y: ny });
    }
  }

  if (validPositions.length === 0) {
    // Fallback: carve a space adjacent to spawn
    const dir = rng.pick(directions);
    const nx = Math.max(1, Math.min(width - 2, spawn.x + dir.x));
    const ny = Math.max(1, Math.min(height - 2, spawn.y + dir.y));
    tiles[ny][nx] = TileType.EmptyTunnel;
    return { x: nx, y: ny };
  }

  return rng.pick(validPositions);
}

// ============================================================================
// POI Placement (T029)
// ============================================================================

function placePOIs(
  walkableTiles: Position[],
  spawn: Position,
  moleDenPos: Position,
  rng: SeededRNG
): MapPOI[] {
  const pois: MapPOI[] = [];
  const usedPositions = new Set<string>();

  // Reserve spawn and mole den positions
  usedPositions.add(`${spawn.x},${spawn.y}`);
  usedPositions.add(`${moleDenPos.x},${moleDenPos.y}`);

  // Add Mole Den POI first (fixed at moleDenPos)
  pois.push({
    id: `poi_L1_0`,
    definitionId: 'L1',
    position: moleDenPos,
    visited: false,
    discovered: false,
  });

  // Track positions of each POI type for spacing check
  const poiTypePositions = new Map<POIId, Position[]>();

  // Calculate number of POIs for each rarity based on walkable tile count
  const totalWalkable = walkableTiles.length;
  const poiCounts = {
    COMMON: Math.floor(totalWalkable * POI_DENSITY.COMMON),
    UNCOMMON: Math.floor(totalWalkable * POI_DENSITY.UNCOMMON),
    RARE: Math.floor(totalWalkable * POI_DENSITY.RARE),
  };

  // Group POI definitions by rarity
  const poiByRarity = {
    COMMON: POI_DEFINITIONS.filter(p => p.rarity === 'COMMON'),
    UNCOMMON: POI_DEFINITIONS.filter(p => p.rarity === 'UNCOMMON'),
    RARE: POI_DEFINITIONS.filter(p => p.rarity === 'RARE'),
  };

  // Place POIs for each rarity
  for (const rarity of ['COMMON', 'UNCOMMON', 'RARE'] as const) {
    const count = poiCounts[rarity];
    const definitions = poiByRarity[rarity];

    for (let i = 0; i < count && definitions.length > 0; i++) {
      // Pick a random POI type
      const poiDef = rng.pick(definitions);

      // Find valid position (respects spacing rules)
      const position = findValidPOIPosition(
        walkableTiles,
        usedPositions,
        poiTypePositions.get(poiDef.id) || [],
        rng
      );

      if (position) {
        pois.push({
          id: `poi_${poiDef.id}_${i}`,
          definitionId: poiDef.id,
          position,
          visited: false,
          discovered: false,
        });

        usedPositions.add(`${position.x},${position.y}`);

        if (!poiTypePositions.has(poiDef.id)) {
          poiTypePositions.set(poiDef.id, []);
        }
        poiTypePositions.get(poiDef.id)!.push(position);
      }
    }
  }

  return pois;
}

function findValidPOIPosition(
  walkableTiles: Position[],
  usedPositions: Set<string>,
  sameTypePositions: Position[],
  rng: SeededRNG
): Position | null {
  // Shuffle walkable tiles and find first valid position
  const shuffled = rng.shuffle([...walkableTiles]);

  for (const pos of shuffled) {
    const key = `${pos.x},${pos.y}`;

    // Skip if position already used
    if (usedPositions.has(key)) continue;

    // Check spacing from same type POIs
    let validSpacing = true;
    for (const existing of sameTypePositions) {
      const distance = Math.abs(pos.x - existing.x) + Math.abs(pos.y - existing.y);
      if (distance < GAME_CONSTANTS.POI_MIN_SPACING) {
        validSpacing = false;
        break;
      }
    }

    if (validSpacing) {
      return pos;
    }
  }

  return null;
}

// ============================================================================
// Enemy Placement (T030)
// ============================================================================

function placeEnemies(
  walkableTiles: Position[],
  spawn: Position,
  moleDenPos: Position,
  pois: MapPOI[],
  rng: SeededRNG
): MapEnemy[] {
  const enemies: MapEnemy[] = [];
  const usedPositions = new Set<string>();

  // Reserve spawn, mole den, and POI positions
  usedPositions.add(`${spawn.x},${spawn.y}`);
  usedPositions.add(`${moleDenPos.x},${moleDenPos.y}`);
  for (const poi of pois) {
    usedPositions.add(`${poi.position.x},${poi.position.y}`);
  }

  // Calculate enemy count (roughly 5% of walkable tiles)
  const enemyCount = Math.floor(walkableTiles.length * 0.05);

  // Shuffle tiles and place enemies
  const shuffled = rng.shuffle([...walkableTiles]);
  let placed = 0;

  for (const pos of shuffled) {
    if (placed >= enemyCount) break;

    const key = `${pos.x},${pos.y}`;
    if (usedPositions.has(key)) continue;

    // Ensure minimum distance from spawn (at least 5 tiles)
    const distanceFromSpawn = Math.abs(pos.x - spawn.x) + Math.abs(pos.y - spawn.y);
    if (distanceFromSpawn < 5) continue;

    // Pick random enemy type and tier
    const enemyId = rng.pick(ENEMY_IDS);
    const tier = rng.pick([1, 2, 3] as const);
    const stats = ENEMY_STATS[enemyId][tier - 1];

    enemies.push({
      id: `enemy_${placed}`,
      definitionId: enemyId,
      tier,
      position: pos,
      stats,
    });

    usedPositions.add(key);
    placed++;
  }

  return enemies;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert generated map to GameMap format.
 */
export function toGameMap(generated: GeneratedMap): GameMap {
  return {
    width: generated.width,
    height: generated.height,
    tiles: generated.tiles,
    fog: generated.fog,
    enemies: generated.enemies,
    pois: generated.pois,
    moleDenPosition: generated.moleDenPosition,
  };
}
