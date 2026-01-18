# Tasks: Solana Frontend Integration

**Input**: Design documents from `/specs/004-solana-frontend-integration/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependencies, and Solana service layer

- [x] T001 Install @coral-xyz/anchor dependency via npm install @coral-xyz/anchor
- [x] T002 Create Solana config file at src/services/solana/config.ts with program IDs and cluster settings
- [x] T003 [P] Create shared Solana types at src/services/solana/types.ts with PDA derivation helpers
- [x] T004 [P] Create IDL directory structure at src/services/solana/idl/ and copy IDL files from solana-programs
- [x] T005 Create program initialization module at src/services/solana/programs.ts with Anchor Program instances
- [x] T006 [P] Create error mapping utilities at src/services/solana/errors.ts per RD-008

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T007 Extend WalletContext.tsx with signAndSendTransaction method using transact() per RD-002
- [x] T008 Add getBalance and checkBalance methods to WalletContext.tsx
- [x] T009 Create profile caching utilities at src/services/solana/cache.ts using expo-secure-store per RD-004
- [x] T010 Create connectivity detection utility at src/services/solana/connectivity.ts for online/cached/guest modes per RD-006
- [x] T011 Add Solana connection provider initialization in App.tsx or root provider

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - First-Time Player Onboarding (Priority: P1) 🎯 MVP

**Goal**: New players can connect wallet, create on-chain profile, and see profile data in hub

**Independent Test**: Connect a new wallet, complete profile creation, verify profile appears in hub screen with correct data

### Implementation for User Story 1

- [x] T012 [US1] Implement usePlayerProfile hook at src/hooks/usePlayerProfile.ts with fetchProfile, createProfile, exists state
- [x] T013 [US1] Add profile PDA derivation to usePlayerProfile using ["player", owner] seeds
- [x] T014 [US1] Implement createProfile transaction builder in usePlayerProfile calling initializeProfile instruction
- [x] T015 [US1] Create ProfileContext at src/contexts/ProfileContext.tsx wrapping usePlayerProfile with mode detection
- [x] T016 [P] [US1] Create ProfileCreationScreen at src/screens/ProfileCreationScreen.tsx with name input and create button
- [x] T017 [P] [US1] Create ProfileCard component at src/components/profile/ProfileCard.tsx displaying name, totalRuns, currentLevel, unlockedTier
- [x] T018 [US1] Modify HubScreen.tsx to display ProfileCard with on-chain profile data (FR-002)
- [x] T019 [US1] Add profile existence check on wallet connect - redirect to ProfileCreationScreen if no profile (FR-001)
- [x] T020 [US1] Add loading states during profile fetch and creation operations (FR-004)
- [x] T021 [US1] Add error handling with user-friendly messages for profile operations (FR-021)
- [x] T022 [US1] Integrate ProfileContext into app navigation - show ProfileCreationScreen for new wallets

**Checkpoint**: User Story 1 complete - new players can onboard and see profile in hub

---

## Phase 4: User Story 2 - Campaign Level Selection (Priority: P2)

**Goal**: Players see campaign levels based on currentLevel, can select levels to play with on-chain seeds

**Independent Test**: View campaign selection, verify unlocked levels available, select level and verify correct seed used

### Implementation for User Story 2

- [x] T023 [US2] Implement useMapGenerator hook at src/hooks/useMapGenerator.ts with getSeed, getCampaignLevels
- [x] T024 [US2] Add MapConfig PDA fetch to useMapGenerator using ["map_config"] seeds
- [x] T025 [US2] Implement getCampaignLevels function returning level unlock status based on player currentLevel
- [x] ~~T026 [US2] Implement getCampaignTiers function returning tier info with unlock costs~~ N/A - tier system not on-chain
- [x] T027 [P] [US2] Create CampaignSelectScreen at src/screens/CampaignSelectScreen.tsx with level grid
- [x] T028 [US2] Add level filtering - show locked indicator for levels beyond player currentLevel (FR-007)
- [x] ~~T029 [US2] Add unlock prompt display for locked tiers with 0.05 SOL cost (FR-010)~~ N/A - tier system not on-chain
- [x] T030 [US2] Integrate on-chain seed into map generation - SessionContext.getMapSeedForLevel() implemented (FR-008)
- [x] T031 [US2] Add seed verification before game start (FR-009)
- [x] T032 [US2] Connect CampaignSelectScreen to navigation from HubScreen

**Checkpoint**: User Story 2 complete - players can select campaign levels with on-chain seeds

---

## Phase 5: User Story 3 - Tier Unlock Payment (Priority: P3)

**⚠️ SKIPPED**: Tier unlock system was not implemented on-chain. The Solana program uses `available_runs` instead of tier-based unlocking. These tasks are N/A.

~~**Goal**: Players can pay 0.05 SOL to unlock next 40 campaign levels~~

### Implementation for User Story 3

- [x] ~~T033 [US3] Add unlockNextTier method to usePlayerProfile hook calling unlockCampaignTier instruction~~ N/A
- [x] ~~T034 [US3] Add Treasury PDA derivation using ["treasury"] seeds~~ N/A
- [x] ~~T035 [P] [US3] Create TierUnlockModal at src/components/profile/TierUnlockModal.tsx~~ N/A
- [x] ~~T036 [US3] Add balance check before unlock attempt~~ N/A
- [x] ~~T037 [US3] Display 0.05 SOL cost clearly in TierUnlockModal~~ N/A
- [x] ~~T038 [US3] Process tier unlock transaction~~ N/A
- [x] ~~T039 [US3] Add transaction status feedback during unlock process~~ N/A
- [x] ~~T040 [US3] Integrate TierUnlockModal into CampaignSelectScreen~~ N/A

**Checkpoint**: SKIPPED - On-chain program uses available_runs model instead of tier payments

---

## Phase 6: User Story 4 - Game Session with On-Chain State (Priority: P4)

**Goal**: Game sessions created on-chain, delegated to ephemeral rollup, state committed, results recorded

**Independent Test**: Start game, play through run, verify session creation, state commits, and run result recording

### Implementation for User Story 4

- [x] T041 [US4] Implement useSessionManager hook at src/hooks/useSessionManager.ts with session state machine
- [x] T042 [US4] Add GameSession PDA derivation using ["session", player] seeds in src/services/solana/types.ts
- [x] T043 [US4] Implement startSession method calling startSession instruction (FR-015)
- [x] T044 [US4] Implement delegateSession method calling delegateSession instruction (FR-016)
- [x] T045 [US4] Add active session check - hasActiveSession state prevents starting new session (FR-020)
- [x] T046 [US4] Implement commitSession method calling commitSession instruction for periodic checkpoints (FR-017)
- [x] T047 [US4] Add 30-second commit interval timer during active gameplay
- [x] T048 [US4] Implement endSession method calling endSession instruction
- [x] T049 [US4] Add recordRunResult method to usePlayerProfile for updating profile after run (FR-018)
- [x] T050 [US4] Create SessionContext at src/contexts/SessionContext.tsx wrapping useSessionManager with map seed integration
- [x] T051 [US4] Handle session status transitions - update UI based on IDLE/STARTING/DELEGATING/ACTIVE/ENDING/FAILED (integrated in CombatScreen)
- [x] T052 [US4] Add session fetch on wallet connect in SessionContext - detects existing sessions (FR-019)
- [x] T053 [US4] Handle boss defeat - call endSession with victory=true, increment level if applicable
- [x] T054 [US4] Handle player defeat - call endSession with victory=false, increment totalRuns only
- [x] T055 [US4] Add error handling for session operations - error state in useSessionManager

**Checkpoint**: User Story 4 complete - full on-chain gameplay loop functional

---

## Phase 7: User Story 5 - Profile Management (Priority: P5)

**Goal**: Players can update display name and view detailed profile statistics

**Independent Test**: Change profile name, verify change persists across app restarts

### Implementation for User Story 5

- [x] T056 [US5] Add updateName method to usePlayerProfile calling updateProfileName instruction (FR-003)
- [x] T057 [US5] Add name validation - max 32 characters check exists in usePlayerProfile.createProfile
- [x] T058 [P] [US5] Create ProfileSettingsScreen at src/screens/ProfileSettingsScreen.tsx with name edit form
- [x] T059 [US5] Add detailed statistics display in ProfileSettingsScreen (totalRuns, currentLevel, availableRuns, createdAt)
- [x] T060 [US5] Add save button with transaction confirmation feedback
- [x] T061 [US5] Add validation error display for invalid names
- [x] T062 [US5] Connect ProfileSettingsScreen to navigation from HubScreen profile section

**Checkpoint**: User Story 5 complete - full profile management available

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Offline support, error handling improvements, and cleanup

- [x] T063 Implement offline mode fallback - usePlayerProfile falls back to cached profile on fetch error (FR-022)
- [x] T064 Add guest mode - allow gameplay without profile when fully offline (FR-022)
- [x] T065 Implement offline progress sync - queue run results for later submission (FR-023)
- [x] T066 Add wallet disconnection handling - prompt to reconnect during session
- [x] T067 Add transaction rejection handling - error states in hooks with getUserErrorMessage
- [x] T068 Add profile cache refresh on app foreground
- [x] T069 [P] Add loading skeletons for profile and campaign data
- [x] T070 [P] Add pull-to-refresh on HubScreen and CampaignSelectScreen
- [x] T071 Clean up subscriptions and timers on component unmount (Constitution P07)
- [x] T072 Run quickstart.md verification steps
- [x] T073 Verify all acceptance scenarios from spec.md pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - US1 (P1) should complete first as MVP
  - US2-US5 can proceed after US1 or in parallel
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependencies on other stories - MVP baseline
- **User Story 2 (P2)**: Uses profile data from US1 for tier checking
- **User Story 3 (P3)**: Integrates with US2 campaign selection
- **User Story 4 (P4)**: Depends on US1 (profile) and US2 (level selection)
- **User Story 5 (P5)**: Uses profile hook from US1

### Within Each User Story

- Core hook implementation before UI components
- PDA derivation before transaction methods
- Transaction methods before UI integration
- Error handling throughout

### Parallel Opportunities

**Phase 1 (Setup):**

```
T003, T004, T006 can run in parallel
```

**Phase 3 (US1):**

```
T016, T017 can run in parallel (different components)
```

**Phase 4 (US2):**

```
T027 can run in parallel with hook work
```

**Phase 5 (US3):**

```
T035 can run in parallel with hook work
```

**Phase 7 (US5):**

```
T058 can run in parallel with hook work
```

**Phase 8 (Polish):**

```
T069, T070 can run in parallel
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T006)
2. Complete Phase 2: Foundational (T007-T011)
3. Complete Phase 3: User Story 1 (T012-T022)
4. **STOP and VALIDATE**: Connect wallet, create profile, see profile in hub
5. Deploy/demo if ready

### Incremental Delivery

1. **MVP**: Setup + Foundational + US1 → Players can onboard
2. **+US2**: Add campaign selection → Players can choose levels
3. **+US3**: Add tier unlock → Monetization enabled
4. **+US4**: Add sessions → Full on-chain gameplay
5. **+US5**: Add profile management → Complete feature set
6. **+Polish**: Offline support, error handling → Production ready

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Constitution P10 requires comprehensive tests - add test tasks if TDD requested
