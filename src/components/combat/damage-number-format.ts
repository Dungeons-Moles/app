import type { DamageNumber } from '../../contexts/CombatContext';

export function formatFloatingNumberText(number: DamageNumber): string {
  if (number.type === 'gold') return `-${number.value}`;
  if (number.type === 'goldGain') return `+${number.value}`;
  if (number.type === 'split') return '';
  if (number.type === 'stat') {
    return `${number.value > 0 ? '+' : ''}${number.value}`;
  }
  const prefix = number.type === 'heal' || number.type === 'status' ? '+' : '-';
  return `${prefix}${number.value}`;
}
