/**
 * Dig mechanic helpers.
 * @see specs/003-gdd-mechanics-update/spec.md
 */

import { WALL_BREAK_BASE_COST, WALL_BREAK_MIN_COST, WALL_BREAK_MIN_DIG } from '../engine/constants';
import type { Position } from '../engine/types';
import type { GameMap } from './types';
import { TileType } from './types';

/**
 * Calculate the move cost to dig a wall based on DIG stat.
 * Formula: max(2, 6 - DIG)
 */
export function calculateDigCost(dig: number): number | null {
  if (dig < WALL_BREAK_MIN_DIG) {
    return null;
  }

  return Math.max(WALL_BREAK_MIN_COST, WALL_BREAK_BASE_COST - dig);
}

/**
 * Check if a wall can be dug at the given position.
 */
export function canDig(map: GameMap, position: Position): boolean {
  if (position.x < 0 || position.y < 0 || position.x >= map.width || position.y >= map.height) {
    return false;
  }

  return map.tiles[position.y]?.[position.x] === TileType.Wall;
}

/**
 * Execute dig, converting wall to floor.
 */
export function executeDig(map: GameMap, position: Position): GameMap {
  if (position.x < 0 || position.y < 0 || position.x >= map.width || position.y >= map.height) {
    return map;
  }

  if (map.tiles[position.y][position.x] !== TileType.Wall) {
    return map;
  }

  const tiles = map.tiles.map((row, y) =>
    y === position.y ? row.map((tile, x) => (x === position.x ? TileType.Floor : tile)) : [...row]
  );

  return {
    ...map,
    tiles,
  };
}
