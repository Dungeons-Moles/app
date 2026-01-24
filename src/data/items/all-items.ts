/**
 * 80-Item Static Data Definitions
 *
 * All 80 items in the game, organized by set affiliation.
 * Items 0-39 are "starter" items (always unlocked).
 * Items 40-79 are unlockable items (earned through level completion).
 *
 * @see data-model.md for PlayerProfile.unlockedItems
 */

// ============================================================================
// Types
// ============================================================================

/** Item rarity tiers */
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/** Item set affiliations */
export type ItemSet =
  | 'Miner'
  | 'Warrior'
  | 'Scout'
  | 'Tank'
  | 'Berserker'
  | 'Frost'
  | 'Fire'
  | 'Poison'
  | 'Shadow'
  | 'Divine';

/** Item stat bonuses */
export interface ItemStats {
  hp?: number;
  maxHp?: number;
  atk?: number;
  arm?: number;
  spd?: number;
  dig?: number;
}

/** Item definition */
export interface Item {
  /** Unique item index (0-79) */
  id: number;
  /** Display name */
  name: string;
  /** Set affiliation */
  set: ItemSet;
  /** Rarity tier */
  rarity: ItemRarity;
  /** Stat bonuses */
  stats: ItemStats;
  /** Emoji icon */
  emoji: string;
  /** Whether this is a starter item (always unlocked) */
  isStarter: boolean;
  /** Level that unlocks this item (40-79 only) */
  unlockLevel?: number;
}

// ============================================================================
// Item Definitions
// ============================================================================

/**
 * All 80 items in the game.
 * Indexed by item ID (0-79).
 */
