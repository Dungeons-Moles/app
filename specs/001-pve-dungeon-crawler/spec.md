# Feature Specification: PvE Dungeon Crawler Prototype

**Feature Branch**: `001-pve-dungeon-crawler`
**Created**: 2026-01-06
**Status**: Draft
**Input**: PvE-only playable prototype inspired by "He Is Coming" - grid-based exploration with auto-combat

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Dungeon Exploration (Priority: P1)

As a player, I want to explore a procedurally generated dungeon using D-pad controls so that I can discover items, encounter enemies, and progress through the week cycle toward the boss fight.

**Why this priority**: Exploration is the core game loop. Without movement and map rendering, no other features can function. This establishes the fundamental interaction model.

**Independent Test**: Can be fully tested by spawning a player on a generated map, moving in all four directions, revealing fog of war, and observing time/move consumption. Delivers the foundational game experience.

**Acceptance Scenarios**:

1. **Given** the player spawns on a new map, **When** the game starts, **Then** tiles within radius 7 are revealed and the Mole Den is adjacent to the player position
2. **Given** the player is on a walkable tile, **When** pressing UP/DOWN/LEFT/RIGHT, **Then** the player moves one tile in that direction and 1 time unit is consumed (or 2 for Hard Rock)
3. **Given** a wall tile is adjacent to the player, **When** pressing toward that wall, **Then** the corresponding D-pad button is disabled and movement is blocked
4. **Given** the player is exploring during Day, **When** moving, **Then** sight radius is 5 tiles and more tiles are revealed per step than during Night
5. **Given** the player is exploring during Night, **When** moving, **Then** sight radius is 3 tiles and enemies within visible range begin moving toward the player
6. **Given** the camera position, **When** the player moves, **Then** the camera remains centered on the player at all times

---

### User Story 2 - Auto-Combat System (Priority: P1)

As a player, I want combat to resolve automatically when I step on an enemy so that I can observe the outcome of my build decisions without manual input during fights.

**Why this priority**: Combat is the second pillar of the game loop alongside exploration. Build validation and progression depend on combat outcomes.

**Independent Test**: Can be tested by placing a player with defined stats/items adjacent to an enemy, stepping onto the enemy tile, and verifying combat resolves deterministically with correct damage calculations, status effects, and victory/defeat conditions.

**Acceptance Scenarios**:

1. **Given** the player steps onto an enemy tile, **When** the transition occurs, **Then** the combat scene loads with enemy on LEFT and player on RIGHT
2. **Given** combat begins, **When** Battle Start phase triggers, **Then** all Battle Start effects (items, enemy traits, itemsets) execute in the defined order
3. **Given** both combatants have SPEED stats, **When** turns resolve, **Then** the higher SPEED combatant attacks first each turn
4. **Given** a combatant attacks, **When** damage is calculated, **Then** ATK is reduced by target's ARM (minimum 0 damage to HP)
5. **Given** enemy HP reaches 0, **When** combat ends, **Then** "VICTORY" displays for 3 seconds, then player returns to the map with rewards applied
6. **Given** player HP reaches 0, **When** combat ends, **Then** "DEFEAT" displays for 3 seconds, then player returns to main menu (run ends)
7. **Given** the same initial state and RNG seed, **When** combat resolves multiple times, **Then** the outcome is identical every time (deterministic)

---

### User Story 3 - Time/Week Progression (Priority: P1)

As a player, I want time to progress through Day/Night cycles culminating in a boss fight so that I have structured pressure and goals within each run.

**Why this priority**: The week structure provides pacing, urgency, and the primary win condition. Without it, exploration has no endpoint.

**Independent Test**: Can be tested by consuming all moves in a Day phase, verifying transition to Night, repeating through 3 Day/Night cycles, and confirming boss fight triggers after Night 3.

**Acceptance Scenarios**:

1. **Given** a new week starts, **When** the boss is selected, **Then** Week 1 selects 1 of 4 Gatekeepers at random, Week 2 selects 1 of 2 Filters, Week 3 is always The Eldritch Mole
2. **Given** the player is in Day phase, **When** 50 moves are consumed, **Then** the phase transitions to Night
3. **Given** the player is in Night phase, **When** 30 moves are consumed, **Then** the phase transitions to the next Day (or Boss if Night 3)
4. **Given** Night 3 ends, **When** time expires, **Then** the boss fight auto-triggers regardless of player position
5. **Given** a new Day begins, **When** the transition occurs, **Then** the player gains +2 inventory slots and items with "Start of each Day" effects trigger
6. **Given** the top bar is visible, **When** viewing during exploration, **Then** the current week progress (Day/Night track) and boss preview (emoji + name) are displayed

