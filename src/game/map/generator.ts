/**
 * Structural map generator for local guest runs.
 * Mirrors the Solana map-generator maze, spawn, POI, and enemy placement rules.
 */

import { GAME_CONSTANTS } from '../engine/constants';
import type { Position, POIId } from '../engine/types';
import { ENEMY_DEFINITIONS } from '../entities/enemies';
import { FogState, GameMap, MapEnemy, MapPOI, TileType, type EnemyId } from './types';

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

const CELL_SPACING = 4;
const CELL_GRID_WIDTH = Math.floor((GAME_CONSTANTS.MAP_WIDTH - 1) / CELL_SPACING);
const CELL_GRID_HEIGHT = Math.floor((GAME_CONSTANTS.MAP_HEIGHT - 1) / CELL_SPACING);
const CELL_GRID_SIZE = CELL_GRID_WIDTH * CELL_GRID_HEIGHT;
const EXTRA_CONNECTION_COUNT = Math.floor((CELL_GRID_SIZE * 15) / 100);
const MAX_ENEMIES = 48;
const MAX_POIS = 64;
const POI_MIN_SPACING = 10;
const COUNTER_CACHE_PER_RUN = 2;
const COUNTER_CACHE_FIRST_MAX_DISTANCE = 30;
const SPAWN_PROTECTION_RADIUS = 5;

const POI_IDS_BY_TYPE: Record<number, POIId> = {
  1: 'L1',
  2: 'L2',
  3: 'L3',
  4: 'L4',
  5: 'L5',
  6: 'L6',
  7: 'L7',
  8: 'L8',
  9: 'L9',
  10: 'L10',
  11: 'L11',
  12: 'L12',
  13: 'L13',
  14: 'L14',
};

const ENEMY_ID_BY_ARCHETYPE: EnemyId[] = [
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

const BASELINE_POI_COUNTS: [number, number, number, number][] = [
  [0, 0, 0, 0], // padding
  [1, 1, 1, 1], // L1
  [16, 14, 14, 10], // L2
  [5, 4, 4, 2], // L3
  [5, 4, 4, 3], // L4
  [6, 5, 5, 4], // L5
  [4, 4, 4, 3], // L6
  [3, 3, 3, 2], // L7
  [5, 4, 4, 2], // L8
  [2, 2, 2, 1], // L9
  [2, 2, 2, 1], // L10
  [2, 1, 1, 1], // L11
  [2, 1, 1, 1], // L12
  [2, 2, 2, 2], // L13
  [3, 2, 2, 1], // L14
];

const ACT_ENEMY_TARGETS = [36, 40, 44, 48] as const;
const EASY_POOL = [0, 1, 8, 10, 11] as const;
const MEDIUM_POOL = [2, 3, 5, 9] as const;
const HARD_POOL = [4, 6, 7] as const;
const DISTANCE_POOL_WEIGHTS: [number, number, number][] = [
  [60, 30, 10],
  [40, 40, 20],
  [30, 40, 30],
];
const NEAR_TIER_WEIGHTS = [80, 15, 5] as const;
const FAR_TIER_WEIGHTS = [50, 35, 15] as const;
const ACT_DEFAULT_TIER_WEIGHTS: [number, number, number][] = [
  [70, 25, 5],
  [55, 35, 10],
  [45, 40, 15],
  [35, 45, 20],
];
const ENEMY_BIOME_WEIGHTS: [number, number][] = [
  [2, 1],
  [1, 1],
  [1, 1],
  [1, 2],
  [2, 1],
  [2, 1],
  [1, 1],
  [1, 2],
  [1, 2],
  [1, 2],
  [2, 1],
  [1, 2],
];

enum Direction {
  North = 0,
  South = 1,
  East = 2,
  West = 3,
}

type Cell = {
  visited: boolean;
  north: boolean;
  south: boolean;
  east: boolean;
  west: boolean;
};

class XorShiftRng {
  private state: bigint;

  constructor(seed: number) {
    const normalized = BigInt(Math.max(1, Math.floor(Math.abs(seed))));
    this.state = normalized & 0xffff_ffff_ffff_ffffn;
    if (this.state === 0n) {
      this.state = 1n;
    }
  }

  nextVal(): bigint {
    let x = this.state;
    x ^= x << 13n;
    x ^= x >> 7n;
    x ^= x << 17n;
    this.state = x & 0xffff_ffff_ffff_ffffn;
    return this.state;
  }

  nextBounded(max: number): number {
    if (max <= 0) return 0;
    return Number(this.nextVal() % BigInt(max));
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = this.nextBounded(i + 1);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.nextBounded(items.length)];
  }
}

