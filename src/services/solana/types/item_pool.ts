/**
 * Item Pool Bitmask Utilities
 *
 * Utilities for working with 80-bit item bitmasks stored as Uint8Array[10].
 * Used for tracking unlocked items and active item pools in player profiles.
 *
 * @see data-model.md for PlayerProfile.unlockedItems and PlayerProfile.activeItemPool
 */

// ============================================================================
// Constants
// ============================================================================

/** Total number of items in the game */
export const TOTAL_ITEMS = 80;

/** Number of starter items (always unlocked) */
export const STARTER_ITEMS = 40;

/** Minimum items required in active pool */
export const MIN_ACTIVE_POOL = 40;

/** Size of bitmask in bytes (80 bits = 10 bytes) */
export const BITMASK_SIZE = 10;

// ============================================================================
// Bitmask Operations
// ============================================================================

/**
 * Check if a specific item is unlocked in the bitmask.
 *
 * @param bitmask - 10-byte Uint8Array representing 80-bit item mask
 * @param index - Item index (0-79)
 * @returns true if item is unlocked
 */
export function isItemUnlocked(bitmask: Uint8Array, index: number): boolean {
  if (index < 0 || index >= TOTAL_ITEMS) {
    return false;
  }
  const byteIndex = Math.floor(index / 8);
  const bitIndex = index % 8;
  return (bitmask[byteIndex] & (1 << bitIndex)) !== 0;
}

/**
 * Set an item as unlocked in the bitmask.
 *
 * @param bitmask - 10-byte Uint8Array (will be mutated)
 * @param index - Item index (0-79)
 * @returns The mutated bitmask
 */
export function setItemUnlocked(bitmask: Uint8Array, index: number): Uint8Array {
  if (index < 0 || index >= TOTAL_ITEMS) {
    return bitmask;
  }
  const byteIndex = Math.floor(index / 8);
  const bitIndex = index % 8;
  bitmask[byteIndex] |= 1 << bitIndex;
  return bitmask;
}

/**
 * Set an item as locked in the bitmask.
 *
 * @param bitmask - 10-byte Uint8Array (will be mutated)
 * @param index - Item index (0-79)
 * @returns The mutated bitmask
 */
export function setItemLocked(bitmask: Uint8Array, index: number): Uint8Array {
  if (index < 0 || index >= TOTAL_ITEMS) {
    return bitmask;
  }
  const byteIndex = Math.floor(index / 8);
  const bitIndex = index % 8;
  bitmask[byteIndex] &= ~(1 << bitIndex);
  return bitmask;
}

/**
 * Get all unlocked item indices from a bitmask.
 *
 * @param bitmask - 10-byte Uint8Array representing 80-bit item mask
 * @returns Array of unlocked item indices
 */
export function getUnlockedItems(bitmask: Uint8Array): number[] {
  const unlocked: number[] = [];
  for (let i = 0; i < TOTAL_ITEMS; i++) {
    if (isItemUnlocked(bitmask, i)) {
      unlocked.push(i);
    }
  }
  return unlocked;
}

/**
 * Get all locked item indices from a bitmask.
 *
 * @param bitmask - 10-byte Uint8Array representing 80-bit item mask
 * @returns Array of locked item indices
 */
export function getLockedItems(bitmask: Uint8Array): number[] {
  const locked: number[] = [];
  for (let i = 0; i < TOTAL_ITEMS; i++) {
    if (!isItemUnlocked(bitmask, i)) {
      locked.push(i);
    }
  }
  return locked;
}

/**
 * Count the number of unlocked items in a bitmask.
 *
 * @param bitmask - 10-byte Uint8Array representing 80-bit item mask
 * @returns Number of unlocked items
 */
export function countUnlockedItems(bitmask: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < BITMASK_SIZE; i++) {
    // Count bits set in each byte
    let byte = bitmask[i];
    while (byte) {
      count += byte & 1;
      byte >>= 1;
    }
  }
  return count;
}

/**
 * Create an empty bitmask (all items locked).
 *
 * @returns New 10-byte Uint8Array with all bits set to 0
 */
export function createEmptyBitmask(): Uint8Array {
  return new Uint8Array(BITMASK_SIZE);
}