---

### User Story 4 - Inventory & Item System (Priority: P2)

As a player, I want to collect, equip, and view items so that I can build synergies and improve my combat effectiveness.

**Why this priority**: Items are how players express agency and create build variety. Essential for strategic depth but dependent on exploration being functional.

**Independent Test**: Can be tested by collecting items from POIs, verifying they appear in inventory, equipping a Tool to the weapon slot, and confirming stat bonuses apply correctly.

**Acceptance Scenarios**:

1. **Given** the player has no Tool equipped, **When** collecting a Tool from a Tool Crate, **Then** the Tool is equipped to the weapon slot
2. **Given** the inventory has available slots, **When** collecting a Gear item, **Then** the item is added to the inventory grid (2 items per row)
3. **Given** the inventory starts with 4 slots, **When** a boss is defeated, **Then** inventory capacity increases by 2 (max 12 by end of week)
4. **Given** an item is in inventory, **When** the player taps/clicks it, **Then** a tooltip displays: name, emoji, rarity, stats, effect text, and tags
5. **Given** items with stat bonuses are equipped, **When** viewing player stats, **Then** HP/ATK/ARM/SPD/GOLD reflect all equipped item bonuses
6. **Given** an itemset's required items are all equipped, **When** the itemset is checked, **Then** the set bonus becomes active and the itemset icon displays near inventory

---

### User Story 5 - POI Interactions (Priority: P2)

As a player, I want to interact with Points of Interest (Supply Caches, Tool Crates, Shops, etc.) so that I can acquire items, upgrade tools, and make strategic decisions.

**Why this priority**: POIs are the primary means of build construction. Without them, progression is impossible.

**Independent Test**: Can be tested by stepping onto each POI type and verifying the correct interaction UI appears with appropriate options.

**Acceptance Scenarios**:

1. **Given** the player steps onto a Supply Cache, **When** the interaction triggers, **Then** a selection UI shows 3 Common items (with chance of Gilded/Diamond variants)
2. **Given** the player steps onto a Tool Crate, **When** the interaction triggers, **Then** a selection UI shows 3 Tools (Common/Rare distribution)
3. **Given** the player steps onto the Mole Den during Night, **When** choosing to rest, **Then** time skips to the next Day and player HP is fully restored
4. **Given** the player steps onto a Smuggler Hatch, **When** the shop opens, **Then** 5 Rare + 1 Heroic items are displayed with Gold prices and a reroll option
5. **Given** the player steps onto a Rusty Anvil, **When** upgrading a tool, **Then** 2 forge mod options are presented and applying a mod costs Gold
6. **Given** the player has 2 identical items and steps onto a Crusher Golem, **When** choosing to fuse, **Then** the items combine (Common to Gilded, Gilded to Diamond)

---

### User Story 6 - Boss Encounters (Priority: P2)

As a player, I want to fight unique bosses at the end of each week so that I have a skill/build check and clear progression milestones.

**Why this priority**: Bosses are the climax of each week and the primary source of difficulty scaling. They validate that combat and item systems work correctly with complex traits.

**Independent Test**: Can be tested by triggering each boss fight manually and verifying their unique traits execute correctly.

**Acceptance Scenarios**:

1. **Given** Week 1 boss is The Broodmother, **When** attacking, **Then** the boss strikes 3 times per turn
2. **Given** Week 1 boss is Obsidian Golem, **When** a turn starts, **Then** the boss regenerates +3 Armor
3. **Given** Week 2 boss is Crystal Mimic, **When** the player applies a status effect (first time per turn), **Then** the same status is also applied to the player
4. **Given** Week 3 boss is The Eldritch Mole at 75% HP, **When** HP crosses the threshold, **Then** the boss gains +12 Armor immediately
5. **Given** The Eldritch Mole at 50% HP, **When** HP crosses the threshold, **Then** the boss begins striking twice per turn
6. **Given** the boss preview in the top bar, **When** tapped/clicked, **Then** a tooltip shows: name, emoji, stats, trait text, and "What it tests / Intended counters"

---

### User Story 7 - Status Effects System (Priority: P2)

As a player, I want status effects (Chill, Shrapnel, Rust) to modify combat so that build diversity and counter-play exist.

