# Tasks: PvE Dungeon Crawler Prototype

**Input**: Design documents from `/specs/001-pve-dungeon-crawler/`
**Prerequisites**: plan.md (complete), spec.md (complete), data-model.md (complete), research.md (complete), contracts/ (complete)

**Tests**: Included per Constitution P10/P11 requirements for combat resolution, status effects, time progression, and RNG determinism.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, type definitions, and data files

- [x] T001 Create game engine directory structure per plan in src/game/
- [x] T002 [P] Create core game types in src/game/engine/types.ts
- [x] T003 [P] Create game constants in src/game/engine/constants.ts
- [x] T004 [P] Create map types in src/game/map/types.ts
- [x] T005 [P] Create combat types in src/game/combat/types.ts
- [x] T006 [P] Create time types in src/game/time/types.ts
- [x] T007 [P] Create input types in src/game/input/types.ts
- [x] T008 [P] Create enemy data definitions in src/data/enemies.ts
- [x] T009 [P] Create boss data definitions in src/data/bosses.ts
- [x] T010 [P] Create tool item definitions in src/data/tools.ts
- [x] T011 [P] Create gear item definitions in src/data/gear.ts
- [x] T012 [P] Create itemset definitions in src/data/itemsets.ts
- [x] T013 [P] Create POI definitions in src/data/pois.ts
- [x] T014 Extend shared types in src/types/index.ts with game exports

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T015 Implement SeededRNG class in src/game/engine/rng.ts
- [x] T016 Implement GamePhase state machine in src/game/engine/state-machine.ts
- [x] T017 Implement game reducer skeleton in src/game/engine/game-reducer.ts
- [x] T018 Create GameContext provider in src/contexts/GameContext.tsx
- [x] T019 Add Game and Combat screens to navigation in src/navigation/index.tsx
- [x] T020 [P] Create GameScreen container in src/screens/GameScreen.tsx
- [x] T021 [P] Create CombatScreen container in src/screens/CombatScreen.tsx
- [x] T022 Create game engine exports in src/game/engine/index.ts
- [x] T023 [P] Write RNG determinism tests in __tests__/unit/rng/determinism.test.ts

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Dungeon Exploration (Priority: P1)

**Goal**: Player can explore procedurally generated dungeon using D-pad controls, revealing fog of war and consuming time

**Independent Test**: Spawn player on generated map, move in all four directions, verify fog reveals, verify time consumption (1 for normal tiles, 2 for Hard Rock)

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T024 [P] [US1] Write map generation determinism test in __tests__/unit/map/generator.test.ts
- [x] T025 [P] [US1] Write fog of war visibility test in __tests__/unit/map/fog-of-war.test.ts
- [x] T026 [P] [US1] Write exploration integration test in __tests__/integration/exploration.test.ts

### Implementation for User Story 1

- [x] T027 [US1] Implement recursive backtracker maze generator in src/game/map/generator.ts
- [x] T028 [US1] Implement tile type assignment (Empty/Soft/Hard) in src/game/map/generator.ts
- [x] T029 [US1] Implement POI placement logic in src/game/map/generator.ts
- [x] T030 [US1] Implement enemy spawn placement in src/game/map/generator.ts
- [x] T031 [US1] Implement fog of war visibility calculations in src/game/map/fog-of-war.ts
- [x] T032 [US1] Implement player entity logic in src/game/entities/player.ts
- [x] T033 [US1] Implement centralized input handler in src/game/input/handler.ts
- [x] T034 [US1] Implement keyboard bindings for web dev in src/game/input/keyboard.ts
- [x] T035 [US1] Implement useInput hook in src/hooks/useInput.ts
- [x] T036 [US1] Add MOVE action handling to game reducer in src/game/engine/game-reducer.ts
- [x] T037 [US1] Implement MapRenderer with Skia in src/components/game/MapRenderer.tsx
- [x] T038 [US1] Implement viewport culling in MapRenderer for performance
- [x] T039 [US1] Implement DPadControls component in src/components/game/DPadControls.tsx
- [x] T040 [US1] Implement camera centering on player in MapRenderer
- [x] T041 [US1] Wire up GameScreen with MapRenderer, DPadControls, and GameContext
- [x] T042 [US1] Connect Hub Campaign button to GameScreen navigation

**Checkpoint**: User Story 1 complete - player can explore map with D-pad, fog reveals, time consumed

---

## Phase 4: User Story 2 - Auto-Combat System (Priority: P1)

**Goal**: Combat resolves automatically when player steps on enemy with deterministic outcomes

**Independent Test**: Place player adjacent to enemy, step onto enemy tile, verify combat scene loads, resolves, and returns to map with correct outcome

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T043 [P] [US2] Write damage calculation tests in __tests__/unit/combat/damage.test.ts
- [x] T044 [P] [US2] Write combat resolver determinism tests in __tests__/unit/combat/resolver.test.ts
- [x] T045 [P] [US2] Write combat flow integration test in __tests__/integration/combat-flow.test.ts

