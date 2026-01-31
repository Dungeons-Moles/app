# Dungeons & Moles — PvE Dungeon Crawler (GDD v0.2)

Status: Implementation in Progress (Core Loop Active)
Last updated: 2026-01-25

This document consolidates the current gameplay design for the PvE prototype inspired by “He Is Coming”, including items, itemsets, bosses, enemies, POIs, biomes/acts, and balancing knobs.

---

## 1) High Concept

Mobile-first, landscape, D-pad/controller dungeon crawler that plays like a board game: you move tile-by-tile on a seeded map, make exploration decisions, and all combat resolves automatically. Runs are structured into weeks (Day/Night cycles) ending in bosses. The campaign is an 80-stage ladder that ramps difficulty across 4 acts with biome emphasis shifts.

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

Design intent:

- DIG meaningfully impacts routing, but never makes digging “free”.
- DIG’s late-game value comes more from combat comparators than further dig cost reduction.

---

## 6) Player Stats

Player has:

- **HP**: hit points (Persistent state, capped by Max HP).
- **ATK**: weapon damage baseline (Derived from Items).
- **ARM**: armor that reduces incoming weapon damage (Derived from Items).
- **SPD**: determines who acts first each turn (Derived from Items).
- **DIG**: affects dig cost + some combat comparators (Derived from Items).
- **GOLD**: earned from field enemies; spent at shops/POIs (Persistent state).

**Implementation Note:**
Stats (ATK/ARM/SPD/DIG) are no longer stored in the game state. They are derived dynamically from the player's inventory (Tool + Gear) at runtime during combat or movement checks. `PlayerInventory` is the single source of truth.

Start (prototype baseline):

- HP 10, ATK 1 (from Basic Pickaxe), ARM 0, SPD 0, DIG 1 (Base).

Inventory:

- Starts with **4 Gear slots** + 1 Tool slot.
- After defeating **Week 1 boss**: +2 slots (Automatic sync via CPI).
- After defeating **Week 2 boss**: +2 slots (Automatic sync via CPI).
- Tool slot is separate (exactly 1 equipped Tool).

---

## 7) Combat System (Auto-battle)

### Turn order

- Each turn, higher **SPD** acts first.
- If SPD tie: enemy acts first (deterministic rule).

### Damage

- Weapon damage: `max(0, attackerATK - targetARM)` to HP.
- Non-weapon damage ignores Armor unless specified otherwise.

### Visualization (Combat Log)

- The on-chain combat engine returns a detailed **Combat Log** containing every action (Attack, Heal, Status Application) for the frontend to visualize/replay the battle turn-by-turn.

### Stalemate prevention

- **Sudden death starts at Turn 25**:
  - For each turn after 25, both combatants gain **+1 ATK** (stacking).
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

- **Chill**: slow/tempo debuff.
  - At Turn Start: reduce the holder’s strikes this turn by **1** (min 1 strike).
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
- DIG is never “spent” as a resource; it is used for routing and combat comparisons/scaling.

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

### Full item list (80)

Format: `ID — Name (Type) [Tag] {Rarity} — Image: <path> — Effect`

#### STONE (10)

- `T-ST-01` — Bulwark Shovel (Tool) [STONE] {Common} — Image: assets/icons/items/stone/bulwark_shovel.png — `+1/2/3 ATK, +4/6/8 ARM`
- `T-ST-02` — Cragbreaker Hammer (Tool) [STONE] {Rare} — Image: assets/icons/items/stone/cragbreaker_hammer.png — `+2/3/4 ATK, +3/5/7 ARM`; first strike each turn removes `1/2/3` enemy Armor before damage
- `G-ST-01` — Miner Helmet (Gear) [STONE] {Common} — Image: assets/icons/items/stone/miner_helmet.png — `+3/6/9 ARM`
- `G-ST-02` — Work Vest (Gear) [STONE] {Common} — Image: assets/icons/items/stone/work_vest.png — `+4/8/12 HP, +1 ARM`
- `G-ST-03` — Spiked Bracers (Gear) [STONE] {Common} — Image: assets/icons/items/stone/spiked_bracers.png — Battle Start: gain `2/4/6` Shrapnel
- `G-ST-04` — Reinforcement Plate (Gear) [STONE] {Rare} — Image: assets/icons/items/stone/reinforcement_plate.png — Every other turn: gain `1/2/3` Armor
- `G-ST-05` — Rebar Carapace (Gear) [STONE] {Rare} — Image: assets/icons/items/stone/rebar_carapace.png — Exposed: gain `3/5/7` Armor
- `G-ST-06` — Shrapnel Talisman (Gear) [STONE] {Rare} — Image: assets/icons/items/stone/shrapnel_talisman.png — Whenever you gain Shrapnel (once/turn): gain `1/2/3` Armor
- `G-ST-07` — Crystal Crown (Gear) [STONE] {Heroic} — Image: assets/icons/items/stone/crystal_crown.png — Battle Start: gain Max HP equal to your starting Armor (cap `12/18/24`)
- `G-ST-08` — Stone Sigil (Gear) [STONE] {Heroic} — Image: assets/icons/items/stone/stone_sigil.png — End of turn: if you have Armor, gain `1/2/3` Armor

