# Tasks: Core Gameplay Loop Integration

**Input**: Design documents from `/specs/007-core-loop-integration/`  
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Tests are included for core service functions per Constitution P10 requirement.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Mobile (React Native)**: `src/` at repository root
- All paths are relative to `/home/ailton/Work/dungeons-and-moles/app/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Core types, utilities, and service infrastructure needed by all user stories

- [x] T001 Create combat event type definitions in src/services/solana/types/combat_events.ts
- [x] T002 [P] Create item bitmask utility functions in src/services/solana/types/item_pool.ts
- [x] T003 [P] Create phase/week label utilities in src/utils/phase-labels.ts
- [x] T004 [P] Create 80-item static data definitions in src/data/items/all-items.ts
- [x] T005 Define program IDs and PDA constants in src/services/solana/constants.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 Create event parser service in src/services/solana/eventParser.ts (parseCombatEvents, parseNightMovement, parseEventsFromLogs)
- [x] T007 [P] Create session list service in src/services/solana/sessionList.ts (fetchSessionList, checkSessionExists, switchToSession)
- [x] T008 [P] Create session bundle builder in src/services/solana/sessionBundle.ts (createSessionBundle, PDA derivations)
- [x] T009 Create CombatReplayContext in src/contexts/CombatReplayContext.tsx with state machine (idle→intro→turns→outro→result)
- [x] T010 [P] Extend SessionContext in src/contexts/SessionContext.tsx to support multi-session and session list
- [x] T011 [P] Extend ProfileContext in src/contexts/ProfileContext.tsx to support run economy and item collection
- [x] T012 Add unit test for eventParser in **tests**/unit/services/eventParser.test.ts
- [x] T013 [P] Add unit test for item_pool bitmask utilities in **tests**/unit/services/item_pool.test.ts
- [x] T014 [P] Add unit test for sessionBundle in **tests**/unit/services/sessionBundle.test.ts

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Atomic Session Creation (Priority: P1) 🎯 MVP

**Goal**: Bundle 5 instructions into single transaction for session creation with SOL transfer to burner

**Independent Test**: Select campaign level, sign transaction, verify game starts with map/enemies/POIs visible, verify burner wallet received SOL

### Implementation for User Story 1

- [x] T015 [US1] Create useSessionBundle hook in src/hooks/useSessionBundle.ts (build atomic transaction, derive PDAs)
- [x] T016 [US1] Extend GameplayStateContext in src/contexts/GameplayStateContext.tsx to fetch MapEnemies and MapPois after session creation
- [x] T017 [US1] Modify CampaignSelectScreen in src/screens/CampaignSelectScreen.tsx to validate runs/level before starting
- [x] T018 [US1] Add session creation flow to CampaignSelectScreen with loading states and error handling
- [x] T019 [US1] Update GameScreen in src/screens/GameScreen.tsx to display enemies and POIs from on-chain state
- [x] T020 [US1] Add "No runs available" prompt to redirect to run purchase when runs = 0
- [x] T021 [US1] Add "Level locked" message for locked campaign levels

**Checkpoint**: User Story 1 complete - players can start sessions with single signature

---

## Phase 4: User Story 2 - Movement with Combat Display (Priority: P1)

**Goal**: Move with burner wallet, auto-trigger combat, display full combat animation from events

**Independent Test**: Move to enemy tile, verify combat animation plays showing all turns, verify correct outcome

### Implementation for User Story 2

- [x] T022 [US2] Create useCombatReplay hook in src/hooks/useCombatReplay.ts (parse events, control animation state)
- [x] T023 [P] [US2] Create CombatOverlay component in src/components/combat/CombatOverlay.tsx (full-screen modal)
- [x] T024 [P] [US2] Create TurnDisplay component in src/components/combat/TurnDisplay.tsx (single turn animation)
- [x] T025 [US2] Integrate CombatOverlay into GameScreen with state machine transitions
- [x] T026 [US2] Add move cost calculation and display (floor=1, wall=max(2, 6-DIG)) in GameScreen
- [x] T027 [US2] Add boundary validation to prevent out-of-map movements in GameScreen
- [x] T028 [US2] Handle combat victory: remove enemy from map, display gold earned
- [x] T029 [US2] Handle combat defeat: trigger death flow (see US6)

**Checkpoint**: User Story 2 complete - combat displays correctly with animations

---

## Phase 5: User Story 3 - Night Enemy Movement (Priority: P1)

**Goal**: Animate enemies moving toward player during night phases before player move resolves

**Independent Test**: Enter night phase with enemies nearby, make move, verify enemies animate toward player

### Implementation for User Story 3

- [x] T030 [US3] Create useNightMovement hook in src/hooks/useNightMovement.ts (sequential animation 200ms/enemy)
- [x] T031 [P] [US3] Create EnemyMovement component in src/components/night/EnemyMovement.tsx (animate position)
- [x] T032 [US3] Integrate night movement animation into GameScreen before player move (infrastructure ready, full visual animation requires state deferral)
- [x] T033 [US3] Add phase indicator component showing "Week X - Day/Night Y" in GameScreen header
- [x] T034 [US3] Handle combat triggered by enemy moving onto player tile during night
- [x] T035 [US3] Persist enemy positions after night movement (sync from on-chain state)

**Checkpoint**: User Story 3 complete - night enemy movement visible

---

## Phase 6: User Story 4 - POI Interaction (Priority: P1)

**Goal**: Explicit POI interaction with position validation, not auto-triggered

**Independent Test**: Move to POI tile, tap interact, verify interaction succeeds. Try from adjacent tile, verify fails.

### Implementation for User Story 4

- [x] T036 [US4] Create usePoiInteraction hook in src/hooks/usePoiInteraction.ts (canInteract, interact)
- [x] T037 [US4] Add interact button to GameScreen that shows when on valid POI tile
- [x] T038 [US4] Disable/hide interact button when not on POI or POI consumed
- [x] T039 [US4] Display POI interaction results (chest rewards, shop inventory)
- [x] T040 [US4] Filter shop item offers by session's active_item_pool

**Checkpoint**: User Story 4 complete - POI interactions work correctly

---

## Phase 7: User Story 5 - Boss Combat at Week End (Priority: P1)

**Goal**: Auto-trigger boss combat on final Night 3 move, display boss combat sequence

**Independent Test**: Reach final move of Night 3, verify boss combat triggers, verify outcome handling

### Implementation for User Story 5

- [x] T041 [P] [US5] Create BossIntro component in src/components/combat/BossIntro.tsx (boss name, stats, week)
- [x] T042 [US5] Extend CombatOverlay to handle BossCombatStarted event with intro animation
- [x] T043 [US5] Detect boss fight trigger in GameScreen (final move of Night 3)
- [x] T044 [US5] Handle Week 1/2 boss victory: advance week, unlock +2 gear slots, show UI
- [x] T045 [US5] Handle Week 3 boss victory: trigger victory flow (see US7)
- [x] T046 [US5] Handle boss defeat: trigger death flow (see US6)

**Checkpoint**: User Story 5 complete - boss fights display correctly

---

## Phase 8: User Story 6 - Death Handling (Priority: P1)

**Goal**: Show death screen with run summary, close session atomically, update profile

**Independent Test**: Trigger combat that kills player, verify session closes, verify run count updates

### Implementation for User Story 6

- [x] T047 [US6] Create DeathScreen in src/screens/DeathScreen.tsx (run summary, return to hub)
- [x] T048 [US6] Add navigation from CombatOverlay to DeathScreen on player defeat
- [x] T049 [US6] Handle session close and profile update on death (atomic)
- [x] T050 [US6] Display death cause ("Killed by [enemy type]" or "Killed during night")
- [x] T051 [US6] Show "Purchase Runs" prompt if player has 0 runs after death
- [x] T052 [US6] Add navigation route for DeathScreen in src/navigation/

**Checkpoint**: User Story 6 complete - death handling works correctly

---

## Phase 9: User Story 7 - Victory and Level Unlock (Priority: P1)

**Goal**: Show victory screen, unlock next level, unlock random item with animation

**Independent Test**: Complete level for first time, verify level unlock, verify item unlock animation

### Implementation for User Story 7

- [x] T053 [US7] Create VictoryScreen in src/screens/VictoryScreen.tsx (level unlock, item unlock, return to hub)
- [x] T054 [P] [US7] Create UnlockAnimation component in src/components/items/UnlockAnimation.tsx (glow, slide-in)
- [x] T055 [US7] Add navigation from CombatOverlay to VictoryScreen on Week 3 boss victory
- [x] T056 [US7] Parse LevelCompleted and ItemUnlocked events for victory screen data
- [x] T057 [US7] Display newly unlocked level number on first-time completion
- [x] T058 [US7] Display newly unlocked item with name, set, stats on first-time completion
- [x] T059 [US7] Add navigation route for VictoryScreen in src/navigation/

**Checkpoint**: User Story 7 complete - victory and unlocks work correctly

---

## Phase 10: User Story 8 - Multi-Session Management (Priority: P2)

**Goal**: Display all active sessions, allow switching between them

**Independent Test**: Create sessions on levels 1, 3, 5, verify all appear in list, verify switching works

### Implementation for User Story 8

- [x] T060 [US8] Create useSessionList hook in src/hooks/useSessionList.ts (fetch, switch, abandon)
- [x] T061 [P] [US8] Create SessionCard component in src/components/session/SessionCard.tsx (level, week, phase)
- [x] T062 [P] [US8] Create SessionSwitcher component in src/components/session/SessionSwitcher.tsx (quick switch)
- [x] T063 [US8] Create SessionListScreen in src/screens/SessionListScreen.tsx (list all sessions)
- [x] T064 [US8] Add abandon session with confirmation dialog (deducts run)
- [x] T065 [US8] Handle "session already exists" when starting level with active session
- [x] T066 [US8] Add navigation route for SessionListScreen in src/navigation/

**Checkpoint**: User Story 8 complete - multi-session management works

---

## Phase 11: User Story 9 - Run Economy (Priority: P2)

**Goal**: Display run count, purchase 20 runs for 0.001 SOL

**Independent Test**: View runs in profile, purchase runs, verify count increases by 20

### Implementation for User Story 9

- [x] T067 [US9] Create useRunEconomy hook in src/hooks/useRunEconomy.ts (purchase, balance check)
- [x] T068 [US9] Create RunPurchaseScreen in src/screens/RunPurchaseScreen.tsx (pricing, confirm, success)
- [x] T069 [US9] Add run count display to HubScreen with warning when runs <= 3
- [x] T070 [US9] Add "Purchase Runs" button to profile area
- [x] T071 [US9] Handle insufficient SOL balance error in purchase flow
- [x] T072 [US9] Add navigation route for RunPurchaseScreen in src/navigation/

**Checkpoint**: User Story 9 complete - run economy works

---

## Phase 12: User Story 10 - Item Progression Display (Priority: P2)

**Goal**: Display 80-item collection with unlock status, play unlock animations

**Independent Test**: View item collection, verify 40 starter items unlocked, verify unlock animation

### Implementation for User Story 10

- [x] T073 [US10] Create useItemCollection hook in src/hooks/useItemCollection.ts (parse bitmask, calculate progress)
- [x] T074 [P] [US10] Create ItemGrid component in src/components/items/ItemGrid.tsx (80-item grid)
- [x] T075 [P] [US10] Create ItemCard component in src/components/items/ItemCard.tsx (name, set, stats, lock status)
- [x] T076 [US10] Create ItemCollectionScreen in src/screens/ItemCollectionScreen.tsx (collection view)
- [x] T077 [US10] Display progress indicator ("45/80 items unlocked")
- [x] T078 [US10] Show "Collection Complete" when all 80 items unlocked
- [x] T079 [US10] Add navigation route for ItemCollectionScreen in src/navigation/

**Checkpoint**: User Story 10 complete - item collection displays correctly

---

## Phase 13: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T080 [P] Add burner wallet balance monitoring with low-balance warning in GameScreen
- [x] T081 [P] Add transaction error handling with retry options across all screens
- [x] T082 [P] Add state sync verification (trust on-chain state when diverged)
- [x] T083 [P] Add session detection on app launch (offer resume)
- [ ] T084 Run quickstart.md validation with full gameplay flow
- [x] T085 Update CLAUDE.md with 007-core-loop-integration technologies

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-12)**: All depend on Foundational phase completion
  - P1 stories (US1-7) should be completed before P2 stories (US8-10)
  - Within P1, US1 is prerequisite for all others (session required)
  - US6 (Death) and US7 (Victory) depend on combat infrastructure from US2/US5
- **Polish (Phase 13)**: Depends on all desired user stories being complete

### User Story Dependencies

| Story                   | Priority | Dependencies                | Can Run After               |
| ----------------------- | -------- | --------------------------- | --------------------------- |
| US1 - Session Creation  | P1       | Foundational                | Phase 2                     |
| US2 - Combat Display    | P1       | US1 (session)               | US1                         |
| US3 - Night Movement    | P1       | US1 (session), US2 (combat) | US2                         |
| US4 - POI Interaction   | P1       | US1 (session)               | US1 (parallel with US2/3)   |
| US5 - Boss Combat       | P1       | US2 (combat infrastructure) | US2                         |
| US6 - Death Handling    | P1       | US2 (combat triggers death) | US2                         |
| US7 - Victory Handling  | P1       | US5 (boss triggers victory) | US5                         |
| US8 - Multi-Session     | P2       | US1 (session)               | US1                         |
| US9 - Run Economy       | P2       | Foundational                | Phase 2 (parallel with US1) |
| US10 - Item Progression | P2       | US7 (item unlock)           | US7                         |

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Hooks/services before components
- Components before screen integration
- Core implementation before navigation routes

### Parallel Opportunities

Within Setup (Phase 1):

- T002, T003, T004 can run in parallel

Within Foundational (Phase 2):

- T007, T008 can run in parallel
- T010, T011 can run in parallel
- T012, T013, T014 can run in parallel

Within User Stories:

- Components marked [P] within same story can run in parallel
- Different user stories can be worked on in parallel after their dependencies are met

---

## Parallel Example: User Story 2

```bash
# Launch components in parallel:
Task: "Create CombatOverlay component in src/components/combat/CombatOverlay.tsx"
Task: "Create TurnDisplay component in src/components/combat/TurnDisplay.tsx"

# Then integrate (depends on above):
Task: "Integrate CombatOverlay into GameScreen with state machine transitions"
```

---

## Implementation Strategy

### MVP First (User Stories 1-7)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete US1 → US2 → US3 → US4 → US5 → US6 → US7 (P1 priority order)
4. **STOP and VALIDATE**: Full gameplay loop should work
5. Deploy/demo if ready

### P2 Stories (User Stories 8-10)

1. Add US8: Multi-Session → Test independently
2. Add US9: Run Economy → Test independently
3. Add US10: Item Collection → Test independently

### Incremental Delivery

| Checkpoint | Stories Complete | Capability                    |
| ---------- | ---------------- | ----------------------------- |
| After US1  | US1              | Start sessions                |
| After US2  | US1-2            | Movement + Combat             |
| After US5  | US1-5            | Full week cycle with bosses   |
| After US7  | US1-7            | Complete gameplay loop (MVP!) |
| After US10 | US1-10           | All features                  |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Constitution P10 requires tests for combat replay, session lifecycle, event parsing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
