/**
 * T069, T070: Gold reward calculation and determinism tests.
 */

import { calculateGoldReward } from '../../src/game/entities/enemies';
import { createCombatState, type CombatResolverInput } from '../../src/game/combat/resolver';
import type { CombatantState } from '../../src/game/engine/types';
import { DEFAULT_STATUS_EFFECTS } from '../../src/game/engine/types';
import type { EnemyId } from '../../src/game/map/types';

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

function createTestInput(overrides: Partial<CombatResolverInput> = {}): CombatResolverInput {
  return {
    player: createTestCombatant({
      name: 'Player',
      emoji: '🦦',
      isPlayer: true,
      hp: 20,
      maxHp: 20,
      atk: 6,
      arm: 2,
      spd: 3,
    }),
    enemy: createTestCombatant({
      name: 'Tunnel Rat',
      emoji: '🐀',
      hp: 12,
      maxHp: 12,
      atk: 4,
      arm: 1,
      spd: 2,
    }),
    seed: 24680,
    enemyDefinitionId: 'TUNNEL_RAT',
    enemyTier: 1,
    playerGold: 0,
    ...overrides,
  };
}

describe('Enemy Gold Rewards', () => {
  describe('Reward Calculation', () => {
    describe('BASIC enemies (base 1)', () => {
      const basicEnemies: EnemyId[] = [
        'TUNNEL_RAT',
        'CAVE_BAT',
        'SPORE_SLIME',
        'RUST_MITE_SWARM',
      ];

      basicEnemies.forEach((enemyId) => {
        it(`${enemyId} T1 = 1 gold`, () => {
          expect(calculateGoldReward(enemyId, 1)).toBe(1);
        });

        it(`${enemyId} T2 = 2 gold`, () => {
          expect(calculateGoldReward(enemyId, 2)).toBe(2);
        });

        it(`${enemyId} T3 = 3 gold`, () => {
          expect(calculateGoldReward(enemyId, 3)).toBe(3);
        });
      });
    });

    describe('MID enemies (base 2)', () => {
      const midEnemies: EnemyId[] = ['COLLAPSED_MINER', 'SHARD_BEETLE'];

      midEnemies.forEach((enemyId) => {
        it(`${enemyId} T1 = 2 gold`, () => {
          expect(calculateGoldReward(enemyId, 1)).toBe(2);
        });

        it(`${enemyId} T2 = 3 gold`, () => {
          expect(calculateGoldReward(enemyId, 2)).toBe(3);
        });

        it(`${enemyId} T3 = 4 gold`, () => {
          expect(calculateGoldReward(enemyId, 3)).toBe(4);
        });
      });
    });

    describe('STRONG enemies (base 3)', () => {
      const strongEnemies: EnemyId[] = ['TUNNEL_WARDEN', 'BURROW_AMBUSHER'];

      strongEnemies.forEach((enemyId) => {
        it(`${enemyId} T1 = 3 gold`, () => {
          expect(calculateGoldReward(enemyId, 1)).toBe(3);
        });

        it(`${enemyId} T2 = 4 gold`, () => {
          expect(calculateGoldReward(enemyId, 2)).toBe(4);
        });

        it(`${enemyId} T3 = 5 gold`, () => {
          expect(calculateGoldReward(enemyId, 3)).toBe(5);
        });
      });
    });
  });

  describe('Determinism', () => {
    it('produces same reward for same enemy/tier', () => {
      const reward1 = calculateGoldReward('CAVE_BAT', 2);
      const reward2 = calculateGoldReward('CAVE_BAT', 2);
      expect(reward1).toBe(reward2);
    });

    it('reward is independent of combat seed', () => {
      const baseInput = createTestInput({
        enemyDefinitionId: 'SPORE_SLIME',
        enemyTier: 1,
      });

      const combat1 = createCombatState({ ...baseInput, seed: 11111 });
      const combat2 = createCombatState({ ...baseInput, seed: 99999 });

      expect(combat1.goldReward).toBe(combat2.goldReward);
    });
  });
});
