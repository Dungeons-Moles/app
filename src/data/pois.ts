/**
 * POI (Point of Interest) definitions (L1-L12)
 * @see specs/001-pve-dungeon-crawler/spec.md Appendix F
 * @see specs/001-pve-dungeon-crawler/data-model.md
 */

import type { POIInteractionType, Position } from '../game/engine/types';
import type { MapPOI } from '../game/map/types';

export type POIId =
  | 'L1' // Mole Den
  | 'L2' // Supply Cache
  | 'L3' // Tool Crate
  | 'L4' // Tool Oil Rack
  | 'L5' // Rest Alcove
  | 'L6' // Survey Beacon
  | 'L7' // Seismic Scanner
  | 'L8' // Rail Waypoint
  | 'L9' // Smuggler Hatch
  | 'L10' // Rusty Anvil
  | 'L11' // Rune Kiln
  | 'L12' // Geode Vault
  | 'L13' // Counter Cache
  | 'L14'; // Scrap Chute

export type POIRarity = 'FIXED' | 'COMMON' | 'UNCOMMON' | 'RARE';

export interface POIDefinition {
  id: POIId;
  name: string;
  emoji: string;
  image?: any;
  rarity: POIRarity;
  interaction: POIInteractionType;
  nightOnly?: boolean;
  description: string;
}

/**
 * All POI definitions per spec.md Appendix F
 */
export const POI_DEFINITIONS: Record<POIId, POIDefinition> = {
  // ============================================================================
  // L1 - Mole Den (Fixed spawn, adjacent to player start)
  // ============================================================================
  L1: {
    id: 'L1',
    name: 'Mole Den',
    emoji: '🏠',
    image: require('../../assets/world/pois/mole-den.webp'),
    rarity: 'FIXED',
    interaction: 'REST',
    nightOnly: true,
    description: 'Night only: Skip to Day, restore all HP',
  },

  // ============================================================================
  // L2 - Supply Cache (Common)
  // ============================================================================
  L2: {
    id: 'L2',
    name: 'Supply Cache',
    emoji: '📦',
    image: require('../../assets/world/pois/supply-cache.webp'),
    rarity: 'COMMON',
    interaction: 'ITEM_SELECTION',
    description: 'Pick 1 of 3 Common/Rare items',
  },

  // ============================================================================
  // L3 - Tool Crate (Uncommon)
  // ============================================================================
  L3: {
    id: 'L3',
    name: 'Tool Crate',
    emoji: '🧰',
    image: require('../../assets/world/pois/tool-crate.webp'),
    rarity: 'UNCOMMON',
    interaction: 'ITEM_SELECTION',
    description: 'Pick 1 of 3 Tools',
  },

  // ============================================================================
  // L4 - Tool Oil Rack (Common)
  // ============================================================================
  L4: {
    id: 'L4',
    name: 'Tool Oil Rack',
    emoji: '🛢️',
    image: require('../../assets/world/pois/tool-oil-rack.webp'),
    rarity: 'COMMON',
    interaction: 'TOOL_MODIFY',
    description: 'Modify current tool: +1 ATK, +1 SPD, +1 DIG, or +1 ARM (once per tool)',
  },

  // ============================================================================
  // L5 - Rest Alcove (Common)
  // ============================================================================
  L5: {
    id: 'L5',
    name: 'Rest Alcove',
    emoji: '🕯️',
    image: require('../../assets/world/pois/rest-alcove.webp'),
    rarity: 'COMMON',
    interaction: 'REST',
    nightOnly: true,
    description: 'Night only: Skip to Day, restore 10 HP',
  },

  // ============================================================================
  // L6 - Survey Beacon (Common)
  // ============================================================================
  L6: {
    id: 'L6',
    name: 'Survey Beacon',
    emoji: '📡',
    image: require('../../assets/world/pois/survey-beacon.webp'),
    rarity: 'COMMON',
    interaction: 'REVEAL',
    description: 'Reveal tiles in radius 13',
  },

  // ============================================================================
  // L7 - Seismic Scanner (Uncommon)
  // ============================================================================
  L7: {
    id: 'L7',
    name: 'Seismic Scanner',
    emoji: '📍',
    image: require('../../assets/world/pois/seismic-scanner.webp'),
    rarity: 'UNCOMMON',
    interaction: 'REVEAL',
    description: 'Choose POI type, reveal nearest instance',
  },

  // ============================================================================
  // L8 - Rail Waypoint (Uncommon)
  // ============================================================================
  L8: {
    id: 'L8',
    name: 'Rail Waypoint',
    emoji: '🚇',
    image: require('../../assets/world/pois/rail-waypoint.webp'),
    rarity: 'UNCOMMON',
    interaction: 'FAST_TRAVEL',
    description: 'Fast travel between discovered waypoints',
  },

  // ============================================================================
  // L9 - Smuggler Hatch (Uncommon)
  // ============================================================================
  L9: {
    id: 'L9',
    name: 'Smuggler Hatch',
    emoji: '🕳️',
    image: require('../../assets/world/pois/smuggler-hatch.webp'),
    rarity: 'UNCOMMON',
    interaction: 'SHOP',
    description: 'Shop: 1 Tool + 5 Gear; max 3 rerolls per visit',
  },

  // ============================================================================
  // L10 - Rusty Anvil (Uncommon)
  // ============================================================================
  L10: {
    id: 'L10',
    name: 'Rusty Anvil',
    emoji: '⚒️',
    image: require('../../assets/world/pois/rusty-anvil.webp'),
    rarity: 'UNCOMMON',
    interaction: 'UPGRADE',
    description: 'Upgrade tool tier (I→II: 10g, II→III: 20g), reusable',
  },

  // ============================================================================
  // L11 - Rune Kiln (Rare)
  // ============================================================================
  L11: {
    id: 'L11',
    name: 'Rune Kiln',
    emoji: '🏺',
    image: require('../../assets/world/pois/rune-kiln.webp'),
    rarity: 'RARE',
    interaction: 'FUSE',
    description: 'Fuse 2 identical items to upgrade tier',
  },

  // ============================================================================
  // L12 - Geode Vault (Rare)
  // ============================================================================
  L12: {
    id: 'L12',
    name: 'Geode Vault',
    emoji: '💠',
    image: require('../../assets/world/pois/geode-vault.webp'),
    rarity: 'RARE',
    interaction: 'ITEM_SELECTION',
    description: 'Pick 1 of 3 Heroic/Mythic items',
  },

  // ============================================================================
  // L13 - Counter Cache (Uncommon) - T083
  // Pick 1 of 3 items from boss weakness tags only
  // ============================================================================
  L13: {
    id: 'L13',
    name: 'Counter Cache',
    emoji: '🎯',
    image: require('../../assets/world/pois/counter-cache.webp'),
    rarity: 'UNCOMMON',
    interaction: 'ITEM_SELECTION',
    description: 'Pick 1 of 3 items from boss weakness tags',
  },

  // ============================================================================
  // L14 - Scrap Chute (Uncommon) - T084
  // Destroy 1 Gear item (cost 4g, refunds by rarity)
  // ============================================================================
  L14: {
    id: 'L14',
    name: 'Scrap Chute',
    emoji: '🗑️',
    image: require('../../assets/world/pois/scrap-chute.webp'),
    rarity: 'UNCOMMON',
    interaction: 'DESTROY',
    description: 'Destroy 1 Gear item (cost 4g, refund by rarity: 2/4/6/10)',
  },
};

