/**
 * Enemy Movement for PvE Dungeon Crawler
 * Uses greedy step algorithm matching the on-chain select_enemy_step implementation.
 * Enemies within Chebyshev distance 1-3 step toward the player each night move.
 * @see solana-programs/programs/gameplay-state/src/lib.rs select_enemy_step
 * @see solana-programs/programs/gameplay-state/src/movement.rs chebyshev_distance
 */

import type { Position } from '../engine/types';
import { TileType, type GameMap, type MapEnemy } from './types';

// ============================================================================
// Distance
// ============================================================================

/**
 * Chebyshev distance (max of absolute deltas). Matches on-chain chebyshev_distance().
 */
function chebyshevDistance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

// ============================================================================
// Greedy Step (matches on-chain select_enemy_step)
// ============================================================================

/**
 * Select the next step for an enemy toward the player.
 * Greedy: try the axis with the larger delta first, then the other axis.
 * Matches on-chain select_enemy_step() exactly.
 *
 * @param enemyPos - Current enemy position
 * @param playerPos - Player position
 * @param map - The game map (for bounds and walkability)
 * @param occupied - Set of "x,y" strings for tiles occupied by other enemies
 * @param playerTileBlocked - Whether another enemy already reached the player tile this turn
 * @returns Next position or null if no valid step
 */
function selectEnemyStep(
  enemyPos: Position,
  playerPos: Position,
  map: GameMap,
  occupied: Set<string>,
  playerTileBlocked: boolean
): Position | null {
  const dx = playerPos.x - enemyPos.x;
  const dy = playerPos.y - enemyPos.y;

  if (dx === 0 && dy === 0) {
    return null;
  }

  // Step toward delta: +1 or -1 in that axis, keeping the other axis fixed
  const xStep: Position | null =
    dx !== 0 ? { x: enemyPos.x + (dx > 0 ? 1 : -1), y: enemyPos.y } : null;
  const yStep: Position | null =
    dy !== 0 ? { x: enemyPos.x, y: enemyPos.y + (dy > 0 ? 1 : -1) } : null;

  // Prioritize the axis with the larger absolute delta (matches on-chain: dx.abs() >= dy.abs())
  const candidates: (Position | null)[] =
    Math.abs(dx) >= Math.abs(dy) ? [xStep, yStep] : [yStep, xStep];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const { x: cx, y: cy } = candidate;

    // Out of bounds
    if (cx < 0 || cx >= map.width || cy < 0 || cy >= map.height) continue;

    // Wall (not walkable)
    if (map.tiles[cy][cx] === TileType.Wall) continue;

    // Player tile
    if (cx === playerPos.x && cy === playerPos.y) {
      if (playerTileBlocked) continue;
      return candidate;
    }

    // Occupied by another enemy
    if (occupied.has(`${cx},${cy}`)) continue;

    return candidate;
  }

  return null;
}

// ============================================================================
// Night Movement (matches on-chain move_player night enemy loop)
// ============================================================================

/**
 * Move all enemies one step toward the player during Night phase.
 * Matches the on-chain algorithm:
 * - Only enemies within Chebyshev distance 1-3 move
 * - Greedy step (larger delta axis first)
 * - Occupied grid updated as enemies move
 * - Only one enemy can reach the player tile (player_tile_blocked)
 * - First enemy reaching the player triggers combat
 *
 * @param map - The game map
 * @param playerPosition - The player's current position
 */
export function moveEnemiesNight(
  map: GameMap,
  playerPosition: Position
): { updatedEnemies: MapEnemy[]; combatTriggered: string | null } {
  // Build occupied grid from current enemy positions
  const occupied = new Set<string>();
  for (const enemy of map.enemies) {
    occupied.add(`${enemy.position.x},${enemy.position.y}`);
  }

  const updatedEnemies: MapEnemy[] = [];
  let combatTriggered: string | null = null;
  let playerTileBlocked = false;

  // Process enemies in deterministic order (by id for consistency)
  const sortedEnemies = [...map.enemies].sort((a, b) => a.id.localeCompare(b.id));

  for (const enemy of sortedEnemies) {
    const distance = chebyshevDistance(enemy.position, playerPosition);

    // Only enemies within Chebyshev distance 1-3 move (matches on-chain)
    if (distance > 0 && distance <= 3) {
      // Remove enemy from old position in occupied grid
      const oldKey = `${enemy.position.x},${enemy.position.y}`;

      const nextPos = selectEnemyStep(
        enemy.position,
        playerPosition,
        map,
        occupied,
        playerTileBlocked
      );

      if (nextPos) {
        // Update occupied grid
        occupied.delete(oldKey);
        if (nextPos.x === playerPosition.x && nextPos.y === playerPosition.y) {
          playerTileBlocked = true;
        } else {
          occupied.add(`${nextPos.x},${nextPos.y}`);
        }

        updatedEnemies.push({ ...enemy, position: nextPos });

        // First enemy reaching player triggers combat
        if (
          !combatTriggered &&
          nextPos.x === playerPosition.x &&
          nextPos.y === playerPosition.y
        ) {
          combatTriggered = enemy.id;
        }
      } else {
        // No valid move, stay in place
        updatedEnemies.push(enemy);
      }
    } else {
      // Out of range, stay in place
      updatedEnemies.push(enemy);
    }
  }

  return { updatedEnemies, combatTriggered };
}

// ============================================================================
// Re-exported Helpers
// ============================================================================

/**
 * Get the next step for an enemy to move toward the player.
 * Uses the on-chain greedy algorithm.
 */
export function getNextEnemyMove(
  map: GameMap,
  enemy: MapEnemy,
  playerPosition: Position,
  enemies: MapEnemy[]
): Position | null {
  const occupied = new Set<string>();
  for (const e of enemies) {
    if (e.position.x !== enemy.position.x || e.position.y !== enemy.position.y) {
      occupied.add(`${e.position.x},${e.position.y}`);
    }
  }
  return selectEnemyStep(enemy.position, playerPosition, map, occupied, false);
}

/**
 * Calculate Manhattan distance between two positions.
 */
function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Check if two positions are adjacent (Manhattan distance of 1).
 */
export function isAdjacent(a: Position, b: Position): boolean {
  return manhattanDistance(a, b) === 1;
}

/**
 * Check if a position is within visibility range.
 * During Night, sight radius is 3 tiles.
 */
export function isWithinSightRange(
  position: Position,
  playerPosition: Position,
  sightRadius: number
): boolean {
  return manhattanDistance(position, playerPosition) <= sightRadius;
}