**Why this priority**: Status effects create the mechanical depth that makes itemsets and enemy traits meaningful.

**Independent Test**: Can be tested by applying each status effect in isolated combat scenarios and verifying stacking, duration, and effects.

**Acceptance Scenarios**:

1. **Given** a combatant has Chill stacks, **When** they attack, **Then** their ATK is halved (rounded down) for that attack, and 1 Chill stack is removed at end of turn
2. **Given** a combatant has Shrapnel stacks, **When** they are struck, **Then** they deal damage equal to Shrapnel stacks to the attacker, and Shrapnel clears at end of turn (unless Shrapnel Harness itemset is active)
3. **Given** a combatant has Rust stacks, **When** turn ends, **Then** their Armor is reduced by Rust stacks (minimum 0)
4. **Given** an item or enemy applies a status, **When** the effect triggers, **Then** the status icon with stack count appears on the affected combatant's panel

---

### User Story 8 - UI Layout & Controls (Priority: P3)

As a player, I want a clear landscape UI with D-pad controls, stats display, inventory panel, and top bar so that I can understand game state at a glance and control my character intuitively.

**Why this priority**: While critical for usability, the UI is presentation layer that can be iterated after core mechanics work.

**Independent Test**: Can be tested by verifying all UI elements render in correct positions, update live, and respond to touch/keyboard input.

**Acceptance Scenarios**:

1. **Given** the game is in exploration mode, **When** viewing the screen, **Then** D-pad controls appear on bottom-left, stats/inventory on right side, top bar shows week progress and boss preview
2. **Given** player stats change, **When** HP/ATK/ARM/SPD/GOLD update, **Then** the stats panel reflects changes immediately
3. **Given** touch input on D-pad, **When** pressing an arrow, **Then** the player moves in that direction (if valid)
4. **Given** keyboard input (web dev), **When** pressing arrow keys or WASD, **Then** the player moves in that direction (if valid)
5. **Given** combat is active, **When** viewing the screen, **Then** enemy panel (left) shows name/trait/effects, player panel (right) shows effects/items, center shows combatants with stats below each

---

### Edge Cases

- What happens when the player runs out of inventory slots? **Answer**: New items cannot be collected; player must discard or fuse items first
- What happens when the player has 0 Gold and tries to use a shop? **Answer**: Items are not purchasable; reroll option is disabled
- What happens when enemies move during Night and block the path to the Mole Den? **Answer**: Player must fight through or find alternate route; this is intentional difficulty
- What happens if combat would result in simultaneous death? **Answer**: Player death is evaluated first (player loses)
- What happens when a Tool with a forge mod is replaced? **Answer**: The old Tool and its mod are lost
- What happens when Canary Charm prevents death? **Answer**: Player revives at 1 HP, Canary Charm breaks (removed from inventory), combat continues

---

## Requirements *(mandatory)*

### Functional Requirements

#### Core Game Loop

- **FR-001**: System MUST render a tile-based dungeon map in landscape orientation with corridors only (no open fields)
- **FR-002**: System MUST provide D-pad controls (bottom-left) as the only movement input method, with disabled states for blocked directions
- **FR-003**: System MUST support keyboard input (arrow keys/WASD) for web development builds
- **FR-004**: System MUST center the camera on the player at all times with no free camera movement
- **FR-005**: System MUST implement fog of war that hides unexplored tiles and reveals permanently once seen

#### Time System

- **FR-006**: System MUST track Day phases (50 moves) and Night phases (30 moves)
- **FR-007**: System MUST follow the week structure: Day 1 > Night 1 > Day 2 > Night 2 > Day 3 > Night 3 > Boss
- **FR-008**: System MUST transition between phases automatically when move count depletes
- **FR-009**: System MUST trigger boss fight automatically after Night 3 regardless of player position

#### Combat

- **FR-010**: System MUST initiate combat immediately when player steps onto an enemy tile
- **FR-011**: System MUST resolve combat automatically with no player input during battle
- **FR-012**: System MUST execute Battle Start effects before the first turn
- **FR-013**: System MUST determine turn order by SPEED stat (higher goes first)
- **FR-014**: System MUST calculate damage as: ATK - target ARM = HP damage (minimum 0)
- **FR-015**: System MUST display floating damage numbers (red), healing (green), and armor loss (gray/blue)
- **FR-016**: System MUST maintain a structured combat log with capped length (max 100 entries)
- **FR-017**: Combat MUST be fully deterministic given the same initial state and RNG seed

