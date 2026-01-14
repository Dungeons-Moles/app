# Feature Specification: GDD Mechanics Update

**Feature Branch**: `003-gdd-mechanics-update`
**Created**: 2026-01-13
**Status**: Draft
**Input**: Update game mechanics (enemies, items, bosses, itemsets, POIs) per GDD v0.1 specification. Replace emoji art with images. Remove entity border squares from map.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Complete Item System with 80 Items (Priority: P1)

Players need access to the full item catalog defined in the GDD, with 80 items across 8 tags (STONE, SCOUT, GREED, BLAST, FROST, RUST, BLOOD, TEMPO), each with proper tier scaling (I/II/III) and effects that work correctly in combat.

**Why this priority**: Items are the core build-crafting mechanic that defines player agency. Without the complete item system, players cannot create meaningful builds or experience the game's strategic depth.

**Independent Test**: Start a PvE run, pick up items from POIs, equip them, and verify their effects apply correctly in combat encounters.

**Acceptance Scenarios**:

1. **Given** a player at a Supply Cache, **When** they interact with it, **Then** they see 3 item options from the correct rarity pool with proper stats
2. **Given** a player with a Tier I item and its duplicate, **When** they use a Rune Kiln, **Then** the items fuse into a Tier II version with scaled stats
3. **Given** a player equips Spiked Bracers, **When** combat starts, **Then** they gain the correct Shrapnel stacks (2/4/6 based on tier)

---

### User Story 2 - Field Enemies with 12 Archetypes and 3 Tiers (Priority: P1)

Players encounter the complete roster of 12 field enemy archetypes (Tunnel Rat, Cave Bat, Spore Slime, etc.), each appearing with the correct tier (T1/T2/T3) and their unique combat traits functioning properly.

**Why this priority**: Field enemies are the primary combat encounters that drive the exploration loop. They provide gold income and test player builds.

**Independent Test**: Start a PvE run, navigate to enemies on the map, fight them, and verify each enemy type has correct stats and traits for their tier.

**Acceptance Scenarios**:

1. **Given** a player encounters a Tunnel Rat, **When** the rat hits the player, **Then** it steals 1 gold (once per turn)
2. **Given** a player defeats a T2 enemy, **When** victory is calculated, **Then** they receive 4 gold
3. **Given** a player encounters a Shard Beetle, **When** battle starts, **Then** the beetle gains 6 Shrapnel

---

### User Story 3 - Combat Status Effects (Priority: P1)

Combat includes all four status effects (Chill, Shrapnel, Rust, Bleed) with their complete mechanics as defined in the GDD.

**Why this priority**: Status effects are fundamental to combat resolution and build synergies. Many items and enemies depend on these systems.

**Independent Test**: Equip items that apply status effects, fight enemies, and verify each effect applies and resolves correctly per turn.

**Acceptance Scenarios**:

1. **Given** an enemy with 2 Chill stacks, **When** their turn starts, **Then** their strikes this turn are reduced by 2 (minimum 1 strike), and 1 Chill stack is removed at turn end
2. **Given** a player with 5 Shrapnel, **When** struck by an enemy, **Then** the enemy takes 5 damage, and Shrapnel clears at end of turn
3. **Given** an enemy with 3 Rust stacks, **When** their turn ends, **Then** they lose 3 Armor (minimum 0), and Rust stacks persist
4. **Given** a player with 2 Bleed stacks, **When** their turn ends, **Then** they take 2 damage and 1 Bleed stack is removed

---

### User Story 4 - Boss Encounters (Priority: P1)

Players face the complete roster of bosses from both Biome A and Biome B, appearing at the end of each week with correct stats, weakness tags, and combat abilities.

**Why this priority**: Boss fights are the climactic encounters that gate weekly progression. They validate player builds and provide the challenge peaks.

**Independent Test**: Play through a 3-week run, encounter the weekly boss at the end of each week, and verify boss stats, traits, and phase mechanics work correctly.

**Acceptance Scenarios**:

1. **Given** Week 1 ends, **When** the boss fight triggers, **Then** the boss has correct stats and weakness tags matching the GDD
2. **Given** a player fights The Broodmother, **When** combat proceeds, **Then** the boss attacks 3 times per turn and applies Chill every other turn
3. **Given** a player fights The Eldritch Mole, **When** its HP drops below 75%/50%/25%, **Then** the corresponding phase abilities activate

---

### User Story 5 - Complete POI System with 14 Types (Priority: P1)

Players discover and interact with all 14 POI types (Mole Den, Supply Cache, Tool Crate, etc.) with correct behaviors, availability rules (Day/Night), and usage limits (one-time vs repeatable).

**Why this priority**: POIs drive exploration decisions and provide the items, upgrades, and utilities that shape runs.

**Independent Test**: Explore the map to find various POI types, interact with each, and verify their behavior matches the GDD specification.

