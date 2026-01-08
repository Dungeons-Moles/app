/**
 * Map Generator for PvE Dungeon Crawler
 * Generates corridor-only maps with wide environment spacing.
 * Corridors only connect orthogonally (no diagonal connections).
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

// Cell spacing - larger = wider walls between corridors
const CELL_SPACING = 4; // Distance between corridor intersections
const EXTRA_CONNECTION_FACTOR = 0.15; // Adds loops to reduce maze feel

const POI_DENSITY = {
  COMMON: 0.08,
  UNCOMMON: 0.04,
  RARE: 0.02,
};

const POI_DEFINITIONS: Array<{ id: POIId; rarity: 'COMMON' | 'UNCOMMON' | 'RARE' }> = [
  { id: 'L2', rarity: 'COMMON' },
  { id: 'L4', rarity: 'COMMON' },
  { id: 'L5', rarity: 'COMMON' },
  { id: 'L6', rarity: 'COMMON' },
  { id: 'L3', rarity: 'UNCOMMON' },
  { id: 'L7', rarity: 'UNCOMMON' },
  { id: 'L8', rarity: 'UNCOMMON' },
  { id: 'L9', rarity: 'UNCOMMON' },
  { id: 'L10', rarity: 'UNCOMMON' },
  { id: 'L11', rarity: 'RARE' },
  { id: 'L12', rarity: 'RARE' },
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

export function generateMap(params: MapGenerationParams): GeneratedMap {
  const rng = new SeededRNG(params.seed);

  // Step 1: Generate corridor maze with wide spacing
  const { tiles, walkableTiles } = generateCorridorMaze(params.width, params.height, rng);

  // Step 2: Initialize fog as hidden
  const fog = initializeFog(params.width, params.height);

  // Step 3: Find spawn point (ensure space for house above)
  const spawn = findSpawnPoint(tiles, walkableTiles, rng);

  // Step 4: Place Mole Den above the spawn tile (house)
  const moleDenPosition = placeMoleDen(spawn, tiles);

  // Step 5: Place POIs
  const pois = placePOIs(walkableTiles, spawn, moleDenPosition, rng);

  // Step 6: Place enemies
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
// Corridor Maze Generation (Recursive Backtracker with Wide Spacing)
// ============================================================================

interface MazeResult {
  tiles: TileType[][];
  walkableTiles: Position[];
}

/**
 * Generate corridor maze using recursive backtracker algorithm.
 * Uses wider cell spacing to create larger environment areas between corridors.
 * Corridors are 1 tile wide and only connect orthogonally.
 */
function generateCorridorMaze(width: number, height: number, rng: SeededRNG): MazeResult {
  // Initialize all as walls
  const tiles: TileType[][] = [];
  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) {
      tiles[y][x] = TileType.Wall;
    }
  }

  // Calculate cell grid dimensions with wider spacing
  const cellWidth = Math.floor((width - 1) / CELL_SPACING);
  const cellHeight = Math.floor((height - 1) / CELL_SPACING);

  if (cellWidth < 2 || cellHeight < 2) {
    // Map too small - create simple corridor
    const walkableTiles: Position[] = [];
    for (let y = 1; y < height - 1; y++) {
      tiles[y][1] = TileType.Floor;
      walkableTiles.push({ x: 1, y });
    }
    return { tiles, walkableTiles };
  }

  // Track visited cells
  const visited: boolean[][] = [];
  for (let y = 0; y < cellHeight; y++) {
    visited[y] = [];
    for (let x = 0; x < cellWidth; x++) {
      visited[y][x] = false;
    }
  }

  const stack: Position[] = [];
  const walkableTiles: Position[] = [];
  const walkableSet = new Set<string>();
  const connections = new Set<string>();

  // Helper to mark a tile as walkable
  const markFloor = (x: number, y: number) => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      const key = `${x},${y}`;
      if (!walkableSet.has(key)) {
        tiles[y][x] = TileType.Floor;
        walkableTiles.push({ x, y });
        walkableSet.add(key);
      }
    }
  };

  // Convert cell coords to tile coords
  const cellToTile = (cellX: number, cellY: number): Position => ({
    x: cellX * CELL_SPACING + 1,
    y: cellY * CELL_SPACING + 1,
  });

  const connectionKey = (a: Position, b: Position) => {
    const aKey = `${a.x},${a.y}`;
    const bKey = `${b.x},${b.y}`;
    return aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
  };

  const recordConnection = (a: Position, b: Position) => {
    connections.add(connectionKey(a, b));
  };

  const carveConnection = (from: Position, to: Position) => {
    const fromTile = cellToTile(from.x, from.y);
    const toTile = cellToTile(to.x, to.y);

    let cx = fromTile.x;
    let cy = fromTile.y;

    while (cx !== toTile.x || cy !== toTile.y) {
      markFloor(cx, cy);

      if (cx !== toTile.x) {
        cx += Math.sign(toTile.x - cx);
      } else if (cy !== toTile.y) {
        cy += Math.sign(toTile.y - cy);
      }
    }
    markFloor(toTile.x, toTile.y);
  };

  // Start at a random cell
  const startCellX = rng.nextInt(0, cellWidth - 1);
  const startCellY = rng.nextInt(0, cellHeight - 1);

  // Mark starting cell
  visited[startCellY][startCellX] = true;
  const startTile = cellToTile(startCellX, startCellY);
  markFloor(startTile.x, startTile.y);
  stack.push({ x: startCellX, y: startCellY });

  // Direction vectors
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
      const { cell: next } = rng.pick(unvisitedNeighbors);

      carveConnection(current, next);
      recordConnection(current, next);

      // Mark next cell as visited
      visited[next.y][next.x] = true;
      stack.push(next);
    } else {
      // Backtrack
      stack.pop();
    }
  }

  const extraConnections = Math.min(
    Math.floor(cellWidth * cellHeight * EXTRA_CONNECTION_FACTOR),
    (cellWidth - 1) * cellHeight + (cellHeight - 1) * cellWidth
  );

  const candidates: Array<{ from: Position; to: Position }> = [];
  for (let y = 0; y < cellHeight; y++) {
    for (let x = 0; x < cellWidth; x++) {
      const from = { x, y };
      const right = { x: x + 1, y };
      const down = { x, y: y + 1 };

      if (right.x < cellWidth && !connections.has(connectionKey(from, right))) {
        candidates.push({ from, to: right });
      }

      if (down.y < cellHeight && !connections.has(connectionKey(from, down))) {
        candidates.push({ from, to: down });
      }
    }
  }

  const shuffledCandidates = rng.shuffle(candidates);
  for (let i = 0; i < extraConnections && i < shuffledCandidates.length; i++) {
    const { from, to } = shuffledCandidates[i];
    carveConnection(from, to);
    recordConnection(from, to);
  }

  return { tiles, walkableTiles };
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

