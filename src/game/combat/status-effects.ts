/**
 * T114-T117: Status effects system for PvE Dungeon Crawler
 * Implements Chill, Shrapnel, and Rust status effects with stacking logic
 * @see specs/001-pve-dungeon-crawler/spec.md FR-026 to FR-029
 * @see specs/001-pve-dungeon-crawler/data-model.md StatusEffects
 */

import type { CombatantState, StatusEffects } from '../engine/types';

// ============================================================================
// Types
// ============================================================================

export type StatusEffectType = keyof StatusEffects;

export interface StatusEffectInfo {
  emoji: string;
  name: string;
  description: string;
  color: string;
}

// ============================================================================
// Status Effect Icons & Info (T120)
// ============================================================================

export const STATUS_EFFECT_ICONS: Record<StatusEffectType, StatusEffectInfo> = {
  chill: {
    emoji: '❄️',
    name: 'Chill',
    description: 'Reduces strikes by stack count (min 1). Loses 1 stack at end of turn.',
    color: '#60a5fa', // Blue
  },
  shrapnel: {
    emoji: '💥',
    name: 'Shrapnel',
    description: 'Deals damage to attacker when struck. Clears at end of turn.',
    color: '#f97316', // Orange
  },
  rust: {
    emoji: '🟤',
    name: 'Rust',
    description: 'Reduces ARM by stack count. Persists indefinitely.',
    color: '#a16207', // Brown
  },
  bleed: {
    emoji: '🩸',
    name: 'Bleed',
    description: 'Takes damage equal to stacks at turn end. Loses 1 stack at end of turn.',
    color: '#dc2626', // Red
  },
  reflection: {
    emoji: '🪞',
    name: 'Reflection',
    description: 'Reflects status effects while stacks remain.',
    color: '#a855f7',
  },
};

// ============================================================================
// T114: Chill Effect
// Reduces strikes by stack count (min 1), remove 1 stack at end of turn
// ============================================================================

/**
 * Get effective strikes per turn after applying Chill reduction
 * Chill reduces strikes by stack count (minimum 1 strike)
 */
export function getEffectiveStrikes(combatant: CombatantState): number {
  const baseStrikes = combatant.strikesPerTurn;
  if (combatant.statusEffects.chill > 0) {
    return Math.max(1, baseStrikes - combatant.statusEffects.chill);
  }
  return baseStrikes;
}

/**
 * Get effective ATK (no longer affected by Chill per GDD)
 */
export function getEffectiveAtk(combatant: CombatantState): number {
  return combatant.atk + combatant.bonusAtk;
}

/**
 * Process Chill decay at turn end
 * Removes 1 Chill stack (minimum 0)
 */
export function processChillDecay(combatant: CombatantState): CombatantState {
  if (combatant.statusEffects.chill <= 0) {
    return combatant;
  }

  return {
    ...combatant,
    statusEffects: {
      ...combatant.statusEffects,
      chill: Math.max(0, combatant.statusEffects.chill - 1),
    },
  };
}

// ============================================================================
// T115: Shrapnel Effect
// Deals damage equal to stacks when struck, clears at end of turn
// (Unless Shrapnel Harness itemset is active)
// ============================================================================

/**
 * Get Shrapnel reflect damage
 * Returns the damage that should be reflected to the attacker
 */
export function getShrapnelDamage(combatant: CombatantState): number {
  return combatant.statusEffects.shrapnel;
}

/**
 * Process Shrapnel clearing at turn end
 * Clears all Shrapnel unless Shrapnel Harness is active (keeps up to 2)
 */
export function processShrapnelClear(
  combatant: CombatantState,
  hasShrapnelHarness: boolean = false
): CombatantState {
  if (combatant.statusEffects.shrapnel <= 0) {
    return combatant;
  }

  const newShrapnel = hasShrapnelHarness
    ? Math.min(combatant.statusEffects.shrapnel, 2)
    : 0;

  return {
    ...combatant,
    statusEffects: {
      ...combatant.statusEffects,
      shrapnel: newShrapnel,
    },
  };
}

// ============================================================================
// T116: Rust Effect
// Reduces ARM by stack count (ARM cannot go below 0)
// ============================================================================

