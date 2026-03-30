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
  RARE: '#4169E1',
  HEROIC: '#9932CC',
  MYTHIC: '#FF4500',
};

export const ITEM_RARITY_BG_COLORS: Record<ItemRarity, string> = {
  COMMON: '#f3f4f6',
  SAPPHIRE: '#dbeafe',
  GOLDEN: '#fef3c7',
  RARE: '#dbeafe',
  HEROIC: '#ede9fe',
  MYTHIC: '#ffedd5',
};
