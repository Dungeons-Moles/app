/**
 * Pathfinding for PvE Dungeon Crawler
 * Uses A* algorithm for enemy movement toward player during Night phase.
 * @see specs/001-pve-dungeon-crawler/spec.md FR-043
 * @see specs/001-pve-dungeon-crawler/research.md
 */

import type { Position } from '../engine/types';
import type { SeededRNG } from '../engine/rng';
import { TileType, type GameMap, type MapEnemy } from './types';

// ============================================================================
// Types
// ============================================================================

interface PathNode {
  position: Position;
  g: number; // Cost from start
  h: number; // Heuristic (estimated cost to goal)
  f: number; // Total cost (g + h)
  parent: PathNode | null;
}

// ============================================================================
// A* Pathfinding
// ============================================================================

/**
 * Find the shortest path from start to goal using A* algorithm.
 * Returns array of positions from start to goal (excluding start), or empty if no path.
 * Uses seeded RNG for deterministic tie-breaking when multiple nodes have equal f-cost.
 *
 * @param map - The game map with tiles
 * @param start - Starting position
 * @param goal - Target position
 * @param enemies - Current enemies on map (to avoid occupied tiles)
 * @param rng - Seeded RNG for deterministic tie-breaking
 * @param maxSteps - Maximum number of search iterations (prevents infinite loops)
 */
export function findPath(
  map: GameMap,
  start: Position,
  goal: Position,
  enemies: MapEnemy[],
  rng: SeededRNG,
  maxSteps: number = 1000
): Position[] {
  // Quick check: if start equals goal, return empty path
  if (start.x === goal.x && start.y === goal.y) {
    return [];
  }

  // Create set of occupied positions (other enemies)
  const occupiedPositions = new Set<string>();
  for (const enemy of enemies) {
    // Don't block on the moving enemy's own position
    if (enemy.position.x !== start.x || enemy.position.y !== start.y) {
      occupiedPositions.add(`${enemy.position.x},${enemy.position.y}`);
    }
  }

  const openSet: PathNode[] = [];
  const closedSet = new Set<string>();

  // Start node
  const startNode: PathNode = {
    position: start,
    g: 0,
    h: manhattanDistance(start, goal),
    f: manhattanDistance(start, goal),
    parent: null,
  };
  openSet.push(startNode);

  // Direction vectors (cardinal directions only)
  const directions = [
    { x: 0, y: -1 }, // Up
    { x: 0, y: 1 },  // Down
    { x: -1, y: 0 }, // Left
    { x: 1, y: 0 },  // Right
  ];

  let steps = 0;
  while (openSet.length > 0 && steps < maxSteps) {
    steps++;

    // Find node with lowest f-cost
    // Use RNG for tie-breaking to ensure determinism
    openSet.sort((a, b) => {
      if (a.f !== b.f) return a.f - b.f;
      // Tie-break by h (prefer closer to goal)
      if (a.h !== b.h) return a.h - b.h;
      // Final tie-break by position for determinism
      if (a.position.x !== b.position.x) return a.position.x - b.position.x;
      return a.position.y - b.position.y;
    });

    const current = openSet.shift()!;
    const currentKey = `${current.position.x},${current.position.y}`;

    // Check if we reached the goal
    if (current.position.x === goal.x && current.position.y === goal.y) {
      return reconstructPath(current);
    }

    closedSet.add(currentKey);

    // Explore neighbors
    for (const dir of directions) {
      const neighborPos: Position = {
        x: current.position.x + dir.x,
        y: current.position.y + dir.y,
      };

      const neighborKey = `${neighborPos.x},${neighborPos.y}`;

      // Skip if out of bounds
      if (
        neighborPos.x < 0 ||
        neighborPos.x >= map.width ||
        neighborPos.y < 0 ||
        neighborPos.y >= map.height
      ) {
        continue;
      }

      // Skip if already evaluated
      if (closedSet.has(neighborKey)) {
        continue;
      }

      // Skip if wall
      const tile = map.tiles[neighborPos.y][neighborPos.x];
      if (tile === TileType.Wall) {
        continue;
      }

      // Skip if occupied by another enemy (unless it's the goal - player position)
      if (
        occupiedPositions.has(neighborKey) &&
        !(neighborPos.x === goal.x && neighborPos.y === goal.y)
      ) {
        continue;
      }

      // Calculate costs (all walkable tiles have cost 1 for enemy movement)
      const tentativeG = current.g + 1;

      // Check if this path to neighbor is better
      const existingNode = openSet.find(
        n => n.position.x === neighborPos.x && n.position.y === neighborPos.y
      );

      if (existingNode) {
        if (tentativeG < existingNode.g) {
          existingNode.g = tentativeG;
          existingNode.f = tentativeG + existingNode.h;
          existingNode.parent = current;
        }
      } else {
        const h = manhattanDistance(neighborPos, goal);
        openSet.push({
          position: neighborPos,
          g: tentativeG,
          h,
          f: tentativeG + h,
          parent: current,
        });
      }
    }
  }

  // No path found
  return [];
}