#### Items & Inventory

- **FR-018**: System MUST support exactly 1 equipped Tool (weapon slot) at a time
- **FR-019**: System MUST support multiple equipped Gear items in a grid (2 per row)
- **FR-020**: System MUST start with 4 inventory slots and add 2 slots after each boss defeat
- **FR-021**: System MUST display item tooltips on tap/click showing: name, emoji, rarity, stats, effect text, tags
- **FR-022**: System MUST track item rarity tiers: Common, Gilded, Diamond, Rare, Heroic, Mythic
- **FR-023**: System MUST implement all 9 Tools with their specified stats and effects
- **FR-024**: System MUST implement all 29 Gear items with their specified stats and effects
- **FR-025**: System MUST implement all 8 Itemsets that activate when all required items are equipped

#### Status Effects

- **FR-026**: System MUST implement Chill: halves ATK while stacks exist, remove 1 stack at end of turn
- **FR-027**: System MUST implement Shrapnel: deals damage equal to stacks when struck, clears at end of turn
- **FR-028**: System MUST implement Rust: reduces Armor by stack count over time
- **FR-029**: System MUST display status effect icons with stack counts on affected combatants

#### Enemies & Bosses

- **FR-030**: System MUST implement all 8 enemy types with 3 tiers of scaling stats
- **FR-031**: System MUST implement enemy traits that trigger at specified timings
- **FR-032**: System MUST implement all 7 bosses with their unique traits
- **FR-033**: System MUST select bosses according to pool rules (Week 1: 1 of 4, Week 2: 1 of 2, Week 3: fixed)
- **FR-034**: System MUST implement The Eldritch Mole's phase transitions at 75%/50%/25% HP thresholds

#### POIs / Locations

- **FR-035**: System MUST spawn Mole Den adjacent to player at map start
- **FR-036**: System MUST implement all 12 POI types with their interactions and outputs
- **FR-037**: System MUST enforce POI spawn density rules (Common/Uncommon/Rare distribution)
- **FR-038**: System MUST enforce POI spacing rule (same type not within ~10 tiles of itself)

#### Map Generation

- **FR-039**: System MUST generate corridor-based maps (no rooms or open spaces)
- **FR-040**: System MUST use seed-driven procedural generation for reproducible maps
- **FR-041**: System MUST implement 3 tile types: Empty Tunnel (1 time), Soft Earth (1 time), Hard Rock (2 time)
- **FR-042**: System MUST spawn enemies on map tiles (enemies do not move during Day)
- **FR-043**: During Night, enemies within sight range MUST move toward the player

#### UI Requirements

- **FR-044**: System MUST display in landscape/horizontal orientation only
- **FR-045**: System MUST show player stats panel (top-right): HP, ATK, ARM, SPEED, GOLD with emoji icons
- **FR-046**: System MUST show top bar with week progress timeline and boss preview
- **FR-047**: System MUST make boss preview tappable/clickable to show detailed tooltip
- **FR-048**: Combat scene MUST show enemy panel (left sidebar) with name, trait, active effects
- **FR-049**: Combat scene MUST show player panel (right sidebar) with active effects and equipped items
- **FR-050**: System MUST use emojis for all visual representations per the specification

#### Determinism & Reproducibility

- **FR-051**: All procedural generation (maps, spawns, loot) MUST be driven by a seed value
- **FR-052**: Given the same seed, the same run MUST be reproducible exactly
- **FR-053**: Combat outcomes MUST be identical given the same initial state and seed

---

### Key Entities

- **Player**: The controllable Mole character with stats (HP, ATK, ARM, SPD, DIG, GOLD), equipped Tool, equipped Gear items, active status effects, and current map position

- **Map**: A grid of tiles (Wall, Empty Tunnel, Soft Earth, Hard Rock) with corridor-based layout, fog of war state, and placed entities (enemies, POIs)

- **Enemy**: A hostile entity on the map with type, tier (1-3), stats (HP, ATK, ARM, SPD), trait, and active status effects

- **Boss**: A special enemy encountered at week end with fixed stats, unique trait, and phase mechanics (for Eldritch Mole)

- **Tool**: An equippable weapon item with ID, name, emoji, rarity, stat bonuses, tags, and optional effect

- **Gear**: An equippable item with ID, name, emoji, rarity tier (affects stats), stat bonuses, tags, and effect

- **Itemset**: A collection of specific items that grants a bonus effect when all are equipped simultaneously

