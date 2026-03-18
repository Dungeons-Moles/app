/**
 * T043: Damage calculation tests
 * Tests for damage calculation in combat system
 * @see specs/001-pve-dungeon-crawler/research.md R2
 * @see specs/001-pve-dungeon-crawler/data-model.md CombatState
 */

import {
  applyDamage,
  calculateDamage,
  createDamageResult,
  type DamageResult,
} from '../../../src/game/combat/damage';
import type { CombatantState } from '../../../src/game/engine/types';
import { DEFAULT_STATUS_EFFECTS } from '../../../src/game/engine/types';

// Helper to create a combatant for testing
function createTestCombatant(overrides: Partial<CombatantState> = {}): CombatantState {
  return {
    name: 'Test Combatant',
    emoji: '🧪',
    isPlayer: false,
    maxHp: 20,
    hp: 20,
    atk: 5,
    arm: 2,
    spd: 3,
    dig: 1,
    bonusAtk: 0,
    bonusArm: 0,
    bonusSpd: 0,
    statusEffects: { ...DEFAULT_STATUS_EFFECTS },
    strikesPerTurn: 1,
    ignoresArmor: false,
    ...overrides,
  };
}

describe('Damage Calculation', () => {
  describe('calculateDamage', () => {
    describe('basic damage calculation', () => {
      it('should calculate damage as ATK minus target ARM', () => {
        const attacker = createTestCombatant({ atk: 10 });
        const defender = createTestCombatant({ arm: 3 });

        const result = calculateDamage(attacker, defender);

        expect(result.armorDamage).toBe(3);
        expect(result.hpDamage).toBe(7); // 10 ATK - 3 ARM = 7 damage
      });

      it('should let armor fully absorb damage (HP before HP)', () => {
        const attacker = createTestCombatant({ atk: 2 });
        const defender = createTestCombatant({ arm: 10 });

        const result = calculateDamage(attacker, defender);

        // ARM is "HP before HP": armor absorbs all damage, 0 HP goes through.
        expect(result.armorDamage).toBe(2);
        expect(result.hpDamage).toBe(0);
      });

      it('should include bonus ATK in calculation', () => {
        const attacker = createTestCombatant({ atk: 5, bonusAtk: 3 });
        const defender = createTestCombatant({ arm: 2 });

        const result = calculateDamage(attacker, defender);

        expect(result.baseAtk).toBe(8); // 5 + 3
        expect(result.armorDamage).toBe(2);
        expect(result.hpDamage).toBe(6); // 8 - 2 = 6
      });

      it('should include bonus ARM in calculation', () => {
        const attacker = createTestCombatant({ atk: 10 });
        const defender = createTestCombatant({ arm: 2, bonusArm: 3 });

        const result = calculateDamage(attacker, defender);

        expect(result.armorDamage).toBe(5); // 2 + 3
        expect(result.hpDamage).toBe(5); // 10 - 5 = 5
      });

      it('should handle zero ATK', () => {
        const attacker = createTestCombatant({ atk: 0 });
        const defender = createTestCombatant({ arm: 5 });

        const result = calculateDamage(attacker, defender);

        expect(result.armorDamage).toBe(0);
        expect(result.hpDamage).toBe(0);
      });

      it('should handle zero ARM', () => {
        const attacker = createTestCombatant({ atk: 7 });
        const defender = createTestCombatant({ arm: 0 });

        const result = calculateDamage(attacker, defender);

        expect(result.hpDamage).toBe(7);
        expect(result.armorDamage).toBe(0);
      });
    });

    describe('Chill status effect (no longer affects ATK - affects strikes instead)', () => {
      // Note: Chill now reduces strikes per turn (see status-effects.ts getEffectiveStrikes)
      // NOT attack damage. This matches on-chain behavior in effects.rs.

      it('should NOT halve ATK when attacker has Chill stacks (Chill affects strikes, not ATK)', () => {
        const attacker = createTestCombatant({
          atk: 10,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 2 },
        });
        const defender = createTestCombatant({ arm: 0 });

        const result = calculateDamage(attacker, defender);

        // Chill does NOT affect ATK - it affects strikes per turn
        expect(result.effectiveAtk).toBe(10);
        expect(result.hpDamage).toBe(10);
      });

      it('should NOT reduce ATK with any amount of Chill stacks', () => {
        const attacker = createTestCombatant({
          atk: 7,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 5 },
        });
        const defender = createTestCombatant({ arm: 0 });

        const result = calculateDamage(attacker, defender);

        // Chill does NOT affect ATK
        expect(result.effectiveAtk).toBe(7);
        expect(result.hpDamage).toBe(7);
      });

      it('should have same effectiveAtk regardless of chill stacks', () => {
        const attacker = createTestCombatant({
          atk: 10,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 0 },
        });
        const defender = createTestCombatant({ arm: 0 });

        const result = calculateDamage(attacker, defender);

        expect(result.effectiveAtk).toBe(10);
        expect(result.hpDamage).toBe(10);
      });

      it('should calculate damage normally with Chill (Chill affects strikes, not damage)', () => {
        const attacker = createTestCombatant({
          atk: 10,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 1 },
        });
        const defender = createTestCombatant({ arm: 3 });

        const result = calculateDamage(attacker, defender);

        // ATK 10 is unchanged by Chill -> minus ARM 3 -> 7 damage
        expect(result.effectiveAtk).toBe(10);
        expect(result.armorDamage).toBe(3);
        expect(result.hpDamage).toBe(7);
      });
    });

    describe('Shrapnel status effect', () => {
      it('should reflect damage equal to strike ATK when defender has shrapnel', () => {
        const attacker = createTestCombatant({ atk: 10 });
        const defender = createTestCombatant({
          arm: 2,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, shrapnel: 4 },
        });

        const result = calculateDamage(attacker, defender);

        // Shrapnel reflect = effectiveAtk (10) + attacker chill bonus (0) = 10
        expect(result.shrapnelReflect).toBe(10);
      });

      it('should not reflect damage when Shrapnel is 0', () => {
        const attacker = createTestCombatant({ atk: 10 });
        const defender = createTestCombatant({
          arm: 2,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, shrapnel: 0 },
        });

        const result = calculateDamage(attacker, defender);

        expect(result.shrapnelReflect).toBe(0);
      });

      it('should still calculate Shrapnel reflect even when armor absorbs all damage', () => {
        const attacker = createTestCombatant({ atk: 2 });
        const defender = createTestCombatant({
          arm: 10,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, shrapnel: 5 },
        });

        const result = calculateDamage(attacker, defender);

        expect(result.hpDamage).toBe(0);
        expect(result.shrapnelReflect).toBe(2);
      });
    });

    describe('Armor ignoring', () => {
      it('should ignore ARM when ignoresArmor is true', () => {
        const attacker = createTestCombatant({ atk: 10, ignoresArmor: true });
        const defender = createTestCombatant({ arm: 8 });

        const result = calculateDamage(attacker, defender);

        expect(result.armorDamage).toBe(0);
        expect(result.hpDamage).toBe(10);
      });

      it('should NOT apply Chill to ATK when ignoring armor (Chill affects strikes, not ATK)', () => {
        const attacker = createTestCombatant({
          atk: 10,
          ignoresArmor: true,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 1 },
        });
        const defender = createTestCombatant({ arm: 8 });

        const result = calculateDamage(attacker, defender);

        // Chill does NOT affect ATK, full damage goes through
        expect(result.effectiveAtk).toBe(10);
        expect(result.armorDamage).toBe(0);
        expect(result.hpDamage).toBe(10);
      });
    });

    describe('Rust status effect (on-chain parity: Rust handled at turn end, not during strikes)', () => {
      it('should NOT reduce effective ARM during strikes (Rust decays ARM at turn end)', () => {
        const attacker = createTestCombatant({ atk: 10 });
        const defender = createTestCombatant({
          arm: 5,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, rust: 3 },
        });

        const result = calculateDamage(attacker, defender);

        // On-chain parity: Rust does not reduce ARM during strikes
        // ARM = 5, ATK = 10 → armor absorbs 5, HP takes 5
        expect(result.armorDamage).toBe(5);
        expect(result.hpDamage).toBe(5);
      });

      it('should use full ARM even with high Rust stacks (Rust decays ARM at turn end)', () => {
        const attacker = createTestCombatant({ atk: 10 });
        const defender = createTestCombatant({
          arm: 2,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, rust: 5 },
        });

        const result = calculateDamage(attacker, defender);

        // On-chain parity: Rust does not reduce ARM during strikes
        // ARM = 2, ATK = 10 → armor absorbs 2, HP takes 8
        expect(result.armorDamage).toBe(2);
        expect(result.hpDamage).toBe(8);
      });
    });

    describe('complex scenarios', () => {
      it('should handle all effects together (Chill does NOT affect ATK, Rust handled at turn end)', () => {
        const attacker = createTestCombatant({
          atk: 12,
          bonusAtk: 2,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 1 },
        });
        const defender = createTestCombatant({
          arm: 4,
          bonusArm: 1,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, rust: 2, shrapnel: 3 },
        });

        const result = calculateDamage(attacker, defender);

        // Base ATK: 12 + 2 = 14
        // Chill does NOT affect ATK (it affects strikes per turn)
        // On-chain parity: Rust reduces ARM permanently at end of turn, not during strikes
        // Defender effective ARM: (4 + 1) = 5
        // Damage: 14 - 5 = 9
        // Shrapnel reflect: effectiveAtk (14) + chill bonus (1) = 15
        expect(result.baseAtk).toBe(14);
        expect(result.effectiveAtk).toBe(14); // Chill doesn't reduce ATK
        expect(result.armorDamage).toBe(5);
        expect(result.hpDamage).toBe(9);
        expect(result.shrapnelReflect).toBe(15);
      });
    });
  });

  describe('applyDamage', () => {
    it('depletes armor directly (Rust handled at turn end, not during strikes)', () => {
      const attacker = createTestCombatant({ atk: 6 });
      const defender = createTestCombatant({
        arm: 10,
        statusEffects: { ...DEFAULT_STATUS_EFFECTS, rust: 8 },
      });

      const result = calculateDamage(attacker, defender);
      const applied = applyDamage(defender, {
        armor: result.armorDamage,
        hp: result.hpDamage,
      });

      // On-chain parity: Rust reduces ARM permanently at end of turn, not during strikes
      // ARM = 10, ATK = 6, so armor absorbs all 6 damage
      expect(result.armorDamage).toBe(6);
      expect(result.hpDamage).toBe(0);
      expect(applied.armorLost).toBe(6);
      expect(applied.combatant.arm).toBe(4);
      expect(applied.combatant.hp).toBe(20);
    });
  });

  describe('createDamageResult', () => {
    it('should create a complete damage result structure', () => {
      const result = createDamageResult({
        baseAtk: 10,
        effectiveAtk: 10,
        armorDamage: 3,
        hpDamage: 7,
        shrapnelReflect: 0,
      });

      expect(result).toEqual({
        baseAtk: 10,
        effectiveAtk: 10,
        armorDamage: 3,
        hpDamage: 7,
        shrapnelReflect: 0,
      });
    });
  });
});
