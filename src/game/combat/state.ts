import type { CombatState } from '../engine/types';
import { CombatPhase } from '../engine/types';
import { calculateGoldReward } from '../entities/enemies';
import type { CombatResolverInput } from './types';

export function createCombatState(input: CombatResolverInput): CombatState {
  const enemyDefinitionId = input.enemyDefinitionId ?? input.enemyId ?? 'TUNNEL_RAT';
  const enemyTier = input.enemyTier ?? 1;
  const goldReward = input.goldReward ?? calculateGoldReward(enemyDefinitionId, enemyTier);

  return {
    player: { ...input.player },
    enemy: { ...input.enemy },
    turn: 0,
    phase: CombatPhase.BattleStart,
    log: [],
    rngState: input.seed,
    playerGold: input.playerGold ?? 0,
    enemyGold: input.enemyGold ?? 0,
    goldReward,
    enemyDefinitionId,
    enemyTier,
    consumedGearIds: [],
    result: null,
  };
}