### Implementation for User Story 2

- [x] T046 [US2] Implement damage calculation in src/game/combat/damage.ts
- [x] T047 [US2] Implement combat state creation in src/game/combat/types.ts
- [x] T048 [US2] Implement combat resolver (pure function) in src/game/combat/resolver.ts
- [x] T049 [US2] Implement Battle Start phase effects in resolver
- [x] T050 [US2] Implement turn resolution with SPEED ordering in resolver
- [x] T051 [US2] Implement structured combat log with capped entries in resolver
- [x] T052 [US2] Add ENTER_COMBAT action to game reducer
- [x] T053 [US2] Add RESOLVE_COMBAT action to game reducer
- [x] T054 [US2] Create CombatContext provider in src/contexts/CombatContext.tsx
- [x] T055 [US2] Implement useCombat hook in src/hooks/useCombat.ts
- [x] T056 [US2] Implement CombatArena with Skia in src/components/combat/CombatArena.tsx
- [x] T057 [US2] Implement DamageNumbers floating animation in src/components/combat/DamageNumbers.tsx
- [x] T058 [US2] Wire up CombatScreen with combat resolution and navigation back to GameScreen
- [x] T059 [US2] Implement Victory/Defeat display with 3-second timer

**Checkpoint**: User Story 2 complete - combat triggers on enemy tile, resolves automatically, deterministic

---

## Phase 5: User Story 3 - Time/Week Progression (Priority: P1)

**Goal**: Time progresses through Day/Night cycles, boss fights trigger after Night 3

**Independent Test**: Consume 50 moves to verify Day->Night, consume 30 more for Night->Day, repeat through 3 cycles, verify boss trigger

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T060 [P] [US3] Write time progression tests in __tests__/unit/time/progression.test.ts
- [x] T061 [P] [US3] Write week boss selection tests in __tests__/unit/time/progression.test.ts

### Implementation for User Story 3

- [x] T062 [US3] Implement time progression logic in src/game/time/progression.ts
- [x] T063 [US3] Implement Day/Night transition with move tracking
- [x] T064 [US3] Implement boss selection per week pool in src/game/time/week.ts
- [x] T065 [US3] Implement auto-boss trigger after Night 3
- [x] T066 [US3] Add time consumption to MOVE action in game reducer
- [x] T067 [US3] Add TRIGGER_BOSS action to game reducer
- [x] T068 [US3] Implement TopBar component in src/components/game/TopBar.tsx
- [x] T069 [US3] Implement week progress timeline display in TopBar
- [x] T070 [US3] Implement boss preview (emoji + name) in TopBar
- [x] T071 [US3] Implement inventory slot growth on Day transition (+2 slots)
- [x] T072 [US3] Wire up TopBar to GameScreen

**Checkpoint**: User Story 3 complete - time progresses, Day/Night cycles work, boss triggers at week end

---

## Phase 6: User Story 4 - Inventory & Item System (Priority: P2)

**Goal**: Player can collect, equip, and view items with stat bonuses applied correctly

**Independent Test**: Collect items, verify inventory display, equip Tool, verify stat panel reflects bonuses

### Tests for User Story 4

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T073 [P] [US4] Write item stat calculation tests in __tests__/unit/entities/items.test.ts
- [x] T074 [P] [US4] Write itemset activation tests in __tests__/unit/entities/itemsets.test.ts

### Implementation for User Story 4

- [x] T075 [US4] Implement item entity logic in src/game/entities/items.ts
- [x] T076 [US4] Implement itemset detection and activation in src/game/entities/itemsets.ts
- [x] T077 [US4] Implement inventory state management in player entity
- [x] T078 [US4] Implement stat calculation with equipped items in player entity
- [x] T079 [US4] Implement Tool equipping (single weapon slot)
- [x] T080 [US4] Implement Gear collection to inventory grid
- [x] T081 [US4] Add item collection actions to game reducer
- [x] T082 [US4] Implement StatsPanel component in src/components/game/StatsPanel.tsx
- [x] T083 [US4] Implement InventoryPanel component in src/components/game/InventoryPanel.tsx
- [x] T084 [US4] Implement ItemTooltip overlay in src/components/game/ItemTooltip.tsx
- [x] T085 [US4] Wire up StatsPanel and InventoryPanel to GameScreen

**Checkpoint**: User Story 4 complete - items collect, equip, stats update, tooltips work

---

## Phase 7: User Story 5 - POI Interactions (Priority: P2)

**Goal**: Player can interact with all 12 POI types with correct outputs

**Independent Test**: Step on each POI type, verify interaction UI appears, verify correct options/outputs

### Implementation for User Story 5

