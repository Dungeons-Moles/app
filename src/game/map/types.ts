/**
 * Map types for PvE Dungeon Crawler
 * @see specs/001-pve-dungeon-crawler/data-model.md
 */

import type { Position, POIId } from '../engine/types';

// ============================================================================
// Tile Types
// ============================================================================

export enum TileType {
  Floor = 'FLOOR', // Walkable corridor
  Wall = 'WALL', // Impassable environment (black + rock emoji)
  Unknown = 'UNKNOWN', // Undiscovered tile with private layout
}

// ============================================================================
// Fog State
// ============================================================================

export enum FogState {
  Hidden = 'HIDDEN',
  Revealed = 'REVEALED',
  Visible = 'VISIBLE',
}

// ============================================================================
// Tile Movement Costs
// ============================================================================

export const TILE_MOVE_COST: Record<TileType, number> = {
  [TileType.Floor]: 1,
  [TileType.Wall]: Infinity,
  [TileType.Unknown]: 1,
};

// ============================================================================
// Enemy Types
// ============================================================================

export type EnemyId =
  | 'TUNNEL_RAT'
  | 'CAVE_BAT'
  | 'SPORE_SLIME'
  | 'RUST_MITE_SWARM'
  | 'COLLAPSED_MINER'
  | 'SHARD_BEETLE'
  | 'TUNNEL_WARDEN'
  | 'BURROW_AMBUSHER'
  | 'FROST_WISP'
  | 'POWDER_TICK'
  | 'COIN_SLUG'
  | 'BLOOD_MOSQUITO';

export interface EnemyStats {
  hp: number;
  atk: number;
  arm: number;
  spd: number;
}

export interface MapEnemy {
  id: string;
  definitionId: EnemyId;
  tier: 1 | 2 | 3;
  position: Position;
  stats: EnemyStats;
  discovered: boolean;
}

export type POIRarity = 'FIXED' | 'COMMON' | 'UNCOMMON' | 'RARE';

export interface MapPOI {
  id: string;
  definitionId: POIId;
  position: Position;
  visited: boolean;
  discovered: boolean;
  mapPoisIndex?: number;
}

// ============================================================================
// Game Map
// ============================================================================

export interface GameMap {
  width: number;
  height: number;
  tiles: TileType[][];
  fog: FogState[][];
  enemies: MapEnemy[];
  pois: MapPOI[];
  moleDenPosition: Position;
}
