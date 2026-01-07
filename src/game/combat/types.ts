/**
 * Combat types for PvE Dungeon Crawler
 * Re-exports from engine/types.ts with additional combat-specific types
 * @see specs/001-pve-dungeon-crawler/data-model.md
 */

// Re-export combat types from engine
export {
  CombatPhase,
  CombatState,
  CombatantState,
  CombatResult,
  CombatLogEntry,
  CombatAction,
  CombatActionResult,
  EffectTiming,
} from '../engine/types';

export type { StatusEffects } from '../engine/types';

// ============================================================================
// Effect Context (combat-specific additions)
// ============================================================================

import type { CombatState as CombatStateType, EffectTiming as EffectTimingType } from '../engine/types';

export interface EffectContext {
  source: 'player' | 'enemy';
  target: 'player' | 'enemy';
  timing: EffectTimingType;
}

export interface Effect {
  id: string;
  source: 'item' | 'trait' | 'itemset' | 'status';
  sourceId: string;
  timing: EffectTimingType;
  execute: (state: CombatStateType, context: EffectContext) => CombatStateType;
}
