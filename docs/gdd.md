# Dungeons & Moles — PvE Dungeon Crawler (GDD v0.1)

Status: Draft (design-ready, implementation next)
Last updated: 2026-01-12

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
- Emojis for entities (prototype visuals).

---

## 5) Map, Movement, Fog-of-War, and DIG

### Tiles
- Two tile types (v0): **Floor** (walkable) and **Wall** (not walkable until dug).
- Fog-of-war: tiles are hidden until seen; once revealed, remain revealed.

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
- **HP**: hit points
- **ATK**: weapon damage baseline
- **ARM**: armor that reduces incoming weapon damage
- **SPD**: determines who acts first each turn
- **DIG**: affects dig cost + some combat comparators
- **GOLD**: earned from field enemies; spent at shops/POIs

Start (prototype baseline):
- HP 10, ATK 1 (from starter tool), ARM 0, SPD 0, DIG 1

Inventory:
- Starts with **4 Gear slots**.
- After defeating **Week 1 boss**: +2 slots.
- After defeating **Week 2 boss**: +2 slots.
- Tool slot is separate (exactly 1 equipped Tool).

---

## 7) Combat System (Auto-battle)

### Turn order
- Each turn, higher **SPD** acts first.
- If SPD tie: enemy acts first (deterministic rule).

### Damage
- Weapon damage: `max(0, attackerATK - targetARM)` to HP.
- Non-weapon damage ignores Armor unless specified otherwise.

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

Format: `ID — Name (Type) [Tag] {Rarity} — Effect`

#### STONE (10)
- `T-ST-01` — Bulwark Shovel (Tool) [STONE] {Common} — `+1/2/3 ATK, +4/6/8 ARM`
- `T-ST-02` — Cragbreaker Hammer (Tool) [STONE] {Rare} — `+2/3/4 ATK, +3/5/7 ARM`; first strike each turn removes `1/2/3` enemy Armor before damage
- `G-ST-01` — Miner Helmet (Gear) [STONE] {Common} — `+3/6/9 ARM`
- `G-ST-02` — Work Vest (Gear) [STONE] {Common} — `+4/8/12 HP, +1 ARM`
- `G-ST-03` — Spiked Bracers (Gear) [STONE] {Common} — Battle Start: gain `2/4/6` Shrapnel
- `G-ST-04` — Reinforcement Plate (Gear) [STONE] {Rare} — Every other turn: gain `1/2/3` Armor
- `G-ST-05` — Rebar Carapace (Gear) [STONE] {Rare} — Exposed: gain `3/5/7` Armor
- `G-ST-06` — Shrapnel Talisman (Gear) [STONE] {Rare} — Whenever you gain Shrapnel (once/turn): gain `1/2/3` Armor
- `G-ST-07` — Crystal Crown (Gear) [STONE] {Heroic} — Battle Start: gain Max HP equal to your starting Armor (cap `12/18/24`)
- `G-ST-08` — Stone Sigil (Gear) [STONE] {Heroic} — End of turn: if you have Armor, gain `1/2/3` Armor

#### SCOUT (10)
- `T-SC-01` — Twin Picks (Tool) [SCOUT] {Common} — `+1/2/3 ATK`; strike 2 times per turn
- `T-SC-02` — Pneumatic Drill (Tool) [SCOUT] {Rare} — `+1/2/3 ATK`; strike 3 times per turn
- `G-SC-01` — Miner Boots (Gear) [SCOUT] {Common} — `+2/3/4 DIG`
- `G-SC-02` — Leather Gloves (Gear) [SCOUT] {Common} — `+1/2/3 ATK, +1 DIG`
- `G-SC-03` — Tunnel Instinct (Gear) [SCOUT] {Rare} — Battle Start: if DIG > enemy DIG, gain `+1/2/3 SPD` (this battle)
- `G-SC-04` — Tunneler Spurs (Gear) [SCOUT] {Rare} — `+1/2/3 SPD`; if you act first on Turn 1, gain `+1/2/3 DIG` (this battle)
- `G-SC-05` — Wall-Sense Visor (Gear) [SCOUT] {Rare} — `+1/2/3 DIG`; Battle Start: if DIG > enemy DIG, gain `+2/3/4` Armor
- `G-SC-06` — Drill Servo (Gear) [SCOUT] {Heroic} — Wounded: gain `+1/2/3` additional strikes (this battle)
- `G-SC-07` — Weak-Point Manual (Gear) [SCOUT] {Heroic} — If DIG > enemy Armor: your strikes ignore `1/2/3` Armor (this battle)
- `G-SC-08` — Gear-Link Medallion (Gear) [SCOUT] {Mythic} — Your On Hit effects trigger twice (once/turn)

