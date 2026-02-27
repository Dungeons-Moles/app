# Dungeons & Moles — Dungeon Crawler Auto-Battler (GDD v0.5)

Status: Implementation in Progress (Core + PvP Modes Active)
Last updated: 2026-02-23

This document consolidates the current gameplay design inspired by "He Is Coming", including items, itemsets, bosses, enemies, POIs, biomes/acts, balancing knobs, and v1 mode/economy rules (PvE + PvP).

---

## 1) High Concept

Mobile-first, landscape, D-pad/controller dungeon crawler that plays like a board game: you move tile-by-tile on a seeded map, make exploration decisions, and all combat resolves automatically. Runs are structured into weeks (Day/Night cycles) ending in bosses. The campaign is a 40-stage ladder that ramps difficulty across 4 acts with biome emphasis shifts.

---

## 2) Core Loop

1. Spawn into a seeded dungeon map.
2. Explore with movement budget (Day/Night), revealing fog-of-war.
3. Fight field enemies (auto-combat) for Gold.
4. Use POIs to pick items, upgrade items, shop, travel, and shape your build.
5. End of each week triggers a boss fight (Week 1, Week 2, Week 3 final).
6. Beat Week 3 final to clear the stage; die and the run ends.

---

## 3) Session & Time Structure

- Each **week**: Day 1 (50 moves) → Night 1 (30) → Day 2 (50) → Night 2 (30) → Day 3 (50) → Night 3 (30) → **Boss**.
- Boss fight triggers automatically when the last Night ends (regardless of map position).
- Target run length: ~20–40 minutes of active play (split into 5–15 minute sessions).

---

## 4) Controls & Presentation

- Landscape-only.
- D-pad movement (PSG1/controller-first).
- Image assets for entities (prototype visuals).

---

## 5) Map, Movement, Fog-of-War, and DIG

### Tiles

- Two tile types (v0): **Floor** (walkable) and **Wall** (not walkable until dug).
- Fog-of-war:
  - **Current Implementation:** Client-side tracking. Tiles are returned by the map generator but masked by the client until visited.
  - **Future:** On-chain privacy via ephemeral rollups (tiles remain encrypted/hidden until interacting).

### Movement

- Moving to an adjacent **Floor** costs **1 move**.
- Pressing toward an adjacent **Wall** performs a **dig attempt**:
  - Dig converts the Wall tile into Floor.
  - Dig costs:
    - `digMoves = max(2, 6 - DIG)`
    - DIG 1 → 5 moves, DIG 2 → 4, DIG 3 → 3, DIG 4+ → 2

### Map Generation Rules

Enemy placement rules ensure a fair difficulty curve:

**Safe Start Zone:** The first 3 enemies the player can encounter (by tile distance from spawn) must be from the Easy Pool: Tunnel Rat, Cave Bat, Frost Wisp, Coin Slug, Blood Mosquito.

**Difficulty Pools:**

- Easy Pool: Tunnel Rat, Cave Bat, Frost Wisp, Coin Slug, Blood Mosquito (5 enemies)
- Medium Pool: Spore Slime, Rust Mite Swarm, Powder Tick, Shard Beetle (4 enemies)
- Hard Pool: Collapsed Miner, Tunnel Warden, Burrow Ambusher (3 enemies)

**Pool Distribution by Distance from Spawn:**

- Near spawn (0-33% map distance): 60% Easy / 30% Medium / 10% Hard
- Mid map (34-66% distance): 40% Easy / 40% Medium / 20% Hard
- Far map (67-100% distance): 30% Easy / 40% Medium / 30% Hard

**Tier Distribution by Distance:**

- Near spawn (0-33% map distance): 80% T1 / 15% T2 / 5% T3
- Mid map (34-66% distance): Use act tier defaults from section 11
- Far map (67-100% distance): 50% T1 / 35% T2 / 15% T3

**Counter Cache Guarantee:** At least 2 Counter Cache (L13) POIs must be reachable per run — 1 within the first 30 moves of Day 1, and 1 additional guaranteed on the map.

Design intent:

- DIG meaningfully impacts routing, but never makes digging "free".
- DIG's late-game value comes more from combat comparators than further dig cost reduction.

---

## 6) Player Stats

Player has:

- **HP**: hit points (Persistent state, capped by Max HP).
- **ATK**: weapon damage baseline (Derived from Items).
- **ARM**: armor is "HP before HP" - damage depletes ARM first, excess carries to HP (Derived from Items, resets after combat).
- **SPD**: determines who acts first each turn + offensive scaling via SPD Advantage (Derived from Items).
- **DIG**: affects dig cost + some combat comparators (Derived from Items).
- **GOLD**: earned from field enemies; spent at shops/POIs (Persistent state).

**Implementation Note:**
Stats (ATK/ARM/SPD/DIG) are no longer stored in the game state. They are derived dynamically from the player's inventory (Tool + Gear) at runtime during combat or movement checks. `PlayerInventory` is the single source of truth.

Start (prototype baseline):

- **Starting HP by campaign level:** Levels 1–9: 25 HP, Levels 10–19: 20 HP, Levels 20+: 15 HP. PvP modes (Duels, Pit Draft, Gauntlet): always 20 HP.
- ATK 1 (from Basic Pickaxe), ARM 0, SPD 0, DIG 1 (Base).
- **Starting Gold by campaign level:** Levels 1–9: 10 Gold, Levels 10–19: 5 Gold, Levels 20+: 0 Gold.

Inventory:

- Starts with **4 Gear slots** + 1 Tool slot.
- After defeating **Week 1 boss**: +2 slots (Automatic sync via CPI).
- After defeating **Week 2 boss**: +2 slots (Automatic sync via CPI).
- Gauntlet extension (5-week modes): Week 3 -> 10 total slots, Week 4 -> 12 total slots.
- Tool slot is separate (exactly 1 equipped Tool).

---

## 7) Combat System (Auto-battle)

### Turn order

- Each turn, higher **SPD** acts first.
- If SPD tie: enemy acts first (deterministic rule).

### SPD Advantage Rule

- For every **2 points of SPD advantage** over the opponent, the faster combatant deals **+1 bonus damage on their first strike each turn**.
- Example: Player with 5 SPD vs enemy with 1 SPD → SPD advantage of 4 → +2 bonus damage on first strike per turn.
- This bonus is recalculated each turn (accounts for temporary SPD changes from items/effects).

### Damage

- Weapon damage: ATK damage is applied to ARM first; any excess damage carries over to HP.
  - Example: 5 ATK vs 3 ARM, 10 HP → ARM depleted (3→0), HP reduced by excess (10→8).
- ARM resets after combat ends (not persistent between fights).
- Non-weapon damage ignores Armor and hits HP directly unless specified otherwise.

### Strike cap

- **Maximum strikes per turn: 5** (regardless of item/set combinations).

### On-Hit trigger rule

- All "once per turn" on-hit effects trigger simultaneously on the first eligible hit, not sequentially across multiple hits.
- Example: If player has Bleed on-hit and Rust on-hit, both trigger on the first strike (not Bleed on strike 1, Rust on strike 2).

### Visualization (Combat Log)

- The on-chain combat engine returns a detailed **Combat Log** containing every action (Attack, Heal, Status Application) for the frontend to visualize/replay the battle turn-by-turn.
- When damage is amplified by Chill, display as "X damage (+Y from Chill)".
- When damage includes SPD Advantage bonus, display as "X damage (+Y from SPD)".

### Stalemate prevention

- **Sudden death starts at Turn 20**:
  - For each turn after 20, both combatants gain **+1 ATK** (stacking).
- **Accelerated sudden death at Turn 30**:
  - For each turn after 30, both combatants gain **+2 ATK** per turn instead (stacking).
