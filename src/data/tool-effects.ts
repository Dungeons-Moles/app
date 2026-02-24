/**
 * Tool Effects - Aligned with Solana Backend (programs/player-inventory/src/items.rs)
 *
 * This file provides effect definitions for all 17 tools that match
 * the exact behavior defined in the Solana backend.
 *
 * Effect values are provided as tier arrays [tier1, tier2, tier3] where:
 * - tier1: Base item
 * - tier2: After first fusion (Gilded)
 * - tier3: After second fusion (Diamond)
 */

import type { ToolId } from '../game/engine/types';
import {
  type ItemEffect,
  type TriggerType,
  type EffectType,
  type Condition,
  Trigger,
  Cond,
} from './combat-types';

// ============================================================================
// Tool Effect Definition (with tier scaling)
// ============================================================================

export interface ToolEffectDefinition {
  trigger: TriggerType;
  oncePerTurn: boolean;
  effectType: EffectType;
  values: [number, number, number]; // [tier1, tier2, tier3]
  condition: Condition;
}

export interface ToolEffects {
  effects: ToolEffectDefinition[];
}

// Helper to create effect definitions
function E(
  trigger: TriggerType,
  effectType: EffectType,
  values: [number, number, number],
  options?: { oncePerTurn?: boolean; condition?: Condition }
): ToolEffectDefinition {
  return {
    trigger,
    effectType,
    values,
    oncePerTurn: options?.oncePerTurn ?? false,
    condition: options?.condition ?? Cond.None(),
  };
}

// ============================================================================
// All Tool Effects (17 tools)
// ============================================================================

