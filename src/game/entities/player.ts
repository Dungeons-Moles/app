/**
 * Player entity logic for PvE Dungeon Crawler
 * @see specs/001-pve-dungeon-crawler/data-model.md
 */

import type { Position, Player, PlayerStats } from '../engine/types';
import { DEFAULT_STATUS_EFFECTS } from '../engine/types';
import { GAME_CONSTANTS } from '../engine/constants';

// ============================================================================
// Player Creation
// ============================================================================

/**
 * Create a new player entity with initial stats.
 */
export function createPlayer(spawnPosition: Position): Player {
  const baseStats: PlayerStats = {
    hp: GAME_CONSTANTS.INITIAL_HP,
    maxHp: GAME_CONSTANTS.INITIAL_HP,
    atk: GAME_CONSTANTS.INITIAL_ATK,
    arm: GAME_CONSTANTS.INITIAL_ARM,
    spd: GAME_CONSTANTS.INITIAL_SPD,
    dig: GAME_CONSTANTS.INITIAL_DIG,
    gold: GAME_CONSTANTS.INITIAL_GOLD,
  };

  return {
    position: spawnPosition,
    baseStats,
    stats: { ...baseStats }, // Computed stats (will be updated with items)
    equippedTool: null,
    inventory: [],
    inventoryCapacity: GAME_CONSTANTS.INITIAL_INVENTORY_SLOTS,
    statusEffects: { ...DEFAULT_STATUS_EFFECTS },
    activeItemsets: [],
  };
}

// ============================================================================
// Position Helpers
// ============================================================================

/**
 * Get Manhattan distance between two positions.
 */
export function getDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Check if two positions are adjacent (distance of 1).
 */
export function isAdjacent(a: Position, b: Position): boolean {
  return getDistance(a, b) === 1;
}

/**
 * Check if position is within bounds.
 */
export function isInBounds(pos: Position, width: number, height: number): boolean {
  return pos.x >= 0 && pos.x < width && pos.y >= 0 && pos.y < height;
}

// ============================================================================
// Stats Calculation
// ============================================================================

/**
 * Recalculate player stats based on equipped items.
 */
export function recalculateStats(player: Player): Player {
  // Start with base stats
  const stats: PlayerStats = { ...player.baseStats };

  // Add tool stats
  if (player.equippedTool) {
    const toolStats = player.equippedTool.stats;
    if (toolStats.atk) stats.atk += toolStats.atk;
    if (toolStats.arm) stats.arm += toolStats.arm;
    if (toolStats.spd) stats.spd += toolStats.spd;
    if (toolStats.dig) stats.dig += toolStats.dig;
    if (toolStats.hp) {
      stats.maxHp += toolStats.hp;
      stats.hp = Math.min(stats.hp, stats.maxHp);
    }
  }

  // Add gear stats
  for (const slot of player.inventory) {
    const gearStats = slot.item.stats;
    if (gearStats.atk) stats.atk += gearStats.atk;
    if (gearStats.arm) stats.arm += gearStats.arm;
    if (gearStats.spd) stats.spd += gearStats.spd;
    if (gearStats.dig) stats.dig += gearStats.dig;
    if (gearStats.hp) {
      stats.maxHp += gearStats.hp;
      stats.hp = Math.min(stats.hp, stats.maxHp);
    }
  }

  return {
    ...player,
    stats,
  };
}

// ============================================================================
// Inventory Management
// ============================================================================

/**
 * Check if player has room in inventory.
 */
export function hasInventorySpace(player: Player): boolean {
  return player.inventory.length < player.inventoryCapacity;
}

/**
 * Get number of available inventory slots.
 */
export function getAvailableSlots(player: Player): number {
  return player.inventoryCapacity - player.inventory.length;
}

/**
 * Increase inventory capacity (at start of day).
 */
export function increaseInventoryCapacity(player: Player): Player {
  const newCapacity = Math.min(
    player.inventoryCapacity + GAME_CONSTANTS.INVENTORY_SLOTS_PER_DAY,
    GAME_CONSTANTS.MAX_INVENTORY_SLOTS
  );

  return {
    ...player,
    inventoryCapacity: newCapacity,
  };
}

// ============================================================================
// Health Management
// ============================================================================

/**
 * Apply damage to player.
 */
export function applyDamage(player: Player, amount: number): Player {
  const newHp = Math.max(0, player.stats.hp - amount);

  return {
    ...player,
    stats: {
      ...player.stats,
      hp: newHp,
    },
  };
}

/**
 * Heal player.
 */
export function healPlayer(player: Player, amount: number): Player {
  const newHp = Math.min(player.stats.maxHp, player.stats.hp + amount);

  return {
    ...player,
    stats: {
      ...player.stats,
      hp: newHp,
    },
  };
}

/**
 * Fully restore player HP.
 */
export function fullHeal(player: Player): Player {
  return {
    ...player,
    stats: {
      ...player.stats,
      hp: player.stats.maxHp,
    },
  };
}

/**
 * Check if player is alive.
 */
export function isAlive(player: Player): boolean {
  return player.stats.hp > 0;
}

/**
 * Check if player is wounded (below 50% HP).
 */
export function isWounded(player: Player): boolean {
  return player.stats.hp < player.stats.maxHp * 0.5;
}

// ============================================================================
// Status Effects
// ============================================================================

/**
 * Apply status effect stacks to player.
 */
export function applyStatusEffect(
  player: Player,
  effect: 'chill' | 'shrapnel' | 'rust',
  stacks: number
): Player {
  return {
    ...player,
    statusEffects: {
      ...player.statusEffects,
      [effect]: player.statusEffects[effect] + stacks,
    },
  };
}

/**
 * Remove status effect stacks from player.
 */
export function removeStatusEffect(
  player: Player,
  effect: 'chill' | 'shrapnel' | 'rust',
  stacks: number
): Player {
  return {
    ...player,
    statusEffects: {
      ...player.statusEffects,
      [effect]: Math.max(0, player.statusEffects[effect] - stacks),
    },
  };
}

/**
 * Clear all status effects.
 */
export function clearStatusEffects(player: Player): Player {
  return {
    ...player,
    statusEffects: { ...DEFAULT_STATUS_EFFECTS },
  };
}

// ============================================================================
// Movement
// ============================================================================

/**
 * Move player to new position.
 */
export function movePlayer(player: Player, newPosition: Position): Player {
  return {
    ...player,
    position: newPosition,
  };
}
