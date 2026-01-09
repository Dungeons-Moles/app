# Contract: Wall Break Mechanic

**Feature**: 002-qol-balance-batch
**Component**: DIG Wall-Break
**Priority**: P2

## Overview

Players with DIG stat can break wall tiles using a double-tap interaction. First tap highlights the wall and shows cost, second tap executes the break.

## Interface Contract

### Wall Break Cost Calculation

```typescript
// src/game/map/wall-break.ts

/**
 * Calculate the move cost to break a wall.
 *
 * @param dig - Player's current DIG stat
 * @returns Move cost (1-3), or null if wall cannot be broken
 *
 * @example
 * calculateWallBreakCost(0) // => null (cannot break)
 * calculateWallBreakCost(1) // => 3
 * calculateWallBreakCost(2) // => 2
 * calculateWallBreakCost(3) // => 1
 * calculateWallBreakCost(4) // => 1 (minimum)
 */
export function calculateWallBreakCost(dig: number): number | null;

/**
 * Check if a wall can be broken at the given position.
 *
 * @param map - Current game map
 * @param position - Target wall position
 * @returns true if tile is a wall and not at map perimeter
 */
export function canBreakWall(map: GameMap, position: Position): boolean;

/**
 * Execute wall break, converting wall to floor.
 *
 * @param map - Current game map
 * @param position - Wall position to break
 * @returns New map with wall converted to floor
 */
export function breakWall(map: GameMap, position: Position): GameMap;
```

### Game Reducer Actions

```typescript
// src/game/engine/game-reducer.ts

/**
 * HIGHLIGHT_WALL action - First tap toward a wall
 *
 * Preconditions:
 * - phase === GamePhase.Exploration
 * - wallHighlight === null
 * - Target tile is TileType.Wall
 * - Player DIG >= 1
 * - Wall is not at map perimeter
 *
 * Postconditions:
 * - wallHighlight set with targetPosition, direction, cost
 */
type HighlightWallAction = {
  type: 'HIGHLIGHT_WALL';
  direction: Direction;
  targetPosition: Position;
  cost: number;
};

/**
 * BREAK_WALL action - Second tap same direction
 *
 * Preconditions:
 * - phase === GamePhase.Exploration
 * - wallHighlight !== null
 * - Player has enough moves remaining (>= wallHighlight.cost)
 *
 * Postconditions:
 * - Wall tile converted to Floor
 * - time.movesRemaining reduced by cost
 * - wallHighlight cleared to null
 * - Fog of war updated for new visibility
 */
type BreakWallAction = { type: 'BREAK_WALL' };

/**
 * CANCEL_WALL_HIGHLIGHT action - Any other action
 *
 * Preconditions:
 * - wallHighlight !== null
 *
 * Postconditions:
 * - wallHighlight cleared to null
 */
type CancelWallHighlightAction = { type: 'CANCEL_WALL_HIGHLIGHT' };
```

### Input Handler Integration

```typescript
// src/game/input/handler.ts

/**
 * Handle directional input with wall break awareness.
 *
 * Logic:
 * 1. If wallHighlight is null and direction leads to wall with DIG >= 1:
 *    - Dispatch HIGHLIGHT_WALL
 * 2. If wallHighlight exists and direction matches wallHighlight.direction:
 *    - Dispatch BREAK_WALL
 * 3. If wallHighlight exists and direction differs:
 *    - Dispatch CANCEL_WALL_HIGHLIGHT, then normal MOVE
 * 4. Otherwise:
 *    - Normal MOVE handling
 */
```

## UI Contract

### Wall Highlight Overlay

```typescript
// src/components/game/WallHighlight.tsx

interface WallHighlightProps {
  /** Position of highlighted wall tile */
  position: Position;
  /** Move cost to break */
  cost: number;
  /** Tile size for positioning */
  tileSize: number;
}

/**
 * Visual indicator for wall break target.
 * - Pulsing border/glow animation on target tile
 * - Cost badge showing move cost (e.g., "3 moves")
 */
```

### Cannot Break Feedback

```typescript
// src/components/game/CannotBreakFeedback.tsx

/**
 * Toast/overlay shown when player with 0 DIG taps toward wall.
 * Message: "Requires DIG to break walls"
 * Duration: 2 seconds
 */
```

### Not Enough Moves Feedback

```typescript
/**
 * Toast shown when player tries to break wall with insufficient moves.
 * Message: "Not enough moves (need X)"
 * Duration: 2 seconds
 */
```

## Behavior Specification

### State Machine

```
           ┌─────────────────────────────────────────┐
           │                                         │
           ▼                                         │
        ┌──────┐   tap wall (DIG>=1)   ┌────────────┴───┐
        │ IDLE │ ───────────────────►  │  HIGHLIGHTING  │
        └──────┘                       └────────────────┘
           ▲                                  │
           │                                  │
           │  tap other direction             │ tap same direction
           │  OR any other action             │
           │                                  ▼
           │                           ┌──────────────┐
           └───────────────────────────│ BREAK WALL   │
                                       └──────────────┘
```

### Edge Cases

1. **DIG = 0**: First tap shows feedback message, no highlight
2. **DIG >= 4**: Cost is always 1 (minimum)
3. **Perimeter walls**: Cannot be broken (would expose out-of-bounds)
4. **Insufficient moves**: Break action blocked with feedback
5. **Combat interruption**: If enemy moves to player during night, highlight cleared

## Test Cases

```typescript
describe('Wall Break Cost', () => {
  it('returns null for DIG 0', () => {
    expect(calculateWallBreakCost(0)).toBeNull();
  });

  it('returns 3 for DIG 1', () => {
    expect(calculateWallBreakCost(1)).toBe(3);
  });

  it('returns 2 for DIG 2', () => {
    expect(calculateWallBreakCost(2)).toBe(2);
  });

  it('returns 1 for DIG 3', () => {
    expect(calculateWallBreakCost(3)).toBe(1);
  });

  it('returns 1 for DIG 4+ (minimum)', () => {
    expect(calculateWallBreakCost(4)).toBe(1);
    expect(calculateWallBreakCost(10)).toBe(1);
  });
});

describe('Wall Break Execution', () => {
  it('converts wall to floor', () => {
    const map = createTestMap({ wall: { x: 5, y: 5 } });
    const result = breakWall(map, { x: 5, y: 5 });
    expect(result.tiles[5][5]).toBe(TileType.Floor);
  });

  it('deducts move cost from time', () => {
    const state = createTestState({ dig: 2, movesRemaining: 10 });
    const result = gameReducer(state, { type: 'BREAK_WALL' });
    expect(result.time.movesRemaining).toBe(8); // 10 - 2
  });

  it('cannot break perimeter walls', () => {
    const map = createTestMap({ width: 20, height: 20 });
    expect(canBreakWall(map, { x: 0, y: 5 })).toBe(false);
    expect(canBreakWall(map, { x: 19, y: 5 })).toBe(false);
  });
});
```
