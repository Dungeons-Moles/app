/**
 * Itemset definitions (all 8 itemsets)
 * @see specs/001-pve-dungeon-crawler/spec.md Appendix E
 * @see specs/001-pve-dungeon-crawler/data-model.md
 */

import type { ItemsetId, ToolId, GearId, EffectTiming } from '../game/engine/types';

export interface ItemsetDefinition {
  id: ItemsetId;
  name: string;
  emoji: string;
  requiredItems: (ToolId | GearId)[];
  bonus: {
    description: string;
    timing?: EffectTiming;
    passive?: boolean;
  };
}

/**
 * All itemset definitions per spec.md Appendix E
 */
export const ITEMSET_DEFINITIONS: Record<ItemsetId, ItemsetDefinition> = {
  // ============================================================================
  // Union Standard - Mining/Defense set
  // ============================================================================
  UNION_STANDARD: {
    id: 'UNION_STANDARD',
    name: 'Union Standard',
    emoji: '🧰',
    requiredItems: ['I2', 'I3', 'I1'],
    bonus: {
      description: 'Battle Start: +4 Armor, +1 DIG',
      timing: 'BATTLE_START',
    },
  },

  // ============================================================================
  // Shard Circuit - Shard synergy set
  // ============================================================================
  SHARD_CIRCUIT: {
    id: 'SHARD_CIRCUIT',
    name: 'Shard Circuit',
    emoji: '🔁',
    requiredItems: ['I11', 'I12', 'I13', 'I14'],
    bonus: {
      description: 'Shards trigger every turn',
      timing: 'TURN_START',
    },
  },

  // ============================================================================
  // Demolition Permit - Bomb/countdown synergy
  // ============================================================================
  DEMOLITION_PERMIT: {
    id: 'DEMOLITION_PERMIT',
    name: 'Demolition Permit',
    emoji: '🧾',
    requiredItems: ['I16', 'I18', 'I10'],
    bonus: {
      description: 'Countdown items trigger 1 turn sooner',
      passive: true,
    },
  },

  // ============================================================================
  // Fuse Network - Non-weapon damage synergy
  // ============================================================================
  FUSE_NETWORK: {
    id: 'FUSE_NETWORK',
    name: 'Fuse Network',
    emoji: '🕸️',
    requiredItems: ['I17', 'I19', 'I20'],
    bonus: {
      description: 'First non-weapon damage per turn deals +2',
      passive: true,
    },
  },

  // ============================================================================
  // Shrapnel Harness - Shrapnel retention set
  // ============================================================================
  SHRAPNEL_HARNESS: {
    id: 'SHRAPNEL_HARNESS',
    name: 'Shrapnel Harness',
    emoji: '🛡️',
    requiredItems: ['I6', 'I21', 'T2'],
    bonus: {
      description: 'Keep up to 3 Shrapnel at end of turn',
      timing: 'TURN_END',
    },
  },

  // ============================================================================
  // Rust Ritual - Rust application synergy
  // ============================================================================
  RUST_RITUAL: {
    id: 'RUST_RITUAL',
    name: 'Rust Ritual',
    emoji: '☣️',
    requiredItems: ['I22', 'I23', 'I5'],
    bonus: {
      description: 'On Hit: apply +1 additional Rust',
      timing: 'ON_HIT',
    },
  },

  // ============================================================================
  // Swift Digger Kit - DIG-focused offense set
  // ============================================================================
  SWIFT_DIGGER_KIT: {
    id: 'SWIFT_DIGGER_KIT',
    name: 'Swift Digger Kit',
    emoji: '⚡',
    requiredItems: ['T3', 'I1', 'I27'],
    bonus: {
      description: 'Battle Start: If DIG > enemy DIG, +2 strikes',
      timing: 'BATTLE_START',
    },
  },

  // ============================================================================
  // Royal Extraction - Gold conversion set
  // ============================================================================
  ROYAL_EXTRACTION: {
    id: 'ROYAL_EXTRACTION',
    name: 'Royal Extraction',
    emoji: '🏦',
    requiredItems: ['I8', 'I25', 'T7'],
    bonus: {
      description: 'Gold to Armor conversion becomes 1:4',
      passive: true,
    },
  },
};

/**
 * Get itemset definition by ID
 */
export function getItemsetDefinition(id: ItemsetId): ItemsetDefinition {
  return ITEMSET_DEFINITIONS[id];
}

/**
 * Get all itemset definitions as an array
 */
export function getAllItemsetDefinitions(): ItemsetDefinition[] {
  return Object.values(ITEMSET_DEFINITIONS);
}

/**
 * Check if player has all required items for an itemset
 */
export function checkItemsetComplete(
  itemsetId: ItemsetId,
  equippedToolId: ToolId | null,
  equippedGearIds: GearId[]
): boolean {
  const itemset = getItemsetDefinition(itemsetId);
  const equippedItems = new Set<ToolId | GearId>([
    ...(equippedToolId ? [equippedToolId] : []),
    ...equippedGearIds,
  ]);

  return itemset.requiredItems.every((itemId) => equippedItems.has(itemId));
}

/**
 * Get all active itemsets based on equipped items
 */
export function getActiveItemsets(
  equippedToolId: ToolId | null,
  equippedGearIds: GearId[]
): ItemsetId[] {
  return getAllItemsetDefinitions()
    .filter((itemset) => checkItemsetComplete(itemset.id, equippedToolId, equippedGearIds))
    .map((itemset) => itemset.id);
}

/**
 * Get itemsets that a specific item contributes to
 */
export function getItemsetsForItem(itemId: ToolId | GearId): ItemsetDefinition[] {
  return getAllItemsetDefinitions().filter((itemset) =>
    itemset.requiredItems.includes(itemId)
  );
}

/**
 * Get progress toward completing an itemset
 */
export function getItemsetProgress(
  itemsetId: ItemsetId,
  equippedToolId: ToolId | null,
  equippedGearIds: GearId[]
): { owned: (ToolId | GearId)[]; missing: (ToolId | GearId)[]; total: number } {
  const itemset = getItemsetDefinition(itemsetId);
  const equippedItems = new Set<ToolId | GearId>([
    ...(equippedToolId ? [equippedToolId] : []),
    ...equippedGearIds,
  ]);

  const owned: (ToolId | GearId)[] = [];
  const missing: (ToolId | GearId)[] = [];

  for (const itemId of itemset.requiredItems) {
    if (equippedItems.has(itemId)) {
      owned.push(itemId);
    } else {
      missing.push(itemId);
    }
  }

  return {
    owned,
    missing,
    total: itemset.requiredItems.length,
  };
}
