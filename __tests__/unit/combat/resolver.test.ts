/**
 * T044: Combat resolver determinism tests
 * Tests that combat resolution is fully deterministic given same inputs
 * @see specs/001-pve-dungeon-crawler/research.md R2
 * @see specs/001-pve-dungeon-crawler/spec.md FR-017, FR-053
 */

import {
  resolveCombat,
  createCombatState,
  type CombatResolverInput,
} from '../../../src/game/combat/resolver';
import type { CombatantState, CombatState } from '../../../src/game/engine/types';
import { DEFAULT_STATUS_EFFECTS, CombatPhase } from '../../../src/game/engine/types';
import { SeededRNG } from '../../../src/game/engine/rng';

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

// Helper to create test combat input
function createTestInput(overrides: Partial<CombatResolverInput> = {}): CombatResolverInput {
  return {
    player: createTestCombatant({
      name: 'Player',
      emoji: '🦦',
      isPlayer: true,
      hp: 20,
      maxHp: 20,
      atk: 5,
      arm: 2,
      spd: 3,
    }),
    enemy: createTestCombatant({
      name: 'Tunnel Rat',
      emoji: '🐀',
      hp: 10,
      maxHp: 10,
      atk: 3,
      arm: 0,
      spd: 2,
    }),
    seed: 12345,
    ...overrides,
  };
}

describe('Combat Resolver Determinism', () => {
  describe('resolveCombat determinism', () => {
    it('should produce identical results with same seed', () => {
      const input = createTestInput({ seed: 12345 });

      const result1 = resolveCombat(input);
      const result2 = resolveCombat(input);

      expect(result1.result).toBe(result2.result);
      expect(result1.player.hp).toBe(result2.player.hp);
      expect(result1.enemy.hp).toBe(result2.enemy.hp);
      expect(result1.turn).toBe(result2.turn);
      expect(result1.log).toEqual(result2.log);
    });

    it('should produce different results with different seeds', () => {
      // Use enemies with some randomness in their behavior
      const input1 = createTestInput({ seed: 11111 });
      const input2 = createTestInput({ seed: 99999 });

      const result1 = resolveCombat(input1);
      const result2 = resolveCombat(input2);

      // Results should be the same since basic combat is deterministic
      // (no random effects in basic test combatants)
      // But the rngState should differ
      expect(result1.rngState).not.toBe(result2.rngState);
    });

    it('should log RNG values used in each action for verification', () => {
      const input = createTestInput();
      const result = resolveCombat(input);

      // Each log entry should have rngValues array
      for (const entry of result.log) {
        expect(Array.isArray(entry.rngValues)).toBe(true);
      }
    });

    it('should be reproducible after 100 runs with same seed', () => {
      const input = createTestInput({ seed: 54321 });
      const firstResult = resolveCombat(input);

      for (let i = 0; i < 100; i++) {
        const result = resolveCombat(input);
        expect(result.result).toBe(firstResult.result);
        expect(result.player.hp).toBe(firstResult.player.hp);
        expect(result.enemy.hp).toBe(firstResult.enemy.hp);
        expect(result.turn).toBe(firstResult.turn);
      }
    });
  });

  describe('createCombatState', () => {
    it('should create initial combat state from input', () => {
      const input = createTestInput();
      const state = createCombatState(input);

      expect(state.player.name).toBe('Player');
      expect(state.enemy.name).toBe('Tunnel Rat');
      expect(state.turn).toBe(0);
      expect(state.phase).toBe(CombatPhase.BattleStart);
      expect(state.log).toEqual([]);
      expect(state.playerGold).toBe(0);
      expect(state.consumedGearIds).toEqual([]);
      expect(state.result).toBeNull();
    });

    it('should preserve player stats correctly', () => {
      const input = createTestInput({
        player: createTestCombatant({
          isPlayer: true,
          hp: 15,
          maxHp: 20,
          atk: 8,
          arm: 4,
          spd: 5,
          dig: 3,
        }),
      });

      const state = createCombatState(input);

      expect(state.player.hp).toBe(15);
      expect(state.player.maxHp).toBe(20);
      expect(state.player.atk).toBe(8);
      expect(state.player.arm).toBe(4);
      expect(state.player.spd).toBe(5);
      expect(state.player.dig).toBe(3);
    });

    it('should initialize RNG state from seed', () => {
      const input = createTestInput({ seed: 99999 });
      const state = createCombatState(input);

      expect(state.rngState).toBe(99999);
    });
  });

  describe('combat outcome consistency', () => {
    it('should always result in player victory when player has overwhelming stats', () => {
      const input = createTestInput({
        player: createTestCombatant({
          isPlayer: true,
          hp: 100,
          maxHp: 100,
          atk: 50,
          arm: 10,
          spd: 10,
        }),
        enemy: createTestCombatant({
          hp: 5,
          maxHp: 5,
          atk: 1,
          arm: 0,
          spd: 1,
        }),
      });

      // Run 10 times with different seeds
      for (let i = 0; i < 10; i++) {
        const result = resolveCombat({ ...input, seed: i * 1000 });
        expect(result.result).toBe('VICTORY');
      }
    });

    it('should always result in player defeat when enemy has overwhelming stats', () => {
      const input = createTestInput({
        player: createTestCombatant({
          isPlayer: true,
          hp: 5,
          maxHp: 5,
          atk: 1,
          arm: 0,
          spd: 1,
        }),
        enemy: createTestCombatant({
          hp: 100,
          maxHp: 100,
          atk: 50,
          arm: 10,
          spd: 10,
        }),
      });

      for (let i = 0; i < 10; i++) {
        const result = resolveCombat({ ...input, seed: i * 1000 });
        expect(result.result).toBe('DEFEAT');
      }
    });

    it('should resolve combat in finite turns', () => {
      const input = createTestInput();
      const result = resolveCombat(input);

      // Combat should not go on indefinitely
      expect(result.turn).toBeGreaterThan(0);
      expect(result.turn).toBeLessThan(200);
      expect(result.result).not.toBeNull();
    });
  });

  describe('RNG state tracking', () => {
    it('should update rngState during combat', () => {
      const input = createTestInput({ seed: 12345 });
      const state = createCombatState(input);
      const result = resolveCombat(input);

      // RNG state should have changed during combat
      expect(result.rngState).not.toBe(state.rngState);
    });

    it('should preserve rngState for replay verification', () => {
      const input = createTestInput({ seed: 12345 });
      const result = resolveCombat(input);

      // The final rngState should be deterministic
      const result2 = resolveCombat(input);
      expect(result.rngState).toBe(result2.rngState);
    });
  });

  describe('combat phase progression', () => {
    it('should end in BattleEnd phase', () => {
      const input = createTestInput();
      const result = resolveCombat(input);

      expect(result.phase).toBe(CombatPhase.BattleEnd);
    });
  });

});
