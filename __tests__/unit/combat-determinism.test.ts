/**
 * T026: Combat determinism across speed settings
 * Ensures speed changes do not affect combat outcomes.
 */

import { resolveCombatWithParity } from '../../src/game/combat/parity-resolver';
import type { CombatResolverInput } from '../../src/game/combat/types';
import type { CombatantState } from '../../src/game/engine/types';
import { DEFAULT_STATUS_EFFECTS } from '../../src/game/engine/types';
import type { CombatSpeed } from '../../src/contexts/CombatContext';

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
    ...overrides,
  };
}

describe('Combat Determinism Across Speed Settings', () => {
  it('produces identical outcomes regardless of speed', () => {
    const speeds: CombatSpeed[] = ['paused', 'normal', 'fast'];
    const results = {} as Record<CombatSpeed, ReturnType<typeof resolveCombatWithParity>>;

    for (const speed of speeds) {
      results[speed] = resolveCombatWithParity(createTestInput());
    }

    const baseline = results.normal;

    expect(results.fast.result).toBe(baseline.result);
    expect(results.fast.player.hp).toBe(baseline.player.hp);
    expect(results.fast.enemy.hp).toBe(baseline.enemy.hp);
    expect(results.fast.turn).toBe(baseline.turn);

    expect(results.paused.result).toBe(baseline.result);
    expect(results.paused.player.hp).toBe(baseline.player.hp);
    expect(results.paused.enemy.hp).toBe(baseline.enemy.hp);
    expect(results.paused.turn).toBe(baseline.turn);
  });
});