**Acceptance Scenarios**:

1. **Given** a player at a Mole Den during Night, **When** they interact, **Then** time skips to Day and HP fully restores
2. **Given** a player at a Supply Cache, **When** they interact, **Then** they choose 1 of 3 Common Gear items (weighted by boss weakness tags)
3. **Given** a player visits a Tool Oil Rack with an un-modified tool, **When** they interact, **Then** they can choose +1 ATK, +1 SPD, or +1 DIG for that tool

---

### User Story 6 - Itemset Bonuses (Priority: P2)

When players equip specific item combinations, the corresponding itemset bonus activates and applies during combat.

**Why this priority**: Itemsets reward build coherence and add strategic depth, but the base item system must work first.

**Independent Test**: Collect and equip items that form an itemset, enter combat, and verify the set bonus applies.

**Acceptance Scenarios**:

1. **Given** a player equips G-ST-01, G-ST-02, and G-SC-01, **When** battle starts, **Then** they gain +4 Armor and +1 DIG (Union Standard set)
2. **Given** a player has all 4 Shard items equipped, **When** combat proceeds, **Then** Shard effects trigger every turn instead of every other turn
3. **Given** a player has incomplete itemset items, **When** in combat, **Then** no set bonus applies

---

### User Story 7 - Image-Based Entity Rendering (Priority: P2)

Enemies, bosses, POIs, and the player character display as images instead of emojis, without visible background squares.

**Why this priority**: Visual polish improves player experience but is not required for core gameplay functionality.

**Independent Test**: Start a PvE run, observe the map, and verify all entities render as images without visible border/background squares.

**Acceptance Scenarios**:

1. **Given** a map with enemies, **When** rendered, **Then** enemies display their assigned image (e.g., tunnel-rat.png for Tunnel Rat)
2. **Given** a map with POIs, **When** rendered, **Then** POIs display their assigned image without visible background squares
3. **Given** the player on the map, **When** rendered, **Then** the player character displays as an image without a visible background square

---

### User Story 8 - Dig Mechanic with DIG Stat (Priority: P2)

Players can dig through walls with a cost based on their DIG stat: `digMoves = max(2, 6 - DIG)`.

**Why this priority**: Digging enables routing options but exploration works without it via floor tiles.

**Independent Test**: Acquire DIG-boosting items, attempt to dig walls, and verify the move cost follows the formula.

**Acceptance Scenarios**:

1. **Given** a player with DIG 1, **When** they dig a wall, **Then** it costs 5 moves
2. **Given** a player with DIG 4, **When** they dig a wall, **Then** it costs 2 moves
3. **Given** a player with DIG 6, **When** they dig a wall, **Then** it costs 2 moves (minimum floor)

---

### Edge Cases

- What happens when a player has more items than inventory slots? (They must use Scrap Chute to destroy items or Rune Kiln to fuse)
- How does combat resolve when both combatants would die on the same turn? (Higher HP% wins; tie goes to enemy)
- What happens when a countdown bomb reduces to 0 but the player has Blast Suit? (Player ignores self-damage)
- How do multiple On Hit (once/turn) effects interact? (Each triggers independently, all limited to once per turn)
- What happens when Rust reduces armor below 0? (Armor cannot go negative, stops at 0)

## Requirements *(mandatory)*

### Functional Requirements

#### Items & Equipment
- **FR-001**: System MUST provide 80 distinct items across 8 tags (STONE, SCOUT, GREED, BLAST, FROST, RUST, BLOOD, TEMPO)
- **FR-002**: System MUST support 4 rarity tiers for items (Common, Rare, Heroic, Mythic)
- **FR-003**: System MUST support 3 upgrade tiers (I, II, III) with scaled numeric values
- **FR-004**: System MUST enforce exactly 1 Tool equipped at a time
- **FR-005**: System MUST start players with 4 Gear slots, adding 2 after Week 1 boss and 2 after Week 2 boss
- **FR-006**: System MUST allow item fusion at Rune Kiln (2 identical items upgrade to next tier)

#### Combat
- **FR-007**: System MUST resolve turn order by SPD (higher acts first; ties favor enemy)
- **FR-008**: System MUST calculate weapon damage as `max(0, attackerATK - targetARM)`
- **FR-009**: System MUST process non-weapon damage without Armor reduction (unless specified)
- **FR-010**: System MUST implement sudden death starting at Turn 25 (+1 ATK per turn for both)
- **FR-011**: System MUST resolve stalemates at Turn 50 (higher HP% wins; tie goes to enemy)

#### Status Effects
- **FR-012**: System MUST implement Chill: reduces holder's strikes by stack count at Turn Start (min 1), removes 1 stack at turn end
- **FR-013**: System MUST implement Shrapnel: deals damage equal to stacks when struck, clears at end of turn
- **FR-014**: System MUST implement Rust: removes Armor equal to stacks at end of turn, stacks persist
- **FR-015**: System MUST implement Bleed: deals damage equal to stacks at end of turn, removes 1 stack at turn end

