/**
 * Map Generator for PvE Dungeon Crawler
 * Generates corridor-only maps with wide environment spacing.
 * Corridors only connect orthogonally (no diagonal connections).
 * @see specs/001-pve-dungeon-crawler/research.md R1
 */

import { SeededRNG } from '../engine/rng';
import { GAME_CONSTANTS, getActForCampaignLevel } from '../engine/constants';
import type { Position, POIId } from '../engine/types';
import { TileType, FogState, GameMap, MapEnemy, MapPOI, EnemyId } from './types';
import { getSpawnZone, selectTierForZone } from './spawn-zones';
import { ENEMY_DEFINITIONS } from '../entities/enemies';
import { getBiomeForCampaignLevel } from '../engine/run-config';

// ============================================================================
// Types
// ============================================================================

export interface MapGenerationParams {
  width: number;
  height: number;
  seed: number;
  campaignLevel?: number;
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
  { id: 'L13', rarity: 'UNCOMMON' },
  { id: 'L14', rarity: 'UNCOMMON' },
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
  'FROST_WISP',
  'POWDER_TICK',
  'COIN_SLUG',
  'BLOOD_MOSQUITO',
];

const EASY_POOL: EnemyId[] = ['TUNNEL_RAT', 'CAVE_BAT', 'FROST_WISP', 'COIN_SLUG', 'BLOOD_MOSQUITO'];
const MEDIUM_POOL: EnemyId[] = ['SPORE_SLIME', 'RUST_MITE_SWARM', 'POWDER_TICK', 'SHARD_BEETLE'];
const HARD_POOL: EnemyId[] = ['COLLAPSED_MINER', 'TUNNEL_WARDEN', 'BURROW_AMBUSHER'];

const ACT_ENEMY_COUNTS: Record<1 | 2 | 3 | 4, number> = {
  1: 36,
  2: 40,
  3: 44,
  4: 48,
};

const ACT_MID_TIER_WEIGHTS: Record<1 | 2 | 3 | 4, [number, number, number]> = {
  1: [0.7, 0.25, 0.05],
  2: [0.55, 0.35, 0.1],
  3: [0.45, 0.4, 0.15],
  4: [0.35, 0.45, 0.2],
};

const ZONE_TIER_WEIGHTS_BY_ACT: Record<0 | 1 | 2, Record<1 | 2 | 3 | 4, [number, number, number]>> = {
  0: {
    1: [0.8, 0.15, 0.05],
    2: [0.8, 0.15, 0.05],
    3: [0.8, 0.15, 0.05],
    4: [0.8, 0.15, 0.05],
  },
  1: ACT_MID_TIER_WEIGHTS,
  2: {
    1: [0.5, 0.35, 0.15],
    2: [0.5, 0.35, 0.15],
    3: [0.5, 0.35, 0.15],
    4: [0.5, 0.35, 0.15],
  },
};

const ZONE_POOL_DISTRIBUTION: Record<0 | 1 | 2, [number, number, number]> = {
  0: [0.6, 0.3, 0.1],
  1: [0.4, 0.4, 0.2],
  2: [0.3, 0.4, 0.3],
};

const ACT_POI_COUNTS: Record<1 | 2 | 3 | 4, Partial<Record<POIId, number>>> = {
  1: { L2: 16, L3: 5, L4: 5, L5: 6, L6: 4, L7: 3, L8: 5, L9: 2, L10: 2, L11: 2, L12: 2, L13: 2, L14: 3 },
  2: { L2: 14, L3: 4, L4: 4, L5: 5, L6: 4, L7: 3, L8: 4, L9: 2, L10: 2, L11: 1, L12: 1, L13: 2, L14: 2 },
  3: { L2: 14, L3: 4, L4: 4, L5: 5, L6: 4, L7: 3, L8: 4, L9: 2, L10: 2, L11: 1, L12: 1, L13: 2, L14: 2 },
  4: { L2: 10, L3: 2, L4: 3, L5: 4, L6: 3, L7: 2, L8: 2, L9: 1, L10: 1, L11: 1, L12: 1, L13: 2, L14: 1 },
};

