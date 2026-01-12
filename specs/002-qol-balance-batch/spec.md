# Feature Specification: QoL and Balance Feature Batch

**Feature Branch**: `002-qol-balance-batch`
**Created**: 2026-01-09
**Status**: Draft
**Input**: Quality-of-life improvements including map overview, combat controls, DIG wall-breaking, spawn balance, fast travel, POI UI simplification, and enemy gold rewards.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Map Overview Mode (Priority: P1)

Players exploring the dungeon want to see a broader view of discovered areas to plan their route without losing their current position or accidentally triggering game state changes.

**Why this priority**: Navigation clarity is fundamental to strategic gameplay. Players need spatial awareness to make informed decisions about exploration paths, resource allocation, and risk management.

**Independent Test**: Can be tested by tapping the map icon, verifying zoom-out and pan functionality, then tapping again to return to player-centered view. Delivers immediate navigation value.

**Acceptance Scenarios**:

1. **Given** the player is in exploration mode, **When** they tap the map icon (left of day/night bar), **Then** the view zooms out to show more of the map and the player can pan/scroll freely.
2. **Given** overview mode is active, **When** the player taps the map icon again, **Then** the camera snaps back to center on the player's current position.
3. **Given** overview mode is active, **When** the player attempts any game action (movement, interaction), **Then** nothing happens—overview mode is view-only.
4. **Given** overview mode is active, **When** observing the game state, **Then** fog-of-war, exploration state, time progression, and player position remain unchanged.

---

### User Story 2 - Combat Time Controls (Priority: P1)

Players watching auto-battles want control over combat pacing—ability to pause for strategic observation, watch at normal speed, or speed up to reduce waiting time.

**Why this priority**: Combat is a core gameplay loop. Giving players control over pacing improves engagement and reduces frustration during longer battles while maintaining the deterministic combat system.

**Independent Test**: Can be tested by entering combat and using pause/normal/fast controls, verifying animations respond appropriately and outcomes remain identical regardless of speed setting.

**Acceptance Scenarios**:

1. **Given** combat is in progress, **When** the player taps the pause control, **Then** combat progression and all animations freeze immediately.
2. **Given** combat is paused, **When** the player taps play/resume, **Then** combat continues from the exact state where it was paused.
3. **Given** combat is in progress at normal speed, **When** the player selects fast speed, **Then** animations and turn progression visually accelerate.
4. **Given** a combat encounter, **When** played at different speeds (including pausing), **Then** the final outcome (damage dealt, statuses applied, winner) is identical.

---

### User Story 3 - DIG Wall-Break Mechanic (Priority: P2)

Players with DIG-focused builds want to break through walls to create shortcuts, access hidden areas, or escape dangerous situations. All walls in the game are breakable.

**Why this priority**: Adds strategic depth to the DIG stat and creates meaningful build choices. Enables exploration-focused playstyles and rewards investment in mining capability.

**Independent Test**: Can be tested by approaching walls with different DIG values and verifying the double-tap interaction, cost calculation, tile conversion, and UX feedback work correctly.

**Acceptance Scenarios**:

1. **Given** a player adjacent to a wall, **When** they tap the direction toward that wall (first tap), **Then** the wall is highlighted with an animation indicating it can be broken and the cost is displayed.
2. **Given** a wall is highlighted from the first tap, **When** the player taps the same direction again (second tap), **Then** the wall breaks and becomes a walkable floor tile.
3. **Given** a wall is highlighted, **When** the player taps a different direction or performs another action, **Then** the highlight is cancelled and no wall break occurs.
4. **Given** a player with 1 DIG highlights a wall, **When** viewing the cost, **Then** it shows 3 moves (base 4 minus 1 DIG).
5. **Given** a player with 3+ DIG highlights a wall, **When** viewing the cost, **Then** it shows minimum cost of 1 move.
6. **Given** a player with 0 DIG taps toward a wall, **When** the first tap occurs, **Then** the UI indicates the wall cannot be broken (requires minimum 1 DIG) and no highlight appears.
7. **Given** the player breaks a wall, **When** the break completes, **Then** the move cost is deducted from time remaining.

