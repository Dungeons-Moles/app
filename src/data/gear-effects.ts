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

import type { GearId } from '../game/engine/types';
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

  // G-ST-03: Spiked Bracers - Battle Start: gain 2/4/6 Shrapnel
  I3: {
    effects: [E(Trigger.BattleStart(), 'ApplyShrapnel', [2, 4, 6])],
  },

  // G-ST-04: Reinforcement Plate - Every other turn: gain 1/2/3 Armor
  I4: {
    effects: [E(Trigger.EveryOtherTurn(), 'GainArmor', [1, 2, 3])],
  },

  // G-ST-05: Rebar Carapace - FirstTimeExposed: +4/6/8 ARM
  I5: {
    effects: [E(Trigger.FirstTimeExposed(), 'GainArmor', [4, 6, 8])],
  },

  // G-ST-06: Shrapnel Talisman - FirstTimeGainShrapnel: gain 2/3/4 Armor
  I6: {
    effects: [E(Trigger.FirstTimeGainShrapnel(), 'GainArmor', [2, 3, 4])],
  },

  // G-ST-07: Crystal Crown - Battle Start: ArmorToMaxHp (cap 8/12/16)
  I7: {
    effects: [E(Trigger.BattleStart(), 'ArmorToMaxHp', [10, 15, 20])],
  },

  // G-ST-08: Stone Sigil - Turn End: if you have >=3 Armor, gain +1/2/3 Armor
  I8: {
    effects: [
      E(Trigger.TurnEnd(), 'GainArmor', [1, 2, 3], { condition: Cond.OwnerArmorAtLeast(3) }),
    ],
  },

  // ===========================================================================
  // SCOUT (I9-I16)
  // ===========================================================================

  // G-SC-01: Miner Boots - +2/3/4 DIG
  I9: {
    effects: [E(Trigger.BattleStart(), 'GainDig', [2, 3, 4])],
  },

  // G-SC-02: Leather Gloves - +1/2/3 ATK, +1 DIG (flat)
  I10: {
    effects: [
      E(Trigger.BattleStart(), 'GainAtk', [1, 2, 3]),
      E(Trigger.BattleStart(), 'GainDig', [1, 1, 1]),
    ],
  },

  // G-SC-03: Tunnel Instinct - Battle Start: if DIG > enemy DIG, gain +1/2/3 SPD
  I11: {
    effects: [
      E(Trigger.BattleStart(), 'GainSpd', [1, 2, 3], {
        condition: Cond.DigGreaterThanEnemyDig(),
      }),
    ],
  },

  // G-SC-04: Tunneler Spurs - +1/2/3 SPD; FirstTurnIfFaster: +1/2/3 DIG
  I12: {
    effects: [
      E(Trigger.BattleStart(), 'GainSpd', [1, 2, 3]),
      E(Trigger.FirstTurnIfFaster(), 'GainDig', [1, 2, 3]),
    ],
  },

  // G-SC-05: Wall-Sense Visor - +1/2/3 DIG; if DIG > enemy DIG: +2/3/4 Armor
  I13: {
    effects: [
      E(Trigger.BattleStart(), 'GainDig', [1, 2, 3]),
      E(Trigger.BattleStart(), 'GainArmor', [2, 3, 4], {
        condition: Cond.DigGreaterThanEnemyDig(),
      }),
    ],
  },

  // G-SC-06: Drill Servo - Wounded: gain +1/1/2 additional strikes
  I14: {
    effects: [E(Trigger.Wounded(), 'GainStrikes', [1, 1, 2], { oncePerTurn: true })],
  },

  // G-SC-07: Weak-Point Manual - SetArmorPiercing 1/2/3 (checked vs enemy ARM)
  I15: {
    effects: [E(Trigger.BattleStart(), 'SetArmorPiercing', [1, 2, 3])],
  },

  // G-SC-08: Gear-Link Medallion - DoubleOnHitEffects, +1/2/3 DIG
  I16: {
    effects: [
      E(Trigger.BattleStart(), 'DoubleOnHitEffects', [1, 1, 1]),
    ],
  },

  // ===========================================================================
  // GREED (I17-I24)
  // ===========================================================================

  // G-GR-01: Loose Nuggets - DayStart: gain 3/6/9 Gold
  I17: {
    effects: [E(Trigger.DayStart(), 'GainGold', [3, 6, 9])],
  },

  // G-GR-02: Lucky Coin - Victory: gain 2/4/6 Gold and heal 2/3/4 HP
  I18: {
    effects: [E(Trigger.Victory(), 'GainGold', [2, 4, 6]), E(Trigger.Victory(), 'Heal', [2, 3, 4])],
  },

  // G-GR-03: Gilded Band - Battle Start: GoldToArmorScaled (cap 2/3/4)
  I19: {
    effects: [E(Trigger.BattleStart(), 'GoldToArmorScaled', [4, 5, 6])],
  },

  // G-GR-04: Royal Bracer - Turn Start: ConsumeGoldForArmor (1 Gold -> 2/3/4 Armor)
  I20: {
    effects: [E(Trigger.TurnStart(), 'ConsumeGoldForArmor', [3, 4, 5])],
  },

  // G-GR-05: Emerald Shard - EveryOtherTurnFirstHit: heal 1/2/3 HP
  I21: {
    effects: [E(Trigger.EveryOtherTurnFirstHit(), 'Heal', [1, 2, 3], { oncePerTurn: true })],
  },

  // G-GR-06: Ruby Shard - EveryOtherTurnFirstHit: deal 1/2/3 non-weapon damage
  I22: {
    effects: [
      E(Trigger.EveryOtherTurnFirstHit(), 'DealNonWeaponDamage', [1, 2, 3], { oncePerTurn: true }),
    ],
  },

  // G-GR-07: Sapphire Shard - EveryOtherTurnFirstHit: gain 1/2/3 Armor
  I23: {
    effects: [E(Trigger.EveryOtherTurnFirstHit(), 'GainArmor', [1, 2, 3], { oncePerTurn: true })],
  },

  // G-GR-08: Citrine Shard - EveryOtherTurnFirstHit: gain 1/2/3 Gold
  I24: {
    effects: [E(Trigger.EveryOtherTurnFirstHit(), 'GainGold', [1, 2, 3], { oncePerTurn: true })],
  },

  // ===========================================================================
  // BLAST (I25-I32)
  // ===========================================================================

  // G-BL-01: Small Charge - Countdown(2): deal 10/12/14 to enemy, 4/5/6 to self
  I25: {
    effects: [
      E(Trigger.Countdown(2), 'DealNonWeaponDamage', [10, 12, 14]),
      E(Trigger.Countdown(2), 'DealSelfNonWeaponDamage', [4, 5, 6]),
    ],
  },

  // G-BL-02: Blast Suit - BlastImmunity, +2/3/4 Armor
  I26: {
    effects: [
      E(Trigger.BattleStart(), 'BlastImmunity', [1, 1, 1]),
      E(Trigger.BattleStart(), 'GainArmor', [2, 3, 4]),
    ],
  },

  // G-BL-03: Explosive Powder - AmplifyNonWeaponDamage +1/2/3
  I27: {
    effects: [E(Trigger.BattleStart(), 'AmplifyNonWeaponDamage', [1, 2, 3])],
  },

  // G-BL-04: Double Detonation - OnHit: deal 2/3/4 non-weapon (second bomb bonus)
  I28: {
    effects: [E(Trigger.OnHit(), 'DealNonWeaponDamage', [2, 3, 4], { oncePerTurn: true })],
  },

  // G-BL-05: Bomb Satchel - Battle Start: ReduceAllCountdowns by 1
  I29: {
    effects: [E(Trigger.BattleStart(), 'ReduceAllCountdowns', [1, 1, 1])],
  },

  // G-BL-06: Kindling Charge - Battle Start: deal 2/3/4; next bomb +3/5/7, self-damage -2/3/4
  I30: {
    effects: [
      E(Trigger.BattleStart(), 'DealNonWeaponDamage', [2, 3, 4]),
      E(Trigger.BattleStart(), 'EmpowerNextBombDamage', [3, 5, 7]),
      E(Trigger.BattleStart(), 'ReduceNextBombSelfDamage', [2, 3, 4]),
    ],
  },

  // G-BL-07: Time Charge - Turn Start: StoreDamage +1/2/3 (releases on first expose or battle end)
  I31: {
    effects: [E(Trigger.TurnStart(), 'StoreDamage', [1, 2, 3])],
  },

  // G-BL-08: Twin-Fuse Knot - DoubleBombTrigger
  I32: {
    effects: [E(Trigger.BattleStart(), 'DoubleBombTrigger', [1, 1, 1])],
  },

  // ===========================================================================
  // FROST (I33-I40)
  // ===========================================================================

  // G-FR-01: Frost Lantern - Battle Start: apply 1/2/3 Chill
  I33: {
    effects: [E(Trigger.BattleStart(), 'ApplyChill', [1, 2, 3])],
  },

  // G-FR-02: Frostguard Buckler - +8/10/12 ARM; if enemy has Chill: +3/4/5 ARM and apply 1 Chill
  I34: {
    effects: [
      E(Trigger.BattleStart(), 'GainArmor', [8, 10, 12]),
      E(Trigger.BattleStart(), 'GainArmor', [3, 4, 5], {
        condition: Cond.EnemyHasStatus('Chill'),
      }),
      E(Trigger.BattleStart(), 'ApplyChill', [1, 1, 1], {
        condition: Cond.EnemyHasStatus('Chill'),
      }),
    ],
  },

  // G-FR-03: Cold Snap Charm - FirstTurnIfFaster: apply 2/3/4 Chill
  I35: {
    effects: [E(Trigger.FirstTurnIfFaster(), 'ApplyChill', [2, 3, 4])],
  },

  // G-FR-04: Ice Skates - +1/2/3 SPD, +1 DIG (exploration utility approximation)
  I36: {
    effects: [E(Trigger.BattleStart(), 'GainSpd', [1, 2, 3]), E(Trigger.BattleStart(), 'GainDig', [1, 1, 1])],
  },

  // G-FR-05: Rime Cloak - +3/5/7 ARM; OnStruck (once/turn): apply 1 Chill
  I37: {
    effects: [
      E(Trigger.BattleStart(), 'GainArmor', [3, 5, 7]),
      E(Trigger.OnStruck(), 'ApplyChill', [1, 1, 1], { oncePerTurn: true }),
    ],
  },

  // G-FR-06: Permafrost Core - Turn Start: if enemy has Chill, gain 2/3/4 Armor and deal 2 non-weapon
  I38: {
    effects: [
      E(Trigger.TurnStart(), 'GainArmor', [2, 3, 4], {
        condition: Cond.EnemyHasStatus('Chill'),
      }),
      E(Trigger.TurnStart(), 'DealNonWeaponDamage', [2, 2, 2], {
        condition: Cond.EnemyHasStatus('Chill'),
      }),
    ],
  },

  // G-FR-07: Cold Front Idol - EveryOtherTurn: apply 1 Chill and deal 1 non-weapon; if enemy has Chill: +1 SPD
  I39: {
    effects: [
      E(Trigger.EveryOtherTurn(), 'ApplyChill', [1, 1, 1]),
      E(Trigger.EveryOtherTurn(), 'DealNonWeaponDamage', [1, 1, 1]),
      E(Trigger.EveryOtherTurn(), 'GainSpd', [1, 1, 1], {
        condition: Cond.EnemyHasStatus('Chill'),
      }),
    ],
  },

  // G-FR-08: Deep Freeze Charm - Wounded: apply 2/3/4 Chill; reduce enemy SPD by 1; amplify non-weapon damage
  I40: {
    effects: [
      E(Trigger.Wounded(), 'ApplyChill', [2, 3, 4], { oncePerTurn: true }),
      E(Trigger.Wounded(), 'ReduceEnemySpd', [1, 1, 1], { oncePerTurn: true }),
      E(Trigger.Wounded(), 'AmplifyNonWeaponDamage', [1, 1, 1], { oncePerTurn: true }),
    ],
  },

  // ===========================================================================
  // RUST (I41-I48)
  // ===========================================================================

  // G-RU-01: Oxidizer Vial - Battle Start: apply 1/2/3 Rust; if enemy has Armor: +1 more
  I41: {
    effects: [
      E(Trigger.BattleStart(), 'ApplyRust', [1, 2, 3]),
      E(Trigger.BattleStart(), 'ApplyRust', [1, 1, 1], { condition: Cond.EnemyHasArmor() }),
    ],
  },

  // G-RU-02: Rust Spike - OnHit: apply 1 Rust; if Rust >=3, deal 1/2/2 non-weapon
  I42: {
    effects: [
      E(Trigger.OnHit(), 'ApplyRust', [1, 1, 1], { oncePerTurn: true }),
      E(Trigger.OnHit(), 'DealNonWeaponDamage', [1, 2, 2], {
        oncePerTurn: true,
        condition: Cond.EnemyHasStatusAtLeast('Rust', 3),
      }),
    ],
  },

  // G-RU-03: Corroded Greaves - +1/2/3 SPD; Wounded: apply 2/3/4 Rust
  I43: {
    effects: [
      E(Trigger.BattleStart(), 'GainSpd', [1, 2, 3]),
      E(Trigger.Wounded(), 'ApplyRust', [2, 3, 4], { oncePerTurn: true }),
    ],
  },

  // G-RU-04: Acid Phial - Battle Start: remove 2/3/4 enemy Armor
  I44: {
    effects: [E(Trigger.BattleStart(), 'RemoveArmor', [2, 3, 4])],
  },

  // G-RU-05: Flaking Plating - +6/8/10 ARM; Exposed: apply 2/3/4 Rust
  I45: {
    effects: [
      E(Trigger.BattleStart(), 'GainArmor', [6, 8, 10]),
      E(Trigger.Exposed(), 'ApplyRust', [2, 3, 4], { oncePerTurn: true }),
    ],
  },

  // G-RU-06: Rust Engine - Turn Start: if enemy has Rust OR no Armor, deal 1/2/3 non-weapon
  I46: {
    effects: [
      E(Trigger.TurnStart(), 'DealNonWeaponDamage', [1, 2, 3], {
        condition: Cond.EnemyHasStatus('Rust'),
      }),
      E(Trigger.TurnStart(), 'DealNonWeaponDamage', [1, 2, 3], {
        condition: Cond.EnemyHasNoArmor(),
      }),
    ],
  },

  // G-RU-07: Corrosion Loop - OnHit (once/turn): apply +2 Rust; if enemy has 0 Armor, deal 2 non-weapon
  I47: {
    effects: [
      E(Trigger.OnHit(), 'ApplyRust', [2, 2, 2], {
        oncePerTurn: true,
      }),
      E(Trigger.OnHit(), 'DealNonWeaponDamage', [2, 2, 2], {
        oncePerTurn: true,
        condition: Cond.EnemyHasNoArmor(),
      }),
    ],
  },

  // G-RU-08: Salvage Clamp - OnApplyRust: gain 1 Gold; if no armor, apply rust at battle start
  I48: {
    effects: [
      E(Trigger.OnApplyRust(), 'GainGold', [1, 1, 1], { oncePerTurn: true }),
      E(Trigger.BattleStart(), 'ApplyRust', [1, 1, 1], { condition: Cond.EnemyHasNoArmor() }),
    ],
  },

  // ===========================================================================
  // BLOOD (I49-I56)
  // ===========================================================================

  // G-BO-01: Last Breath Sigil - PreventDeath, heal 2/3/4 HP
  I49: {
    effects: [E(Trigger.BattleStart(), 'PreventDeath', [2, 3, 4])],
  },

  // G-BO-02: Bloodletting Fang - OnHit: +1/2/3 damage if enemy has Bleed
  I50: {
    effects: [
      E(Trigger.OnHit(), 'DealDamage', [1, 2, 3], {
        condition: Cond.EnemyHasStatus('Bleed'),
      }),
    ],
  },

  // G-BO-03: Leech Wraps - OnEnemyBleedDamage (once/turn): heal 1/2/3 HP
  I51: {
    effects: [E(Trigger.OnEnemyBleedDamage(), 'Heal', [1, 2, 3], { oncePerTurn: true })],
  },

  // G-BO-04: Blood Chalice - Victory: heal 3/5/7 HP
  I52: {
    effects: [E(Trigger.Victory(), 'Heal', [3, 5, 7])],
  },

  // G-BO-05: Hemorrhage Hook - Wounded: apply 2/3/4 Bleed
  I53: {
    effects: [E(Trigger.Wounded(), 'ApplyBleed', [2, 3, 4], { oncePerTurn: true })],
  },

  // G-BO-06: Execution Emblem - OnHit (once/turn): if enemy Wounded, +2/3/4 damage
  I54: {
    effects: [
      E(Trigger.OnHit(), 'DealDamage', [2, 3, 4], {
        oncePerTurn: true,
        condition: Cond.EnemyWounded(),
      }),
    ],
  },

  // G-BO-07: Gore Mantle - FirstTimeWounded: gain 4/6/8 Armor
  I55: {
    effects: [E(Trigger.FirstTimeWounded(), 'GainArmor', [4, 6, 8])],
  },

  // G-BO-08: Vampiric Tooth - OnHit: if enemy has Bleed, heal up to 5 HP; also applies bleed
  I56: {
    effects: [
      E(Trigger.OnHit(), 'Heal', [5, 5, 5], {
        oncePerTurn: true,
        condition: Cond.EnemyHasStatus('Bleed'),
      }),
      E(Trigger.OnHit(), 'ApplyBleed', [1, 1, 1], { oncePerTurn: true }),
    ],
  },

  // ===========================================================================
  // TEMPO (I57-I64)
  // ===========================================================================

  // G-TE-01: Wind-Up Spring - FirstTurn: +1/2/3 SPD, +2/3/4 ATK
  I57: {
    effects: [
      E(Trigger.FirstTurn(), 'GainSpd', [1, 2, 3]),
      E(Trigger.FirstTurn(), 'GainAtk', [2, 3, 4]),
    ],
  },

  // G-TE-02: Ambush Charm - FirstTurnIfFaster: +3/5/7 damage (once)
  I58: {
    effects: [E(Trigger.FirstTurnIfFaster(), 'DealDamage', [3, 5, 7], { oncePerTurn: true })],
  },

  // G-TE-03: Counterweight Buckle - FirstTurnIfSlower: +5/7/9 Armor
  I59: {
    effects: [E(Trigger.FirstTurnIfSlower(), 'GainArmor', [5, 7, 9])],
  },

  // G-TE-04: Hourglass Charge - TurnN(5): +2/3/4 ATK, +1 SPD
  I60: {
    effects: [E(Trigger.TurnN(5), 'GainAtk', [2, 3, 4]), E(Trigger.TurnN(5), 'GainSpd', [1, 1, 1])],
  },

  // G-TE-05: Initiative Lens - +1/2/3 SPD; if SPD > enemy SPD: +3/5/7 Armor
  I61: {
    effects: [
      E(Trigger.BattleStart(), 'GainSpd', [1, 2, 3]),
      E(Trigger.BattleStart(), 'GainArmor', [3, 5, 7], {
        condition: Cond.SpdGreaterThanEnemySpd(),
      }),
    ],
  },

  // G-TE-06: Backstep Buckle - FirstTurnIfSlower: +4/6/8 armor and +3/5/7 damage
  I62: {
    effects: [
      E(Trigger.FirstTurnIfSlower(), 'GainArmor', [4, 6, 8]),
      E(Trigger.FirstTurnIfSlower(), 'DealDamage', [3, 5, 7], { oncePerTurn: true }),
    ],
  },

  // G-TE-07: Tempo Battery - EveryOtherTurn: +1/2/3 SPD
  I63: {
    effects: [E(Trigger.EveryOtherTurn(), 'GainSpd', [1, 2, 3])],
  },

  // G-TE-08: Second Wind Clock - TurnN(5): heal 4/6/8 HP, +1 SPD
  I64: {
    effects: [E(Trigger.TurnN(5), 'Heal', [4, 6, 8]), E(Trigger.TurnN(5), 'GainSpd', [1, 1, 1])],
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
