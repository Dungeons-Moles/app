# Contract: Map Overview Mode

**Feature**: 002-qol-balance-batch
**Component**: Map Overview Mode
**Priority**: P1

## Overview

Players can toggle a zoomed-out, pannable map view to see discovered areas and plan routes. Overview mode is view-only; no game state changes occur.

## Interface Contract

### Overview Mode State

```typescript
// src/contexts/GameContext.tsx

/**
 * Camera state for map overview mode.
 * Stored in UI context (not GameState) to preserve determinism.
 */
export interface OverviewModeState {
  /** Whether overview mode is currently active */
  active: boolean;
  /** Camera offset from player-centered position (in tile units) */
  offset: { x: number; y: number };
  /** Zoom level (1.0 = normal, 0.5 = zoomed out 2x) */
  zoom: number;
}

/**
 * Default overview state.
 */
export const DEFAULT_OVERVIEW_STATE: OverviewModeState = {
  active: false,
  offset: { x: 0, y: 0 },
  zoom: 1.0,
};

/**
 * Overview mode configuration.
 */
export const OVERVIEW_CONFIG = {
  /** Zoom level when overview is active */
  activeZoom: 0.5,
  /** Maximum pan distance from player (in tiles) */
  maxPanDistance: 50,
} as const;
```

### Context Methods

```typescript
// src/contexts/GameContext.tsx

interface GameContextValue {
  // ... existing values ...

  /** Current overview mode state */
  overviewMode: OverviewModeState;

  /** Toggle overview mode on/off */
  toggleOverviewMode: () => void;

  /** Pan the overview camera */
  panOverview: (delta: { x: number; y: number }) => void;

  /** Reset overview to player-centered */
  resetOverviewCamera: () => void;
}
```

### Canvas Transform Hook

```typescript
// src/hooks/useCanvasTransform.ts

interface UseCanvasTransformOptions {
  /** Player position in tile coordinates */
  playerPosition: Position;
  /** Overview mode state */
  overviewMode: OverviewModeState;
  /** Canvas dimensions */
  canvasSize: { width: number; height: number };
  /** Tile size in pixels */
  tileSize: number;
}

/**
 * Calculate Skia canvas transform matrix for current view state.
 *
 * @returns Transform matrix and pan gesture handler
 */
export function useCanvasTransform(options: UseCanvasTransformOptions): {
  /** Skia transform matrix */
  transform: SkMatrix;
  /** Gesture handler for pan (active only in overview mode) */
  panGesture: GestureType;
};
```

## UI Contract

### Map Overview Toggle

```typescript
// src/components/game/TopBar.tsx

/**
 * TopBar modifications:
 *
 * Add map icon to the LEFT of the day/night progress bar.
 *
 * Icon: 🗺️ or custom map icon
 * Behavior: Tap toggles overview mode
 * Visual: Icon highlighted when overview active
 */
```

### Overview Mode Visual Changes

```typescript
// src/components/game/GameCanvas.tsx

/**
 * GameCanvas behavior in overview mode:
 *
 * 1. Apply zoom transform (0.5x scale)
 * 2. Apply pan offset transform
 * 3. Show semi-transparent overlay on unexplored areas
 * 4. Disable all tap handlers for game tiles
 * 5. Enable pan gesture for camera movement
 *
 * Visual indicator: Subtle border or overlay showing "Overview Mode"
 */
```

### Input Blocking

```typescript
// src/hooks/useInput.ts

/**
 * Input handler modifications:
 *
 * When overviewMode.active === true:
 * - Block all directional inputs (no MOVE dispatched)
 * - Block POI interactions
 * - Block combat triggers
 * - Allow only: overview toggle, pan gestures
 */
```

## Behavior Specification

### State Machine

```
                    tap map icon
        ┌────────┐ ────────────► ┌──────────────┐
        │ NORMAL │               │   OVERVIEW   │
        └────────┘ ◄──────────── └──────────────┘
                    tap map icon
                    OR tap any game tile
                    OR any game input attempt
```

### State Isolation Guarantee

```typescript
/**
 * CRITICAL: Overview mode MUST NOT affect GameState.
 *
 * The following MUST remain unchanged while overview is active:
 * - player.position
 * - time.movesRemaining
 * - map.fog[][]
 * - map.enemies[]
 * - map.pois[]
 * - All other GameState properties
 *
 * Only UI context state (OverviewModeState) changes.
 */
```

### Edge Cases

1. **Phase transition during overview**: Exit overview, apply transition
2. **Combat trigger attempt**: Blocked, show feedback
3. **Night enemy movement**: Still occurs (game state independent)
4. **Pan beyond map bounds**: Clamp to map edges
5. **Very large maps**: Zoom maintains performance (same tile count rendered)

## Test Cases

```typescript
describe('Map Overview Mode', () => {
  describe('State Isolation', () => {
    it('does not change player position', () => {
      const initialState = createTestState();
      const { result } = renderHook(() => useGame());

      result.current.toggleOverviewMode();
      result.current.panOverview({ x: 10, y: 10 });

      expect(result.current.state.player.position).toEqual(
        initialState.player.position
      );
    });

    it('does not consume time', () => {
      const initialState = createTestState({ movesRemaining: 50 });
      const { result } = renderHook(() => useGame());

      result.current.toggleOverviewMode();
      // Simulate panning around
      result.current.panOverview({ x: 5, y: 5 });
      result.current.panOverview({ x: -3, y: 2 });

      expect(result.current.state.time.movesRemaining).toBe(50);
    });

    it('does not reveal fog', () => {
      const initialState = createTestState();
      const initialFog = JSON.stringify(initialState.map.fog);
      const { result } = renderHook(() => useGame());

      result.current.toggleOverviewMode();
      result.current.panOverview({ x: 20, y: 20 });

      expect(JSON.stringify(result.current.state.map.fog)).toBe(initialFog);
    });
  });

  describe('Input Blocking', () => {
    it('blocks movement while overview active', () => {
      const { result } = renderHook(() => useGame());
      const initialPosition = { ...result.current.state.player.position };

      result.current.toggleOverviewMode();
      result.current.dispatch({ type: 'MOVE', direction: Direction.Up });

      expect(result.current.state.player.position).toEqual(initialPosition);
    });

    it('allows toggle to exit overview', () => {
      const { result } = renderHook(() => useGame());

      result.current.toggleOverviewMode();
      expect(result.current.overviewMode.active).toBe(true);

      result.current.toggleOverviewMode();
      expect(result.current.overviewMode.active).toBe(false);
    });
  });

  describe('Camera Reset', () => {
    it('centers on player when exiting overview', () => {
      const { result } = renderHook(() => useGame());

      result.current.toggleOverviewMode();
      result.current.panOverview({ x: 30, y: 30 });
      result.current.toggleOverviewMode();

      expect(result.current.overviewMode.offset).toEqual({ x: 0, y: 0 });
    });
  });
});
```

## Performance Considerations

- Zoom uses Skia matrix transform (GPU accelerated)
- Same number of tiles rendered regardless of zoom
- Pan gestures use `react-native-gesture-handler` for 60fps
- No GameState re-renders during pan operations
