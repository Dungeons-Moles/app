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
  armorDamage: number;
  /** Final HP damage dealt */
  hpDamage: number;
  /** Shrapnel reflect damage back to attacker */
  shrapnelReflect: number;
}

/**
 * Calculate damage from attacker to defender
 *
 * Damage formula per spec FR-014:
 * 1. Calculate base ATK (atk + bonusAtk)
 * 2. Apply Chill: if chill > 0, halve ATK (floor)
 * 3. Calculate effective ARM pool (arm + bonusArm - rust, minimum 0)
 * 4. If ignoresArmor, skip ARM absorption
 * 5. Armor damage = min(effectiveArm, atkAfterChill)
 * 6. HP damage = atkAfterChill - armorDamage (minimum 0)
 * 7. Shrapnel reflect = defender's shrapnel stacks
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

  // Step 3: Calculate effective ARM pool (reduced by Rust)
  const totalArm = defender.arm + defender.bonusArm;
  const effectiveArm = Math.max(0, totalArm - defender.statusEffects.rust);

  // Step 4: Calculate armor damage (0 if ignoresArmor)
  let armorDamage = 0;
  if (!attacker.ignoresArmor) {
    armorDamage = Math.min(effectiveArm, atkAfterChill);
  }

  // Step 5: Calculate HP damage (minimum 0)
  const hpDamage = Math.max(0, atkAfterChill - armorDamage);

  // Step 6: Calculate Shrapnel reflect
  const shrapnelReflect = defender.statusEffects.shrapnel;

  return {
    baseAtk,
    atkAfterChill,
    armorDamage,
    hpDamage,
    shrapnelReflect,
  };
}

/**
 * Helper to create a DamageResult for testing/logging
 */
export function createDamageResult(params: DamageResult): DamageResult {
  return { ...params };
}

export interface AppliedDamage {
  combatant: CombatantState;
  armorLost: number;
  hpLost: number;
}

/**
 * Apply armor and HP damage to a combatant, returning new state
 */
export function applyDamage(
  combatant: CombatantState,
  damage: { armor: number; hp: number }
): AppliedDamage {
  let remainingArmorDamage = Math.max(0, damage.armor);
  let bonusArm = combatant.bonusArm;
  let baseArm = combatant.arm;

  if (remainingArmorDamage > 0 && bonusArm > 0) {
    const fromBonus = Math.min(bonusArm, remainingArmorDamage);
    bonusArm -= fromBonus;
    remainingArmorDamage -= fromBonus;
  }

  if (remainingArmorDamage > 0 && baseArm > 0) {
    const fromBase = Math.min(baseArm, remainingArmorDamage);
    baseArm -= fromBase;
    remainingArmorDamage -= fromBase;
  }

  const hpLost = Math.max(0, damage.hp);

  return {
    combatant: {
      ...combatant,
      arm: baseArm,
      bonusArm,
      hp: Math.max(0, combatant.hp - hpLost),
    },
    armorLost: Math.max(0, damage.armor) - remainingArmorDamage,
    hpLost,
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