export function generateMap(params: MapGenerationParams): GeneratedMap {
  const rng = new XorShiftRng(params.seed);
  const campaignLevel = params.campaignLevel ?? 1;
  const tiles = createWallTiles(params.width, params.height);
  const fog = createFog(params.width, params.height);
  const cells = createCells();

  generateMaze(cells, rng);
  carveMazeIntoTiles(cells, tiles);

  const walkableBeforeSpawn = collectWalkableTiles(tiles);
  const spawn = findSpawnPoint(tiles, rng, walkableBeforeSpawn);
  const moleDenPosition = { x: spawn.x, y: spawn.y - 1 };
  tiles[moleDenPosition.y][moleDenPosition.x] = TileType.Floor;

  const walkableTiles = collectWalkableTiles(tiles);
  const pois = placePOIs(walkableTiles, spawn, moleDenPosition, rng, campaignLevel);
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

function createWallTiles(width: number, height: number): TileType[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => TileType.Wall));
}

function createFog(width: number, height: number): FogState[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => FogState.Hidden));
}

function createCells(): Cell[] {
  return Array.from({ length: CELL_GRID_SIZE }, () => ({
    visited: false,
    north: false,
    south: false,
    east: false,
    west: false,
  }));
}

function cellIndex(cx: number, cy: number): number {
  return cy * CELL_GRID_WIDTH + cx;
}

function directionDelta(direction: Direction): [number, number] {
  switch (direction) {
    case Direction.North:
      return [0, -1];
    case Direction.South:
      return [0, 1];
    case Direction.East:
      return [1, 0];
    case Direction.West:
      return [-1, 0];
  }
}

function oppositeDirection(direction: Direction): Direction {
  switch (direction) {
    case Direction.North:
      return Direction.South;
    case Direction.South:
      return Direction.North;
    case Direction.East:
      return Direction.West;
    case Direction.West:
      return Direction.East;
  }
}

function setConnection(cell: Cell, direction: Direction): void {
  if (direction === Direction.North) cell.north = true;
  else if (direction === Direction.South) cell.south = true;
  else if (direction === Direction.East) cell.east = true;
  else cell.west = true;
}

function hasConnection(cell: Cell, direction: Direction): boolean {
  if (direction === Direction.North) return cell.north;
  if (direction === Direction.South) return cell.south;
  if (direction === Direction.East) return cell.east;
  return cell.west;
}

function generateMaze(cells: Cell[], rng: XorShiftRng): void {
  const startCx = rng.nextBounded(CELL_GRID_WIDTH);
  const startCy = rng.nextBounded(CELL_GRID_HEIGHT);
  const stack: Position[] = [{ x: startCx, y: startCy }];
  cells[cellIndex(startCx, startCy)].visited = true;

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const neighbors: Array<{ x: number; y: number; direction: Direction }> = [];

    for (const direction of [Direction.North, Direction.South, Direction.East, Direction.West]) {
      const [dx, dy] = directionDelta(direction);
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (nx < 0 || ny < 0 || nx >= CELL_GRID_WIDTH || ny >= CELL_GRID_HEIGHT) continue;
      if (cells[cellIndex(nx, ny)].visited) continue;
      neighbors.push({ x: nx, y: ny, direction });
    }

    if (neighbors.length === 0) {
      stack.pop();
      continue;
    }

    const next = rng.pick(neighbors);
    setConnection(cells[cellIndex(current.x, current.y)], next.direction);
    setConnection(cells[cellIndex(next.x, next.y)], oppositeDirection(next.direction));
    cells[cellIndex(next.x, next.y)].visited = true;
    stack.push({ x: next.x, y: next.y });
  }

  for (let i = 0; i < EXTRA_CONNECTION_COUNT; i += 1) {
    const cx = rng.nextBounded(CELL_GRID_WIDTH);
    const cy = rng.nextBounded(CELL_GRID_HEIGHT);
    const direction = rng.nextBounded(4) as Direction;
    const [dx, dy] = directionDelta(direction);
    const nx = cx + dx;
    const ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= CELL_GRID_WIDTH || ny >= CELL_GRID_HEIGHT) continue;
    const currentCell = cells[cellIndex(cx, cy)];
    if (hasConnection(currentCell, direction)) continue;
    setConnection(currentCell, direction);
    setConnection(cells[cellIndex(nx, ny)], oppositeDirection(direction));
  }
}

