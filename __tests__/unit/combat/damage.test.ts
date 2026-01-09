/**
 * T043: Damage calculation tests
 * Tests for damage calculation in combat system
 * @see specs/001-pve-dungeon-crawler/research.md R2
 * @see specs/001-pve-dungeon-crawler/data-model.md CombatState
 */

import { calculateDamage, createDamageResult, type DamageResult } from '../../../src/game/combat/damage';
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

      it('should not deal negative damage (minimum 0)', () => {
        const attacker = createTestCombatant({ atk: 2 });
        const defender = createTestCombatant({ arm: 10 });

        const result = calculateDamage(attacker, defender);

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

    describe('Chill status effect', () => {
      it('should halve ATK when attacker has Chill stacks', () => {
        const attacker = createTestCombatant({
          atk: 10,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 2 },
        });
        const defender = createTestCombatant({ arm: 0 });

        const result = calculateDamage(attacker, defender);

        expect(result.atkAfterChill).toBe(5); // 10 / 2 = 5
        expect(result.hpDamage).toBe(5);
      });

      it('should round down when halving odd ATK with Chill', () => {
        const attacker = createTestCombatant({
          atk: 7,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 1 },
        });
        const defender = createTestCombatant({ arm: 0 });

        const result = calculateDamage(attacker, defender);

        expect(result.atkAfterChill).toBe(3); // floor(7 / 2) = 3
        expect(result.hpDamage).toBe(3);
      });

      it('should not apply Chill penalty when chill stacks are 0', () => {
        const attacker = createTestCombatant({
          atk: 10,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 0 },
        });
        const defender = createTestCombatant({ arm: 0 });

        const result = calculateDamage(attacker, defender);

        expect(result.atkAfterChill).toBe(10);
        expect(result.hpDamage).toBe(10);
      });

      it('should apply Chill before ARM reduction', () => {
        const attacker = createTestCombatant({
          atk: 10,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 1 },
        });
        const defender = createTestCombatant({ arm: 3 });

        const result = calculateDamage(attacker, defender);

        // ATK 10 -> halved to 5 -> minus ARM 3 -> 2 damage
        expect(result.atkAfterChill).toBe(5);
        expect(result.armorDamage).toBe(3);
        expect(result.hpDamage).toBe(2);
      });
    });

    describe('Shrapnel status effect', () => {
      it('should reflect damage equal to Shrapnel stacks', () => {
        const attacker = createTestCombatant({ atk: 10 });
        const defender = createTestCombatant({
          arm: 2,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, shrapnel: 4 },
        });

        const result = calculateDamage(attacker, defender);

        expect(result.shrapnelReflect).toBe(4);
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

      it('should still calculate Shrapnel reflect even if attack deals 0 damage', () => {
        const attacker = createTestCombatant({ atk: 2 });
        const defender = createTestCombatant({
          arm: 10,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, shrapnel: 5 },
        });

        const result = calculateDamage(attacker, defender);

        expect(result.hpDamage).toBe(0);
        expect(result.shrapnelReflect).toBe(5);
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

      it('should still apply Chill even when ignoring armor', () => {
        const attacker = createTestCombatant({
          atk: 10,
          ignoresArmor: true,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 1 },
        });
        const defender = createTestCombatant({ arm: 8 });

        const result = calculateDamage(attacker, defender);

        expect(result.atkAfterChill).toBe(5);
        expect(result.armorDamage).toBe(0);
        expect(result.hpDamage).toBe(5);
      });
    });

    describe('Rust status effect', () => {
      it('should reduce effective ARM by Rust stacks', () => {
        const attacker = createTestCombatant({ atk: 10 });
        const defender = createTestCombatant({
          arm: 5,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, rust: 3 },
        });

        const result = calculateDamage(attacker, defender);

        // ARM 5 - Rust 3 = effective ARM 2
        expect(result.armorDamage).toBe(2);
        expect(result.hpDamage).toBe(8);
      });

      it('should not reduce ARM below 0 with Rust', () => {
        const attacker = createTestCombatant({ atk: 10 });
        const defender = createTestCombatant({
          arm: 2,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, rust: 5 },
        });

        const result = calculateDamage(attacker, defender);

        expect(result.armorDamage).toBe(0); // max(0, 2 - 5) = 0
        expect(result.hpDamage).toBe(10);
      });
    });

    describe('complex scenarios', () => {
      it('should handle all effects together', () => {
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
        // After Chill: floor(14 / 2) = 7
        // Defender effective ARM: (4 + 1) - 2 = 3
        // Damage: 7 - 3 = 4
        // Shrapnel reflect: 3
        expect(result.baseAtk).toBe(14);
        expect(result.atkAfterChill).toBe(7);
        expect(result.armorDamage).toBe(3);
        expect(result.hpDamage).toBe(4);
        expect(result.shrapnelReflect).toBe(3);
      });
    });
  });

  describe('createDamageResult', () => {
    it('should create a complete damage result structure', () => {
      const result = createDamageResult({
        baseAtk: 10,
        atkAfterChill: 10,
        armorDamage: 3,
        hpDamage: 7,
        shrapnelReflect: 0,
      });

      expect(result).toEqual({
        baseAtk: 10,
        atkAfterChill: 10,
        armorDamage: 3,
        hpDamage: 7,
        shrapnelReflect: 0,
      });
    });
  });
});