export const ALL_ITEMS: Item[] = [
  // ========================================
  // STARTER ITEMS (0-39) - Always Unlocked
  // ========================================

  // Miner Set (0-7) - 8 items
  {
    id: 0,
    name: 'Basic Pickaxe',
    set: 'Miner',
    rarity: 'common',
    stats: { dig: 1 },
    emoji: '⛏️',
    isStarter: true,
  },
  {
    id: 1,
    name: 'Miner Helmet',
    set: 'Miner',
    rarity: 'common',
    stats: { arm: 1 },
    emoji: '⛑️',
    isStarter: true,
  },
  {
    id: 2,
    name: 'Mining Gloves',
    set: 'Miner',
    rarity: 'common',
    stats: { dig: 1 },
    emoji: '🧤',
    isStarter: true,
  },
  {
    id: 3,
    name: 'Headlamp',
    set: 'Miner',
    rarity: 'uncommon',
    stats: { spd: 1 },
    emoji: '🔦',
    isStarter: true,
  },
  {
    id: 4,
    name: 'Reinforced Boots',
    set: 'Miner',
    rarity: 'uncommon',
    stats: { arm: 1, dig: 1 },
    emoji: '🥾',
    isStarter: true,
  },
  {
    id: 5,
    name: 'Canary Cage',
    set: 'Miner',
    rarity: 'rare',
    stats: { maxHp: 2 },
    emoji: '🐦',
    isStarter: true,
  },
  {
    id: 6,
    name: 'Mining Cart',
    set: 'Miner',
    rarity: 'rare',
    stats: { spd: 2 },
    emoji: '🚃',
    isStarter: true,
  },
  {
    id: 7,
    name: 'Dynamite Bundle',
    set: 'Miner',
    rarity: 'epic',
    stats: { atk: 2, dig: 2 },
    emoji: '🧨',
    isStarter: true,
  },

  // Warrior Set (8-15) - 8 items
  {
    id: 8,
    name: 'Iron Sword',
    set: 'Warrior',
    rarity: 'common',
    stats: { atk: 1 },
    emoji: '⚔️',
    isStarter: true,
  },
  {
    id: 9,
    name: 'Wooden Shield',
    set: 'Warrior',
    rarity: 'common',
    stats: { arm: 1 },
    emoji: '🛡️',
    isStarter: true,
  },
  {
    id: 10,
    name: 'Chainmail',
    set: 'Warrior',
    rarity: 'common',
    stats: { arm: 1 },
    emoji: '🔗',
    isStarter: true,
  },
  {
    id: 11,
    name: 'Battle Axe',
    set: 'Warrior',
    rarity: 'uncommon',
    stats: { atk: 2 },
    emoji: '🪓',
    isStarter: true,
  },
  {
    id: 12,
    name: 'War Hammer',
    set: 'Warrior',
    rarity: 'uncommon',
    stats: { atk: 1, arm: 1 },
    emoji: '🔨',
    isStarter: true,
  },
  {
    id: 13,
    name: 'Knight Helm',
    set: 'Warrior',
    rarity: 'rare',
    stats: { arm: 2 },
    emoji: '🪖',
    isStarter: true,
  },
  {
    id: 14,
    name: 'Battle Standard',
    set: 'Warrior',
    rarity: 'rare',
    stats: { atk: 1, maxHp: 2 },
    emoji: '🚩',
    isStarter: true,
  },
  {
    id: 15,
    name: 'Champion Blade',
    set: 'Warrior',
    rarity: 'epic',
    stats: { atk: 3 },
    emoji: '🗡️',
    isStarter: true,
  },

  // Scout Set (16-23) - 8 items
  {
    id: 16,
    name: 'Leather Boots',
    set: 'Scout',
    rarity: 'common',
    stats: { spd: 1 },
    emoji: '👢',
    isStarter: true,
  },
  {
    id: 17,
    name: 'Short Bow',
    set: 'Scout',
    rarity: 'common',
    stats: { atk: 1 },
    emoji: '🏹',
    isStarter: true,
  },
  {
    id: 18,
    name: 'Dagger',
    set: 'Scout',
    rarity: 'common',
    stats: { spd: 1 },
    emoji: '🗡️',
    isStarter: true,
  },
  {
    id: 19,
    name: 'Cloak',
    set: 'Scout',
    rarity: 'uncommon',
    stats: { spd: 1, arm: 1 },
    emoji: '🧥',
    isStarter: true,
  },
  {
    id: 20,
    name: 'Grappling Hook',
    set: 'Scout',
    rarity: 'uncommon',
    stats: { spd: 2 },
    emoji: '🪝',
    isStarter: true,
  },
  {
    id: 21,
    name: 'Spyglass',
    set: 'Scout',
    rarity: 'rare',
    stats: { spd: 1, dig: 1 },
    emoji: '🔭',
    isStarter: true,
  },
  {
    id: 22,
    name: 'Swift Quiver',
    set: 'Scout',
    rarity: 'rare',
    stats: { atk: 1, spd: 1 },
    emoji: '🎯',
    isStarter: true,
  },
  {
    id: 23,
    name: 'Shadow Step',
    set: 'Scout',
    rarity: 'epic',
    stats: { spd: 3 },
    emoji: '👤',
    isStarter: true,
  },

  // Tank Set (24-31) - 8 items
  {
    id: 24,
    name: 'Heavy Shield',
    set: 'Tank',
    rarity: 'common',
    stats: { arm: 2 },
    emoji: '🛡️',
    isStarter: true,
  },
  {
    id: 25,
    name: 'Plate Armor',
    set: 'Tank',
    rarity: 'common',
    stats: { arm: 1, maxHp: 1 },
    emoji: '🦾',
    isStarter: true,
  },
  {
    id: 26,
    name: 'Tower Shield',
    set: 'Tank',
    rarity: 'uncommon',
    stats: { arm: 2 },
    emoji: '🏰',
    isStarter: true,
  },
  {
    id: 27,
    name: 'Iron Bracers',
    set: 'Tank',
    rarity: 'uncommon',
    stats: { arm: 1 },
    emoji: '🔩',
    isStarter: true,
  },
  {
    id: 28,
    name: 'Fortified Helm',
    set: 'Tank',
    rarity: 'rare',
    stats: { arm: 2, maxHp: 1 },
    emoji: '⛑️',
    isStarter: true,
  },
  {
    id: 29,
    name: 'Barrier Charm',
    set: 'Tank',
    rarity: 'rare',
    stats: { maxHp: 3 },
    emoji: '🧿',
    isStarter: true,
  },
  {
    id: 30,
    name: 'Aegis',
    set: 'Tank',
    rarity: 'epic',
    stats: { arm: 3 },
    emoji: '✨',
    isStarter: true,
  },
  {
    id: 31,
    name: 'Fortress Gauntlets',
    set: 'Tank',
    rarity: 'epic',
    stats: { arm: 2, atk: 1 },
    emoji: '🧱',
    isStarter: true,
  },

  // Berserker Set (32-39) - 8 items
  {
    id: 32,
    name: 'Rage Ring',
    set: 'Berserker',
    rarity: 'common',
    stats: { atk: 1 },
    emoji: '💍',
    isStarter: true,
  },
  {
    id: 33,
    name: 'Blood Axe',
    set: 'Berserker',
    rarity: 'common',
    stats: { atk: 1 },
    emoji: '🪓',
    isStarter: true,
  },
  {
    id: 34,
    name: 'Fury Helm',
    set: 'Berserker',
    rarity: 'uncommon',
    stats: { atk: 1, maxHp: 1 },
    emoji: '😤',
    isStarter: true,
  },
  {
    id: 35,
    name: 'Berserk Talisman',
    set: 'Berserker',
    rarity: 'uncommon',
    stats: { atk: 2 },
    emoji: '📿',
    isStarter: true,
  },
  {
    id: 36,
    name: 'Wrath Gauntlets',
    set: 'Berserker',
    rarity: 'rare',
    stats: { atk: 2 },
    emoji: '🥊',
    isStarter: true,
  },
  {
    id: 37,
    name: 'Chaos Blade',
    set: 'Berserker',
    rarity: 'rare',
    stats: { atk: 2, spd: 1 },
    emoji: '⚡',
    isStarter: true,
  },
  {
    id: 38,
    name: 'Rampage Armor',
    set: 'Berserker',
    rarity: 'epic',
    stats: { atk: 2, maxHp: 2 },
    emoji: '🔥',
    isStarter: true,
  },
  {
    id: 39,
    name: 'Destroyer',
    set: 'Berserker',
    rarity: 'epic',
    stats: { atk: 4 },
    emoji: '💀',
    isStarter: true,
  },

  // ========================================
  // UNLOCKABLE ITEMS (40-79) - Level Rewards
  // ========================================

  // Frost Set (40-47) - 8 items
  {
    id: 40,
    name: 'Frost Shard',
    set: 'Frost',
    rarity: 'uncommon',
    stats: { atk: 1, spd: 1 },
    emoji: '❄️',
    isStarter: false,
    unlockLevel: 2,
  },
  {
    id: 41,
    name: 'Ice Armor',
    set: 'Frost',
    rarity: 'uncommon',
    stats: { arm: 2 },
    emoji: '🧊',
    isStarter: false,
    unlockLevel: 3,
  },
  {
    id: 42,
    name: 'Frozen Heart',
    set: 'Frost',
    rarity: 'rare',
    stats: { maxHp: 2, arm: 1 },
    emoji: '💙',
    isStarter: false,
    unlockLevel: 4,
  },
  {
    id: 43,
    name: 'Blizzard Cloak',
    set: 'Frost',
    rarity: 'rare',
    stats: { arm: 1, spd: 2 },
    emoji: '🌨️',
    isStarter: false,
    unlockLevel: 5,
  },
  {
    id: 44,
    name: 'Glacial Blade',
    set: 'Frost',
    rarity: 'epic',
    stats: { atk: 2, spd: 1 },
    emoji: '🗡️',
    isStarter: false,
    unlockLevel: 6,
  },
  {
    id: 45,
    name: 'Icicle Crown',
    set: 'Frost',
    rarity: 'epic',
    stats: { atk: 1, arm: 2 },
    emoji: '👑',
    isStarter: false,
    unlockLevel: 7,
  },
  {
    id: 46,
    name: 'Permafrost Shield',
    set: 'Frost',
    rarity: 'legendary',
    stats: { arm: 3, maxHp: 2 },
    emoji: '🛡️',
    isStarter: false,
    unlockLevel: 8,
  },
  {
    id: 47,
    name: "Winter's End",
    set: 'Frost',
    rarity: 'legendary',
    stats: { atk: 3, spd: 2 },
    emoji: '☃️',
    isStarter: false,
    unlockLevel: 9,
  },

  // Fire Set (48-55) - 8 items
  {
    id: 48,
    name: 'Ember Stone',
    set: 'Fire',
    rarity: 'uncommon',
    stats: { atk: 2 },
    emoji: '🔥',
    isStarter: false,
    unlockLevel: 10,
  },
  {
    id: 49,
    name: 'Flame Guard',
    set: 'Fire',
    rarity: 'uncommon',
    stats: { atk: 1, arm: 1 },
    emoji: '🔰',
    isStarter: false,
    unlockLevel: 11,
  },
  {
    id: 50,
    name: 'Inferno Ring',
    set: 'Fire',
    rarity: 'rare',
    stats: { atk: 2, maxHp: 1 },
    emoji: '💍',
    isStarter: false,
    unlockLevel: 12,
  },
  {
    id: 51,
    name: 'Phoenix Feather',
    set: 'Fire',
    rarity: 'rare',
    stats: { spd: 2, maxHp: 2 },
    emoji: '🪶',
    isStarter: false,
    unlockLevel: 13,
  },
  {
    id: 52,
    name: 'Blazing Sword',
    set: 'Fire',
    rarity: 'epic',
    stats: { atk: 3 },
    emoji: '⚔️',
    isStarter: false,
    unlockLevel: 14,
  },
  {
    id: 53,
    name: 'Molten Armor',
    set: 'Fire',
    rarity: 'epic',
    stats: { arm: 2, atk: 1 },
    emoji: '🌋',
    isStarter: false,
    unlockLevel: 15,
  },
  {
    id: 54,
    name: 'Dragonfire Amulet',
    set: 'Fire',
    rarity: 'legendary',
    stats: { atk: 4, maxHp: 2 },
    emoji: '🐉',
    isStarter: false,
    unlockLevel: 16,
  },
  {
    id: 55,
    name: 'Sunforged Blade',
    set: 'Fire',
    rarity: 'legendary',
    stats: { atk: 4, spd: 1 },
    emoji: '☀️',
    isStarter: false,
    unlockLevel: 17,
  },

  // Poison Set (56-63) - 8 items
  {
    id: 56,
    name: 'Venom Fang',
    set: 'Poison',
    rarity: 'uncommon',
    stats: { atk: 1, spd: 1 },
    emoji: '🦷',
    isStarter: false,
    unlockLevel: 18,
  },
  {
    id: 57,
    name: 'Toxic Cloak',
    set: 'Poison',
    rarity: 'uncommon',
    stats: { arm: 1, spd: 1 },
    emoji: '🧪',
    isStarter: false,
    unlockLevel: 19,
  },
  {
    id: 58,
    name: 'Plague Mask',
    set: 'Poison',
    rarity: 'rare',
    stats: { arm: 2, atk: 1 },
    emoji: '🎭',
    isStarter: false,
    unlockLevel: 20,
  },
  {
    id: 59,
    name: 'Serpent Ring',
    set: 'Poison',
    rarity: 'rare',
    stats: { atk: 2, spd: 1 },
    emoji: '🐍',
    isStarter: false,
    unlockLevel: 21,
  },
  {
    id: 60,
    name: 'Acid Blade',
    set: 'Poison',
    rarity: 'epic',
    stats: { atk: 3 },
    emoji: '🗡️',
    isStarter: false,
    unlockLevel: 22,
  },
  {
    id: 61,
    name: 'Corrosive Shield',
    set: 'Poison',
    rarity: 'epic',
    stats: { arm: 2, atk: 1 },
    emoji: '☢️',
    isStarter: false,
    unlockLevel: 23,
  },
  {
    id: 62,
    name: 'Basilisk Eye',
    set: 'Poison',
    rarity: 'legendary',
    stats: { atk: 3, arm: 2 },
    emoji: '👁️',
    isStarter: false,
    unlockLevel: 24,
  },
  {
    id: 63,
    name: "Death's Embrace",
    set: 'Poison',
    rarity: 'legendary',
    stats: { atk: 4, spd: 2 },
    emoji: '💀',
    isStarter: false,
    unlockLevel: 25,
  },

  // Shadow Set (64-71) - 8 items
  {
    id: 64,
    name: 'Shadow Dagger',
    set: 'Shadow',
    rarity: 'uncommon',
    stats: { atk: 1, spd: 1 },
    emoji: '🌑',
    isStarter: false,
    unlockLevel: 26,
  },
  {
    id: 65,
    name: 'Darkness Cloak',
    set: 'Shadow',
    rarity: 'uncommon',
    stats: { spd: 2 },
    emoji: '🖤',
    isStarter: false,
    unlockLevel: 27,
  },
  {
    id: 66,
    name: 'Phantom Mask',
    set: 'Shadow',
    rarity: 'rare',
    stats: { spd: 2, arm: 1 },
    emoji: '👻',
    isStarter: false,
    unlockLevel: 28,
  },
  {
    id: 67,
    name: 'Void Ring',
    set: 'Shadow',
    rarity: 'rare',
    stats: { atk: 2, spd: 1 },
    emoji: '⚫',
    isStarter: false,
    unlockLevel: 29,
  },
  {
    id: 68,
    name: 'Nightmare Blade',
    set: 'Shadow',
    rarity: 'epic',
    stats: { atk: 3, spd: 1 },
    emoji: '🌙',
    isStarter: false,
    unlockLevel: 30,
  },
  {
    id: 69,
    name: 'Eclipse Armor',
    set: 'Shadow',
    rarity: 'epic',
    stats: { arm: 2, spd: 2 },
    emoji: '🌘',
    isStarter: false,
    unlockLevel: 31,
  },
  {
    id: 70,
    name: 'Abyssal Crown',
    set: 'Shadow',
    rarity: 'legendary',
    stats: { atk: 3, spd: 3 },
    emoji: '👑',
    isStarter: false,
    unlockLevel: 32,
  },
  {
    id: 71,
    name: 'Soul Reaper',
    set: 'Shadow',
    rarity: 'legendary',
    stats: { atk: 5, spd: 1 },
    emoji: '💀',
    isStarter: false,
    unlockLevel: 33,
  },

  // Divine Set (72-79) - 8 items
  {
    id: 72,
    name: 'Holy Symbol',
    set: 'Divine',
    rarity: 'uncommon',
    stats: { maxHp: 2 },
    emoji: '✝️',
    isStarter: false,
    unlockLevel: 34,
  },
  {
    id: 73,
    name: 'Angel Wings',
    set: 'Divine',
    rarity: 'uncommon',
    stats: { spd: 2 },
    emoji: '🕊️',
    isStarter: false,
    unlockLevel: 35,
  },
  {
    id: 74,
    name: 'Blessed Armor',
    set: 'Divine',
    rarity: 'rare',
    stats: { arm: 2, maxHp: 2 },
    emoji: '⚜️',
    isStarter: false,
    unlockLevel: 36,
  },
  {
    id: 75,
    name: 'Sacred Ring',
    set: 'Divine',
    rarity: 'rare',
    stats: { atk: 1, maxHp: 3 },
    emoji: '💫',
    isStarter: false,
    unlockLevel: 37,
  },
  {
    id: 76,
    name: 'Seraph Blade',
    set: 'Divine',
    rarity: 'epic',
    stats: { atk: 3, maxHp: 2 },
    emoji: '⚔️',
    isStarter: false,
    unlockLevel: 38,
  },
  {
    id: 77,
    name: 'Radiant Shield',
    set: 'Divine',
    rarity: 'epic',
    stats: { arm: 3, maxHp: 2 },
    emoji: '🛡️',
    isStarter: false,
    unlockLevel: 39,
  },
  {
    id: 78,
    name: 'Halo of Light',
    set: 'Divine',
    rarity: 'legendary',
    stats: { maxHp: 5, arm: 2 },
    emoji: '😇',
    isStarter: false,
    unlockLevel: 40,
  },
  {
    id: 79,
    name: 'Godslayer',
    set: 'Divine',
    rarity: 'legendary',
    stats: { atk: 5, arm: 2 },
    emoji: '🌟',
    isStarter: false,
    unlockLevel: 40,
  },
];