- **Status Effect**: A combat modifier (Chill, Shrapnel, Rust) with stack count and per-turn behavior

- **POI (Point of Interest)**: A map location with type, interaction trigger, and output options

- **Week**: A progression unit containing 3 Day/Night cycles and a boss, with selected boss determined at start

- **Run**: A complete playthrough from Week 1 start to Week 3 boss completion or player death

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Players can complete a full exploration loop (spawn, move, reveal tiles, encounter enemy, return to map) within the first play session
- **SC-002**: Combat resolution completes in under 30 seconds for typical enemy encounters (non-boss)
- **SC-003**: A complete 3-week run can be finished in 20-40 minutes of active play
- **SC-004**: Given the same seed, 100% of game elements (map layout, enemy placement, item drops, combat outcomes) are identical across runs
- **SC-005**: Frame rate maintains 60 FPS during exploration and combat on target mobile hardware (Solana Seeker)
- **SC-006**: All 8 enemy types behave according to their trait specifications in 100% of encounters
- **SC-007**: All 7 bosses execute their traits correctly in 100% of encounters
- **SC-008**: All 35 items (8 Tools + 27 Gear) function according to their specifications
- **SC-009**: All 8 itemset bonuses activate correctly when requirements are met
- **SC-010**: Players understand the week structure (Day/Night/Boss cycle) without external documentation
- **SC-011**: The D-pad control scheme allows precise single-tile movement with no accidental double-moves
- **SC-012**: Item tooltips provide sufficient information for players to understand item effects and make build decisions

---

## Assumptions

- The prototype is PvE-only; PvP, Echoes, Gauntlet, wallets, blockchain, and networking are explicitly out of scope
- "He Is Coming" serves as the reference implementation for ambiguous design decisions
- Emoji-based visuals are acceptable for the prototype; production art assets are not required
- The player character is represented by the otter emoji as a placeholder for the Mole
- Sound/audio is not required for the prototype
- The DIG stat is relevant for certain item effects and boss comparisons, even if not directly used in all combat scenarios
- "Non-weapon damage" (from bombs, shards, etc.) ignores Armor unless stated otherwise
- "Wounded" trigger condition means the combatant's HP has dropped below 50%
- "Exposed" trigger condition means the combatant has 0 Armor
- Mobile-first design targets Solana Seeker hardware specifications
- Web builds are for development/testing purposes only

---

## Appendices

### Appendix A: Enemy Data Reference

| Enemy | Emoji | T1 Stats | T2 Stats | T3 Stats | Trait |
|-------|-------|----------|----------|----------|-------|
| Tunnel Rat | 🐀 | 3/1/0/2 | 5/2/0/3 | 7/3/0/4 | On Hit: Steal 1 Gold (max once/turn) |
| Cave Bat | 🦇 | 4/1/0/2 | 6/2/0/3 | 8/3/0/4 | Every other strike: restore 1 HP |
| Spore Slime | 🟢 | 6/1/2/0 | 9/2/3/0 | 12/3/4/0 | Battle Start: Give player 2 Chill |
| Rust Mite Swarm | 🐜 | 5/1/0/3 | 8/2/0/4 | 11/3/0/5 | On Hit: Apply 1 Rust |
| Collapsed Miner | 🧟 | 8/2/0/1 | 12/3/0/2 | 16/4/0/3 | Wounded: Gain +3 ATK |
| Shard Beetle | 🪲 | 7/1/3/1 | 10/2/4/1 | 13/3/5/2 | Battle Start: Gain 5 Shrapnel |
| Tunnel Warden | 🦀 | 6/2/4/2 | 9/3/6/3 | 12/4/8/4 | First strike: Remove 4 Armor before damage |
| Burrow Ambusher | 🦂 | 5/4/0/3 | 8/6/0/4 | 11/8/0/5 | Ambush: Battle Start deal 3 damage (ignores armor) |

### Appendix B: Boss Data Reference

| Boss | Emoji | Week | Stats | Trait |
|------|-------|------|-------|-------|
| The Broodmother | 🕷️ | 1 | 20/1/0/3 | Swarm: Strikes 3 times per turn |
| Obsidian Golem | 🗿 | 1 | 12/3/18/0 | Hardened: Turn Start regenerate +3 Armor |
| Gas Anomaly | ☁️ | 1 | 28/2/0/2 | Toxic Seep: Turn Start deal 2 damage ignoring Armor |
| Mad Miner | ⛏️ | 1 | 22/3/6/2 | Scavenger Mirror: Battle Start gains one of your Common item effects |
| Drill Sergeant | 🪖 | 2 | 26/0/10/2 | Rev Up: Gains +2 ATK at Turn Start |
| Crystal Mimic | 💎 | 2 | 30/4/8/3 | Reflection: First status application per turn reflects to player |
| The Eldritch Mole | 🐲 | 3 | 60/5/12/3 | Three Phases: 75% +12 Armor, 50% strike twice, 25% +3 ATK +2 DIG |

