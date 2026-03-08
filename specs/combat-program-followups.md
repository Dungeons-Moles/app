# Combat Program Follow-ups

This file logs structural combat/data changes made in the app that were ported to
`../solana-programs`.

It intentionally excludes replay-only and UI-only adjustments.

## Program Status

The Rust-side parity port is now implemented for the combat-rule changes below in
`../solana-programs`.

Implemented in the programs:

- `combat-system`
  - added `RemoveOwnArmor`
  - implemented real `GoldToArmor` ratio conversion in combat execution
  - added a real `COUNTDOWN` phase to the combat loop
  - extended `CombatLogEntry` with authoritative `source` and `contributions`
  - threaded source attribution through combat execution, status/reflection handling, and strike logging
  - fixed `ApplyReflection` to be self-targeting instead of opponent-targeting
  - implemented late-applied `Chill` preservation through turn end
  - implemented `Crystal Mimic` reflection-depletion `Glass Heart` damage
  - implemented `Mad Miner` temporary turn-1 exposed behavior
  - implemented `Powder Keg Baron` `Short Fuse`
  - implemented `Eldritch Mole` threshold-gated boss phases
  - implemented `Rusted Chronomancer` turn-1-only extra strike
- `boss-system`
  - `Obsidian Golem` now maps to `OnDealNonWeaponDamage -> RemoveOwnArmor(2)`
  - `Crystal Mimic` battle start reflection now maps to `ApplyReflection(2)` instead of a placeholder
  - `Powder Keg Baron` countdown now has explicit self-damage and enemy non-weapon damage entries
  - `Greedkeeper` steal amount updated from `8` to `16`
  - `The Gilded Devourer` trait ratio constant updated from `6` to `3`
  - `The Frostbound Leviathan` SPD gain now maps to `FirstTimeExposed`
- `boss-system` trait conversion now maps the simple conditional cases that were previously being dropped:
  - `PlayerDigLessThan -> DigGreaterThanEnemyDig`
  - `PlayerExposed -> EnemyHasNoArmor`
- `gameplay-state`
  - boss fights now resolve through the boss-aware combat entrypoint, so these boss rules are actually used in session gameplay
- `player-inventory`
  - added annotated effect generators with source attribution for tool, gear, and itemset effects
- `field-enemies`
  - enemy combat inputs and traits now carry authoritative enemy combat sources

There are no remaining program-side combat parity items pending from this document.

## Structural Changes To Port

### 1. Combat log source attribution

The app combat layer now supports attaching an explicit source to combat events so the replay can know what caused an action.

Target model:

- `source.kind`
  - `tool`
  - `gear`
  - `itemset`
  - `enemy`
  - `boss`
  - `status`
- `source.id`
- optional `source.name` on the app side only

This should be added to the authoritative combat log format in the programs so on-chain replay does not need frontend inference.

Examples:

- basic attack attributed to equipped tool
- armor gain from `Coin Slug` attributed to enemy trait
- status applications attributed to the effect source
- non-weapon retaliation like `Shrapnel` attributed to `status:shrapnel`

### 2. Aggregated event contributions

The app combat layer now supports keeping one aggregated combat event while also attaching a compact contribution breakdown.

Target model:

- event remains aggregated
  - example: one `ATTACK` with total `damage` and `armorLost`
- optional `contributions[]`
  - each contribution includes:
    - `source`
    - `value`

This is meant for cases like:

- one strike total = `3`
- contributions:
  - tool `+2`
  - gear `+1`

This should be implemented in the programs as metadata on the event, not by exploding one strike into multiple full combat log entries.

### 3. Countdown trigger phase

The local parity combat engine was corrected to include a real `COUNTDOWN` phase each turn before attacks.

Required behavior:

- `Trigger.Countdown(n)` fires on turns divisible by `n`
- the countdown phase runs after turn start effects and before attack resolution

This was needed to make effects like `Powder Tick` trigger correctly on turn `3`.

### 3.1. OnDealNonWeaponDamage trigger must fire for reactive effects

The parity engine was corrected to actually fire `OnDealNonWeaponDamage` follow-up triggers after non-weapon damage resolves.

Required behavior:

- when an effect deals non-weapon damage,
- the target/owner effects that listen to `OnDealNonWeaponDamage` must be evaluated immediately after that damage resolves

This is required for reactive effects such as:

- `Blast Suit`
- `Corrosion Payload`
- boss traits like `Obsidian Golem`

Program note:

- the Rust combat crate already has `OnDealNonWeaponDamage`
- verify every caller/trait definition is using that trigger correctly

### 4. Chill does not deal direct strike damage