---

### User Story 4 - Enemy Spawn Balance (Priority: P2)

Players starting a run should not encounter overwhelming enemies immediately near their spawn point that create unwinnable situations before they can gather resources.

**Why this priority**: Prevents frustrating early-game failures that feel unfair. Maintains difficulty progression while ensuring players have agency over their success.

**Independent Test**: Can be tested by starting multiple runs and verifying that strong enemies (higher tier or dangerous types) do not spawn within the protected radius of the player start position.

**Acceptance Scenarios**:

1. **Given** a new run begins, **When** the map generates, **Then** no Tier 2 or Tier 3 enemies spawn within a safe radius of the player's starting position.
2. **Given** the spawn placement system, **When** distributing enemies, **Then** difficulty scales with distance from start—weaker enemies near spawn, stronger enemies further away.
3. **Given** balanced spawn rules, **When** enemies are placed, **Then** the overall enemy count and distribution maintains intended difficulty progression through the week.

---

### User Story 5 - Fast Travel via Rail Waypoints (Priority: P2)

Players who have discovered multiple Rail Waypoints want to quickly travel between them to optimize their exploration strategy and save time.

**Why this priority**: Reduces tedious backtracking and enhances strategic options for experienced players while rewarding exploration and discovery.

**Independent Test**: Can be tested by discovering multiple waypoints, activating fast travel mode, cycling through available destinations, and teleporting to verify position change.

**Acceptance Scenarios**:

1. **Given** the player has discovered 2+ Rail Waypoints, **When** they activate fast travel (via control or POI interaction), **Then** all discovered waypoints are highlighted on the map.
2. **Given** fast travel mode is active with multiple waypoints, **When** the player taps the fast travel control, **Then** the selection cycles through available waypoints.
3. **Given** a waypoint is selected, **When** the player confirms the selection, **Then** they are teleported to that waypoint's position.
4. **Given** the player has discovered only 1 waypoint, **When** they attempt fast travel, **Then** no fast travel is available (need at least 2 discovered waypoints).
5. **Given** fast travel is used, **When** the teleport completes, **Then** no time is consumed and no game state changes except player position.

---

### User Story 6 - POI UI Text Simplification (Priority: P3)

Players interacting with Supply Cache, Tool Crate, Tool Oil Rack, and Geode Vault should see cleaner, more scannable item selection interfaces that focus on mechanical effects.

**Why this priority**: Improves mobile usability and reduces cognitive load. Item names are less important during quick selection than understanding stat effects.

**Independent Test**: Can be tested by interacting with each POI type and verifying item displays show stat bonuses (+1 ATK, +1 ARM, etc.) without full item names, while preserving rarity indicators and effect clarity.

**Acceptance Scenarios**:

1. **Given** a player opens Supply Cache selection, **When** viewing options, **Then** items display stat bonuses (e.g., "+1 ATK") and rarity indicator without full item names.
2. **Given** a player opens Tool Crate selection, **When** viewing options, **Then** tools display stat bonuses and rarity without full tool names.
3. **Given** a player opens Tool Oil Rack, **When** viewing options, **Then** oils display their effect (+1 ATK/ARM/DIG) without verbose labels.
4. **Given** a player opens Geode Vault selection, **When** viewing options, **Then** items display stat bonuses and rarity without full item names.
5. **Given** simplified UI is shown, **When** the player needs to distinguish items, **Then** rarity colors/indicators and stat effects provide sufficient differentiation.

---

### User Story 7 - Enemy Gold Rewards (Priority: P3)

Players defeating enemies in combat should receive gold rewards based on enemy type and tier, adding economic progression to combat encounters.

**Why this priority**: Creates meaningful incentive for combat engagement and supports the gold economy. Rewards risk-taking and successful combat.

**Independent Test**: Can be tested by defeating each enemy type at each tier and verifying correct gold amount is awarded and displayed.

**Acceptance Scenarios**:

1. **Given** a player defeats a Tier 1 Tunnel Rat, **When** combat ends in victory, **Then** they receive 1 gold and the reward is clearly displayed.
2. **Given** a player defeats a Tier 3 Tunnel Warden, **When** combat ends in victory, **Then** they receive 5 gold and the reward is clearly displayed.
3. **Given** a player defeats any enemy, **When** the combat result screen appears, **Then** the gold reward is prominently shown with the amount.
4. **Given** gold is awarded from combat, **When** the player returns to exploration, **Then** their gold total reflects the new amount.

---

### Edge Cases

- What happens if the player enters overview mode during a phase transition (day to night)?
  - Overview mode should not trigger; phase transitions take precedence.
- What if the player has exactly 4 DIG?
  - Wall break costs 1 move (base 4 - 4 DIG = 0, but minimum is 1).
- What if the player tries to break a wall but has insufficient moves remaining?
  - Wall break is not allowed; UI shows "Not enough moves."
- What happens if fast travel is activated during combat or POI interaction?
  - Fast travel is only available during exploration phase.
- What if all discovered waypoints are the same location?
  - Only one waypoint can exist per location; this scenario is invalid.
- What if an enemy spawns on a tile that becomes walkable after wall break?
  - Enemies do not spawn inside walls; this is a map generation constraint.
- What if the player's first tap toward a wall times out before the second tap?
  - The highlight should persist until the player takes a different action (moves another direction, interacts with something, etc.). No automatic timeout.
- What happens if the player breaks a wall that borders the map edge?
  - Map edges are bounded; walls at the perimeter cannot be broken if they would expose out-of-bounds areas.

## Requirements *(mandatory)*

### Functional Requirements

**Map Overview Mode**
- **FR-001**: System MUST display a map icon to the left of the day/night progress bar in the top navigation.
- **FR-002**: System MUST toggle overview mode when the map icon is tapped during exploration.
- **FR-003**: System MUST zoom out the camera to show a larger portion of the map in overview mode.
- **FR-004**: System MUST allow pan/scroll gestures to navigate the map in overview mode.
- **FR-005**: System MUST prevent any game state changes (movement, time, fog, exploration) while in overview mode.
- **FR-006**: System MUST snap the camera back to player position when exiting overview mode.

**Combat Time Controls**
- **FR-007**: System MUST display pause, normal speed, and fast speed controls during combat.
- **FR-008**: System MUST freeze all combat progression and animations when paused.
- **FR-009**: System MUST resume combat from the exact paused state when unpaused.
- **FR-010**: System MUST accelerate animations and visual timing in fast speed mode.
- **FR-011**: System MUST NOT alter deterministic combat outcomes regardless of speed setting.

**DIG Wall-Break**
- **FR-012**: System MUST treat all wall tiles as breakable (no distinction between wall types).
- **FR-013**: System MUST require minimum 1 DIG to break any wall.
- **FR-014**: System MUST calculate wall break cost as: max(1, 4 - player_DIG).
- **FR-015**: System MUST convert broken wall tiles to walkable floor tiles.
- **FR-016**: System MUST use a double-tap interaction to break walls: first tap highlights, second tap breaks.
- **FR-017**: System MUST display a highlight animation on the wall when the player taps toward it (first tap).
- **FR-018**: System MUST show wall break cost in UI when a wall is highlighted.
- **FR-019**: System MUST cancel the wall highlight if the player taps a different direction or performs another action.
- **FR-020**: System MUST break the wall and deduct move cost when the player taps the same direction again (second tap).
- **FR-021**: System MUST show feedback that wall cannot be broken if player has 0 DIG.
- **FR-022**: System MUST NOT allow breaking walls at map perimeter that would expose out-of-bounds areas.

**Enemy Spawn Balance**
- **FR-023**: System MUST NOT spawn Tier 2 or Tier 3 enemies within a protected radius of player start position.
- **FR-024**: System MUST distribute enemy difficulty progressively with distance from start position.
- **FR-025**: System MUST maintain overall enemy count and difficulty targets for each week.