#### SCOUT (10)

- `T-SC-01` — Twin Picks (Tool) [SCOUT] {Common} — Image: assets/icons/items/scout/twin_picks.png — `+1/2/3 ATK`; strike 2 times per turn
- `T-SC-02` — Pneumatic Drill (Tool) [SCOUT] {Rare} — Image: assets/icons/items/scout/pneumatic_drill.png — `+1/2/3 ATK`; strike 3 times per turn
- `G-SC-01` — Miner Boots (Gear) [SCOUT] {Common} — Image: assets/icons/items/scout/miner_boots.png — `+2/3/4 DIG`
- `G-SC-02` — Leather Gloves (Gear) [SCOUT] {Common} — Image: assets/icons/items/scout/leather_gloves.png — `+1/2/3 ATK, +1 DIG`
- `G-SC-03` — Tunnel Instinct (Gear) [SCOUT] {Rare} — Image: assets/icons/items/scout/tunnel_instinct.png — Battle Start: if DIG > enemy DIG, gain `+1/2/3 SPD` (this battle)
- `G-SC-04` — Tunneler Spurs (Gear) [SCOUT] {Rare} — Image: assets/icons/items/scout/tunneler_spurs.png — `+1/2/3 SPD`; if you act first on Turn 1, gain `+1/2/3 DIG` (this battle)
- `G-SC-05` — Wall-Sense Visor (Gear) [SCOUT] {Rare} — Image: assets/icons/items/scout/wall-sense_visor.png — `+1/2/3 DIG`; Battle Start: if DIG > enemy DIG, gain `+2/3/4` Armor
- `G-SC-06` — Drill Servo (Gear) [SCOUT] {Heroic} — Image: assets/icons/items/scout/drill_servo.png — Wounded: gain `+1/2/3` additional strikes (this battle)
- `G-SC-07` — Weak-Point Manual (Gear) [SCOUT] {Heroic} — Image: assets/icons/items/scout/weak-point_manual.png — If DIG > enemy Armor: your strikes ignore `1/2/3` Armor (this battle)
- `G-SC-08` — Gear-Link Medallion (Gear) [SCOUT] {Mythic} — Image: assets/icons/items/scout/gear-link_medallion.png — Your On Hit effects trigger twice (once/turn)

#### GREED (10)

- `T-GR-01` — Glittering Pick (Tool) [GREED] {Common} — Image: assets/icons/items/greed/glittering_pick.png — `+1/2/3 ATK`; On Hit (once/turn): gain 1 Gold
- `T-GR-02` — Gemfinder Staff (Tool) [GREED] {Heroic} — Image: assets/icons/items/greed/gemfinder_staff.png — `+1 ATK, +1 ARM, +1 DIG`; first hit each turn triggers all your Shard effects
- `G-GR-01` — Loose Nuggets (Gear) [GREED] {Common} — Image: assets/icons/items/greed/loose_nuggets.png — Start of each Day: gain `3/6/9` Gold
- `G-GR-02` — Lucky Coin (Gear) [GREED] {Common} — Image: assets/icons/items/greed/lucky_coin.png — Victory: gain `2/4/6` Gold
- `G-GR-03` — Gilded Band (Gear) [GREED] {Rare} — Image: assets/icons/items/greed/gilded_band.png — Battle Start: gain Armor equal to `floor(Gold/10)` (cap `2/3/4`)
- `G-GR-04` — Royal Bracer (Gear) [GREED] {Heroic} — Image: assets/icons/items/greed/royal_bracer.png — Turn Start: convert 1 Gold → `2/3/4` Armor
- `G-GR-05` — Emerald Shard (Gear) [GREED] {Common} — Image: assets/icons/items/greed/emerald_shard.png — Every other turn (on first hit): heal `1/2/3` HP
- `G-GR-06` — Ruby Shard (Gear) [GREED] {Common} — Image: assets/icons/items/greed/ruby_shard.png — Every other turn (on first hit): deal `1/2/3` non-weapon damage
- `G-GR-07` — Sapphire Shard (Gear) [GREED] {Common} — Image: assets/icons/items/greed/sapphire_shard.png — Every other turn (on first hit): gain `1/2/3` Armor
- `G-GR-08` — Citrine Shard (Gear) [GREED] {Common} — Image: assets/icons/items/greed/citrine_shard.png — Every other turn (on first hit): gain `1/2/3` Gold

#### BLAST (10)

