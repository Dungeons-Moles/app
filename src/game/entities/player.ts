/**
 * Player Entity Logic - T077, T078, T079, T080
 * Player state management, inventory, stats calculation
 * @see specs/001-pve-dungeon-crawler/data-model.md
 */

import type {
  Player,
  PlayerStats,
  Tool,
  Gear,
  InventorySlot,
  Position,
  GearId,
  StatusEffects,
} from '../engine/types';
import { DEFAULT_STATUS_EFFECTS } from '../engine/types';
import { GAME_CONSTANTS, getBaseGold, getBaseHp } from '../engine/constants';
import { calculateItemStats, createToolInstance } from './items';
import { getActiveItemsets } from './itemsets';

// ============================================================================
// Player Creation
// ============================================================================

/**
 * Create a new player entity with initial stats.
 */
export function createPlayer(spawnPosition: Position, campaignLevel = 1): Player {
  const initialHp = getBaseHp(campaignLevel);
  const initialGold = getBaseGold(campaignLevel);
  const baseStats: PlayerStats = {
    hp: initialHp,
    maxHp: initialHp,
    atk: GAME_CONSTANTS.INITIAL_ATK,
    arm: GAME_CONSTANTS.INITIAL_ARM,
    spd: GAME_CONSTANTS.INITIAL_SPD,
    dig: GAME_CONSTANTS.INITIAL_DIG,
    gold: initialGold,
  };

  const player: Player = {
    position: spawnPosition,
    baseStats,
    stats: { ...baseStats },
    equippedTool: createToolInstance('T0'),
    inventory: [],
    inventoryCapacity: GAME_CONSTANTS.INITIAL_INVENTORY_SLOTS,
    statusEffects: { ...DEFAULT_STATUS_EFFECTS },
    activeItemsets: [],
    facing: 'right',
  };

  return refreshPlayerStats(player);
}

/**
 * Alias for createPlayer (for compatibility)
 */