### Appendix C: Tool Data Reference

| ID | Name | Emoji | Rarity | Stats | Tags | Effect |
|----|------|-------|--------|-------|------|--------|
| T1 | Polished Pickaxe | ⛏️ | Common | +3 ATK | STONE | - |
| T2 | Reinforced Shovel | 🛠️ | Common | +1 ATK, +6 ARM | STONE | - |
| T3 | Twin Picks | ⛏️⛏️ (stacked) | Common | +1 ATK | SCOUT | Strike twice each turn |
| T4 | Prospector's Pike | 🗡️ | Common | +2 ATK, +2 DIG | SCOUT | - |
| T5 | Pneumatic Drill | 🌀 | Rare | +1 ATK | SCOUT | Strike 3 times each turn |
| T6 | Shadow Burrowblade | 🗡️ | Rare | +2 ATK | SCOUT | On Hit: strikes ignore Armor |
| T7 | Gemfinder Staff | 🔮 | Heroic | +1 ATK, +1 ARM, +1 DIG | GREED | Gains On-Hit effects from Shards |
| T8 | Tempest Drill | 🌪️ | Mythic | +0 | SCOUT | Attack equals your DIG |
| T9 | Rusty Pickaxe | ⛏️ | Common | +1 ATK | STONE | - |

Starter note: Each run begins with the Rusty Pickaxe (T9) equipped.

### Appendix D: Gear Data Reference

*(See full item tables in implementation documents)*

### Appendix E: Itemset Data Reference

| Set Name | Emoji | Required Items | Bonus |
|----------|-------|----------------|-------|
| Union Standard | 🧰 | I2 + I3 + I1 | Battle Start: +4 Armor, +1 DIG |
| Shard Circuit | 🔁 | I11 + I12 + I13 + I14 | Shards trigger every turn |
| Demolition Permit | 🧾 | I16 + I18 + I10 | Countdown items trigger 1 turn sooner |
| Fuse Network | 🕸️ | I17 + I19 + I20 | First non-weapon damage per turn deals +2 |
| Shrapnel Harness | 🛡️ | I6 + I21 + T2 | Keep up to 3 Shrapnel at end of turn |
| Rust Ritual | ☣️ | I22 + I23 + I5 | On Hit: apply +1 additional Rust |
| Swift Digger Kit | ⚡ | T3 + I1 + I27 | Battle Start: If DIG > enemy DIG, +2 strikes |
| Royal Extraction | 🏦 | I8 + I25 + T7 | Gold to Armor conversion becomes 1:4 |

### Appendix F: POI Data Reference

| ID | Location | Emoji | Rarity | Interaction |
|----|----------|-------|--------|-------------|
| L1 | Mole Den | 🏠 | Fixed | Night only: Skip to Day, restore all HP |
| L2 | Supply Cache | 📦 | Common | Pick 1 of 3 Common items |
| L3 | Tool Crate | 🧰 | Uncommon | Pick 1 of 3 Tools |
| L4 | Tool Oil Rack | 🛢️ | Common | Modify tool: +1 ATK/ARM/DIG (once per tool) |
| L5 | Rest Alcove | 🕯️ | Common | Night only: Skip to Day, restore 10 HP |
| L6 | Survey Beacon | 📡 | Common | Reveal tiles in radius 13 |
| L7 | Seismic Scanner | 📍 | Uncommon | Choose POI type, reveal nearest instance |
| L8 | Rail Waypoint | 🚇 | Uncommon | Fast travel between discovered waypoints |
| L9 | Smuggler Hatch | 🕳️ | Uncommon | Shop: 5 Rare + 1 Heroic items |
| L10 | Rusty Anvil | ⚒️ | Uncommon | Upgrade tool with forge mods (costs Gold) |
| L11 | Crusher Golem | 🗿 | Rare | Fuse 2 identical items to upgrade tier |
| L12 | Geode Vault | 💠 | Rare | Pick 1 of 3 Heroic items |
