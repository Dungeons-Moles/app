/**
 * Gear Effects - Aligned with Solana Backend (programs/player-inventory/src/items.rs)
 *
 * This file provides effect definitions for all 64 gear items that match
 * the exact behavior defined in the Solana backend.
 *
 * Effect values are provided as tier arrays [tier1, tier2, tier3] where:
 * - tier1: Base item
 * - tier2: After first fusion (Gilded)
 * - tier3: After second fusion (Diamond)
 */

import type { GearId, ItemStats } from '../game/engine/types';
import {
  type ItemEffect,
  type TriggerType,
  type EffectType,
  type Condition,
  Trigger,
  Cond,
} from './combat-types';

// ============================================================================
// Gear Effect Definition (with tier scaling)
// ============================================================================

export interface GearEffectDefinition {
  trigger: TriggerType;
  oncePerTurn: boolean;
  effectType: EffectType;
  values: [number, number, number]; // [tier1, tier2, tier3]
  condition: Condition;
}

export interface GearEffects {
  effects: GearEffectDefinition[];
}

// Helper to create effect definitions
function E(
  trigger: TriggerType,
  effectType: EffectType,
  values: [number, number, number],
  options?: { oncePerTurn?: boolean; condition?: Condition }
): GearEffectDefinition {
  return {
    trigger,
    effectType,
    values,
    oncePerTurn: options?.oncePerTurn ?? false,
    condition: options?.condition ?? Cond.None(),
  };
}

// ============================================================================
// All Gear Effects (64 items)
// ============================================================================

