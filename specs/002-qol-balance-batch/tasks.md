# Tasks: QoL and Balance Feature Batch

**Input**: Design documents from `/specs/002-qol-balance-batch/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Per constitution P10/P11, tests are REQUIRED for wall break cost, gold rewards, spawn balance, and combat determinism.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `__tests__/` at repository root
- Pure game logic in `src/game/`
- React components in `src/components/` and `src/screens/`
- State management in `src/contexts/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and type definitions shared across all user stories

- [ ] T001 Create feature branch `002-qol-balance-batch` from main
- [x] T002 [P] Add WallHighlightState type to src/game/engine/types.ts
- [x] T003 [P] Add FastTravelState type to src/game/engine/types.ts
- [x] T004 [P] Add CombatState extensions (goldReward, enemyDefinitionId, enemyTier) to src/game/engine/types.ts
- [x] T005 [P] Add wall break constants (WALL_BREAK_BASE_COST, WALL_BREAK_MIN_COST, WALL_BREAK_MIN_DIG) to src/game/engine/constants.ts
- [x] T006 [P] Add spawn zone constants (SPAWN_PROTECTION_RADIUS, MID_ZONE_RADIUS, ZONE_TIER_WEIGHTS) to src/game/engine/constants.ts
- [x] T007 Initialize wallHighlight and fastTravel to null in initial GameState in src/game/engine/state-factory.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T008 Add wall break actions (HIGHLIGHT_WALL, BREAK_WALL, CANCEL_WALL_HIGHLIGHT) to GameAction union in src/game/engine/game-reducer.ts
- [x] T009 Add fast travel actions (ACTIVATE_FAST_TRAVEL, CYCLE_FAST_TRAVEL, CONFIRM_FAST_TRAVEL, CANCEL_FAST_TRAVEL) to GameAction union in src/game/engine/game-reducer.ts
- [x] T010 [P] Create calculateWallBreakCost function in src/game/map/wall-break.ts
- [x] T011 [P] Create getSpawnZone and selectTierForZone functions in src/game/map/spawn-zones.ts
- [x] T012 [P] Create calculateGoldReward function and enemy category constants in src/game/entities/enemies.ts
- [x] T013 [P] Create formatStatBonuses utility in src/utils/stat-display.ts
- [x] T014 [P] Create RARITY_COLORS and RARITY_BG_COLORS constants in src/utils/rarity-colors.ts
- [x] T015 Add getDiscoveredWaypoints helper to src/game/entities/pois.ts

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Map Overview Mode (Priority: P1)

**Goal**: Players can toggle a zoomed-out, pannable map view to see discovered areas without affecting game state

**Independent Test**: Tap map icon → zooms out → pan around → tap again → returns to player-centered view. Game state unchanged.

### Tests for User Story 1

- [x] T016 [P] [US1] Unit test for overview mode state isolation in __tests__/unit/map-overview.test.ts
- [x] T017 [P] [US1] Integration test for overview mode input blocking in __tests__/integration/map-overview.test.ts

### Implementation for User Story 1

- [x] T018 [P] [US1] Add OverviewModeState type and state to GameContext in src/contexts/GameContext.tsx
- [x] T019 [P] [US1] Add toggleOverviewMode and panOverview methods to GameContext in src/contexts/GameContext.tsx
- [x] T020 [US1] Add map icon toggle button (left of day/night bar) in src/components/game/TopBar.tsx
- [x] T021 [US1] Implement zoom transform (0.5x scale) when overviewMode.active in src/components/game/GameCanvas.tsx
- [x] T022 [US1] Implement pan gesture handling for camera offset in src/components/game/GameCanvas.tsx
- [x] T023 [US1] Block all game inputs when overviewMode.active in src/hooks/useInput.ts
- [x] T024 [US1] Reset camera offset to player center when exiting overview mode in src/contexts/GameContext.tsx

**Checkpoint**: Map overview mode is fully functional and testable independently

---

## Phase 4: User Story 2 - Combat Time Controls (Priority: P1)

