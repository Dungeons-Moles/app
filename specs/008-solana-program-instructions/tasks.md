# Tasks: Solana Program Instructions Integration

**Input**: Design documents from `/specs/008-solana-program-instructions/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in the spec. Test tasks are omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Update IDL files and extend program configuration so all 6 programs are accessible from the frontend.

- [x] T001 Copy all 8 IDL files from `../solana-programs/target/idl/` to `src/services/solana/idl/`, replacing the 4 outdated files (`gameplay_state.json`, `map_generator.json`, `player_profile.json`, `session_manager.json`) and adding 2 new files (`player_inventory.json`, `poi_system.json`)
- [x] T002 [P] Add `EXPO_PUBLIC_PLAYER_INVENTORY_PROGRAM_ID` and `EXPO_PUBLIC_POI_SYSTEM_PROGRAM_ID` environment variables to `.env` and update `src/services/solana/config.ts` to read them
- [x] T003 [P] Add `createPlayerInventoryProgram()`, `createPlayerInventoryProgramWithProvider()`, `createPoiSystemProgram()`, `createPoiSystemProgramWithProvider()` factory functions in `src/services/solana/programs.ts`, importing the new IDLs
- [x] T004 [P] Verify PDA seed constants in `src/services/solana/constants.ts` match the current on-chain programs — confirm seeds for `["map_pois", session]`, `["inventory", session]`, `["poi_authority"]`, and `["map_enemies", session]` are correct. Add `derivePoiAuthorityPda()` and `deriveGeneratedMapPda(sessionPda)` if missing

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create new type definitions and service modules that all user stories depend on.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T005 [P] Create POI system type definitions in `src/services/solana/types/poi_system.ts` — define `PoiInstance`, `ShopState`, `ItemOffer`, `MapPoisData`, `PoiBaseAccounts`, `PoiHealAccounts`, `PoiGoldAccounts` interfaces, and POI type constants (L1-L14) matching the on-chain `poi_system` IDL
- [x] T006 [P] Create inventory type definitions in `src/services/solana/types/player_inventory.ts` — define `ItemInstance`, `PlayerInventoryData`, `ItemType`, `ItemTag`, `Rarity`, `Tier` enums and interfaces matching the on-chain `player_inventory` IDL
- [x] T007 [P] Update combat event types in `src/services/solana/types/combat_events.ts` — add `PhaseAdvancedEvent`, `BossFightReadyEvent`, `PlayerHealedEvent`, `GoldModifiedAuthorizedEvent` interfaces, and update `CombatEventParseResult` to include all event types that `move_player` can now emit
- [x] T008 [P] Update gameplay state types in `src/services/solana/types/gameplay_state.ts` — update `MovePlayerParams` to remove `isWall` (on-chain program reads the map directly), add `MovePlayerAccounts` interface requiring `gameState`, `sessionManager`, `gameSession`, `mapEnemies`, `generatedMap`, `inventory`, `playerInventoryProgram`, `player`, `systemProgram`
- [x] T009 [P] Update error message mapping in `src/services/solana/errors.ts` — add error codes from `poi_system` and `player_inventory` IDLs to `getUserErrorMessage()`
- [x] T010 Create read-only inventory service in `src/services/solana/playerInventory.ts` — implement `fetchInventory(program, inventoryPda): Promise<PlayerInventoryData | null>` that deserializes the on-chain `PlayerInventory` account

**Checkpoint**: Foundation ready — all types, configs, and shared services are in place. User story implementation can now begin.

---

## Phase 3: User Story 1 — Player Profile Creation (Priority: P1) MVP

**Goal**: Players can create an on-chain profile via `initialize_profile` and see their profile data displayed.

**Independent Test**: Connect a fresh wallet, create a profile with a name, verify the PlayerProfile PDA is created with 20 runs, level 1, and 40 starter items.

### Implementation for User Story 1

- [x] T011 [US1] Verify `usePlayerProfile` hook's `createProfile()` in `src/hooks/usePlayerProfile.ts` builds the `initialize_profile` instruction correctly against the updated `player_profile` IDL — ensure the instruction passes `name` parameter and derives the PlayerProfile PDA with seeds `["player", owner.key()]`. Fix any mismatches in account names, field names, or instruction discriminators caused by IDL updates
- [x] T012 [US1] Verify `usePlayerProfile` hook's `fetchProfile()` in `src/hooks/usePlayerProfile.ts` correctly deserializes all fields from the updated PlayerProfile account — confirm it reads `unlocked_items` (10-byte bitmask), `active_item_pool` (10-byte bitmask), `available_runs`, `highest_level_unlocked`, and `name` correctly
- [x] T013 [US1] Verify `ProfileContext` in `src/contexts/ProfileContext.tsx` correctly calls `createProfile()` and `fetchProfile()`, displays the profile state (name, available_runs, highest_level_unlocked), and handles errors (insufficient SOL, network failure) with user-friendly messages
- [x] T014 [US1] Verify name validation in the profile creation flow enforces 1-32 character limit before submitting the transaction — check `AccountScreen.tsx` and `usePlayerProfile.ts`

**Checkpoint**: Profile creation works end-to-end. A new wallet can create a profile and see it displayed.

---

## Phase 4: User Story 2 — Starting a Game Session (Priority: P2)

**Goal**: Players can start a session via `start_session`, which atomically creates all session accounts (GameSession, GeneratedMap, GameState, MapEnemies, PlayerInventory, MapPois), and the app renders the map.

**Independent Test**: Select campaign level 1, verify all 6 session accounts are created, map renders with spawn position.

### Implementation for User Story 2

- [x] T015 [US2] Update `src/services/solana/sessionBundle.ts` — align `createSessionBundle()` with the updated `session_manager` IDL. The `start_session` instruction now handles all sub-account creation via CPI (map generation, game state init, inventory init, POI init). Update the account list to include `player_inventory_program` and `poi_system_program` program IDs, and pass the `map_pois` and `inventory` PDAs. Remove any instructions that are now handled by the on-chain CPI (the bundle may reduce from 5 instructions to 1 if `start_session` now orchestrates everything)
- [x] T016 [US2] Update `SessionPrograms` interface in `src/services/solana/sessionBundle.ts` to include `playerInventory: Program` and `poiSystem: Program` fields, and update all callers in `src/contexts/SessionContext.tsx` to pass these programs
- [x] T017 [US2] Update `SessionContext.startGame()` in `src/contexts/SessionContext.tsx` to use the updated session bundle — ensure it derives all required PDAs (GameSession, MapConfig, GeneratedMap, GameState, MapEnemies, MapPois, PlayerInventory), passes the burner wallet, and fetches the GeneratedMap + GameState after transaction confirmation
- [x] T018 [US2] Verify `SessionContext` detects existing active sessions via `src/hooks/useSessionList.ts` and offers resume/abandon before starting a new session — confirm `checkSessionExists()` correctly derives the GameSession PDA for the given player + campaign_level
- [x] T019 [US2] Verify `SessionContext.endSession()` in `src/contexts/SessionContext.tsx` can manually close a session (for abandon) — ensure it calls the `end_session` instruction with the updated account list including `inventory` PDA and `player_inventory_program`

**Checkpoint**: Session lifecycle works end-to-end. Can start, resume, and abandon sessions.

---

## Phase 5: User Story 3 — Player Movement and Combat (Priority: P3)

**Goal**: Players can move by tapping adjacent tiles. The `move_player` instruction auto-resolves combat, enemy AI movement, phase transitions, boss fights, and session endings. The frontend parses all emitted events to update the UI.

**Independent Test**: Start a session, move to various tiles, verify position updates. Move onto an enemy to trigger combat. Exhaust phase moves to see phase transition. Play through Night3 to trigger auto-boss fight.

### Implementation for User Story 3

- [x] T020 [US3] Update `movePlayer()` in `src/services/solana/gameplayState.ts` — rewrite the instruction call to pass the full account set required by the updated IDL: `game_state`, `session_manager` (program address), `game_session`, `map_enemies`, `generated_map`, `inventory`, `player_inventory_program`, `player` (signer), `system_program`. Remove the `isWall` parameter (no longer needed — the program reads the map directly)
- [x] T021 [US3] Update `useGameplayState.move()` in `src/hooks/useGameplayState.ts` — update the `move()` function to derive and pass all required PDAs (gameSession, mapEnemies, generatedMap, inventory) using the session PDA. Remove `isWall` from `MovePlayerParams`. Update the optimistic update to not assume simple position change (combat may occur)
- [x] T022 [US3] Extend `parseGameplayEvents()` in `src/services/solana/eventParser.ts` — handle all event types that `move_player` can now emit in a single transaction: `PlayerMoved`, `EnemyMoved` (multiple), `CombatStarted`, `CombatEnded`, `CombatLog`, `PhaseAdvanced`, `BossFightReady`, `BossCombatStarted`, `LevelCompleted`, `PlayerDefeated`, `PlayerHealed`, `GoldModifiedAuthorized`. Return a unified `MoveResult` object containing all parsed events
- [x] T023 [US3] Create `MoveResult` type and `parseMoveResult()` function in `src/services/solana/eventParser.ts` — define `MoveResult` interface with fields: `playerMoved`, `enemyMoves[]`, `combat: CombatReplay | null`, `phaseAdvanced`, `bossCombat: CombatReplay | null`, `levelCompleted`, `playerDefeated`. Implement `parseMoveResult()` that calls `parseEventsFromLogs()` and categorizes events into this structure
- [x] T024 [US3] Update `SessionContext.movePlayer()` in `src/contexts/SessionContext.tsx` — after sending the `move_player` transaction, call `parseMoveResult()` on the transaction signature to get the full `MoveResult`. Pass combat events to `CombatReplayContext` for animation. Pass enemy movements to night movement handler. Handle phase transitions by refreshing GameState. Handle `PlayerDefeated` by transitioning to results screen. Handle `LevelCompleted` by transitioning to victory screen
- [x] T025 [US3] Update `GameplayStateContext` in `src/contexts/GameplayStateContext.tsx` — after each move, update `enemies` list from `MoveResult.enemyMoves` (update positions) and mark defeated enemies from `MoveResult.combat`. Update player stats (HP, gold, phase, moves) from refreshed GameState
- [x] T026 [US3] Update `GameScreen` in `src/screens/GameScreen.tsx` — handle the enriched move results: display combat replay when combat occurs during a move, show phase transition overlay when phase advances, show boss fight sequence when boss combat triggers, transition to VictoryScreen on `LevelCompleted`, transition to DeathScreen on `PlayerDefeated`
- [x] T027 [US3] Implement move queueing in `src/hooks/useGameplayState.ts` or `src/contexts/SessionContext.tsx` — add a queue that accepts movement inputs and sends them sequentially, waiting for each transaction to confirm (or fail with rollback) before sending the next. Prevent parallel move submissions that would cause stale-state errors

**Checkpoint**: Full movement loop works. Combat auto-resolves on-chain. Phase transitions happen. Boss fights trigger at Night3 exhaustion. Player death ends session.

---

## Phase 6: User Story 4 — POI Interactions (Priority: P4)

**Goal**: Players can interact with all 14 POI types by sending the correct `poi-system` instruction when standing on a POI tile.

**Independent Test**: Navigate to each POI type on the map and verify the correct instruction is dispatched and the UI reflects the outcome (healing, item choice, shop, upgrades, fast travel, map reveal).

### Implementation for User Story 4

- [x] T028 [P] [US4] Create POI instruction callers in `src/services/solana/poiSystem.ts` — implement `interactRest(connection, program, accounts, burnerKeypair, poiIndex)` for L1 Mole Den and L5 Rest Alcove. Accounts must include `map_pois`, `game_state`, `inventory`, `poi_authority` PDA, and `gameplay_state_program` (for heal CPI)
- [x] T029 [P] [US4] Add `interactPickItem(connection, program, accounts, burnerKeypair, params)` to `src/services/solana/poiSystem.ts` for L2 Supply Cache, L3 Tool Crate, L12 Geode Vault, L13 Counter Cache. Parameters: `poiIndex`, `choiceIndex`, `weakness1`, `weakness2`, `seed`
- [x] T030 [P] [US4] Add `interactToolOil(connection, program, accounts, burnerKeypair, params)` to `src/services/solana/poiSystem.ts` for L4 Tool Oil Rack. Parameters: `poiIndex`, `currentOilFlags`, `modification` (0=ATK, 1=SPD, 2=DIG)
- [x] T031 [P] [US4] Add shop instruction callers to `src/services/solana/poiSystem.ts` — implement `enterShop()`, `shopPurchase()`, `shopReroll()`, `leaveShop()` for L9 Smuggler Hatch. `shopPurchase` and `shopReroll` require `poi_authority` and `gameplay_state_program` accounts for gold CPI
- [x] T032 [P] [US4] Add `discoverWaypoint()` and `fastTravel()` to `src/services/solana/poiSystem.ts` for L8 Rail Waypoint
- [x] T033 [P] [US4] Add `interactSurveyBeacon()` and `interactSeismicScanner()` to `src/services/solana/poiSystem.ts` for L6 Survey Beacon and L7 Seismic Scanner
- [x] T034 [P] [US4] Add `interactRustyAnvil()`, `interactRuneKiln()`, and `interactScrapChute()` to `src/services/solana/poiSystem.ts` for L10, L11, L14. Rusty Anvil and Scrap Chute require gold CPI accounts. Rune Kiln takes two item IDs + tiers
- [x] T035 [US4] Update `usePoiInteraction` hook in `src/hooks/usePoiInteraction.ts` — replace the TODO at line 178 with actual on-chain instruction dispatch. Based on `currentPoi.poiType`, call the correct `poiSystem.*` function. For multi-step interactions (pick item shows choices, shop shows offers), the hook must manage a sub-state machine: `idle` → `choosing` → `confirming` → `complete`
- [x] T036 [US4] Update `usePoiInteraction` to handle POI usage rules in `src/hooks/usePoiInteraction.ts` — check `poiInstance.used` for one-time POIs before allowing interaction. Check game phase (night-only POIs like L1 and L5 should only be interactive during Night phases). Check `discovered` flag for waypoints
- [x] T037 [US4] Add shop sub-flow to `usePoiInteraction` in `src/hooks/usePoiInteraction.ts` — when interacting with L9 (Smuggler Hatch), call `enterShop()` first to generate offers, then expose `shopOffers`, `purchaseItem(index)`, `rerollShop()`, and `exitShop()` methods. Read shop state from `MapPois` account after `enterShop` confirms
- [x] T038 [US4] Add item choice sub-flow to `usePoiInteraction` in `src/hooks/usePoiInteraction.ts` — when interacting with L2, L3, L12, or L13, compute the 3 item offers locally (using the deterministic `generate_offer` view function or by reading POI parameters), display choices to the player, then call `interactPickItem()` with the selected `choiceIndex`
- [x] T039 [US4] Update map rendering after Survey Beacon (L6) and Seismic Scanner (L7) interactions — after `interactSurveyBeacon` confirms, reveal all tiles within radius 13 of the beacon position on the local map. After `interactSeismicScanner`, reveal the nearest POI of the selected category. Update the revealed tiles/POIs in `GameplayStateContext`
- [x] T040 [US4] Update waypoint tracking in `GameplayStateContext` at `src/contexts/GameplayStateContext.tsx` — maintain a list of discovered waypoints (from `MapPois.pois` where `discovered === true`). Expose `discoveredWaypoints` and `canFastTravel(fromIndex, toIndex)` for the UI

**Checkpoint**: All 14 POI types are interactable. Shops work with purchase/reroll/exit. Item choices display and submit. Waypoints enable fast travel. Map reveal works.

---

## Phase 7: User Story 5 — Recording Run Results (Priority: P5)

**Goal**: After a session ends (victory, defeat, or abandon), the app calls `record_run_result` to update lifetime profile statistics.

**Independent Test**: Complete a session, verify `record_run_result` updates `total_runs`, `available_runs`, and (on first victory) `highest_level_unlocked` and unlocked items.

### Implementation for User Story 5

- [x] T041 [US5] Verify `usePlayerProfile.recordRunResult()` in `src/hooks/usePlayerProfile.ts` builds the `record_run_result` instruction correctly against the updated `player_profile` IDL — ensure it passes `level_completed` (u8) and `victory` (bool) parameters and signs with the main wallet (not burner)
- [x] T042 [US5] Verify the run result recording flow in `src/contexts/ProfileContext.tsx` — confirm `handleRecordRunResult()` calls `recordRunResult()` after session end, refreshes the profile to display updated `total_runs`, `available_runs`, `highest_level_unlocked`, and newly unlocked items. Handle the case where a first-time victory triggers an `ItemUnlocked` event
- [x] T043 [US5] Wire `record_run_result` into the session end flow in `src/contexts/SessionContext.tsx` — ensure that after `end_session` completes (or after auto-end from `PlayerDefeated` event), `record_run_result` is called. For deferred cleanup (via `queueEndGame`), ensure both `end_session` and `record_run_result` are queued and processed together in `processPendingCleanups()`
- [x] T044 [US5] Verify offline sync in `src/services/solana/syncQueue.ts` — confirm that when `record_run_result` fails due to network issues, it is queued for retry via the sync queue. Verify `processSyncQueue()` retries up to 3 times and that queued results are eventually recorded when connectivity returns

**Checkpoint**: Full gameplay loop closes. Profile stats update after every session.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories.

- [x] T045 [P] Update `src/services/solana/errors.ts` with comprehensive error messages for all 6 programs — map error codes from each IDL to user-friendly strings
- [x] T046 [P] Add burner wallet balance monitoring to `src/contexts/SessionContext.tsx` — check balance before each transaction (move, POI interaction). If below threshold (0.001 SOL), prompt the player to top up before continuing
- [x] T047 Verify state re-fetch on transaction failure across all instruction callers — after any failed transaction, the app must re-fetch the relevant on-chain accounts (GameState, MapPois, PlayerInventory) to ensure UI reflects true state. Check `useGameplayState.move()`, `usePoiInteraction.interact()`, and `SessionContext.startGame()`
- [x] T048 Run quickstart.md validation — follow the verification steps in `specs/008-solana-program-instructions/quickstart.md` to confirm the full gameplay loop works: profile creation → session start → movement with combat → POI interaction → run result recording

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (IDLs must be updated first)
- **User Stories (Phase 3-7)**: All depend on Phase 2 completion
  - US1 (Profile): Independent — no dependency on other stories
  - US2 (Session): Independent — needs profile to exist but doesn't depend on US1 code changes
  - US3 (Movement): Depends on US2 (needs active session to move)
  - US4 (POI): Depends on US3 (needs movement to reach POI tiles)
  - US5 (Run Result): Depends on US2 (needs session end trigger)
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

```
Phase 1 (Setup) ──→ Phase 2 (Foundational)
                          │
                          ├──→ US1 (Profile) ─────────────────────────────────┐
                          ├──→ US2 (Session) ──→ US3 (Movement) ──→ US4 (POI)├──→ Phase 8 (Polish)
                          └──→ US5 (Run Result) ─────────────────────────────┘
