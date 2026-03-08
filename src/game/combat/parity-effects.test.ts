import { getItemsetEffects } from '@/data/itemset-effects';
import { getBossTraitEffects, getFieldEnemyTraitEffects } from './parity-effects';

describe('parity effect definitions', () => {
  it('maps demolition permit to the on-chain turn-start effects', () => {
    const effects = getItemsetEffects('DEMOLITION_PERMIT');

    expect(effects).toHaveLength(2);
    expect(effects[0]).toMatchObject({
      trigger: { type: 'TurnStart' },
      effectType: 'ReduceAllCountdowns',
      value: 1,
    });
    expect(effects[1]).toMatchObject({
      trigger: { type: 'TurnStart' },
      effectType: 'ReduceNextBombSelfDamage',
      value: 2,
    });
  });

  it('maps tunnel warden to the on-chain turn-start armor removal trait', () => {
    const effects = getFieldEnemyTraitEffects('TUNNEL_WARDEN');

    expect(effects).toHaveLength(1);
    expect(effects[0].effect).toMatchObject({
      trigger: { type: 'TurnStart' },
      effectType: 'RemoveArmor',
      value: 1,
      oncePerTurn: true,
    });
  });

  it('maps greedkeeper to the on-chain gold-steal and armor conversion traits', () => {
    const effects = getBossTraitEffects('B-A-W2-05');

    expect(effects).toHaveLength(2);
    expect(effects[0].effect).toMatchObject({
      trigger: { type: 'BattleStart' },
      effectType: 'StealGold',
      value: 16,
    });
    expect(effects[1].effect).toMatchObject({
      trigger: { type: 'BattleStart' },
      effectType: 'GoldToArmor',
      value: 4,
    });
  });
});
