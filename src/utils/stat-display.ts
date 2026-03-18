import type { Gear, Tool } from '@/game/engine/types';
import { getGearStatsAtTier } from '@/data/gear-effects';
import { getTierFromRarity } from '@/data/gear';
import { getToolStatsAtTier, rarityToToolTier } from '@/game/entities/items';

export const STAT_ABBREV = {
  hp: 'HP',
  maxHp: 'HP',
  atk: 'ATK',
  arm: 'ARM',
  spd: 'SPD',
  dig: 'DIG',
} as const;

type StatKey = keyof typeof STAT_ABBREV;

const STAT_ORDER: StatKey[] = ['hp', 'maxHp', 'atk', 'arm', 'spd', 'dig'];

export function formatStatBonuses(stats: Partial<Record<StatKey, number>>): string {
  return STAT_ORDER
    .map((key) => {
      const value = stats[key];
      if (value === undefined || value === null) {
        return null;
      }
      const sign = value > 0 ? '+' : '';
      return `${sign}${value} ${STAT_ABBREV[key]}`;
    })
    .filter((part): part is string => part !== null)
    .join(' ');
}

export function extractStatBonuses(item: Gear | Tool): Partial<Record<StatKey, number>> {
  const bonuses: Partial<Record<StatKey, number>> = {};
  const directStats = item.stats as Partial<Record<StatKey, number>>;
  const bakedStats = 'currentRarity' in item
    ? (getGearStatsAtTier(item.id, getTierFromRarity(item.currentRarity)) as Partial<
        Record<StatKey, number>
      >)
    : (getToolStatsAtTier(item.id, rarityToToolTier(item.rarity)) as Partial<
        Record<StatKey, number>
      >);

  STAT_ORDER.forEach((key) => {
    const value = Math.max(directStats[key] ?? 0, bakedStats[key] ?? 0);
    if (value) {
      bonuses[key] = value;
    }
  });

  return bonuses;
}
