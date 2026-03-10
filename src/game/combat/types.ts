import type { BossId, CombatantState, Gear, ItemsetId, Tool } from '../engine/types';
import type { EnemyId } from './traits';

export interface CombatResolverInput {
  player: CombatantState;
  enemy: CombatantState;
  seed: number;
  bossId?: BossId;
  enemyId?: EnemyId;
  enemyDefinitionId?: string;
  enemyTier?: 1 | 2 | 3;
  goldReward?: number;
  hasShrapnelHarness?: boolean;
  activeItemSets?: ItemsetId[];
  playerGear?: Gear[];
  playerTool?: Tool | null;
  enemyGear?: Gear[];
  enemyTool?: Tool | null;
  playerGold?: number;
  enemyGold?: number;
  enemyActiveItemSets?: ItemsetId[];
  preserveArmor?: boolean;
  pvpTieBreakerFavorPlayer?: boolean;
}