- [x] T086 [US5] Implement POI interaction system in src/game/entities/pois.ts
- [x] T087 [US5] Implement Supply Cache interaction (pick 1 of 3 Common items)
- [x] T088 [US5] Implement Tool Crate interaction (pick 1 of 3 Tools)
- [x] T089 [US5] Implement Mole Den interaction (Night: skip to Day, restore HP)
- [x] T090 [US5] Implement Rest Alcove interaction (Night: skip to Day, restore 10 HP)
- [x] T091 [US5] Implement Survey Beacon interaction (reveal radius 13)
- [x] T092 [US5] Implement Seismic Scanner interaction (choose POI type to reveal)
- [x] T093 [US5] Implement Rail Waypoint fast travel system
- [x] T094 [US5] Implement Smuggler Hatch shop interaction
- [x] T095 [US5] Implement Tool Oil Rack interaction (+1 ATK/ARM/DIG)
- [x] T096 [US5] Implement Rusty Anvil forge mod system
- [x] T097 [US5] Implement Crusher Golem fusion (Common->Gilded->Diamond)
- [x] T098 [US5] Implement Geode Vault interaction (pick 1 of 3 Heroic items)
- [x] T099 [US5] Add INTERACT_POI, SELECT_POI_OPTION, CLOSE_POI actions to reducer
- [x] T100 [US5] Implement POI interaction modal/overlay UI component
- [x] T101 [US5] Wire up POI interactions to GameScreen

**Checkpoint**: User Story 5 complete - all 12 POI types functional

---

## Phase 8: User Story 6 - Boss Encounters (Priority: P2)

**Goal**: All 7 bosses work with unique traits, Eldritch Mole has phase transitions

**Independent Test**: Trigger each boss fight, verify trait executes correctly, verify Eldritch Mole phase transitions at HP thresholds

### Implementation for User Story 6

- [x] T102 [US6] Implement boss entity logic in src/game/entities/bosses.ts
- [x] T103 [US6] Implement Broodmother trait (strikes 3 times per turn)
- [x] T104 [US6] Implement Obsidian Golem trait (Turn Start +3 Armor)
- [x] T105 [US6] Implement Gas Anomaly trait (Turn Start 2 damage ignoring Armor)
- [x] T106 [US6] Implement Mad Miner trait (Battle Start mirror Common item)
- [x] T107 [US6] Implement Drill Sergeant trait (Turn Start +2 ATK)
- [x] T108 [US6] Implement Crystal Mimic trait (first status reflects to player)
- [x] T109 [US6] Implement Eldritch Mole phase system (75%/50%/25% thresholds)
- [x] T110 [US6] Integrate boss traits into combat resolver
- [x] T111 [US6] Implement BossTooltip component in src/components/game/BossTooltip.tsx
- [x] T112 [US6] Wire boss preview tap to show BossTooltip

**Checkpoint**: User Story 6 complete - all 7 bosses functional with correct traits

---

## Phase 9: User Story 7 - Status Effects System (Priority: P2)

**Goal**: Chill, Shrapnel, Rust work correctly in combat

**Independent Test**: Apply each status in isolated combat, verify stacking, duration, and effects

### Tests for User Story 7

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T113 [P] [US7] Write status effects tests in __tests__/unit/combat/status-effects.test.ts

### Implementation for User Story 7

- [x] T114 [US7] Implement Chill effect (halve ATK, -1 stack at turn end) in src/game/combat/status-effects.ts
- [x] T115 [US7] Implement Shrapnel effect (reflect damage when struck, clear at turn end)
- [x] T116 [US7] Implement Rust effect (reduce ARM by stacks)
- [x] T117 [US7] Implement status effect stacking logic
- [x] T118 [US7] Integrate status effects into combat resolver
- [x] T119 [US7] Implement enemy traits that apply statuses in src/game/combat/traits.ts
- [x] T120 [US7] Implement status effect icons display in combat UI
- [x] T121 [US7] Add status icons to EnemyPanel and PlayerPanel

**Checkpoint**: User Story 7 complete - all status effects functional

---

## Phase 10: User Story 8 - UI Layout & Controls (Priority: P3)

**Goal**: Complete landscape UI with all panels in correct positions

**Independent Test**: Verify all UI elements render in correct positions, update live, respond to input

### Implementation for User Story 8

- [x] T122 [US8] Finalize StatsPanel layout (HP/ATK/ARM/SPD/GOLD with emojis)
- [x] T123 [US8] Finalize TopBar layout (week progress + boss preview)
- [x] T124 [US8] Finalize DPadControls layout (bottom-left positioning)
- [x] T125 [US8] Implement EnemyPanel component in src/components/combat/EnemyPanel.tsx
- [x] T126 [US8] Implement PlayerPanel component in src/components/combat/PlayerPanel.tsx
- [x] T127 [US8] Implement CombatLog display in src/components/combat/CombatLog.tsx
- [x] T128 [US8] Finalize CombatScreen layout (enemy left, player right, arena center)
- [x] T129 [US8] Add keyboard input support (arrows/WASD) for web development
- [x] T130 [US8] Implement responsive landscape-only orientation lock
- [x] T131 [US8] Polish all tooltip styling for consistency