#### GREED (10)
- `T-GR-01` — Glittering Pick (Tool) [GREED] {Common} — `+1/2/3 ATK`; On Hit (once/turn): gain 1 Gold
- `T-GR-02` — Gemfinder Staff (Tool) [GREED] {Heroic} — `+1 ATK, +1 ARM, +1 DIG`; first hit each turn triggers all your Shard effects
- `G-GR-01` — Loose Nuggets (Gear) [GREED] {Common} — Start of each Day: gain `3/6/9` Gold
- `G-GR-02` — Lucky Coin (Gear) [GREED] {Common} — Victory: gain `2/4/6` Gold
- `G-GR-03` — Gilded Band (Gear) [GREED] {Rare} — Battle Start: gain Armor equal to `floor(Gold/10)` (cap `2/3/4`)
- `G-GR-04` — Royal Bracer (Gear) [GREED] {Heroic} — Turn Start: convert 1 Gold → `2/3/4` Armor
- `G-GR-05` — Emerald Shard (Gear) [GREED] {Common} — Every other turn (on first hit): heal `1/2/3` HP
- `G-GR-06` — Ruby Shard (Gear) [GREED] {Common} — Every other turn (on first hit): deal `1/2/3` non-weapon damage
- `G-GR-07` — Sapphire Shard (Gear) [GREED] {Common} — Every other turn (on first hit): gain `1/2/3` Armor
- `G-GR-08` — Citrine Shard (Gear) [GREED] {Common} — Every other turn (on first hit): gain `1/2/3` Gold

#### BLAST (10)
- `T-BL-01` — Fuse Pick (Tool) [BLAST] {Common} — `+1/2/3 ATK`; first hit each turn: deal 1 non-weapon damage
- `T-BL-02` — Spark Pick (Tool) [BLAST] {Rare} — `+1/2/3 ATK`; On Hit (once/turn): reduce your highest Countdown by 1
- `G-BL-01` — Small Charge (Gear) [BLAST] {Common} — Countdown(2): deal `8/10/12` to enemy and you (non-weapon)
- `G-BL-02` — Blast Suit (Gear) [BLAST] {Rare} — You ignore damage from your own BLAST items
- `G-BL-03` — Explosive Powder (Gear) [BLAST] {Rare} — Your non-weapon damage deals `+1/2/3`
- `G-BL-04` — Double Detonation (Gear) [BLAST] {Rare} — Second time you deal non-weapon damage each turn: deal `+2/3/4` more
- `G-BL-05` — Bomb Satchel (Gear) [BLAST] {Heroic} — Battle Start: reduce Countdown of all your bomb items by 1 (min 0)
- `G-BL-06` — Kindling Charge (Gear) [BLAST] {Rare} — Battle Start: deal `1/2/3`; your next bomb this battle deals `+3/5/7`
- `G-BL-07` — Time Charge (Gear) [BLAST] {Heroic} — Turn Start: gain `+1/2/3` stored damage (this battle); when Exposed: deal stored damage
- `G-BL-08` — Twin-Fuse Knot (Gear) [BLAST] {Mythic} — Your bomb triggers happen twice

#### FROST (10)
- `T-FR-01` — Rime Pike (Tool) [FROST] {Common} — `+2/3/4 ATK`; On Hit (once/turn): apply 1 Chill
- `T-FR-02` — Glacier Fang (Tool) [FROST] {Rare} — `+2/3/4 ATK`; On Hit (once/turn): apply 1 Chill; if enemy has Chill, gain +1 SPD this turn
- `G-FR-01` — Frost Lantern (Gear) [FROST] {Common} — Battle Start: give enemy `1/2/3` Chill
- `G-FR-02` — Frostguard Buckler (Gear) [FROST] {Rare} — `+6/8/10 ARM`; Battle Start: if enemy has Chill, gain `+2/3/4` Armor
- `G-FR-03` — Cold Snap Charm (Gear) [FROST] {Rare} — If you act first on Turn 1: apply `2/3/4` Chill
- `G-FR-04` — Ice Skates (Gear) [FROST] {Rare} — `+1/2/3 SPD`
- `G-FR-05` — Rime Cloak (Gear) [FROST] {Rare} — `+3/5/7 ARM`; when struck (once/turn): apply 1 Chill to attacker
- `G-FR-06` — Permafrost Core (Gear) [FROST] {Heroic} — Turn Start: if enemy has Chill, gain `1/2/3` Armor
- `G-FR-07` — Cold Front Idol (Gear) [FROST] {Heroic} — Every other turn: apply 1 Chill; if enemy already has Chill, gain +1 SPD this turn
- `G-FR-08` — Deep Freeze Charm (Gear) [FROST] {Heroic} — Wounded: apply `2/3/4` Chill and reduce enemy SPD by 1 (this battle)

