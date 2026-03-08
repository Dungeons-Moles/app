import type { ItemsetId } from '@/game/engine/types';
import { Cond, Trigger, type Condition, type EffectType, type ItemEffect } from './combat-types';

export interface ItemsetEffectDefinition {
  trigger: ReturnType<(typeof Trigger)[keyof typeof Trigger]>;
  oncePerTurn: boolean;
  effectType: EffectType;
  value: number;
  condition: Condition;
}

function E(
  trigger: ReturnType<(typeof Trigger)[keyof typeof Trigger]>,
  effectType: EffectType,
  value: number,
  options?: { oncePerTurn?: boolean; condition?: Condition }
): ItemsetEffectDefinition {
  return {
    trigger,
    effectType,
    value,
    oncePerTurn: options?.oncePerTurn ?? false,
    condition: options?.condition ?? Cond.None(),
  };
}

export const ITEMSET_EFFECTS: Record<ItemsetId, ItemsetEffectDefinition[]> = {
  UNION_STANDARD: [
    E(Trigger.BattleStart(), 'GainArmor', 4),
    E(Trigger.BattleStart(), 'GainDig', 1),
  ],
  SHARD_CIRCUIT: [E(Trigger.BattleStart(), 'ShardsEveryTurn', 1)],
  DEMOLITION_PERMIT: [
    E(Trigger.TurnStart(), 'ReduceAllCountdowns', 1),
    E(Trigger.TurnStart(), 'ReduceNextBombSelfDamage', 2),
  ],
  FUSE_NETWORK: [E(Trigger.TurnStart(), 'EmpowerNextNonWeaponDamage', 2)],
  SHRAPNEL_HARNESS: [
    E(Trigger.BattleStart(), 'PreserveShrapnel', 2),
    E(Trigger.OnStruck(), 'GainArmor', 1, {
      condition: Cond.OwnerHasStatus('Shrapnel'),
    }),
  ],
  RUST_RITUAL: [
    E(Trigger.OnHit(), 'ApplyRust', 1, { oncePerTurn: true }),
    E(Trigger.OnHit(), 'DealNonWeaponDamage', 1, {
      oncePerTurn: true,
      condition: Cond.EnemyHasNoArmorAndStatusAtLeast('Rust', 1),
    }),
    E(Trigger.OnHit(), 'DealNonWeaponDamage', 1, {
      oncePerTurn: true,
      condition: Cond.EnemyHasNoArmorAndStatusAtLeast('Rust', 2),
    }),
    E(Trigger.OnHit(), 'DealNonWeaponDamage', 1, {
      oncePerTurn: true,
      condition: Cond.EnemyHasNoArmorAndStatusAtLeast('Rust', 3),
    }),
  ],
  SWIFT_DIGGER_KIT: [
    E(Trigger.BattleStart(), 'GainStrikes', 1, { condition: Cond.DigGreaterThanEnemyDig() }),
    E(Trigger.BattleStart(), 'GainAtk', 3, { condition: Cond.DigGreaterThanEnemyDig() }),
  ],
  ROYAL_EXTRACTION: [
    E(Trigger.TurnStart(), 'ConsumeGoldForArmor', 4),
    E(Trigger.BattleStart(), 'GainGold', 1),
  ],
  WHITEOUT_INITIATIVE: [
    E(Trigger.BattleStart(), 'GainSpd', 1),
    E(Trigger.FirstTurnIfFaster(), 'ApplyChill', 2),
    E(Trigger.FirstTurnIfFaster(), 'DealDamage', 3, { oncePerTurn: true }),
  ],
  BLOODRUSH_PROTOCOL: [
    E(Trigger.FirstTurn(), 'ApplyBleed', 3),
    E(Trigger.OnEnemyBleedDamage(), 'GainSpd', 1, { oncePerTurn: true }),
  ],
  CORROSION_PAYLOAD: [E(Trigger.OnDealNonWeaponDamage(), 'ApplyRust', 1, { oncePerTurn: true })],
  GOLDEN_SHRAPNEL_EXCHANGE: [
    E(Trigger.OnGoldArmorConverted(), 'ApplyShrapnel', 3, { oncePerTurn: true }),
  ],
};

export function getItemsetEffects(itemsetId: ItemsetId): ItemEffect[] {
  return ITEMSET_EFFECTS[itemsetId].map((effect) => ({ ...effect }));
}