/**
 * Get effective ARM after applying Rust reduction
 * Rust reduces ARM by stack count (minimum 0)
 */
export function getEffectiveArm(combatant: CombatantState): number {
  const baseArm = combatant.arm + combatant.bonusArm;
  return Math.max(0, baseArm - combatant.statusEffects.rust);
}

/**
 * Process Rust ARM decay at turn end (on-chain parity: effects.rs process_rust_decay)
 * Rust permanently subtracts from ARM each turn. ARM cannot go below 0.
 * Subtracts from bonusArm first, then base arm.
 */
export function processRustDamage(combatant: CombatantState): {
  combatant: CombatantState;
  armLost: number;
} {
  if (combatant.statusEffects.rust <= 0) {
    return { combatant, armLost: 0 };
  }

  const totalArm = combatant.arm + combatant.bonusArm;
  const decay = combatant.statusEffects.rust;
  const armLost = Math.min(totalArm, decay);

  let newBonusArm = combatant.bonusArm;
  let newArm = combatant.arm;
  let remaining = decay;

  if (remaining > 0 && newBonusArm > 0) {
    const fromBonus = Math.min(newBonusArm, remaining);
    newBonusArm -= fromBonus;
    remaining -= fromBonus;
  }
  if (remaining > 0 && newArm > 0) {
    const fromBase = Math.min(newArm, remaining);
    newArm -= fromBase;
  }

  return {
    combatant: { ...combatant, arm: newArm, bonusArm: newBonusArm },
    armLost,
  };
}

// ============================================================================
// T008-T011: Bleed Effect
// Takes damage equal to stacks at turn end, loses 1 stack at turn end
// ============================================================================

/**
 * Get Bleed damage to be dealt at turn end
 * Returns damage equal to Bleed stacks (non-weapon, ignores armor)
 */
export function getBleedDamage(combatant: CombatantState): number {
  return combatant.statusEffects.bleed;
}

/**
 * Process Bleed damage at turn end (on-chain parity: effects.rs process_bleed_damage_with_chill)
 * - Deals damage equal to Bleed stacks + Chill bonus (capped at 3)
 * - Bleed stack decay is handled separately in processStatusEffectsTurnEnd
 * Returns updated combatant and damage dealt
 */
export function processBleedDamage(combatant: CombatantState): {
  combatant: CombatantState;
  damage: number;
} {
  const bleedStacks = combatant.statusEffects.bleed;
  if (bleedStacks <= 0) {
    return { combatant, damage: 0 };
  }

  const chillBonus = Math.min(3, combatant.statusEffects.chill);
  const damage = bleedStacks + chillBonus;
  const newHp = Math.max(0, combatant.hp - damage);

  return {
    combatant: {
      ...combatant,
      hp: newHp,
    },
    damage,
  };
}

// ============================================================================
// T117: Status Effect Stacking Logic
// ============================================================================

/**
 * Apply status effect stacks to a combatant
 * Stacks are additive (negative amount clamps to 0)
 */
export function applyStatus(
  combatant: CombatantState,
  type: StatusEffectType,
  stacks: number
): CombatantState {
  const currentStacks = combatant.statusEffects[type] ?? 0;
  const newStacks = Math.max(0, currentStacks + stacks);

  return {
    ...combatant,
    statusEffects: {
      ...combatant.statusEffects,
      [type]: newStacks,
    },
  };
}

/**
 * Remove status effect stacks from a combatant
 * Cannot go below 0
 */
export function removeStatus(
  combatant: CombatantState,
  type: StatusEffectType,
  stacks: number
): CombatantState {
  const currentStacks = combatant.statusEffects[type] ?? 0;
  const newStacks = Math.max(0, currentStacks - stacks);

  return {
    ...combatant,
    statusEffects: {
      ...combatant.statusEffects,
      [type]: newStacks,
    },
  };
}

/**
 * Clear all stacks of a specific status effect
 */
export function clearStatus(
  combatant: CombatantState,
  type: StatusEffectType
): CombatantState {
  return {
    ...combatant,
    statusEffects: {
      ...combatant.statusEffects,
      [type]: 0,
    },
  };
}

/**
 * Check if combatant has active status effect
 */