**Checkpoint**: User Story 8 complete - full UI layout matching spec

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final integration, performance optimization, and test coverage

- [x] T132 Implement enemy pathfinding for Night movement in src/game/map/pathfinding.ts
- [x] T133 Integrate Night enemy movement into game loop
- [x] T134 [P] Add debug overlay toggles (FPS, seed, state) per Constitution P15
- [x] T135 [P] Performance profiling on target device (Solana Seeker)
- [x] T136 Optimize MapRenderer for 60 FPS (sprite caching, batching)
- [ ] T137 [P] Verify all combat determinism tests pass with fixed seeds
- [ ] T138 [P] Run full integration test suite
- [ ] T139 Update quickstart.md with final testing instructions
- [ ] T140 Final code review for Constitution compliance

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-10)**: All depend on Foundational phase completion
  - US1 (Exploration): Can start after Foundational
  - US2 (Combat): Can start after Foundational, integrates with US1
  - US3 (Time/Week): Can start after Foundational, integrates with US1
  - US4 (Inventory): Depends on US1 (needs map/POIs)
  - US5 (POIs): Depends on US1 (needs map), US4 (needs inventory)
  - US6 (Bosses): Depends on US2 (needs combat), US3 (needs week system)
  - US7 (Status Effects): Depends on US2 (needs combat)
  - US8 (UI Polish): Depends on all P1/P2 stories
- **Polish (Phase 11)**: Depends on all user stories being complete

### User Story Dependencies

```
Foundational ─┬─► US1 (Exploration) ─┬─► US4 (Inventory) ──► US5 (POIs)
              │                      │
              ├─► US2 (Combat) ──────┼─► US6 (Bosses)
              │                      │
              ├─► US3 (Time/Week) ───┘   US7 (Status Effects) ──┐
              │                                                  │
              └──────────────────────────────────────────────────┴─► US8 (UI Polish)
```

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Types before logic
- Core logic before UI components
- Reducer actions before screen wiring
- Complete story before moving to next priority

### Parallel Opportunities

- All Setup tasks T002-T014 can run in parallel
- All test tasks within each story marked [P] can run in parallel
- US1, US2, US3 can begin in parallel after Foundational
- US6 and US7 can run in parallel (both depend on US2)

---

## Parallel Example: Setup Phase

```bash
# Launch all type definition tasks together (T002-T007):
Task: "Create core game types in src/game/engine/types.ts"
Task: "Create game constants in src/game/engine/constants.ts"
Task: "Create map types in src/game/map/types.ts"
Task: "Create combat types in src/game/combat/types.ts"
Task: "Create time types in src/game/time/types.ts"
Task: "Create input types in src/game/input/types.ts"

# Launch all data definition tasks together (T008-T013):
Task: "Create enemy data definitions in src/data/enemies.ts"
Task: "Create boss data definitions in src/data/bosses.ts"
Task: "Create tool item definitions in src/data/tools.ts"
Task: "Create gear item definitions in src/data/gear.ts"
Task: "Create itemset definitions in src/data/itemsets.ts"
Task: "Create POI definitions in src/data/pois.ts"
```

## Parallel Example: User Story 1 Tests

```bash
# Launch all US1 tests together:
Task: "Write map generation determinism test in __tests__/unit/map/generator.test.ts"
Task: "Write fog of war visibility test in __tests__/unit/map/fog-of-war.test.ts"
Task: "Write exploration integration test in __tests__/integration/exploration.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Exploration)
4. **STOP and VALIDATE**: Test exploration independently
5. Demo exploration loop (move, reveal, consume time)

### Core Loop (P1 Stories)

1. Setup + Foundational → Foundation ready
2. Add User Story 1 → Test → Demo exploration
3. Add User Story 2 → Test → Demo combat
4. Add User Story 3 → Test → Demo full Day/Night/Boss cycle
5. **MILESTONE**: Playable core loop with basic combat

### Full Feature (P2 Stories)

1. Add User Story 4 → Items work, stats update
2. Add User Story 5 → All POIs functional
3. Add User Story 6 → All bosses work
4. Add User Story 7 → Status effects complete
5. **MILESTONE**: Full game feature set

### Polish (P3 + Phase 11)

1. Add User Story 8 → UI polish
2. Complete Phase 11 → Performance, tests, docs
3. **MILESTONE**: Production-ready prototype

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- Constitution P10/P11: Tests required for combat, status effects, time, RNG determinism
