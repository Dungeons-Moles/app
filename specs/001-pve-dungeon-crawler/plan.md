# Implementation Plan: PvE Dungeon Crawler Prototype

**Branch**: `001-pve-dungeon-crawler` | **Date**: 2026-01-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-pve-dungeon-crawler/spec.md`

## Summary

Implement a tile-based dungeon crawler with auto-combat, inspired by "He Is Coming". The player controls a Mole character navigating procedurally generated corridor maps, collecting items, encountering enemies, and battling weekly bosses. The game uses explicit state machines for phase management, seed-driven deterministic generation, and renders via React Native Skia on a mobile-first (Solana Seeker) target.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: React Native 0.79+, Expo SDK 54, @shopify/react-native-skia 2.2+, React Navigation 7.x
**Storage**: Expo SQLite for local persistence (run saves, progression)
**Testing**: Jest + React Native Testing Library, deterministic seed-based tests
**Target Platform**: Android (Solana Seeker primary), Web (development/testing)
**Project Type**: Mobile (React Native with Expo)
**Performance Goals**: 60 FPS exploration/combat, <16ms frame budget
**Constraints**: <100MB memory, no unbounded arrays, bounded combat log (100 entries)
**Scale/Scope**: Single-player PvE, 3-week runs, ~35 items, 8 enemies, 7 bosses, 12 POIs

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Implementation Approach |
|-----------|--------|------------------------|
| P01: Explicit State Machines | PASS | GamePhase enum (Exploration, Combat, Menu, Boss), transitions via reducer |
| P02: No Clever Abstractions | PASS | Direct functions for combat, no generic "managers" |
| P03: Readable & Deterministic Logic | PASS | Pure functions for damage/effects, isolated side effects |
| P04: Seed-Driven Procedural Generation | PASS | SeededRNG class passed to all generation functions |
| P05: Deterministic Combat Resolution | PASS | Combat resolved via pure function with seed input |
| P06: Mobile-First Performance (60 FPS) | PASS | Skia canvas for hot paths, memoized React components |
| P07: Bounded Memory & No Leaks | PASS | Combat log capped at 100, entity pools bounded |
| P08: Strict UI Fidelity | PASS | Landscape layout per spec, no additions |
| P09: Consistent Iconography & Tooltips | PASS | Emoji + accent color system, all items/bosses get tooltips |
| P10: Comprehensive Unit Testing | PASS | Tests for combat, status effects, time progression |
| P11: RNG Determinism Testing | PASS | All tests use fixed seeds, determinism assertions |
| P12: Centralized Input Handling | PASS | InputHandler module for D-pad/keyboard, testable |
| P13: Structured Combat Logging | PASS | CombatLog type with turn/actor/action/result/rng fields |
| P14: No Invention Rule | PASS | Only spec-defined entities implemented |
| P15: Debug Tooling Isolation | PASS | Dev overlay via __DEV__ flag, no gameplay impact |

## Project Structure

### Documentation (this feature)

```text
specs/001-pve-dungeon-crawler/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file
├── research.md          # Phase 0: Map generation, combat resolution research
├── data-model.md        # Phase 1: Entity definitions and relationships
├── quickstart.md        # Phase 1: How to run and test the feature
├── contracts/           # Phase 1: API contracts (if any internal APIs)
├── checklists/
│   └── requirements.md  # Specification quality checklist (complete)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── game/
│   ├── engine/
│   │   ├── index.ts                 # Game engine exports
│   │   ├── types.ts                 # Core game types (GameState, etc.)
│   │   ├── constants.ts             # Game constants (stats, timings)
│   │   ├── rng.ts                   # SeededRNG implementation
│   │   ├── state-machine.ts         # GamePhase state machine
│   │   └── game-reducer.ts          # Main state reducer
│   │
│   ├── map/
│   │   ├── types.ts                 # Map types (Tile, TileType, etc.)
│   │   ├── generator.ts             # Procedural map generation
│   │   ├── fog-of-war.ts            # Visibility calculations
│   │   └── pathfinding.ts           # Enemy pathfinding (Night)
│   │
│   ├── combat/
│   │   ├── types.ts                 # Combat types (CombatState, CombatLog)
│   │   ├── resolver.ts              # Combat resolution (pure function)
│   │   ├── damage.ts                # Damage calculations
│   │   ├── status-effects.ts        # Chill, Shrapnel, Rust logic
│   │   └── traits.ts                # Enemy/boss trait implementations
│   │
│   ├── entities/
│   │   ├── player.ts                # Player entity logic
│   │   ├── enemies.ts               # Enemy definitions and logic
│   │   ├── bosses.ts                # Boss definitions and traits
│   │   ├── items.ts                 # Tool and Gear definitions
│   │   ├── itemsets.ts              # Itemset bonus logic
│   │   └── pois.ts                  # POI definitions and interactions
│   │
│   ├── time/
│   │   ├── types.ts                 # TimeState, Phase, Week types
│   │   ├── progression.ts           # Day/Night/Boss transitions
│   │   └── week.ts                  # Week structure and boss selection
│   │
│   ├── input/
│   │   ├── types.ts                 # Input types (Direction, InputEvent)
│   │   ├── handler.ts               # Centralized input handler
│   │   └── keyboard.ts              # Keyboard bindings (web dev)
│   │
│   └── GameCanvas.tsx               # Main Skia canvas (existing, to be extended)
│
├── screens/
│   ├── GameScreen.tsx               # Exploration scene container
│   └── CombatScreen.tsx             # Combat scene container
│
├── components/
│   ├── game/
│   │   ├── MapRenderer.tsx          # Skia map rendering
│   │   ├── DPadControls.tsx         # D-pad touch input
│   │   ├── StatsPanel.tsx           # Player stats display
│   │   ├── InventoryPanel.tsx       # Inventory grid
│   │   ├── TopBar.tsx               # Week progress, boss preview
│   │   ├── ItemTooltip.tsx          # Item tooltip overlay
│   │   └── BossTooltip.tsx          # Boss tooltip overlay
│   │
│   └── combat/
│       ├── CombatArena.tsx          # Skia combat rendering
│       ├── EnemyPanel.tsx           # Enemy info sidebar
│       ├── PlayerPanel.tsx          # Player info sidebar
│       ├── CombatLog.tsx            # Combat event log display
│       └── DamageNumbers.tsx        # Floating damage numbers
│
├── contexts/
│   ├── GameContext.tsx              # Game state context + reducer
│   └── CombatContext.tsx            # Combat state context
│
├── hooks/
│   ├── useGameEngine.ts             # Game engine hook
│   ├── useCombat.ts                 # Combat resolution hook
│   └── useInput.ts                  # Input handling hook
│
├── data/
│   ├── enemies.ts                   # Enemy data definitions
│   ├── bosses.ts                    # Boss data definitions
│   ├── tools.ts                     # Tool item definitions
│   ├── gear.ts                      # Gear item definitions
│   ├── itemsets.ts                  # Itemset definitions
│   └── pois.ts                      # POI definitions
│
└── types/
    └── index.ts                     # Shared types (existing, extend)

