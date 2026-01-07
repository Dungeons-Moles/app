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
    description: 'Halves ATK. Loses 1 stack at end of turn.',
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
    description: 'Reduces ARM by stack count.',
    color: '#a16207', // Brown
  },
};

// ============================================================================
// T114: Chill Effect
// Halves ATK while stacks exist, remove 1 stack at end of turn
// ============================================================================

/**
 * Get effective ATK after applying Chill reduction
 * Chill halves ATK (rounded down) when stacks > 0
 */
export function getEffectiveAtk(combatant: CombatantState): number {
  const baseAtk = combatant.atk + combatant.bonusAtk;

  if (combatant.statusEffects.chill > 0) {
    return Math.floor(baseAtk / 2);
  }

  return baseAtk;
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

  const types: StatusEffectType[] = ['chill', 'shrapnel', 'rust'];

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
 */
export function processStatusEffectsTurnEnd(
  combatant: CombatantState,
  hasShrapnelHarness: boolean = false
): CombatantState {
  let updated = combatant;
  updated = processChillDecay(updated);
  updated = processShrapnelClear(updated, hasShrapnelHarness);
  // Rust persists - no processing needed
  return updated;
}
