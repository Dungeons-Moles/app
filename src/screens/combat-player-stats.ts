import { calculateItemStats } from '@/game/entities/items';
import type { Gear, Tool } from '@/game/engine/types';

export type CombatPlayerStats = {
  hp: number;
  maxHp: number;
  atk: number;
  arm: number;
  spd: number;
  dig: number;
  gold: number;
};

export function normalizeCombatPlayerStats(
  stats: CombatPlayerStats,
  playerGear: Gear[],
  playerTool: Tool | null
): CombatPlayerStats {
  const itemStats = calculateItemStats(playerTool, playerGear);

  return {
    hp: stats.hp,
    maxHp: stats.maxHp,
    atk: Math.max(stats.atk, itemStats.atk ?? 0),
    arm: Math.max(stats.arm, itemStats.arm ?? 0),
    spd: Math.max(stats.spd, itemStats.spd ?? 0),
    dig: Math.max(stats.dig, itemStats.dig ?? 0),
    gold: stats.gold,
  };
}