function findSpawnPoint(
  tiles: TileType[][],
  walkableTiles: Position[],
  rng: SeededRNG
): Position {
  const candidates = walkableTiles.filter(
    pos => pos.y > 0 && tiles[pos.y - 1][pos.x] === TileType.Wall
  );

  if (candidates.length > 0) {
    return rng.pick(candidates);
  }

  // Fallback: carve a new spawn tile adjacent to a corridor, with space above
  const origin = rng.pick(walkableTiles);
  const directions = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ];
  const carveCandidates = directions
    .map(dir => ({ x: origin.x + dir.x, y: origin.y + dir.y }))
    .filter(pos =>
      pos.x >= 1 &&
      pos.x < tiles[0].length - 1 &&
      pos.y > 0 &&
      pos.y < tiles.length - 1 &&
      tiles[pos.y][pos.x] === TileType.Wall &&
      tiles[pos.y - 1][pos.x] === TileType.Wall
    );

  if (carveCandidates.length > 0) {
    const spawn = rng.pick(carveCandidates);
    tiles[spawn.y][spawn.x] = TileType.Floor;
    walkableTiles.push(spawn);
    return spawn;
  }

  const inBounds = walkableTiles.filter(pos => pos.y > 0);
  if (inBounds.length > 0) {
    return rng.pick(inBounds);
  }

  return rng.pick(walkableTiles);
}

// ============================================================================
// Mole Den Placement
// ============================================================================

function placeMoleDen(spawn: Position, tiles: TileType[][]): Position {
  const housePos = { x: spawn.x, y: spawn.y - 1 };

  if (housePos.y < 0) {
    return spawn;
  }

  tiles[housePos.y][housePos.x] = TileType.Floor;
  return housePos;
}

// ============================================================================
// POI Placement
// ============================================================================

function placePOIs(
  walkableTiles: Position[],
  spawn: Position,
  moleDenPos: Position,
  rng: SeededRNG
): MapPOI[] {
  const pois: MapPOI[] = [];
  const usedPositions = new Set<string>();

  usedPositions.add(`${spawn.x},${spawn.y}`);
  usedPositions.add(`${moleDenPos.x},${moleDenPos.y}`);

  // Add Mole Den POI first
  pois.push({
    id: `poi_L1_0`,
    definitionId: 'L1',
    position: moleDenPos,
    visited: false,
    discovered: false,
  });

  const poiTypePositions = new Map<POIId, Position[]>();

  const totalWalkable = walkableTiles.length;
  const poiCounts = {
    COMMON: Math.floor(totalWalkable * POI_DENSITY.COMMON),
    UNCOMMON: Math.floor(totalWalkable * POI_DENSITY.UNCOMMON),
    RARE: Math.floor(totalWalkable * POI_DENSITY.RARE),
  };

  const poiByRarity = {
    COMMON: POI_DEFINITIONS.filter(p => p.rarity === 'COMMON'),
    UNCOMMON: POI_DEFINITIONS.filter(p => p.rarity === 'UNCOMMON'),
    RARE: POI_DEFINITIONS.filter(p => p.rarity === 'RARE'),
  };

  for (const rarity of ['COMMON', 'UNCOMMON', 'RARE'] as const) {
    const count = poiCounts[rarity];
    const definitions = poiByRarity[rarity];

    for (let i = 0; i < count && definitions.length > 0; i++) {
      const poiDef = rng.pick(definitions);

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
  const shuffled = rng.shuffle([...walkableTiles]);

  for (const pos of shuffled) {
    const key = `${pos.x},${pos.y}`;

    if (usedPositions.has(key)) continue;

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
// Enemy Placement
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

  usedPositions.add(`${spawn.x},${spawn.y}`);
  usedPositions.add(`${moleDenPos.x},${moleDenPos.y}`);
  for (const poi of pois) {
    usedPositions.add(`${poi.position.x},${poi.position.y}`);
  }

  const enemyCount = Math.floor(walkableTiles.length * 0.05);

  const shuffled = rng.shuffle([...walkableTiles]);
  let placed = 0;

  for (const pos of shuffled) {
    if (placed >= enemyCount) break;

    const key = `${pos.x},${pos.y}`;
    if (usedPositions.has(key)) continue;

    const distanceFromSpawn = Math.abs(pos.x - spawn.x) + Math.abs(pos.y - spawn.y);
    if (distanceFromSpawn < 5) continue;

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