- **Failsafe at Turn 50**:
  - Winner is the combatant with higher **remaining HP%** (tie: enemy wins).

---

## 8) Triggers & Status Effects

### Trigger keywords (used in items/enemies/bosses)

- **Battle Start**: before Turn 1 begins.
- **First Turn**: only during Turn 1.
- **Turn Start**: start of each combat turn.
- **Every Other Turn**: alternating turns (2,4,6…).
- **Exposed**: condition when a combatant has **0 Armor**.
- **Wounded**: condition when current HP is **below 50% max HP**.

### Status effects

- **Chill**: slow/tempo debuff + damage amplification.
  - At Turn Start: reduce the holder's strikes this turn by **1** (min 1 strike).
  - Chilled combatants take **+1 damage from all sources** per Chill stack (max +3 bonus damage).
  - At end of turn: remove **1 Chill** stack.
- **Shrapnel**: retaliatory resource.
  - When struck: deal damage equal to Shrapnel stacks to the attacker.
  - Clears at end of turn (unless an itemset says otherwise).
- **Rust**: persistent armor destruction.
  - At end of turn: lose Armor equal to Rust stacks (min 0).
  - Rust stacks persist.
- **Bleed**: persistent damage over time.
  - At end of turn: take damage equal to Bleed stacks.
  - Remove **1 Bleed** stack at end of turn.

---

## 9) Item System

### Rules

- Exactly **1 Tool** equipped.
- Multiple **Gear** equipped in inventory slots.
- **All items are upgradable** via fusing duplicates to Tier II / Tier III.
  - Effects remain the same; tier scales the numeric values written as `I/II/III`.
- DIG is never "spent" as a resource; it is used for routing and combat comparisons/scaling.

### Tags (8)

- `STONE` (Armor, Shrapnel, durability payoffs)
- `SCOUT` (DIG comparisons, multi-strike, mobility/initiative)
- `GREED` (Gold generation + gold-to-power sinks; shard engines)
- `BLAST` (Countdown bombs, non-weapon engines)
- `FROST` (Chill + SPD manipulation)
- `RUST` (Armor destruction, anti-tank)
- `BLOOD` (Bleed + sustain/execute)
- `TEMPO` (SPD, Turn 1 effects, initiative payoffs)

### Rarity tiers (v1)

Common, Rare, Heroic, Mythic.

Rarity distribution (80 items):

- 8 Mythics (1 per tag): G-ST-07, G-SC-08, G-GR-04, G-BL-08, G-FR-06, G-RU-07, G-BO-08, T-TE-02

### Full item list (80)

Format: `ID — Name (Type) [Tag] {Rarity} — Image: <path> — Effect`

#### STONE (10)

- `T-ST-01` — Bulwark Shovel (Tool) [STONE] {Common} — Image: assets/icons/items/stone/bulwark_shovel.png — `+1/2/3 ATK, +4/6/8 ARM`
- `T-ST-02` — Cragbreaker Hammer (Tool) [STONE] {Rare} — Image: assets/icons/items/stone/cragbreaker_hammer.png — `+2/3/4 ATK, +3/5/7 ARM`; first strike each turn removes `1/2/3` enemy Armor before damage
- `G-ST-01` — Miner Helmet (Gear) [STONE] {Common} — Image: assets/icons/items/stone/miner_helmet.png — `+3/6/12 ARM`
- `G-ST-02` — Work Vest (Gear) [STONE] {Common} — Image: assets/icons/items/stone/work_vest.png — `+4/8/16 HP, +1 ARM`
- `G-ST-03` — Spiked Bracers (Gear) [STONE] {Common} — Image: assets/icons/items/stone/spiked_bracers.png — `+3/6/12` Shrapnel; `+1/2/4 ARM`
- `G-ST-04` — Reinforcement Plate (Gear) [STONE] {Rare} — Image: assets/icons/items/stone/reinforcement_plate.png — `+2/4/8 ARM`; every other turn: gain `2/4/8` Armor
- `G-ST-05` — Rebar Carapace (Gear) [STONE] {Rare} — Image: assets/icons/items/stone/rebar_carapace.png — `+3/6/12 ARM`; Exposed (once per battle): gain `4/8/16` Armor
- `G-ST-06` — Shrapnel Talisman (Gear) [STONE] {Rare} — Image: assets/icons/items/stone/shrapnel_talisman.png — `+3/6/12 ARM`; whenever you gain Shrapnel (once per battle): gain `2/4/8` Armor
- `G-ST-07` — Crystal Crown (Gear) [STONE] {Mythic} — Image: assets/icons/items/stone/crystal_crown.png — Battle Start: gain Max HP equal to your starting Armor (cap `10/20/40`); your Armor cannot be reduced below 1 by any single source
- `G-ST-08` — Stone Sigil (Gear) [STONE] {Heroic} — Image: assets/icons/items/stone/stone_sigil.png — `+3/6/12 ARM`; end of turn: if you have ≥2 Armor, gain `2/4/8` Armor

#### SCOUT (10)

- `T-SC-01` — Twin Picks (Tool) [SCOUT] {Common} — Image: assets/icons/items/scout/twin_picks.png — `+1/2/3 ATK`; strike 2 times per turn
- `T-SC-02` — Pneumatic Drill (Tool) [SCOUT] {Rare} — Image: assets/icons/items/scout/pneumatic_drill.png — `+1/2/3 ATK`; strike 3 times per turn; bonus ATK from Gear applies at 50% effectiveness (round down) to strikes beyond the 2nd
- `G-SC-01` — Miner Boots (Gear) [SCOUT] {Common} — Image: assets/icons/items/scout/miner_boots.png — `+2/4/8 DIG, +1/2/4 SPD`
- `G-SC-02` — Leather Gloves (Gear) [SCOUT] {Common} — Image: assets/icons/items/scout/leather_gloves.png — `+1/2/4 ATK, +1/2/4 DIG`
- `G-SC-03` — Tunnel Instinct (Gear) [SCOUT] {Rare} — Image: assets/icons/items/scout/tunnel_instinct.png — `+1/2/4 DIG`; Battle Start: if DIG > enemy DIG, gain `+1/2/4 SPD` and `+1/2/4 ATK` (this battle)
- `G-SC-04` — Tunneler Spurs (Gear) [SCOUT] {Rare} — Image: assets/icons/items/scout/tunneler_spurs.png — `+2/4/8 SPD`; if you act first on Turn 1, gain `+1/2/4 DIG` and `+2/4/8 ARM` (this battle)
- `G-SC-05` — Wall-Sense Visor (Gear) [SCOUT] {Rare} — Image: assets/icons/items/scout/wall-sense_visor.png — `+1/2/4 DIG, +1/2/4 SPD`; Battle Start: if DIG > enemy DIG, gain `+3/6/12` Armor
- `G-SC-06` — Drill Servo (Gear) [SCOUT] {Heroic} — Image: assets/icons/items/scout/drill_servo.png — Wounded: gain `+1/2/4` additional strikes and `+2/4/8 ATK` (this battle)
- `G-SC-07` — Weak-Point Manual (Gear) [SCOUT] {Heroic} — Image: assets/icons/items/scout/weak-point_manual.png — `+1/2/4 ATK, +1/2/4 DIG`; if DIG > enemy Armor: your strikes ignore `2/4/8` Armor (this battle)
- `G-SC-08` — Gear-Link Medallion (Gear) [SCOUT] {Mythic} — Image: assets/icons/items/scout/gear-link_medallion.png — Your On Hit effects trigger twice (once/turn); this only applies to effects from SCOUT-tagged items or your equipped Tool; `+1/2/4 SPD`