```

### Within Each User Story

- Types/models before service functions
- Service functions before hooks
- Hooks before context/screen updates
- Core implementation before integration

### Parallel Opportunities

**Phase 1**: T002, T003, T004 can run in parallel (different files)
**Phase 2**: T005, T006, T007, T008, T009 can all run in parallel (separate type files)
**Phase 3 (US1)**: T011, T012 can run in parallel (verify different functions)
**Phase 4 (US2)**: T015, T016 should be sequential (same file)
**Phase 6 (US4)**: T028-T034 can all run in parallel (separate instruction functions in same file, but no interdependency)

---

## Parallel Example: Phase 2 (Foundational)

```
# All type definition tasks can run in parallel:
T005: Create POI types in src/services/solana/types/poi_system.ts
T006: Create inventory types in src/services/solana/types/player_inventory.ts
T007: Update combat event types in src/services/solana/types/combat_events.ts
T008: Update gameplay state types in src/services/solana/types/gameplay_state.ts
T009: Update error messages in src/services/solana/errors.ts
```

## Parallel Example: Phase 6 (US4 — POI Instruction Callers)

```
# All POI instruction callers can be written in parallel:
T028: interactRest (L1, L5)
T029: interactPickItem (L2, L3, L12, L13)
T030: interactToolOil (L4)
T031: Shop callers (L9)
T032: Waypoint callers (L8)
T033: Beacon/Scanner callers (L6, L7)
T034: Anvil/Kiln/Chute callers (L10, L11, L14)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (IDL updates, config)
2. Complete Phase 2: Foundational (types, service modules)
3. Complete Phase 3: User Story 1 (profile creation)
4. **STOP and VALIDATE**: Connect wallet, create profile, verify on-chain
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. US1 (Profile) → Onboarding works → Demo MVP
3. US2 (Session) → Can start sessions → Demo
4. US3 (Movement) → Core gameplay → Demo
5. US4 (POI) → Strategic depth → Demo
6. US5 (Run Result) → Loop closes → Full feature complete
7. Polish → Production-ready

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Most instruction callers already exist — many tasks are "verify and fix" rather than "build from scratch"
- The biggest new work is: POI instruction callers (T028-T034), move event parsing (T022-T023), and POI hook wiring (T035-T040)
- IDL updates (T001) may cause compile errors in existing code — fix these as part of the verification tasks in each user story
