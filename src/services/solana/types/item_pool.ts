/**
 * Item Pool Bitmask Utilities
 *
 * Utilities for working with item bitmasks stored as Uint8Array.
 * Used for tracking unlocked items and active item pools in player profiles.
 *
 * @see data-model.md for PlayerProfile.unlockedItems and PlayerProfile.activeItemPool
 */

// ============================================================================
// Constants
// ============================================================================

/** Total bit capacity in the on-chain pool bitmask (10 bytes * 8 bits) */
export const TOTAL_ITEMS = 80;

/** Currently unlockable item range (indices 0..79) */
export const UNLOCKABLE_ITEMS = 80;

/** Number of starter items (always unlocked) */
export const STARTER_ITEMS = 40;

/** Minimum items required in active pool */
export const MIN_ACTIVE_POOL = 40;

/** Size of bitmask in bytes (80 bits = 10 bytes) */
export const BITMASK_SIZE = 10;

/**
 * Starter item indices (40 items = 32 gear + 8 tools).
 *
 * Matches Solana's STARTER_ITEMS_BITMASK from player-profile/src/bitmask.rs.
 *
 * Gear starter indices (32 items, 4 per tag):
 * - STONE: 0-3, SCOUT: 8-11, GREED: 16-18,20, BLAST: 24-27
 * - FROST: 32-35, RUST: 40-43, BLOOD: 48-51, TEMPO: 56-59
 *
 * Tool starter indices (8 items, 1 per tag - the first tool of each):
 * - 64 (STONE), 66 (SCOUT), 68 (GREED), 70 (BLAST)
 * - 72 (FROST), 74 (RUST), 76 (BLOOD), 78 (TEMPO)
 */
export const STARTER_ITEM_INDICES: Set<number> = new Set([
  // STONE gear 01-04
  0, 1, 2, 3,
  // SCOUT gear 01-04
  8, 9, 10, 11,
  // GREED gear 01-03, 05 (skips 04)
  16, 17, 18, 20,
  // BLAST gear 01-04
  24, 25, 26, 27,
  // FROST gear 01-04
  32, 33, 34, 35,
  // RUST gear 01-04
  40, 41, 42, 43,
  // BLOOD gear 01-04
  48, 49, 50, 51,
  // TEMPO gear 01-04
  56, 57, 58, 59,
  // Tools -01 (first tool of each tag)
  64, 66, 68, 70, 72, 74, 76, 78,
]);

/**
 * Check if an index is a starter item.
 *
 * @param index - Item bitmask index (0-79)
 * @returns true if this is a starter item
 */
export function isStarterItem(index: number): boolean {
  return STARTER_ITEM_INDICES.has(index);
}

/**
 * Check if an item index is currently in the unlockable range.
 * All indices 0..79 are unlockable slots.
 */
export function isUnlockableItem(index: number): boolean {
  return index >= 0 && index < UNLOCKABLE_ITEMS;
}

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
 * Create a starter bitmask with 40 specific items unlocked.
 *
 * Matches Solana's STARTER_ITEMS_BITMASK from player-profile/src/bitmask.rs:
 *
 * Bitmask layout:
 * - Gear (I1-I64): indices 0-63 (tag_code * 8 + item_num_in_tag - 1)
 * - Tools (T1-T16): indices 64-79 (64 + tag_code * 2 + item_num_in_tag - 1)
 *
 * Starter items (40 total = 32 gear + 8 tools):
 * - STONE: G-ST-01..04 (bits 0-3), T-ST-01 (bit 64)
 * - SCOUT: G-SC-01..04 (bits 8-11), T-SC-01 (bit 66)
 * - GREED: G-GR-01..03,05 (bits 16-18,20), T-GR-01 (bit 68)
 * - BLAST: G-BL-01..04 (bits 24-27), T-BL-01 (bit 70)
 * - FROST: G-FR-01..04 (bits 32-35), T-FR-01 (bit 72)
 * - RUST: G-RU-01..04 (bits 40-43), T-RU-01 (bit 74)
 * - BLOOD: G-BO-01..04 (bits 48-51), T-BO-01 (bit 76)
 * - TEMPO: G-TE-01..04 (bits 56-59), T-TE-01 (bit 78)
 *
 * @returns New 10-byte Uint8Array with starter items unlocked
 */
export function createStarterBitmask(): Uint8Array {
  // Matches STARTER_ITEMS_BITMASK from Solana program
  return new Uint8Array([
    0x0f, // byte 0: bits 0-3 (STONE gear 01-04)
    0x0f, // byte 1: bits 8-11 (SCOUT gear 01-04)
    0x17, // byte 2: bits 16-18,20 (GREED gear 01-03,05)
    0x0f, // byte 3: bits 24-27 (BLAST gear 01-04)
    0x0f, // byte 4: bits 32-35 (FROST gear 01-04)
    0x0f, // byte 5: bits 40-43 (RUST gear 01-04)
    0x0f, // byte 6: bits 48-51 (BLOOD gear 01-04)
    0x0f, // byte 7: bits 56-59 (TEMPO gear 01-04)
    0x55, // byte 8: bits 64,66,68,70 (Tools -01: STONE, SCOUT, GREED, BLAST)
    0x55, // byte 9: bits 72,74,76,78 (Tools -01: FROST, RUST, BLOOD, TEMPO)
  ]);
}

