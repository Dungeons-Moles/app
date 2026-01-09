# Implementation Plan: QoL and Balance Feature Batch

**Branch**: `002-qol-balance-batch` | **Date**: 2026-01-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-qol-balance-batch/spec.md`

## Summary

This batch implements seven quality-of-life and balance improvements: map overview mode (view-only camera control), combat time controls (pause/normal/fast animation pacing), DIG-based wall breaking (double-tap interaction with cost calculation), enemy spawn balancing (protected radius and progressive difficulty), fast travel between discovered Rail Waypoints, simplified POI item selection UI (stat-focused display), and enemy gold rewards (tier-based gold drops). All features maintain deterministic game logic by separating simulation state from rendering/animation timing.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: React Native, Expo, @shopify/react-native-skia (canvas rendering)
**Storage**: In-memory game state (no persistence for this feature set)
**Testing**: Jest with deterministic seeds
**Target Platform**: Mobile (iOS/Android via Expo), web dev mode
**Project Type**: Single project with pure game logic + React UI separation

**Performance Goals**: 60 FPS during exploration and combat
**Constraints**: <200ms response for all UI interactions, deterministic outcomes regardless of speed settings
**Scale/Scope**: Single-player mobile game, ~100 enemy entities per map

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| P01: Explicit State Machines | PASS | Wall highlight, fast travel, overview mode use explicit states |
| P02: No Clever Abstractions | PASS | Direct implementation, no new generic patterns |
| P03: Readable & Deterministic Logic | PASS | Combat speed affects only animation timing, not outcomes |
| P04: Seed-Driven Procedural Generation | PASS | Spawn balance uses existing seeded generation |
| P05: Deterministic Combat Resolution | PASS | Gold rewards added to existing deterministic flow |
| P06: Mobile-First Performance (60 FPS) | PASS | No new heavy computations |
| P07: Bounded Memory & No Leaks | PASS | No new unbounded collections |
| P08: Strict UI Fidelity | PASS | Follows existing UI patterns |
| P09: Consistent Iconography & Tooltips | PASS | Uses existing emoji + accent color system |
| P10: Comprehensive Unit Testing | PASS | Tests required for wall break, gold rewards, spawn rules |
| P11: RNG Determinism Testing | PASS | Tests use fixed seeds |
| P12: Centralized Input Handling | PASS | Wall break double-tap flows through existing input handler |
| P13: Structured Combat Logging | PASS | Gold rewards logged in combat log |
| P14: No Invention Rule | PASS | All features explicitly specified |
| P15: Debug Tooling Isolation | PASS | No new debug tooling |

## Project Structure

### Documentation (this feature)

```text
specs/002-qol-balance-batch/
├── plan.md              # This file
├── research.md          # Phase 0 output - technical decisions
├── data-model.md        # Phase 1 output - entity definitions
├── quickstart.md        # Phase 1 output - implementation guide
├── contracts/           # Phase 1 output - interface contracts
│   ├── wall-break.md
│   ├── combat-speed.md
│   ├── map-overview.md
│   ├── fast-travel.md
│   ├── spawn-balance.md
│   ├── poi-ui.md
│   └── gold-rewards.md
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
src/
├── game/
│   ├── engine/
│   │   ├── types.ts              # Add WallHighlightState, FastTravelState
│   │   ├── game-reducer.ts       # Add BREAK_WALL, FAST_TRAVEL actions
│   │   └── constants.ts          # Add wall break cost formula, spawn radius
│   ├── map/
│   │   ├── generator.ts          # Add spawn placement constraints
│   │   └── wall-break.ts         # NEW: Wall break cost calculation
│   ├── combat/
│   │   └── resolver.ts           # Add gold reward calculation
│   └── entities/
│       └── enemies.ts            # Add gold reward table
├── components/
│   ├── game/
│   │   ├── TopBar.tsx            # Add map overview toggle icon
│   │   ├── GameCanvas.tsx        # Add overview camera controls
│   │   └── WallHighlight.tsx     # NEW: Wall break highlight overlay
│   └── combat/
│       ├── CombatScreen.tsx      # Add speed controls
│       └── CombatResult.tsx      # Add gold reward display
├── contexts/
│   ├── GameContext.tsx           # Add overview mode, wall highlight state
│   └── CombatContext.tsx         # Add speed control state
├── screens/
│   └── POIInteractionScreen.tsx  # Simplify item display UI

tests/
├── unit/
│   ├── wall-break.test.ts        # DIG cost calculation tests
│   ├── gold-rewards.test.ts      # Gold reward table tests
│   ├── spawn-balance.test.ts     # Spawn constraint tests
│   └── combat-determinism.test.ts # Speed-independent outcome tests
└── integration/
    ├── fast-travel.test.ts       # Waypoint discovery and teleport
    └── map-overview.test.ts      # Overview mode state isolation
