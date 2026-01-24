# Feature Specification: Core Gameplay Loop Integration

**Feature Branch**: `007-core-loop-integration`  
**Created**: 2026-01-22  
**Status**: Draft  
**Input**: Integrate Solana core gameplay loop programs with React Native frontend - session creation, movement with combat, night mechanics, POI interaction, boss fights, death/victory handling, multi-session support, run economy, and item progression

## Overview

This feature integrates the core gameplay loop Solana programs (010-core-gameplay-loop) with the mobile app frontend. The integration enables:

- Atomic session creation with SOL transfer to burner wallet
- Movement with automatic combat resolution and event display
- Night-phase enemy movement visualization
- POI interaction with position validation
- Boss combat display at week end
- Death/victory handling with progression unlocks
- Multi-session management across campaign levels
- Run economy with purchase flow
- Item unlock progression display

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Atomic Session Creation (Priority: P1)

A player wants to start a new dungeon run on a specific campaign level. They select the level, confirm the action, and sign a single transaction. The app bundles 5 instructions (session creation, game state initialization, enemy spawning, POI spawning, and inventory setup), transfers SOL to the burner wallet, and drops them into the game with their Basic Pickaxe equipped.

**Why this priority**: This is the entry point for all gameplay. Without session creation, no dungeon runs are possible.

**Independent Test**: Select a campaign level, sign the transaction, verify the game starts with map, enemies, POIs, and Basic Pickaxe visible. Verify burner wallet received SOL.

**Acceptance Scenarios**:

1. **Given** a player with available runs and an unlocked level, **When** they select a campaign level and confirm, **Then** they sign one transaction and the game loads with deterministic map, enemies, and POIs.
2. **Given** a player starting a session, **When** the transaction completes, **Then** their burner wallet receives the configured SOL amount for gameplay fees.
3. **Given** a player starting a session, **When** the game loads, **Then** they see their character equipped with Basic Pickaxe (1 ATK, no tags, Common tier) in the inventory display.
4. **Given** a player with no available runs, **When** they attempt to start a session, **Then** they are prompted to purchase runs before proceeding.
5. **Given** a player attempting to start a locked level, **When** they select it, **Then** they see a "Level Locked" message with requirements to unlock.
6. **Given** a player with an existing session on level 5, **When** they start a session on level 3, **Then** the new session is created independently.

---

### User Story 2 - Movement with Combat Display (Priority: P1)

A player moves their character to an adjacent tile. If the tile contains an enemy, combat automatically triggers. The app displays the full combat sequence using events emitted from the program, showing each turn's damage, status effects, and final outcome. The burner wallet signs all movement transactions automatically.

**Why this priority**: Movement and combat are the core gameplay actions that players perform throughout every run.

**Independent Test**: Move to a tile containing an enemy, verify combat animation plays showing all turns, verify correct outcome (enemy defeated or player death).

**Acceptance Scenarios**:

1. **Given** an active session, **When** the player moves to an adjacent floor tile with no enemy, **Then** the move executes instantly via burner wallet with no signature prompt.
2. **Given** an active session, **When** the player moves to a wall tile, **Then** the move costs max(2, 6-DIG) moves and the wall is "dug through".
3. **Given** a player moving to a tile with an enemy, **When** the transaction completes, **Then** the app displays the combat sequence: combat start, each turn's attacks and damage, status effects, and final result.
4. **Given** combat where the player wins, **When** combat ends, **Then** the enemy disappears from the map, gold is awarded, and the player remains on the tile.
5. **Given** combat where the player loses, **When** combat ends, **Then** the death handling flow begins (see User Story 6).
6. **Given** a player at map boundaries, **When** they attempt to move outside, **Then** the move is blocked with visual feedback (no transaction sent).

---

### User Story 3 - Night Enemy Movement (Priority: P1)

During night phases, enemies within 3 tiles (Chebyshev distance) of the player move toward them. The app visualizes enemy movement before the player's move resolves. If an enemy moves onto the player's tile, combat triggers from the enemy's perspective.

**Why this priority**: Night mechanics add strategic tension and are core to the Day/Night cycle that defines each week's gameplay.

**Independent Test**: Enter night phase with enemies nearby, make a move, verify enemies animate toward player, verify combat triggers if they reach player.

**Acceptance Scenarios**:

