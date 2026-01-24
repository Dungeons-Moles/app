# Tasks: GDD Mechanics Update

**Input**: Design documents from `/specs/003-gdd-mechanics-update/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Tests are REQUIRED per Constitution principles P10 (Comprehensive Unit Testing) and P11 (RNG Determinism Testing).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Type definitions and shared infrastructure updates

- [x] T001 Update ItemTag type to include all 8 tags (STONE, SCOUT, GREED, BLAST, FROST, RUST, BLOOD, TEMPO) in src/data/types.ts
- [x] T002 [P] Add EffectTiming type with all trigger timings (BATTLE_START, TURN_START, ON_HIT, EVERY_OTHER_TURN, etc.) in src/data/types.ts
- [x] T003 [P] Add EnemyArchetype type with all 12 archetypes in src/data/types.ts
- [x] T004 [P] Add BossId type with GDD IDs (B-A-W1-01 through B-B-W3-02) in src/data/types.ts
- [x] T005 [P] Add POIId type for L1-L14 in src/data/types.ts
- [x] T006 [P] Add ItemsetId type for all 12 itemsets in src/data/types.ts
- [x] T007 Create image preloading hook for entity sprites in src/hooks/useEntityImages.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T008 Add Bleed to StatusEffects interface in src/game/combat/status-effects.ts
- [x] T009 Implement Bleed processing in processStatusEffectsTurnEnd() in src/game/combat/status-effects.ts
- [x] T010 Add Bleed display constants (emoji: 🩸, color: #dc2626) in src/game/combat/status-effects.ts
- [x] T011 Update damage.ts to apply Bleed damage at turn end in src/game/combat/damage.ts
- [x] T012 [P] Add test for Bleed damage at turn end in **tests**/unit/combat/status-effects.test.ts
- [x] T013 [P] Add test for Bleed stack decay (-1 per turn) in **tests**/unit/combat/status-effects.test.ts
- [x] T014 [P] Add determinism test for Bleed effect in **tests**/unit/combat/status-effects.test.ts

**Checkpoint**: Foundation ready - Bleed status effect works, user story implementation can begin

---

## Phase 3: User Story 1 - Complete Item System (Priority: P1) 🎯 MVP

**Goal**: Players have access to full 80-item catalog with tier scaling and combat effects

**Independent Test**: Start a PvE run, pick up items from POIs, equip them, verify effects apply in combat

### Tests for User Story 1

- [x] T015 [P] [US1] Add validation test: exactly 80 items (16 Tools + 64 Gear) in **tests**/unit/data/items.test.ts
- [x] T016 [P] [US1] Add validation test: all items have valid tier arrays [I, II, III] in **tests**/unit/data/items.test.ts
- [x] T017 [P] [US1] Add test: tier stat scaling returns correct values in **tests**/unit/data/items.test.ts
- [x] T018 [P] [US1] Add test: item effect timings match GDD specification in **tests**/unit/data/items.test.ts
- [x] T019 [P] [US1] Add combat test: BATTLE_START item effects apply correctly in **tests**/unit/combat/resolver.test.ts
- [x] T020 [P] [US1] Add combat test: ON_HIT item effects trigger once per turn in **tests**/unit/combat/resolver.test.ts

### Implementation for User Story 1

- [x] T021 [P] [US1] Define STONE tag items (T-ST-01, T-ST-02, G-ST-01 through G-ST-08) with tier stats in src/data/gear.ts
- [x] T022 [P] [US1] Define SCOUT tag items (T-SC-01, T-SC-02, G-SC-01 through G-SC-08) with tier stats in src/data/gear.ts
- [x] T023 [P] [US1] Define GREED tag items (T-GR-01, T-GR-02, G-GR-01 through G-GR-08) with tier stats in src/data/gear.ts
- [x] T024 [P] [US1] Define BLAST tag items (T-BL-01, T-BL-02, G-BL-01 through G-BL-08) with tier stats in src/data/gear.ts
- [x] T025 [P] [US1] Define FROST tag items (T-FR-01, T-FR-02, G-FR-01 through G-FR-08) with tier stats in src/data/gear.ts
- [x] T026 [P] [US1] Define RUST tag items (T-RU-01, T-RU-02, G-RU-01 through G-RU-08) with tier stats in src/data/gear.ts
- [x] T027 [P] [US1] Define BLOOD tag items (T-BO-01, T-BO-02, G-BO-01 through G-BO-08) with tier stats in src/data/gear.ts
- [x] T028 [P] [US1] Define TEMPO tag items (T-TE-01, T-TE-02, G-TE-01 through G-TE-08) with tier stats in src/data/gear.ts
- [x] T029 [US1] Add getItemStats() helper to resolve tier values from item definition in src/data/gear.ts
- [x] T030 [US1] Integrate new item effects into combat resolver for BATTLE_START timing in src/game/combat/resolver.ts
- [x] T031 [US1] Integrate new item effects into combat resolver for ON_HIT timing in src/game/combat/resolver.ts
- [x] T032 [US1] Integrate new item effects into combat resolver for TURN_END timing in src/game/combat/resolver.ts
- [x] T033 [US1] Integrate new item effects into combat resolver for WOUNDED trigger in src/game/combat/resolver.ts
- [x] T034 [US1] Integrate new item effects into combat resolver for EXPOSED trigger in src/game/combat/resolver.ts
- [x] T035 [US1] Integrate countdown bomb mechanics for BLAST items in src/game/combat/resolver.ts

**Checkpoint**: User Story 1 complete - 80 items functional with tier scaling and combat effects

---

## Phase 4: User Story 2 - Field Enemies (Priority: P1)

**Goal**: 12 enemy archetypes with 3 tiers each, unique traits, correct gold rewards

**Independent Test**: Fight each enemy type, verify stats match GDD, traits activate correctly

### Tests for User Story 2

- [x] T036 [P] [US2] Add validation test: exactly 12 enemy archetypes in **tests**/unit/data/enemies.test.ts
- [x] T037 [P] [US2] Add validation test: gold rewards T1=2, T2=4, T3=6 in **tests**/unit/data/enemies.test.ts
- [x] T038 [P] [US2] Add combat test: Tunnel Rat steals 1 gold on hit in **tests**/unit/combat/resolver.test.ts
- [x] T039 [P] [US2] Add combat test: Shard Beetle gains 6 Shrapnel at battle start in **tests**/unit/combat/resolver.test.ts
- [x] T040 [P] [US2] Add combat test: Blood Mosquito applies 1 Bleed on hit in **tests**/unit/combat/resolver.test.ts
- [x] T041 [P] [US2] Add combat test: Powder Tick countdown(2) deals 6 damage in **tests**/unit/combat/resolver.test.ts

### Implementation for User Story 2

- [x] T042 [P] [US2] Create EnemyDefinition interface with archetype, tier stats, trait in src/game/entities/enemies.ts
- [x] T043 [US2] Define all 12 enemy archetypes with T1/T2/T3 stats from GDD in src/game/entities/enemies.ts
- [x] T044 [US2] Add enemy trait handlers for BATTLE_START traits (Spore Slime, Shard Beetle, Burrow Ambusher, Coin Slug) in src/game/combat/traits.ts
- [x] T045 [US2] Add enemy trait handlers for ON_HIT traits (Tunnel Rat, Rust Mite Swarm, Blood Mosquito) in src/game/combat/traits.ts
- [x] T046 [US2] Add enemy trait handlers for EVERY_OTHER_TURN traits (Cave Bat) in src/game/combat/traits.ts
- [x] T047 [US2] Add enemy trait handlers for WOUNDED traits (Collapsed Miner) in src/game/combat/traits.ts
- [x] T048 [US2] Add enemy trait handlers for FIRST_STRIKE traits (Tunnel Warden) in src/game/combat/traits.ts
- [x] T049 [US2] Add enemy trait handlers for FIRST_TURN traits (Frost Wisp) in src/game/combat/traits.ts
- [x] T050 [US2] Add enemy trait handlers for COUNTDOWN traits (Powder Tick) in src/game/combat/traits.ts
- [x] T051 [US2] Update enemy spawner to use new enemy definitions with tier selection in src/game/map/generator.ts
- [x] T052 [US2] Implement tier distribution (T1: 50%, T2: 35%, T3: 15%) in src/game/map/generator.ts

**Checkpoint**: User Story 2 complete - all 12 enemies spawn with correct stats and traits

---

## Phase 5: User Story 3 - Combat Status Effects (Priority: P1)

**Goal**: All 4 status effects (Chill, Shrapnel, Rust, Bleed) work per GDD specification

**Independent Test**: Apply each status effect via items/enemies, verify mechanics at each combat phase

### Tests for User Story 3

- [x] T053 [P] [US3] Add test: Chill reduces strikes by stack count (min 1) in **tests**/unit/combat/status-effects.test.ts
- [x] T054 [P] [US3] Add test: Chill removes 1 stack at turn end in **tests**/unit/combat/status-effects.test.ts
- [x] T055 [P] [US3] Add test: Shrapnel reflects damage equal to stacks when struck in **tests**/unit/combat/status-effects.test.ts
- [x] T056 [P] [US3] Add test: Shrapnel clears at end of turn (without Shrapnel Harness) in **tests**/unit/combat/status-effects.test.ts
- [x] T057 [P] [US3] Add test: Rust reduces ARM by stacks (persists indefinitely) in **tests**/unit/combat/status-effects.test.ts

### Implementation for User Story 3

- [x] T058 [US3] Update Chill processing: reduce strikesPerTurn by chill stacks (min 1) in src/game/combat/status-effects.ts
- [x] T059 [US3] Update Shrapnel processing: reflect damage when struck in src/game/combat/resolver.ts
- [x] T060 [US3] Verify Rust ARM reduction calculation in getEffectiveArm() in src/game/combat/status-effects.ts
- [x] T061 [US3] Add status effect application logging to combat log in src/game/combat/resolver.ts

**Checkpoint**: User Story 3 complete - all 4 status effects work correctly

---

## Phase 6: User Story 4 - Boss Encounters (Priority: P1)

**Goal**: All bosses from Biome A and B with correct stats, weakness tags, and abilities

**Independent Test**: Play through 3-week run, encounter bosses, verify stats and abilities

### Tests for User Story 4

- [x] T062 [P] [US4] Add validation test: Biome A has 5 Week 1, 5 Week 2, 2 Week 3 bosses in **tests**/unit/entities/bosses.test.ts
- [x] T063 [P] [US4] Add validation test: Biome B has variants + 2 Week 3 bosses in **tests**/unit/entities/bosses.test.ts
- [x] T064 [P] [US4] Add validation test: all bosses have 2 weakness tags in **tests**/unit/entities/bosses.test.ts
- [x] T065 [P] [US4] Add combat test: Broodmother attacks 3 times per turn in **tests**/unit/entities/bosses.test.ts
- [x] T066 [P] [US4] Add combat test: Obsidian Golem gains +4 ARM at turn start in **tests**/unit/entities/bosses.test.ts
- [x] T067 [P] [US4] Add combat test: Eldritch Mole phase transitions at 75%/50%/25% HP in **tests**/unit/entities/bosses.test.ts

### Implementation for User Story 4

- [x] T068 [P] [US4] Define Biome A Week 1 bosses (Broodmother, Obsidian Golem, Gas Anomaly, Mad Miner, Shard Colossus) in src/data/bosses.ts
- [x] T069 [P] [US4] Define Biome A Week 2 bosses (Drill Sergeant, Crystal Mimic, Rust Regent, Powder Keg Baron, Greedkeeper) in src/data/bosses.ts
- [x] T070 [P] [US4] Define Biome A Week 3 finals (The Eldritch Mole, The Gilded Devourer) in src/data/bosses.ts
- [x] T071 [P] [US4] Define Biome B Week 3 finals (Frostbound Leviathan, Rusted Chronomancer) in src/data/bosses.ts
- [x] T072 [US4] Implement boss ability handlers for multi-strike abilities in src/game/entities/bosses.ts
- [x] T073 [US4] Implement boss ability handlers for ARM regen abilities in src/game/entities/bosses.ts
- [x] T074 [US4] Implement boss ability handlers for status effect abilities in src/game/entities/bosses.ts
- [x] T075 [US4] Implement boss phase transition logic (HP threshold triggers) in src/game/entities/bosses.ts
- [x] T076 [US4] Implement boss selection for week using SeededRNG in src/game/time/progression.ts
- [x] T077 [US4] Store selected boss weaknesses for loot weighting via getBossWeaknessTags() in src/game/entities/bosses.ts

**Checkpoint**: User Story 4 complete - all bosses function with correct abilities

---

## Phase 7: User Story 5 - Complete POI System (Priority: P1)

**Goal**: 14 POI types with correct behaviors, availability rules, and usage limits

**Independent Test**: Explore map, interact with each POI type, verify behavior matches GDD

### Tests for User Story 5

- [x] T078 [P] [US5] Add validation test: exactly 14 POI types (L1-L14) in **tests**/unit/data/pois.test.ts
- [x] T079 [P] [US5] Add validation test: night-only POIs (L1, L5) in **tests**/unit/data/pois.test.ts
- [x] T080 [P] [US5] Add test: Mole Den restores all HP and skips to Day in **tests**/unit/entities/pois.test.ts
- [x] T081 [P] [US5] Add test: Supply Cache offers 3 items weighted by boss weakness tags in **tests**/unit/entities/pois.test.ts
- [x] T082 [P] [US5] Add test: Counter Cache (L13) offers items only from boss weakness tags in **tests**/unit/entities/pois.test.ts

### Implementation for User Story 5

- [x] T083 [P] [US5] Add L13 (Counter Cache) definition in src/data/pois.ts
- [x] T084 [P] [US5] Add L14 (Scrap Chute) definition in src/data/pois.ts
- [x] T085 [US5] Implement item offer generation with tag weighting (1.4x for weakness tags) in src/game/entities/pois.ts
- [x] T086 [US5] Implement Counter Cache logic (only weakness tag items) in src/game/entities/pois.ts
- [x] T087 [US5] Implement Scrap Chute logic (destroy gear for gold cost) in src/game/entities/pois.ts
- [x] T088 [US5] Update POI spawner to include L13 and L14 in src/game/map/generator.ts
- [x] T089 [US5] Ensure night-only POIs (L1, L5) check time before allowing interaction in src/game/entities/pois.ts

**Checkpoint**: User Story 5 complete - all 14 POI types function correctly

---

## Phase 8: User Story 6 - Itemset Bonuses (Priority: P2)

**Goal**: 12 itemsets activate when required items equipped, bonuses apply in combat

**Independent Test**: Equip items forming a set, enter combat, verify set bonus applies

### Tests for User Story 6

- [x] T090 [P] [US6] Add validation test: exactly 12 itemsets in **tests**/unit/data/itemsets.test.ts
- [x] T091 [P] [US6] Add test: itemset activates when all required items equipped in **tests**/unit/data/itemsets.test.ts
- [x] T092 [P] [US6] Add test: incomplete itemset does not activate in **tests**/unit/data/itemsets.test.ts
- [x] T093 [P] [US6] Add test: Union Standard grants +4 ARM +1 DIG at battle start in **tests**/unit/combat/itemsets.test.ts
- [x] T094 [P] [US6] Add test: Shard Circuit makes shards trigger every turn in **tests**/unit/combat/itemsets.test.ts

### Implementation for User Story 6

- [x] T095 [P] [US6] Define 4 new itemsets (Whiteout Initiative, Bloodrush Protocol, Corrosion Payload, Golden Shrapnel Exchange) in src/data/itemsets.ts
- [x] T096 [US6] Update existing 8 itemsets with correct GDD item IDs in src/data/itemsets.ts
- [x] T097 [US6] Implement getActiveItemsets() to check equipped items against requirements in src/data/itemsets.ts
- [x] T098 [US6] Integrate itemset detection at BATTLE_START in combat resolver in src/game/combat/resolver.ts
- [x] T099 [US6] Implement itemset bonus effects for all 12 sets in src/game/combat/resolver.ts
- [x] T100 [US6] Implement Shard Circuit special logic (shards trigger every turn) in src/game/combat/resolver.ts
- [x] T101 [US6] Implement Shrapnel Harness special logic (keep 3 shrapnel at turn end) in src/game/combat/resolver.ts

**Checkpoint**: User Story 6 complete - all 12 itemsets work correctly

---

## Phase 9: User Story 7 - Image-Based Entity Rendering (Priority: P2)

**Goal**: Enemies, bosses, POIs, player render as images without background squares

**Independent Test**: Start PvE run, visually verify all entities render as images without borders

### Tests for User Story 7

- [x] T102 [P] [US7] Add asset validation test: all enemy images exist in assets/entities/enemies/field/ in **tests**/unit/assets/images.test.ts
- [x] T103 [P] [US7] Add asset validation test: all boss images exist in assets/entities/enemies/bosses/ in **tests**/unit/assets/images.test.ts
- [x] T104 [P] [US7] Add asset validation test: all POI images exist in assets/world/pois/ in **tests**/unit/assets/images.test.ts

### Implementation for User Story 7

- [x] T105 [US7] Create enemy image mapping (archetype → asset path) in src/components/game/entityImages.ts
- [x] T106 [US7] Create boss image mapping (bossId → asset path) in src/components/game/entityImages.ts
- [x] T107 [US7] Create POI image mapping (poiId → asset path) in src/components/game/entityImages.ts
- [x] T108 [US7] Update useEntityImages hook to preload all entity images at startup in src/hooks/useEntityImages.ts
- [x] T109 [US7] Replace enemy emoji rendering with Skia Image component in src/components/game/MapRenderer.tsx
- [x] T110 [US7] Replace boss emoji rendering with Skia Image component in src/components/game/MapRenderer.tsx
- [x] T111 [US7] Replace POI emoji rendering with Skia Image component in src/components/game/MapRenderer.tsx
- [x] T112 [US7] Replace player emoji rendering with Skia Image component in src/components/game/MapRenderer.tsx
- [x] T113 [US7] Remove RoundedRect background from enemy rendering in src/components/game/MapRenderer.tsx
- [x] T114 [US7] Remove RoundedRect background from POI rendering in src/components/game/MapRenderer.tsx
- [x] T115 [US7] Remove RoundedRect background from player rendering in src/components/game/MapRenderer.tsx

**Checkpoint**: User Story 7 complete - all entities render as images without borders

---

## Phase 10: User Story 8 - Dig Mechanic (Priority: P2)

**Goal**: Dig cost formula `max(2, 6 - DIG)` works correctly with DIG stat from items

**Independent Test**: Equip DIG-boosting items, dig walls, verify move cost follows formula

### Tests for User Story 8

- [x] T116 [P] [US8] Add test: dig cost = 5 moves when DIG = 1 in **tests**/unit/map/dig.test.ts
- [x] T117 [P] [US8] Add test: dig cost = 2 moves when DIG = 4 in **tests**/unit/map/dig.test.ts
- [x] T118 [P] [US8] Add test: dig cost = 2 moves when DIG = 6 (minimum floor) in **tests**/unit/map/dig.test.ts
- [x] T119 [P] [US8] Add test: DIG stat from items contributes to dig cost calculation in **tests**/unit/entities/player.test.ts

### Implementation for User Story 8

- [x] T120 [US8] Update calculateDigCost() to use formula max(2, 6 - DIG) in src/game/map/dig.ts
- [x] T121 [US8] Ensure player DIG stat is calculated from equipped items in src/game/entities/player.ts
- [x] T122 [US8] Integrate DIG stat calculation with wall break action in src/game/engine/game-reducer.ts

**Checkpoint**: User Story 8 complete - dig mechanic works with formula

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, integration testing, performance verification

- [x] T123 [P] Add integration test: complete 3-week run with new mechanics in **tests**/integration/full-run.test.ts
- [x] T124 [P] Add determinism test: same seed produces identical combat results in **tests**/integration/determinism.test.ts
- [x] T125 Run npm run typecheck and fix any TypeScript errors
- [x] T126 Run npm run lint:fix and address any remaining issues
- [ ] T127 Verify 60 FPS performance on mobile device during exploration
- [ ] T128 Verify 60 FPS performance on mobile device during combat
- [x] T129 Run full test suite: npm test -- --coverage
- [ ] T130 Validate quickstart.md instructions work for fresh setup

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories (Bleed effect needed)
- **User Stories (Phase 3-10)**: All depend on Foundational phase completion
  - US1 (Items) and US3 (Status Effects) have no inter-dependencies
  - US2 (Enemies) depends on US3 for status effect traits
  - US4 (Bosses) can run in parallel with US1-US3
  - US5 (POIs) depends on US1 for item generation
  - US6 (Itemsets) depends on US1 for item definitions
  - US7 (Images) is fully independent
  - US8 (Dig) is fully independent
- **Polish (Phase 11)**: Depends on all user stories being complete

### User Story Dependencies

```
Setup → Foundational → US1 (Items) ─┬→ US5 (POIs)
                     │              └→ US6 (Itemsets)
                     ├→ US2 (Enemies) ← US3 (Status Effects)
                     ├→ US3 (Status Effects)
                     ├→ US4 (Bosses)
                     ├→ US7 (Images)
                     └→ US8 (Dig)