function carveMazeIntoTiles(cells: Cell[], tiles: TileType[][]): void {
  for (let cy = 0; cy < CELL_GRID_HEIGHT; cy += 1) {
    for (let cx = 0; cx < CELL_GRID_WIDTH; cx += 1) {
      const cell = cells[cellIndex(cx, cy)];
      const mapX = cx * CELL_SPACING;
      const mapY = cy * CELL_SPACING;

      tiles[mapY][mapX] = TileType.Floor;

      if (cell.east && cx < CELL_GRID_WIDTH - 1) {
        for (let i = 1; i <= CELL_SPACING; i += 1) {
          tiles[mapY][mapX + i] = TileType.Floor;
        }
      }

      if (cell.south && cy < CELL_GRID_HEIGHT - 1) {
        for (let i = 1; i <= CELL_SPACING; i += 1) {
          tiles[mapY + i][mapX] = TileType.Floor;
        }
      }
    }
  }
}

function collectWalkableTiles(tiles: TileType[][]): Position[] {
  const walkable: Position[] = [];
  for (let y = 0; y < tiles.length; y += 1) {
    for (let x = 0; x < tiles[y].length; x += 1) {
      if (tiles[y][x] === TileType.Floor) {
        walkable.push({ x, y });
      }
    }
  }
  return walkable;
}

function findSpawnPoint(tiles: TileType[][], rng: XorShiftRng, walkableTiles: Position[]): Position {
  let result: Position | null = null;
  let count = 0;

  for (let y = 1; y < tiles.length; y += 1) {
    for (let x = 0; x < tiles[y].length; x += 1) {
      if (tiles[y][x] === TileType.Floor && tiles[y - 1][x] === TileType.Wall) {
        count += 1;
        if (rng.nextVal() % BigInt(count) === 0n) {
          result = { x, y };
        }
      }
    }
  }

  return result ?? walkableTiles[0];
}

function actIndexFromCampaignLevel(campaignLevel: number): number {
  return Math.max(0, Math.min(3, Math.floor((campaignLevel - 1) / 10)));
}

function isBiomeA(campaignLevel: number): boolean {
  const act = actIndexFromCampaignLevel(campaignLevel) + 1;
  return act === 1 || act === 3;
}

function poiTargetCountsForAct(actIndex: number): number[] {
  return BASELINE_POI_COUNTS.map((counts) => counts[actIndex] ?? 0);
}

function isPositionUsed(spawn: Position, moleDen: Position, pois: MapPOI[], position: Position): boolean {
  if (position.x === spawn.x && position.y === spawn.y) return true;
  if (position.x === moleDen.x && position.y === moleDen.y) return true;
  return pois.some((poi) => poi.position.x === position.x && poi.position.y === position.y);
}

function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function isSameTypeSpacingValid(pois: MapPOI[], position: Position, poiType: POIId): boolean {
  return pois.every((poi) => {
    if (poi.definitionId !== poiType) return true;
    return manhattanDistance(position, poi.position) >= POI_MIN_SPACING;
  });
}

function findValidPoiPosition(
  walkableTiles: Position[],
  spawn: Position,
  moleDen: Position,
  pois: MapPOI[],
  poiType: POIId,
  rng: XorShiftRng
): Position | null {
  const shuffled = rng.shuffle([...walkableTiles]);
  for (const position of shuffled) {
    if (isPositionUsed(spawn, moleDen, pois, position)) continue;
    if (!isSameTypeSpacingValid(pois, position, poiType)) continue;
    return position;
  }
  return null;
}

function findReachablePoiPosition(
  walkableTiles: Position[],
  spawn: Position,
  moleDen: Position,
  pois: MapPOI[],
  poiType: POIId,
  maxDistance: number,
  rng: XorShiftRng
): Position | null {
  const shuffled = rng.shuffle([...walkableTiles]);
  for (const position of shuffled) {
    if (isPositionUsed(spawn, moleDen, pois, position)) continue;
    if (manhattanDistance(position, spawn) > maxDistance) continue;
    if (!isSameTypeSpacingValid(pois, position, poiType)) continue;
    return position;
  }
  return null;
}