The local parity combat engine had a bug where `Chill` was being treated like bonus direct damage during normal attacks. That was corrected.

Required behavior:

- `Chill` does not directly create an extra damage instance during a normal strike
- `Chill` affects strike count and any explicit status interactions only

This matters for cases like `Frost Wisp` and `Rime Pike`, where the target should not take a separate extra HP hit just because `Chill` exists.

### 5. Chill persistence when applied after target already acted

This is a real rule change from the earlier parity behavior.

New required behavior:

- if a combatant receives `Chill` after they already completed their attack phase for that turn,
- those newly applied `Chill` stacks are preserved through that turn end,
- so they still affect that combatant on the next turn

Reason:

- without this, `1 Chill` applied after a target already acted is usually meaningless because it decays away before the next turn
- this made frost/control effects too speed-dependent

Implementation note:

- the parity engine tracks this as preserved fresh chill applied after `actedThisTurn`
- turn-end chill decay excludes those newly applied late stacks from the same-turn decay pass

### 6. Obsidian Golem trait mapping is wrong in current program/frontend definitions

Observed mismatch:

- boss text says: `Taking non-weapon damage removes 2 Armor after damage`
- current older mappings used an `OnHit`/`Exposed` style behavior instead

Required behavior:

- `Obsidian Golem` should use `OnDealNonWeaponDamage`
- effect should be `RemoveArmor(2)`
- it should happen after the non-weapon damage resolves
- it should not depend on an unrelated exposed/player-exposed condition

Program note:

- current Rust definition in `../solana-programs/crates/boss-system/src/traits.rs` appears to still be wrong and should be corrected later

### 7. Combat effect schema needs self-armor removal

The shared combat effect model currently distinguished only:

- remove enemy armor

But boss/self-reactive traits can require:

- remove owner armor

Concrete case:

- `Obsidian Golem` takes non-weapon damage
- after that damage resolves, it should lose `2` of its own armor

App-side fix:

- added `RemoveOwnArmor` to the local combat effect schema

Program implication:

- the Solana combat effect schema likely also needs an equivalent self-targeted armor removal effect, unless boss-system/combat-system already has another clean authoritative way to express this

### 8. Mad Miner battle-start expose trait is currently a no-op

Observed mismatch:

- `Mad Miner` trait text says:
  - if player `DIG < boss DIG`, player is exposed for turn 1
  - on first turn, if player is exposed, boss gains `+1 strike`
- current older definitions used `RemoveArmor(0)` at battle start, which does nothing

Correct required behavior:

- this should be a temporary turn-1 exposed state, not permanent armor destruction
- turn-1 incoming attacks should bypass player armor
- after turn 1, player armor should still be there
- boss first-turn extra strike should trigger from the same `boss DIG > player DIG` check

App-side correction:

- parity engine now applies a turn-scoped exposed override for the player on turn 1 when `boss DIG > player DIG`
- extra strike uses the same DIG comparison directly

Program note:

- current Rust definition in `../solana-programs/crates/boss-system/src/traits.rs` also appears to use `RemoveArmor(0)` for this trait
- that likely needs to be changed there as well

### 9. Reflection behavior must be implemented in local/program effect execution

Required behavior, matching the Rust combat tests:

- if a target has `Reflection > 0`
- and receives a reflectable status effect
  - `Chill`
  - `Rust`
  - `Bleed`
- that status is reflected back to the source instead
- one reflection stack is consumed immediately
- `ApplyReflection` itself is not reflected

App-side correction:

- local parity effect execution now reflects those status applications and consumes reflection immediately

Program note:

- Rust combat crate already has explicit reflection logic in `crates/combat-system/src/triggers.rs`
- keep local behavior aligned to that authoritative path

### 10. Crystal Mimic "Glass Heart" is still a placeholder mechanically

Observed issue:

- trait text says `After reflection is gone, takes +2 non-weapon damage`
- both app and Rust-side boss definitions were using a placeholder-style extra non-weapon effect instead of a clear authoritative mechanic

App-side action:

- removed the bogus local placeholder effect so it no longer produces incorrect startup behavior

Program follow-up:

- chosen local interpretation:
  - when the last reflection stack is consumed, `Crystal Mimic` immediately takes `2` non-weapon damage
- implement that same rule authoritatively in `../solana-programs`

### 11. Powder Keg Baron countdown and Short Fuse were mis-modeled

Required behavior:

- `Countdown(3)` should deal `8` non-weapon damage to the player and to the boss itself
- `Short Fuse` should reduce the active countdown timing by `1` after the boss becomes wounded

App-side corrections:

- parity boss data now uses:
  - `DealNonWeaponDamage(8)`
  - `DealSelfNonWeaponDamage(8)`
