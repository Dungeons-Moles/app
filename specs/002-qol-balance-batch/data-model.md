# Data Model: QoL and Balance Feature Batch

**Feature**: 002-qol-balance-batch
**Date**: 2026-01-09
**Status**: Complete

## New Types

### WallHighlightState

Tracks the double-tap wall break interaction state.

```typescript
// src/game/engine/types.ts

/**
 * State for wall break double-tap interaction.
 * null = no wall highlighted (IDLE state)
 * object = wall is highlighted awaiting second tap (HIGHLIGHTING state)
 */
export type WallHighlightState = {
  /** Position of the wall tile being targeted */
  targetPosition: Position;
  /** Direction player tapped to target this wall */
  direction: Direction;
  /** Calculated move cost to break this wall */
  cost: number;
} | null;
```

### FastTravelState

Tracks fast travel mode activation and selection.

```typescript
// src/game/engine/types.ts

/**
 * State for fast travel waypoint selection.
 * null = fast travel not active
 * object = fast travel mode active with selection
 */
export type FastTravelState = {
  /** Whether fast travel selection UI is active */
  active: boolean;
  /** Index into discovered waypoints array */
  selectedIndex: number;
} | null;
```

### CombatSpeedState

UI-only state for combat animation pacing.

```typescript
// src/contexts/CombatContext.tsx

/**
 * Combat animation speed setting.
 * Affects only visual playback, not game outcomes.
 */
export type CombatSpeed = 'paused' | 'normal' | 'fast';

/**
 * Speed multiplier for animation intervals.
 */
export const COMBAT_SPEED_MULTIPLIER: Record<CombatSpeed, number> = {
  paused: 0,    // No advancement
  normal: 1,    // Base interval (500ms)
  fast: 2,      // Half interval (250ms)
};
```

### OverviewModeState

UI-only state for map overview camera control.

```typescript
// src/contexts/GameContext.tsx

/**
 * Camera state for map overview mode.
 * Kept in UI context, not GameState (no effect on determinism).
 */
export interface OverviewModeState {
  /** Whether overview mode is active */
  active: boolean;
  /** Camera offset from player-centered position */
  offset: Position;
  /** Zoom level (1.0 = normal, 0.5 = zoomed out) */
  zoom: number;
}
```

## Extended Types

### GameState Extensions

```typescript
// src/game/engine/types.ts

export interface GameState {
  // ... existing fields ...

  /** Wall break double-tap state */
  wallHighlight: WallHighlightState;

  /** Fast travel selection state */
  fastTravel: FastTravelState;
}
```

### CombatState Extensions

```typescript
// src/game/engine/types.ts

export interface CombatState {
  // ... existing fields ...

  /** Gold reward for defeating this enemy */
  goldReward: number;

  /** Enemy definition ID (for gold calculation) */
  enemyDefinitionId: EnemyId;

  /** Enemy tier (for gold calculation) */
  enemyTier: 1 | 2 | 3;
}
```

## New Constants

### Wall Break Constants

```typescript
// src/game/engine/constants.ts

/**
 * Wall break cost calculation constants.
 * Formula: max(WALL_BREAK_MIN_COST, WALL_BREAK_BASE_COST - playerDig)
 */
export const WALL_BREAK_BASE_COST = 4;
export const WALL_BREAK_MIN_COST = 1;
export const WALL_BREAK_MIN_DIG = 1;

/**
 * Calculate wall break cost for given DIG stat.
 * @param dig - Player's DIG stat value
 * @returns Move cost to break wall, or null if DIG < minimum
 */
export function calculateWallBreakCost(dig: number): number | null {
  if (dig < WALL_BREAK_MIN_DIG) {
    return null; // Cannot break walls with 0 DIG
  }
  return Math.max(WALL_BREAK_MIN_COST, WALL_BREAK_BASE_COST - dig);
}
```

### Spawn Balance Constants

```typescript
// src/game/engine/constants.ts

/**
 * Spawn placement zone radiuses (Manhattan distance from spawn).
 */
export const SPAWN_PROTECTION_RADIUS = 5;  // Zone 0: T1 only
export const MID_ZONE_RADIUS = 10;         // Zone 1: T1 + T2

/**
 * Enemy tier weights by zone.
 * Index 0 = T1 weight, Index 1 = T2 weight, Index 2 = T3 weight
 */
export const ZONE_TIER_WEIGHTS: Record<number, [number, number, number]> = {
  0: [1.0, 0.0, 0.0],  // Zone 0: 100% T1
  1: [0.6, 0.4, 0.0],  // Zone 1: 60% T1, 40% T2
  2: [0.3, 0.4, 0.3],  // Zone 2: 30% T1, 40% T2, 30% T3
};

/**
 * Determine spawn zone for a position.
 * @param position - Candidate spawn position
 * @param spawnPosition - Player start position
 * @returns Zone number (0, 1, or 2)
 */
export function getSpawnZone(position: Position, spawnPosition: Position): number {
  const distance = Math.abs(position.x - spawnPosition.x) +
                   Math.abs(position.y - spawnPosition.y);
  if (distance <= SPAWN_PROTECTION_RADIUS) return 0;
  if (distance <= MID_ZONE_RADIUS) return 1;
  return 2;
}
```

