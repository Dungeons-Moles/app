/**
 * T046: Damage calculation for combat system
 * Pure functions for calculating damage between combatants
 * @see specs/001-pve-dungeon-crawler/research.md R2
 * @see specs/001-pve-dungeon-crawler/spec.md FR-014
 */

import type { CombatantState } from '../engine/types';

/**
 * Result of a damage calculation
 */
export interface DamageResult {
  /** Base ATK value (including bonusAtk) */
  baseAtk: number;
  /** ATK after Chill reduction (halved if chill > 0) */
  atkAfterChill: number;
  /** Amount of damage absorbed by armor */
  armorReduction: number;
  /** Final HP damage dealt */
  finalDamage: number;
  /** Shrapnel reflect damage back to attacker */
  shrapnelReflect: number;
}

/**
 * Calculate damage from attacker to defender
 *
 * Damage formula per spec FR-014:
 * 1. Calculate base ATK (atk + bonusAtk)
 * 2. Apply Chill: if chill > 0, halve ATK (floor)
 * 3. Calculate effective ARM (arm + bonusArm - rust, minimum 0)
 * 4. If ignoresArmor, skip ARM reduction
 * 5. Final damage = atkAfterChill - effectiveARM (minimum 0)
 * 6. Shrapnel reflect = defender's shrapnel stacks
 *
 * @param attacker - The attacking combatant
 * @param defender - The defending combatant
 * @returns DamageResult with breakdown of damage calculation
 */
export function calculateDamage(
  attacker: CombatantState,
  defender: CombatantState
): DamageResult {
  // Step 1: Calculate base ATK
  const baseAtk = attacker.atk + attacker.bonusAtk;

  // Step 2: Apply Chill (halves ATK, rounded down)
  let atkAfterChill = baseAtk;
  if (attacker.statusEffects.chill > 0) {
    atkAfterChill = Math.floor(baseAtk / 2);
  }

  // Step 3: Calculate effective ARM (reduced by Rust)
  const baseArm = defender.arm + defender.bonusArm;
  const effectiveArm = Math.max(0, baseArm - defender.statusEffects.rust);

  // Step 4: Calculate armor reduction (0 if ignoresArmor)
  let armorReduction = 0;
  if (!attacker.ignoresArmor) {
    armorReduction = Math.min(effectiveArm, atkAfterChill);
  }

  // Step 5: Calculate final damage (minimum 0)
  const finalDamage = Math.max(0, atkAfterChill - armorReduction);

  // Step 6: Calculate Shrapnel reflect
  const shrapnelReflect = defender.statusEffects.shrapnel;

  return {
    baseAtk,
    atkAfterChill,
    armorReduction,
    finalDamage,
    shrapnelReflect,
  };
}

/**
 * Helper to create a DamageResult for testing/logging
 */
export function createDamageResult(params: DamageResult): DamageResult {
  return { ...params };
}

/**
 * Apply damage to a combatant, returning new state
 * @param combatant - The combatant to damage
 * @param damage - Amount of HP damage to deal
 * @returns New combatant state with reduced HP
 */
export function applyDamage(
  combatant: CombatantState,
  damage: number
): CombatantState {
  return {
    ...combatant,
    hp: Math.max(0, combatant.hp - damage),
  };
}

/**
 * Check if combatant is defeated (HP <= 0)
 */
export function isDefeated(combatant: CombatantState): boolean {
  return combatant.hp <= 0;
}

/**
 * Check if combatant is wounded (HP < 50% of maxHp)
 */
export function isWounded(combatant: CombatantState): boolean {
  return combatant.hp < combatant.maxHp * 0.5;
}

/**
 * Check if combatant is exposed (ARM === 0)
 */
export function isExposed(combatant: CombatantState): boolean {
  return combatant.arm + combatant.bonusArm <= 0;
}
