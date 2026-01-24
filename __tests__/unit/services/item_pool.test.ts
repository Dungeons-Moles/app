/**
 * Unit Tests for Item Pool Bitmask Utilities
 *
 * Tests for the 80-bit item bitmask utilities used for tracking
 * unlocked items and active item pools.
 *
 * @see src/services/solana/types/item_pool.ts
 */

import {
  isItemUnlocked,
  setItemUnlocked,
  setItemLocked,
  getUnlockedItems,
  getLockedItems,
  countUnlockedItems,
  createEmptyBitmask,
  createStarterBitmask,
  createFullBitmask,
  bitmaskToBase64,
  base64ToBitmask,
  isValidActivePool,
  hasMinimumActivePool,
  calculateItemCollection,
  isCollectionComplete,
  TOTAL_ITEMS,
  STARTER_ITEMS,
  MIN_ACTIVE_POOL,
  BITMASK_SIZE,
} from '@/services/solana/types/item_pool';

describe('Item Pool Bitmask Utilities', () => {
  describe('createEmptyBitmask', () => {
    it('should create a 10-byte array with all zeros', () => {
      const bitmask = createEmptyBitmask();
      expect(bitmask.length).toBe(BITMASK_SIZE);
      expect(Array.from(bitmask).every((b) => b === 0)).toBe(true);
    });
  });

  describe('createStarterBitmask', () => {
    it('should create a bitmask with first 40 items unlocked', () => {
      const bitmask = createStarterBitmask();

      // First 5 bytes should be 0xFF (all 8 bits set)
      for (let i = 0; i < 5; i++) {
        expect(bitmask[i]).toBe(0xff);
      }

      // Last 5 bytes should be 0
      for (let i = 5; i < 10; i++) {
        expect(bitmask[i]).toBe(0);
      }

      expect(countUnlockedItems(bitmask)).toBe(STARTER_ITEMS);
    });
  });

  describe('createFullBitmask', () => {
    it('should create a bitmask with all 80 items unlocked', () => {
      const bitmask = createFullBitmask();
      expect(Array.from(bitmask).every((b) => b === 0xff)).toBe(true);
      expect(countUnlockedItems(bitmask)).toBe(TOTAL_ITEMS);
    });
  });

  describe('isItemUnlocked', () => {
    it('should return true for unlocked items', () => {
      const bitmask = createStarterBitmask();

      for (let i = 0; i < 40; i++) {
        expect(isItemUnlocked(bitmask, i)).toBe(true);
      }
    });

    it('should return false for locked items', () => {
      const bitmask = createStarterBitmask();

      for (let i = 40; i < 80; i++) {
        expect(isItemUnlocked(bitmask, i)).toBe(false);
      }
    });

    it('should return false for out-of-range indices', () => {
      const bitmask = createFullBitmask();
      expect(isItemUnlocked(bitmask, -1)).toBe(false);
      expect(isItemUnlocked(bitmask, 80)).toBe(false);
      expect(isItemUnlocked(bitmask, 100)).toBe(false);
    });
  });

  describe('setItemUnlocked', () => {
    it('should set a specific item as unlocked', () => {
      const bitmask = createEmptyBitmask();

      setItemUnlocked(bitmask, 0);
      expect(isItemUnlocked(bitmask, 0)).toBe(true);
      expect(countUnlockedItems(bitmask)).toBe(1);

      setItemUnlocked(bitmask, 79);
      expect(isItemUnlocked(bitmask, 79)).toBe(true);
      expect(countUnlockedItems(bitmask)).toBe(2);
    });

    it('should handle setting the same item twice', () => {
      const bitmask = createEmptyBitmask();

      setItemUnlocked(bitmask, 10);
      setItemUnlocked(bitmask, 10);

      expect(isItemUnlocked(bitmask, 10)).toBe(true);
      expect(countUnlockedItems(bitmask)).toBe(1);
    });
  });

  describe('setItemLocked', () => {
    it('should set a specific item as locked', () => {
      const bitmask = createFullBitmask();

      setItemLocked(bitmask, 50);
      expect(isItemUnlocked(bitmask, 50)).toBe(false);
      expect(countUnlockedItems(bitmask)).toBe(79);
    });
  });

  describe('getUnlockedItems', () => {
    it('should return array of unlocked item indices', () => {
      const bitmask = createEmptyBitmask();
      setItemUnlocked(bitmask, 0);
      setItemUnlocked(bitmask, 10);
      setItemUnlocked(bitmask, 79);

      const unlocked = getUnlockedItems(bitmask);
      expect(unlocked).toEqual([0, 10, 79]);
    });

    it('should return 40 items for starter bitmask', () => {
      const bitmask = createStarterBitmask();
      const unlocked = getUnlockedItems(bitmask);

      expect(unlocked.length).toBe(40);
      expect(unlocked[0]).toBe(0);
      expect(unlocked[39]).toBe(39);
    });
  });

  describe('getLockedItems', () => {
    it('should return array of locked item indices', () => {
      const bitmask = createFullBitmask();
      setItemLocked(bitmask, 50);
      setItemLocked(bitmask, 60);

      const locked = getLockedItems(bitmask);
      expect(locked).toEqual([50, 60]);
    });

    it('should return items 40-79 for starter bitmask', () => {
      const bitmask = createStarterBitmask();
      const locked = getLockedItems(bitmask);

      expect(locked.length).toBe(40);
      expect(locked[0]).toBe(40);
      expect(locked[39]).toBe(79);
    });
  });

  describe('countUnlockedItems', () => {
    it('should correctly count bits', () => {
      const bitmask = createEmptyBitmask();
      expect(countUnlockedItems(bitmask)).toBe(0);

      setItemUnlocked(bitmask, 0);
      expect(countUnlockedItems(bitmask)).toBe(1);

      setItemUnlocked(bitmask, 7);
      setItemUnlocked(bitmask, 8);
      expect(countUnlockedItems(bitmask)).toBe(3);
    });
  });

  describe('bitmaskToBase64 / base64ToBitmask', () => {
    it('should round-trip correctly', () => {
      const original = createStarterBitmask();
      setItemUnlocked(original, 50);

      const base64 = bitmaskToBase64(original);
      const restored = base64ToBitmask(base64);

      expect(Array.from(restored)).toEqual(Array.from(original));
    });
  });

  describe('isValidActivePool', () => {
    it('should return true when active pool is subset of unlocked', () => {
      const unlocked = createStarterBitmask();
      const activePool = createEmptyBitmask();

      // Active pool with only some starter items
      for (let i = 0; i < 40; i++) {
        setItemUnlocked(activePool, i);
      }

      expect(isValidActivePool(activePool, unlocked)).toBe(true);
    });

    it('should return false when active pool has items not in unlocked', () => {
      const unlocked = createStarterBitmask();
      const activePool = createEmptyBitmask();

      // Try to add item 50 which isn't unlocked
      setItemUnlocked(activePool, 50);

      expect(isValidActivePool(activePool, unlocked)).toBe(false);
    });
  });

  describe('hasMinimumActivePool', () => {
    it('should return true when pool has >= 40 items', () => {
      const pool = createStarterBitmask();
      expect(hasMinimumActivePool(pool)).toBe(true);
    });

    it('should return false when pool has < 40 items', () => {
      const pool = createEmptyBitmask();
      for (let i = 0; i < 30; i++) {
        setItemUnlocked(pool, i);
      }
      expect(hasMinimumActivePool(pool)).toBe(false);
    });
  });

  describe('calculateItemCollection', () => {
    it('should calculate correct collection stats', () => {
      const bitmask = createStarterBitmask();
      setItemUnlocked(bitmask, 40);
      setItemUnlocked(bitmask, 50);

      const collection = calculateItemCollection(bitmask);

      expect(collection.totalUnlocked).toBe(42);
      expect(collection.starterItems.length).toBe(40);
      expect(collection.unlockedItems.length).toBe(42);
      expect(collection.lockedItems.length).toBe(38);
      expect(collection.percentComplete).toBe(53); // 42/80 * 100 rounded
    });
  });

  describe('isCollectionComplete', () => {
    it('should return true when all items unlocked', () => {
      const bitmask = createFullBitmask();
      expect(isCollectionComplete(bitmask)).toBe(true);
    });

    it('should return false when some items locked', () => {
      const bitmask = createStarterBitmask();
      expect(isCollectionComplete(bitmask)).toBe(false);
    });
  });
});
