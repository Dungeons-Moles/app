# Tasks: Guest Mode Login & Movement Tracking

**Input**: Design documents from `/specs/006-guest-mode-movement/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Tests are NOT explicitly requested in the feature specification. Core game logic tests exist. Manual testing per quickstart.md is sufficient.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Mobile React Native**: `src/` at repository root
- Structure per plan.md: `src/contexts/`, `src/screens/`, `src/hooks/`

---

## Phase 1: Setup (Verification)

**Purpose**: Verify existing infrastructure meets requirements before implementing changes

- [x] T001 Verify ProfileContext.loginAsGuest() exists and sets mode to 'guest' in src/contexts/ProfileContext.tsx
- [x] T002 Verify AccountScreen "Play as Guest" button exists and navigates to Hub in src/screens/AccountScreen.tsx
- [x] T003 [P] Run npm run typecheck to verify no existing type errors
- [x] T004 [P] Run npm run lint to verify clean baseline

**Checkpoint**: Existing infrastructure verified - ready for modifications

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core guest mode infrastructure that MUST be complete before story-specific work

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Verify isGuest variable exists in HubScreen (line ~47: `const isGuest = mode === 'guest'`) in src/screens/HubScreen.tsx
- [x] T006 Verify GameContext/GameScreen has access to useSession and useProfile hooks for integration in src/screens/GameScreen.tsx

**Checkpoint**: Foundation verified - user story implementation can now begin

---

## Phase 3: User Story 1 - Guest Mode Sign-In (Priority: P1) 🎯 MVP

**Goal**: Allow users to play without wallet connection using random seeds and no blockchain transactions

**Independent Test**: User can complete flow Account → Hub → CampaignSelect → Game → Combat without wallet

### Implementation for User Story 1

- [x] T007 [US1] Verify guest mode navigation works: AccountScreen → HubScreen when mode='guest' in src/screens/AccountScreen.tsx
- [x] T008 [US1] Update profile panel to show "(GUEST)" instead of wallet address when isGuest in src/screens/HubScreen.tsx (lines ~155-163)
- [x] T009 [US1] Implement random seed generation for guest mode map generation (Math.random() \* 2^32) in src/screens/CampaignSelectScreen.tsx or src/contexts/GameContext.tsx
- [x] T010 [US1] Verify guest mode skips startGame session creation (check for mode guard) in src/screens/CampaignSelectScreen.tsx
- [x] T011 [US1] Verify recordRunResult returns early for guest mode (already implemented in ProfileContext) in src/contexts/ProfileContext.tsx

**Checkpoint**: User Story 1 complete - guest users can play the full game flow without wallet prompts

---

## Phase 4: User Story 2 - Guest Mode UI Restrictions (Priority: P2)

**Goal**: Show simplified Hub interface for guest users with only essential buttons

**Independent Test**: Guest user sees only "Items" and "Play" buttons, settings shows "Disconnect"

### Implementation for User Story 2

- [x] T012 [US2] Hide Quests button for guest users (wrap in {!isGuest && ...}) in src/screens/HubScreen.tsx (lines ~239-247)
- [x] T013 [P] [US2] Hide Ranks button for guest users (wrap in {!isGuest && ...}) in src/screens/HubScreen.tsx (lines ~250-258)
- [x] T014 [P] [US2] Hide Skins button for guest users (wrap in {!isGuest && ...}) in src/screens/HubScreen.tsx (lines ~260-268)
- [x] T015 [P] [US2] Hide Marketplace button for guest users (wrap in {!isGuest && ...}) in src/screens/HubScreen.tsx (lines ~275-283)
- [x] T016 [P] [US2] Hide PVP button for guest users (wrap in {!isGuest && ...}) in src/screens/HubScreen.tsx (lines ~304-312)
- [x] T017 [US2] Rename Campaign button to "Play" for guest users (ternary: isGuest ? 'Play' : 'Campaign') in src/screens/HubScreen.tsx (line ~293)
- [x] T018 [US2] Change Settings modal reset button text to "Disconnect" for guest users in src/screens/HubScreen.tsx (line ~366)
- [x] T019 [US2] Verify Disconnect action returns user to AccountScreen in src/screens/HubScreen.tsx (handleResetProfile function)

**Checkpoint**: User Story 2 complete - guest Hub UI is clean and focused

---

## Phase 5: User Story 3 - On-Chain Movement Tracking (Priority: P3)

**Goal**: Track connected users' movements on-chain via burner wallet without blocking gameplay

**Independent Test**: Connected user movements appear in console logs, failures don't block gameplay

### Implementation for User Story 3

- [x] T020 [US3] Identify movement dispatch location in GameContext or GameScreen in src/contexts/GameContext.tsx or src/screens/GameScreen.tsx
- [x] T021 [US3] Import useSession and useProfile hooks in the movement handler file
- [x] T022 [US3] Add fire-and-forget movePlayer call after MOVE dispatch with mode guard: `if (mode !== 'guest' && hasActiveSession) { movePlayer({ direction }).catch(console.error); }` in src/contexts/GameContext.tsx or src/screens/GameScreen.tsx
- [x] T023 [US3] Add console.log for movement tracking: `[GameContext] Movement tracking: {direction}` for debugging
- [x] T024 [US3] Verify movement tracking failures do NOT block gameplay (no await, no user-facing errors)

**Checkpoint**: User Story 3 complete - connected users have verifiable on-chain movement

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation and cleanup

- [x] T025 Run npm run typecheck and fix any type errors
- [x] T026 Run npm run lint:fix and address any lint issues
- [x] T027 [P] Validate guest mode flow per quickstart.md Test Guest Mode Flow section
- [x] T028 [P] Validate connected user flow per quickstart.md Test Connected User Flow section
- [x] T029 Verify SC-001: App launch → Playing in under 10 seconds via guest mode
- [x] T030 Verify SC-003: 5 buttons hidden, 2 labels renamed in guest mode

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational - Independent of US1 (both modify HubScreen but different areas)
- **User Story 3 (P3)**: Can start after Foundational - Independent of US1/US2 (modifies GameContext/GameScreen)

### Within Each User Story

- Verification tasks before modification tasks
- UI changes can be parallelized when in different file sections
- Story complete before moving to next priority (recommended but not required)

### Parallel Opportunities

- T003/T004: Setup verification can run in parallel
- T013/T014/T015/T016: Button hiding tasks can run in parallel (different code sections)
- T027/T028: Validation flows can run in parallel
- US2 and US3 can be worked on in parallel after US1 (if team capacity allows)

---

## Parallel Example: User Story 2 Button Hiding

```bash
# All button hiding tasks can run in parallel (different code locations):
Task: T013 "Hide Ranks button for guest users"
Task: T014 "Hide Skins button for guest users"
Task: T015 "Hide Marketplace button for guest users"
Task: T016 "Hide PVP button for guest users"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup verification
2. Complete Phase 2: Foundational verification
3. Complete Phase 3: User Story 1 (Guest Mode Sign-In)
4. **STOP and VALIDATE**: Test guest flow per quickstart.md
5. Deploy/demo if ready - users can now try the game without wallet

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → **MVP READY** (guest users can play!)
3. Add User Story 2 → Test independently → Clean guest UI
4. Add User Story 3 → Test independently → Connected users have on-chain tracking
5. Each story adds value without breaking previous stories

### Recommended Execution Order

For a single developer:

1. T001-T006 (Setup + Foundational)
2. T007-T011 (US1 - core guest mode)
3. T012-T019 (US2 - UI restrictions)
4. T020-T024 (US3 - movement tracking)
5. T025-T030 (Polish)

---

## Notes

- [P] tasks = different files/sections, no dependencies
- [Story] label maps task to specific user story for traceability
- Most changes are simple conditional rendering (`{!isGuest && ...}`)
- Fire-and-forget pattern is critical for movement tracking (FR-010)
- Guest mode infrastructure already exists - focus on UI and integration
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
