/**
 * T075: CombatResult component - alias for VictoryDefeatDisplay
 * T076: Gold reward animation support
 * @see specs/002-qol-balance-batch/contracts/gold-rewards.md
 *
 * Re-exports VictoryDefeatDisplay as CombatResult for API compatibility
 * with the contract specification while maintaining backward compatibility.
 */

export { VictoryDefeatDisplay as CombatResult } from './VictoryDefeatDisplay';
export type { VictoryDefeatDisplayProps as CombatResultProps } from './VictoryDefeatDisplay';
