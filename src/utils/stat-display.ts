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
      if (!value) {
        return null;
      }
      const sign = value > 0 ? '+' : '';
      return `${sign}${value} ${STAT_ABBREV[key]}`;
    })
    .filter((part): part is string => part !== null)
    .join(' ');
}