__tests__/
├── unit/
│   ├── combat/
│   │   ├── damage.test.ts           # Damage calculation tests
│   │   ├── status-effects.test.ts   # Status effect tests
│   │   └── resolver.test.ts         # Combat resolution tests
│   │
│   ├── map/
│   │   ├── generator.test.ts        # Map generation tests
│   │   └── fog-of-war.test.ts       # Visibility tests
│   │
│   ├── time/
│   │   └── progression.test.ts      # Time/week progression tests
│   │
│   ├── entities/
│   │   ├── items.test.ts            # Item effect tests
│   │   └── itemsets.test.ts         # Itemset bonus tests
│   │
│   └── rng/
│       └── determinism.test.ts      # RNG determinism verification
│
└── integration/
    ├── exploration.test.ts          # Full exploration loop test
    └── combat-flow.test.ts          # Combat start-to-end test
```

**Structure Decision**: Mobile project with React Native. Game logic isolated in `src/game/` as pure TypeScript modules. UI components in `src/components/`. Screens in `src/screens/`. Data definitions in `src/data/`. This separation allows testing game logic without React dependencies.

## Complexity Tracking

No constitution violations requiring justification. The design follows all 15 principles with straightforward implementations.

---

## Phase 0: Research

### R1: Map Generation Approach

**Question**: How to generate corridor-based maps that are seed-deterministic?

**Approaches Evaluated**:
1. **Recursive Backtracker Maze** - Simple, guaranteed connectivity, deterministic with seeded RNG
2. **Drunkard's Walk** - Organic caves, but produces open spaces (violates spec)
3. **BSP Tree** - Room-based, not corridor-based (violates spec)
4. **Wave Function Collapse** - Complex, harder to guarantee determinism

**Decision**: Recursive Backtracker Maze with seeded RNG
- Guarantees all tiles are reachable
- Produces natural corridor layouts
- Simple to implement deterministically
- Post-process to add tile variants (Empty, Soft Earth, Hard Rock)

**Tile Assignment Algorithm**:
```
1. Generate maze skeleton (walls and passages)
2. For each passage tile, use seeded random to assign:
   - 50% Empty Tunnel (1 time cost)
   - 35% Soft Earth (1 time cost)
   - 15% Hard Rock (2 time cost)