// ============================================================================
// Lookup Functions
// ============================================================================

/**
 * Get an item by its index.
 *
 * @param id - Item index (0-79)
 * @returns Item definition or undefined
 */
export function getItemById(id: number): Item | undefined {
  return ALL_ITEMS[id];
}

/**
 * Get all items in a specific set.
 *
 * @param set - Item set name
 * @returns Array of items in the set
 */
export function getItemsBySet(set: ItemSet): Item[] {
  return ALL_ITEMS.filter((item) => item.set === set);
}

/**
 * Get all items of a specific rarity.
 *
 * @param rarity - Rarity tier
 * @returns Array of items with that rarity
 */
export function getItemsByRarity(rarity: ItemRarity): Item[] {
  return ALL_ITEMS.filter((item) => item.rarity === rarity);
}

/**
 * Get all starter items (always unlocked).
 *
 * @returns Array of starter items (indices 0-39)
 */
export function getStarterItems(): Item[] {
  return ALL_ITEMS.filter((item) => item.isStarter);
}

/**
 * Get all unlockable items (earned through play).
 *
 * @returns Array of unlockable items (indices 40-79)
 */
export function getUnlockableItems(): Item[] {
  return ALL_ITEMS.filter((item) => !item.isStarter);
}

/**
 * Get the item unlocked for completing a specific level.
 *
 * @param level - Campaign level (1-40)
 * @returns Item unlocked at this level, or undefined
 */