#### GREED (10)

- `T-GR-01` — Glittering Pick (Tool) [GREED] {Common} — Image: assets/icons/items/greed/glittering_pick.png — `+1/2/3 ATK`; On Hit (once/turn): gain 1 Gold; Victory: gain +2 Gold
- `T-GR-02` — Gemfinder Staff (Tool) [GREED] {Heroic} — Image: assets/icons/items/greed/gemfinder_staff.png — `+2/2/3 ATK, +2/3/3 ARM, +1/2/2 DIG`; first hit each turn triggers all your Shard effects; Shard effects deal/heal/generate `+1` more
- `G-GR-01` — Loose Nuggets (Gear) [GREED] {Common} — Image: assets/icons/items/greed/loose_nuggets.png — Start of each Day: gain `5/10/20` Gold; `+1/2/4 ARM`
- `G-GR-02` — Lucky Coin (Gear) [GREED] {Common} — Image: assets/icons/items/greed/lucky_coin.png — Victory: gain `3/6/12` Gold and heal `3/6/12` HP
- `G-GR-03` — Gilded Band (Gear) [GREED] {Heroic} — Image: assets/icons/items/greed/gilded_band.png — `+2/4/8 ARM`; Battle Start: gain Armor equal to `floor(Gold/6)` (cap `6/12/24`); if Gold ≥ 20, also gain `+1/2/4` SPD this battle
- `G-GR-04` — Royal Bracer (Gear) [GREED] {Mythic} — Image: assets/icons/items/greed/royal_bracer.png — `+1/2/4 ATK`; Turn Start: convert 1 Gold → `4/8/16` Armor; your Gold gains from all sources are increased by `50/100/200`% (round down)
- `G-GR-05` — Emerald Shard (Gear) [GREED] {Common} — Image: assets/icons/items/greed/emerald_shard.png — Every other turn (on first hit): heal `2/4/8` HP
- `G-GR-06` — Ruby Shard (Gear) [GREED] {Common} — Image: assets/icons/items/greed/ruby_shard.png — Every other turn (on first hit): deal `1/2/4` non-weapon damage
- `G-GR-07` — Sapphire Shard (Gear) [GREED] {Common} — Image: assets/icons/items/greed/sapphire_shard.png — Every other turn (on first hit): gain `2/4/8` Armor
- `G-GR-08` — Citrine Shard (Gear) [GREED] {Common} — Image: assets/icons/items/greed/citrine_shard.png — Every other turn (on first hit): gain `2/4/8` Gold; `+1/2/4 ARM`

#### BLAST (10)

- `T-BL-01` — Fuse Pick (Tool) [BLAST] {Common} — Image: assets/icons/items/blast/fuse_pick.png — `+1/2/3 ATK`; first hit each turn: deal `1/2/2` non-weapon damage
- `T-BL-02` — Spark Pick (Tool) [BLAST] {Rare} — Image: assets/icons/items/blast/spark_pick.png — `+1/2/3 ATK`; On Hit (once/turn): reduce your highest Countdown by 1
- `G-BL-01` — Small Charge (Gear) [BLAST] {Common} — Image: assets/icons/items/blast/small_charge.png — Countdown(2): deal `10/20/40` damage to enemy and `4/8/16` damage to you (non-weapon)
- `G-BL-02` — Blast Suit (Gear) [BLAST] {Rare} — Image: assets/icons/items/blast/blast_suit.png — You ignore damage from your own BLAST items; `+4/8/16 ARM`; when you deal non-weapon damage: gain `+1/2/4` Armor (once/turn)
- `G-BL-03` — Explosive Powder (Gear) [BLAST] {Rare} — Image: assets/icons/items/blast/explosive_powder.png — Your non-weapon damage deals `+2/4/8`; `+2/4/8 ARM`
- `G-BL-04` — Double Detonation (Gear) [BLAST] {Rare} — Image: assets/icons/items/blast/double_detonation.png — First non-weapon damage each turn: deal `+1/2/4` more; second non-weapon damage each turn: deal `+3/6/12` more
- `G-BL-05` — Bomb Satchel (Gear) [BLAST] {Heroic} — Image: assets/icons/items/blast/bomb_satchel.png — Reduce Countdown of all your bomb items by 1 (min 0); `+4/8/16 ARM, +1/2/4 ATK`
- `G-BL-06` — Kindling Charge (Gear) [BLAST] {Rare} — Image: assets/icons/items/blast/kindling_charge.png — Battle Start: deal `2/4/8` damage to enemy; your next bomb this battle deals `+3/6/12` and its self-damage is reduced by `2/4/8`
- `G-BL-07` — Time Charge (Gear) [BLAST] {Heroic} — Image: assets/icons/items/blast/time_charge.png — `+2/4/8 ARM`; Turn Start: gain `+2/4/8` stored damage (this battle); when Exposed OR Turn 5+: deal stored damage to enemy
- `G-BL-08` — Twin-Fuse Knot (Gear) [BLAST] {Mythic} — Image: assets/icons/items/blast/twin-fuse_knot.png — Your bomb triggers happen twice; next bomb self-damage reduced by `1/2/4`

#### FROST (10)

- `T-FR-01` — Rime Pike (Tool) [FROST] {Common} — Image: assets/icons/items/frost/rime_pike.png — `+1/2/3 ATK`; On Hit (once/turn): apply 1 Chill; if enemy has Chill, deal +1 bonus damage
- `T-FR-02` — Glacier Fang (Tool) [FROST] {Rare} — Image: assets/icons/items/frost/glacier_fang.png — `+2/3/4 ATK`; On Hit (once/turn): apply 1 Chill; if enemy has Chill, gain +1 SPD this turn and deal +1 bonus damage
- `G-FR-01` — Frost Lantern (Gear) [FROST] {Common} — Image: assets/icons/items/frost/frost_lantern.png — `+1/2/4 ARM`; Battle Start: give enemy `1/2/4` Chill
- `G-FR-02` — Frostguard Buckler (Gear) [FROST] {Heroic} — Image: assets/icons/items/frost/frostguard_buckler.png — `+8/16/32 ARM`; Battle Start: if enemy has Chill, gain `+3/6/12` Armor and apply `1/2/4` Chill
- `G-FR-03` — Cold Snap Charm (Gear) [FROST] {Rare} — Image: assets/icons/items/frost/cold_snap_charm.png — `+1/2/4 SPD`; if you act first on Turn 1: apply `2/4/8` Chill and gain `+2/4/8 ARM`
- `G-FR-04` — Ice Skates (Gear) [FROST] {Rare} — Image: assets/icons/items/frost/ice_skates.png — `+2/4/8 SPD, +1/2/4 DIG, +2/4/8 ARM`
- `G-FR-05` — Rime Cloak (Gear) [FROST] {Rare} — Image: assets/icons/items/frost/rime_cloak.png — `+3/6/12 ARM`; when struck (once/turn): apply `1/2/4` Chill to attacker
- `G-FR-06` — Permafrost Core (Gear) [FROST] {Mythic} — Image: assets/icons/items/frost/permafrost_core.png — Turn Start: if enemy has Chill, gain `2/4/8` Armor and deal `2/4/8` non-weapon damage; Chill on enemies decays 1 stack slower (minimum decay: 0)
- `G-FR-07` — Cold Front Idol (Gear) [FROST] {Heroic} — Image: assets/icons/items/frost/cold_front_idol.png — Every other turn: apply `1/2/4` Chill, deal `2/4/8` non-weapon damage, and gain `1/2/4 ARM`; if enemy already has Chill, gain `+2/4/8` SPD this turn
- `G-FR-08` — Deep Freeze Charm (Gear) [FROST] {Heroic} — Image: assets/icons/items/frost/deep_freeze_charm.png — `+3/6/12 ARM`; Wounded: apply `3/6/12` Chill, reduce enemy SPD by `1/2/4` (this battle), and enemy takes +`1/2/4` damage from all sources while Chilled (this battle)

