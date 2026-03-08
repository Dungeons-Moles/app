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
  /** Effective ATK for damage calculation (same as baseAtk - Chill affects strikes, not ATK) */
  effectiveAtk: number;
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
 * Damage formula (on-chain parity with engine.rs execute_strike):
 * 1. Calculate base ATK (atk + bonusAtk)
 * 2. Calculate effective ARM pool (arm + bonusArm, Rust handled by permanent decay)
 * 3. If ignoresArmor, skip ARM absorption
 * 4. Armor damage = min(effectiveArm, effectiveAtk)
 * 5. HP damage = effectiveAtk - armorDamage (minimum 0)
 * 6. Shrapnel reflect = defender's shrapnel stacks
 *
 * Note: Chill affects strikes per turn (see getEffectiveStrikes in status-effects.ts),
 * NOT attack damage. This matches the on-chain behavior in effects.rs.
 *
 * @param attacker - The attacking combatant
 * @param defender - The defending combatant
 * @returns DamageResult with breakdown of damage calculation
 */
export function calculateDamage(attacker: CombatantState, defender: CombatantState): DamageResult {
  // Step 1: Calculate base ATK (Chill does NOT affect ATK - it affects strikes)
  const baseAtk = attacker.atk + attacker.bonusAtk;
  const effectiveAtk = Math.max(0, baseAtk);

  // Step 2: Calculate effective ARM pool
  // On-chain parity: Rust is handled by permanent ARM decay at end of each turn
  // (processRustDamage), NOT as a modifier during strikes. The ARM value already
  // reflects cumulative Rust decay from previous turns.
  const totalArm = defender.arm + defender.bonusArm;
  const effectiveArm = Math.max(0, totalArm);

  // Step 3: Calculate armor damage (0 if ignoresArmor)
  // ARM is "HP before HP": armor absorbs damage first, remainder goes to HP.
  let armorDamage = 0;
  if (!attacker.ignoresArmor) {
    armorDamage = Math.min(effectiveArm, effectiveAtk);
  }

  // Step 4: Calculate HP damage (remainder after armor absorption)
  const hpDamage =
    effectiveAtk <= 0 || defender.hp <= 0 ? 0 : Math.max(0, effectiveAtk - armorDamage);

  // Step 5: Calculate Shrapnel reflect
  const shrapnelReflect = defender.statusEffects.shrapnel > 0 ? defender.statusEffects.shrapnel : 0;

  return {
    baseAtk,
    effectiveAtk,
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
