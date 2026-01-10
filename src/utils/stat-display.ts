import type { Gear, Tool } from '@/game/engine/types';

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
  const stats = item.stats as Partial<Record<StatKey, number>>;

  STAT_ORDER.forEach((key) => {
    const value = stats[key];
    if (value) {
      bonuses[key] = value;
    }
  });

  return bonuses;
}