#### RUST (10)

- `T-RU-01` — Corrosive Pick (Tool) [RUST] {Common} — Image: assets/icons/items/rust/corrosive_pick.png — `+1/2/3 ATK`; On Hit (once/turn): apply 1 Rust
- `T-RU-02` — Etched Burrowblade (Tool) [RUST] {Heroic} — Image: assets/icons/items/rust/etched_burrowblade.png — `+2/3/4 ATK, +2/3/4 SPD`; if enemy has Rust, your strikes ignore `2/3/4` Armor; if enemy has ≥ 4 Rust, ignore ALL Armor
- `G-RU-01` — Oxidizer Vial (Gear) [RUST] {Common} — Image: assets/icons/items/rust/oxidizer_vial.png — `+1/2/4 ARM`; Battle Start: apply `1/2/4` Rust (if enemy has Armor, apply +`1/2/4` more)
- `G-RU-02` — Rust Spike (Gear) [RUST] {Rare} — Image: assets/icons/items/rust/rust_spike.png — `+1/2/4 ATK`; On Hit (once/turn): apply `1/2/4` Rust; if enemy has Rust ≥ 2, deal `2/4/8` non-weapon damage
- `G-RU-03` — Corroded Greaves (Gear) [RUST] {Rare} — Image: assets/icons/items/rust/corroded_greaves.png — `+1/2/4 SPD`; Wounded: apply `2/4/8` Rust
- `G-RU-04` — Acid Phial (Gear) [RUST] {Rare} — Image: assets/icons/items/rust/acid_phial.png — Battle Start: reduce enemy Armor by `3/6/12` and apply `1/2/4` Rust
- `G-RU-05` — Flaking Plating (Gear) [RUST] {Rare} — Image: assets/icons/items/rust/flaking_plating.png — `+6/12/24 ARM`; Exposed: apply `2/4/8` Rust to enemy
- `G-RU-06` — Rust Engine (Gear) [RUST] {Heroic} — Image: assets/icons/items/rust/rust_engine.png — `+1/2/4 ATK, +3/6/12 ARM`; Turn Start: if enemy has Rust OR 0 Armor, deal `2/4/8` non-weapon damage
- `G-RU-07` — Corrosion Loop (Gear) [RUST] {Mythic} — Image: assets/icons/items/rust/corrosion_loop.png — On Hit (once/turn): apply `+2/4/8` additional Rust; Rust stacks on enemies also reduce their ATK by 1 per 3 stacks (max -2 ATK); if enemy has 0 Armor, deal `2/4/8` non-weapon damage instead
- `G-RU-08` — Salvage Clamp (Gear) [RUST] {Common} — Image: assets/icons/items/rust/salvage_clamp.png — Whenever you apply Rust (once/turn): gain `2/4/8` Gold; Battle Start: apply `1/2/4` Rust

#### BLOOD (10)

- `T-BO-01` — Serrated Drill (Tool) [BLOOD] {Common} — Image: assets/icons/items/blood/serrated_drill.png — `+1/2/3 ATK`; On Hit (once/turn): apply 1 Bleed
- `T-BO-02` — Reaper Pick (Tool) [BLOOD] {Rare} — Image: assets/icons/items/blood/reaper_pick.png — `+2/3/4 ATK`; On Hit (once/turn): apply 1 Bleed (if enemy is Wounded, apply +1 Bleed)
- `G-BO-01` — Last Breath Sigil (Gear) [BLOOD] {Common} — Image: assets/icons/items/blood/last_breath_sigil.png — One use: first time you would die in battle, prevent it and heal `2/4/8` HP
- `G-BO-02` — Bloodletting Fang (Gear) [BLOOD] {Rare} — Image: assets/icons/items/blood/bloodletting_fang.png — `+1/2/4 ATK`; your attacks deal `+1/2/4` damage to Bleeding enemies
- `G-BO-03` — Leech Wraps (Gear) [BLOOD] {Rare} — Image: assets/icons/items/blood/leech_wraps.png — `+2/4/8 ARM`; when enemy takes Bleed damage: heal `2/4/8` HP (once/turn)
- `G-BO-04` — Blood Chalice (Gear) [BLOOD] {Rare} — Image: assets/icons/items/blood/blood_chalice.png — `+2/4/8 ARM`; Victory: heal `5/10/20` HP
- `G-BO-05` — Hemorrhage Hook (Gear) [BLOOD] {Heroic} — Image: assets/icons/items/blood/hemorrhage_hook.png — `+1/2/4 ATK, +3/6/12 ARM`; Wounded: apply `3/6/12` Bleed
- `G-BO-06` — Execution Emblem (Gear) [BLOOD] {Heroic} — Image: assets/icons/items/blood/execution_emblem.png — `+1/2/4 ATK, +2/4/8 ARM`; if enemy is Wounded, your first strike each turn deals `+3/6/12` damage
- `G-BO-07` — Gore Mantle (Gear) [BLOOD] {Rare} — Image: assets/icons/items/blood/gore_mantle.png — First time you become Wounded in battle: gain `4/8/16` Armor
- `G-BO-08` — Vampiric Tooth (Gear) [BLOOD] {Mythic} — Image: assets/icons/items/blood/vampiric_tooth.png — Your first hit each turn applies `1/2/4` Bleed; if enemy is already Bleeding, heal HP equal to their Bleed stacks instead (max `5/10/20` HP)

#### TEMPO (10)

- `T-TE-01` — Quickpick (Tool) [TEMPO] {Common} — Image: assets/icons/items/tempo/quickpick.png — `+1/2/3 ATK, +2/3/4 SPD`
- `T-TE-02` — Chrono Rapier (Tool) [TEMPO] {Mythic} — Image: assets/icons/items/tempo/chrono_rapier.png — `+2/3/4 ATK, +3/4/5 SPD`; you always act first on Turn 1 regardless of enemy SPD; if you act first, gain `+3/4/5` ATK (this battle)
- `G-TE-01` — Wind-Up Spring (Gear) [TEMPO] {Common} — Image: assets/icons/items/tempo/wind-up_spring.png — Turn 1: gain `+1/2/4 SPD` and `+2/4/8` ATK (this battle)
- `G-TE-02` — Ambush Charm (Gear) [TEMPO] {Rare} — Image: assets/icons/items/tempo/ambush_charm.png — `+1/2/4 SPD`; if you act first on Turn 1, your first strike deals `+3/6/12` damage
- `G-TE-03` — Counterweight Buckle (Gear) [TEMPO] {Rare} — Image: assets/icons/items/tempo/counterweight_buckle.png — `+1/2/4 SPD`; if enemy acts first on Turn 1, gain `7/14/28` Armor before damage
- `G-TE-04` — Hourglass Charge (Gear) [TEMPO] {Rare} — Image: assets/icons/items/tempo/hourglass_charge.png — `+2/4/8 ARM`; Turn 5: gain `+3/6/12` ATK and `+2/4/8` SPD (this battle)
- `G-TE-05` — Initiative Lens (Gear) [TEMPO] {Rare} — Image: assets/icons/items/tempo/initiative_lens.png — `+1/2/4 SPD`; Battle Start: if your SPD > enemy SPD, gain `3/6/12` Armor
- `G-TE-06` — Backstep Buckle (Gear) [TEMPO] {Rare} — Image: assets/icons/items/tempo/backstep_buckle.png — If enemy acts first on Turn 1, gain `4/8/16` Armor AND your first strike deals `+3/6/12` damage
- `G-TE-07` — Tempo Battery (Gear) [TEMPO] {Heroic} — Image: assets/icons/items/tempo/tempo_battery.png — `+1/2/4 ATK, +3/6/12 ARM`; every other turn: gain `+2/4/8 SPD` (this battle)
- `G-TE-08` — Second Wind Clock (Gear) [TEMPO] {Heroic} — Image: assets/icons/items/tempo/second_wind_clock.png — `+3/6/12 ARM`; Turn 5: heal `6/12/24` HP and gain `+2/4/8` SPD (this battle)