**Goal**: Players can pause, play at normal speed, or accelerate combat animations without affecting outcomes

**Independent Test**: Enter combat → use pause/normal/fast controls → verify animations respond → verify same enemy produces identical outcome at all speeds.

### Tests for User Story 2

- [x] T025 [P] [US2] Unit test for combat animation timing at different speeds in __tests__/unit/combat-speed.test.ts
- [x] T026 [P] [US2] Unit test for combat determinism across speed settings in __tests__/unit/combat-determinism.test.ts

### Implementation for User Story 2

- [x] T027 [P] [US2] Add CombatSpeed type and speed state to CombatContext in src/contexts/CombatContext.tsx
- [x] T028 [P] [US2] Add COMBAT_SPEED_MULTIPLIER constant to src/contexts/CombatContext.tsx
- [x] T029 [US2] Create SpeedControls component (pause/play/fast buttons) in src/components/combat/SpeedControls.tsx
- [x] T030 [US2] Integrate SpeedControls into CombatScreen in src/components/combat/CombatScreen.tsx
- [x] T031 [US2] Modify animation interval to use speed multiplier in src/contexts/CombatContext.tsx
- [x] T032 [US2] Pause animation advancement when speed is 'paused' in src/contexts/CombatContext.tsx

**Checkpoint**: Combat speed controls are fully functional and testable independently

---

## Phase 5: User Story 3 - DIG Wall-Break Mechanic (Priority: P2)

**Goal**: Players with DIG stat can break walls via double-tap interaction with cost based on DIG value

**Independent Test**: Approach wall → first tap highlights with cost shown → second tap breaks wall → verify tile converts to floor and moves deducted.

### Tests for User Story 3

- [x] T033 [P] [US3] Unit test for wall break cost calculation (DIG 0-4+) in __tests__/unit/wall-break.test.ts
- [x] T034 [P] [US3] Unit test for wall break state machine transitions in __tests__/unit/wall-break.test.ts
- [x] T035 [P] [US3] Integration test for double-tap wall break flow in __tests__/integration/wall-break.test.ts

### Implementation for User Story 3

- [x] T036 [P] [US3] Create canBreakWall function (checks perimeter, valid wall) in src/game/map/wall-break.ts
- [x] T037 [P] [US3] Create breakWall function (converts wall to floor) in src/game/map/wall-break.ts
- [x] T038 [US3] Implement handleHighlightWall reducer handler in src/game/engine/game-reducer.ts
- [x] T039 [US3] Implement handleBreakWall reducer handler in src/game/engine/game-reducer.ts
- [x] T040 [US3] Implement handleCancelWallHighlight reducer handler in src/game/engine/game-reducer.ts
- [x] T041 [US3] Modify handleMove to detect wall tap and dispatch highlight/break actions in src/game/engine/game-reducer.ts
- [x] T042 [US3] Create WallHighlight overlay component in src/components/game/WallHighlight.tsx
- [x] T043 [US3] Integrate WallHighlight into GameCanvas in src/components/game/GameCanvas.tsx
- [x] T044 [US3] Add "Requires DIG" feedback when DIG=0 taps wall in src/components/game/GameCanvas.tsx
- [x] T045 [US3] Add "Not enough moves" feedback when insufficient moves in src/components/game/GameCanvas.tsx

**Checkpoint**: Wall break mechanic is fully functional and testable independently

---

## Phase 6: User Story 4 - Enemy Spawn Balance (Priority: P2)

**Goal**: No Tier 2/3 enemies spawn near player start; difficulty progresses with distance

**Independent Test**: Generate 100 maps → verify no T2/T3 within 5 tiles of spawn → verify T3 only beyond 10 tiles.

### Tests for User Story 4

- [x] T046 [P] [US4] Unit test for spawn zone classification in __tests__/unit/spawn-balance.test.ts
- [x] T047 [P] [US4] Unit test for tier selection by zone in __tests__/unit/spawn-balance.test.ts
- [x] T048 [P] [US4] Statistical test for spawn constraints across 100 seeds in __tests__/unit/spawn-balance.test.ts