1. **Given** night phase with an enemy 2 tiles away, **When** the player makes a move, **Then** the app animates the enemy moving 1 tile closer before the player's movement.
2. **Given** night phase with an enemy 4+ tiles away, **When** the player makes a move, **Then** that enemy does not move.
3. **Given** an enemy that moves onto the player's current tile during night, **When** this happens, **Then** combat is displayed with the enemy as the aggressor.
4. **Given** multiple enemies within range during night, **When** the player moves, **Then** all nearby enemies animate in sequence based on `EnemyMoved` events.
5. **Given** day phase, **When** the player moves, **Then** no enemies move regardless of distance.
6. **Given** an enemy moved during night, **When** the phase changes to day, **Then** the enemy's new position is displayed and persists.

---

### User Story 4 - POI Interaction (Priority: P1)

A player can interact with Points of Interest (chests, shops, shrines) but only when standing on the POI's tile. The app validates position before allowing interaction. POIs are not auto-triggered on movement - the player must explicitly interact.

**Why this priority**: POIs provide loot, items, and strategic choices essential to run progression.

**Independent Test**: Move to a POI tile, tap interact, verify interaction succeeds. Try to interact with a POI from an adjacent tile, verify it fails.

**Acceptance Scenarios**:

1. **Given** a player standing on a chest POI, **When** they tap the interact button, **Then** the chest opens and rewards are displayed.
2. **Given** a player standing on a tile without a POI, **When** they tap interact, **Then** the button is disabled or shows "Nothing to interact with".
3. **Given** a player moving onto a POI tile, **When** they arrive, **Then** the POI is NOT auto-triggered - they see an interact prompt instead.
4. **Given** a player at a shop POI, **When** they interact, **Then** they see shop inventory filtered by their active item pool (from session).
5. **Given** a player interacting with a consumed POI (e.g., opened cache), **When** they try to interact again, **Then** they see "Already collected" or similar.

---

### User Story 5 - Boss Combat at Week End (Priority: P1)

When the player exhausts all moves in the final night phase of a week (Night 3), boss combat automatically triggers. The app displays the boss combat sequence with all turns. Victory at Week 1/2 advances to the next week; victory at Week 3 completes the level.

**Why this priority**: Boss fights are the climactic moments of each week and gate progression through the campaign.

**Independent Test**: Reach the final move of Night 3, verify boss combat auto-triggers, verify correct outcome handling (advance week or complete level).

**Acceptance Scenarios**:

1. **Given** a player on Night 3 with 1 move remaining, **When** they use that move, **Then** boss combat automatically begins after the move resolves.
2. **Given** boss combat in progress, **When** the player watches, **Then** they see the full combat sequence with boss intro, each turn, and final result.
3. **Given** the player defeats a Week 1 or Week 2 boss, **When** combat ends, **Then** they advance to the next week with 2 additional gear slots unlocked.
4. **Given** the player defeats the Week 3 boss, **When** combat ends, **Then** the victory handling flow begins (see User Story 7).
5. **Given** the player loses to any boss, **When** combat ends, **Then** the death handling flow begins (see User Story 6).
6. **Given** the player is in boss combat, **When** the boss uses multi-phase mechanics, **Then** the UI displays phase transitions clearly.

---

### User Story 6 - Death Handling (Priority: P1)

When a player dies (HP reaches 0 from enemy, night combat, or boss), the session closes atomically. One run is deducted from their profile, total runs increments, and they return to the hub. The app shows a death summary screen.

**Why this priority**: Proper death handling ensures game state consistency and closes the gameplay loop cleanly.

**Independent Test**: Trigger a combat that kills the player, verify session closes, verify run count updates, verify death screen shows.

**Acceptance Scenarios**:

1. **Given** a player with 5 HP fighting an enemy that deals 10 damage, **When** HP reaches 0, **Then** the app shows a death screen with run summary (moves, gold, level reached).
2. **Given** player death, **When** the death transaction completes, **Then** their `available_runs` has decreased by 1 and `total_runs` has increased by 1.
3. **Given** player death, **When** they dismiss the death screen, **Then** they return to the hub/level selection without the closed session.
4. **Given** a player with only 1 run remaining who dies, **When** they return to hub, **Then** they are prompted to purchase more runs.
5. **Given** player death, **When** the death occurred during night enemy attack, **Then** the death screen indicates "Killed by [enemy type] during night".