3. Place Mole Den adjacent to starting position
4. Place POIs according to density rules
5. Place enemies on valid tiles
```

### R2: Combat Resolution Architecture

**Question**: How to ensure combat is fully deterministic and testable?

**Approach**: Pure function combat resolver
```typescript
function resolveCombat(
  initialState: CombatState,
  rng: SeededRNG
): CombatResult {
  // All state mutations are internal
  // Returns final state + combat log
  // Same inputs always produce same outputs
}
```

**Combat Flow**:
1. **Battle Start Phase**: Execute all Battle Start effects (items, traits, itemsets)
2. **Turn Loop**: While both combatants alive:
   a. Determine turn order by SPEED
   b. Execute attacker's turn (apply traits, calculate damage, apply status)
   c. Check for death
   d. Execute defender's turn (if alive)
   e. Apply end-of-turn effects (status tick-down)
3. **Battle End**: Return result (Victory/Defeat) + full combat log

**Damage Formula**:
```
base_damage = attacker.ATK
modified_damage = apply_chill(base_damage, attacker.chill_stacks)
armor_reduction = min(target.ARM, modified_damage) // unless ignores armor
hp_damage = modified_damage - armor_reduction
final_damage = max(0, hp_damage)
```

### R3: State Machine Design

**Question**: How to implement game phases as explicit state machine per P01?

**States**:
```typescript
enum GamePhase {
  MainMenu,
  Exploration,
  POIInteraction,
  Combat,
  BossFight,
  Victory,
  Defeat
}
```

**Transitions**:
- MainMenu -> Exploration (Start Game)
- Exploration -> Combat (Step on enemy)
- Exploration -> POIInteraction (Step on POI)
- Exploration -> BossFight (Night 3 ends)
- POIInteraction -> Exploration (Close POI)
- Combat -> Exploration (Victory)
- Combat -> Defeat (Player HP = 0)
- BossFight -> Victory (Boss HP = 0 on Week 3)
- BossFight -> Exploration (Boss HP = 0 on Week 1/2)
- BossFight -> Defeat (Player HP = 0)

**Implementation**: Reducer pattern with typed actions
```typescript
type GameAction =
  | { type: 'START_GAME'; seed: number }
  | { type: 'MOVE'; direction: Direction }
  | { type: 'ENTER_COMBAT'; enemy: Enemy }
  | { type: 'RESOLVE_COMBAT'; result: CombatResult }
  | { type: 'INTERACT_POI'; poi: POI }
  | { type: 'CLOSE_POI' }
  | { type: 'TRIGGER_BOSS' }
  // ...etc

