/**
 * Data Module Exports
 *
 * Central export point for all data definitions including:
 * - Combat types (TriggerType, EffectType, Condition)
 * - ID mapping (frontend <-> backend)
 * - Gear and Tool effects (aligned with Solana backend)
 */

// Combat type system (aligned with Solana backend)
export * from './combat-types';

// ID mapping between frontend and backend
export * from './id-mapping';

// Gear effects with tier scaling
export * from './gear-effects';

// Tool effects with tier scaling
export * from './tool-effects';

// Original gear definitions (display data)
export * from './gear';

// POI definitions
export * from './pois';

// Boss definitions
export * from './bosses';

// Itemset definitions
export * from './itemsets';