### On-Chain Item Bitmask

Player unlocked items are stored on-chain as an 80-bit bitmask (10 bytes) in the `PlayerProfile` account.

#### Bitmask Layout

```
Bytes 0-7: Gear items (64 items, 8 per tag)
  - Byte 0 (bits 0-7):   STONE gear G-ST-01 to G-ST-08
  - Byte 1 (bits 8-15):  SCOUT gear G-SC-01 to G-SC-08
  - Byte 2 (bits 16-23): GREED gear G-GR-01 to G-GR-08
  - Byte 3 (bits 24-31): BLAST gear G-BL-01 to G-BL-08
  - Byte 4 (bits 32-39): FROST gear G-FR-01 to G-FR-08
  - Byte 5 (bits 40-47): RUST gear G-RU-01 to G-RU-08
  - Byte 6 (bits 48-55): BLOOD gear G-BO-01 to G-BO-08
  - Byte 7 (bits 56-63): TEMPO gear G-TE-01 to G-TE-08

Bytes 8-9: Tool items (16 items, 2 per tag)
  - Byte 8 (bits 64-71): Tools T-ST-01, T-ST-02, T-SC-01, T-SC-02, T-GR-01, T-GR-02, T-BL-01, T-BL-02
  - Byte 9 (bits 72-79): Tools T-FR-01, T-FR-02, T-RU-01, T-RU-02, T-BO-01, T-BO-02, T-TE-01, T-TE-02
```

#### Index Formulas

- **Gear (I1-I64):** `index = tag_code * 8 + (item_num_in_tag - 1)` (indices 0-63)
- **Tools (T1-T16):** `index = 64 + tag_code * 2 + (item_num_in_tag - 1)` (indices 64-79)

Tag codes: STONE=0, SCOUT=1, GREED=2, BLAST=3, FROST=4, RUST=5, BLOOD=6, TEMPO=7

#### Starter Items (40 total)

New accounts start with 40 items unlocked (5 per tag = 1 tool + 4 gear):

| Tag   | Tool    | Gear (4 items)                     | Bit Indices        |
| ----- | ------- | ---------------------------------- | ------------------ |
| STONE | T-ST-01 | G-ST-01, G-ST-02, G-ST-03, G-ST-04 | 64, 0, 1, 2, 3     |
| SCOUT | T-SC-01 | G-SC-01, G-SC-02, G-SC-03, G-SC-04 | 66, 8, 9, 10, 11   |
| GREED | T-GR-01 | G-GR-01, G-GR-02, G-GR-03, G-GR-05 | 68, 16, 17, 18, 20 |
| BLAST | T-BL-01 | G-BL-01, G-BL-02, G-BL-03, G-BL-04 | 70, 24, 25, 26, 27 |
| FROST | T-FR-01 | G-FR-01, G-FR-02, G-FR-03, G-FR-04 | 72, 32, 33, 34, 35 |
| RUST  | T-RU-01 | G-RU-01, G-RU-02, G-RU-03, G-RU-04 | 74, 40, 41, 42, 43 |
| BLOOD | T-BO-01 | G-BO-01, G-BO-02, G-BO-03, G-BO-04 | 76, 48, 49, 50, 51 |
| TEMPO | T-TE-01 | G-TE-01, G-TE-02, G-TE-03, G-TE-04 | 78, 56, 57, 58, 59 |

**Note:** GREED starter gear skips G-GR-04 (Royal Bracer, Mythic) in favor of G-GR-05 (Emerald Shard, Common).

#### Starter Bitmask

```
[0x0F, 0x0F, 0x17, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x55, 0x55]
```

#### Item Unlocking

- Players unlock new items by completing campaign levels for the first time with victory.
- Each first-time victory unlocks one random item from the remaining locked items.
- The `record_run_result` instruction handles unlocking via deterministic PRNG.

---

## 10) Itemsets (12)

Itemsets activate when all required items are equipped.

| Set                      | Image                                              | Required                                | Bonus                                                                                                          |
| ------------------------ | -------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Union Standard           | assets/icons/itemsets/union_standard.png           | `G-ST-01 + G-ST-02 + G-SC-01`           | `+4 ARM, +1 DIG`                                                                               |
| Shard Circuit            | assets/icons/itemsets/shard_circuit.png            | `G-GR-05 + G-GR-06 + G-GR-07 + G-GR-08` | Shards trigger every turn                                                                                      |
| Demolition Permit        | assets/icons/itemsets/demolition_permit.png        | `G-BL-01 + G-BL-02 + G-BL-03`           | Countdown bombs tick 1 turn faster; your bomb self-damage is reduced by 2                                      |
| Fuse Network             | assets/icons/itemsets/fuse_network.png             | `T-BL-02 + G-BL-05 + G-BL-04`           | First non-weapon damage each turn deals +2                                                                     |
| Shrapnel Harness         | assets/icons/itemsets/shrapnel_harness.png         | `G-ST-03 + G-ST-06 + T-ST-01`           | Keep up to 2 Shrapnel at end of turn; when struck while you have Shrapnel, gain +1 Armor                       |
| Rust Ritual              | assets/icons/itemsets/rust_ritual.png              | `T-RU-01 + G-RU-02 + G-RU-03`           | On Hit (once/turn): apply +1 extra Rust; if enemy has 0 Armor, deal 1 non-weapon damage per Rust stack (max 3) |
| Swift Digger Kit         | assets/icons/itemsets/swift_digger_kit.png         | `T-SC-01 + G-SC-01 + G-SC-06`           | Battle Start: if DIG > enemy DIG, gain +1 strike (this battle) and +3 ATK (this battle)                        |
| Royal Extraction         | assets/icons/itemsets/royal_extraction.png         | `G-GR-01 + G-GR-04 + T-GR-02`           | Gold→Armor becomes 1→4; gain +1 Gold at the start of each battle                                               |
| Whiteout Initiative      | assets/icons/itemsets/whiteout_initiative.png      | `G-FR-04 + G-FR-03 + G-TE-05`           | +1 SPD; if you act first Turn 1, apply +2 Chill and your first strike deals +3 damage            |
| Bloodrush Protocol       | assets/icons/itemsets/bloodrush_protocol.png       | `T-BO-01 + G-BO-05 + G-TE-01`           | Turn 1: apply 3 Bleed; when enemy takes Bleed dmg, gain +1 SPD this turn (once/turn)                           |
| Corrosion Payload        | assets/icons/itemsets/corrosion_payload.png        | `G-RU-02 + G-BL-03 + G-BL-05`           | First time your bomb deals damage each turn: apply 1 Rust                                                      |
| Golden Shrapnel Exchange | assets/icons/itemsets/golden_shrapnel_exchange.png | `G-GR-04 + G-ST-06 + G-GR-03`           | When you convert Gold→Armor: gain +3 Shrapnel (once/turn)                                                      |

---

## 11) Field Enemies (12 archetypes, 3 tiers)

Rewards:

- Field enemies reward **Gold only** (no item drops).
- Gold reward per tier: T1=2, T2=4, T3=6.