/**
 * Create a full bitmask (all 80 bit slots enabled).
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
  /** Indices of starter items that are unlocked (subset of the 40 starter items) */
  starterItems: number[];
  /** All unlocked item indices */
  unlockedItems: number[];
  /** Non-starter items still locked (items not in the initial 40) */
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
  const unlockableUnlocked = unlocked.filter(isUnlockableItem);
  const unlockableLocked = locked.filter(isUnlockableItem);

  return {
    starterItems: unlockableUnlocked.filter((i) => isStarterItem(i)),
    unlockedItems: unlockableUnlocked,
    lockedItems: unlockableLocked.filter((i) => !isStarterItem(i)),
    totalUnlocked: unlockableUnlocked.length,
    percentComplete: Math.round((unlockableUnlocked.length / UNLOCKABLE_ITEMS) * 100),
  };
}

/**
 * Check if collection is complete (all unlockable items unlocked).
 *
 * @param bitmask - Player's unlocked items bitmask
 * @returns true if all unlockable items are unlocked
 */
export function isCollectionComplete(bitmask: Uint8Array): boolean {
  return getUnlockedItems(bitmask).filter(isUnlockableItem).length === UNLOCKABLE_ITEMS;
}

// ============================================================================
// Gear-to-ItemPool Mapping
// ============================================================================

/**
 * Mapping from GearId (I1-I64) to item pool bitmask index.
 *
 * Bitmask layout (matches Solana player-profile program):
 * - Base gear (I1-I64): indices 0-63, formula: tag_code * 8 + (item_num_in_tag - 1)
 * - Tools (T1-T16): indices 64-79, formula: 64 + tag_code * 2 + (item_num_in_tag - 1)
 *
 * Tag codes: STONE=0, SCOUT=1, GREED=2, BLAST=3, FROST=4, RUST=5, BLOOD=6, TEMPO=7
 *
 * Gear mapping:
 * - I1-I8 (STONE) -> indices 0-7
 * - I9-I16 (SCOUT) -> indices 8-15
 * - I17-I24 (GREED) -> indices 16-23
 * - I25-I32 (BLAST) -> indices 24-31
 * - I33-I40 (FROST) -> indices 32-39
 * - I41-I48 (RUST) -> indices 40-47
 * - I49-I56 (BLOOD) -> indices 48-55
 * - I57-I64 (TEMPO) -> indices 56-63
 */
const GEAR_TO_POOL_INDEX: Record<string, number> = {
  // STONE (tag 0): indices 0-7
  I1: 0,
  I2: 1,
  I3: 2,
  I4: 3,
  I5: 4,
  I6: 5,
  I7: 6,
  I8: 7,
  // SCOUT (tag 1): indices 8-15
  I9: 8,
  I10: 9,
  I11: 10,
  I12: 11,
  I13: 12,
  I14: 13,
  I15: 14,
  I16: 15,
  // GREED (tag 2): indices 16-23
  I17: 16,
  I18: 17,
  I19: 18,
  I20: 19,
  I21: 20,
  I22: 21,
  I23: 22,
  I24: 23,
  // BLAST (tag 3): indices 24-31
  I25: 24,
  I26: 25,
  I27: 26,
  I28: 27,
  I29: 28,
  I30: 29,
  I31: 30,
  I32: 31,
  // FROST (tag 4): indices 32-39
  I33: 32,
  I34: 33,
  I35: 34,
  I36: 35,
  I37: 36,
  I38: 37,
  I39: 38,
  I40: 39,
  // RUST (tag 5): indices 40-47
  I41: 40,
  I42: 41,
  I43: 42,
  I44: 43,
  I45: 44,
  I46: 45,
  I47: 46,
  I48: 47,
  // BLOOD (tag 6): indices 48-55
  I49: 48,
  I50: 49,
  I51: 50,
  I52: 51,
  I53: 52,
  I54: 53,
  I55: 54,
  I56: 55,
  // TEMPO (tag 7): indices 56-63
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
 * Get the item pool index for an item ID.
 *
 * @param itemId - Item ID (I1-I64, T1-T16)
 * @returns Item pool index (0-79), or -1 if not mapped
 */
export function getItemPoolIndex(itemId: string): number {
  if (itemId.startsWith('I')) {
    return GEAR_TO_POOL_INDEX[itemId] ?? -1;
  }

  if (!itemId.startsWith('T')) {
    return -1;
  }

  const toolNum = Number.parseInt(itemId.slice(1), 10);
  if (!Number.isInteger(toolNum) || toolNum < 1 || toolNum > 16) {
    return -1;
  }

  const tagIndex = Math.floor((toolNum - 1) / 2);
  const innerIndex = (toolNum - 1) % 2;
  return 64 + tagIndex * 2 + innerIndex;
}

/**
 * Get the item pool index for a gear ID.
 *
 * @param gearId - Gear ID (e.g., 'I1', 'I32', etc.)
 * @returns Item pool index (0-79), or -1 if not mapped
 */
export function getGearItemPoolIndex(gearId: string): number {
  return getItemPoolIndex(gearId);
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