---

### User Story 7 - Victory and Level Unlock (Priority: P1)

When a player defeats the Week 3 boss, they complete the level. If this is their first time beating this level (highest_level_unlocked advances), the next level unlocks and a random item is unlocked. The app displays a victory screen with unlocks.

**Why this priority**: Victory rewards drive player engagement and progression through the campaign.

**Independent Test**: Complete a level for the first time, verify level unlock, verify item unlock animation, verify profile updates.

**Acceptance Scenarios**:

1. **Given** a player completing level 5 for the first time, **When** victory is achieved, **Then** they see a victory screen showing "Level 6 Unlocked!".
2. **Given** first-time level completion, **When** an item unlocks, **Then** the app displays an item unlock animation with the new item's name and stats.
3. **Given** a player replaying level 3 (already beaten), **When** they achieve victory, **Then** no level or item unlock occurs, just a standard victory screen.
4. **Given** victory, **When** the player dismisses the victory screen, **Then** they return to hub with updated profile (runs, levels).
5. **Given** a player completing level 40 (max), **When** victory is achieved, **Then** no level unlock (already max) but item may still unlock if any remain.
6. **Given** an item unlock, **When** the unlock happens, **Then** the item is automatically added to the player's active item pool for future runs.

---

### User Story 8 - Multi-Session Management (Priority: P2)

A player can have active sessions on multiple campaign levels simultaneously. The app displays all active sessions and allows switching between them. Each session is independent.

**Why this priority**: Allows flexible gameplay without forcing players to abandon runs to try different levels.

**Independent Test**: Create sessions on levels 1, 3, and 5, verify all appear in session list, verify switching between them loads correct state.

**Acceptance Scenarios**:

1. **Given** a player with sessions on levels 1, 3, and 5, **When** they view the session list, **Then** they see all three sessions with level, week, and position info.
2. **Given** multiple active sessions, **When** the player selects one, **Then** the app loads that session's game state correctly.
3. **Given** a player in a session on level 3, **When** they switch to level 5 session, **Then** level 3 session state is preserved on-chain.
4. **Given** a player attempting to start a second session on the same level, **When** they select that level, **Then** they are prompted to resume existing session or abandon it.
5. **Given** a session list, **When** the player wants to abandon a session, **Then** they can do so with confirmation (ends session, deducts run).

---

### User Story 9 - Run Economy (Priority: P2)

Players start with 20 runs and can purchase 20 additional runs for 0.001 SOL at any time. The app displays current run count and provides a purchase flow.

**Why this priority**: Monetization and player retention mechanism, but not required for core gameplay testing.

**Independent Test**: View run count in profile, purchase runs, verify count increases by 20 and SOL is deducted.

**Acceptance Scenarios**:

1. **Given** a new player creating their profile, **When** profile is initialized, **Then** they see "20 runs available" in their profile.
2. **Given** a player with 5 runs remaining, **When** they navigate to "Purchase Runs", **Then** they see a clear price (0.001 SOL for 20 runs).
3. **Given** a player confirming run purchase, **When** the transaction completes, **Then** their run count increases by 20 and the UI updates immediately.
4. **Given** a player with insufficient SOL, **When** they attempt purchase, **Then** they see "Insufficient balance" with their current SOL shown.
5. **Given** a player with 0 runs, **When** they try to start a session, **Then** they are redirected to the run purchase screen.

---

### User Story 10 - Item Progression Display (Priority: P2)

The app displays the player's unlocked items and progression toward unlocking all 80 items. When a new item unlocks, a special animation plays. The active item pool (items that can appear in runs) is visible.

**Why this priority**: Long-term progression visibility drives player engagement.

**Independent Test**: View item collection, verify 40 starter items shown as unlocked, verify newly unlocked items display correctly.

**Acceptance Scenarios**:

1. **Given** a new player, **When** they view their item collection, **Then** they see 40 starter items (indices 0-39) as "unlocked" and 40 items (indices 40-79) as "locked".
2. **Given** an item unlock event, **When** the app receives `ItemUnlocked`, **Then** an unlock animation plays showing the item.
3. **Given** the item collection screen, **When** viewing, **Then** items show their name, set affiliation, and basic stats.
4. **Given** a player with all 80 items unlocked, **When** they view collection, **Then** they see a "Collection Complete" indicator.
5. **Given** the active item pool screen, **When** viewing, **Then** players see which items can appear in their runs (default: all unlocked).