/**
 * Get POI definition by ID
 */
export function getPOIDefinition(id: POIId): POIDefinition {
  return POI_DEFINITIONS[id];
}

/**
 * Get all POI definitions as an array
 */
export function getAllPOIDefinitions(): POIDefinition[] {
  return Object.values(POI_DEFINITIONS);
}

/**
 * Get POI definitions by rarity
 */
export function getPOIsByRarity(rarity: POIRarity): POIDefinition[] {
  return getAllPOIDefinitions().filter((poi) => poi.rarity === rarity);
}

/**
 * Get POI definitions by interaction type
 */
export function getPOIsByInteraction(interaction: POIInteractionType): POIDefinition[] {
  return getAllPOIDefinitions().filter((poi) => poi.interaction === interaction);
}

/**
 * Get night-only POIs
 */
export function getNightOnlyPOIs(): POIDefinition[] {
  return getAllPOIDefinitions().filter((poi) => poi.nightOnly === true);
}

/**
 * Check if a POI can be interacted with during the current time phase
 */
export function canInteractWithPOI(poiId: POIId, isNight: boolean): boolean {
  const poi = getPOIDefinition(poiId);
  if (poi.nightOnly) {
    return isNight;
  }
  return true;
}

/**
 * POI spawn weights based on rarity
 */
export const POI_SPAWN_WEIGHTS: Record<POIRarity, number> = {
  FIXED: 0, // Mole Den is placed manually, not spawned randomly
  COMMON: 10, // High spawn chance
  UNCOMMON: 5, // Medium spawn chance
  RARE: 2, // Low spawn chance
};

/**
 * Minimum spacing between POIs of the same type (in tiles)
 */
export const POI_MIN_SPACING = 10;

/**
 * Create a map POI instance
 */
export function createMapPOI(definitionId: POIId, position: Position, instanceId?: string): MapPOI {
  return {
    id: instanceId ?? `${definitionId}_${position.x}_${position.y}`,
    definitionId,
    position,
    visited: false,
    discovered: false,
  };
}

/**
 * Get weighted random POI for spawning (excludes FIXED rarity)
 */
export function getRandomPOIForSpawn(rng: () => number): POIId | null {
  const spawnablePOIs = getAllPOIDefinitions().filter((poi) => poi.rarity !== 'FIXED');

  if (spawnablePOIs.length === 0) return null;

  // Calculate total weight
  const totalWeight = spawnablePOIs.reduce((sum, poi) => sum + POI_SPAWN_WEIGHTS[poi.rarity], 0);

  // Pick weighted random
  let roll = rng() * totalWeight;
  for (const poi of spawnablePOIs) {
    roll -= POI_SPAWN_WEIGHTS[poi.rarity];
    if (roll <= 0) {
      return poi.id;
    }
  }

  // Fallback (should never reach)
  return spawnablePOIs[0].id;
}
