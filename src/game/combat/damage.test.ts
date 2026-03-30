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
  it('adds chill bonus to normal strike damage up to +3', () => {
    const attacker = makeCombatant({ atk: 1 });
    const defender = makeCombatant({
      hp: 10,
      statusEffects: { chill: 3, shrapnel: 0, rust: 0, bleed: 0 },
    });

    const result = calculateDamage(attacker, defender);

    expect(result.effectiveAtk).toBe(4);
    expect(result.hpDamage).toBe(4);
  });

  it('adds chill bonus to shrapnel retaliation up to +3', () => {
    const attacker = makeCombatant({
      statusEffects: { chill: 3, shrapnel: 0, rust: 0, bleed: 0 },
    });
    const defender = makeCombatant({
      statusEffects: { chill: 0, shrapnel: 3, rust: 0, bleed: 0 },
    });

    const result = calculateDamage(attacker, defender);

    // raw = 1 + 3 (chill) = 4, 50% = 2
    expect(result.shrapnelReflect).toBe(2);
  });

  it('adds chill bonus to bleed damage up to +3', () => {
    const target = makeCombatant({
      hp: 10,
      statusEffects: { chill: 3, shrapnel: 0, rust: 0, bleed: 2 },
    });

    const result = processBleedDamage(target);

    expect(result.damage).toBe(5);
    expect(result.combatant.hp).toBe(5);
  });
});
