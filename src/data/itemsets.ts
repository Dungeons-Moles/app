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
    requiredItems: ['I1', 'I2', 'I9'], // G-ST-01 + G-ST-02 + G-SC-01
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
    requiredItems: ['I21', 'I22', 'I23', 'I24'], // G-GR-05 to G-GR-08
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
    requiredItems: ['I25', 'I26', 'I27'], // G-BL-01 to G-BL-03
    bonus: {
      description: 'Countdown items trigger 1 turn sooner; your bomb self-damage is reduced by 2',
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
    requiredItems: ['T8', 'I29', 'I28'], // T-BL-02 + G-BL-05 + G-BL-04
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
    requiredItems: ['I3', 'I6', 'T1'], // G-ST-03 + G-ST-06 + T-ST-01
    bonus: {
      description: 'Keep up to 2 Shrapnel at end of turn; when struck with Shrapnel, gain +1 Armor',
      passive: true,
    },
  },

  // ============================================================================
  // Rust Ritual - Rust application synergy
  // ============================================================================
  RUST_RITUAL: {
    id: 'RUST_RITUAL',
    name: 'Rust Ritual',
    emoji: '☣️',
    requiredItems: ['T11', 'I42', 'I43'], // T-RU-01 + G-RU-02 + G-RU-03
    bonus: {
      description: 'On Hit: apply +1 Rust; if enemy has no Armor, Rust applications deal 1 non-weapon',
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
    requiredItems: ['T3', 'I9', 'I14'], // T-SC-01 + G-SC-01 + G-SC-06
    bonus: {
      description: 'Battle Start: If DIG > enemy DIG, +1 strike and +3 ATK',
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
    requiredItems: ['I17', 'I20', 'T6'], // G-GR-01 + G-GR-04 + T-GR-02
    bonus: {
      description: 'Gold to Armor conversion becomes 1:4; gain +1 Gold at battle start',
      passive: true,
    },
  },

  // ============================================================================
  // Whiteout Initiative - Frost/Tempo synergy
  // GDD: G-FR-04 + G-FR-03 + G-TE-05
  // ============================================================================
  WHITEOUT_INITIATIVE: {
    id: 'WHITEOUT_INITIATIVE',
    name: 'Whiteout Initiative',
    emoji: '🧊',
    requiredItems: ['I36', 'I35', 'I61'],
    bonus: {
      description: 'Battle Start: +1 SPD; if you act first Turn 1, apply +2 Chill and +3 first-strike damage',
      timing: 'BATTLE_START',
    },
  },

  // ============================================================================
  // Bloodrush Protocol - Blood/Tempo synergy
  // GDD: T-BO-01 + G-BO-05 + G-TE-01
  // ============================================================================
  BLOODRUSH_PROTOCOL: {
    id: 'BLOODRUSH_PROTOCOL',
    name: 'Bloodrush Protocol',
    emoji: '🩸',
    requiredItems: ['T13', 'I53', 'I57'],
    bonus: {
      description: 'Turn 1: apply 3 Bleed; when enemy takes Bleed dmg, gain +1 SPD this turn',
      timing: 'FIRST_TURN',
    },
  },

  // ============================================================================
  // Corrosion Payload - Rust/Blast synergy
  // GDD: G-RU-02 + G-BL-03 + G-BL-05
  // ============================================================================
  CORROSION_PAYLOAD: {
    id: 'CORROSION_PAYLOAD',
    name: 'Corrosion Payload',
    emoji: '💥☣️',
    requiredItems: ['I42', 'I27', 'I29'],
    bonus: {
      description: 'First time your bomb deals damage each turn: apply 1 Rust',
      passive: true,
    },
  },

  // ============================================================================
  // Golden Shrapnel Exchange - Greed/Stone synergy
  // GDD: G-GR-04 + G-ST-06 + G-GR-03
  // ============================================================================
  GOLDEN_SHRAPNEL_EXCHANGE: {
    id: 'GOLDEN_SHRAPNEL_EXCHANGE',
    name: 'Golden Shrapnel Exchange',
    emoji: '🪙🛡️',
    requiredItems: ['I20', 'I6', 'I19'],
    bonus: {
      description: 'When you convert Gold to Armor: gain +3 Shrapnel (once/turn)',
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
  return getAllItemsetDefinitions().filter((itemset) => itemset.requiredItems.includes(itemId));
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