- `T-BL-01` — Fuse Pick (Tool) [BLAST] {Common} — Image: assets/icons/items/blast/fuse_pick.png — `+1/2/3 ATK`; first hit each turn: deal 1 non-weapon damage
- `T-BL-02` — Spark Pick (Tool) [BLAST] {Rare} — Image: assets/icons/items/blast/spark_pick.png — `+1/2/3 ATK`; On Hit (once/turn): reduce your highest Countdown by 1
- `G-BL-01` — Small Charge (Gear) [BLAST] {Common} — Image: assets/icons/items/blast/small_charge.png — Countdown(2): deal `8/10/12` to enemy and you (non-weapon)
- `G-BL-02` — Blast Suit (Gear) [BLAST] {Rare} — Image: assets/icons/items/blast/blast_suit.png — You ignore damage from your own BLAST items
- `G-BL-03` — Explosive Powder (Gear) [BLAST] {Rare} — Image: assets/icons/items/blast/explosive_powder.png — Your non-weapon damage deals `+1/2/3`
- `G-BL-04` — Double Detonation (Gear) [BLAST] {Rare} — Image: assets/icons/items/blast/double_detonation.png — Second time you deal non-weapon damage each turn: deal `+2/3/4` more
- `G-BL-05` — Bomb Satchel (Gear) [BLAST] {Heroic} — Image: assets/icons/items/blast/bomb_satchel.png — Battle Start: reduce Countdown of all your bomb items by 1 (min 0)
- `G-BL-06` — Kindling Charge (Gear) [BLAST] {Rare} — Image: assets/icons/items/blast/kindling_charge.png — Battle Start: deal `1/2/3`; your next bomb this battle deals `+3/5/7`
- `G-BL-07` — Time Charge (Gear) [BLAST] {Heroic} — Image: assets/icons/items/blast/time_charge.png — Turn Start: gain `+1/2/3` stored damage (this battle); when Exposed: deal stored damage
- `G-BL-08` — Twin-Fuse Knot (Gear) [BLAST] {Mythic} — Image: assets/icons/items/blast/twin-fuse_knot.png — Your bomb triggers happen twice

#### FROST (10)

- `T-FR-01` — Rime Pike (Tool) [FROST] {Common} — Image: assets/icons/items/frost/rime_pike.png — `+2/3/4 ATK`; On Hit (once/turn): apply 1 Chill
- `T-FR-02` — Glacier Fang (Tool) [FROST] {Rare} — Image: assets/icons/items/frost/glacier_fang.png — `+2/3/4 ATK`; On Hit (once/turn): apply 1 Chill; if enemy has Chill, gain +1 SPD this turn
- `G-FR-01` — Frost Lantern (Gear) [FROST] {Common} — Image: assets/icons/items/frost/frost_lantern.png — Battle Start: give enemy `1/2/3` Chill
- `G-FR-02` — Frostguard Buckler (Gear) [FROST] {Rare} — Image: assets/icons/items/frost/frostguard_buckler.png — `+6/8/10 ARM`; Battle Start: if enemy has Chill, gain `+2/3/4` Armor
- `G-FR-03` — Cold Snap Charm (Gear) [FROST] {Rare} — Image: assets/icons/items/frost/cold_snap_charm.png — If you act first on Turn 1: apply `2/3/4` Chill
- `G-FR-04` — Ice Skates (Gear) [FROST] {Rare} — Image: assets/icons/items/frost/ice_skates.png — `+1/2/3 SPD`
- `G-FR-05` — Rime Cloak (Gear) [FROST] {Rare} — Image: assets/icons/items/frost/rime_cloak.png — `+3/5/7 ARM`; when struck (once/turn): apply 1 Chill to attacker
- `G-FR-06` — Permafrost Core (Gear) [FROST] {Heroic} — Image: assets/icons/items/frost/permafrost_core.png — Turn Start: if enemy has Chill, gain `1/2/3` Armor
- `G-FR-07` — Cold Front Idol (Gear) [FROST] {Heroic} — Image: assets/icons/items/frost/cold_front_idol.png — Every other turn: apply 1 Chill; if enemy already has Chill, gain +1 SPD this turn
- `G-FR-08` — Deep Freeze Charm (Gear) [FROST] {Heroic} — Image: assets/icons/items/frost/deep_freeze_charm.png — Wounded: apply `2/3/4` Chill and reduce enemy SPD by 1 (this battle)

#### RUST (10)

- `T-RU-01` — Corrosive Pick (Tool) [RUST] {Common} — Image: assets/icons/items/rust/corrosive_pick.png — `+1/2/3 ATK`; On Hit (once/turn): apply 1 Rust
- `T-RU-02` — Etched Burrowblade (Tool) [RUST] {Rare} — Image: assets/icons/items/rust/etched_burrowblade.png — `+2/3/4 ATK, +1/2/3 SPD`; if enemy has Rust, your strikes ignore `1/2/3` Armor
- `G-RU-01` — Oxidizer Vial (Gear) [RUST] {Common} — Image: assets/icons/items/rust/oxidizer_vial.png — Battle Start: apply `1/2/3` Rust (if enemy has Armor, apply +1 more)
- `G-RU-02` — Rust Spike (Gear) [RUST] {Rare} — Image: assets/icons/items/rust/rust_spike.png — On Hit (once/turn): apply 1 Rust
- `G-RU-03` — Corroded Greaves (Gear) [RUST] {Rare} — Image: assets/icons/items/rust/corroded_greaves.png — `+1/2/3 SPD`; Wounded: apply `2/3/4` Rust
- `G-RU-04` — Acid Phial (Gear) [RUST] {Rare} — Image: assets/icons/items/rust/acid_phial.png — Battle Start: reduce enemy Armor by `2/3/4`
- `G-RU-05` — Flaking Plating (Gear) [RUST] {Rare} — Image: assets/icons/items/rust/flaking_plating.png — `+6/8/10 ARM`; Exposed: apply `2/3/4` Rust to enemy
- `G-RU-06` — Rust Engine (Gear) [RUST] {Heroic} — Image: assets/icons/items/rust/rust_engine.png — Turn Start: if enemy has Rust, deal `1/2/3` non-weapon damage
- `G-RU-07` — Corrosion Loop (Gear) [RUST] {Heroic} — Image: assets/icons/items/rust/corrosion_loop.png — On Hit (once/turn): if enemy has Armor, apply +1 additional Rust
- `G-RU-08` — Salvage Clamp (Gear) [RUST] {Common} — Image: assets/icons/items/rust/salvage_clamp.png — Whenever you apply Rust (once/turn): gain 1 Gold