- parity countdown processing now supports persistent countdown acceleration from `ReduceAllCountdowns`

Program note:

- current Rust boss trait definition in `../solana-programs/crates/boss-system/src/traits.rs` appears to still model the countdown as a single `DealDamage(8)` plus a placeholder-style wounded modifier
- that likely needs to be corrected there as well

### 12. Greedkeeper steal amount and trait text were inconsistent

Observed mismatch:

- stealing up to `8` gold does not align well with `stolenGold/4 (cap 4)`
- the intended steal cap should be `16`

App-side correction:

- `Greedkeeper` now steals up to `16` gold at battle start
- trait copy now says `stolenGold/4` instead of `floor(stolenGold/4)`

Program note:

- current Rust boss trait definition in `../solana-programs/crates/boss-system/src/traits.rs` still appears to use `8`
- update the program-side value and any related trait copy/metadata there as well
- also verify `GoldToArmor` for this boss is computed from the amount actually stolen, not just current owner gold

### 13. Eldritch Mole phase traits must be threshold-gated, not always-on

Observed mismatch:

- current local parity mapping made all three Eldritch Mole phase effects active from turn 1
- current Rust boss trait encoding also appears to expose these as plain `TurnStart` phase-tagged traits

Required behavior:

- 75% threshold: one-time `+6 Armor`
- 50% threshold: one-time `+1 strike`
- 25% threshold: from then on, `Turn Start: apply 2 Bleed`

App-side correction:

- local parity engine now handles Eldritch Mole phases explicitly on HP threshold crossing
- unconditional generic boss effects for this boss were removed from the parity effect table

Program note:

- verify the Rust boss/combat integration actually gates these by threshold crossing rather than treating them as always-on turn-start effects

### 14. Gilded Devourer gold-to-armor ratio/cap changed and needs a proper capped model

Required behavior:

- `The Gilded Devourer` converts opponent/player gold at battle start into its own armor
- ratio is `+1 Armor per 3 Gold`
- cap is `12`

App-side correction:

- local parity boss data now uses ratio `3`
- local parity executor caps this boss at `12`
- local parity executor uses opponent gold for this boss’s battle-start conversion
- `GoldToArmor` now uses the amount actually stolen when a steal happened earlier in the same effect batch, otherwise it falls back to current owner gold

Program note:

- current Rust trait data appears to still use the older ratio/cap
- the Solana combat model likely needs an authoritative capped gold-to-armor representation for this boss instead of relying on a local special-case

### 15. Frostbound Leviathan exposed trait should be one-shot

Required behavior:

- when `The Frostbound Leviathan` becomes exposed, it should:
  - remove all Chill from itself
  - gain `+2 SPD`
- this should happen once on the exposed transition, not every turn while it remains exposed

App-side correction:

- local parity now handles this as an explicit one-shot exposed transition for this boss
- the generic repeating `Exposed -> GainSpd` mapping was removed from parity boss effects

Program note:

- verify the Rust boss/combat integration also treats this as an edge trigger, not a repeated state check

### 16. Rusted Chronomancer first-turn extra strike must be temporary

Observed mismatch:

- `First Turn: strikes twice` was being modeled like a permanent `+1 strike`
- that caused the boss to keep attacking twice every turn

Required behavior:

- the extra strike applies on turn 1 only
- it should not permanently change later turns

App-side correction:

- local parity now applies this as a turn-scoped extra strike on turn 1
- the generic permanent `FirstTurn -> GainStrikes` mapping was removed for this boss

Program note:

- verify the Rust boss/combat integration also treats this as turn-1-only, not as a persistent strikes mutation

## Confirmed Existing Rules

These were validated during testing/audit and should remain true in the programs unless intentionally redesigned.

### Shrapnel

- retaliation damage equals current `Shrapnel` stacks
- retaliation is non-weapon damage
- retaliation goes directly to HP, not armor
- under the current combat rules, `Shrapnel` is not consumed per hit
- it persists through the turn and clears at turn end unless a preservation effect exists

### Multi-strike weapons

Under the current combat rules, each strike reuses the full current ATK pool.

Example:

- `Twin Picks` + `Leather Gloves`
- both strikes use the weapon ATK plus the gloves ATK

This is current intended behavior unless combat design changes later.

## UI-Only Changes That Should NOT Be Ported As Combat Rules

These were made only to improve replay readability in the frontend and are not authoritative combat semantics:

- immediate visual decay/clearing of status badges when their popup appears
- replay timing changes between floating numbers
- suppression of effect-name text popups like enemy names
- combined or staggered popup presentation for armor/HP splits