/**
 * Get the next step for an enemy to move toward the player.
 * Returns the next position to move to, or null if no valid move.
 *
 * @param map - The game map
 * @param enemy - The enemy to move
 * @param playerPosition - The player's current position
 * @param enemies - All enemies on the map
 * @param rng - Seeded RNG for deterministic behavior
 */
export function getNextEnemyMove(
  map: GameMap,
  enemy: MapEnemy,
  playerPosition: Position,
  enemies: MapEnemy[],
  rng: SeededRNG
): Position | null {
  const path = findPath(map, enemy.position, playerPosition, enemies, rng);

  if (path.length === 0) {
    // No path to player, stay in place or return null
    return null;
  }

  // Return the first step of the path
  return path[0];
}

/**
 * Move all enemies one step toward the player during Night phase.
 * Returns updated enemy positions and whether combat should trigger.
 *
 * @param map - The game map
 * @param playerPosition - The player's current position
 * @param rng - Seeded RNG for deterministic behavior
 */
export function moveEnemiesNight(
  map: GameMap,
  playerPosition: Position,
  rng: SeededRNG
): { updatedEnemies: MapEnemy[]; combatTriggered: string | null } {
  const updatedEnemies: MapEnemy[] = [];
  let combatTriggered: string | null = null;

  // Process enemies in deterministic order (by id for consistency)
  const sortedEnemies = [...map.enemies].sort((a, b) => a.id.localeCompare(b.id));

  for (const enemy of sortedEnemies) {
    // Find path to player
    const nextMove = getNextEnemyMove(
      map,
      enemy,
      playerPosition,
      updatedEnemies, // Use updated positions for collision detection
      rng
    );

    if (nextMove) {
      // Check if enemy would reach player position
      if (nextMove.x === playerPosition.x && nextMove.y === playerPosition.y) {
        // Enemy reaches player - trigger combat
        // Don't move the enemy yet, combat will handle it
        updatedEnemies.push({
          ...enemy,
          position: nextMove,
        });
        if (!combatTriggered) {
          combatTriggered = enemy.id;
        }
      } else {
        // Move enemy to next position
        updatedEnemies.push({
          ...enemy,
          position: nextMove,
        });
      }
    } else {
      // No valid move, enemy stays in place
      updatedEnemies.push(enemy);
    }
  }

  return { updatedEnemies, combatTriggered };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate Manhattan distance between two positions.
 */
function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Reconstruct the path from goal node back to start.
 * Returns array of positions from start to goal (excluding start).
 */
function reconstructPath(goalNode: PathNode): Position[] {
  const path: Position[] = [];
  let current: PathNode | null = goalNode;

  while (current !== null && current.parent !== null) {
    path.unshift(current.position);
    current = current.parent;
  }

  return path;
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