const ENEMY_STATS: Record<EnemyId, Array<{ hp: number; atk: number; arm: number; spd: number }>> = {
  TUNNEL_RAT: [
    { hp: 5, atk: 1, arm: 0, spd: 3 },
    { hp: 7, atk: 2, arm: 0, spd: 4 },
    { hp: 9, atk: 3, arm: 1, spd: 5 },
  ],
  CAVE_BAT: [
    { hp: 6, atk: 1, arm: 0, spd: 3 },
    { hp: 8, atk: 2, arm: 0, spd: 4 },
    { hp: 10, atk: 3, arm: 0, spd: 5 },
  ],
  SPORE_SLIME: [
    { hp: 7, atk: 1, arm: 2, spd: 0 },
    { hp: 10, atk: 2, arm: 3, spd: 0 },
    { hp: 13, atk: 3, arm: 4, spd: 0 },
  ],
  RUST_MITE_SWARM: [
    { hp: 6, atk: 1, arm: 0, spd: 3 },
    { hp: 9, atk: 2, arm: 0, spd: 4 },
    { hp: 12, atk: 3, arm: 0, spd: 5 },
  ],
  COLLAPSED_MINER: [
    { hp: 7, atk: 1, arm: 0, spd: 1 },
    { hp: 11, atk: 2, arm: 0, spd: 2 },
    { hp: 15, atk: 3, arm: 1, spd: 3 },
  ],
  SHARD_BEETLE: [
    { hp: 8, atk: 1, arm: 2, spd: 1 },
    { hp: 11, atk: 2, arm: 3, spd: 1 },
    { hp: 14, atk: 3, arm: 4, spd: 2 },
  ],
  TUNNEL_WARDEN: [
    { hp: 8, atk: 2, arm: 2, spd: 2 },
    { hp: 11, atk: 3, arm: 4, spd: 3 },
    { hp: 14, atk: 4, arm: 6, spd: 4 },
  ],
  BURROW_AMBUSHER: [
    { hp: 6, atk: 2, arm: 0, spd: 4 },
    { hp: 9, atk: 3, arm: 0, spd: 5 },
    { hp: 12, atk: 4, arm: 0, spd: 6 },
  ],
  FROST_WISP: [
    { hp: 7, atk: 1, arm: 0, spd: 4 },
    { hp: 10, atk: 2, arm: 0, spd: 5 },
    { hp: 13, atk: 3, arm: 0, spd: 6 },
  ],
  POWDER_TICK: [
    { hp: 6, atk: 1, arm: 0, spd: 2 },
    { hp: 9, atk: 2, arm: 0, spd: 3 },
    { hp: 12, atk: 3, arm: 0, spd: 4 },
  ],
  COIN_SLUG: [
    { hp: 7, atk: 1, arm: 2, spd: 1 },
    { hp: 10, atk: 2, arm: 3, spd: 1 },
    { hp: 13, atk: 3, arm: 4, spd: 2 },
  ],
  BLOOD_MOSQUITO: [
    { hp: 6, atk: 1, arm: 0, spd: 3 },
    { hp: 9, atk: 2, arm: 0, spd: 4 },
    { hp: 12, atk: 3, arm: 0, spd: 5 },
  ],
};

// ============================================================================
// Main Generation Function
// ============================================================================