Tier distribution by act:

- Act 1: T1 70% / T2 25% / T3 5%
- Act 2: T1 55% / T2 35% / T3 10%
- Act 3: T1 45% / T2 40% / T3 15%
- Act 4: T1 35% / T2 45% / T3 20%

Biome weighting:

- Biome A emphasizes: Tunnel Rat, Collapsed Miner, Shard Beetle, Coin Slug.
- Biome B emphasizes: Rust Mites, Frost Wisp, Blood Mosquito, Burrow Ambusher, Powder Tick.

Stat format per tier: `HP/ATK/ARM/SPD/DIG`

| Enemy           | Image                                             |        T1 |         T2 |         T3 | Trait                                                         |
| --------------- | ------------------------------------------------- | --------: | ---------: | ---------: | ------------------------------------------------------------- |
| Tunnel Rat      | assets/entities/enemies/field/tunnel-rat.png      | 5/1/0/3/1 |  7/2/0/4/1 |  9/3/1/5/2 | On Hit (once/turn): steal 1 Gold                              |
| Cave Bat        | assets/entities/enemies/field/cave-bat.png        | 6/1/0/3/1 |  8/2/0/4/1 | 10/3/0/5/2 | Every other turn: restore 1 HP                                |
| Spore Slime     | assets/entities/enemies/field/spore-slime.png     | 7/1/2/0/1 | 10/2/3/0/1 | 13/3/4/0/2 | Battle Start: apply 1 Chill to you                            |
| Rust Mite Swarm | assets/entities/enemies/field/rust-mite-swarm.png | 6/1/0/3/2 |  9/2/0/4/2 | 12/3/0/5/3 | On Hit (once/turn): apply 1 Rust                              |
| Collapsed Miner | assets/entities/enemies/field/collapsed-miner.png | 7/1/0/1/3 | 11/2/0/2/3 | 15/3/1/3/4 | Wounded: gain +2 ATK (this battle)                            |
| Shard Beetle    | assets/entities/enemies/field/shard-beetle.png    | 8/1/2/1/2 | 11/2/3/1/2 | 14/3/4/2/3 | Battle Start: gain 1 Shrapnel                                 |
| Tunnel Warden   | assets/entities/enemies/field/tunnel-warden.png   | 8/2/2/2/2 | 11/3/4/3/2 | 14/4/6/4/3 | First strike each turn: remove 1 Armor from you before damage |
| Burrow Ambusher | assets/entities/enemies/field/burrow-ambusher.png | 6/2/0/4/2 |  9/3/0/5/2 | 12/4/0/6/3 | Battle Start: deal 1 damage ignoring Armor                    |
| Frost Wisp      | assets/entities/enemies/field/frost-wisp.png      | 7/1/0/4/1 | 10/2/0/5/1 | 13/3/0/6/2 | If it acts first on Turn 1: apply 1 Chill                     |
| Powder Tick     | assets/entities/enemies/field/powder-tick.png     | 6/1/0/2/1 |  9/2/0/3/1 | 12/3/0/4/2 | Countdown(3): deal 3 damage to you (non-weapon)               |
| Coin Slug       | assets/entities/enemies/field/coin-slug.png       | 7/1/2/1/1 | 10/2/3/1/1 | 13/3/4/2/2 | Battle Start: gain Armor equal to floor(your Gold/10) (cap 3) |
| Blood Mosquito  | assets/entities/enemies/field/blood-mosquito.png  | 6/1/0/3/1 |  9/2/0/4/1 | 12/3/0/5/2 | On Hit (once/turn): apply 1 Bleed                             |

Enemy spawn targets per run (initial tuning):

- Act 1: 36 enemies on map
- Act 2: 40 enemies on map
- Act 3: 44 enemies on map
- Act 4: 48 enemies on map

---

## 12) Points of Interest (POIs)

Some POIs are one-time, others are repeatable utilities.

| ID  | Location        | Image                                 | Rarity   | Use                   | Active     | Interaction                                                                                         |
| --- | --------------- | ------------------------------------- | -------- | --------------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| L1  | Mole Den        | assets/world/pois/mole-den.png        | Fixed    | Repeatable            | Night-only | Skip to Day; restore all HP                                                                         |
| L2  | Supply Cache    | assets/world/pois/supply-cache.png    | Common   | One-time              | Anytime    | Pick 1 of 3 Common Gear (tag-weighted to current week boss weaknesses)                              |
| L3  | Tool Crate      | assets/world/pois/tool-crate.png      | Uncommon | One-time              | Anytime    | Pick 1 of 3 Tools (tag-weighted)                                                                    |
| L4  | Tool Oil Rack   | assets/world/pois/tool-oil-rack.png   | Common   | Repeatable (per tool) | Anytime    | Modify current tool: +1 ATK or +1 SPD or +1 DIG or +1 ARM (once per tool), no cost                  |
| L5  | Rest Alcove     | assets/world/pois/rest-alcove.png     | Common   | One-time              | Night-only | Skip to Day; heal 10 HP                                                                             |
| L6  | Survey Beacon   | assets/world/pois/survey-beacon.png   | Common   | One-time              | Anytime    | Reveal tiles in radius 13                                                                           |
| L7  | Seismic Scanner | assets/world/pois/seismic-scanner.png | Uncommon | One-time              | Anytime    | Choose a POI category → reveal nearest instance                                                     |
| L8  | Rail Waypoint   | assets/world/pois/rail-waypoint.png   | Uncommon | Repeatable            | Anytime    | Fast travel between discovered waypoints                                                            |
| L9  | Smuggler Hatch  | assets/world/pois/smuggler-hatch.png  | Uncommon | Repeatable            | Anytime    | Shop: 1 Tool + 5 Gear; reroll costs Gold; max 3 rerolls per visit                                   |
| L10 | Rusty Anvil     | assets/world/pois/rusty-anvil.png     | Uncommon | One-time              | Anytime    | Upgrade Tool tier (I→II costs 10 Gold; II→III costs 20 Gold)                                        |
| L11 | Rune Kiln       | assets/world/pois/rune-kiln.png       | Rare     | Repeatable            | Anytime    | Fuse 2 identical items → upgrade tier (II/III); no gold cost                                        |
| L12 | Geode Vault     | assets/world/pois/geode-vault.png     | Rare     | One-time              | Anytime    | Pick 1 of 3 Heroic items (tag-weighted)                                                             |
| L13 | Counter Cache   | assets/world/pois/counter-cache.png   | Uncommon | One-time              | Anytime    | Pick 1 of 3 items drawn only from the 2 weakness tags of the current week boss                      |
| L14 | Scrap Chute     | assets/world/pois/scrap-chute.png     | Uncommon | One-time              | Anytime    | Destroy 1 Gear item; costs 4 Gold flat; refund by rarity: Common 2g, Rare 4g, Heroic 6g, Mythic 10g |

### Baseline spawn counts (by act)

Baseline spawns ensure that every run contains at least one copy of each **common/uncommon** POI type that players rely on for build formation and navigation. Counts vary by act to control the power curve and map routing incentives.

| POI                | Act 1 | Act 2 | Act 3 | Act 4 |
| ------------------ | ----: | ----: | ----: | ----: |
| L2 Supply Cache    |    16 |    14 |    14 |    10 |
| L3 Tool Crate      |     5 |     4 |     4 |     2 |
| L4 Tool Oil Rack   |     5 |     4 |     4 |     3 |
| L5 Rest Alcove     |     6 |     5 |     5 |     4 |
| L6 Survey Beacon   |     4 |     4 |     4 |     3 |
| L7 Seismic Scanner |     3 |     3 |     3 |     2 |
| L8 Rail Waypoint   |     5 |     4 |     4 |     2 |
| L9 Smuggler Hatch  |     2 |     2 |     2 |     1 |
| L10 Rusty Anvil    |     2 |     2 |     2 |     1 |
| L11 Rune Kiln      |     2 |     1 |     1 |     1 |
| L12 Geode Vault    |     2 |     1 |     1 |     1 |
| L14 Scrap Chute    |     3 |     2 |     2 |     1 |
| **Total baseline** |    55 |    46 |    46 |    31 |

