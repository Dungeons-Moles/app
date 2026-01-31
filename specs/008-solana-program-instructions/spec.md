# Feature Specification: Solana Program Instructions Integration

**Feature Branch**: `008-solana-program-instructions`
**Created**: 2026-01-27
**Status**: Draft
**Input**: User description: "Solana programs frontend integration - integrate on-chain instructions for initialize_profile, start_session, move_player, POI interactions, and record_run_result"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Player Profile Creation (Priority: P1)

A new player connects their wallet and the app detects no on-chain profile exists. The player enters a display name and submits. The app sends the `initialize_profile` instruction to the player-profile program, creating their on-chain account with 20 starter runs, level 1 unlocked, and 40 starter items. The player is then taken to the game hub where their profile data is displayed.

**Why this priority**: This is the gateway to all other on-chain interactions. No session can be started, no movement can happen, and no results can be recorded without a profile.

**Independent Test**: Can be tested by connecting a fresh wallet, completing the profile creation flow, and verifying the on-chain PlayerProfile account contains the correct initial state (20 runs, level 1, 40 items unlocked).

**Acceptance Scenarios**:

1. **Given** a connected wallet with no on-chain profile, **When** the player submits a display name (1-32 characters), **Then** the `initialize_profile` instruction is sent and the PlayerProfile PDA is created on-chain.
2. **Given** a successful profile creation, **When** the transaction confirms, **Then** the app fetches the new profile and displays name, 20 available runs, and level 1.
3. **Given** a connected wallet with an existing profile, **When** the app loads, **Then** the profile is fetched from the PlayerProfile PDA and displayed without prompting for creation.
4. **Given** the `initialize_profile` transaction fails (insufficient SOL, network error), **When** the error occurs, **Then** the app shows a clear error message and allows retry.

---

### User Story 2 - Starting a Game Session (Priority: P2)

A player with an existing profile selects a campaign level to play. The app sends the `start_session` instruction to the session-manager program, which orchestrates creating the GameSession, generating the map, initializing game state, inventory, and POIs via cross-program invocations. The player also provides a burner wallet for gasless gameplay during the session. Once the session is created, the app transitions to the game screen with the generated map rendered.

**Why this priority**: Starting a session is the entry point to actual gameplay. It depends on having a profile (P1) and gates all in-game actions (movement, POI interaction).

**Independent Test**: Can be tested by selecting a valid campaign level, verifying the `start_session` transaction succeeds, and confirming all session-related accounts (GameSession, GeneratedMap, GameState, MapEnemies, PlayerInventory, MapPois) are created on-chain with correct initial values.

**Acceptance Scenarios**:

1. **Given** a player with available runs > 0 and a campaign level within their unlocked range, **When** they start a session, **Then** the `start_session` instruction is sent with the campaign level and burner wallet, and all session accounts are created.
2. **Given** a successful session start, **When** the transaction confirms, **Then** the app fetches the GeneratedMap and GameState, renders the map, and places the player at the spawn position.
3. **Given** a player with 0 available runs, **When** they attempt to start a session, **Then** the app prevents the attempt and shows a message about needing more runs.
4. **Given** a player who already has an active session for the selected level, **When** they attempt to start another, **Then** the app detects the existing session and offers to resume or abandon it.
5. **Given** the `start_session` transaction fails, **When** the error occurs, **Then** the app shows the error and allows retry without leaving the level selection screen.

---

### User Story 3 - Player Movement and Combat (Priority: P3)

During an active session, the player taps an adjacent tile to move. The app sends the `move_player` instruction with the target coordinates. The on-chain program validates the move, updates the player position, handles night-phase enemy movement, resolves any combat automatically (if the player lands on or is reached by an enemy), advances phases when moves are exhausted, and triggers boss fights automatically at the end of Night3. The app reads the resulting transaction events to display movement, enemy movement, combat results, phase transitions, and boss outcomes.

**Why this priority**: Movement is the core gameplay mechanic. All other in-game interactions (POIs, combat, progression) happen through or alongside movement. Boss fights and session endings are triggered automatically by the program, not by separate frontend calls.

**Independent Test**: Can be tested by starting a session, moving to various tiles, and verifying position updates, enemy AI movement during night phases, combat resolution when colliding with enemies, phase transitions, and automatic boss fight triggering at Night3 exhaustion.

**Acceptance Scenarios**:

1. **Given** a player at position (x, y), **When** they tap an adjacent walkable tile (x', y'), **Then** the `move_player` instruction is sent and the on-chain position updates to (x', y').
2. **Given** a player moves to a tile occupied by an enemy, **When** the move resolves, **Then** combat is automatically resolved on-chain and the app displays combat results (player HP change, enemy defeated or not, gold earned).
3. **Given** a night phase is active, **When** the player moves, **Then** enemies within range 3 move toward the player on-chain, and any resulting collisions trigger combat.
4. **Given** the player exhausts all moves in a phase, **When** the last move resolves, **Then** the phase advances automatically (Day1 -> Night1 -> Day2 -> ... -> Night3).
5. **Given** the player exhausts Night3 moves, **When** the last move resolves, **Then** a boss fight is triggered automatically on-chain and the result (victory/defeat) is included in the transaction events.
6. **Given** the player dies in combat (HP <= 0), **When** the combat resolves, **Then** the session ends automatically on-chain, and the app transitions to the results screen.
7. **Given** the player wins the boss fight, **When** the boss combat resolves, **Then** the week advances (or level completes if week 3), gear slots expand, and the app reflects the updated state.
8. **Given** a `move_player` transaction fails (network error, invalid move), **When** the error occurs, **Then** the app shows the error and the player position remains unchanged.

---

### User Story 4 - POI Interactions (Priority: P4)

During an active session, when the player is on a tile containing a Point of Interest, the app shows available interaction options based on the POI type. The player selects an action, and the app sends the appropriate poi-system instruction. The on-chain program validates the interaction (correct location, not already used, proper phase for night-only POIs) and applies effects. The app updates the UI to reflect the outcome.

**Why this priority**: POIs provide strategic depth (healing, items, upgrades, shops, fast travel) but the core game loop (movement + combat) must work first.

**Independent Test**: Can be tested by navigating to POI locations on the map and interacting with each POI type, verifying correct instruction dispatch and UI updates for each interaction outcome.

**Acceptance Scenarios**:

1. **Given** a player on a Mole Den (L1) tile during night phase, **When** they interact, **Then** the `interact_rest` instruction is sent, and the player is fully healed.
2. **Given** a player on a Supply Cache (L2) tile, **When** they interact, **Then** the `interact_pick_item` instruction is sent with choice parameters, and the app shows 3 gear options for the player to pick from.
3. **Given** a player on a Tool Crate (L3) tile, **When** they interact, **Then** the `interact_pick_item` instruction is sent, and the app shows 3 tool options.
4. **Given** a player on a Tool Oil Rack (L4) tile, **When** they interact, **Then** the `interact_tool_oil` instruction is sent with the chosen modification (+ATK, +SPD, or +DIG).
5. **Given** a player on a Smuggler Hatch (L9) tile, **When** they interact, **Then** `enter_shop` is called, and the app displays 6 item offers with prices. The player can purchase (via `shop_purchase`), reroll (via `shop_reroll`), or leave (via `leave_shop`).
6. **Given** a player on a Rusty Anvil (L10) with enough gold, **When** they interact, **Then** `interact_rusty_anvil` is called and their tool is upgraded to the next tier.
7. **Given** a player on a Rune Kiln (L11) with two matching items, **When** they interact, **Then** `interact_rune_kiln` is called and the items are fused.
8. **Given** a player on a Rail Waypoint (L8), **When** they discover it, **Then** `discover_waypoint` is called. When they fast-travel, `fast_travel` is called with the target waypoint.
9. **Given** a player on a Survey Beacon (L6), **When** they interact, **Then** `interact_survey_beacon` is called and tiles within radius 13 are revealed on the app's map.
10. **Given** a player on a Seismic Scanner (L7), **When** they interact, **Then** `interact_seismic_scanner` is called with the selected category, and the nearest matching POI is revealed.
11. **Given** a player interacts with a one-time POI that has already been used, **When** they attempt interaction, **Then** the app prevents the call or the on-chain program rejects it, and the app shows "already used."
12. **Given** a player interacts with a night-only POI during day phase, **When** they attempt interaction, **Then** the interaction is rejected and the app explains the restriction.
13. **Given** a player on a Rest Alcove (L5) during night phase, **When** they interact, **Then** `interact_rest` is called and 10 HP is restored.
14. **Given** a player on a Geode Vault (L12), **When** they interact, **Then** `interact_pick_item` is called and the app shows 3 heroic+ rarity items to choose from.
15. **Given** a player on a Counter Cache (L13), **When** they interact, **Then** `interact_pick_item` is called with boss weakness tags, and the app shows 3 weakness-tagged items.
16. **Given** a player on a Scrap Chute (L14) with gear to scrap, **When** they interact, **Then** `interact_scrap_chute` is called, gold is deducted, and the gear is removed from inventory.

---

### User Story 5 - Recording Run Results (Priority: P5)

When a session ends (player dies, defeats the final boss, or abandons), the app calls `record_run_result` on the player-profile program to update the player's lifetime statistics. This decrements available runs, increments total runs, and on first-time level completion, advances the highest unlocked level and unlocks a new item.