```

**Structure Decision**: Single project structure. Pure game logic in `src/game/`, React components in `src/components/` and `src/screens/`, state management in `src/contexts/`. This follows the existing architecture pattern.

## Complexity Tracking

No constitution violations requiring justification. All features fit within existing patterns.

## Phase 0: Research Decisions

### R1: Map Overview Implementation

**Question**: How to implement zoom/pan without affecting game state?

**Decision**: Camera/view layer pattern. Add `overviewMode: boolean` and `cameraOffset: Position` to UI-only state (not GameState). The existing Skia canvas supports transform matrices. When `overviewMode` is true:
- Apply scale transform (0.5x zoom out)
- Enable pan gestures that modify `cameraOffset`
- Disable all game input handling
- Exit restores `cameraOffset` to center on player

**Rationale**: Keeps game state deterministic. Camera is purely presentational.

### R2: Combat Speed Controls

**Question**: How to accelerate combat without affecting outcomes?

**Decision**: Animation timing multiplier in CombatContext. The existing combat system pre-resolves the entire battle upfront (`resolveCombat` in `resolver.ts` returns all `CombatLogEntry[]`). The `CombatScreen` component animates through these entries. Add `speedMultiplier: 1 | 2 | 0` (normal, fast, paused) that affects only the animation interval.

**Rationale**: Combat is already deterministic and pre-resolved. Speed only affects playback rate.

### R3: Wall Break State Machine

**Question**: How to implement double-tap wall interaction?

**Decision**: Add `WallHighlightState` to GameState:
```typescript
type WallHighlightState = {
  targetPosition: Position;
  direction: Direction;
  cost: number;
} | null;
```

First tap toward wall: set `wallHighlight` with calculated cost.
Second tap same direction: execute break, clear highlight.
Any other action: clear highlight.

**Rationale**: Explicit state machine per P01. Cost pre-calculated and displayed.

### R4: Spawn Placement Algorithm

**Question**: How to implement protected radius and progressive difficulty?

**Decision**: Modify existing `placeEnemies` in `generator.ts`:
1. Calculate Manhattan distance from spawn for each floor tile
2. Partition tiles into zones: 0-5 (T1 only), 6-10 (T1-T2), 11+ (all tiers)
3. For each enemy spawn, select zone-appropriate tier
4. Existing 5-tile exclusion zone already prevents immediate spawn encounters

**Rationale**: Simple zone-based approach, deterministic with seed, easy to test.

### R5: Fast Travel Integration

**Question**: How to integrate with existing Rail Waypoint POI?

**Decision**: Add `FastTravelState` to GameState:
```typescript
type FastTravelState = {
  active: boolean;
  selectedIndex: number;
  discoveredWaypoints: string[]; // POI IDs
} | null;
```

Discovered waypoints already tracked via `MapPOI.discovered` flag on `L8` POIs. Fast travel UI cycles through discovered `L8` POIs. Confirmation teleports player (no time cost).

**Rationale**: Leverages existing POI discovery system. Minimal new state.

### R6: POI UI Simplification

**Question**: How to simplify item display while maintaining clarity?

**Decision**: Modify POI option rendering to:
- Display stat bonuses as primary text: "+1 ATK", "+2 ARM", etc.
- Show rarity via background color (existing color system)
- Remove verbose item names
- Keep tooltip on long-press for full item details

**Rationale**: Mobile-first (P08) - smaller text, clearer hierarchy.

### R7: Gold Reward Integration

**Question**: Where to add gold rewards in combat flow?

**Decision**: Add gold reward calculation in `resolveCombat`:
1. Add `goldReward` field to `CombatState`
2. Calculate reward based on enemy type and tier when combat resolves to VICTORY
3. Add to player gold in `handleResolveCombat`
4. Display in `CombatResult` component

Gold reward table (per spec):
- Basic enemies (Tunnel Rat, Cave Bat, Spore Slime, Rust Mite Swarm): T1=1, T2=2, T3=3
- Mid enemies (Collapsed Miner, Shard Beetle): T1=2, T2=3, T3=4
- Strong enemies (Tunnel Warden, Burrow Ambusher): T1=3, T2=4, T3=5

**Rationale**: Integrates with existing combat resolution flow. Deterministic.

## Implementation Priority

Per spec priorities:
1. **P1**: Map Overview Mode, Combat Time Controls (core UX)
2. **P2**: DIG Wall-Break, Enemy Spawn Balance, Fast Travel (gameplay depth)
3. **P3**: POI UI Simplification, Enemy Gold Rewards (polish)

## Testing Requirements

Per constitution P10, P11:

1. **Wall Break Cost Tests** (`wall-break.test.ts`):
   - `cost(DIG=0)` → wall cannot be broken
   - `cost(DIG=1)` → 3 moves
   - `cost(DIG=2)` → 2 moves
   - `cost(DIG=3)` → 1 move
   - `cost(DIG=4+)` → 1 move (minimum)

2. **Gold Reward Tests** (`gold-rewards.test.ts`):
   - Each enemy type × each tier → correct gold amount
   - Determinism: same seed, same enemy → same result

3. **Spawn Balance Tests** (`spawn-balance.test.ts`):
   - No T2/T3 within 5 tiles of spawn
   - T2 only appears beyond 5 tiles
   - T3 only appears beyond 10 tiles
   - Run with 100 seeds to verify statistical compliance

4. **Combat Determinism Tests** (`combat-determinism.test.ts`):
   - Same combat at speed=1 vs speed=2 → identical outcome
   - Paused combat resumes with identical state