function findReachableWithoutSpacing(
  walkableTiles: Position[],
  spawn: Position,
  moleDen: Position,
  pois: MapPOI[],
  maxDistance: number,
  rng: XorShiftRng
): Position | null {
  const shuffled = rng.shuffle([...walkableTiles]);
  for (const position of shuffled) {
    if (isPositionUsed(spawn, moleDen, pois, position)) continue;
    if (manhattanDistance(position, spawn) > maxDistance) continue;
    return position;
  }
  return null;
}

function placePOIs(
  walkableTiles: Position[],
  spawn: Position,
  moleDenPosition: Position,
  rng: XorShiftRng,
  campaignLevel: number
): MapPOI[] {
  const pois: MapPOI[] = [
    {
      id: 'poi_L1_0',
      definitionId: 'L1',
      position: moleDenPosition,
      visited: false,
      discovered: false,
    },
  ];

  const targets = poiTargetCountsForAct(actIndexFromCampaignLevel(campaignLevel));
  targets[1] = Math.max(0, targets[1] - 1);
  targets[13] = COUNTER_CACHE_PER_RUN;

  const guaranteedPlacements: Array<{ type: number; maxDistance: number; ignoreSpacingFallback?: boolean }> = [
    { type: 13, maxDistance: COUNTER_CACHE_FIRST_MAX_DISTANCE, ignoreSpacingFallback: true },
    { type: 3, maxDistance: 12 },
    { type: 2, maxDistance: 12 },
    { type: 4, maxDistance: 12 },
  ];

  for (const guarantee of guaranteedPlacements) {
    if (targets[guarantee.type] <= 0 || pois.length >= MAX_POIS) continue;
    const poiType = POI_IDS_BY_TYPE[guarantee.type];
    let position = findReachablePoiPosition(
      walkableTiles,
      spawn,
      moleDenPosition,
      pois,
      poiType,
      guarantee.maxDistance,
      rng
    );
    if (!position && guarantee.ignoreSpacingFallback) {
      position = findReachableWithoutSpacing(
        walkableTiles,
        spawn,
        moleDenPosition,
        pois,
        guarantee.maxDistance,
        rng
      );
    }
    if (!position) continue;
    pois.push({
      id: `poi_${poiType}_${pois.filter((poi) => poi.definitionId === poiType).length}`,
      definitionId: poiType,
      position,
      visited: false,
      discovered: false,
    });
    targets[guarantee.type] -= 1;
  }

  const placementOrder = [12, 11, 10, 9, 8, 7, 14, 13, 3, 6, 5, 4, 2];
  for (const type of placementOrder) {
    const poiType = POI_IDS_BY_TYPE[type];
    for (let count = 0; count < targets[type] && pois.length < MAX_POIS; count += 1) {
      const position = findValidPoiPosition(walkableTiles, spawn, moleDenPosition, pois, poiType, rng);
      if (!position) break;
      pois.push({
        id: `poi_${poiType}_${pois.filter((poi) => poi.definitionId === poiType).length}`,
        definitionId: poiType,
        position,
        visited: false,
        discovered: false,
      });
    }
  }

  return pois;
}

function distancePercentFromSpawn(position: Position, spawn: Position): number {
  const maxDistance = (GAME_CONSTANTS.MAP_WIDTH - 1) + (GAME_CONSTANTS.MAP_HEIGHT - 1);
  const distance = Math.min(maxDistance, manhattanDistance(position, spawn));
  return Math.floor((distance * 100) / maxDistance);
}

function distanceBand(distancePercent: number): 0 | 1 | 2 {
  if (distancePercent <= 33) return 0;
  if (distancePercent <= 66) return 1;
  return 2;
}

function selectPoolForDistance(distancePercent: number, rng: XorShiftRng): readonly number[] {
  const weights = DISTANCE_POOL_WEIGHTS[distanceBand(distancePercent)];
  const roll = rng.nextBounded(100);
  if (roll < weights[0]) return EASY_POOL;
  if (roll < weights[0] + weights[1]) return MEDIUM_POOL;
  return HARD_POOL;
}

