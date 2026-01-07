/**
 * Game Engine Module Exports
 * @see specs/001-pve-dungeon-crawler/contracts/game-engine.md
 *
 * Central export point for all game engine functionality:
 * - Types: All game state types and interfaces
 * - Constants: Game configuration values
 * - RNG: Seeded random number generator
 * - State Machine: (future) Game phase transitions
 * - Game Reducer: (future) State mutation logic
 */

// Types
export {
  // Game Phase
  GamePhase,
  // Position
  type Position,
  // Player
  type PlayerStats,
  type StatusEffects,
  DEFAULT_STATUS_EFFECTS,
  type ItemsetId,
  type ItemRarity,
  type ItemTag,
  type ItemStats,
  type ToolId,
  type GearId,
  type Tool,
  type Gear,
  type InventorySlot,
  type Player,
  // Time
  TimePhase,
  type BossId,
  type TimeState,
  // Combat
  type CombatState,
  type CombatantState,
  CombatPhase,
  type CombatResult,
  type EffectTiming,
  type CombatAction,
  type CombatActionResult,
  type CombatLogEntry,
  // POI
  type POIInteractionType,
  type POIInteraction,
  type POIOption,
  // Debug
  type DebugState,
  DEFAULT_DEBUG_STATE,
  // Root State
  type GameState,
} from './types';

// Constants
export {
  GAME_CONSTANTS,
  PHASE_MOVES,
  WEEK_PHASES,
  SIGHT_RADIUS,
  RARITY_MULTIPLIER,
  BOSS_POOLS,
} from './constants';

// RNG
export { SeededRNG } from './rng';

// State Machine (to be implemented)
// export { ... } from './state-machine';

// Game Reducer (to be implemented)
// export { ... } from './game-reducer';