### Implementation for User Story 4

- [x] T049 [US4] Modify placeEnemies to calculate spawn zones in src/game/map/generator.ts
- [x] T050 [US4] Modify placeEnemies to filter tier by zone weights in src/game/map/generator.ts
- [x] T051 [US4] Ensure deterministic tier selection using seeded RNG in src/game/map/generator.ts

**Checkpoint**: Spawn balance is fully functional and testable independently

---

## Phase 7: User Story 5 - Fast Travel via Rail Waypoints (Priority: P2)

**Goal**: Players with 2+ discovered Rail Waypoints can teleport between them without time cost

**Independent Test**: Discover 2+ waypoints → activate fast travel → cycle selection → confirm → verify teleport without time change.

### Tests for User Story 5

- [x] T052 [P] [US5] Unit test for waypoint discovery filtering in __tests__/unit/fast-travel.test.ts
- [x] T053 [P] [US5] Integration test for fast travel teleportation in __tests__/integration/fast-travel.test.ts

### Implementation for User Story 5

- [x] T054 [P] [US5] Add canFastTravel helper (requires 2+ discovered) to src/game/entities/pois.ts
- [x] T055 [US5] Implement handleActivateFastTravel reducer handler in src/game/engine/game-reducer.ts
- [x] T056 [US5] Implement handleCycleFastTravel reducer handler in src/game/engine/game-reducer.ts
- [x] T057 [US5] Implement handleConfirmFastTravel reducer handler in src/game/engine/game-reducer.ts
- [x] T058 [US5] Implement handleCancelFastTravel reducer handler in src/game/engine/game-reducer.ts
- [x] T059 [US5] Create FastTravelButton component in src/components/game/FastTravelButton.tsx
- [x] T060 [US5] Create FastTravelOverlay component (waypoint highlighting) in src/components/game/FastTravelOverlay.tsx
- [x] T061 [US5] Integrate FastTravelButton and FastTravelOverlay into game screen in src/screens/GameScreen.tsx

**Checkpoint**: Fast travel is fully functional and testable independently

---

## Phase 8: User Story 6 - POI UI Text Simplification (Priority: P3)

**Goal**: POI item selection shows stat bonuses prominently instead of item names

**Independent Test**: Open Supply Cache/Tool Crate/Tool Oil/Geode Vault → verify items show "+1 ATK" format with rarity colors, not full names.

### Implementation for User Story 6

- [x] T062 [P] [US6] Create SimplifiedItemOption component in src/components/poi/SimplifiedItemOption.tsx
- [x] T063 [P] [US6] Create ItemTooltip component for long-press details in src/components/poi/ItemTooltip.tsx
- [x] T064 [US6] Update Supply Cache (L2) option rendering in src/screens/POIInteractionScreen.tsx
- [x] T065 [US6] Update Tool Crate (L3) option rendering in src/screens/POIInteractionScreen.tsx
- [x] T066 [US6] Update Tool Oil Rack (L4) option rendering in src/screens/POIInteractionScreen.tsx
- [x] T067 [US6] Update Geode Vault (L12) option rendering in src/screens/POIInteractionScreen.tsx
- [x] T068 [US6] Add long-press handler for tooltip display in src/screens/POIInteractionScreen.tsx

**Checkpoint**: POI UI simplification is fully functional and testable independently

---

## Phase 9: User Story 7 - Enemy Gold Rewards (Priority: P3)

**Goal**: Defeating enemies awards gold based on type and tier, displayed in combat result

**Independent Test**: Defeat each enemy type at each tier → verify correct gold amount → verify gold total updated.

### Tests for User Story 7

- [x] T069 [P] [US7] Unit test for gold reward calculation (all enemy/tier combinations) in __tests__/unit/gold-rewards.test.ts
- [x] T070 [P] [US7] Unit test for gold reward determinism in __tests__/unit/gold-rewards.test.ts

