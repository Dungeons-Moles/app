import type { BossId, Gear, ItemsetId, Tool } from '@/game/engine/types';
import type { EnemyId } from '@/game/map/types';
import { createEffect, Trigger, Cond, type ItemEffect } from '@/data/combat-types';
import { collectGearEffects, collectToolEffects, type EquippedEffect } from './effect-bridge';
import { getItemsetEffects } from '@/data/itemset-effects';

export interface ParityEquippedEffect extends EquippedEffect {}

function isBakedInLoadoutEffect(effect: ItemEffect): boolean {
  if (effect.trigger.type !== 'BattleStart') return false;

  return (
    effect.condition.type === 'None' &&
    (effect.effectType === 'GainAtk' ||
      effect.effectType === 'GainArmor' ||
      effect.effectType === 'GainSpd' ||
      effect.effectType === 'GainDig' ||
      effect.effectType === 'MaxHp')
  );
}

function wrapEffects(
  effects: ItemEffect[],
  sourceId: string,
  name: string,
  sourceKind: ParityEquippedEffect['sourceKind'],
  sourceIndexStart = 0,
  sourceInstanceId = sourceId
): ParityEquippedEffect[] {
  return effects.map((effect, index) => ({
    effect,
    id: `${sourceId}-${sourceIndexStart + index}`,
    name,
    sourceId: sourceId as EquippedEffect['sourceId'],
    sourceInstanceId,
    sourceKind,
  }));
}

export function collectLoadoutEffects(
  gear: Gear[],
  tool: Tool | null,
  activeItemsets: ItemsetId[] = [],
  options?: {
    excludeBakedInBattleStartStats?: boolean;
  }
): ParityEquippedEffect[] {
  let baseEffects = [...collectToolEffects(tool), ...collectGearEffects(gear)];
  if (options?.excludeBakedInBattleStartStats) {
    baseEffects = baseEffects.filter((entry) => !isBakedInLoadoutEffect(entry.effect));
  }
  let itemsetIndex = baseEffects.length;
  for (const itemsetId of activeItemsets) {
    baseEffects.push(
      ...wrapEffects(getItemsetEffects(itemsetId), itemsetId, itemsetId, 'itemset', itemsetIndex)
    );
    itemsetIndex += ITEMSET_EFFECTS_COUNT[itemsetId];
  }
  return baseEffects;
}

const ITEMSET_EFFECTS_COUNT: Record<ItemsetId, number> = {
  UNION_STANDARD: 2,
  SHARD_CIRCUIT: 1,
  DEMOLITION_PERMIT: 2,
  FUSE_NETWORK: 1,
  SHRAPNEL_HARNESS: 2,
  RUST_RITUAL: 4,
  SWIFT_DIGGER_KIT: 2,
  ROYAL_EXTRACTION: 2,
  WHITEOUT_INITIATIVE: 3,
  BLOODRUSH_PROTOCOL: 2,
  CORROSION_PAYLOAD: 1,
  GOLDEN_SHRAPNEL_EXCHANGE: 1,
};

export function getFieldEnemyTraitEffects(enemyId: EnemyId, playerGold = 0): ParityEquippedEffect[] {
  switch (enemyId) {
    case 'TUNNEL_RAT':
      return wrapEffects([createEffect(Trigger.OnHit(), 'StealGold', 1, { oncePerTurn: true })], enemyId, 'Tunnel Rat', 'enemy');
    case 'CAVE_BAT':
      return wrapEffects([createEffect(Trigger.EveryOtherTurn(), 'Heal', 1)], enemyId, 'Cave Bat', 'enemy');
    case 'SPORE_SLIME':
      return wrapEffects([createEffect(Trigger.BattleStart(), 'ApplyChill', 1)], enemyId, 'Spore Slime', 'enemy');
    case 'RUST_MITE_SWARM':
      return wrapEffects([createEffect(Trigger.OnHit(), 'ApplyRust', 1, { oncePerTurn: true })], enemyId, 'Rust Mite Swarm', 'enemy');
    case 'COLLAPSED_MINER':
      return wrapEffects([createEffect(Trigger.Wounded(), 'GainAtk', 2)], enemyId, 'Collapsed Miner', 'enemy');
    case 'SHARD_BEETLE':
      return wrapEffects([createEffect(Trigger.BattleStart(), 'ApplyShrapnel', 1)], enemyId, 'Shard Beetle', 'enemy');
    case 'TUNNEL_WARDEN':
      return wrapEffects([createEffect(Trigger.BeforeStrike(), 'RemoveArmor', 1, { oncePerTurn: true })], enemyId, 'Tunnel Warden', 'enemy');
    case 'BURROW_AMBUSHER':
      return wrapEffects([createEffect(Trigger.BattleStart(), 'DealNonWeaponDamage', 1)], enemyId, 'Burrow Ambusher', 'enemy');
    case 'FROST_WISP':
      return wrapEffects([createEffect(Trigger.FirstTurnIfFaster(), 'ApplyChill', 1)], enemyId, 'Frost Wisp', 'enemy');
    case 'POWDER_TICK':
      return wrapEffects(
        [
          createEffect(Trigger.Countdown(3), 'DealNonWeaponDamage', 3),
          createEffect(Trigger.Countdown(3), 'DealSelfNonWeaponDamage', 3),
        ],
        enemyId,
        'Powder Tick',
        'enemy'
      );
    case 'COIN_SLUG':
      return wrapEffects([createEffect(Trigger.BattleStart(), 'GainArmor', Math.min(Math.floor(playerGold / 10), 3))], enemyId, 'Coin Slug', 'enemy');
    case 'BLOOD_MOSQUITO':
      return wrapEffects([createEffect(Trigger.OnHit(), 'ApplyBleed', 1, { oncePerTurn: true })], enemyId, 'Blood Mosquito', 'enemy');
    default:
      return [];
  }
}