### Gold Reward Constants

```typescript
// src/game/entities/enemies.ts

import type { EnemyId } from '../map/types';

/**
 * Enemy category for gold reward calculation.
 */
export type EnemyCategory = 'BASIC' | 'MID' | 'STRONG';

/**
 * Base gold reward by enemy category.
 * Final reward = baseGold + (tier - 1)
 */
export const ENEMY_CATEGORY_BASE_GOLD: Record<EnemyCategory, number> = {
  BASIC: 1,   // T1=1, T2=2, T3=3
  MID: 2,     // T1=2, T2=3, T3=4
  STRONG: 3,  // T1=3, T2=4, T3=5
};

/**
 * Enemy type to category mapping.
 */
export const ENEMY_CATEGORY: Record<EnemyId, EnemyCategory> = {
  TUNNEL_RAT: 'BASIC',
  CAVE_BAT: 'BASIC',
  SPORE_SLIME: 'BASIC',
  RUST_MITE_SWARM: 'BASIC',
  COLLAPSED_MINER: 'MID',
  SHARD_BEETLE: 'MID',
  TUNNEL_WARDEN: 'STRONG',
  BURROW_AMBUSHER: 'STRONG',
};

/**
 * Calculate gold reward for defeating an enemy.
 * @param enemyId - Enemy definition ID
 * @param tier - Enemy tier (1, 2, or 3)
 * @returns Gold amount to award
 */
export function calculateGoldReward(enemyId: EnemyId, tier: 1 | 2 | 3): number {
  const category = ENEMY_CATEGORY[enemyId];
  const baseGold = ENEMY_CATEGORY_BASE_GOLD[category];
  return baseGold + (tier - 1);
}
```

## New Actions

### Game Reducer Actions

```typescript
// src/game/engine/game-reducer.ts

export type GameAction =
  // ... existing actions ...

  // Wall break actions
  | { type: 'HIGHLIGHT_WALL'; direction: Direction; targetPosition: Position; cost: number }
  | { type: 'BREAK_WALL' }
  | { type: 'CANCEL_WALL_HIGHLIGHT' }

  // Fast travel actions
  | { type: 'ACTIVATE_FAST_TRAVEL' }
  | { type: 'CYCLE_FAST_TRAVEL' }
  | { type: 'CONFIRM_FAST_TRAVEL' }
  | { type: 'CANCEL_FAST_TRAVEL' };
```

## Entity Relationships

```
GameState
├── wallHighlight: WallHighlightState (nullable)
│   ├── targetPosition: Position
│   ├── direction: Direction
│   └── cost: number
├── fastTravel: FastTravelState (nullable)
│   ├── active: boolean
│   └── selectedIndex: number
└── combat: CombatState (nullable)
    ├── goldReward: number (new)
    ├── enemyDefinitionId: EnemyId (new)
    └── enemyTier: 1 | 2 | 3 (new)

UI Context (not in GameState)
├── overviewMode: OverviewModeState
│   ├── active: boolean
│   ├── offset: Position
│   └── zoom: number
└── combatSpeed: CombatSpeed ('paused' | 'normal' | 'fast')
```

## State Defaults

```typescript
// Initial state additions

const DEFAULT_WALL_HIGHLIGHT: WallHighlightState = null;
const DEFAULT_FAST_TRAVEL: FastTravelState = null;
const DEFAULT_OVERVIEW_MODE: OverviewModeState = {
  active: false,
  offset: { x: 0, y: 0 },
  zoom: 1.0,
};
const DEFAULT_COMBAT_SPEED: CombatSpeed = 'normal';
```

## Validation Rules

1. **WallHighlightState**: If non-null, `cost` must be >= `WALL_BREAK_MIN_COST` and `targetPosition` must be a valid wall tile.

2. **FastTravelState**: If active, `selectedIndex` must be valid index into discovered waypoints array (>= 0, < discovered count).

3. **CombatState.goldReward**: Must be positive integer (>= 1 for any enemy).

4. **OverviewModeState.zoom**: Must be in range (0, 1.0] (zoomed out, not zoomed in beyond normal).

5. **Spawn Zones**: No T2/T3 enemies may spawn in Zone 0. Validated by unit tests with statistical verification.