#### BLOOD (10)

- `T-BO-01` — Serrated Drill (Tool) [BLOOD] {Common} — Image: assets/icons/items/blood/serrated_drill.png — `+1/2/3 ATK`; On Hit (once/turn): apply 1 Bleed
- `T-BO-02` — Reaper Pick (Tool) [BLOOD] {Rare} — Image: assets/icons/items/blood/reaper_pick.png — `+2/3/4 ATK`; On Hit (once/turn): apply 1 Bleed (if enemy is Wounded, apply +1 Bleed)
- `G-BO-01` — Last Breath Sigil (Gear) [BLOOD] {Common} — Image: assets/icons/items/blood/last_breath_sigil.png — One use: first time you would die in battle, prevent it and heal `2/3/4` HP
- `G-BO-02` — Bloodletting Fang (Gear) [BLOOD] {Rare} — Image: assets/icons/items/blood/bloodletting_fang.png — Your attacks deal `+1/2/3` damage to Bleeding enemies
- `G-BO-03` — Leech Wraps (Gear) [BLOOD] {Rare} — Image: assets/icons/items/blood/leech_wraps.png — When enemy takes Bleed damage: heal `1/2/3` HP (once/turn)
- `G-BO-04` — Blood Chalice (Gear) [BLOOD] {Rare} — Image: assets/icons/items/blood/blood_chalice.png — Victory: heal `3/5/7` HP
- `G-BO-05` — Hemorrhage Hook (Gear) [BLOOD] {Heroic} — Image: assets/icons/items/blood/hemorrhage_hook.png — Wounded: apply `2/3/4` Bleed
- `G-BO-06` — Execution Emblem (Gear) [BLOOD] {Heroic} — Image: assets/icons/items/blood/execution_emblem.png — If enemy is Wounded, your first strike each turn deals `+2/3/4` damage
- `G-BO-07` — Gore Mantle (Gear) [BLOOD] {Rare} — Image: assets/icons/items/blood/gore_mantle.png — First time you become Wounded in battle: gain `4/6/8` Armor
- `G-BO-08` — Vampiric Tooth (Gear) [BLOOD] {Mythic} — Image: assets/icons/items/blood/vampiric_tooth.png — Your first hit each turn vs a Bleeding enemy heals 2 HP

#### TEMPO (10)

- `T-TE-01` — Quickpick (Tool) [TEMPO] {Common} — Image: assets/icons/items/tempo/quickpick.png — `+1/2/3 ATK, +1/2/3 SPD`
- `T-TE-02` — Chrono Rapier (Tool) [TEMPO] {Heroic} — Image: assets/icons/items/tempo/chrono_rapier.png — `+1/2/3 ATK, +2/3/4 SPD`; if you act first on Turn 1, gain `+2/3/4` ATK (this battle)
- `G-TE-01` — Wind-Up Spring (Gear) [TEMPO] {Common} — Image: assets/icons/items/tempo/wind-up_spring.png — Turn 1: gain `+1/2/3 SPD` and `+2/3/4` ATK (this battle)
- `G-TE-02` — Ambush Charm (Gear) [TEMPO] {Rare} — Image: assets/icons/items/tempo/ambush_charm.png — If you act first on Turn 1, your first strike deals `+3/5/7` damage
- `G-TE-03` — Counterweight Buckle (Gear) [TEMPO] {Rare} — Image: assets/icons/items/tempo/counterweight_buckle.png — If enemy acts first on Turn 1, gain `5/7/9` Armor before damage
- `G-TE-04` — Hourglass Charge (Gear) [TEMPO] {Rare} — Image: assets/icons/items/tempo/hourglass_charge.png — Turn 5: gain `+2/3/4` ATK and +1 SPD (this battle)
- `G-TE-05` — Initiative Lens (Gear) [TEMPO] {Rare} — Image: assets/icons/items/tempo/initiative_lens.png — `+1/2/3 SPD`; Battle Start: if your SPD > enemy SPD, gain `3/5/7` Armor
- `G-TE-06` — Backstep Buckle (Gear) [TEMPO] {Rare} — Image: assets/icons/items/tempo/backstep_buckle.png — If enemy acts first on Turn 1, your first strike deals `+3/5/7` damage
- `G-TE-07` — Tempo Battery (Gear) [TEMPO] {Heroic} — Image: assets/icons/items/tempo/tempo_battery.png — Every other turn: gain `+1/2/3 SPD` (this battle)
- `G-TE-08` — Second Wind Clock (Gear) [TEMPO] {Heroic} — Image: assets/icons/items/tempo/second_wind_clock.png — Turn 5: heal `4/6/8` HP and gain +1 SPD (this battle)