function selectTierForDistance(distancePercent: number, campaignLevel: number, rng: XorShiftRng): 1 | 2 | 3 {
  const weights =
    distanceBand(distancePercent) === 0
      ? NEAR_TIER_WEIGHTS
      : distanceBand(distancePercent) === 2
        ? FAR_TIER_WEIGHTS
        : ACT_DEFAULT_TIER_WEIGHTS[actIndexFromCampaignLevel(campaignLevel)];
  const roll = rng.nextBounded(100);
  if (roll < weights[0]) return 1;
  if (roll < weights[0] + weights[1]) return 2;
  return 3;
}

function selectWeightedArchetypeFromPool(
  rng: XorShiftRng,
  campaignLevel: number,
  pool: readonly number[]
): number {
  const biomeIndex = isBiomeA(campaignLevel) ? 0 : 1;
  const totalWeight = pool.reduce((sum, archetypeId) => sum + ENEMY_BIOME_WEIGHTS[archetypeId][biomeIndex], 0);
  let roll = rng.nextBounded(totalWeight);
  for (const archetypeId of pool) {
    roll -= ENEMY_BIOME_WEIGHTS[archetypeId][biomeIndex];
    if (roll < 0) return archetypeId;
  }
  return pool[0];
}

function enforceSafeStartEasyPool(enemies: MapEnemy[], spawn: Position, rng: XorShiftRng, campaignLevel: number) {
  const closest = [...enemies]
    .map((enemy, index) => ({ index, distance: manhattanDistance(enemy.position, spawn) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);

  for (const { index } of closest) {
    const current = enemies[index];
    const currentArchetype = ENEMY_ID_BY_ARCHETYPE.indexOf(current.definitionId);
    if (EASY_POOL.includes(currentArchetype as (typeof EASY_POOL)[number])) continue;
    const archetypeId = selectWeightedArchetypeFromPool(rng, campaignLevel, EASY_POOL);
    const definitionId = ENEMY_ID_BY_ARCHETYPE[archetypeId];
    enemies[index] = {
      ...current,
      definitionId,
      stats: toEnemyStats(definitionId, current.tier),
    };
  }
}

function toEnemyStats(definitionId: EnemyId, tier: 1 | 2 | 3) {
  const stats = ENEMY_DEFINITIONS[definitionId].tiers[tier - 1];
  return {
    hp: stats.hp,
    atk: stats.atk,
    arm: stats.arm,
    spd: stats.spd,
  };
}

function placeEnemies(
  walkableTiles: Position[],
  spawn: Position,
  moleDenPosition: Position,
  pois: MapPOI[],
  rng: XorShiftRng,
  campaignLevel: number
): MapEnemy[] {
  const enemies: MapEnemy[] = [];
  const occupied = new Set<string>([
    `${spawn.x},${spawn.y}`,
    `${moleDenPosition.x},${moleDenPosition.y}`,
    ...pois.map((poi) => `${poi.position.x},${poi.position.y}`),
  ]);
  const shuffledTiles = rng.shuffle([...walkableTiles]);
  const targetCount = Math.min(ACT_ENEMY_TARGETS[actIndexFromCampaignLevel(campaignLevel)], MAX_ENEMIES);

  for (const position of shuffledTiles) {
    if (enemies.length >= targetCount) break;
    const chebyshev = Math.max(Math.abs(position.x - spawn.x), Math.abs(position.y - spawn.y));
    if (chebyshev <= SPAWN_PROTECTION_RADIUS) continue;
    const key = `${position.x},${position.y}`;
    if (occupied.has(key)) continue;

    const distancePercent = distancePercentFromSpawn(position, spawn);
    const tier = selectTierForDistance(distancePercent, campaignLevel, rng);
    const archetypeId = selectWeightedArchetypeFromPool(
      rng,
      campaignLevel,
      selectPoolForDistance(distancePercent, rng)
    );
    const definitionId = ENEMY_ID_BY_ARCHETYPE[archetypeId];

    enemies.push({
      id: `enemy_${enemies.length}`,
      definitionId,
      tier,
      position,
      stats: toEnemyStats(definitionId, tier),
      discovered: false,
    });
    occupied.add(key);
  }

  enforceSafeStartEasyPool(enemies, spawn, rng, campaignLevel);
  return enemies;
}

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