#### Enemies
- **FR-016**: System MUST provide 12 field enemy archetypes with 3 tiers each (T1, T2, T3)
- **FR-017**: System MUST reward gold per tier: T1=2, T2=4, T3=6
- **FR-018**: System MUST apply each enemy's unique trait during combat

#### Bosses
- **FR-019**: System MUST provide all bosses from Biome A (5 Week 1, 5 Week 2, 2 Week 3 finals)
- **FR-020**: System MUST provide all bosses from Biome B (variants + 2 new Week 3 finals)
- **FR-021**: System MUST assign 2 weakness tags per boss for loot weighting
- **FR-022**: System MUST trigger boss fights automatically when the last Night of each week ends

#### POIs
- **FR-023**: System MUST provide 14 POI types with correct interaction behaviors
- **FR-024**: System MUST enforce one-time vs repeatable usage per POI type
- **FR-025**: System MUST enforce Day/Night availability for time-restricted POIs (Mole Den, Rest Alcove)
- **FR-026**: System MUST weight item offers toward current week boss weakness tags (1.4x weight vs 1.0 base)

#### Itemsets
- **FR-027**: System MUST activate itemset bonuses when all required items are equipped
- **FR-028**: System MUST provide all 12 itemsets defined in the GDD

#### Visual Rendering
- **FR-029**: System MUST render enemies, bosses, POIs, and player as images instead of emojis
- **FR-030**: System MUST NOT display visible background/border squares around entities on the map
- **FR-031**: System MUST load entity images efficiently for mobile performance

#### Digging
- **FR-032**: System MUST calculate dig cost as `max(2, 6 - DIG)`
- **FR-033**: System MUST convert a Wall tile to Floor when dug

### Key Entities

- **Item**: Represents equipment (Tool or Gear) with ID, name, type, tag, rarity, tier, and effect properties
- **Enemy**: Represents a field combatant with archetype, tier, stats (HP/ATK/ARM/SPD/DIG), and trait behavior
- **Boss**: Represents a week-ending combatant with stats, weakness tags, and phase/trait behaviors
- **POI**: Represents an interactable map location with type, availability rules, and interaction behavior
- **Itemset**: Represents a bonus that activates when specific items are equipped together
- **Status Effect**: Represents a combat modifier (Chill/Shrapnel/Rust/Bleed) with stack count and behavior

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 80 items from the GDD are selectable and their effects apply correctly in combat (100% coverage)
- **SC-002**: All 12 enemy archetypes appear in runs with correct tier distribution and functional traits (100% coverage)
- **SC-003**: All bosses from both biomes are encounterable with correct stats and abilities (100% coverage)
- **SC-004**: All 14 POI types function correctly with proper availability and usage rules (100% coverage)
- **SC-005**: All 12 itemsets activate correctly when conditions are met (100% coverage)
- **SC-006**: All 4 status effects (Chill, Shrapnel, Rust, Bleed) resolve correctly per turn (100% accuracy)
- **SC-007**: Entity images render without visible border squares on the map (visual inspection pass)
- **SC-008**: Map renders smoothly on mobile devices without frame drops during exploration (maintains 60fps baseline)
- **SC-009**: Combat outcomes are deterministic given the same inputs (replay verification)
- **SC-010**: A complete 3-week run can be played from start to Week 3 boss without errors (end-to-end test pass)

## Scope Boundaries

### In Scope
- All 80 items with full effect implementation
- All 12 field enemy archetypes (3 tiers each)
- All bosses from Biome A and Biome B
- All 14 POI types with complete behaviors
- All 12 itemsets
- All 4 status effects
- Dig mechanic with DIG stat
- Image-based entity rendering
- Removal of entity border squares
- Single random map per PvE run (current behavior preserved)

### Out of Scope
- Campaign/stage progression system
- Act progression (A / B / A+ / B+)
- Biome-specific spawn weighting by act
- Act+ boss modifiers (stat scaling by stage)
- Telemetry/analytics for balancing
- Stage-determined boss mapping
- Tier distribution changes by act (using flat distribution for this feature)

## Assumptions

- The existing combat engine can be extended to support new status effects without major restructuring
- The existing POI interaction system can accommodate the new POI types and behaviors
- Image assets in the assets folder are correctly named and sized for mobile display
- The seeded RNG system can handle the expanded item pool and loot weighting
- Player inventory management (slot limits, fusion) integrates with existing UI patterns
- The current Day/Night/Week time system remains unchanged
- For tier distribution in the absence of act data, a balanced distribution will be used (T1: 50%, T2: 35%, T3: 15%)
