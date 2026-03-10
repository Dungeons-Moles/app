import { formatFloatingNumberText } from './damage-number-format';
import type { DamageNumber } from '../../contexts/CombatContext';

function buildNumber(overrides: Partial<DamageNumber>): DamageNumber {
  return {
    id: 'test',
    value: 1,
    type: 'stat',
    target: 'enemy',
    timestamp: 0,
    ...overrides,
  };
}

describe('formatFloatingNumberText', () => {
  it('renders positive stat deltas with a plus sign', () => {
    expect(
      formatFloatingNumberText(buildNumber({ value: 1, statType: 'SPD' }))
    ).toBe('+1');
  });

  it('renders negative stat deltas as down labels', () => {
    expect(
      formatFloatingNumberText(buildNumber({ value: -1, statType: 'SPD' }))
    ).toBe('-1');
    expect(
      formatFloatingNumberText(buildNumber({ value: -2, statType: 'ATK' }))
    ).toBe('-2');
    expect(
      formatFloatingNumberText(buildNumber({ value: -3, statType: 'ARM' }))
    ).toBe('-3');
    expect(
      formatFloatingNumberText(buildNumber({ value: -4, statType: 'DIG' }))
    ).toBe('-4');
  });
});
