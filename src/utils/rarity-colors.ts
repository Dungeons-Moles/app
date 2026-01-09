import type { Rarity } from '@/game/engine/types';

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