---

## 10) Itemsets (12)

Itemsets activate when all required items are equipped.

| Set                      | Image                                              | Required                                | Bonus                                                                                |
| ------------------------ | -------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------ |
| Union Standard           | assets/icons/itemsets/union_standard.png           | `G-ST-01 + G-ST-02 + G-SC-01`           | Battle Start: `+4 Armor, +1 DIG`                                                     |
| Shard Circuit            | assets/icons/itemsets/shard_circuit.png            | `G-GR-05 + G-GR-06 + G-GR-07 + G-GR-08` | Shards trigger every turn                                                            |
| Demolition Permit        | assets/icons/itemsets/demolition_permit.png        | `G-BL-01 + G-BL-02 + G-BL-03`           | Countdown bombs tick 1 turn faster                                                   |
| Fuse Network             | assets/icons/itemsets/fuse_network.png             | `T-BL-02 + G-BL-05 + G-BL-04`           | First non-weapon damage each turn deals +2                                           |
| Shrapnel Harness         | assets/icons/itemsets/shrapnel_harness.png         | `G-ST-03 + G-ST-06 + T-ST-01`           | Keep up to 3 Shrapnel at end of turn                                                 |
| Rust Ritual              | assets/icons/itemsets/rust_ritual.png              | `T-RU-01 + G-RU-02 + G-RU-03`           | On Hit (once/turn): apply +1 extra Rust                                              |
| Swift Digger Kit         | assets/icons/itemsets/swift_digger_kit.png         | `T-SC-01 + G-SC-01 + G-SC-06`           | Battle Start: if DIG > enemy DIG, gain +2 strikes (this battle)                      |
| Royal Extraction         | assets/icons/itemsets/royal_extraction.png         | `G-GR-01 + G-GR-04 + T-GR-02`           | Gold→Armor becomes 1→4                                                               |
| Whiteout Initiative      | assets/icons/itemsets/whiteout_initiative.png      | `G-FR-04 + G-FR-03 + G-TE-05`           | Battle Start: +1 SPD; if you act first Turn 1, apply +2 Chill                        |
| Bloodrush Protocol       | assets/icons/itemsets/bloodrush_protocol.png       | `T-BO-01 + G-BO-05 + G-TE-01`           | Turn 1: apply 2 Bleed; when enemy takes Bleed dmg, gain +1 SPD this turn (once/turn) |
| Corrosion Payload        | assets/icons/itemsets/corrosion_payload.png        | `G-RU-02 + G-BL-03 + G-BL-05`           | First time your bomb deals damage each turn: apply 1 Rust                            |
| Golden Shrapnel Exchange | assets/icons/itemsets/golden_shrapnel_exchange.png | `G-GR-04 + G-ST-06 + G-GR-03`           | When you convert Gold→Armor: gain +3 Shrapnel (once/turn)                            |

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

| Enemy           | Image                                             |         T1 |         T2 |         T3 | Trait                                                         |
| --------------- | ------------------------------------------------- | ---------: | ---------: | ---------: | ------------------------------------------------------------- |
| Tunnel Rat      | assets/entities/enemies/field/tunnel-rat.png      |  5/1/0/3/1 |  7/2/0/4/1 |  9/3/1/5/2 | On Hit (once/turn): steal 1 Gold                              |
| Cave Bat        | assets/entities/enemies/field/cave-bat.png        |  6/1/0/3/1 |  8/2/0/4/1 | 10/3/0/5/2 | Every other turn: restore 1 HP                                |
| Spore Slime     | assets/entities/enemies/field/spore-slime.png     |  8/1/2/0/1 | 11/2/3/0/1 | 14/3/4/0/2 | Battle Start: apply 2 Chill to you                            |
| Rust Mite Swarm | assets/entities/enemies/field/rust-mite-swarm.png |  6/1/0/3/2 |  9/2/0/4/2 | 12/3/0/5/3 | On Hit (once/turn): apply 1 Rust                              |
| Collapsed Miner | assets/entities/enemies/field/collapsed-miner.png | 10/2/0/1/3 | 14/3/0/2/3 | 18/4/1/3/4 | Wounded: gain +3 ATK (this battle)                            |
| Shard Beetle    | assets/entities/enemies/field/shard-beetle.png    |  9/1/3/1/2 | 12/2/4/1/2 | 15/3/5/2/3 | Battle Start: gain 6 Shrapnel                                 |
| Tunnel Warden   | assets/entities/enemies/field/tunnel-warden.png   |  8/2/4/2/2 | 11/3/6/3/2 | 14/4/8/4/3 | First strike each turn: remove 3 Armor from you before damage |
| Burrow Ambusher | assets/entities/enemies/field/burrow-ambusher.png |  6/3/0/4/2 |  9/4/0/5/2 | 12/5/0/6/3 | Battle Start: deal 3 damage ignoring Armor                    |
| Frost Wisp      | assets/entities/enemies/field/frost-wisp.png      |  7/1/0/4/1 | 10/2/0/5/1 | 13/3/0/6/2 | If it acts first on Turn 1: apply 2 Chill                     |
| Powder Tick     | assets/entities/enemies/field/powder-tick.png     |  7/1/0/2/1 | 10/2/0/3/1 | 13/3/0/4/2 | Countdown(2): deal 6 damage to you and itself (non-weapon)    |
| Coin Slug       | assets/entities/enemies/field/coin-slug.png       |  7/1/2/1/1 | 10/2/3/1/1 | 13/3/4/2/2 | Battle Start: gain Armor equal to floor(your Gold/10) (cap 3) |
| Blood Mosquito  | assets/entities/enemies/field/blood-mosquito.png  |  6/1/0/3/1 |  9/2/0/4/1 | 12/3/0/5/2 | On Hit (once/turn): apply 1 Bleed                             |