export const GEAR_EFFECTS: Record<GearId, GearEffects> = {
  // ===========================================================================
  // STONE (I1-I8)
  // ===========================================================================

  // G-ST-01: Miner Helmet - +3/6/9 ARM (permanent stat bonus via gear.ts)
  I1: {
    effects: [],
  },

  // G-ST-02: Work Vest - +4/8/12 HP, +1 ARM (permanent stat bonus via gear.ts)
  I2: {
    effects: [],
  },

  // G-ST-03: Spiked Bracers - Battle Start: gain 3/6/12 Shrapnel; +1/2/4 Armor
  I3: {
    effects: [
      E(Trigger.BattleStart(), 'ApplyShrapnel', [3, 6, 12]),
      E(Trigger.BattleStart(), 'GainArmor', [1, 2, 4]),
    ],
  },

  // G-ST-04: Reinforcement Plate - Battle Start: gain 2/4/8 Armor; every other turn: gain 2/4/8 Armor and 1/2/4 Shrapnel
  I4: {
    effects: [
      E(Trigger.BattleStart(), 'GainArmor', [2, 4, 8]),
      E(Trigger.EveryOtherTurn(), 'GainArmor', [2, 4, 8]),
      E(Trigger.EveryOtherTurn(), 'ApplyShrapnel', [1, 2, 4]),
    ],
  },

  // G-ST-05: Rebar Carapace - Battle Start: +3/6/12 Armor; FirstTimeExposed: +4/8/16 ARM and 2/4/8 Shrapnel
  I5: {
    effects: [
      E(Trigger.BattleStart(), 'GainArmor', [3, 6, 12]),
      E(Trigger.FirstTimeExposed(), 'GainArmor', [4, 8, 16]),
      E(Trigger.FirstTimeExposed(), 'ApplyShrapnel', [2, 4, 8]),
    ],
  },

  // G-ST-06: Shrapnel Talisman - Battle Start: +3/6/12 Armor; FirstTimeGainShrapnel: gain 2/4/8 Armor
  I6: {
    effects: [
      E(Trigger.BattleStart(), 'GainArmor', [3, 6, 12]),
      E(Trigger.FirstTimeGainShrapnel(), 'GainArmor', [2, 4, 8]),
    ],
  },

  // G-ST-07: Crystal Crown - Battle Start: ArmorToMaxHp (cap 10/20/40)
  I7: {
    effects: [E(Trigger.BattleStart(), 'ArmorToMaxHp', [10, 20, 40])],
  },

  // G-ST-08: Stone Sigil - Battle Start: gain 3/6/12 Armor; end of turn: if you have >=2 Armor, gain +2/4/8 Armor
  I8: {
    effects: [
      E(Trigger.BattleStart(), 'GainArmor', [3, 6, 12]),
      E(Trigger.TurnEnd(), 'GainArmor', [2, 4, 8], { condition: Cond.OwnerArmorAtLeast(2) }),
    ],
  },

  // ===========================================================================
  // SCOUT (I9-I16)
  // ===========================================================================

  // G-SC-01: Miner Boots - Battle Start: gain 2/4/8 DIG and +1/2/4 SPD
  I9: {
    effects: [
      E(Trigger.BattleStart(), 'GainDig', [2, 4, 8]),
      E(Trigger.BattleStart(), 'GainSpd', [1, 2, 4]),
    ],
  },

  // G-SC-02: Leather Gloves - +1/2/4 ATK, +1/2/4 DIG
  I10: {
    effects: [
      E(Trigger.BattleStart(), 'GainAtk', [1, 2, 4]),
      E(Trigger.BattleStart(), 'GainDig', [1, 2, 4]),
    ],
  },

  // G-SC-03: Tunnel Instinct - Battle Start: +1/2/4 DIG; if DIG > enemy DIG, gain +1/2/4 SPD and +1/2/4 ATK
  I11: {
    effects: [
      E(Trigger.BattleStart(), 'GainDig', [1, 2, 4]),
      E(Trigger.BattleStart(), 'GainSpd', [1, 2, 4], {
        condition: Cond.DigGreaterThanEnemyDig(),
      }),
      E(Trigger.BattleStart(), 'GainAtk', [1, 2, 4], {
        condition: Cond.DigGreaterThanEnemyDig(),
      }),
    ],
  },

  // G-SC-04: Tunneler Spurs - Battle Start: +2/4/8 SPD; FirstTurnIfFaster grants +1/2/4 DIG and +2/4/8 Armor
  I12: {
    effects: [
      E(Trigger.BattleStart(), 'GainSpd', [2, 4, 8]),
      E(Trigger.FirstTurnIfFaster(), 'GainDig', [1, 2, 4]),
      E(Trigger.FirstTurnIfFaster(), 'GainArmor', [2, 4, 8]),
    ],
  },

  // G-SC-05: Wall-Sense Visor - Battle Start: +1/2/4 DIG and +1/2/4 SPD; if DIG > enemy DIG, gain +3/6/12 Armor
  I13: {
    effects: [
      E(Trigger.BattleStart(), 'GainDig', [1, 2, 4]),
      E(Trigger.BattleStart(), 'GainSpd', [1, 2, 4]),
      E(Trigger.BattleStart(), 'GainArmor', [3, 6, 12], {
        condition: Cond.DigGreaterThanEnemyDig(),
      }),
    ],
  },

  // G-SC-06: Drill Servo - Wounded: gain +1/2/4 additional strikes and +2/4/8 ATK
  I14: {
    effects: [
      E(Trigger.Wounded(), 'GainStrikes', [1, 2, 4], { oncePerTurn: true }),
      E(Trigger.Wounded(), 'GainAtk', [2, 4, 8], { oncePerTurn: true }),
    ],
  },

  // G-SC-07: Weak-Point Manual - Battle Start: +1/2/4 ATK and +1/2/4 DIG; if DIG > enemy Armor, ignore 2/4/8 Armor
  I15: {
    effects: [
      E(Trigger.BattleStart(), 'GainAtk', [1, 2, 4]),
      E(Trigger.BattleStart(), 'GainDig', [1, 2, 4]),
      E(Trigger.BattleStart(), 'SetArmorPiercing', [2, 4, 8], {
        condition: Cond.OwnerDigGreaterThanEnemyArmor(),
      }),
    ],
  },

  // G-SC-08: Gear-Link Medallion - DoubleOnHitEffects (toggle); +1/2/4 SPD
  I16: {
    effects: [
      E(Trigger.BattleStart(), 'DoubleOnHitEffects', [1, 1, 1]),
      E(Trigger.BattleStart(), 'GainSpd', [1, 2, 4]),
    ],
  },

  // ===========================================================================
  // GREED (I17-I24)
  // ===========================================================================

  // G-GR-01: Loose Nuggets - DayStart: gain 5/10/20 Gold; Battle Start: +1/2/4 Armor
  I17: {
    effects: [
      E(Trigger.DayStart(), 'GainGold', [5, 10, 20]),
      E(Trigger.BattleStart(), 'GainArmor', [1, 2, 4]),
    ],
  },

  // G-GR-02: Lucky Coin - Victory: gain 3/6/12 Gold and heal 3/6/12 HP
  I18: {
    effects: [
      E(Trigger.Victory(), 'GainGold', [3, 6, 12]),
      E(Trigger.Victory(), 'Heal', [3, 6, 12]),
    ],
  },

  // G-GR-03: Gilded Band - Battle Start: gain 2/4/8 Armor and convert Gold → Armor 6/12/24; if Gold ≥ 20, +1/2/4 SPD this battle
  I19: {
    effects: [
      E(Trigger.BattleStart(), 'GainArmor', [2, 4, 8]),
      E(Trigger.BattleStart(), 'GoldToArmorScaled', [6, 12, 24]),
      E(Trigger.BattleStart(), 'GainSpd', [1, 2, 4], { condition: Cond.OwnerGoldAtLeast(20) }),
    ],
  },

  // G-GR-04: Royal Bracer - Battle Start: gain 1/2/4 ATK; max 3 Gold->Armor conversions; Turn Start convert Gold → 4/8/16 Armor and amplify Gold gains 50/100/200%
  I20: {
    effects: [
      E(Trigger.BattleStart(), 'GainAtk', [1, 2, 4]),
      E(Trigger.BattleStart(), 'LimitGoldArmorConversions', [3, 3, 3]),
      E(Trigger.TurnStart(), 'ConsumeGoldForArmor', [4, 8, 16]),
      E(Trigger.TurnStart(), 'AmplifyGoldGain', [50, 100, 200]),
    ],
  },

  // G-GR-05: Emerald Shard - EveryOtherTurnFirstHit: heal 2/4/8 HP
  I21: {
    effects: [E(Trigger.EveryOtherTurnFirstHit(), 'Heal', [2, 4, 8], { oncePerTurn: true })],
  },

  // G-GR-06: Ruby Shard - EveryOtherTurnFirstHit: deal 1/2/4 non-weapon damage
  I22: {
    effects: [
      E(Trigger.EveryOtherTurnFirstHit(), 'DealNonWeaponDamage', [1, 2, 4], { oncePerTurn: true }),
    ],
  },

  // G-GR-07: Sapphire Shard - EveryOtherTurnFirstHit: gain 2/4/8 Armor
  I23: {
    effects: [E(Trigger.EveryOtherTurnFirstHit(), 'GainArmor', [2, 4, 8], { oncePerTurn: true })],
  },

  // G-GR-08: Citrine Shard - EveryOtherTurnFirstHit: gain 2/4/8 Gold and +1/2/4 Armor
  I24: {
    effects: [
      E(Trigger.EveryOtherTurnFirstHit(), 'GainGold', [2, 4, 8], { oncePerTurn: true }),
      E(Trigger.EveryOtherTurnFirstHit(), 'GainArmor', [1, 2, 4], { oncePerTurn: true }),
    ],
  },

  // ===========================================================================
  // BLAST (I25-I32)
  // ===========================================================================

  // G-BL-01: Small Charge - Countdown(3): deal 8/14/24 to enemy, 4/6/10 to self
  I25: {
    effects: [
      E(Trigger.Countdown(3), 'DealNonWeaponDamage', [8, 14, 24]),
      E(Trigger.Countdown(3), 'DealSelfNonWeaponDamage', [4, 6, 10]),
    ],
  },

  // G-BL-02: Blast Suit - 50% self-BLAST damage, +4/8/16 Armor; OnDealNonWeaponDamage: +1/2/4 Armor (once/turn)
  I26: {
    effects: [
      E(Trigger.BattleStart(), 'BlastImmunity', [1, 1, 1]),
      E(Trigger.BattleStart(), 'GainArmor', [4, 8, 16]),
      E(Trigger.OnDealNonWeaponDamage(), 'GainArmor', [1, 2, 4], { oncePerTurn: true }),
    ],
  },

  // G-BL-03: Explosive Powder - Battle Start: your non-weapon damage deals +2/4/8; gain +2/4/8 Armor
  I27: {
    effects: [
      E(Trigger.BattleStart(), 'AmplifyNonWeaponDamage', [2, 4, 8]),
      E(Trigger.BattleStart(), 'GainArmor', [2, 4, 8]),
    ],
  },

  // G-BL-04: Double Detonation - First bomb detonation per turn: +1/2/4 to enemy and self; second: +3/6/12 to enemy and self
  I28: {
    effects: [
      E(Trigger.BattleStart(), 'DoubleDetonationFirst', [1, 2, 4]),
      E(Trigger.BattleStart(), 'DoubleDetonationSecond', [3, 6, 12]),
    ],
  },

  // G-BL-05: Bomb Satchel - Battle Start: ReduceAllCountdowns by 1; +4/8/16 Armor, +1/2/4 ATK, bombs deal +0/2/4
  I29: {
    effects: [
      E(Trigger.BattleStart(), 'ReduceAllCountdowns', [1, 1, 1]),
      E(Trigger.BattleStart(), 'GainArmor', [4, 8, 16]),
      E(Trigger.BattleStart(), 'GainAtk', [1, 2, 4]),
      E(Trigger.BattleStart(), 'BombDamageBonus', [0, 2, 4]),
    ],
  },

  // G-BL-06: Kindling Charge - Battle Start: deal 2/4/8; next bomb +3/6/12, self-damage -2/4/8
  I30: {
    effects: [
      E(Trigger.BattleStart(), 'DealNonWeaponDamage', [2, 4, 8]),
      E(Trigger.BattleStart(), 'EmpowerNextBombDamage', [3, 6, 12]),
      E(Trigger.BattleStart(), 'ReduceNextBombSelfDamage', [2, 4, 8]),
    ],
  },

  // G-BL-07: Time Charge - Battle Start: gain +2/4/8 Armor; Turn Start: store +2/4/8 damage; release when Exposed or Turn 5+
  I31: {
    effects: [
      E(Trigger.BattleStart(), 'GainArmor', [2, 4, 8]),
      E(Trigger.TurnStart(), 'StoreDamage', [2, 4, 8]),
    ],
  },

  // G-BL-08: Twin-Fuse Knot - DoubleBombTrigger (toggle); +1/2/4 ReduceNextBombSelfDamage
  I32: {
    effects: [
      E(Trigger.BattleStart(), 'DoubleBombTrigger', [1, 1, 1]),
      E(Trigger.BattleStart(), 'ReduceNextBombSelfDamage', [1, 2, 4]),
    ],
  },

  // ===========================================================================
  // FROST (I33-I40)
  // ===========================================================================

  // G-FR-01: Frost Lantern - Battle Start: +1/2/4 Armor and apply 1/2/4 Chill
  I33: {
    effects: [
      E(Trigger.BattleStart(), 'GainArmor', [1, 2, 4]),
      E(Trigger.BattleStart(), 'ApplyChill', [1, 2, 4]),
    ],
  },

  // G-FR-02: Frostguard Buckler - +8/16/32 ARM; if enemy has Chill: +3/6/12 ARM and apply 1/2/4 Chill
  I34: {
    effects: [
      E(Trigger.BattleStart(), 'GainArmor', [8, 16, 32]),
      E(Trigger.BattleStart(), 'GainArmor', [3, 6, 12], {
        condition: Cond.EnemyHasStatus('Chill'),
      }),
      E(Trigger.BattleStart(), 'ApplyChill', [1, 2, 4], {
        condition: Cond.EnemyHasStatus('Chill'),
      }),
    ],
  },

  // G-FR-03: Cold Snap Charm - Battle Start: +1/2/4 SPD; FirstTurnIfFaster: apply 2/4/8 Chill and gain +2/4/8 Armor
  I35: {
    effects: [
      E(Trigger.BattleStart(), 'GainSpd', [1, 2, 4]),
      E(Trigger.FirstTurnIfFaster(), 'ApplyChill', [2, 4, 8]),
      E(Trigger.FirstTurnIfFaster(), 'GainArmor', [2, 4, 8]),
    ],
  },

  // G-FR-04: Ice Skates - Battle Start: +2/4/8 SPD, +1/2/4 DIG, and +2/4/8 Armor
  I36: {
    effects: [
      E(Trigger.BattleStart(), 'GainSpd', [2, 4, 8]),
      E(Trigger.BattleStart(), 'GainDig', [1, 2, 4]),
      E(Trigger.BattleStart(), 'GainArmor', [2, 4, 8]),
    ],
  },

  // G-FR-05: Rime Cloak - +3/6/12 ARM; OnStruck (once/turn): apply 1/2/4 Chill
  I37: {
    effects: [
      E(Trigger.BattleStart(), 'GainArmor', [3, 6, 12]),
      E(Trigger.OnStruck(), 'ApplyChill', [1, 2, 4], { oncePerTurn: true }),
    ],
  },

  // G-FR-06: Permafrost Core - Turn Start: if enemy has Chill, gain 2/4/8 Armor and deal 2/4/8 non-weapon
  I38: {
    effects: [
      E(Trigger.TurnStart(), 'GainArmor', [2, 4, 8], {
        condition: Cond.EnemyHasStatus('Chill'),
      }),
      E(Trigger.TurnStart(), 'DealNonWeaponDamage', [2, 4, 8], {
        condition: Cond.EnemyHasStatus('Chill'),
      }),
    ],
  },

  // G-FR-07: Cold Front Idol - EveryOtherTurn: apply 1/2/4 Chill, deal 2/4/8 non-weapon damage, and gain 1/2/4 Armor; if enemy has Chill: gain +2/4/8 SPD
  I39: {
    effects: [
      E(Trigger.EveryOtherTurn(), 'ApplyChill', [1, 2, 4]),
      E(Trigger.EveryOtherTurn(), 'DealNonWeaponDamage', [2, 4, 8]),
      E(Trigger.EveryOtherTurn(), 'GainArmor', [1, 2, 4]),
      E(Trigger.EveryOtherTurn(), 'GainSpd', [2, 4, 8], {
        condition: Cond.EnemyHasStatus('Chill'),
      }),
    ],
  },

  // G-FR-08: Deep Freeze Charm - Battle Start: +3/6/12 Armor; Wounded: apply 3/6/12 Chill, reduce enemy SPD by 1/2/4, and while enemy is chilled your non-weapon damage gets +1/2/4
  I40: {
    effects: [
      E(Trigger.BattleStart(), 'GainArmor', [3, 6, 12]),
      E(Trigger.Wounded(), 'ApplyChill', [3, 6, 12], { oncePerTurn: true }),
      E(Trigger.Wounded(), 'ReduceEnemySpd', [1, 2, 4], { oncePerTurn: true }),
      E(Trigger.Wounded(), 'AmplifyNonWeaponDamage', [1, 2, 4], {
        oncePerTurn: true,
        condition: Cond.EnemyHasStatus('Chill'),
      }),
    ],
  },

  // ===========================================================================
  // RUST (I41-I48)
  // ===========================================================================

  // G-RU-01: Oxidizer Vial - Battle Start: +1/2/4 Armor, apply 1/2/4 Rust; if enemy has Armor: +1/2/4 more
  I41: {
    effects: [
      E(Trigger.BattleStart(), 'GainArmor', [1, 2, 4]),
      E(Trigger.BattleStart(), 'ApplyRust', [1, 2, 4]),
      E(Trigger.BattleStart(), 'ApplyRust', [1, 2, 4], { condition: Cond.EnemyHasArmor() }),
    ],
  },

  // G-RU-02: Rust Spike - OnHit: apply 1/2/4 Rust; if enemy has Rust >=2, deal 2/4/8 non-weapon; +1/2/4 ATK
  I42: {
    effects: [
      E(Trigger.BattleStart(), 'GainAtk', [1, 2, 4]),
      E(Trigger.OnHit(), 'ApplyRust', [1, 2, 4], { oncePerTurn: true }),
      E(Trigger.OnHit(), 'DealNonWeaponDamage', [2, 4, 8], {
        oncePerTurn: true,
        condition: Cond.EnemyHasStatusAtLeast('Rust', 2),
      }),
    ],
  },

  // G-RU-03: Corroded Greaves - +1/2/4 SPD; Wounded: apply 2/4/8 Rust
  I43: {
    effects: [
      E(Trigger.BattleStart(), 'GainSpd', [1, 2, 4]),
      E(Trigger.Wounded(), 'ApplyRust', [2, 4, 8], { oncePerTurn: true }),
    ],
  },

  // G-RU-04: Acid Phial - Battle Start: remove 3/6/12 enemy Armor and apply 1/2/4 Rust
  I44: {
    effects: [
      E(Trigger.BattleStart(), 'RemoveArmor', [3, 6, 12]),
      E(Trigger.BattleStart(), 'ApplyRust', [1, 2, 4]),
    ],
  },

  // G-RU-05: Flaking Plating - +6/12/24 ARM; Exposed: apply 2/4/8 Rust
  I45: {
    effects: [
      E(Trigger.BattleStart(), 'GainArmor', [6, 12, 24]),
      E(Trigger.Exposed(), 'ApplyRust', [2, 4, 8], { oncePerTurn: true }),
    ],
  },

  // G-RU-06: Rust Engine - Battle Start: +1/2/4 ATK; +3/6/12 Armor; Turn Start: if enemy has Rust OR no Armor, deal 2/4/8 non-weapon
  I46: {
    effects: [
      E(Trigger.BattleStart(), 'GainAtk', [1, 2, 4]),
      E(Trigger.BattleStart(), 'GainArmor', [3, 6, 12]),
      E(Trigger.TurnStart(), 'DealNonWeaponDamage', [2, 4, 8], {
        condition: Cond.Or(Cond.EnemyHasStatus('Rust'), Cond.EnemyHasNoArmor()),
      }),
    ],
  },

  // G-RU-07: Corrosion Loop - OnHit (once/turn): apply +2/4/8 Rust; if enemy has 0 Armor, deal 2/4/8 non-weapon
  I47: {
    effects: [
      E(Trigger.OnHit(), 'ApplyRust', [2, 4, 8], {
        oncePerTurn: true,
      }),
      E(Trigger.OnHit(), 'DealNonWeaponDamage', [2, 4, 8], {
        oncePerTurn: true,
        condition: Cond.EnemyHasNoArmor(),
      }),
    ],
  },

  // G-RU-08: Salvage Clamp - OnApplyRust: gain 2/4/8 Gold; Battle Start: apply 1/2/4 Rust
  I48: {
    effects: [
      E(Trigger.OnApplyRust(), 'GainGold', [2, 4, 8], { oncePerTurn: true }),
      E(Trigger.BattleStart(), 'ApplyRust', [1, 2, 4]),
    ],
  },

  // ===========================================================================
  // BLOOD (I49-I56)
  // ===========================================================================

  // G-BO-01: Last Breath Sigil - PreventDeath, heal 2/4/8 HP
  I49: {
    effects: [E(Trigger.BattleStart(), 'PreventDeath', [2, 4, 8])],
  },

  // G-BO-02: Bloodletting Fang - Battle Start: +1/2/4 ATK; OnHit: +1/2/4 damage if enemy has Bleed
  I50: {
    effects: [
      E(Trigger.BattleStart(), 'GainAtk', [1, 2, 4]),
      E(Trigger.OnHit(), 'DealDamage', [1, 2, 4], {
        condition: Cond.EnemyHasStatus('Bleed'),
      }),
    ],
  },

  // G-BO-03: Leech Wraps - OnEnemyBleedDamage (once/turn): gain +2/4/8 Armor and heal 2/4/8 HP
  I51: {
    effects: [
      E(Trigger.OnEnemyBleedDamage(), 'GainArmor', [2, 4, 8], { oncePerTurn: true }),
      E(Trigger.OnEnemyBleedDamage(), 'Heal', [2, 4, 8], { oncePerTurn: true }),
    ],
  },

  // G-BO-04: Blood Chalice - Battle Start: gain +2/4/8 Armor; Victory: heal 5/10/20 HP
  I52: {
    effects: [
      E(Trigger.BattleStart(), 'GainArmor', [2, 4, 8]),
      E(Trigger.Victory(), 'Heal', [5, 10, 20]),
    ],
  },

  // G-BO-05: Hemorrhage Hook - Battle Start: +1/2/4 ATK and +3/6/12 Armor; Wounded: apply 3/6/12 Bleed
  I53: {
    effects: [
      E(Trigger.BattleStart(), 'GainAtk', [1, 2, 4]),
      E(Trigger.BattleStart(), 'GainArmor', [3, 6, 12]),
      E(Trigger.Wounded(), 'ApplyBleed', [3, 6, 12], { oncePerTurn: true }),
    ],
  },

  // G-BO-06: Execution Emblem - Battle Start: +1/2/4 ATK and +2/4/8 Armor; OnHit (once/turn): if enemy Wounded, +3/6/12 damage
  I54: {
    effects: [
      E(Trigger.BattleStart(), 'GainAtk', [1, 2, 4]),
      E(Trigger.BattleStart(), 'GainArmor', [2, 4, 8]),
      E(Trigger.OnHit(), 'DealDamage', [3, 6, 12], {
        oncePerTurn: true,
        condition: Cond.EnemyWounded(),
      }),
    ],
  },

  // G-BO-07: Gore Mantle - FirstTimeWounded: gain 4/8/16 Armor
  I55: {
    effects: [E(Trigger.FirstTimeWounded(), 'GainArmor', [4, 8, 16])],
  },

  // G-BO-08: Vampiric Tooth - OnHit: if enemy has Bleed, heal up to 5/10/20 HP; also applies 1/2/4 bleed
  I56: {
    effects: [
      E(Trigger.OnHit(), 'Heal', [5, 10, 20], {
        oncePerTurn: true,
        condition: Cond.EnemyHasStatus('Bleed'),
      }),
      E(Trigger.OnHit(), 'ApplyBleed', [1, 2, 4], { oncePerTurn: true }),
    ],
  },

  // ===========================================================================
  // TEMPO (I57-I64)
  // ===========================================================================

  // G-TE-01: Wind-Up Spring - Battle Start: +1/2/4 SPD, +2/4/8 ATK
  I57: {
    effects: [
      E(Trigger.BattleStart(), 'GainSpd', [1, 2, 4]),
      E(Trigger.BattleStart(), 'GainAtk', [2, 4, 8]),
    ],
  },

  // G-TE-02: Ambush Charm - Battle Start: +1/2/4 SPD; FirstTurnIfFaster: +3/6/12 damage (once)
  I58: {
    effects: [
      E(Trigger.BattleStart(), 'GainSpd', [1, 2, 4]),
      E(Trigger.FirstTurnIfFaster(), 'DealDamage', [3, 6, 12], { oncePerTurn: true }),
    ],
  },

  // G-TE-03: Counterweight Buckle - Battle Start: +1/2/4 SPD; FirstTurnIfSlower: gain 7/14/28 Armor and 2/4/8 Shrapnel
  I59: {
    effects: [
      E(Trigger.BattleStart(), 'GainSpd', [1, 2, 4]),
      E(Trigger.FirstTurnIfSlower(), 'GainArmor', [7, 14, 28]),
      E(Trigger.FirstTurnIfSlower(), 'ApplyShrapnel', [2, 4, 8]),
    ],
  },

  // G-TE-04: Hourglass Charge - Battle Start: +2/4/8 Armor; Turn 5: gain +3/6/12 ATK and +2/4/8 SPD
  I60: {
    effects: [
      E(Trigger.BattleStart(), 'GainArmor', [2, 4, 8]),
      E(Trigger.TurnN(5), 'GainAtk', [3, 6, 12]),
      E(Trigger.TurnN(5), 'GainSpd', [2, 4, 8]),
    ],
  },

  // G-TE-05: Initiative Lens - +1/2/4 SPD; if SPD > enemy SPD: +3/6/12 Armor
  I61: {
    effects: [
      E(Trigger.BattleStart(), 'GainSpd', [1, 2, 4]),
      E(Trigger.BattleStart(), 'GainArmor', [3, 6, 12], {
        condition: Cond.SpdGreaterThanEnemySpd(),
      }),
    ],
  },

  // G-TE-06: Backstep Buckle - FirstTurnIfSlower: +4/8/16 armor and +3/6/12 damage
  I62: {
    effects: [
      E(Trigger.FirstTurnIfSlower(), 'GainArmor', [4, 8, 16]),
      E(Trigger.FirstTurnIfSlower(), 'DealDamage', [3, 6, 12], { oncePerTurn: true }),
    ],
  },

  // G-TE-07: Tempo Battery - Battle Start: +1/2/4 ATK and +3/6/12 Armor; EveryOtherTurn: gain +2/4/8 SPD
  I63: {
    effects: [
      E(Trigger.BattleStart(), 'GainAtk', [1, 2, 4]),
      E(Trigger.BattleStart(), 'GainArmor', [3, 6, 12]),
      E(Trigger.EveryOtherTurn(), 'GainSpd', [2, 4, 8]),
    ],
  },

  // G-TE-08: Second Wind Clock - Battle Start: +3/6/12 Armor; Turn 5: heal 6/12/24 HP and gain +2/4/8 SPD
  I64: {
    effects: [
      E(Trigger.BattleStart(), 'GainArmor', [3, 6, 12]),
      E(Trigger.TurnN(5), 'Heal', [6, 12, 24]),
      E(Trigger.TurnN(5), 'GainSpd', [2, 4, 8]),
    ],
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get effects for a gear item at a specific tier (1, 2, or 3)
 */
export function getGearEffectsAtTier(gearId: GearId, tier: 1 | 2 | 3): ItemEffect[] {
  const gearEffects = GEAR_EFFECTS[gearId];
  if (!gearEffects) return [];

  const tierIndex = tier - 1;
  return gearEffects.effects.map((def) => ({
    trigger: def.trigger,
    oncePerTurn: def.oncePerTurn,
    effectType: def.effectType,
    value: def.values[tierIndex],
    condition: def.condition,
  }));
}

/**
 * Extract unconditional BattleStart flat stat bonuses for a gear item at a given tier.
 * Mirrors getToolStatsAtTier() — only picks up GainAtk/GainArmor/GainSpd/GainDig/MaxHp
 * that fire unconditionally at battle start.
 */
export function getGearStatsAtTier(gearId: GearId, tier: 1 | 2 | 3): ItemStats {
  const effects = getGearEffectsAtTier(gearId, tier);
  const stats: ItemStats = {};

  for (const effect of effects) {
    if (effect.trigger.type !== 'BattleStart') continue;
    if (effect.condition.type !== 'None') continue;

    switch (effect.effectType) {
      case 'GainAtk':
        stats.atk = (stats.atk ?? 0) + effect.value;
        break;
      case 'GainArmor':
        stats.arm = (stats.arm ?? 0) + effect.value;
        break;
      case 'GainSpd':
        stats.spd = (stats.spd ?? 0) + effect.value;
        break;
      case 'GainDig':
        stats.dig = (stats.dig ?? 0) + effect.value;
        break;
      case 'MaxHp':
        stats.hp = (stats.hp ?? 0) + effect.value;
        break;
    }
  }

  return stats;
}

/**
 * Check if a gear item has effects for a specific trigger
 */
export function gearHasTrigger(gearId: GearId, triggerType: string): boolean {
  const gearEffects = GEAR_EFFECTS[gearId];
  if (!gearEffects) return false;

  return gearEffects.effects.some((e) => e.trigger.type === triggerType);
}

/**
 * Get all gear IDs that have a specific trigger type
 */
export function getGearWithTrigger(triggerType: string): GearId[] {
  return (Object.keys(GEAR_EFFECTS) as GearId[]).filter((id) => gearHasTrigger(id, triggerType));
}