#### RUST (10)
- `T-RU-01` — Corrosive Pick (Tool) [RUST] {Common} — `+1/2/3 ATK`; On Hit (once/turn): apply 1 Rust
- `T-RU-02` — Etched Burrowblade (Tool) [RUST] {Rare} — `+2/3/4 ATK, +1/2/3 SPD`; if enemy has Rust, your strikes ignore `1/2/3` Armor
- `G-RU-01` — Oxidizer Vial (Gear) [RUST] {Common} — Battle Start: apply `1/2/3` Rust (if enemy has Armor, apply +1 more)
- `G-RU-02` — Rust Spike (Gear) [RUST] {Rare} — On Hit (once/turn): apply 1 Rust
- `G-RU-03` — Corroded Greaves (Gear) [RUST] {Rare} — `+1/2/3 SPD`; Wounded: apply `2/3/4` Rust
- `G-RU-04` — Acid Phial (Gear) [RUST] {Rare} — Battle Start: reduce enemy Armor by `2/3/4`
- `G-RU-05` — Flaking Plating (Gear) [RUST] {Rare} — `+6/8/10 ARM`; Exposed: apply `2/3/4` Rust to enemy
- `G-RU-06` — Rust Engine (Gear) [RUST] {Heroic} — Turn Start: if enemy has Rust, deal `1/2/3` non-weapon damage
- `G-RU-07` — Corrosion Loop (Gear) [RUST] {Heroic} — On Hit (once/turn): if enemy has Armor, apply +1 additional Rust
- `G-RU-08` — Salvage Clamp (Gear) [RUST] {Common} — Whenever you apply Rust (once/turn): gain 1 Gold

#### BLOOD (10)
- `T-BO-01` — Serrated Drill (Tool) [BLOOD] {Common} — `+1/2/3 ATK`; On Hit (once/turn): apply 1 Bleed
- `T-BO-02` — Reaper Pick (Tool) [BLOOD] {Rare} — `+2/3/4 ATK`; On Hit (once/turn): apply 1 Bleed (if enemy is Wounded, apply +1 Bleed)
- `G-BO-01` — Last Breath Sigil (Gear) [BLOOD] {Common} — One use: first time you would die in battle, prevent it and heal `2/3/4` HP
- `G-BO-02` — Bloodletting Fang (Gear) [BLOOD] {Rare} — Your attacks deal `+1/2/3` damage to Bleeding enemies
- `G-BO-03` — Leech Wraps (Gear) [BLOOD] {Rare} — When enemy takes Bleed damage: heal `1/2/3` HP (once/turn)
- `G-BO-04` — Blood Chalice (Gear) [BLOOD] {Rare} — Victory: heal `3/5/7` HP
- `G-BO-05` — Hemorrhage Hook (Gear) [BLOOD] {Heroic} — Wounded: apply `2/3/4` Bleed
- `G-BO-06` — Execution Emblem (Gear) [BLOOD] {Heroic} — If enemy is Wounded, your first strike each turn deals `+2/3/4` damage
- `G-BO-07` — Gore Mantle (Gear) [BLOOD] {Rare} — First time you become Wounded in battle: gain `4/6/8` Armor
- `G-BO-08` — Vampiric Tooth (Gear) [BLOOD] {Mythic} — Your first hit each turn vs a Bleeding enemy heals 2 HP

#### TEMPO (10)
- `T-TE-01` — Quickpick (Tool) [TEMPO] {Common} — `+1/2/3 ATK, +1/2/3 SPD`
- `T-TE-02` — Chrono Rapier (Tool) [TEMPO] {Heroic} — `+1/2/3 ATK, +2/3/4 SPD`; if you act first on Turn 1, gain `+2/3/4` ATK (this battle)
- `G-TE-01` — Wind-Up Spring (Gear) [TEMPO] {Common} — Turn 1: gain `+1/2/3 SPD` and `+2/3/4` ATK (this battle)
- `G-TE-02` — Ambush Charm (Gear) [TEMPO] {Rare} — If you act first on Turn 1, your first strike deals `+3/5/7` damage
- `G-TE-03` — Counterweight Buckle (Gear) [TEMPO] {Rare} — If enemy acts first on Turn 1, gain `5/7/9` Armor before damage
- `G-TE-04` — Hourglass Charge (Gear) [TEMPO] {Rare} — Turn 5: gain `+2/3/4` ATK and +1 SPD (this battle)
- `G-TE-05` — Initiative Lens (Gear) [TEMPO] {Rare} — `+1/2/3 SPD`; Battle Start: if your SPD > enemy SPD, gain `3/5/7` Armor
- `G-TE-06` — Backstep Buckle (Gear) [TEMPO] {Rare} — If enemy acts first on Turn 1, your first strike deals `+3/5/7` damage
- `G-TE-07` — Tempo Battery (Gear) [TEMPO] {Heroic} — Every other turn: gain `+1/2/3 SPD` (this battle)
- `G-TE-08` — Second Wind Clock (Gear) [TEMPO] {Heroic} — Turn 5: heal `4/6/8` HP and gain +1 SPD (this battle)