### Fixed POI placement

- L1 Mole Den: 1x per run, adjacent to start, 100% chance (all acts).

### Item offer rarity tables

**L2 Supply Cache (3 Gear options)**

- Act 1: 60% Common / 40% Rare
- Act 2: 70% Common / 30% Rare
- Act 3: 80% Common / 20% Rare
- Act 4: 90% Common / 10% Rare

**L3 Tool Crate (3 Tool options)**

- Act 1: 50% Common / 30% Rare / 20% Heroic
- Act 2: 60% Common / 25% Rare / 15% Heroic
- Act 3: 70% Common / 20% Rare / 10% Heroic
- Act 4: 80% Common / 15% Rare / 5% Heroic

**L12 Geode Vault**

- Act 1–4: 90% Heroic / 10% Mythic (max 1 Mythic shown)

**L9 Smuggler Hatch (6 items = 1 Tool + 5 Gear)**
Gear rarity weights:

- Act 1: 35% Common / 45% Rare / 10% Heroic / 10% Mythic
- Act 2: 45% Common / 40% Rare / 10% Heroic / 5% Mythic
- Act 3: 55% Common / 30% Rare / 12% Heroic / 3% Mythic
- Act 4: 65% Common / 25% Rare / 8% Heroic / 2% Mythic

Tool rarity weights:

- Act 1: 45% Common / 40% Rare / 15% Heroic
- Act 2: 55% Common / 35% Rare / 10% Heroic
- Act 3: 65% Common / 30% Rare / 5% Heroic
- Act 4: 80% Common / 15% Rare / 5% Heroic

### Gold pricing

Smuggler Hatch prices:

- Common Gear 8, Rare Gear 14, Heroic Gear 22, Mythic Gear 34
- Common Tool 10, Rare Tool 16, Heroic Tool 24, Mythic Tool 38

Reroll per visit:

- 4 Gold, then +2 each reroll (6, 8, 10…); max 3 rerolls per visit

Scrap Chute cost:

- 4 Gold flat (all acts); refund by rarity: Common 2g, Rare 4g, Heroic 6g, Mythic 10g

Rusty Anvil cost:

- I→II: 10 Gold
- II→III: 20 Gold

---

## 13) Bosses (Biomes, Acts, Variants)

Campaign structure:

- 4 acts of 10 stages: A / B / C / D.
- Week 1 and Week 2 bosses are biome variants (same archetypes, different emphasis).
- Week 3 finals are 2 bosses per biome (Biome B finals are new).

Boss weakness tags:

- Each boss has 2 weakness tags used for loot weighting and Counter Cache.

### Biome A (Acts 1 & 3) — 5 / 5 / 2

Week 1:

- **B-A-W1-01 The Broodmother** 🕷️ — Weakness `STONE + FROST` — `24/2/1/2/1`
  - Swarm Queen: attacks 2 times/turn.
  - Webbed Strikes: every other turn, first strike applies 1 Chill.
- **B-A-W1-02 Obsidian Golem** 🗿 — Weakness `RUST + BLAST` — `28/2/8/0/3`
  - Hardened Core: Turn Start +2 Armor.
  - Cracked Shell: taking non-weapon damage removes 2 Armor after damage.
- **B-A-W1-03 Gas Anomaly** ☁️ — Weakness `BLOOD + TEMPO` — `26/2/0/1/2`
  - Toxic Seep: Turn Start deal 1 dmg ignoring Armor.
  - Fume Panic: Wounded gain +1 SPD (this battle).
- **B-A-W1-04 Mad Miner** ⛏️ — Weakness `SCOUT + GREED` — `26/2/3/2/3`
  - Undermine: Battle Start if your DIG < boss DIG, you are Exposed for Turn 1 only.
  - Claim Jump: First Turn if you are Exposed, boss gains +1 strike.
- **B-A-W1-05 Shard Colossus** 🪲 — Weakness `STONE + BLOOD` — `26/2/3/1/2`
  - Prismatic Spines: Battle Start gain 4 Shrapnel.
  - Refracting Hide: every other turn gain +2 Shrapnel.

Week 2:

- **B-A-W2-01 Drill Sergeant** 🪖 — Weakness `FROST + TEMPO` — `34/2/6/2/3`
  - Rev Up: Turn Start +1 ATK and +1 SPD (this battle).
  - Formation: every other turn +1 Armor.
- **B-A-W2-02 Crystal Mimic** 💎 — Weakness `BLAST + SCOUT` — `36/3/5/2/2`
  - Prismatic Reflection: 2 reflection stacks (first 2 status applications reflect to you).
  - Glass Heart: after reflection is gone, takes +2 non-weapon damage.
- **B-A-W2-03 Rust Regent** 👑☣️ — Weakness `BLOOD + TEMPO` — `36/2/5/2/3`
  - Corroding Edict: On Hit (once/turn) apply 1 Rust.
  - Execution Tax: if you are Exposed at Turn Start, take 1 dmg ignoring Armor.
- **B-A-W2-04 Powder Keg Baron** 🧨 — Weakness `STONE + FROST` — `32/2/4/2/2`
  - Volatile Countdown: Countdown(3) deal 8 damage to you and self (non-weapon).
  - Short Fuse: when Wounded, reduce its Countdown by 1 (min 1).
- **B-A-W2-05 Greedkeeper** 🪙🗝️ — Weakness `GREED + RUST` — `38/2/6/1/2`
  - Toll Collector: Battle Start steal 8 Gold (or all).
  - Gilded Barrier: gain Armor equal to floor(stolenGold/5) (cap 4).

Week 3 finals:

- **B-A-W3-01 The Eldritch Mole** 🐲 — Weakness `RUST + TEMPO` — `50/4/8/3/4`
  - Three Phases: 75% +6 Armor; 50% attacks twice/turn; 25% Turn Start apply 2 Bleed to you.
  - Deep Dig: Battle Start if your DIG > boss DIG, Phase 1 armor gain reduced by 6.
- **B-A-W3-02 The Gilded Devourer** 🐍🏦 — Weakness `GREED + BLOOD` — `46/3/6/2/3`
  - Tax Feast: Battle Start convert your Gold into its Armor (+1 Armor per 5 Gold, cap 6).
  - Hunger: Wounded apply 2 Bleed to you.

### Biome B (Acts 2 & 4) — Week 1/2 variants, Week 3 finals new

Biome B global:

- Week 1/2 bosses: +1 SPD baseline (cap 3).
- Variant tweaks adjust weakness emphasis and one trait line.

Week 3 finals (Biome B new):

- **B-B-W3-01 The Frostbound Leviathan** 🐋🧊 — Weakness `TEMPO + STONE` — `52/3/10/2/3`
  - Whiteout: Battle Start apply 2 Chill to you.
  - Glacial Bulk: every other turn +3 Armor.
  - Crack Ice: when Exposed, remove all Chill and gain +2 SPD (this battle).
- **B-B-W3-02 The Rusted Chronomancer** 🧙‍♂️☣️⏳ — Weakness `RUST + BLOOD` — `48/4/6/3/2`
  - Time Shear: First Turn strikes twice.
  - Oxidized Future: Turn Start apply 1 Rust to you.
  - Blood Price: Wounded apply 3 Bleed to you.

