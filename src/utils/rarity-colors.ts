import type { ItemRarity, Rarity } from '@/game/engine/types';

export const RARITY_COLORS: Record<Rarity, string> = {
  COMMON: '#9ca3af',
  UNCOMMON: '#22c55e',
  RARE: '#3b82f6',
  EPIC: '#a855f7',
};

export const RARITY_BG_COLORS: Record<Rarity, string> = {
  COMMON: '#f3f4f6',
  UNCOMMON: '#dcfce7',
  RARE: '#dbeafe',
  EPIC: '#f3e8ff',
};

export const ITEM_RARITY_COLORS: Record<ItemRarity, string> = {
  COMMON: '#A0A0A0',
  SAPPHIRE: '#4A90D9',
  GOLDEN: '#FFD700',
  RARE: '#A855F7',
  HEROIC: '#F97316',
  MYTHIC: '#FFD700',
};

export const ITEM_RARITY_BG_COLORS: Record<ItemRarity, string> = {
  COMMON: '#f3f4f6',
  SAPPHIRE: '#dbeafe',
  GOLDEN: '#fef3c7',
  RARE: '#dbeafe',
  HEROIC: '#ede9fe',
  MYTHIC: '#ffedd5',
};

/** Subtle rarity fill for item squares (COMMON has no fill) */
export const ITEM_RARITY_FILL: Partial<Record<ItemRarity, string>> = {
  RARE: 'rgba(168, 85, 247, 0.15)',
  HEROIC: 'rgba(249, 115, 22, 0.15)',
  MYTHIC: 'rgba(255, 215, 0, 0.15)',
};