export const TOOL_EFFECTS: Record<ToolId, ToolEffects> = {
  // ===========================================================================
  // STARTER (T0)
  // ===========================================================================

  // T-XX-00: Basic Pickaxe - +1 ATK (flat, unfusable)
  T0: {
    effects: [E(Trigger.BattleStart(), 'GainAtk', [1, 1, 1])],
  },

  // ===========================================================================
  // STONE (T1, T2)
  // ===========================================================================

  // T-ST-01: Bulwark Shovel - +1/2/3 ATK, +4/6/8 ARM
  T1: {
    effects: [
      E(Trigger.BattleStart(), 'GainAtk', [1, 2, 3]),
      E(Trigger.BattleStart(), 'GainArmor', [4, 6, 8]),
    ],
  },

  // T-ST-02: Cragbreaker Hammer - +2/3/4 ATK, +3/5/7 ARM, OnHit: -1/2/3 enemy ARM
  T2: {
    effects: [
      E(Trigger.BattleStart(), 'GainAtk', [2, 3, 4]),
      E(Trigger.BattleStart(), 'GainArmor', [3, 5, 7]),
      E(Trigger.OnHit(), 'RemoveArmor', [1, 2, 3], { oncePerTurn: true }),
    ],
  },  // ===========================================================================
  // SCOUT (T3, T4)
  // ===========================================================================

  // T-SC-01: Twin Picks - +1/2/3 ATK, +1 strike (flat)
  T3: {
    effects: [
      E(Trigger.BattleStart(), 'GainAtk', [1, 2, 3]),
      E(Trigger.BattleStart(), 'GainStrikes', [1, 1, 1]),
    ],
  },

  // T-SC-02: Pneumatic Drill - +1/2/3 ATK, +2 strikes (flat)
  T4: {
    effects: [
      E(Trigger.BattleStart(), 'GainAtk', [1, 2, 3]),
      E(Trigger.BattleStart(), 'GainStrikes', [2, 2, 2]),
      E(Trigger.BattleStart(), 'HalfGearAtkAfterSecondStrike', [1, 1, 1]),
    ],
  },

  // ===========================================================================
  // GREED (T5, T6)
  // ===========================================================================

  // T-GR-01: Glittering Pick - +1/2/3 ATK, OnHit (once/turn): +1 Gold, Victory: +2 Gold
  T5: {
    effects: [
      E(Trigger.BattleStart(), 'GainAtk', [1, 2, 3]),
      E(Trigger.OnHit(), 'GainGold', [1, 1, 1], { oncePerTurn: true }),
      E(Trigger.Victory(), 'GainGold', [2, 2, 2]),
    ],
  },

  // T-GR-02: Gemfinder Staff - +1/1/2 ATK, +1/2/2 ARM, +1/1/2 DIG, OnHit: TriggerAllShards
  T6: {
    effects: [
      E(Trigger.BattleStart(), 'GainAtk', [1, 1, 2]),
      E(Trigger.BattleStart(), 'GainArmor', [1, 2, 2]),
      E(Trigger.BattleStart(), 'GainDig', [1, 1, 2]),
      E(Trigger.OnHit(), 'TriggerAllShards', [1, 1, 1], { oncePerTurn: true }),
    ],
  },

  // ===========================================================================
  // BLAST (T7, T8)
  // ===========================================================================

  // T-BL-01: Fuse Pick - +1/2/3 ATK, OnHit (once/turn): deal 1/2/2 non-weapon
  T7: {
    effects: [
      E(Trigger.BattleStart(), 'GainAtk', [1, 2, 3]),
      E(Trigger.OnHit(), 'DealNonWeaponDamage', [1, 2, 2], { oncePerTurn: true }),
    ],
  },

  // T-BL-02: Spark Pick - +1/2/3 ATK, OnHit (once/turn): ReduceAllCountdowns by 1
  T8: {
    effects: [
      E(Trigger.BattleStart(), 'GainAtk', [1, 2, 3]),
      E(Trigger.OnHit(), 'ReduceAllCountdowns', [1, 1, 1], { oncePerTurn: true }),
    ],
  },

  // ===========================================================================
  // FROST (T9, T10)
  // ===========================================================================

  // T-FR-01: Rime Pike - +1/2/3 ATK, OnHit: apply 1 Chill; if chilled, +1 damage
  T9: {
    effects: [
      E(Trigger.BattleStart(), 'GainAtk', [1, 2, 3]),
      E(Trigger.OnHit(), 'ApplyChill', [1, 1, 1], { oncePerTurn: true }),
      E(Trigger.OnHit(), 'DealDamage', [1, 1, 1], {
        oncePerTurn: true,
        condition: Cond.EnemyHasStatus('Chill'),
      }),
    ],
  },

  // T-FR-02: Glacier Fang - +2/3/4 ATK, OnHit: apply 1 Chill, if chilled: +1 SPD and +1 damage
  T10: {
    effects: [
      E(Trigger.BattleStart(), 'GainAtk', [2, 3, 4]),
      E(Trigger.OnHit(), 'ApplyChill', [1, 1, 1], { oncePerTurn: true }),
      E(Trigger.OnHit(), 'GainSpd', [1, 1, 1], {
        oncePerTurn: true,
        condition: Cond.EnemyHasStatus('Chill'),
      }),
      E(Trigger.OnHit(), 'DealDamage', [1, 1, 1], {
        oncePerTurn: true,
        condition: Cond.EnemyHasStatus('Chill'),
      }),
    ],
  },  // ===========================================================================
  // RUST (T11, T12)
  // ===========================================================================

  // T-RU-01: Corrosive Pick - +1/2/3 ATK, OnHit (once/turn): apply 1 Rust
  T11: {
    effects: [
      E(Trigger.BattleStart(), 'GainAtk', [1, 2, 3]),
      E(Trigger.OnHit(), 'ApplyRust', [1, 1, 1], { oncePerTurn: true }),
    ],
  },

  // T-RU-02: Etched Burrowblade - +2/3/4 ATK, +2/3/4 SPD, if enemy has Rust: SetArmorPiercing 2/3/4; Rust>=4 full piercing
  T12: {
    effects: [
      E(Trigger.BattleStart(), 'GainAtk', [2, 3, 4]),
      E(Trigger.BattleStart(), 'GainSpd', [2, 3, 4]),
      E(Trigger.BattleStart(), 'SetArmorPiercing', [2, 3, 4], {
        condition: Cond.EnemyHasStatus('Rust'),
      }),
      E(Trigger.OnHit(), 'SetArmorPiercing', [32767, 32767, 32767], {
        oncePerTurn: true,
        condition: Cond.EnemyHasStatusAtLeast('Rust', 4),
      }),
    ],
  },  // ===========================================================================
  // BLOOD (T13, T14)
  // ===========================================================================

  // T-BO-01: Serrated Drill - +1/2/3 ATK, OnHit (once/turn): apply 1 Bleed
  T13: {
    effects: [
      E(Trigger.BattleStart(), 'GainAtk', [1, 2, 3]),
      E(Trigger.OnHit(), 'ApplyBleed', [1, 1, 1], { oncePerTurn: true }),
    ],
  },

  // T-BO-02: Reaper Pick - +2/3/4 ATK, OnHit: apply 1 Bleed, if enemy Wounded: +1 Bleed
  T14: {
    effects: [
      E(Trigger.BattleStart(), 'GainAtk', [2, 3, 4]),
      E(Trigger.OnHit(), 'ApplyBleed', [1, 1, 1], { oncePerTurn: true }),
      E(Trigger.OnHit(), 'ApplyBleed', [1, 1, 1], {
        oncePerTurn: true,
        condition: Cond.EnemyWounded(),
      }),
    ],
  },

  // ===========================================================================
  // TEMPO (T15, T16)
  // ===========================================================================

  // T-TE-01: Quickpick - +1/2/3 ATK, +2/3/4 SPD
  T15: {
    effects: [
      E(Trigger.BattleStart(), 'GainAtk', [1, 2, 3]),
      E(Trigger.BattleStart(), 'GainSpd', [2, 3, 4]),
    ],
  },

  // T-TE-02: Chrono Rapier - +2/3/4 ATK, +3/4/5 SPD, FirstTurnIfFaster: +3/4/5 ATK
  T16: {
    effects: [
      E(Trigger.BattleStart(), 'GainAtk', [2, 3, 4]),
      E(Trigger.BattleStart(), 'GainSpd', [3, 4, 5]),
      E(Trigger.FirstTurnIfFaster(), 'GainAtk', [3, 4, 5]),
    ],
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get effects for a tool at a specific tier (1, 2, or 3)
 */
export function getToolEffectsAtTier(toolId: ToolId, tier: 1 | 2 | 3): ItemEffect[] {
  const toolEffects = TOOL_EFFECTS[toolId];
  if (!toolEffects) return [];

  const tierIndex = tier - 1;
  return toolEffects.effects.map((def) => ({
    trigger: def.trigger,
    oncePerTurn: def.oncePerTurn,
    effectType: def.effectType,
    value: def.values[tierIndex],
    condition: def.condition,
  }));
}

/**
 * Check if a tool has effects for a specific trigger
 */
export function toolHasTrigger(toolId: ToolId, triggerType: string): boolean {
  const toolEffects = TOOL_EFFECTS[toolId];
  if (!toolEffects) return false;

  return toolEffects.effects.some((e) => e.trigger.type === triggerType);
}

/**
 * Get all tool IDs that have a specific trigger type
 */
export function getToolsWithTrigger(triggerType: string): ToolId[] {
  return (Object.keys(TOOL_EFFECTS) as ToolId[]).filter((id) => toolHasTrigger(id, triggerType));
}
