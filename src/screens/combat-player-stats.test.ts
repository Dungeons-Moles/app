import { createGearInstance, createToolInstance } from '@/game/entities/items';
import { normalizeCombatPlayerStats } from './combat-player-stats';

describe('normalizeCombatPlayerStats', () => {
  it('hydrates missing baked combat stats from equipped items', () => {
    const tool = createToolInstance('T11');
    const gloves = createGearInstance('I10');
    const buckler = createGearInstance('I34');

    const normalized = normalizeCombatPlayerStats(
      {
        hp: 20,
        maxHp: 20,
        atk: 0,
        arm: 0,
        spd: 0,
        dig: 0,
        gold: 10,
      },
      [gloves, buckler],
      tool
    );

    expect(normalized.atk).toBe(2);
    expect(normalized.arm).toBe(8);
    expect(normalized.spd).toBe(0);
    expect(normalized.dig).toBe(1);
  });

  it('preserves higher authoritative runtime stats when they exceed item stats', () => {
    const tool = createToolInstance('T11');
    const gloves = createGearInstance('I10');

    const normalized = normalizeCombatPlayerStats(
      {
        hp: 18,
        maxHp: 20,
        atk: 4,
        arm: 2,
        spd: 3,
        dig: 1,
        gold: 5,
      },
      [gloves],
      tool
    );

    expect(normalized.atk).toBe(4);
    expect(normalized.arm).toBe(2);
    expect(normalized.spd).toBe(3);
    expect(normalized.dig).toBe(1);
  });

  it('hydrates battle-start stats that only exist in effect tables', () => {
    const tool = createToolInstance('T9');
    const lantern = createGearInstance('I33');
    const engine = createGearInstance('I46');

    const normalized = normalizeCombatPlayerStats(
      {
        hp: 25,
        maxHp: 25,
        atk: 0,
        arm: 0,
        spd: 0,
        dig: 0,
        gold: 10,
      },
      [lantern, engine],
      tool
    );

    expect(normalized.atk).toBe(2);
    expect(normalized.arm).toBe(4);
  });
});