---

### Edge Cases

- What happens if the burner wallet runs out of SOL mid-game? Display warning with moves remaining estimate, allow top-up, pause gameplay until funded.
- What happens if network is unavailable during a move? Show offline indicator, queue move locally, retry when network returns.
- What happens if combat resolution exceeds display time? Buffer all events, replay at accelerated speed if needed, ensure final state matches on-chain.
- What happens if an enemy and player target the same tile during night? Enemy movement resolves first (deterministic), then player movement, combat triggers as appropriate.
- What happens if the player force-closes the app during combat? On reopen, detect session state, show combat result from on-chain state.
- What happens if session creation transaction partially fails? Transaction is atomic - either all instructions succeed or all fail. Prompt retry.
- What happens when all 40 unlockable items have been unlocked? No item unlock animation, just level progression and victory screen.
- What happens if the player has sessions on 40 levels (max)? They must complete or abandon a session before starting a new one on an unlocked level without active session.

---

## Requirements _(mandatory)_

### Functional Requirements

#### Session Creation & Lifecycle

- **FR-001**: App MUST bundle 5 instructions (start_session, initialize_game_state, spawn_enemies, spawn_pois, initialize_inventory) into a single transaction for session creation.
- **FR-002**: App MUST transfer configurable SOL amount from main wallet to burner wallet during session creation.
- **FR-003**: App MUST validate player has available runs before attempting session creation.
- **FR-004**: App MUST validate campaign level is unlocked before attempting session creation.
- **FR-005**: App MUST use PDA `["session", player, level]` to support multiple sessions on different levels.
- **FR-006**: App MUST display all active sessions and allow switching between them.
- **FR-007**: App MUST allow abandoning a session (with confirmation) which ends it and deducts a run.

#### Movement & Combat

- **FR-008**: App MUST use burner wallet to sign all `move_with_combat` transactions without user prompts.
- **FR-009**: App MUST calculate and display correct move costs (floor=1, wall=max(2, 6-DIG)) before movement.
- **FR-010**: App MUST block movements outside map boundaries with visual feedback (no transaction sent).
- **FR-011**: App MUST listen to and display combat events (`CombatStarted`, `TurnExecuted`, `StatusApplied`, `CombatEnded`) sequentially.
- **FR-012**: App MUST show combat result (damage dealt, status effects, HP changes) for each turn.
- **FR-013**: App MUST remove defeated enemies from the displayed map immediately after combat.
- **FR-014**: App MUST display gold earned after enemy defeat.

#### Night Mechanics

- **FR-015**: App MUST listen to `EnemyMoved` events and animate enemy movement during night phases.
- **FR-016**: App MUST display enemies moving before the player's move resolves.
- **FR-017**: App MUST trigger combat display if an enemy moves into the player's current tile.
- **FR-018**: App MUST indicate current phase (Day/Night) and phase number clearly in the UI.
- **FR-019**: App MUST show enemy threat range (3-tile Chebyshev) during night phases (optional visual overlay).

#### POI Interaction

- **FR-020**: App MUST NOT auto-trigger POI interaction when player moves onto POI tile.
- **FR-021**: App MUST show an interact button when player is standing on an interactable POI.
- **FR-022**: App MUST disable/hide interact button when not on a POI or POI is consumed.
- **FR-023**: App MUST filter shop/cache item offers by session's `active_item_pool`.
- **FR-024**: App MUST call `interact_poi` with position validation happening on-chain.

#### Boss Combat

- **FR-025**: App MUST auto-detect when boss fight triggers (final move of Night 3).
- **FR-026**: App MUST display `BossCombatStarted` event with boss name and stats.
- **FR-027**: App MUST show boss combat turns similar to regular combat.
- **FR-028**: App MUST display week advancement UI (+ gear slots) after Week 1/2 boss victory.
- **FR-029**: App MUST trigger victory flow after Week 3 boss defeat.

#### Death & Victory Handling

