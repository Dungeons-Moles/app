import { calculateDamage } from '@/game/combat/damage';
import { processBleedDamage } from '@/game/combat/status-effects';
import type { CombatantState } from '@/game/engine/types';

function makeCombatant(overrides: Partial<CombatantState> = {}): CombatantState {
  return {
    name: 'Test',
    emoji: 'T',
    definitionId: 'test',
    isPlayer: true,
    maxHp: 20,
    hp: 20,
    atk: 1,
    arm: 0,
    spd: 0,
    dig: 0,
    bonusAtk: 0,
    bonusArm: 0,
    bonusSpd: 0,
    statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
    strikesPerTurn: 1,
    ignoresArmor: false,
    ...overrides,
  };
}

describe('damage helpers', () => {
  it('does not add chill to normal strike damage', () => {
    const attacker = makeCombatant({ atk: 1 });
    const defender = makeCombatant({
      hp: 10,
      statusEffects: { chill: 3, shrapnel: 0, rust: 0, bleed: 0 },
    });

    const result = calculateDamage(attacker, defender);

    expect(result.effectiveAtk).toBe(1);
    expect(result.hpDamage).toBe(1);
  });

  it('does not add chill to shrapnel retaliation', () => {
    const attacker = makeCombatant({
      statusEffects: { chill: 3, shrapnel: 0, rust: 0, bleed: 0 },
    });
    const defender = makeCombatant({
      statusEffects: { chill: 0, shrapnel: 3, rust: 0, bleed: 0 },
    });

    const result = calculateDamage(attacker, defender);

    expect(result.shrapnelReflect).toBe(3);
  });

  it('does not add chill to bleed damage', () => {
    const target = makeCombatant({
      hp: 10,
      statusEffects: { chill: 3, shrapnel: 0, rust: 0, bleed: 2 },
    });

    const result = processBleedDamage(target);

    expect(result.damage).toBe(2);
    expect(result.combatant.hp).toBe(8);
  });
});
