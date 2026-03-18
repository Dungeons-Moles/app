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
  getEffectiveStrikes,
  getShrapnelDamage,
  getBleedDamage,
  processChillDecay,
  processShrapnelClear,
  processRustDamage,
  processBleedDamage,
  processStatusEffectsTurnEnd,
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
  // T053: Chill Strike Reduction Tests
  // Per GDD Section 8: Chill reduces strikes per turn by stack count (min 1)
  // ============================================================================
  describe('Chill strike reduction (T053)', () => {
    it('should reduce strikes by Chill stack count', () => {
      const combatant = createTestCombatant({
        strikesPerTurn: 3,
        statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 2 },
      });

      expect(getEffectiveStrikes(combatant)).toBe(1); // 3 - 2 = 1
    });

    it('should not reduce strikes below 1', () => {
      const combatant = createTestCombatant({
        strikesPerTurn: 2,
        statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 5 },
      });

      expect(getEffectiveStrikes(combatant)).toBe(1); // min 1
    });

    it('should return base strikes when no Chill', () => {
      const combatant = createTestCombatant({
        strikesPerTurn: 3,
        statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 0 },
      });

      expect(getEffectiveStrikes(combatant)).toBe(3);
    });
  });

  // ============================================================================
  // T114: Chill Effect Tests
  // Per GDD Section 8: Chill reduces strikes per turn, NOT ATK
  // ============================================================================
  describe('Chill Effect (T114)', () => {
    describe('ATK calculation (Chill does NOT affect ATK per GDD)', () => {
      it('should NOT reduce ATK when combatant has Chill stacks', () => {
        const combatant = createTestCombatant({
          atk: 10,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 2 },
        });

        const effectiveAtk = getEffectiveAtk(combatant);

        // Per GDD: Chill reduces strikes, not ATK
        expect(effectiveAtk).toBe(10);
      });

      it('should return base ATK regardless of Chill stacks', () => {
        const combatant = createTestCombatant({
          atk: 7,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 1 },
        });

        const effectiveAtk = getEffectiveAtk(combatant);

        expect(effectiveAtk).toBe(7);
      });

      it('should not reduce ATK when Chill stacks are 0', () => {
        const combatant = createTestCombatant({
          atk: 10,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 0 },
        });

        const effectiveAtk = getEffectiveAtk(combatant);

        expect(effectiveAtk).toBe(10);
      });

      it('should include bonusAtk in effective ATK calculation', () => {
        const combatant = createTestCombatant({
          atk: 8,
          bonusAtk: 4,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, chill: 1 },
        });

        const effectiveAtk = getEffectiveAtk(combatant);

        // Per GDD: Chill does not affect ATK, so full ATK + bonusAtk
        expect(effectiveAtk).toBe(12);
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
      it('should return damage equal to strike ATK when Shrapnel is present', () => {
        const reflectDamage = getShrapnelDamage(5, 0, true);

        expect(reflectDamage).toBe(5);
      });

      it('should return 0 when no Shrapnel stacks', () => {
        const reflectDamage = getShrapnelDamage(5, 0, false);

        expect(reflectDamage).toBe(0);
      });

      it('should add the reflect bonus when present', () => {
        const reflectDamage = getShrapnelDamage(4, 1, true);

        expect(reflectDamage).toBe(5);
      });
    });

    describe('Shrapnel persistence at turn end', () => {
      it('should keep all Shrapnel at turn end', () => {
        const combatant = createTestCombatant({
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, shrapnel: 8 },
        });

        const updatedCombatant = processShrapnelClear(combatant);

        expect(updatedCombatant.statusEffects.shrapnel).toBe(8);
      });

      it('should not affect other status effects when preserving Shrapnel', () => {
        const combatant = createTestCombatant({
          statusEffects: { chill: 2, shrapnel: 5, rust: 3, bleed: 0 },
        });

        const updatedCombatant = processShrapnelClear(combatant);

        expect(updatedCombatant.statusEffects.shrapnel).toBe(5);
        expect(updatedCombatant.statusEffects.chill).toBe(2);
        expect(updatedCombatant.statusEffects.rust).toBe(3);
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
          statusEffects: { chill: 4, shrapnel: 2, rust: 0, bleed: 0 },
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
      expect(STATUS_EFFECT_ICONS.bleed).toBeDefined();
    });

    it('should have emoji, name, and description for each effect', () => {
      const effects: StatusEffectType[] = ['chill', 'shrapnel', 'rust', 'bleed'];

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

  // ============================================================================
  // T012-T014: Bleed Effect Tests
  // ============================================================================
  describe('Bleed Effect (T012-T014)', () => {
    describe('T012: Bleed damage at turn end', () => {
      it('should deal damage equal to Bleed stacks at turn end', () => {
        const combatant = createTestCombatant({
          hp: 20,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, bleed: 5 },
        });

        const { combatant: updated, damage } = processBleedDamage(combatant);

        expect(damage).toBe(5);
        expect(updated.hp).toBe(15); // 20 - 5 = 15
      });

      it('should not deal damage when Bleed stacks are 0', () => {
        const combatant = createTestCombatant({
          hp: 20,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, bleed: 0 },
        });

        const { combatant: updated, damage } = processBleedDamage(combatant);

        expect(damage).toBe(0);
        expect(updated.hp).toBe(20);
      });

      it('should not reduce HP below 0', () => {
        const combatant = createTestCombatant({
          hp: 3,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, bleed: 10 },
        });

        const { combatant: updated, damage } = processBleedDamage(combatant);

        expect(damage).toBe(10);
        expect(updated.hp).toBe(0); // Clamped to 0
      });

      it('should be processed in processStatusEffectsTurnEnd', () => {
        const combatant = createTestCombatant({
          hp: 20,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, bleed: 3 },
        });

        const { combatant: updated, bleedDamage } = processStatusEffectsTurnEnd(combatant);

        expect(bleedDamage).toBe(3);
        expect(updated.hp).toBe(17); // 20 - 3 = 17
      });
    });

    describe('T013: Bleed stack decay (-1 per turn, handled in processStatusEffectsTurnEnd)', () => {
      it('processBleedDamage should deal damage but NOT decay stacks (decay in turn end)', () => {
        const combatant = createTestCombatant({
          hp: 20,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, bleed: 4 },
        });

        const { combatant: updated } = processBleedDamage(combatant);

        // processBleedDamage no longer decays stacks — that's in processStatusEffectsTurnEnd
        expect(updated.statusEffects.bleed).toBe(4);
        expect(updated.hp).toBe(16); // 20 - 4 = 16
      });

      it('should reduce Bleed stacks by 1 at turn end via processStatusEffectsTurnEnd', () => {
        const combatant = createTestCombatant({
          hp: 20,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, bleed: 4 },
        });

        const { combatant: updated } = processStatusEffectsTurnEnd(combatant);

        expect(updated.statusEffects.bleed).toBe(3); // 4 - 1 = 3
        expect(updated.hp).toBe(16); // 20 - 4 = 16 (bleed damage)
      });

      it('should remove Bleed completely when at 1 stack via processStatusEffectsTurnEnd', () => {
        const combatant = createTestCombatant({
          hp: 20,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, bleed: 1 },
        });

        const { combatant: updated } = processStatusEffectsTurnEnd(combatant);

        expect(updated.statusEffects.bleed).toBe(0);
      });

      it('should not go below 0 stacks', () => {
        const combatant = createTestCombatant({
          hp: 20,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, bleed: 0 },
        });

        const { combatant: updated } = processBleedDamage(combatant);

        expect(updated.statusEffects.bleed).toBe(0);
      });
    });

    describe('T014: Determinism test for Bleed effect', () => {
      it('should produce identical results for same input state', () => {
        const combatant1 = createTestCombatant({
          hp: 15,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, bleed: 3 },
        });
        const combatant2 = createTestCombatant({
          hp: 15,
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, bleed: 3 },
        });

        const result1 = processBleedDamage(combatant1);
        const result2 = processBleedDamage(combatant2);

        expect(result1.damage).toBe(result2.damage);
        expect(result1.combatant.hp).toBe(result2.combatant.hp);
        expect(result1.combatant.statusEffects.bleed).toBe(result2.combatant.statusEffects.bleed);
      });

      it('should be deterministic with processStatusEffectsTurnEnd', () => {
        const combatant1 = createTestCombatant({
          hp: 20,
          statusEffects: { chill: 2, shrapnel: 3, rust: 1, bleed: 4 },
        });
        const combatant2 = createTestCombatant({
          hp: 20,
          statusEffects: { chill: 2, shrapnel: 3, rust: 1, bleed: 4 },
        });

        const result1 = processStatusEffectsTurnEnd(combatant1);
        const result2 = processStatusEffectsTurnEnd(combatant2);

        expect(result1.bleedDamage).toBe(result2.bleedDamage);
        expect(result1.combatant.hp).toBe(result2.combatant.hp);
        expect(result1.combatant.statusEffects).toEqual(result2.combatant.statusEffects);
      });
    });

    describe('Bleed utility functions', () => {
      it('should return damage equal to stacks from getBleedDamage', () => {
        const combatant = createTestCombatant({
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, bleed: 7 },
        });

        expect(getBleedDamage(combatant)).toBe(7);
      });

      it('should apply Bleed stacks correctly', () => {
        const combatant = createTestCombatant();

        const updated = applyStatus(combatant, 'bleed', 3);

        expect(updated.statusEffects.bleed).toBe(3);
      });

      it('should stack Bleed with existing stacks', () => {
        const combatant = createTestCombatant({
          statusEffects: { ...DEFAULT_STATUS_EFFECTS, bleed: 2 },
        });

        const updated = applyStatus(combatant, 'bleed', 3);

        expect(updated.statusEffects.bleed).toBe(5); // 2 + 3 = 5
      });
    });
  });
});