**Why this priority**: Recording results closes the gameplay loop and enables progression. It depends on sessions having been played (P2-P4).

**Independent Test**: Can be tested by completing a session (victory or defeat), calling `record_run_result`, and verifying the PlayerProfile reflects updated total_runs, available_runs, and (on first victory) highest_level_unlocked and newly unlocked item.

**Acceptance Scenarios**:

1. **Given** a session ends with a victory on a level equal to the player's highest_level_unlocked, **When** `record_run_result` is called, **Then** available_runs decreases by 1, total_runs increases by 1, highest_level_unlocked increases by 1, and a new item is unlocked.
2. **Given** a session ends with a defeat, **When** `record_run_result` is called, **Then** available_runs decreases by 1, total_runs increases by 1, but highest_level_unlocked and items remain unchanged.
3. **Given** a session ends with a victory on a level below the player's highest unlocked, **When** `record_run_result` is called, **Then** available_runs and total_runs update but no level advancement occurs.
4. **Given** a player has 1 available run and the session ends, **When** `record_run_result` is called, **Then** available_runs becomes 0 and the app shows a prompt about purchasing more runs.
5. **Given** the `record_run_result` transaction fails, **When** the error occurs, **Then** the app retries or shows an error, ensuring the result is eventually recorded.

---

### Edge Cases

- What happens if the player's wallet disconnects mid-session? The app should pause gameplay and prompt wallet reconnection. The on-chain session remains active.
- What happens if the burner wallet runs out of SOL for transaction fees? The app should detect low balance and prompt the player to top up the burner wallet before continuing.
- What happens if a `move_player` transaction is submitted but the player has already moved (stale state)? The on-chain program validates position; the transaction will fail, and the app should re-fetch state and allow retry.
- What happens if network latency causes the player to submit multiple moves before the first confirms? The app should queue moves and send them sequentially, each waiting for the previous to confirm.
- What happens if the session accounts exist but the session was never properly ended from a previous app crash? The app should detect existing session accounts and offer to resume or end the session.
- What happens if a POI interaction requires choosing from generated items? The app must first call the instruction that generates offers (e.g., `enter_shop`), display the options, then send the selection instruction (e.g., `shop_purchase`).

## Requirements *(mandatory)*

### Functional Requirements

**Profile Integration**

- **FR-001**: App MUST send the `initialize_profile` instruction with the player's chosen name to create a PlayerProfile PDA on-chain.
- **FR-002**: App MUST fetch and display the PlayerProfile state (name, total_runs, available_runs, highest_level_unlocked, unlocked_items) after profile creation and on each app load.
- **FR-003**: App MUST validate the player name is 1-32 characters before submitting the transaction.

**Session Lifecycle**

- **FR-004**: App MUST send the `start_session` instruction with campaign_level and burner_wallet to start a new game session.
- **FR-005**: App MUST derive and pass all required PDA accounts (GameSession, MapConfig, GeneratedMap, GameState, MapEnemies, MapPois, PlayerInventory) when calling `start_session`.
- **FR-006**: App MUST fetch the GeneratedMap account after session creation to render the map (packed tiles, spawn point, enemy positions, POI locations).
- **FR-007**: App MUST fetch the GameState account to display current player position, HP, gold, phase, moves remaining, and week.
- **FR-008**: App MUST detect existing active sessions for the player and offer resume or abandon options before starting a new one.
- **FR-009**: App MUST be able to call `end_session` to manually close a session (e.g., player abandons).

**Movement and Combat**

- **FR-010**: App MUST send the `move_player` instruction with target coordinates when the player taps an adjacent tile.
- **FR-011**: App MUST validate that the target tile is adjacent (Chebyshev distance = 1) and walkable before submitting the transaction.
- **FR-012**: App MUST parse transaction events (PlayerMoved, EnemyMoved, CombatStarted, CombatEnded, CombatLog, PhaseAdvanced, BossFightReady, BossCombaStarted, LevelCompleted, PlayerDefeated) to update the UI.
- **FR-013**: App MUST queue movement inputs and send them sequentially, waiting for each transaction to confirm before sending the next.
- **FR-014**: App MUST display combat results including damage dealt, damage received, status effects, gold earned, and whether the enemy was defeated.
- **FR-015**: App MUST display phase transitions (Day/Night changes) and remaining moves for the current phase.
- **FR-016**: App MUST handle automatic boss fight resolution that occurs within the `move_player` instruction at Night3 exhaustion, including displaying boss combat results.
- **FR-017**: App MUST handle automatic session ending when the player dies, transitioning to a results screen.

**POI Interactions**