Enemy spawn targets per run (initial tuning):

- Act 1: 36 enemies on map
- Act 2: 40 enemies on map
- Act 3: 44 enemies on map
- Act 4: 48 enemies on map

---

## 12) Points of Interest (POIs)

Some POIs are one-time, others are repeatable utilities.

| ID  | Location        | Image                                 | Rarity   | Use                   | Active     | Interaction                                                                    |
| --- | --------------- | ------------------------------------- | -------- | --------------------- | ---------- | ------------------------------------------------------------------------------ |
| L1  | Mole Den        | assets/world/pois/mole-den.png        | Fixed    | Repeatable            | Night-only | Skip to Day; restore all HP                                                    |
| L2  | Supply Cache    | assets/world/pois/supply-cache.png    | Common   | One-time              | Anytime    | Pick 1 of 3 Common Gear (tag-weighted to current week boss weaknesses)         |
| L3  | Tool Crate      | assets/world/pois/tool-crate.png      | Uncommon | One-time              | Anytime    | Pick 1 of 3 Tools (tag-weighted)                                               |
| L4  | Tool Oil Rack   | assets/world/pois/tool-oil-rack.png   | Common   | Repeatable (per tool) | Anytime    | Modify current tool: +1 ATK or +1 SPD or +1 DIG (once per tool)                |
| L5  | Rest Alcove     | assets/world/pois/rest-alcove.png     | Common   | One-time              | Night-only | Skip to Day; heal 10 HP                                                        |
| L6  | Survey Beacon   | assets/world/pois/survey-beacon.png   | Common   | One-time              | Anytime    | Reveal tiles in radius 13                                                      |
| L7  | Seismic Scanner | assets/world/pois/seismic-scanner.png | Uncommon | One-time              | Anytime    | Choose a POI category → reveal nearest instance                                |
| L8  | Rail Waypoint   | assets/world/pois/rail-waypoint.png   | Uncommon | Repeatable            | Anytime    | Fast travel between discovered waypoints                                       |
| L9  | Smuggler Hatch  | assets/world/pois/smuggler-hatch.png  | Uncommon | Repeatable            | Anytime    | Shop: 1 Tool + 5 Gear; reroll costs Gold                                       |
| L10 | Rusty Anvil     | assets/world/pois/rusty-anvil.png     | Uncommon | One-time              | Anytime    | Upgrade Tool tier (I→II costs 8 Gold; II→III costs 16 Gold)                    |
| L11 | Rune Kiln       | assets/world/pois/rune-kiln.png       | Rare     | Repeatable            | Anytime    | Fuse 2 identical items → upgrade tier (II/III); no gold cost                   |
| L12 | Geode Vault     | assets/world/pois/geode-vault.png     | Rare     | One-time              | Anytime    | Pick 1 of 3 Heroic items (tag-weighted)                                        |
| L13 | Counter Cache   | assets/world/pois/counter-cache.png   | Uncommon | One-time              | Anytime    | Pick 1 of 3 items drawn only from the 2 weakness tags of the current week boss |
| L14 | Scrap Chute     | assets/world/pois/scrap-chute.png     | Uncommon | One-time              | Anytime    | Destroy 1 Gear item (no reward). Costs Gold (by act).                          |

### POI Guarantees per run (by act)

Guarantees are in addition to baseline spawns (below).

Act 1 (Biome A):

- L1 adjacent, L8 x2, L9 x1, L11 x1, L12 x1, L7 x1
- L13 (Week 1) x1, L13 (Week 2) x1, L13 (Week 3) 50%
- L14 x1, L5 x2

