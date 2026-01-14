/**
 * Gold reward calculation and determinism tests.
 * Updated to match GDD Section 11: T1=2, T2=4, T3=6 for all enemies
 * @see docs/gdd.md Section 11: Field Enemies
 */

import { calculateGoldReward, TIER_GOLD_REWARDS } from '../../src/game/entities/enemies';
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
  describe('Tier Gold Constants', () => {
    it('T1 = 2 gold', () => {
      expect(TIER_GOLD_REWARDS[1]).toBe(2);
    });

    it('T2 = 4 gold', () => {
      expect(TIER_GOLD_REWARDS[2]).toBe(4);
    });

    it('T3 = 6 gold', () => {
      expect(TIER_GOLD_REWARDS[3]).toBe(6);
    });
  });

  describe('Reward Calculation (GDD: T1=2, T2=4, T3=6 for all enemies)', () => {
    // All 12 enemy types should follow the same reward pattern
    const allEnemies: EnemyId[] = [
      'TUNNEL_RAT',
      'CAVE_BAT',
      'SPORE_SLIME',
      'RUST_MITE_SWARM',
      'COLLAPSED_MINER',
      'SHARD_BEETLE',
      'TUNNEL_WARDEN',
      'BURROW_AMBUSHER',
      'FROST_WISP',
      'POWDER_TICK',
      'COIN_SLUG',
      'BLOOD_MOSQUITO',
    ];

    allEnemies.forEach((enemyId) => {
      describe(enemyId, () => {
        it('T1 = 2 gold', () => {
          expect(calculateGoldReward(enemyId, 1)).toBe(2);
        });

        it('T2 = 4 gold', () => {
          expect(calculateGoldReward(enemyId, 2)).toBe(4);
        });

        it('T3 = 6 gold', () => {
          expect(calculateGoldReward(enemyId, 3)).toBe(6);
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
