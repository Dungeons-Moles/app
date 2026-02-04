/**
 * useItemCollection - Item collection tracking and progress hook
 * T073: Create useItemCollection hook in src/hooks/useItemCollection.ts (parse bitmask, calculate progress)
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useProfile } from '../contexts/ProfileContext';
import type { ItemTag, ItemStats, GearId } from '../game/engine/types';

/** Total number of collectible items (80 gear items) */
export const TOTAL_ITEMS = 80;

/** Item data for collection display */
export interface CollectionItem {
  /** Item index (0-79) */
  index: number;
  /** Item ID (I1-I64 for gear) */
  id: GearId;
  /** Item name */
  name: string;
  /** Item emoji */
  emoji: string;
  /** Item tag/set */
  tag: ItemTag;
  /** Item stats */
  stats: ItemStats;
  /** Whether item is unlocked */
  isUnlocked: boolean;
}

/** Collection progress data */
export interface CollectionProgress {
  /** Number of unlocked items */
  unlockedCount: number;
  /** Total number of items */
  totalCount: number;
  /** Progress percentage (0-100) */
  percentage: number;
  /** Whether collection is complete */
  isComplete: boolean;
}

/** Progress by tag/set */
export interface TagProgress {
  tag: ItemTag;
  unlockedCount: number;
  totalCount: number;
  percentage: number;
}

interface UseItemCollectionResult {
  /** All items with unlock status */
  items: CollectionItem[];
  /** Overall collection progress */
  progress: CollectionProgress;
  /** Progress by tag */
  tagProgress: TagProgress[];
  /** Check if specific item is unlocked */
  isItemUnlocked: (index: number) => boolean;
  /** Get item by index */
  getItem: (index: number) => CollectionItem | undefined;
  /** Refresh collection data */
  refresh: () => void;
}

// Item definitions (simplified - real data would come from data files)
const ITEM_DEFINITIONS: Omit<CollectionItem, 'isUnlocked'>[] = generateItemDefinitions();

function generateItemDefinitions(): Omit<CollectionItem, 'isUnlocked'>[] {
  const tags: ItemTag[] = ['STONE', 'SCOUT', 'GREED', 'BLAST', 'FROST', 'RUST', 'BLOOD', 'TEMPO'];
  const items: Omit<CollectionItem, 'isUnlocked'>[] = [];

  for (let i = 0; i < TOTAL_ITEMS; i++) {
    const tagIndex = Math.floor(i / 10) % tags.length;
    const tag = tags[tagIndex];
    const gearIndex = (i % 64) + 1;

    items.push({
      index: i,
      id: `I${gearIndex}` as GearId,
      name: `${tag} Item ${(i % 10) + 1}`,
      emoji: getTagEmoji(tag),
      tag,
      stats: generateStats(tag, i),
    });
  }

  return items;
}

function getTagEmoji(tag: ItemTag): string {
  const emojis: Record<ItemTag, string> = {
    STONE: '🪨',
    SCOUT: '🔭',
    GREED: '💰',
    BLAST: '💥',
    FROST: '❄️',
    RUST: '🦠',
    BLOOD: '🩸',
    TEMPO: '⚡',
  };
  return emojis[tag] ?? '📦';
}

function generateStats(tag: ItemTag, index: number): ItemStats {
  const base = (index % 5) + 1;
  switch (tag) {
    case 'STONE':
      return { arm: base, hp: base * 2 };
    case 'SCOUT':
      return { spd: base, dig: Math.ceil(base / 2) };
    case 'GREED':
      return { atk: Math.ceil(base / 2) };
    case 'BLAST':
      return { atk: base + 1 };
    case 'FROST':
      return { arm: base, spd: -1 };
    case 'RUST':
      return { atk: base, arm: -1 };
    case 'BLOOD':
      return { atk: base + 2, hp: -base };
    case 'TEMPO':
      return { spd: base + 1 };
    default:
      return { atk: base };
  }
}

export function useItemCollection(): UseItemCollectionResult {
  const { unlockedItems, isItemUnlocked: profileIsUnlocked } = useProfile();
  const [refreshKey, setRefreshKey] = useState(0);

  // Build items with unlock status
  const items = useMemo<CollectionItem[]>(() => {
    return ITEM_DEFINITIONS.map((def) => ({
      ...def,
      isUnlocked: profileIsUnlocked(def.id),
    }));
  }, [profileIsUnlocked, refreshKey]);

  // Calculate overall progress
  const progress = useMemo<CollectionProgress>(() => {
    const unlockedCount = items.filter((item) => item.isUnlocked).length;
    const totalCount = TOTAL_ITEMS;
    const percentage = Math.round((unlockedCount / totalCount) * 100);
    const isComplete = unlockedCount === totalCount;

    return { unlockedCount, totalCount, percentage, isComplete };
  }, [items]);

  // Calculate progress by tag
  const tagProgress = useMemo<TagProgress[]>(() => {
    const tags: ItemTag[] = ['STONE', 'SCOUT', 'GREED', 'BLAST', 'FROST', 'RUST', 'BLOOD', 'TEMPO'];

    return tags.map((tag) => {
      const tagItems = items.filter((item) => item.tag === tag);
      const unlockedCount = tagItems.filter((item) => item.isUnlocked).length;
      const totalCount = tagItems.length;
      const percentage = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;

      return { tag, unlockedCount, totalCount, percentage };
    });
  }, [items]);

  const isItemUnlocked = useCallback(
    (index: number): boolean => {
      // Find the item definition to get its string ID
      const def = ITEM_DEFINITIONS.find((d) => d.index === index);
      return def ? profileIsUnlocked(def.id) : false;
    },
    [profileIsUnlocked]
  );

  const getItem = useCallback(
    (index: number): CollectionItem | undefined => {
      return items.find((item) => item.index === index);
    },
    [items]
  );

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return {
    items,
    progress,
    tagProgress,
    isItemUnlocked,
    getItem,
    refresh,
  };
}

/**
 * Parse item unlock bitmask from on-chain data
 * @param bitmask - 10-byte (80-bit) bitmask
 * @returns Set of unlocked item indices
 */
export function parseItemBitmask(bitmask: Uint8Array): Set<number> {
  const unlocked = new Set<number>();

  for (let byteIndex = 0; byteIndex < bitmask.length && byteIndex < 10; byteIndex++) {
    const byte = bitmask[byteIndex];
    for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
      const itemIndex = byteIndex * 8 + bitIndex;
      if (itemIndex >= TOTAL_ITEMS) break;

      if (byte & (1 << bitIndex)) {
        unlocked.add(itemIndex);
      }
    }
  }

  return unlocked;
}

/**
 * Create bitmask from set of unlocked item indices
 * @param unlockedItems - Set of unlocked item indices
 * @returns 10-byte bitmask
 */
export function createItemBitmask(unlockedItems: Set<number>): Uint8Array {
  const bitmask = new Uint8Array(10);

  for (const itemIndex of unlockedItems) {
    if (itemIndex >= 0 && itemIndex < TOTAL_ITEMS) {
      const byteIndex = Math.floor(itemIndex / 8);
      const bitIndex = itemIndex % 8;
      bitmask[byteIndex] |= 1 << bitIndex;
    }
  }

  return bitmask;
}