export function createInitialPlayer(startPosition: Position): Player {
  return createPlayer(startPosition);
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
// Stat Calculation - T078
// ============================================================================

/**
 * Calculate computed stats from base stats + equipped items
 */
export function calculatePlayerStats(player: Player): PlayerStats {
  const { baseStats, equippedTool, inventory } = player;
  const gearItems = inventory.map((slot) => slot.item);

  // Get stat bonuses from equipment
  const itemStats = calculateItemStats(equippedTool, gearItems);

  return {
    hp: baseStats.hp + (itemStats.hp ?? 0),
    maxHp: baseStats.maxHp + (itemStats.hp ?? 0),
    atk: baseStats.atk + (itemStats.atk ?? 0),
    arm: baseStats.arm + (itemStats.arm ?? 0),
    spd: baseStats.spd + (itemStats.spd ?? 0),
    dig: baseStats.dig + (itemStats.dig ?? 0),
    gold: baseStats.gold, // Gold is not affected by items
  };
}

/**
 * Update player with recalculated stats and active itemsets.
 * Ensures HP never exceeds maxHP (can happen when gear bonuses are recalculated
 * after on-chain operations that don't account for gear).
 */
export function refreshPlayerStats(player: Player): Player {
  const gearIds = player.inventory.map((slot) => slot.item.id);
  const toolId = player.equippedTool?.id ?? null;
  const stats = calculatePlayerStats(player);

  // Cap HP at maxHP to prevent HP > maxHP edge cases
  // This can occur when on-chain healing/combat sets baseStats.hp to a value
  // that, when gear HP bonus is added, exceeds the calculated maxHP.
  if (stats.hp > stats.maxHp) {
    stats.hp = stats.maxHp;
  }

  return {
    ...player,
    stats,
    activeItemsets: getActiveItemsets(toolId, gearIds),
  };
}

/**
 * Recalculate player stats based on equipped items.
 * Alias for refreshPlayerStats.
 */
export function recalculateStats(player: Player): Player {
  return refreshPlayerStats(player);
}

// ============================================================================
// Tool Equipping - T079
// ============================================================================

/**
 * Equip a tool to the weapon slot
 * Replaces any existing tool (old tool is lost)
 */
export function equipTool(player: Player, tool: Tool): Player {
  const updatedPlayer: Player = {
    ...player,
    equippedTool: tool,
  };

  return refreshPlayerStats(updatedPlayer);
}

/**
 * Unequip current tool (returns null if no tool equipped)
 */
export function unequipTool(player: Player): { player: Player; tool: Tool | null } {
  const tool = player.equippedTool;
  const updatedPlayer: Player = {
    ...player,
    equippedTool: null,
  };

  return {
    player: refreshPlayerStats(updatedPlayer),
    tool,
  };
}

/**
 * Check if player has a tool equipped
 */
export function hasToolEquipped(player: Player): boolean {
  return player.equippedTool !== null;
}

// ============================================================================
// Inventory Management - T080
// ============================================================================

/**
 * Check if inventory has available space
 */
export function hasInventorySpace(player: Player): boolean {
  return player.inventory.length < player.inventoryCapacity;
}

/**
 * Get number of free inventory slots
 */
export function getFreeSlots(player: Player): number {
  return player.inventoryCapacity - player.inventory.length;
}

/**
 * Get number of available inventory slots.
 * Alias for getFreeSlots.
 */
export function getAvailableSlots(player: Player): number {
  return getFreeSlots(player);
}

/**
 * Add gear to inventory (returns null if inventory full)
 */
export function addGearToInventory(player: Player, gear: Gear): Player | null {
  if (!hasInventorySpace(player)) {
    return null;
  }

  // Find next available slot index
  const usedIndices = new Set(player.inventory.map((slot) => slot.index));
  let nextIndex = 0;
  while (usedIndices.has(nextIndex)) {
    nextIndex++;
  }

  const newSlot: InventorySlot = {
    item: gear,
    index: nextIndex,
  };

  const updatedPlayer: Player = {
    ...player,
    inventory: [...player.inventory, newSlot],
  };

  return refreshPlayerStats(updatedPlayer);
}

/**
 * Remove gear from inventory by slot index
 */
export function removeGearFromInventory(
  player: Player,
  slotIndex: number
): { player: Player; gear: Gear | null } {
  const slotToRemove = player.inventory.find((slot) => slot.index === slotIndex);

  if (!slotToRemove) {
    return { player, gear: null };
  }

  const updatedPlayer: Player = {
    ...player,
    inventory: player.inventory.filter((slot) => slot.index !== slotIndex),
  };

  return {
    player: refreshPlayerStats(updatedPlayer),
    gear: slotToRemove.item,
  };
}

/**
 * Remove gear from inventory by gear ID
 */
export function removeGearById(
  player: Player,
  gearId: GearId
): { player: Player; gear: Gear | null } {
  const slotToRemove = player.inventory.find((slot) => slot.item.id === gearId);

  if (!slotToRemove) {
    return { player, gear: null };
  }

  return removeGearFromInventory(player, slotToRemove.index);
}

/**
 * Get gear from inventory by slot index
 */
export function getGearAtSlot(player: Player, slotIndex: number): Gear | null {
  const slot = player.inventory.find((s) => s.index === slotIndex);
  return slot?.item ?? null;
}

/**
 * Check if player has a specific gear item
 */
export function hasGear(player: Player, gearId: GearId): boolean {
  return player.inventory.some((slot) => slot.item.id === gearId);
}

/**
 * Increase inventory capacity (called at start of each Day)
 */
export function increaseInventoryCapacity(player: Player): Player {
  const newCapacity = Math.min(
    player.inventoryCapacity + GAME_CONSTANTS.INVENTORY_SLOTS_PER_WEEK,
    GAME_CONSTANTS.MAX_INVENTORY_SLOTS
  );

  return {
    ...player,
    inventoryCapacity: newCapacity,
  };
}

// ============================================================================
// Status Effects
// ============================================================================

/**
 * Apply status effect to player
 */
export function applyStatusEffect(
  player: Player,
  effect: keyof StatusEffects,
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
 * Remove status effect stacks from player
 */
export function removeStatusEffect(
  player: Player,
  effect: keyof StatusEffects,
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
 * Clear all status effects
 */
export function clearStatusEffects(player: Player): Player {
  return {
    ...player,
    statusEffects: { ...DEFAULT_STATUS_EFFECTS },
  };
}

// ============================================================================
// Gold Management
// ============================================================================

/**
 * Add gold to player
 */
export function addGold(player: Player, amount: number): Player {
  return {
    ...player,
    baseStats: {
      ...player.baseStats,
      gold: player.baseStats.gold + amount,
    },
    stats: {
      ...player.stats,
      gold: player.stats.gold + amount,
    },
  };
}

/**
 * Remove gold from player (returns false if insufficient)
 */
export function removeGold(player: Player, amount: number): { player: Player; success: boolean } {
  if (player.stats.gold < amount) {
    return { player, success: false };
  }

  return {
    player: {
      ...player,
      baseStats: {
        ...player.baseStats,
        gold: player.baseStats.gold - amount,
      },
      stats: {
        ...player.stats,
        gold: player.stats.gold - amount,
      },
    },
    success: true,
  };
}

/**
 * Check if player can afford an amount
 */
export function canAfford(player: Player, amount: number): boolean {
  return player.stats.gold >= amount;
}

// ============================================================================
// HP Management
// ============================================================================

/**
 * Deal damage to player
 */
export function damagePlayer(player: Player, damage: number): Player {
  const newHp = Math.max(0, player.stats.hp - damage);

  return {
    ...player,
    baseStats: {
      ...player.baseStats,
      hp: newHp,
    },
    stats: {
      ...player.stats,
      hp: newHp,
    },
  };
}

/**
 * Apply damage to player.
 * Alias for damagePlayer.
 */
export function applyDamage(player: Player, amount: number): Player {
  return damagePlayer(player, amount);
}

/**
 * Heal player
 */
export function healPlayer(player: Player, amount: number): Player {
  const newHp = Math.min(player.stats.maxHp, player.stats.hp + amount);

  return {
    ...player,
    baseStats: {
      ...player.baseStats,
      hp: newHp,
    },
    stats: {
      ...player.stats,
      hp: newHp,
    },
  };
}

/**
 * Fully restore player HP
 */
export function restoreFullHp(player: Player): Player {
  return healPlayer(player, player.stats.maxHp);
}

/**
 * Fully restore player HP.
 * Alias for restoreFullHp.
 */
export function fullHeal(player: Player): Player {
  return restoreFullHp(player);
}

/**
 * Check if player is alive
 */
export function isPlayerAlive(player: Player): boolean {
  return player.stats.hp > 0;
}

/**
 * Check if player is alive.
 * Alias for isPlayerAlive.
 */
export function isAlive(player: Player): boolean {
  return isPlayerAlive(player);
}

/**
 * Check if player is wounded (HP below 50%)
 */
export function isPlayerWounded(player: Player): boolean {
  return player.stats.hp < player.stats.maxHp * 0.5;
}

/**
 * Check if player is wounded.
 * Alias for isPlayerWounded.
 */
export function isWounded(player: Player): boolean {
  return isPlayerWounded(player);
}

// ============================================================================
// Position Management
// ============================================================================

/**
 * Update player position
 */
export function movePlayer(player: Player, newPosition: Position): Player {
  const dx = newPosition.x - player.position.x;
  let facing = player.facing;
  if (dx < 0) facing = 'left';
  if (dx > 0) facing = 'right';

  return {
    ...player,
    position: { ...newPosition },
    facing,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get all equipped gear IDs
 */
export function getEquippedGearIds(player: Player): GearId[] {
  return player.inventory.map((slot) => slot.item.id);
}

/**
 * Get all equipped items (tool + gear) for display
 */
export function getAllEquippedItems(player: Player): (Tool | Gear)[] {
  const items: (Tool | Gear)[] = [];
  if (player.equippedTool) {
    items.push(player.equippedTool);
  }
  items.push(...player.inventory.map((slot) => slot.item));
  return items;
}