Act 2 (Biome B):

- Same as Act 1
- L13 (Week 3) x1 guaranteed
- L5 x3, L6 x2 total

Act 3 (Biome C):

- Same core utilities
- L13 (Week 3) 30%
- L5 x1, L14 x1

Act 4 (Biome D):

- Same core utilities
- L13 (Week 3) 20%
- L5 x2, L14 x1

### Baseline spawn counts (by act)

Act 1:

- L2 x10, L3 x2, L4 x2, L6 x1, L10 x1
  Act 2:
- L2 x9, L3 x2, L4 x1, L6 +1 (total), L10 x1
  Act 3:
- L2 x8, L3 x2, L4 x1, L6 x1, L10 x1
  Act 4:
- L2 x7, L3 x2, L4 x1, L6 x1, L10 x1

### Item offer rarity tables

L2 Supply Cache (3 Gear options):

- Act 1: 100% Common Gear
- Act 2: 85% Common / 15% Rare
- Act 3: 75% Common / 25% Rare
- Act 4: 65% Common / 35% Rare

L3 Tool Crate (3 Tool options):

- Act 1: 85% Common / 15% Rare
- Act 2: 70% Common / 25% Rare / 5% Heroic
- Act 3: 60% Common / 30% Rare / 10% Heroic
- Act 4: 50% Common / 35% Rare / 15% Heroic

L12 Geode Vault:

- Act 1–3: 3 Heroic options
- Act 4: 90% Heroic / 10% Mythic (max 1 Mythic shown)

L9 Smuggler Hatch (6 items = 1 Tool + 5 Gear):
Gear rarity weights:

- Act 1: 70% Common / 27% Rare / 3% Heroic
- Act 2: 55% Common / 38% Rare / 7% Heroic
- Act 3: 45% Common / 42% Rare / 13% Heroic
- Act 4: 35% Common / 45% Rare / 18% Heroic / 2% Mythic

Tool rarity weights:

- Act 1: 80% Common / 20% Rare
- Act 2: 65% Common / 30% Rare / 5% Heroic
- Act 3: 55% Common / 35% Rare / 10% Heroic
- Act 4: 45% Common / 40% Rare / 15% Heroic

### Gold pricing

Smuggler Hatch prices:

- Common Gear 8, Rare Gear 14, Heroic Gear 22, Mythic Gear 34
- Common Tool 10, Rare Tool 16, Heroic Tool 24

Reroll per visit:

- 4 Gold, then +2 each reroll (6, 8, 10…)

Scrap Chute cost:

- Act 1–2: 8 Gold
- Act 3: 10 Gold
- Act 4: 12 Gold

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

- **B-A-W1-01 The Broodmother** 🕷️ — Weakness `STONE + FROST` — `32/2/2/3/1`
  - Swarm Queen: attacks 3 times/turn.
  - Webbed Strikes: every other turn, first strike applies 1 Chill.
- **B-A-W1-02 Obsidian Golem** 🗿 — Weakness `RUST + BLAST` — `40/3/14/0/3`
  - Hardened Core: Turn Start +4 Armor.
  - Cracked Shell: taking non-weapon damage removes 2 Armor after damage.
- **B-A-W1-03 Gas Anomaly** ☁️ — Weakness `BLOOD + TEMPO` — `34/2/0/2/2`
  - Toxic Seep: Turn Start deal 2 dmg ignoring Armor.
  - Fume Panic: Wounded gain +1 SPD (this battle).
- **B-A-W1-04 Mad Miner** ⛏️ — Weakness `SCOUT + GREED` — `36/3/6/2/4`
  - Undermine: Battle Start if your DIG < boss DIG, you are Exposed for Turn 1 only.
  - Claim Jump: First Turn if you are Exposed, boss gains +1 strike.
- **B-A-W1-05 Shard Colossus** 🪲 — Weakness `STONE + BLOOD` — `38/2/6/1/2`
  - Prismatic Spines: Battle Start gain 8 Shrapnel.
  - Refracting Hide: every other turn gain +4 Shrapnel.

Week 2:

- **B-A-W2-01 Drill Sergeant** 🪖 — Weakness `FROST + TEMPO` — `46/2/10/3/3`
  - Rev Up: Turn Start +1 ATK and +1 SPD (this battle).
  - Formation: every other turn +2 Armor.
- **B-A-W2-02 Crystal Mimic** 💎 — Weakness `BLAST + SCOUT` — `50/4/8/2/2`
  - Prismatic Reflection: 2 reflection stacks (first 2 status applications reflect to you).
  - Glass Heart: after reflection is gone, takes +2 non-weapon damage.
- **B-A-W2-03 Rust Regent** 👑☣️ — Weakness `BLOOD + TEMPO` — `48/3/8/2/3`
  - Corroding Edict: On Hit (once/turn) apply 1 Rust.
  - Execution Tax: if you are Exposed at Turn Start, take 2 dmg ignoring Armor.
