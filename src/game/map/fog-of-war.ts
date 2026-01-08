/**
 * Fog of War visibility calculations
 * @see specs/001-pve-dungeon-crawler/research.md R1
 * @see specs/001-pve-dungeon-crawler/data-model.md
 */

import type { Position } from '../engine/types';
import { SIGHT_RADIUS, GAME_CONSTANTS } from '../engine/constants';
import { TileType, FogState, GameMap } from './types';

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get all tiles within a given circular radius from center.
 */
export function getTilesInRadius(center: Position, radius: number): Position[] {
  const tiles: Position[] = [];
  const effectiveRadius = radius + 0.5;
  const maxDistance = effectiveRadius * effectiveRadius;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const distance = dx * dx + dy * dy;
      if (distance <= maxDistance) {
        tiles.push({ x: center.x + dx, y: center.y + dy });
      }
    }
  }

  return tiles;
}

/**
 * Check if line of sight is clear between two positions.
 * Uses Bresenham's line algorithm to trace the path.
 */
export function isLineOfSightClear(
  map: GameMap,
  from: Position,
  to: Position
): boolean {
  // Same position is always clear
  if (from.x === to.x && from.y === to.y) {
    return true;
  }

  // Use Bresenham's line algorithm
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const sx = from.x < to.x ? 1 : -1;
  const sy = from.y < to.y ? 1 : -1;
  let err = dx - dy;

  let x = from.x;
  let y = from.y;

  while (x !== to.x || y !== to.y) {
    // Check if current position is a wall (blocking)
    // Skip the starting position
    if ((x !== from.x || y !== from.y) && (x !== to.x || y !== to.y)) {
      if (
        x >= 0 && x < map.width &&
        y >= 0 && y < map.height &&
        map.tiles[y][x] === TileType.Wall
      ) {
        return false;
      }
    }

    const e2 = 2 * err;

    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }

    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }

  return true;
}

/**
 * Update fog of war based on player position.
 * Returns a new map with updated fog state (immutable).
 *
 * @param map - Current game map
 * @param playerPos - Player's current position
 * @param isDay - Whether it's currently day (affects sight radius)
 * @param overrideRadius - Optional radius override (for initial reveal)
 * @returns New map with updated fog state
 */
export function updateFogOfWar(
  map: GameMap,
  playerPos: Position,
  isDay: boolean,
  overrideRadius?: number
): GameMap {
  // Create deep copy of fog
  const newFog: FogState[][] = map.fog.map(row => [...row]);

  // Convert currently Visible tiles to Revealed
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (newFog[y][x] === FogState.Visible) {
        newFog[y][x] = FogState.Revealed;
      }
    }
  }

  // Determine sight radius
  const radius = overrideRadius ?? (isDay ? SIGHT_RADIUS.day : SIGHT_RADIUS.night);

  // Get all tiles within radius
  const tilesInRadius = getTilesInRadius(playerPos, radius);

  // Mark visible tiles (no line of sight blocking)
  for (const tile of tilesInRadius) {
    if (
      tile.x >= 0 && tile.x < map.width &&
      tile.y >= 0 && tile.y < map.height
    ) {
      newFog[tile.y][tile.x] = FogState.Visible;
    }
  }

  return {
    ...map,
    fog: newFog,
  };
}

/**
 * Apply initial visibility when spawning (radius 7).
 */
export function applyInitialVisibility(map: GameMap, spawnPos: Position): GameMap {
  return updateFogOfWar(map, spawnPos, true, GAME_CONSTANTS.INITIAL_SIGHT_RADIUS);
}

/**
 * Get the current visibility state of a specific tile.
 */
export function getTileVisibility(map: GameMap, pos: Position): FogState {
  if (pos.x < 0 || pos.x >= map.width || pos.y < 0 || pos.y >= map.height) {
    return FogState.Hidden;
  }
  return map.fog[pos.y][pos.x];
}

/**
 * Check if a tile has been seen (Visible or Revealed).
 */
export function hasBeenSeen(map: GameMap, pos: Position): boolean {
  const visibility = getTileVisibility(map, pos);
  return visibility === FogState.Visible || visibility === FogState.Revealed;
}

/**
 * Check if a tile is currently visible.
 */
export function isCurrentlyVisible(map: GameMap, pos: Position): boolean {
  return getTileVisibility(map, pos) === FogState.Visible;
}

/**
 * Count tiles by fog state.
 */
export function countTilesByFogState(map: GameMap): Record<FogState, number> {
  const counts: Record<FogState, number> = {
    [FogState.Hidden]: 0,
    [FogState.Revealed]: 0,
    [FogState.Visible]: 0,
  };

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      counts[map.fog[y][x]]++;
    }
  }

  return counts;
}
