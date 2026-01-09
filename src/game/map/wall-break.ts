/**
 * Wall break helpers for DIG stat.
 * @see specs/002-qol-balance-batch/contracts/wall-break.md
 */

import { WALL_BREAK_BASE_COST, WALL_BREAK_MIN_COST, WALL_BREAK_MIN_DIG } from '../engine/constants';
import type { Position } from '../engine/types';
import type { GameMap } from './types';
import { TileType } from './types';

/**
 * Calculate the move cost to break a wall based on DIG stat.
 */
export function calculateWallBreakCost(dig: number): number | null {
  if (dig < WALL_BREAK_MIN_DIG) {
    return null;
  }

  return Math.max(WALL_BREAK_MIN_COST, WALL_BREAK_BASE_COST - dig);
}

/**
 * Check if a wall can be broken at the given position.
 */
export function canBreakWall(map: GameMap, position: Position): boolean {
  if (
    position.x <= 0 ||
    position.y <= 0 ||
    position.x >= map.width - 1 ||
    position.y >= map.height - 1
  ) {
    return false;
  }

  return map.tiles[position.y]?.[position.x] === TileType.Wall;
}

/**
 * Execute wall break, converting wall to floor.
 */
export function breakWall(map: GameMap, position: Position): GameMap {
  if (
    position.x < 0 ||
    position.y < 0 ||
    position.x >= map.width ||
    position.y >= map.height
  ) {
    return map;
  }

  if (map.tiles[position.y][position.x] !== TileType.Wall) {
    return map;
  }

  const tiles = map.tiles.map((row, y) =>
    y === position.y
      ? row.map((tile, x) => (x === position.x ? TileType.Floor : tile))
      : [...row]
  );

  return {
    ...map,
    tiles,
  };
}
