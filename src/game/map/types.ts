/**
 * Map types for PvE Dungeon Crawler
 * @see specs/001-pve-dungeon-crawler/data-model.md
 */

import type { Position } from '../engine/types';

// ============================================================================
// Tile Types
// ============================================================================

export enum TileType {
  Floor = 'FLOOR',  // Walkable corridor
  Wall = 'WALL',    // Impassable environment (black + rock emoji)
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
  | 'BURROW_AMBUSHER';

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

// ============================================================================
// POI Types
// ============================================================================

export type POIId =
  | 'L1'   // Mole Den
  | 'L2'   // Supply Cache
  | 'L3'   // Tool Crate
  | 'L4'   // Tool Oil Rack
  | 'L5'   // Rest Alcove
  | 'L6'   // Survey Beacon
  | 'L7'   // Seismic Scanner
  | 'L8'   // Rail Waypoint
  | 'L9'   // Smuggler Hatch
  | 'L10'  // Rusty Anvil
  | 'L11'  // Crusher Golem
  | 'L12'; // Geode Vault

export type POIRarity = 'FIXED' | 'COMMON' | 'UNCOMMON' | 'RARE';

export interface MapPOI {
  id: string;
  definitionId: POIId;
  position: Position;
  visited: boolean;
  discovered: boolean;
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