export function getBossTraitEffects(bossId: BossId): ParityEquippedEffect[] {
  switch (bossId) {
    case 'B-A-W1-01':
      return wrapEffects(
        [
          createEffect(Trigger.BattleStart(), 'GainStrikes', 1),
          createEffect(Trigger.EveryOtherTurn(), 'ApplyChill', 1),
        ],
        bossId,
        'The Broodmother',
        'boss'
      );
    case 'B-A-W1-02':
      return wrapEffects(
        [
          createEffect(Trigger.TurnStart(), 'GainArmor', 2),
          createEffect(Trigger.OnDealNonWeaponDamage(), 'RemoveOwnArmor', 2),
        ],
        bossId,
        'Obsidian Golem',
        'boss'
      );
    case 'B-A-W1-03':
      return wrapEffects(
        [
          createEffect(Trigger.TurnStart(), 'DealNonWeaponDamage', 1),
          createEffect(Trigger.Wounded(), 'GainSpd', 1),
        ],
        bossId,
        'Gas Anomaly',
        'boss'
      );
    case 'B-A-W1-04':
      return wrapEffects(
        [
          createEffect(Trigger.FirstTurn(), 'GainStrikes', 1, {
            condition: Cond.DigGreaterThanEnemyDig(),
          }),
        ],
        bossId,
        'Mad Miner',
        'boss'
      );
    case 'B-A-W1-05':
      return wrapEffects(
        [
          createEffect(Trigger.BattleStart(), 'ApplyShrapnel', 4),
          createEffect(Trigger.EveryOtherTurn(), 'ApplyShrapnel', 2),
        ],
        bossId,
        'Shard Colossus',
        'boss'
      );
    case 'B-A-W2-01':
      return wrapEffects(
        [
          createEffect(Trigger.TurnStart(), 'GainAtk', 1),
          createEffect(Trigger.TurnStart(), 'GainSpd', 1),
          createEffect(Trigger.EveryOtherTurn(), 'GainArmor', 1),
        ],
        bossId,
        'Drill Sergeant',
        'boss'
      );
    case 'B-A-W2-02':
      return wrapEffects(
        [
          createEffect(Trigger.BattleStart(), 'ApplyReflection', 2),
        ],
        bossId,
        'Crystal Mimic',
        'boss'
      );
    case 'B-A-W2-03':
      return wrapEffects(
        [
          createEffect(Trigger.OnHit(), 'ApplyRust', 1),
          createEffect(Trigger.TurnStart(), 'DealDamage', 1, {
            condition: Cond.OwnerExposed(),
          }),
        ],
        bossId,
        'Rust Regent',
        'boss'
      );
    case 'B-A-W2-04':
      return wrapEffects(
        [
          createEffect(Trigger.Countdown(3), 'DealNonWeaponDamage', 8),
          createEffect(Trigger.Countdown(3), 'DealSelfNonWeaponDamage', 8),
          createEffect(Trigger.Wounded(), 'ReduceAllCountdowns', 1),
        ],
        bossId,
        'Powder Keg Baron',
        'boss'
      );
    case 'B-A-W2-05':
      return wrapEffects(
        [
          createEffect(Trigger.BattleStart(), 'StealGold', 16),
          createEffect(Trigger.BattleStart(), 'GoldToArmor', 4),
        ],
        bossId,
        'Greedkeeper',
        'boss'
      );
    case 'B-A-W3-01':
      return [];
    case 'B-A-W3-02':
      return wrapEffects(
        [
          createEffect(Trigger.BattleStart(), 'GoldToArmor', 3),
          createEffect(Trigger.Wounded(), 'ApplyBleed', 2),
        ],
        bossId,
        'The Gilded Devourer',
        'boss'
      );
    case 'B-B-W3-01':
      return wrapEffects(
        [
          createEffect(Trigger.BattleStart(), 'ApplyChill', 2),
          createEffect(Trigger.EveryOtherTurn(), 'GainArmor', 3),
        ],
        bossId,
        'The Frostbound Leviathan',
        'boss'
      );
    case 'B-B-W3-02':
      return wrapEffects(
        [
          createEffect(Trigger.TurnStart(), 'ApplyRust', 1),
          createEffect(Trigger.Wounded(), 'ApplyBleed', 3),
        ],
        bossId,
        'The Rusted Chronomancer',
        'boss'
      );
    default:
      return [];
  }
}