### Implementation for User Story 7

- [x] T071 [US7] Add goldReward calculation to createCombatState in src/game/combat/resolver.ts
- [x] T072 [US7] Pass enemyDefinitionId and enemyTier to createCombatState in src/game/engine/game-reducer.ts
- [x] T073 [US7] Apply goldReward to player on VICTORY in handleResolveCombat in src/game/engine/game-reducer.ts
- [x] T074 [US7] Add GOLD_REWARD log entry type to combat log in src/game/combat/resolver.ts
- [x] T075 [US7] Display gold reward in CombatResult component in src/components/combat/CombatResult.tsx
- [x] T076 [US7] Add gold reward animation to CombatResult in src/components/combat/CombatResult.tsx

**Checkpoint**: Gold rewards are fully functional and testable independently

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and validation

- [ ] T077 Run all unit tests: npm test -- __tests__/unit/
- [ ] T078 Run all integration tests: npm test -- __tests__/integration/
- [ ] T079 Run typecheck: npm run typecheck
- [ ] T080 Run linter: npm run lint
- [ ] T081 Manual testing per quickstart.md checklist
- [ ] T082 [P] Update specs/002-qol-balance-batch/tasks.md to mark completed tasks

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phases 3-9)**: All depend on Foundational phase completion
  - User stories can proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Phase 10)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 Map Overview (P1)**: After Foundational - No dependencies on other stories
- **US2 Combat Speed (P1)**: After Foundational - No dependencies on other stories
- **US3 Wall Break (P2)**: After Foundational - No dependencies on other stories
- **US4 Spawn Balance (P2)**: After Foundational - No dependencies on other stories
- **US5 Fast Travel (P2)**: After Foundational - Depends on T015 (getDiscoveredWaypoints)
- **US6 POI UI (P3)**: After Foundational - Depends on T013, T014 (stat display utils)
- **US7 Gold Rewards (P3)**: After Foundational - Depends on T012 (gold calculation)

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Pure game logic before UI components
- Reducer handlers before UI integration
- Core implementation before polish

### Parallel Opportunities

**Phase 1 (Setup)**: T002, T003, T004, T005, T006 can run in parallel

**Phase 2 (Foundational)**: T010, T011, T012, T013, T014 can run in parallel

**User Stories**: All P1 stories can start together after Foundational. All P2 stories can start together. All P3 stories can start together.

**Within Stories**: Tests marked [P] can run in parallel. Multiple implementation tasks marked [P] can run in parallel.

---

## Parallel Example: User Story 3 (Wall Break)

```bash
# Launch all tests together (write first, should fail):
Task: T033 "Unit test for wall break cost calculation"
Task: T034 "Unit test for wall break state machine"
Task: T035 "Integration test for double-tap wall break"

# Launch parallel implementation tasks:
Task: T036 "Create canBreakWall function"
Task: T037 "Create breakWall function"

# Then sequential reducer handlers:
Task: T038 → T039 → T040 → T041

# Then UI components:
Task: T042 → T043 → T044 → T045
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Map Overview)
4. Complete Phase 4: User Story 2 (Combat Speed)
5. **STOP and VALIDATE**: Test US1 + US2 independently
6. Deploy/demo if ready - core UX improvements delivered

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 Map Overview → Test → Deploy (P1)
3. Add US2 Combat Speed → Test → Deploy (P1)
4. Add US3 Wall Break → Test → Deploy (P2)
5. Add US4 Spawn Balance → Test → Deploy (P2)
6. Add US5 Fast Travel → Test → Deploy (P2)
7. Add US6 POI UI → Test → Deploy (P3)
8. Add US7 Gold Rewards → Test → Deploy (P3)

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (Map Overview) + US3 (Wall Break)
   - Developer B: US2 (Combat Speed) + US4 (Spawn Balance)
   - Developer C: US5 (Fast Travel) + US6 (POI UI) + US7 (Gold Rewards)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Constitution P10/P11 require deterministic tests with fixed seeds