export function hasActiveStatus(
  combatant: CombatantState,
  type: StatusEffectType
): boolean {
  return (combatant.statusEffects[type] ?? 0) > 0;
}

/**
 * Get current stack count for a status effect
 */
export function getStatusStacks(
  combatant: CombatantState,
  type: StatusEffectType
): number {
  return combatant.statusEffects[type] ?? 0;
}

/**
 * Get all active status effects with their stack counts
 */
export function getActiveStatusEffects(
  combatant: CombatantState
): Array<{ type: StatusEffectType; stacks: number; info: StatusEffectInfo }> {
  const effects: Array<{ type: StatusEffectType; stacks: number; info: StatusEffectInfo }> = [];

  const types: StatusEffectType[] = ['chill', 'shrapnel', 'rust', 'bleed', 'reflection'];

  for (const type of types) {
    const stacks = combatant.statusEffects[type] ?? 0;
    if (stacks > 0) {
      effects.push({
        type,
        stacks,
        info: STATUS_EFFECT_ICONS[type],
      });
    }
  }

  return effects;
}

// ============================================================================
// Turn End Processing
// ============================================================================

/**
 * Process all status effects at turn end (on-chain parity: lib.rs apply_end_of_turn_effects)
 *
 * Order matches on-chain:
 * 1. Rust ARM decay (permanent)
 * 2. Bleed damage + chill bonus
 * 3. Status decay (chill -1, bleed -1, shrapnel = 0)
 * 4. Shrapnel preservation (if preserveShrapnelCap > 0)
 *
 * @param combatant - The combatant to process
 * @param preserveShrapnelCap - Numeric cap for shrapnel preservation (0 = clear all)
 * @param preserveFreshChill - Chill stacks applied after this combatant already acted this turn.
 * These stacks are preserved through this turn-end so they can affect the next turn.
 */
export function processStatusEffectsTurnEnd(
  combatant: CombatantState,
  preserveShrapnelCap: number = 0,
  preserveFreshChill: number = 0
): {
  combatant: CombatantState;
  bleedDamage: number;
  armLost: number;
  statusRemoved: Partial<Record<StatusEffectType, number>>;
} {
  let updated = combatant;
  const before = updated.statusEffects;
  const shrapnelBefore = updated.statusEffects.shrapnel;

  // 1. Rust ARM decay (permanent, matches process_rust_decay on-chain)
  const rustResult = processRustDamage(updated);
  updated = rustResult.combatant;

  // 2. Bleed damage with chill bonus (matches process_bleed_damage_with_chill on-chain)
  const bleedResult = processBleedDamage(updated);
  updated = bleedResult.combatant;

  // 3. Status decay (matches decay_status_effects on-chain: chill -1, bleed -1, shrapnel = 0)
  const currentChill = updated.statusEffects.chill;
  const preservedChill = Math.min(currentChill, Math.max(0, preserveFreshChill));
  const decayingChill = Math.max(0, currentChill - preservedChill);

  updated = {
    ...updated,
    statusEffects: {
      ...updated.statusEffects,
      chill: preservedChill + Math.max(0, decayingChill - 1),
      bleed: Math.max(0, updated.statusEffects.bleed - 1),
      shrapnel: 0,
      reflection: updated.statusEffects.reflection ?? 0,
      // rust persists — no decay
    },
  };

  // 4. Shrapnel preservation (matches preserve_shrapnel_cap on-chain)
  if (preserveShrapnelCap > 0) {
    const keep = Math.min(shrapnelBefore, preserveShrapnelCap);
    updated = {
      ...updated,
      statusEffects: {
        ...updated.statusEffects,
        shrapnel: Math.max(updated.statusEffects.shrapnel, keep),
      },
    };
  }

  const after = updated.statusEffects;
  const statusRemoved: Partial<Record<StatusEffectType, number>> = {};

  for (const type of ['chill', 'shrapnel', 'rust', 'bleed', 'reflection'] as const) {
    const removed = Math.max(0, (before[type] ?? 0) - (after[type] ?? 0));
    if (removed > 0) {
      statusRemoved[type] = removed;
    }
  }

  return {
    combatant: updated,
    bleedDamage: bleedResult.damage,
    armLost: rustResult.armLost,
    statusRemoved,
  };
}