export function generateMap(params: MapGenerationParams): GeneratedMap {
  const rng = new SeededRNG(params.seed);
  const campaignLevel = params.campaignLevel ?? 1;

  // Step 1: Generate corridor maze with wide spacing
  const { tiles, walkableTiles } = generateCorridorMaze(params.width, params.height, rng);

  // Step 2: Initialize fog as hidden
  const fog = initializeFog(params.width, params.height);

  // Step 3: Find spawn point (ensure space for house above)
  const spawn = findSpawnPoint(tiles, walkableTiles, rng);

  // Step 4: Place Mole Den above the spawn tile (house)
  const moleDenPosition = placeMoleDen(spawn, tiles);

  // Step 5: Place POIs
  const pois = placePOIs(walkableTiles, spawn, moleDenPosition, rng, campaignLevel);

  // Step 6: Place enemies
  const enemies = placeEnemies(walkableTiles, spawn, moleDenPosition, pois, rng, campaignLevel);

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
    { dx: 0, dy: 1 }, // Down
    { dx: -1, dy: 0 }, // Left
    { dx: 1, dy: 0 }, // Right
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

function findSpawnPoint(tiles: TileType[][], walkableTiles: Position[], rng: SeededRNG): Position {
  const candidates = walkableTiles.filter(
    (pos) => pos.y > 0 && tiles[pos.y - 1][pos.x] === TileType.Wall
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
    .map((dir) => ({ x: origin.x + dir.x, y: origin.y + dir.y }))
    .filter(
      (pos) =>
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

  const inBounds = walkableTiles.filter((pos) => pos.y > 0);
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
  rng: SeededRNG,
  campaignLevel: number
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

  const act = getActForCampaignLevel(campaignLevel);
  const actPoiCounts = ACT_POI_COUNTS[act];

  for (const poiDef of POI_DEFINITIONS) {
    const count = actPoiCounts[poiDef.id] ?? 0;
    for (let i = 0; i < count; i++) {
      const position = findValidPOIPosition(
        walkableTiles,
        usedPositions,
        poiTypePositions.get(poiDef.id) || [],
        rng
      );

      if (!position) {
        break;
      }

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
  rng: SeededRNG,
  campaignLevel: number
): MapEnemy[] {
  const enemies: MapEnemy[] = [];
  const usedPositions = new Set<string>();
  const act = getActForCampaignLevel(campaignLevel);
  const biome = getBiomeForCampaignLevel(campaignLevel);

  usedPositions.add(`${spawn.x},${spawn.y}`);
  usedPositions.add(`${moleDenPos.x},${moleDenPos.y}`);
  for (const poi of pois) {
    usedPositions.add(`${poi.position.x},${poi.position.y}`);
  }

  const enemyCount = Math.min(ACT_ENEMY_COUNTS[act], walkableTiles.length);

  const shuffled = rng.shuffle([...walkableTiles]);
  let placed = 0;

  for (const pos of shuffled) {
    if (placed >= enemyCount) break;

    const key = `${pos.x},${pos.y}`;
    if (usedPositions.has(key)) continue;

    const zone = getSpawnZone(pos, moleDenPos);
    const enemyId =
      placed < 3
        ? pickEnemyFromPool(EASY_POOL, biome, rng)
        : pickEnemyForZone(zone, biome, rng);
    const tier = selectTierForZone(zone, rng, ZONE_TIER_WEIGHTS_BY_ACT[zone][act]);
    const stats = ENEMY_STATS[enemyId][tier - 1];

    enemies.push({
      id: `enemy_${placed}`,
      definitionId: enemyId,
      tier,
      position: pos,
      stats,
      discovered: false,
    });

    usedPositions.add(key);
    placed++;
  }

  return enemies;
}

function pickEnemyForZone(zone: 0 | 1 | 2, biome: 'A' | 'B', rng: SeededRNG): EnemyId {
  const [easyWeight, mediumWeight, hardWeight] = ZONE_POOL_DISTRIBUTION[zone];
  const roll = rng.next();

  if (roll < easyWeight) {
    return pickEnemyFromPool(EASY_POOL, biome, rng);
  }

  if (roll < easyWeight + mediumWeight) {
    return pickEnemyFromPool(MEDIUM_POOL, biome, rng);
  }

  return pickEnemyFromPool(HARD_POOL, biome, rng);
}

function pickEnemyFromPool(pool: EnemyId[], biome: 'A' | 'B', rng: SeededRNG): EnemyId {
  const weightedPool = pool.flatMap((enemyId) => {
    const enemyBiome = ENEMY_DEFINITIONS[enemyId].biome;
    const weight = enemyBiome === biome ? 3 : enemyBiome === 'BOTH' ? 2 : 1;
    return Array.from({ length: weight }, () => enemyId);
  });

  return rng.pick(weightedPool.length > 0 ? weightedPool : ENEMY_IDS);
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
