# Contract: Fast Travel via Rail Waypoints

**Feature**: 002-qol-balance-batch
**Component**: Fast Travel
**Priority**: P2

## Overview

Players who have discovered 2+ Rail Waypoints (L8 POIs) can teleport between them instantly without consuming time.

## Interface Contract

### Fast Travel State

```typescript
// src/game/engine/types.ts

/**
 * Fast travel selection state.
 * null = fast travel not active
 */
export type FastTravelState = {
  /** Whether selection UI is active */
  active: boolean;
  /** Currently selected waypoint index */
  selectedIndex: number;
} | null;
```

### Game Reducer Actions

```typescript
// src/game/engine/game-reducer.ts

/**
 * ACTIVATE_FAST_TRAVEL action
 *
 * Preconditions:
 * - phase === GamePhase.Exploration
 * - discoveredWaypoints.length >= 2
 *
 * Postconditions:
 * - fastTravel.active = true
 * - fastTravel.selectedIndex = 0 (first waypoint that isn't current position)
 */
type ActivateFastTravelAction = { type: 'ACTIVATE_FAST_TRAVEL' };

/**
 * CYCLE_FAST_TRAVEL action
 *
 * Preconditions:
 * - fastTravel !== null && fastTravel.active
 *
 * Postconditions:
 * - fastTravel.selectedIndex = (selectedIndex + 1) % waypointCount
 */
type CycleFastTravelAction = { type: 'CYCLE_FAST_TRAVEL' };

/**
 * CONFIRM_FAST_TRAVEL action
 *
 * Preconditions:
 * - fastTravel !== null && fastTravel.active
 * - selectedIndex is valid
 *
 * Postconditions:
 * - player.position = selectedWaypoint.position
 * - fastTravel = null
 * - time unchanged (no cost)
 * - fog unchanged (no reveal from teleport path)
 */
type ConfirmFastTravelAction = { type: 'CONFIRM_FAST_TRAVEL' };

/**
 * CANCEL_FAST_TRAVEL action
 *
 * Preconditions:
 * - fastTravel !== null
 *
 * Postconditions:
 * - fastTravel = null
 * - player.position unchanged
 */
type CancelFastTravelAction = { type: 'CANCEL_FAST_TRAVEL' };
```

### Helper Functions

```typescript
// src/game/entities/pois.ts

/**
 * Get all discovered Rail Waypoints from map.
 *
 * @param map - Current game map
 * @returns Array of discovered L8 POIs, sorted by discovery order
 */
export function getDiscoveredWaypoints(map: GameMap): MapPOI[];

/**
 * Check if fast travel is available.
 *
 * @param map - Current game map
 * @returns true if 2+ waypoints discovered
 */
export function canFastTravel(map: GameMap): boolean;

/**
 * Get waypoint at specific index.
 *
 * @param map - Current game map
 * @param index - Index into discovered waypoints
 * @returns POI at index, or null if invalid
 */
export function getWaypointAtIndex(map: GameMap, index: number): MapPOI | null;
```

## UI Contract

### Fast Travel Button

```typescript
// src/components/game/FastTravelButton.tsx

interface FastTravelButtonProps {
  /** Whether fast travel is available */
  available: boolean;
  /** Number of discovered waypoints */
  waypointCount: number;
  /** Handler for button tap */
  onPress: () => void;
}

/**
 * Fast travel activation button.
 *
 * Placement: Bottom-right of game screen (near D-pad)
 * Icon: 🚃 or rail/train icon
 *
 * States:
 * - available=false: Grayed out, shows "1/2" waypoint count
 * - available=true: Active color, shows waypoint count
 */
```

### Waypoint Selection UI

```typescript
// src/components/game/FastTravelOverlay.tsx

interface FastTravelOverlayProps {
  /** Discovered waypoints */
  waypoints: MapPOI[];
  /** Currently selected index */
  selectedIndex: number;
  /** Player's current position (to exclude from options) */
  currentPosition: Position;
  /** Handlers */
  onCycle: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Overlay showing fast travel selection.
 *
 * Display:
 * - Map with all discovered waypoints highlighted
 * - Selected waypoint with pulsing indicator
 * - "Tap to cycle, hold to travel" instruction
 *
 * Controls:
 * - Tap anywhere: Cycle to next waypoint
 * - Long press/hold: Confirm and teleport
 * - Back button/swipe: Cancel
 */
```

### Map Waypoint Highlights

```typescript
// src/components/game/GameCanvas.tsx

/**
 * When fast travel is active:
 * - Highlight all discovered L8 POIs with rail icon overlay
 * - Selected waypoint has pulsing selection indicator
 * - Player's current waypoint (if any) shown but not selectable
 */
```