/**
 * Create a starter bitmask (items 0-39 unlocked).
 *
 * @returns New 10-byte Uint8Array with starter items unlocked
 */
export function createStarterBitmask(): Uint8Array {
  const bitmask = new Uint8Array(BITMASK_SIZE);
  // Set first 40 bits (5 bytes)
  for (let i = 0; i < 5; i++) {
    bitmask[i] = 0xff; // All 8 bits set
  }
  return bitmask;
}

/**
 * Create a full bitmask (all 80 items unlocked).
 *
 * @returns New 10-byte Uint8Array with all items unlocked
 */
export function createFullBitmask(): Uint8Array {
  const bitmask = new Uint8Array(BITMASK_SIZE);
  for (let i = 0; i < BITMASK_SIZE; i++) {
    bitmask[i] = 0xff;
  }
  return bitmask;
}

/**
 * Convert a bitmask to a base64 string for storage/display.
 *
 * @param bitmask - 10-byte Uint8Array
 * @returns Base64 encoded string
 */
export function bitmaskToBase64(bitmask: Uint8Array): string {
  return Buffer.from(bitmask).toString('base64');
}

/**
 * Convert a base64 string back to a bitmask.
 *
 * @param base64 - Base64 encoded string
 * @returns 10-byte Uint8Array
 */
