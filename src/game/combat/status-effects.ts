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
 * Clears all Shrapnel unless Shrapnel Harness is active (keeps up to 3)
 */
export function processShrapnelClear(
  combatant: CombatantState,
  hasShrapnelHarness: boolean = false
): CombatantState {
  if (combatant.statusEffects.shrapnel <= 0) {
    return combatant;
  }

  const newShrapnel = hasShrapnelHarness
    ? Math.min(combatant.statusEffects.shrapnel, 3)
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
 * Process Rust damage at turn end (optional - for future armor decay)
 * Currently Rust persists until explicitly removed
 */
export function processRustDamage(combatant: CombatantState): CombatantState {
  // Rust doesn't decay naturally - it persists until removed
  return combatant;
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
 * Process Bleed damage at turn end
 * - Deals damage equal to Bleed stacks
 * - Removes 1 Bleed stack
 * Returns updated combatant and damage dealt
 */
export function processBleedDamage(combatant: CombatantState): {
  combatant: CombatantState;
  damage: number;
} {
  const damage = combatant.statusEffects.bleed;

  if (damage <= 0) {
    return { combatant, damage: 0 };
  }

  const newHp = Math.max(0, combatant.hp - damage);
  const newBleed = Math.max(0, combatant.statusEffects.bleed - 1);

  return {
    combatant: {
      ...combatant,
      hp: newHp,
      statusEffects: {
        ...combatant.statusEffects,
        bleed: newBleed,
      },
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
  const currentStacks = combatant.statusEffects[type];
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
  const currentStacks = combatant.statusEffects[type];
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
  return combatant.statusEffects[type] > 0;
}

/**
 * Get current stack count for a status effect
 */
export function getStatusStacks(
  combatant: CombatantState,
  type: StatusEffectType
): number {
  return combatant.statusEffects[type];
}

/**
 * Get all active status effects with their stack counts
 */
export function getActiveStatusEffects(
  combatant: CombatantState
): Array<{ type: StatusEffectType; stacks: number; info: StatusEffectInfo }> {
  const effects: Array<{ type: StatusEffectType; stacks: number; info: StatusEffectInfo }> = [];

  const types: StatusEffectType[] = ['chill', 'shrapnel', 'rust', 'bleed'];

  for (const type of types) {
    const stacks = combatant.statusEffects[type];
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
 * Process all status effects at turn end
 * - Chill: decay by 1
 * - Shrapnel: clear (unless Shrapnel Harness)
 * - Rust: persists
 * - Bleed: deal damage and decay by 1
 * Returns updated combatant and bleed damage dealt
 */
export function processStatusEffectsTurnEnd(
  combatant: CombatantState,
  hasShrapnelHarness: boolean = false
): { combatant: CombatantState; bleedDamage: number } {
  let updated = combatant;
  updated = processChillDecay(updated);
  updated = processShrapnelClear(updated, hasShrapnelHarness);
  // Rust persists - no processing needed

  // Process Bleed damage and decay
  const bleedResult = processBleedDamage(updated);
  updated = bleedResult.combatant;

  return { combatant: updated, bleedDamage: bleedResult.damage };
}