### Act+ modifiers (Acts 3 & 4)

Within-act ramp (stages 1–5/6–10/11–15/16–20):

- `tier = floor((stageInAct - 1) / 5)` = 0..3
- Week 1 boss: `+1 HP*tier`, `+1 ARM*tier`
- Week 2 boss: `+2 HP*tier`, `+1 ARM*tier`, `+1 ATK at tier>=2`
- Week 3 final: `+3 HP*tier`, `+1 ARM*tier`, `+1 ATK at tier>=1`; at tier 0 specifically, **-3 ARM reduction** (makes early Week 3 finals more accessible)

Act-level bumps:

- Act 3 (C): Week 1/2 bosses +1 ATK baseline; Week 3 finals +2 ATK baseline.
- Act 4 (D): Week 1/2 bosses +1 ATK +1 SPD baseline; Week 3 finals +2 ATK +1 SPD baseline.

Each boss also gets one additional "Act+" trait line (data-driven) that intensifies its identity (no new mechanics).

### Stage-determined mapping (per 20-stage act)

- Week 1 boss cycles through the 5 in order (repeat).
- Week 2 boss cycles through the 5 with an offset (to avoid repeating the same pair).
- Week 3 final alternates (odd = Final 1, even = Final 2).

---

## 14) Loot Shaping (Counters without guarantees)

Goal: boss counters are more likely, never guaranteed.

### Tag weighting

When generating any item offer:

- Base weight for each tag: 1.0
- Current-week boss weakness tags: 1.4 each
- Normalize and sample tag → then sample an item of the requested rarity/type from that tag.

Week targeting:

- During Week 1 exploration: use Week 1 boss weaknesses.
- During Week 2 exploration: use Week 2 boss weaknesses.
- During Week 3 exploration: use Week 3 final weaknesses.

Optional "final prep bias":

- During Week 1–2, add +0.1 weight to Week 3 final weakness tags.

---

## 15) Economy & Difficulty Model (initial simulation targets)

### Session Cost & Profile

- **Profile Creation:** Players start with **20 free PvE runs** (Campaign).
- **Top-up (current implementation):** 20 additional PvE runs cost **0.005 SOL**.
- **Run Debit (current implementation):** A run is debited at **session start**.

### Mode Fees & Splits (v1)

All splits below are expressed as % of the **SOL paid**.

#### PvE — Campaign / Practice

- New account: 20 free PvE runs.
- After that: 0.005 SOL for 20 PvE runs.
- Split: **50% company / 50% Gauntlet pool**.

#### PvP — Gauntlet (Async)

- Entry: **0.01 SOL** per run.
- Split: **3% company / 97% Gauntlet pool**.

#### PvP — Duels (Direct)

- Entry stake (current implementation): **0.1 SOL**.
- Split: **3% company / 2% Gauntlet pool / 95% winner**.

#### PvP — Pit Draft (Instant)

- Entry stake (current implementation): **0.1 SOL**.
- Split: **3% company / 2% Gauntlet pool / 95% winner**.

#### Trading — Skins / Items

- Split: **3% company / 2% Gauntlet pool / 95% seller**.

### Items seen vs inventory capacity

Per run, expected item pick opportunities by act:

| Source              | Act 1 | Act 2 | Act 3 | Act 4 |
| ------------------- | ----: | ----: | ----: | ----: |
| Supply Caches       |    16 |    14 |    14 |    10 |
| Tool Crates         |     5 |     4 |     4 |     2 |
| Geode Vaults        |     2 |     1 |     1 |     1 |
| Counter Caches      |     2 |     2 |     2 |     2 |
| Smuggler Hatches    |     2 |     2 |     2 |     1 |
| **Total item sees** |   ~27 |   ~23 |   ~23 |   ~16 |

Inventory management tools by act:

| Tool         | Act 1 | Act 2 | Act 3 | Act 4 |
| ------------ | ----: | ----: | ----: | ----: |
| Rune Kilns   |     2 |     1 |     1 |     1 |
| Scrap Chutes |     3 |     2 |     2 |     1 |

Inventory slots:

- Start 4 Gear slots.
- After Week 1 boss: 6 slots.
- After Week 2 boss: 8 slots.
- Gauntlet extension (5-week modes): Week 3 -> 10 slots, Week 4 -> 12 slots.

Design intent:

- Act 1 floods the player with choices (~27 items seen vs 8+1 capacity) and gives ample Scrap Chutes + Rune Kilns to manage the surplus. Players learn item synergies and build-shaping early.
- Act 4 tightens the pipeline (~16 items seen) with fewer management tools. Every pick matters; bad routing or wasteful spending is harder to recover from.

### Expected fights and Gold (baseline, without Greed items)

Expected gold per enemy by act (given tier mix — unchanged):

- Act 1: 2.7 gold/enemy (avg)
- Act 2: 3.1 gold/enemy (avg)
- Act 3: 3.4 gold/enemy (avg)
- Act 4: 3.7 gold/enemy (avg)

Expected fights per run (target). More POIs in early acts means wider exploration and more enemy encounters; fewer POIs in late acts means tighter routing:

- Act 1: 26 fights → ~70 gold/run
- Act 2: 24 fights → ~74 gold/run
- Act 3: 22 fights → ~75 gold/run
- Act 4: 20 fights → ~74 gold/run

Gold income is roughly flat across acts (~70–75 gold), but its purchasing power differs sharply:

- Act 1: 2 Smuggler Hatches with 40% Rare supply caches and 10% Mythic shop gear — gold buys high-impact items. Rare Gear (14g) roughly every ~5 fights; Heroic Gear (22g) roughly every ~8 fights.
- Act 4: 1 Smuggler Hatch with 90% Common supply caches and 2% Mythic shop gear — gold mostly buys filler. Players rely on the few Tool Crates and the Geode Vault for meaningful upgrades.

### Target stage difficulty ("fair" loss rate)

- Act 1: Generous POIs and better item rarities mean most builds come together. A prepared player should clear ~75–85% of the time for Week 1, ~65–75% for Week 2, ~50–65% for Week 3. Full run clear rate ~50%.
- Acts 2–3: Transitional difficulty. POI scarcity begins to bite and item quality drops. Full run clear rate ~20–35%.
- Act 4: Scarce POIs, common-heavy item pools, and Act+ stat modifiers stack. Full run clear rate ~10%. Intended to feel like a true gauntlet.

---

## 16) Game Modes (v1)

### PvE — Campaign / Practice

- Campaign has **40 stages**.
- A run lasts **3 weeks** (each week = 3 days + 3 nights; Day = 50 moves, Night = 30 moves).
- Exploration is tile-by-tile on a seeded map; combat is deterministic and resolves automatically.
- End of each week triggers a boss fight; defeating the **Week 3 boss** clears the stage. Death ends the run.

### PvP — Gauntlet (Async)

- A run lasts **5 weeks**.
- At the end of each week, the player fights an **Echo** (a snapshot of another player's validated build that survived to that same week).
- Opponent visibility:
  - Weeks 1–4: opponent build is visible **at end of the week**.
  - Week 5: opponent build is visible **only during Week 5**.

### PvP — Duels (Direct)

- Two players stake SOL and play on the **same map seed**.
- PvE progression builds toward a decisive PvP resolution (Week 3) using deterministic combat.
- Entry stake (current implementation): 0.1 SOL.

### PvP — Pit Draft (Instant)

- Two players are matched, then each draws **1 Tool + 7 Gear** from their active pool.
- A **random oil** is applied to the Tool.
- Immediate deterministic combat; winner takes the pot (net of fees).