export function base64ToBitmask(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Check if an active pool is valid (subset of unlocked items).
 *
 * @param activePool - Active item pool bitmask
 * @param unlockedItems - Unlocked items bitmask
 * @returns true if active pool is a subset of unlocked items
 */
export function isValidActivePool(activePool: Uint8Array, unlockedItems: Uint8Array): boolean {
  for (let i = 0; i < BITMASK_SIZE; i++) {
    // Every bit set in activePool must also be set in unlockedItems
    if ((activePool[i] & ~unlockedItems[i]) !== 0) {
      return false;
    }
  }
  return true;
}

/**
 * Check if an active pool has the minimum required items.
 *
 * @param activePool - Active item pool bitmask
 * @returns true if pool has at least MIN_ACTIVE_POOL items
 */
export function hasMinimumActivePool(activePool: Uint8Array): boolean {
  return countUnlockedItems(activePool) >= MIN_ACTIVE_POOL;
}

// ============================================================================
// Item Collection State
// ============================================================================

/**
 * Player's item progression display.
 */
export interface ItemCollection {
  /** Indices 0-39 (always unlocked) */
  starterItems: number[];
  /** All unlocked item indices */
  unlockedItems: number[];
  /** Indices 40-79 still locked */
  lockedItems: number[];
  /** Count of unlocked items */
  totalUnlocked: number;
  /** Progress percentage (0-100) */
  percentComplete: number;
}

/**
 * Calculate item collection state from a bitmask.
 *
 * @param bitmask - Player's unlocked items bitmask
 * @returns ItemCollection state
 */
export function calculateItemCollection(bitmask: Uint8Array): ItemCollection {
  const unlocked = getUnlockedItems(bitmask);
  const locked = getLockedItems(bitmask);

  return {
    starterItems: unlocked.filter((i) => i < STARTER_ITEMS),
    unlockedItems: unlocked,
    lockedItems: locked.filter((i) => i >= STARTER_ITEMS),
    totalUnlocked: unlocked.length,
    percentComplete: Math.round((unlocked.length / TOTAL_ITEMS) * 100),
  };
}

/**
 * Check if collection is complete (all 80 items unlocked).
 *
 * @param bitmask - Player's unlocked items bitmask
 * @returns true if all items are unlocked
 */
export function isCollectionComplete(bitmask: Uint8Array): boolean {
  return countUnlockedItems(bitmask) === TOTAL_ITEMS;
}

// ============================================================================
// Gear-to-ItemPool Mapping (T040)
// ============================================================================

/**
 * Mapping from GearId (I1-I64) to item pool index (0-79).
 *
 * The gear system has 64 items organized by tags (STONE, SCOUT, GREED, BLAST, FROST, RUST, BLOOD, TEMPO).
 * The item pool has 80 items organized by sets (Miner, Warrior, Scout, Tank, Berserker, Frost, Fire, Poison, Shadow, Divine).
 *
 * This mapping assigns gear items to pool indices:
 * - Gear I1-I8 (STONE) -> Pool indices 0-7 (Starter: Miner set)
 * - Gear I9-I16 (SCOUT) -> Pool indices 8-15 (Starter: Warrior set)
 * - Gear I17-I24 (GREED) -> Pool indices 16-23 (Starter: Scout set)
 * - Gear I25-I32 (BLAST) -> Pool indices 24-31 (Starter: Tank set)
 * - Gear I33-I40 (FROST) -> Pool indices 32-39 (Starter: Berserker set)
 * - Gear I41-I48 (RUST) -> Pool indices 40-47 (Unlockable: Frost set)
 * - Gear I49-I56 (BLOOD) -> Pool indices 48-55 (Unlockable: Fire set)
 * - Gear I57-I64 (TEMPO) -> Pool indices 56-63 (Unlockable: Poison set)
 */
const GEAR_TO_POOL_INDEX: Record<string, number> = {
  // STONE -> Miner (0-7)
  I1: 0,
  I2: 1,
  I3: 2,
  I4: 3,
  I5: 4,
  I6: 5,
  I7: 6,
  I8: 7,
  // SCOUT -> Warrior (8-15)
  I9: 8,
  I10: 9,
  I11: 10,
  I12: 11,
  I13: 12,
  I14: 13,
  I15: 14,
  I16: 15,
  // GREED -> Scout (16-23)
  I17: 16,
  I18: 17,
  I19: 18,
  I20: 19,
  I21: 20,
  I22: 21,
  I23: 22,
  I24: 23,
  // BLAST -> Tank (24-31)
  I25: 24,
  I26: 25,
  I27: 26,
  I28: 27,
  I29: 28,
  I30: 29,
  I31: 30,
  I32: 31,
  // FROST -> Berserker (32-39)
  I33: 32,
  I34: 33,
  I35: 34,
  I36: 35,
  I37: 36,
  I38: 37,
  I39: 38,
  I40: 39,
  // RUST -> Frost set unlockable (40-47)
  I41: 40,
  I42: 41,
  I43: 42,
  I44: 43,
  I45: 44,
  I46: 45,
  I47: 46,
  I48: 47,
  // BLOOD -> Fire set unlockable (48-55)
  I49: 48,
  I50: 49,
  I51: 50,
  I52: 51,
  I53: 52,
  I54: 53,
  I55: 54,
  I56: 55,
  // TEMPO -> Poison set unlockable (56-63)
  I57: 56,
  I58: 57,
  I59: 58,
  I60: 59,
  I61: 60,
  I62: 61,
  I63: 62,
  I64: 63,
};

/**
 * Get the item pool index for a gear ID.
 *
 * @param gearId - Gear ID (e.g., 'I1', 'I32', etc.)
 * @returns Item pool index (0-79), or -1 if not mapped
 */
export function getGearItemPoolIndex(gearId: string): number {
  return GEAR_TO_POOL_INDEX[gearId] ?? -1;
}

/**
 * Check if a gear item is available in the active item pool.
 *
 * @param gearId - Gear ID (e.g., 'I1', 'I32', etc.)
 * @param activePool - Active item pool bitmask (10 bytes)
 * @returns true if the gear item is in the active pool
 */
export function isGearInActivePool(gearId: string, activePool: Uint8Array): boolean {
  const poolIndex = getGearItemPoolIndex(gearId);
  if (poolIndex < 0 || poolIndex >= TOTAL_ITEMS) {
    // Unmapped gear items are always available (e.g., tools)
    return true;
  }
  return isItemUnlocked(activePool, poolIndex);
}

/**
 * Filter gear items by active item pool.
 *
 * @param gearIds - Array of gear IDs
 * @param activePool - Active item pool bitmask (10 bytes)
 * @returns Filtered array of gear IDs that are in the active pool
 */
export function filterGearByActivePool(gearIds: string[], activePool: Uint8Array): string[] {
  return gearIds.filter((gearId) => isGearInActivePool(gearId, activePool));
}
