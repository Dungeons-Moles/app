# Research: Solana Program Instructions Integration

**Feature**: 008-solana-program-instructions
**Date**: 2026-01-27

## R1: IDL File Synchronization Strategy

**Decision**: Copy all 8 IDL files from `../solana-programs/target/idl/` to `src/services/solana/idl/`, replacing the 4 outdated files and adding 2 new ones (`player_inventory.json`, `poi_system.json`).

**Rationale**: The solana-programs have evolved significantly. The app's current IDLs are from January 17-18, while the programs were last built January 25-27. Key differences:
- `gameplay_state.json`: 14KB → 49KB (3.5x larger — now includes combat events, enemy tracking, boss fights, phase management)
- `session_manager.json`: 13KB → 18KB (new accounts for POI and inventory initialization)
- `player_profile.json`: 7KB → 11.6KB (item unlock bitmask, expanded profile fields)
- `map_generator.json`: 10KB → 12KB (POI spawns added to generated map)

**Alternatives considered**:
- Auto-generate IDLs from anchor build in CI → Rejected: adds build complexity, not needed for 6 programs
- Symlink to solana-programs IDLs → Rejected: breaks when repos are on different machines

## R2: move_player Account Requirements

**Decision**: The `move_player` instruction now requires significantly more accounts than the current frontend passes. The service function must be updated to derive and include:
- `game_state` (mut) — existing
- `session_manager` program address — new (for CPI validation)
- `game_session` (mut) — new (for auto-end on death)
- `map_enemies` (mut) — new (enemy movement + combat)
- `generated_map` — new (walkability + enemy spawn data)
- `inventory` — new (item effects for combat)
- `player_inventory_program` — new (for gear slot expansion CPI)
- `player` (signer) — existing
- `system_program` — existing

**Rationale**: `move_player` now resolves combat on-chain using equipped items, moves enemies during night phases, triggers boss fights, and can end the session — all of which require access to additional accounts.

**Alternatives considered**:
- Keep separate frontend combat resolution → Rejected: on-chain combat is now canonical, frontend must consume it
- Batch move + combat as separate instructions → Rejected: the program handles this atomically

## R3: POI Instruction Architecture

**Decision**: Create a single `poiSystem.ts` service file with one exported function per POI instruction (14 functions), not a generic dispatcher. Each function takes the specific parameters required by that POI type.

**Rationale**: P02 (No Clever Abstractions) prohibits generic handlers. Each POI type has different parameters, validation rules, and CPI patterns. Individual functions are more readable and debuggable.

**Functions to create**:
1. `interactRest(poiIndex)` — L1 Mole Den, L5 Rest Alcove
2. `interactPickItem(poiIndex, choiceIndex, weakness1, weakness2, seed)` — L2, L3, L12, L13
3. `interactToolOil(poiIndex, currentOilFlags, modification)` — L4
4. `enterShop(poiIndex, weakness1, weakness2, seed)` — L9
5. `shopPurchase(offerIndex)` — L9 sub-action
6. `shopReroll(weakness1, weakness2, seed)` — L9 sub-action
7. `leaveShop()` — L9 sub-action
8. `discoverWaypoint(poiIndex)` — L8
9. `fastTravel(fromPoiIndex, toPoiIndex)` — L8
10. `interactSurveyBeacon(poiIndex)` — L6
11. `interactSeismicScanner(poiIndex, category)` — L7
12. `interactRustyAnvil(poiIndex, itemId, currentTier)` — L10
13. `interactRuneKiln(poiIndex, item1Id, item1Tier, item2Id, item2Tier)` — L11
14. `interactScrapChute(poiIndex, itemId)` — L14

**Alternatives considered**:
- Single `interactPoi(type, params)` generic function → Rejected: violates P02, harder to type safely
- Inline POI calls in the hook → Rejected: mixes concerns, harder to test

## R4: Event Parsing for Enriched move_player

**Decision**: Extend `eventParser.ts` to handle all event types that can now come from a single `move_player` transaction:
- `PlayerMoved` — position update
- `EnemyMoved` — night phase enemy AI (multiple per move)
- `CombatStarted` / `CombatEnded` / `CombatLog` — auto-combat with field enemies
- `PhaseAdvanced` — day/night transitions
- `BossFightReady` — boss trigger signal
- `BossCombatStarted` — boss fight initiated
- `LevelCompleted` — level cleared after week 3 boss
- `PlayerDefeated` — player died
- `PlayerHealed` — from POI CPI
- `GoldModifiedAuthorized` — from POI CPI

**Rationale**: A single `move_player` call can now emit 10+ events in one transaction. The frontend must parse all of them to correctly update UI state.

**Alternatives considered**:
- Poll account state after each move instead of parsing events → Rejected: loses combat replay data, adds latency
- Parse only some events and poll for the rest → Rejected: inconsistent, harder to debug

## R5: Transaction Signing for POI Interactions

**Decision**: POI interactions will be signed by the burner wallet, same as `move_player`. The burner wallet is the `player` signer for all in-session instructions.

**Rationale**: The burner wallet pattern is already established for gasless gameplay. POI interactions happen during the same session as movement. Using the main wallet would require user confirmation for every POI interaction, breaking gameplay flow.

**Alternatives considered**:
- Main wallet signing for POI interactions → Rejected: interrupts gameplay with signing prompts
- Pre-sign POI transactions → Rejected: unnecessary complexity, burner wallet already handles this

## R6: Inventory Program Integration Scope

**Decision**: Add the `player_inventory` IDL and program factory, but limit instruction callers to what the frontend needs to call directly. Most inventory operations (equip, fuse, expand) are called via CPI from other programs. The frontend only needs:
- `fetchInventory()` — read inventory state for display
- Inventory types for parsing equipment in combat events

**Rationale**: `equip_tool`, `equip_gear`, `unequip_gear`, and `fuse_items` are called by the frontend in response to POI interactions (pick item, rune kiln). However, these are initiated through the POI system, which handles the game logic. The frontend calls the POI instruction, and the POI program handles inventory changes via CPI.

**Alternatives considered**:
- Build all inventory instruction callers → Rejected: most are CPI-only, not called by frontend
- Skip inventory program entirely → Rejected: need to read inventory state for display