```

### Parallel Opportunities

**Setup phase**: T001-T007 all parallel (different type definitions)

**Foundational phase**: T012-T014 parallel (different test files)

**User Story 1**: T021-T028 parallel (different tag files), T015-T020 parallel (test files)

**User Story 2**: T036-T041 parallel (test files), T044-T050 parallel (different trait handlers)

**User Story 4**: T068-T071 parallel (different boss sets)

**User Story 7**: T102-T104 parallel (asset tests), T105-T107 parallel (image mappings)

---

## Parallel Example: User Story 1

```bash
# Launch all tag definition tasks together:
Task: "Define STONE tag items in src/data/gear.ts"
Task: "Define SCOUT tag items in src/data/gear.ts"
Task: "Define GREED tag items in src/data/gear.ts"
Task: "Define BLAST tag items in src/data/gear.ts"
Task: "Define FROST tag items in src/data/gear.ts"
Task: "Define RUST tag items in src/data/gear.ts"
Task: "Define BLOOD tag items in src/data/gear.ts"
Task: "Define TEMPO tag items in src/data/gear.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (type definitions)
2. Complete Phase 2: Foundational (Bleed effect)
3. Complete Phase 3: User Story 1 (80 items)
4. **STOP and VALIDATE**: Test item system independently
5. This provides a functional game with expanded items

### Incremental Delivery

1. Setup + Foundational → Core infrastructure ready
2. US1 (Items) → 80 items with combat effects
3. US3 (Status Effects) → Complete status system
4. US2 (Enemies) → 12 enemy types with traits
5. US4 (Bosses) → All bosses functional
6. US5 (POIs) → Complete POI system
7. US6 (Itemsets) → Synergy bonuses
8. US7 (Images) → Visual polish
9. US8 (Dig) → Dig mechanic complete

### P1 Stories First Strategy

Complete all P1 stories before P2:

1. US1 + US2 + US3 + US4 + US5 → Full gameplay loop
2. Then US6 + US7 + US8 → Polish and enhancement

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- All tests use fixed seeds per Constitution P11
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Reference GDD at docs/gdd.md for exact specifications
