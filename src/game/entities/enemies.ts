import type { EnemyId } from '@/game/map/types';

export type EnemyCategory = 'BASIC' | 'MID' | 'STRONG';

export const ENEMY_BASE_GOLD: Record<EnemyCategory, number> = {
  BASIC: 1,
  MID: 2,
  STRONG: 3,
};

export const ENEMY_CATEGORIES: Record<EnemyId, EnemyCategory> = {
  TUNNEL_RAT: 'BASIC',
  CAVE_BAT: 'BASIC',
  SPORE_SLIME: 'BASIC',
  RUST_MITE_SWARM: 'BASIC',
  COLLAPSED_MINER: 'MID',
  SHARD_BEETLE: 'MID',
  TUNNEL_WARDEN: 'STRONG',
  BURROW_AMBUSHER: 'STRONG',
};

export function calculateGoldReward(enemyId: EnemyId, tier: 1 | 2 | 3): number {
  const category = ENEMY_CATEGORIES[enemyId];
  const baseGold = ENEMY_BASE_GOLD[category];
  return baseGold + (tier - 1);
}