---

## 10) Itemsets (12)

Itemsets activate when all required items are equipped.

| Set | Emoji | Required | Bonus |
|---|---|---|---|
| Union Standard | 🧰 | `G-ST-01 + G-ST-02 + G-SC-01` | Battle Start: `+4 Armor, +1 DIG` |
| Shard Circuit | 🔁 | `G-GR-05 + G-GR-06 + G-GR-07 + G-GR-08` | Shards trigger every turn |
| Demolition Permit | 🧾 | `G-BL-01 + G-BL-02 + G-BL-03` | Countdown bombs tick 1 turn faster |
| Fuse Network | 🕸️ | `T-BL-02 + G-BL-05 + G-BL-04` | First non-weapon damage each turn deals +2 |
| Shrapnel Harness | 🛡️ | `G-ST-03 + G-ST-06 + T-ST-01` | Keep up to 3 Shrapnel at end of turn |
| Rust Ritual | ☣️ | `T-RU-01 + G-RU-02 + G-RU-03` | On Hit (once/turn): apply +1 extra Rust |
| Swift Digger Kit | ⚡ | `T-SC-01 + G-SC-01 + G-SC-06` | Battle Start: if DIG > enemy DIG, gain +2 strikes (this battle) |
| Royal Extraction | 🏦 | `G-GR-01 + G-GR-04 + T-GR-02` | Gold→Armor becomes 1→4 |
| Whiteout Initiative | 🧊 | `G-FR-04 + G-FR-03 + G-TE-05` | Battle Start: +1 SPD; if you act first Turn 1, apply +2 Chill |
| Bloodrush Protocol | 🩸 | `T-BO-01 + G-BO-05 + G-TE-01` | Turn 1: apply 2 Bleed; when enemy takes Bleed dmg, gain +1 SPD this turn (once/turn) |
| Corrosion Payload | 💥☣️ | `G-RU-02 + G-BL-03 + G-BL-05` | First time your bomb deals damage each turn: apply 1 Rust |
| Golden Shrapnel Exchange | 🪙🛡️ | `G-GR-04 + G-ST-06 + G-GR-03` | When you convert Gold→Armor: gain +3 Shrapnel (once/turn) |

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

| Enemy | Emoji | T1 | T2 | T3 | Trait |
|---|---|---:|---:|---:|---|
| Tunnel Rat | 🐀 | 5/1/0/3/1 | 7/2/0/4/1 | 9/3/1/5/2 | On Hit (once/turn): steal 1 Gold |
| Cave Bat | 🦇 | 6/1/0/3/1 | 8/2/0/4/1 | 10/3/0/5/2 | Every other turn: restore 1 HP |
| Spore Slime | 🟢 | 8/1/2/0/1 | 11/2/3/0/1 | 14/3/4/0/2 | Battle Start: apply 2 Chill to you |
| Rust Mite Swarm | 🐜 | 6/1/0/3/2 | 9/2/0/4/2 | 12/3/0/5/3 | On Hit (once/turn): apply 1 Rust |
| Collapsed Miner | 🧟 | 10/2/0/1/3 | 14/3/0/2/3 | 18/4/1/3/4 | Wounded: gain +3 ATK (this battle) |
| Shard Beetle | 🪲 | 9/1/3/1/2 | 12/2/4/1/2 | 15/3/5/2/3 | Battle Start: gain 6 Shrapnel |
| Tunnel Warden | 🦀 | 8/2/4/2/2 | 11/3/6/3/2 | 14/4/8/4/3 | First strike each turn: remove 3 Armor from you before damage |
| Burrow Ambusher | 🦂 | 6/3/0/4/2 | 9/4/0/5/2 | 12/5/0/6/3 | Battle Start: deal 3 damage ignoring Armor |
| Frost Wisp | 🧊 | 7/1/0/4/1 | 10/2/0/5/1 | 13/3/0/6/2 | If it acts first on Turn 1: apply 2 Chill |
| Powder Tick | 🧨 | 7/1/0/2/1 | 10/2/0/3/1 | 13/3/0/4/2 | Countdown(2): deal 6 damage to you and itself (non-weapon) |
| Coin Slug | 🐌🪙 | 7/1/2/1/1 | 10/2/3/1/1 | 13/3/4/2/2 | Battle Start: gain Armor equal to floor(your Gold/10) (cap 3) |
| Blood Mosquito | 🦟 | 6/1/0/3/1 | 9/2/0/4/1 | 12/3/0/5/2 | On Hit (once/turn): apply 1 Bleed |

