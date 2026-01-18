# Tasks: Gameplay State Integration with Burner Wallet

**Input**: Design documents from `/specs/005-gameplay-burner-integration/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (IDL and Types)

**Purpose**: Copy IDL and create type definitions from gameplay-state program

- [x] T001 Create IDL directory at src/services/solana/idl/ if not exists
- [x] T002 Copy gameplay_state.json IDL from solana-programs/target/idl/ to src/services/solana/idl/gameplay_state.json
- [x] T003 [P] Create gameplay-state types in src/services/solana/types/gameplay_state.ts with GameState, Phase, StatType interfaces per contracts/gameplay-state-client.md
- [x] T004 [P] Add GAMEPLAY_STATE_PROGRAM_ID constant to src/services/solana/constants.ts

---

## Phase 2: Foundational (Burner Wallet Service)

**Purpose**: Core burner wallet infrastructure that MUST be complete before user stories

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Create burner wallet service at src/services/solana/burnerWallet.ts with StoredBurner interface per contracts/burner-wallet.md
- [x] T006 Implement createBurnerWallet() function in src/services/solana/burnerWallet.ts using Keypair.generate() and expo-secure-store per RD-001
- [x] T007 Implement loadBurnerWallet() function in src/services/solana/burnerWallet.ts with main wallet address validation per RD-001
- [x] T008 Implement clearBurnerWallet() function in src/services/solana/burnerWallet.ts
- [x] T009 Implement createFundBurnerTransaction() in src/services/solana/burnerWallet.ts with DEFAULT_FUND_AMOUNT per RD-002
- [x] T010 Implement drainBurnerToMain() in src/services/solana/burnerWallet.ts per RD-008
- [x] T011 Implement checkBurnerBalance() in src/services/solana/burnerWallet.ts with LOW_BALANCE_THRESHOLD per RD-002
- [x] T012 Implement sendBurnerTransaction() in src/services/solana/burnerWallet.ts for direct keypair signing per RD-005
- [x] T013 Add getBurnerInfo() utility function in src/services/solana/burnerWallet.ts per contracts/burner-wallet.md

**Checkpoint**: Burner wallet service ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Seamless Gameplay Session (Priority: P1) 🎯 MVP

**Goal**: Players can make moves without wallet signature prompts after initial session setup

**Independent Test**: Start game session, make multiple moves and dig through walls, verify moves execute instantly without signature prompts

### Implementation for User Story 1

- [x] T014 [P] [US1] Create gameplay-state program client at src/services/solana/gameplayState.ts with getGameStatePda() function per RD-003
- [x] T015 [P] [US1] Add error message mapping GAMEPLAY_ERROR_MESSAGES in src/services/solana/gameplayState.ts per RD-010
- [x] T016 [US1] Implement initializeGameState() in src/services/solana/gameplayState.ts using Anchor typed IDL per contracts/gameplay-state-client.md
- [x] T017 [US1] Implement movePlayer() in src/services/solana/gameplayState.ts with burner keypair signing per contracts/gameplay-state-client.md
- [x] T018 [US1] Implement modifyStat() in src/services/solana/gameplayState.ts per contracts/gameplay-state-client.md
- [x] T019 [US1] Implement closeGameState() in src/services/solana/gameplayState.ts per contracts/gameplay-state-client.md
- [x] T020 [US1] Create useBurnerWallet hook at src/hooks/useBurnerWallet.ts with 5-state machine (idle, funding, active, draining, failed) per RD-004
- [x] T021 [US1] Implement createAndFund() in useBurnerWallet hook that creates burner and prompts main wallet to fund per data-model.md Session Start Flow
- [x] T022 [US1] Implement topUp() in useBurnerWallet hook for mid-session funding per FR-007
- [x] T023 [US1] Implement drain() and clear() in useBurnerWallet hook per data-model.md Session End Flow
- [x] T024 [US1] Create useGameplayState hook at src/hooks/useGameplayState.ts with initialize, move, modifyStat, close methods per contracts/gameplay-state-client.md
- [x] T025 [US1] Integrate useBurnerWallet with useGameplayState to use burner for all transactions in src/hooks/useGameplayState.ts
- [x] T026 [US1] Extend SessionContext.tsx to create burner wallet and initialize GameState on startGame() per plan.md
- [x] T027 [US1] Extend SessionContext.tsx to close GameState and drain burner on endGame() per plan.md
- [ ] T028 [US1] Verify floor movement deducts 1 move without signature prompt
- [ ] T029 [US1] Verify wall digging deducts max(2, 6-DIG) moves without signature prompt

**Checkpoint**: User Story 1 complete - gasless gameplay works with 1 signature at start

---

## Phase 4: User Story 2 - On-Chain State Visibility (Priority: P2)

**Goal**: UI displays position, stats, phase, week from on-chain GameState data

**Independent Test**: Start session, make moves, verify UI displays data fetched from on-chain GameState account

### Implementation for User Story 2

- [x] T030 [P] [US2] Implement fetchGameState() in src/services/solana/gameplayState.ts per contracts/gameplay-state-client.md
- [x] T031 [P] [US2] Create SyncStatusIndicator component at src/components/common/SyncStatusIndicator.tsx showing synced/syncing/offline/error states per data-model.md
- [x] T032 [US2] Implement syncGameplayState() in src/hooks/useGameplayState.ts per RD-006 with optimistic updates
- [x] T033 [US2] Add syncStatus state to useGameplayState hook ('synced' | 'syncing' | 'offline' | 'error') per contracts/gameplay-state-client.md
- [x] T034 [US2] Create GameplayStateContext at src/contexts/GameplayStateContext.tsx providing on-chain state to UI per plan.md
- [x] T035 [US2] Add auto-sync after each transaction in useGameplayState hook per RD-006
- [x] T036 [US2] Add reconciliation logic to trust on-chain state if local differs per data-model.md State Synchronization Rules
- [x] T037 [US2] Display position (x, y) from on-chain state in game UI
- [x] T038 [US2] Display stats (HP, ATK, ARM, SPD, DIG) from on-chain state in game UI
- [x] T039 [US2] Display phase and week from on-chain state in game UI
- [x] T040 [US2] Display movesRemaining and gearSlots from on-chain state in game UI
- [x] T041 [US2] Handle phase transitions triggered by on-chain logic per FR-013
- [x] T042 [US2] Display bossFightReady state when triggered on-chain per FR-014

**Checkpoint**: User Story 2 complete - UI shows verified on-chain data

---

## Phase 5: User Story 3 - Session Lifecycle Management (Priority: P3)

**Goal**: Proper session start, resume, and end with fund return

**Independent Test**: Start session, close app mid-session, reopen, verify session detected and resumed

### Implementation for User Story 3

- [x] T043 [P] [US3] Create BurnerBalanceIndicator component at src/components/common/BurnerBalanceIndicator.tsx showing SOL balance per plan.md
- [x] T044 [P] [US3] Create offline sync queue service at src/services/solana/syncQueue.ts with QueuedTransaction interface per RD-007
- [x] T045 [US3] Implement checkForPendingSession() in src/services/solana/burnerWallet.ts per RD-009
- [ ] T046 [US3] Implement session recovery UI that offers resume/abandon options per FR-015 and RD-009
- [x] T047 [US3] Create useOfflineSync hook at src/hooks/useOfflineSync.ts with processQueue() per RD-007
- [ ] T048 [US3] Add transaction queueing when offline in useGameplayState hook per FR-020
- [x] T049 [US3] Add retry logic with MAX_RETRIES=3 and RETRY_DELAY_MS=2000 per RD-007
- [x] T050 [US3] Implement low balance warning when burner drops below threshold per FR-006
- [x] T051 [US3] Add top-up flow triggered by low balance warning per FR-007
- [x] T052 [US3] Handle wallet disconnection during active session per FR-021
- [x] T053 [US3] Implement session cleanup sequence: close GameState → end GameSession → drain burner per FR-017
- [ ] T054 [US3] Verify 100% of ended sessions return remaining burner funds per SC-004
- [ ] T055 [US3] Verify interrupted sessions are correctly resumed per SC-005

**Checkpoint**: User Story 3 complete - session lifecycle fully managed

---

## Phase 6: User Story 4 - Run Completion and Recording (Priority: P4)

**Goal**: Completed runs recorded to player profile

**Independent Test**: Complete a run (reach boss fight ready), verify profile totalRuns increments

### Implementation for User Story 4

- [ ] T056 [US4] Implement run recording on session end - increment totalRuns in ProfileContext per FR-018
- [ ] T057 [US4] Update currentLevel in profile if campaign level completed for first time per spec.md US4 scenario 2
- [ ] T058 [US4] Handle abandoned runs - increment totalRuns but not currentLevel per spec.md US4 scenario 3
- [ ] T059 [US4] Add main wallet signature for profile update at session end per data-model.md Session End Flow
- [ ] T060 [US4] Verify totalRuns increments correctly after boss fight ready state
- [ ] T061 [US4] Verify currentLevel updates on first-time victory

**Checkpoint**: User Story 4 complete - runs recorded to profile

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Error handling, validation, and final integration

- [x] T062 [P] Add comprehensive error messages for all transaction failures per FR-019
- [x] T063 [P] Add loading states for all async operations per Constitution P06
- [x] T064 [P] Validate on-chain state before displaying to prevent stale data per FR-022
- [x] T065 Run npm run typecheck and fix any TypeScript errors
- [x] T066 Run npm run lint and fix any linting issues
- [ ] T067 Test full session flow: connect → start → play → end → verify funds returned
- [ ] T068 Verify only 2 wallet signatures required per session per SC-001
- [ ] T069 Verify 95% of move transactions confirm within 2 seconds per SC-002
- [ ] T070 Verify state sync within 2 seconds of transaction confirmation per SC-003
- [ ] T071 Run quickstart.md verification checklist
- [ ] T072 Test edge case: burner runs out of SOL mid-game
- [ ] T073 Test edge case: network unavailable during move
- [ ] T074 Test edge case: main wallet disconnects mid-session

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US1 (Seamless Gameplay) must complete first as it provides core burner + gameplay integration
  - US2 (State Visibility) can start after US1 move/stat methods exist
  - US3 (Lifecycle) can run in parallel with US2, depends on US1
  - US4 (Recording) depends on US3 session end logic
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependencies on other stories - MVP baseline
- **User Story 2 (P2)**: Requires US1 gameplay-state client methods (fetchGameState uses same service)
- **User Story 3 (P3)**: Requires US1 burner wallet lifecycle methods
- **User Story 4 (P4)**: Requires US3 session end flow

### Within Each User Story

- Services before hooks
- Hooks before contexts
- Core logic before UI components
- Integration before verification tasks

### Parallel Opportunities

**Phase 1 (Setup):**

```
T003, T004 can run in parallel (different files)
```

**Phase 3 (US1):**

```
T014, T015 can run in parallel (different functions in same file)
```

**Phase 4 (US2):**

```
T030, T031 can run in parallel (different files)
```

**Phase 5 (US3):**

```
T043, T044 can run in parallel (different files)
```

**Phase 7 (Polish):**

```
T062, T063, T064 can run in parallel (different concerns)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T013)
3. Complete Phase 3: User Story 1 (T014-T029)
4. **STOP and VALIDATE**: Start game, make moves without signature prompts
5. Deploy/demo if ready for hackathon

### Incremental Delivery

1. **MVP**: Setup + Foundational + US1 → Gasless gameplay works
2. **+US2**: Add state visibility → UI shows verified on-chain data
3. **+US3**: Add lifecycle management → Sessions recoverable, funds safe
4. **+US4**: Add run recording → Progress persists
5. **+Polish**: Production ready

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Burner wallet service (Phase 2) is critical path for all stories
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