- **FR-018**: App MUST detect when the player is on a POI tile and show available interaction options based on POI type.
- **FR-019**: App MUST send the correct poi-system instruction for each POI type (interact_rest, interact_pick_item, interact_tool_oil, enter_shop, shop_purchase, shop_reroll, leave_shop, interact_rusty_anvil, interact_rune_kiln, discover_waypoint, fast_travel, interact_survey_beacon, interact_seismic_scanner, interact_scrap_chute).
- **FR-020**: App MUST respect POI usage rules: one-time POIs cannot be re-used, night-only POIs are only interactive during night phases, repeatable-per-tool POIs track per-tool usage.
- **FR-021**: App MUST display item choices for pick-item POIs (L2, L3, L12, L13) and send the player's selection back.
- **FR-022**: App MUST manage shop state for Smuggler Hatch (L9): displaying offers, handling purchases, rerolls, and shop exit.
- **FR-023**: App MUST update the map display when Survey Beacon (L6) reveals tiles or Seismic Scanner (L7) reveals a POI.
- **FR-024**: App MUST track discovered waypoints (L8) and enable fast travel between them.

**Run Results**

- **FR-025**: App MUST send the `record_run_result` instruction with level_completed and victory flag after a session ends.
- **FR-026**: App MUST update the displayed profile data after recording the run result (total_runs, available_runs, highest_level_unlocked, newly unlocked items).

**Error Handling**

- **FR-027**: App MUST show clear, user-friendly error messages for all failed transactions, distinguishing between network errors, insufficient funds, and program-level rejections.
- **FR-028**: App MUST re-fetch on-chain state after any transaction failure to ensure the UI reflects the true state.
- **FR-029**: App MUST detect when the burner wallet has insufficient SOL for fees and prompt the player to fund it.

### Key Entities

- **PlayerProfile**: On-chain account storing the player's identity, run history, level progression, and unlocked items. Keyed by wallet address.

- **GameSession**: On-chain account representing an active play session, linking the player to their burner wallet and snapshot of their item pool. Keyed by player wallet and campaign level.

- **GeneratedMap**: On-chain account containing the procedurally generated map data (walkable tiles, enemy spawns, POI locations, spawn/exit points). Keyed by session.

- **GameState**: On-chain account tracking live gameplay state (position, HP, gold, phase, moves, week, boss status). Keyed by session.

- **MapEnemies**: On-chain account tracking all enemy instances on the map (position, type, tier, defeated status). Keyed by session.

- **PlayerInventory**: On-chain account tracking the player's equipped tool and gear for the current session. Keyed by session.

- **MapPois**: On-chain account tracking all POI instances, their usage state, and active shop state. Keyed by session.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Players can create a profile and see it reflected in the app within 30 seconds of submitting their name.
- **SC-002**: Players can start a session and see the rendered map within 15 seconds of selecting a campaign level.
- **SC-003**: Player movement inputs are submitted and the updated position is reflected in the app within 3 seconds per move.
- **SC-004**: All 14 POI types are interactable from the app when the player is at the correct location and conditions are met.
- **SC-005**: Run results are recorded and profile statistics update within 10 seconds of session completion.
- **SC-006**: 95% of transactions succeed on first attempt under normal network conditions.
- **SC-007**: The app correctly displays combat outcomes, phase transitions, and boss fight results based on on-chain events.
- **SC-008**: Players can complete a full gameplay loop (create profile -> start session -> move through map -> interact with POIs -> defeat boss or die -> record result) entirely through on-chain instructions.

## Assumptions

- All 6 Solana programs (player-profile, session-manager, map-generator, gameplay-state, player-inventory, poi-system) are deployed and functional on devnet.
- The existing wallet connection infrastructure (WalletContext, SolanaConnectionContext) from feature 004 is in place and working.
- The existing burner wallet system (creation, funding, draining) from feature 005 is in place and working.
- IDL files for all programs are available and up to date in the app's IDL directory.
- The app has environment variables configured for all 6 program IDs (player-profile, session-manager, map-generator, gameplay-state, player-inventory, poi-system).
- `trigger_boss_fight` is called automatically by `move_player` when Night3 moves are exhausted; the frontend does not call it directly.
- `end_session` is called automatically when the player dies on-chain, but can also be called manually by the frontend for abandoning a session.
- The session-manager's `delegate_session` and `commit_session` are non-functional stubs and are excluded from this integration scope.
- MapConfig and SessionCounter are already initialized on-chain (admin-only one-time operations).

## Scope Exclusions

- Profile name updates (`update_profile_name`) - deferred to a separate feature.
- Run purchasing (`purchase_runs`) - deferred to a separate feature.
- Tier unlock payments - covered by feature 004.
- Ephemeral rollup delegation (MagicBlock) - stubbed, not functional.
- Offline/guest mode gameplay - covered by feature 006.
- Admin operations (initialize_map_config, initialize_counter) - one-time setup, not a frontend concern.