**Fast Travel**
- **FR-026**: System MUST enable fast travel only when player has discovered 2+ Rail Waypoints.
- **FR-027**: System MUST highlight all discovered waypoints when fast travel mode is activated.
- **FR-028**: System MUST cycle through available waypoints on repeated fast travel control taps.
- **FR-029**: System MUST teleport player to selected waypoint on confirmation.
- **FR-030**: System MUST NOT consume time or trigger encounters during fast travel.

**POI UI Simplification**
- **FR-031**: System MUST display stat bonuses (e.g., "+1 ATK") instead of item names in Supply Cache selection.
- **FR-032**: System MUST display stat bonuses instead of tool names in Tool Crate selection.
- **FR-033**: System MUST display effect labels (+ATK/+ARM/+DIG) instead of verbose text in Tool Oil Rack.
- **FR-034**: System MUST display stat bonuses instead of item names in Geode Vault selection.
- **FR-035**: System MUST preserve rarity indicators (color/icon) in all simplified POI UIs.

**Enemy Gold Rewards**
- **FR-036**: System MUST award gold on enemy defeat based on enemy type and tier.
- **FR-037**: System MUST award Tunnel Rat, Cave Bat, Spore Slime, Rust Mite Swarm: T1=1, T2=2, T3=3 gold.
- **FR-038**: System MUST award Collapsed Miner, Shard Beetle: T1=2, T2=3, T3=4 gold.
- **FR-039**: System MUST award Tunnel Warden, Burrow Ambusher: T1=3, T2=4, T3=5 gold.
- **FR-040**: System MUST display gold reward prominently in combat victory result.
- **FR-041**: System MUST update player's gold total immediately after combat victory.

### Key Entities

- **Wall Tile**: Any wall tile in the game, all of which are breakable with sufficient DIG. Attributes: position, highlighted state (for double-tap interaction).
- **Wall Highlight State**: Tracks whether a wall is currently highlighted for breaking. Includes: target wall position, direction of first tap.
- **Combat Speed Setting**: Player-controlled pacing for auto-battle animations. States: paused, normal, fast.
- **Enemy Gold Reward**: Gold value associated with each enemy type and tier combination. Lookup table mapping (enemy_type, tier) to gold amount.
- **Fast Travel State**: Tracks whether fast travel mode is active and which waypoint is currently selected.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Players can access and navigate map overview mode within 1 tap, and return to gameplay within 1 tap.
- **SC-002**: Combat speed changes are visually perceptible (fast is at least 2x normal speed) and pause completely stops all motion.
- **SC-003**: Wall break cost calculation is accurate: players with 3+ DIG always pay exactly 1 move; players with 1 DIG pay 3 moves.
- **SC-004**: No Tier 2 or higher enemies appear within 5 tiles of player start position across 100+ generated maps.
- **SC-005**: Fast travel between waypoints completes instantly with no time progression.
- **SC-006**: POI selection UI fits within screen bounds on mobile devices (no truncation or overflow).
- **SC-007**: Gold rewards match specification table with 100% accuracy for all enemy/tier combinations.
- **SC-008**: Player gold total correctly reflects all combat rewards earned during a run.

## Assumptions

- The existing day/night progress bar component can accommodate an additional icon to its left.
- The game already has Rail Waypoint POIs that track discovery state.
- All walls are breakable; no special wall types or unbreakable walls exist.
- The protected spawn radius for balance purposes is approximately 5 tiles (adjustable during implementation).
- Fast speed multiplier for combat is approximately 2x (adjustable for feel).
- Enemies already have a tier system (T1, T2, T3) that can be queried.
- The combat result screen already exists and can be extended to show gold rewards.
- The directional input system can detect consecutive taps in the same direction for the double-tap wall break mechanic.

## Out of Scope

- No new enemy types, items, or game modes.
- No changes to core combat mechanics or damage formulas.
- No changes to fog-of-war reveal mechanics.
- No changes to existing POI functionality beyond UI text simplification.
- No multiplayer or networked features.