function gameReducer(state: GameState, action: GameAction): GameState {
  // Guard: validate transition is legal
  // Apply: compute new state
  // Return: new state with updated phase
}
```

### R4: Performance Strategy

**Question**: How to maintain 60 FPS on mobile with Skia rendering?

**Strategies**:
1. **Culling**: Only render tiles within viewport + buffer
2. **Memoization**: Cache tile sprites, don't recreate per frame
3. **Batching**: Batch similar draw calls
4. **Off-screen prep**: Pre-render fog of war overlay
5. **No allocations in hot path**: Pre-allocate draw buffers

**React Optimization**:
- `useMemo` for computed values (visible tiles, stat totals)
- `useCallback` for handlers passed to Skia
- Avoid inline object/array literals in render
- Split components to isolate re-renders

---

## Phase 1: Design

### Data Model

See [data-model.md](./data-model.md) for complete entity definitions.

Key entities:
- **GameState**: Complete game snapshot (player, map, time, inventory, phase)
- **Player**: Stats, position, equipped items, status effects
- **Map**: Tile grid, fog state, entities
- **CombatState**: Combatants, turn counter, log
- **TimeState**: Current week, phase, moves remaining

### Quickstart

See [quickstart.md](./quickstart.md) for development setup and testing guide.

### Contracts

Internal contracts for game engine APIs defined in [contracts/](./contracts/).

---

## Implementation Phases (for tasks.md)

### Phase 1: Setup
- Project structure creation
- Type definitions
- Constants and data files

### Phase 2: Foundational
- Seeded RNG implementation
- State machine framework
- Game reducer skeleton
- Navigation integration (Game/Combat screens)

### Phase 3: User Story 1 - Exploration (P1)
- Map generation
- Fog of war
- Player movement
- Time consumption
- Skia map rendering
- D-pad controls
- Camera centering

### Phase 4: User Story 2 - Combat (P1)
- Combat state types
- Damage calculation
- Combat resolver
- Battle Start effects
- Turn resolution
- Victory/Defeat handling
- Combat scene UI

### Phase 5: User Story 3 - Time/Week (P1)
- Day/Night transitions
- Move tracking
- Week progression
- Boss selection
- Auto-boss trigger
- Top bar UI

### Phase 6: User Story 4 - Inventory (P2)
- Inventory state
- Slot management
- Item collection
- Tool equipping
- Stat calculation
- Inventory panel UI
- Item tooltips

### Phase 7: User Story 5 - POIs (P2)
- POI definitions
- Interaction system
- Each POI type implementation
- POI spawn rules

### Phase 8: User Story 6 - Bosses (P2)
- Boss definitions
- Boss traits
- Eldritch Mole phases
- Boss tooltip

### Phase 9: User Story 7 - Status Effects (P2)
- Chill implementation
- Shrapnel implementation
- Rust implementation
- Status UI display

### Phase 10: User Story 8 - UI Polish (P3)
- Stats panel
- Top bar completion
- Combat panels
- Damage numbers
- Keyboard input (web)

### Phase 11: Testing & Polish
- Unit tests for all combat paths
- Status effect tests
- Determinism verification tests
- Integration tests
- Performance profiling

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Combat determinism bugs | Fixed-seed test suite, log RNG values |
| Performance on mobile | Early profiling, bounded structures, culling |
| State machine complexity | Explicit guards, transition logging |
| Scope creep | Constitution P14 enforcement, spec boundary checks |

---

## Next Steps

1. Run `/speckit.tasks` to generate detailed task list from this plan
2. Begin Phase 1 (Setup) implementation
3. Validate architecture with US1 (Exploration) end-to-end
