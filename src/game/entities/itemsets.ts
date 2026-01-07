/**
 * Itemset Entity Logic - T076
 * Itemset detection, activation, and bonus application
 * @see specs/001-pve-dungeon-crawler/data-model.md
 * @see specs/001-pve-dungeon-crawler/spec.md Appendix E
 */

import type { ItemsetId, ToolId, GearId, EffectTiming } from '../engine/types';
import {
  ITEMSET_DEFINITIONS as BASE_ITEMSET_DEFINITIONS,
  getItemsetDefinition as getBaseItemsetDefinition,
  getAllItemsetDefinitions as getAllBaseItemsetDefinitions,
  checkItemsetComplete as checkBaseItemsetComplete,
  getActiveItemsets as getBaseActiveItemsets,
  getItemsetsForItem as getBaseItemsetsForItem,
  getItemsetProgress as getBaseItemsetProgress,
} from '../../data/itemsets';

// ============================================================================
// Re-export types and definitions
// ============================================================================

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

export const ITEMSET_DEFINITIONS = BASE_ITEMSET_DEFINITIONS;

// ============================================================================
// Itemset Functions
// ============================================================================

/**
 * Get itemset definition by ID
 */
export function getItemsetDefinition(id: ItemsetId): ItemsetDefinition {
  return getBaseItemsetDefinition(id);
}

/**
 * Get all itemset definitions as an array
 */
export function getAllItemsetDefinitions(): ItemsetDefinition[] {
  return getAllBaseItemsetDefinitions();
}

/**
 * Check if player has all required items for an itemset
 */
export function checkItemsetComplete(
  itemsetId: ItemsetId,
  equippedToolId: ToolId | null,
  equippedGearIds: GearId[]
): boolean {
  return checkBaseItemsetComplete(itemsetId, equippedToolId, equippedGearIds);
}

/**
 * Get all active itemsets based on equipped items
 */
export function getActiveItemsets(
  equippedToolId: ToolId | null,
  equippedGearIds: GearId[]
): ItemsetId[] {
  return getBaseActiveItemsets(equippedToolId, equippedGearIds);
}

/**
 * Get itemsets that a specific item contributes to
 */
export function getItemsetsForItem(itemId: ToolId | GearId): ItemsetDefinition[] {
  return getBaseItemsetsForItem(itemId);
}

/**
 * Get progress toward completing an itemset
 */
export function getItemsetProgress(
  itemsetId: ItemsetId,
  equippedToolId: ToolId | null,
  equippedGearIds: GearId[]
): { owned: (ToolId | GearId)[]; missing: (ToolId | GearId)[]; total: number } {
  return getBaseItemsetProgress(itemsetId, equippedToolId, equippedGearIds);
}

// ============================================================================
// Itemset Activation Helpers
// ============================================================================

/**
 * Get itemsets by timing (for combat effect processing)
 */
export function getItemsetsByTiming(timing: EffectTiming): ItemsetDefinition[] {
  return getAllItemsetDefinitions().filter(
    (itemset) => itemset.bonus.timing === timing
  );
}

/**
 * Get passive itemsets (always active when complete)
 */
export function getPassiveItemsets(): ItemsetDefinition[] {
  return getAllItemsetDefinitions().filter(
    (itemset) => itemset.bonus.passive === true
  );
}

/**
 * Check if a specific itemset is active given equipped items
 */
export function isItemsetActive(
  itemsetId: ItemsetId,
  equippedToolId: ToolId | null,
  equippedGearIds: GearId[]
): boolean {
  return checkItemsetComplete(itemsetId, equippedToolId, equippedGearIds);
}

/**
 * Get all active itemsets with their definitions
 */
export function getActiveItemsetsWithDefinitions(
  equippedToolId: ToolId | null,
  equippedGearIds: GearId[]
): ItemsetDefinition[] {
  const activeIds = getActiveItemsets(equippedToolId, equippedGearIds);
  return activeIds.map((id) => getItemsetDefinition(id));
}

/**
 * Get active itemsets for a specific timing
 */
export function getActiveItemsetsForTiming(
  equippedToolId: ToolId | null,
  equippedGearIds: GearId[],
  timing: EffectTiming
): ItemsetDefinition[] {
  const activeItemsets = getActiveItemsetsWithDefinitions(equippedToolId, equippedGearIds);
  return activeItemsets.filter((itemset) => itemset.bonus.timing === timing);
}

/**
 * Get active passive itemsets
 */
export function getActivePassiveItemsets(
  equippedToolId: ToolId | null,
  equippedGearIds: GearId[]
): ItemsetDefinition[] {
  const activeItemsets = getActiveItemsetsWithDefinitions(equippedToolId, equippedGearIds);
  return activeItemsets.filter((itemset) => itemset.bonus.passive === true);
}