## Behavior Specification

### State Machine

```
                                    [2+ waypoints]
        ┌────────┐  activate    ┌──────────────────┐
        │  IDLE  │ ───────────► │     SELECTING    │
        └────────┘              └──────────────────┘
             ▲                          │ │ │
             │                          │ │ │
             │      cancel              │ │ │ cycle
             │◄─────────────────────────┘ │ │
             │                            │ │
             │      confirm               │ │
             │◄───────────────────────────┘ │
             │      (teleport)              │
             │                              │
             │                              ▼
             │                    ┌──────────────────┐
             └────────────────────│  SELECTING       │
                   cycle loops    │  (next waypoint) │
                                  └──────────────────┘
```

### Zero-Cost Guarantee

```typescript
/**
 * CRITICAL: Fast travel MUST NOT consume time or trigger events.
 *
 * After CONFIRM_FAST_TRAVEL:
 * - time.movesRemaining unchanged
 * - No enemy encounters (teleport, not walk)
 * - No fog reveals (only destination tile visible)
 * - No POI triggers (except landing on waypoint)
 */
```

### Edge Cases

1. **Only 1 waypoint**: Fast travel button disabled
2. **All waypoints same as current position**: Invalid state (only one L8 per tile)
3. **Waypoint destroyed**: Cannot happen (POIs permanent)
4. **Fast travel during night**: Allowed (enemies don't move during teleport)
5. **Cancel via back**: Same as explicit cancel

## Test Cases

```typescript
describe('Fast Travel', () => {
  describe('Availability', () => {
    it('requires 2+ discovered waypoints', () => {
      const mapWith1 = createMapWithWaypoints(1);
      expect(canFastTravel(mapWith1)).toBe(false);

      const mapWith2 = createMapWithWaypoints(2);
      expect(canFastTravel(mapWith2)).toBe(true);
    });

    it('only counts discovered waypoints', () => {
      const map = createMapWithWaypoints(3, { discovered: [true, false, true] });
      const discovered = getDiscoveredWaypoints(map);
      expect(discovered.length).toBe(2);
    });
  });

  describe('Teleportation', () => {
    it('moves player to selected waypoint position', () => {
      const state = createStateWithWaypoints([
        { x: 5, y: 5 },
        { x: 20, y: 20 },
      ]);

      let result = gameReducer(state, { type: 'ACTIVATE_FAST_TRAVEL' });
      result = gameReducer(result, { type: 'CONFIRM_FAST_TRAVEL' });

      expect(result.player.position).toEqual({ x: 20, y: 20 });
    });

    it('does not consume time', () => {
      const state = createStateWithWaypoints([
        { x: 5, y: 5 },
        { x: 20, y: 20 },
      ], { movesRemaining: 30 });

      let result = gameReducer(state, { type: 'ACTIVATE_FAST_TRAVEL' });
      result = gameReducer(result, { type: 'CONFIRM_FAST_TRAVEL' });

      expect(result.time.movesRemaining).toBe(30);
    });

    it('does not trigger enemy encounters', () => {
      const state = createStateWithWaypoints([
        { x: 5, y: 5 },
        { x: 20, y: 20 },
      ]);
      // Place enemy at destination
      state.map.enemies.push(createEnemy({ x: 20, y: 20 }));

      let result = gameReducer(state, { type: 'ACTIVATE_FAST_TRAVEL' });
      result = gameReducer(result, { type: 'CONFIRM_FAST_TRAVEL' });

      expect(result.phase).toBe(GamePhase.Exploration);
      // Player shares tile with enemy but no combat (waypoints are safe zones)
    });
  });

  describe('Cycling', () => {
    it('cycles through all discovered waypoints', () => {
      const state = createStateWithWaypoints([
        { x: 5, y: 5 },
        { x: 10, y: 10 },
        { x: 15, y: 15 },
      ]);

      let result = gameReducer(state, { type: 'ACTIVATE_FAST_TRAVEL' });
      expect(result.fastTravel?.selectedIndex).toBe(0);

      result = gameReducer(result, { type: 'CYCLE_FAST_TRAVEL' });
      expect(result.fastTravel?.selectedIndex).toBe(1);

      result = gameReducer(result, { type: 'CYCLE_FAST_TRAVEL' });
      expect(result.fastTravel?.selectedIndex).toBe(2);

      result = gameReducer(result, { type: 'CYCLE_FAST_TRAVEL' });
      expect(result.fastTravel?.selectedIndex).toBe(0); // Wrap around
    });
  });
});
```