- **B-A-W2-04 Powder Keg Baron** 🧨 — Weakness `STONE + FROST` — `44/3/6/2/2`
  - Volatile Countdown: Countdown(3) deal 10 damage to you and self (non-weapon).
  - Short Fuse: when Wounded, reduce its Countdown by 1 (min 1).
- **B-A-W2-05 Greedkeeper** 🪙🗝️ — Weakness `GREED + RUST` — `52/2/12/1/2`
  - Toll Collector: Battle Start steal 10 Gold (or all).
  - Gilded Barrier: gain Armor equal to floor(stolenGold/5) (cap 6).

Week 3 finals:

- **B-A-W3-01 The Eldritch Mole** 🐲 — Weakness `RUST + TEMPO` — `72/5/12/3/4`
  - Three Phases: 75% +10 Armor; 50% attacks twice/turn; 25% Turn Start apply 2 Bleed to you.
  - Deep Dig: Battle Start if your DIG > boss DIG, Phase 1 armor gain reduced by 10.
- **B-A-W3-02 The Gilded Devourer** 🐍🏦 — Weakness `GREED + BLOOD` — `68/4/10/2/3`
  - Tax Feast: Battle Start convert your Gold into its Armor (+1 Armor per 5 Gold, cap 10).
  - Hunger: Wounded apply 3 Bleed to you.

### Biome B (Acts 2 & 4) — Week 1/2 variants, Week 3 finals new

Biome B global:

- Week 1/2 bosses: +1 SPD baseline (cap 4).
- Variant tweaks adjust weakness emphasis and one trait line.

Week 3 finals (Biome B new):

- **B-B-W3-01 The Frostbound Leviathan** 🐋🧊 — Weakness `TEMPO + STONE` — `74/4/14/2/3`
  - Whiteout: Battle Start apply 3 Chill to you.
  - Glacial Bulk: every other turn +4 Armor.
  - Crack Ice: when Exposed, remove all Chill and gain +2 SPD (this battle).
- **B-B-W3-02 The Rusted Chronomancer** 🧙‍♂️☣️⏳ — Weakness `RUST + BLOOD` — `66/5/8/4/2`
  - Time Shear: First Turn strikes twice.
  - Oxidized Future: Turn Start apply 1 Rust to you.
  - Blood Price: Wounded apply 4 Bleed to you.

### Act+ modifiers (Acts 3 & 4)

Within-act ramp (stages 1–5/6–10/11–15/16–20):

- `tier = floor((stageInAct - 1) / 5)` = 0..3
- Week 1 boss: `+2 HP*tier`, `+1 ARM*tier`
- Week 2 boss: `+3 HP*tier`, `+1 ARM*tier`, `+1 ATK at tier>=2`
- Week 3 final: `+4 HP*tier`, `+1 ARM*tier`, `+1 ATK at tier>=1`

Act-level bumps:

- Act 3 (C): Week 1/2 bosses +1 ATK baseline; Week 3 finals +2 ATK baseline.
- Act 4 (D): Week 1/2 bosses +1 ATK +1 SPD baseline; Week 3 finals +2 ATK +1 SPD baseline.

Each boss also gets one additional “Act+” trait line (data-driven) that intensifies its identity (no new mechanics).

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

Optional “final prep bias”:

- During Week 1–2, add +0.1 weight to Week 3 final weakness tags.

---

## 15) Economy & Difficulty Model (initial simulation targets)

### Session Cost & Profile

- **Profile Creation:** Players start with 20 free runs.
- **Top-up:** 20 additional runs cost **0.005 SOL**.
- **Run Debit:** A run is debited only upon defeat (HP 0) or level completion.

### Items seen vs inventory capacity

Per run, expected item opportunities (Act 1 baseline):

- Supply Caches: 10 (1 item each)
- Tool Crates: 2 (1 tool chosen each)
- Geode Vault: 1 (1 heroic chosen)
- Counter Caches: 2 guaranteed (+ optional Week 3)
- Shop purchases: optional

Inventory slots:

- Start 4 Gear slots.
- After Week 1 boss: 6 slots.
- After Week 2 boss: 8 slots.

Design intent:

- Players will see more items than they can hold; Scrap Chute + Rune Kiln provide agency.

### Expected fights and Gold (baseline, without Greed items)

Expected gold per enemy by act (given tier mix):

- Act 1: 2.7 gold/enemy (avg)
- Act 2: 3.1 gold/enemy (avg)
- Act 3: 3.4 gold/enemy (avg)
- Act 4: 3.7 gold/enemy (avg)

Expected fights per run (target):

- Act 1: 24 fights → ~65 gold/run
- Act 2: 26 fights → ~81 gold/run
- Act 3: 28 fights → ~95 gold/run
- Act 4: 30 fights → ~111 gold/run

Shop affordability (Act 1 baseline):

- Rare Gear (14g) roughly every ~5 fights.
- Heroic Gear (22g) roughly every ~8 fights.

### Target stage difficulty (“fair” loss rate)

- A “not-yet-ready” run can lose to a stage at ~60–70% rate.
- A run at the intended stage power level should feel hard but not bricked (tune via POI weights + Act+ modifiers + enemy tier mix).