export function getItemForLevel(level: number): Item | undefined {
  return ALL_ITEMS.find((item) => item.unlockLevel === level);
}

// ============================================================================
// Set Information
// ============================================================================

/** All item sets in the game */
export const ALL_SETS: ItemSet[] = [
  'Miner',
  'Warrior',
  'Scout',
  'Tank',
  'Berserker',
  'Frost',
  'Fire',
  'Poison',
  'Shadow',
  'Divine',
];

/** Set colors for UI display */
export const SET_COLORS: Record<ItemSet, string> = {
  Miner: '#8B4513',
  Warrior: '#B22222',
  Scout: '#228B22',
  Tank: '#4169E1',
  Berserker: '#FF4500',
  Frost: '#00CED1',
  Fire: '#FF6347',
  Poison: '#9932CC',
  Shadow: '#2F4F4F',
  Divine: '#FFD700',
};

/** Set emojis for UI display */
export const SET_EMOJIS: Record<ItemSet, string> = {
  Miner: '⛏️',
  Warrior: '⚔️',
  Scout: '🏹',
  Tank: '🛡️',
  Berserker: '💥',
  Frost: '❄️',
  Fire: '🔥',
  Poison: '☠️',
  Shadow: '🌑',
  Divine: '✨',
};

// ============================================================================
// Rarity Information
// ============================================================================

/** Rarity colors for UI display */
export const RARITY_COLORS: Record<ItemRarity, string> = {
  common: '#9CA3AF',
  uncommon: '#22C55E',
  rare: '#3B82F6',
  epic: '#A855F7',
  legendary: '#F97316',
};

/** Rarity order for sorting */
export const RARITY_ORDER: Record<ItemRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};