- **FR-030**: App MUST detect `PlayerDefeated` event and display death screen with run summary.
- **FR-031**: App MUST update displayed run counts immediately after session ends (death or victory).
- **FR-032**: App MUST display `LevelCompleted` event with total moves and gold earned.
- **FR-033**: App MUST display `ItemUnlocked` event with item details and unlock animation.
- **FR-034**: App MUST show newly unlocked level on victory (if first-time completion).
- **FR-035**: App MUST return player to hub/level selection after dismissing death/victory screen.

#### Run Economy

- **FR-036**: App MUST display current `available_runs` in player profile area.
- **FR-037**: App MUST provide a "Purchase Runs" button accessible from profile or when runs reach 0.
- **FR-038**: App MUST call `purchase_runs` instruction with main wallet signature.
- **FR-039**: App MUST display clear pricing (0.001 SOL for 20 runs) before purchase confirmation.
- **FR-040**: App MUST update run count display immediately after successful purchase.

#### Item Progression

- **FR-041**: App MUST display item collection showing 80 items with unlock status.
- **FR-042**: App MUST indicate 40 starter items (indices 0-39) as unlocked for new players.
- **FR-043**: App MUST play unlock animation when `ItemUnlocked` event is received.
- **FR-044**: App MUST show item set affiliation and basic stats in collection view.
- **FR-045**: App MUST display progress indicator (e.g., "45/80 items unlocked").

#### State Synchronization

- **FR-046**: App MUST sync local game state with on-chain state after each transaction confirmation.
- **FR-047**: App MUST trust on-chain state when local and on-chain states diverge.
- **FR-048**: App MUST detect existing sessions on app launch and offer to resume.
- **FR-049**: App MUST handle burner wallet balance monitoring and warn when low.
- **FR-050**: App MUST provide error messages with retry options for transaction failures.

### Key Entities

- **ActiveSession**: Client-side reference to an on-chain session, including level, week, phase, position, and burner wallet association.

- **CombatReplay**: Sequence of combat events (CombatStarted, TurnExecuted[], StatusApplied[], CombatEnded) used to animate combat sequence.

- **EnemyMovementBatch**: Collection of EnemyMoved events for a single player move during night phase, animated sequentially.

- **ItemCollection**: Player's 80-item progression tracking, with unlock status, derived from `unlocked_items` bitmask.

- **SessionList**: List of all active sessions for the player across different campaign levels, allowing selection and management.

---

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Players can start a new session (5 bundled instructions) with a single wallet signature.
- **SC-002**: Gameplay moves execute instantly via burner wallet with no signature prompts after session start.
- **SC-003**: Combat sequences display all turns within 5 seconds regardless of turn count.
- **SC-004**: Night enemy movement animates within 2 seconds before player movement resolves.
- **SC-005**: Death/victory handling completes and returns player to hub within 3 seconds of final combat turn.
- **SC-006**: Item unlock animation plays within 1 second of receiving `ItemUnlocked` event.
- **SC-007**: Players can switch between active sessions within 3 seconds.
- **SC-008**: Run purchase flow completes successfully in 95% of attempts.
- **SC-009**: 100% of session ends (death or victory) correctly update run counts.
- **SC-010**: App correctly displays all 40 starter items as unlocked for new players.

---

## Assumptions

1. The Solana programs from 010-core-gameplay-loop are deployed and functional on devnet.
2. The existing burner wallet infrastructure from 005-gameplay-burner-integration is available.
3. The existing session management from 004-solana-frontend-integration is extended, not replaced.
4. Players have sufficient SOL in their main wallet to fund burner (minimum 0.01 SOL recommended).
5. Combat events are emitted in order and can be reliably sequenced for display.
6. Map dimensions are 9x9 with deterministic generation based on level seed.
7. Maximum 10 enemies per level, fitting within on-chain account limits.
8. Basic Pickaxe is always equipped at session start (no selection needed).
9. Treasury wallet for run purchases uses a placeholder pubkey until mainnet.
10. Item data (names, stats, set affiliation) is available from static data files in the app.

---

## Out of Scope

- MagicBlock session keys integration (pending toolchain update)
- Item pool customization UI (selecting which unlocked items can appear in runs)
- Full offline gameplay with sync
- Multi-device session handoff
- Automated burner top-up without user confirmation
- Boss phase mechanic visual enhancements (basic display only)
- Item set bonus display in combat
- Leaderboards or social features
