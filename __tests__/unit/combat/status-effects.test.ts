/**
 * T113: Status effects tests
 * Tests for Chill, Shrapnel, and Rust status effects
 * @see specs/001-pve-dungeon-crawler/spec.md FR-026 to FR-029
 * @see specs/001-pve-dungeon-crawler/data-model.md StatusEffects
 */

import type { CombatantState, CombatState, StatusEffects } from '../../../src/game/engine/types';
import { DEFAULT_STATUS_EFFECTS, CombatPhase } from '../../../src/game/engine/types';
import {
  applyStatus,
  removeStatus,
  getEffectiveAtk,
  getEffectiveArm,
  getShrapnelDamage,
  processChillDecay,
  processShrapnelClear,
  processRustDamage,
  hasActiveStatus,
  getStatusStacks,
  STATUS_EFFECT_ICONS,
  StatusEffectType,
} from '../../../src/game/combat/status-effects';

// Helper to create a test combatant
function createTestCombatant(overrides: Partial<CombatantState> = {}): CombatantState {
  return {
    name: 'Test Combatant',
    emoji: '🧪',
    isPlayer: false,
    maxHp: 20,
    hp: 20,
    atk: 10,
    arm: 5,
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

describe('Status Effects System', () => {
  // ============================================================================
  // T114: Chill Effect Tests
  // ============================================================================
  describe('Chill Effect (T114)', () => {
    describe('ATK reduction', () => {
      it('should halve ATK when combatant has Chill stacks', () => {
        const combatant = createTestCombatant({
          atk: 10,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 2 },
        });

        const effectiveAtk = getEffectiveAtk(combatant);

        expect(effectiveAtk).toBe(5); // 10 / 2 = 5
      });

      it('should round down when halving odd ATK', () => {
        const combatant = createTestCombatant({
          atk: 7,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 1 },
        });

        const effectiveAtk = getEffectiveAtk(combatant);

        expect(effectiveAtk).toBe(3); // floor(7 / 2) = 3
      });

      it('should not reduce ATK when Chill stacks are 0', () => {
        const combatant = createTestCombatant({
          atk: 10,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 0 },
        });

        const effectiveAtk = getEffectiveAtk(combatant);

        expect(effectiveAtk).toBe(10);
      });

      it('should include bonusAtk before halving', () => {
        const combatant = createTestCombatant({
          atk: 8,
          bonusAtk: 4,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 1 },
        });

        const effectiveAtk = getEffectiveAtk(combatant);

        expect(effectiveAtk).toBe(6); // floor((8 + 4) / 2) = 6
      });
    });

    describe('Chill decay at turn end', () => {
      it('should remove 1 Chill stack at turn end', () => {
        const combatant = createTestCombatant({
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 3 },
        });

        const updatedCombatant = processChillDecay(combatant);

        expect(updatedCombatant.statusEffects.chill).toBe(2);
      });

      it('should not go below 0 Chill stacks', () => {
        const combatant = createTestCombatant({
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 0 },
        });

        const updatedCombatant = processChillDecay(combatant);

        expect(updatedCombatant.statusEffects.chill).toBe(0);
      });

      it('should remove Chill completely when at 1 stack', () => {
        const combatant = createTestCombatant({
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 1 },
        });

        const updatedCombatant = processChillDecay(combatant);

        expect(updatedCombatant.statusEffects.chill).toBe(0);
      });
    });
  });

  // ============================================================================
  // T115: Shrapnel Effect Tests
  // ============================================================================
  describe('Shrapnel Effect (T115)', () => {
    describe('reflect damage when struck', () => {
      it('should return damage equal to Shrapnel stacks when struck', () => {
        const combatant = createTestCombatant({
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, shrapnel: 5 },
        });

        const reflectDamage = getShrapnelDamage(combatant);

        expect(reflectDamage).toBe(5);
      });

      it('should return 0 when no Shrapnel stacks', () => {
        const combatant = createTestCombatant({
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, shrapnel: 0 },
        });

        const reflectDamage = getShrapnelDamage(combatant);

        expect(reflectDamage).toBe(0);
      });

      it('should reflect damage even when taking 0 damage from attack', () => {
        // Shrapnel reflects based on stacks, not incoming damage
        const combatant = createTestCombatant({
          arm: 100, // High armor means 0 damage
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, shrapnel: 3 },
        });

        const reflectDamage = getShrapnelDamage(combatant);

        expect(reflectDamage).toBe(3);
      });
    });

    describe('Shrapnel clearing at turn end', () => {
      it('should clear all Shrapnel at turn end', () => {
        const combatant = createTestCombatant({
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, shrapnel: 8 },
        });

        const updatedCombatant = processShrapnelClear(combatant);

        expect(updatedCombatant.statusEffects.shrapnel).toBe(0);
      });

      it('should not affect other status effects when clearing Shrapnel', () => {
        const combatant = createTestCombatant({
          statusEffects: { chill: 2, shrapnel: 5, rust: 3 },
        });

        const updatedCombatant = processShrapnelClear(combatant);

        expect(updatedCombatant.statusEffects.shrapnel).toBe(0);
        expect(updatedCombatant.statusEffects.chill).toBe(2);
        expect(updatedCombatant.statusEffects.rust).toBe(3);
      });

      it('should keep up to 3 Shrapnel when Shrapnel Harness itemset is active', () => {
        const combatant = createTestCombatant({
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, shrapnel: 8 },
        });

        // With Shrapnel Harness active
        const updatedCombatant = processShrapnelClear(combatant, true);

        expect(updatedCombatant.statusEffects.shrapnel).toBe(3); // Cap at 3
      });

      it('should keep existing Shrapnel if less than 3 with Shrapnel Harness', () => {
        const combatant = createTestCombatant({
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, shrapnel: 2 },
        });

        const updatedCombatant = processShrapnelClear(combatant, true);

        expect(updatedCombatant.statusEffects.shrapnel).toBe(2);
      });
    });
  });

  // ============================================================================
  // T116: Rust Effect Tests
  // ============================================================================
  describe('Rust Effect (T116)', () => {
    describe('ARM reduction', () => {
      it('should reduce effective ARM by Rust stacks', () => {
        const combatant = createTestCombatant({
          arm: 10,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, rust: 3 },
        });

        const effectiveArm = getEffectiveArm(combatant);

        expect(effectiveArm).toBe(7); // 10 - 3 = 7
      });

      it('should not reduce ARM below 0', () => {
        const combatant = createTestCombatant({
          arm: 2,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, rust: 5 },
        });

        const effectiveArm = getEffectiveArm(combatant);

        expect(effectiveArm).toBe(0); // max(0, 2 - 5) = 0
      });

      it('should include bonusArm before Rust reduction', () => {
        const combatant = createTestCombatant({
          arm: 5,
          bonusArm: 3,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, rust: 4 },
        });

        const effectiveArm = getEffectiveArm(combatant);

        expect(effectiveArm).toBe(4); // (5 + 3) - 4 = 4
      });

      it('should not reduce ARM when Rust stacks are 0', () => {
        const combatant = createTestCombatant({
          arm: 8,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, rust: 0 },
        });

        const effectiveArm = getEffectiveArm(combatant);

        expect(effectiveArm).toBe(8);
      });
    });

    describe('Rust persists until explicitly removed', () => {
      it('should not decay Rust at turn end', () => {
        // Rust doesn't decay like Chill; it persists
        const combatant = createTestCombatant({
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, rust: 4 },
        });

        // Rust stays after processing other status decay
        const afterChill = processChillDecay(combatant);
        const afterShrapnel = processShrapnelClear(afterChill);

        expect(afterShrapnel.statusEffects.rust).toBe(4);
      });
    });
  });

  // ============================================================================
  // T117: Status Effect Stacking Logic Tests
  // ============================================================================
  describe('Status Effect Stacking (T117)', () => {
    describe('applying status effects', () => {
      it('should add stacks when applying status to combatant', () => {
        const combatant = createTestCombatant();

        const updated = applyStatus(combatant, 'chill', 2);

        expect(updated.statusEffects.chill).toBe(2);
      });

      it('should stack with existing status', () => {
        const combatant = createTestCombatant({
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 3 },
        });

        const updated = applyStatus(combatant, 'chill', 2);

        expect(updated.statusEffects.chill).toBe(5); // 3 + 2 = 5
      });

      it('should stack different status effects independently', () => {
        let combatant = createTestCombatant();

        combatant = applyStatus(combatant, 'chill', 2);
        combatant = applyStatus(combatant, 'rust', 3);
        combatant = applyStatus(combatant, 'shrapnel', 5);

        expect(combatant.statusEffects.chill).toBe(2);
        expect(combatant.statusEffects.rust).toBe(3);
        expect(combatant.statusEffects.shrapnel).toBe(5);
      });

      it('should not have negative stacks', () => {
        const combatant = createTestCombatant({
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, rust: 2 },
        });

        const updated = applyStatus(combatant, 'rust', -5);

        expect(updated.statusEffects.rust).toBe(0);
      });
    });

    describe('removing status effects', () => {
      it('should remove specified stacks', () => {
        const combatant = createTestCombatant({
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 5 },
        });

        const updated = removeStatus(combatant, 'chill', 2);

        expect(updated.statusEffects.chill).toBe(3);
      });

      it('should not go below 0 when removing stacks', () => {
        const combatant = createTestCombatant({
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 2 },
        });

        const updated = removeStatus(combatant, 'chill', 5);

        expect(updated.statusEffects.chill).toBe(0);
      });

      it('should clear all stacks when amount equals current', () => {
        const combatant = createTestCombatant({
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, shrapnel: 3 },
        });

        const updated = removeStatus(combatant, 'shrapnel', 3);

        expect(updated.statusEffects.shrapnel).toBe(0);
      });
    });

    describe('status check helpers', () => {
      it('should detect active status', () => {
        const combatant = createTestCombatant({
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 2 },
        });

        expect(hasActiveStatus(combatant, 'chill')).toBe(true);
        expect(hasActiveStatus(combatant, 'rust')).toBe(false);
      });

      it('should return correct stack count', () => {
        const combatant = createTestCombatant({
          statusEffects: { chill: 4, shrapnel: 2, rust: 0 },
        });

        expect(getStatusStacks(combatant, 'chill')).toBe(4);
        expect(getStatusStacks(combatant, 'shrapnel')).toBe(2);
        expect(getStatusStacks(combatant, 'rust')).toBe(0);
      });
    });
  });

  // ============================================================================
  // Status Effect Icons Tests (T120)
  // ============================================================================
  describe('Status Effect Icons (T120)', () => {
    it('should have icon definitions for all status effects', () => {
      expect(STATUS_EFFECT_ICONS.chill).toBeDefined();
      expect(STATUS_EFFECT_ICONS.shrapnel).toBeDefined();
      expect(STATUS_EFFECT_ICONS.rust).toBeDefined();
    });

    it('should have emoji, name, and description for each effect', () => {
      const effects: StatusEffectType[] = ['chill', 'shrapnel', 'rust'];

      effects.forEach((effect) => {
        expect(STATUS_EFFECT_ICONS[effect].emoji).toBeDefined();
        expect(STATUS_EFFECT_ICONS[effect].name).toBeDefined();
        expect(STATUS_EFFECT_ICONS[effect].description).toBeDefined();
        expect(typeof STATUS_EFFECT_ICONS[effect].emoji).toBe('string');
        expect(typeof STATUS_EFFECT_ICONS[effect].name).toBe('string');
        expect(typeof STATUS_EFFECT_ICONS[effect].description).toBe('string');
      });
    });
  });
});