Enemy spawn targets per run (initial tuning):
- Act 1: 36 enemies on map
- Act 2: 40 enemies on map
- Act 3: 44 enemies on map
- Act 4: 48 enemies on map

---

## 12) Points of Interest (POIs)

Some POIs are one-time, others are repeatable utilities.

| ID | Location | Emoji | Rarity | Use | Active | Interaction |
|---|---|---|---|---|---|---|
| L1 | Mole Den | 🏠 | Fixed | Repeatable | Night-only | Skip to Day; restore all HP |
| L2 | Supply Cache | 📦 | Common | One-time | Anytime | Pick 1 of 3 Common Gear (tag-weighted to current week boss weaknesses) |
| L3 | Tool Crate | 🧰 | Uncommon | One-time | Anytime | Pick 1 of 3 Tools (tag-weighted) |
| L4 | Tool Oil Rack | 🛢️ | Common | Repeatable (per tool) | Anytime | Modify current tool: +1 ATK or +1 SPD or +1 DIG (once per tool) |
| L5 | Rest Alcove | 🕯️ | Common | One-time | Night-only | Skip to Day; heal 10 HP |
| L6 | Survey Beacon | 📡 | Common | One-time | Anytime | Reveal tiles in radius 13 |
| L7 | Seismic Scanner | 📍 | Uncommon | One-time | Anytime | Choose a POI category → reveal nearest instance |
| L8 | Rail Waypoint | 🚇 | Uncommon | Repeatable | Anytime | Fast travel between discovered waypoints |
| L9 | Smuggler Hatch | 🕳️ | Uncommon | Repeatable | Anytime | Shop: 1 Tool + 5 Gear; reroll costs Gold |
| L10 | Rusty Anvil | ⚒️ | Uncommon | One-time | Anytime | Upgrade Tool tier (I→II costs 8 Gold; II→III costs 16 Gold) |
| L11 | Rune Kiln | 🏺 | Rare | Repeatable | Anytime | Fuse 2 identical items → upgrade tier (II/III); no gold cost |
| L12 | Geode Vault | 💠 | Rare | One-time | Anytime | Pick 1 of 3 Heroic items (tag-weighted) |
| L13 | Counter Cache | 🎯 | Uncommon | One-time | Anytime | Pick 1 of 3 items drawn only from the 2 weakness tags of the current week boss |
| L14 | Scrap Chute | 🗑️ | Uncommon | One-time | Anytime | Destroy 1 Gear item (no reward). Costs Gold (by act). |

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

Act 3 (Biome A+):
- Same core utilities
- L13 (Week 3) 30%
- L5 x1, L14 x1

Act 4 (Biome B+):
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
- 4 acts of 20 stages: A / B / A+ / B+.
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
- Act 3 (A+): Week 1/2 bosses +1 ATK baseline; Week 3 finals +2 ATK baseline.
- Act 4 (B+): Week 1/2 bosses +1 ATK +1 SPD baseline; Week 3 finals +2 ATK +1 SPD baseline.

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

---

## 16) Implementation Checklist (execute next)

1. Move all items/enemies/bosses/POIs into data tables (TypeScript/JSON) keyed by IDs.
2. Implement dig action and dig cost formula (`max(2, 6-DIG)`).
3. Implement combat engine with deterministic ordering + sudden death + turn cap resolution.
4. Implement status effects exactly as defined (Chill/Shrapnel/Rust/Bleed) with deterministic stack handling.
5. Implement item offer generation:
   - rarity table (by POI and act)
   - tag weighting (boss weaknesses)
6. Implement campaign stage config:
   - act mapping (A/B/A+/B+)
   - boss schedule (stage-determined)
   - act+ modifiers
7. Add minimal telemetry for balancing:
   - stage winrate, boss winrate, average fights per run, gold earned/spent, item pick rates.
