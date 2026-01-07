<!--
Sync Impact Report
==================
Version change: 0.0.0 → 1.0.0
Bump rationale: Initial constitution ratification (MAJOR)

Added principles:
- P01: Explicit State Machines
- P02: No Clever Abstractions
- P03: Readable & Deterministic Logic
- P04: Seed-Driven Procedural Generation
- P05: Deterministic Combat Resolution
- P06: Mobile-First Performance (60 FPS)
- P07: Bounded Memory & No Leaks
- P08: Strict UI Fidelity
- P09: Consistent Iconography & Tooltips
- P10: Comprehensive Unit Testing
- P11: RNG Determinism Testing
- P12: Centralized Input Handling
- P13: Structured Combat Logging
- P14: No Invention Rule
- P15: Debug Tooling Isolation

Added sections:
- Definition of Done (checklist)

Templates requiring updates:
- .specify/templates/plan-template.md ✅ (Constitution Check section compatible)
- .specify/templates/spec-template.md ✅ (No changes needed)
- .specify/templates/tasks-template.md ✅ (Test phase structure compatible)

Follow-up TODOs: None
-->

# Dungeons & Moles Constitution

A mobile-first Solana auto-battler dungeon crawler inspired by "He is Coming". This constitution defines non-negotiable principles for code quality, determinism, performance, and UX consistency.

## Core Principles

### P01: Explicit State Machines

Game phases (exploration, combat, menu, boss) MUST be implemented as explicit state machines with clearly defined states, transitions, and guards. No implicit state management via scattered boolean flags or conditional chains.

**Rationale**: State machines make game flow predictable, debuggable, and testable. They prevent invalid state combinations and make phase transitions auditable.

### P02: No Clever Abstractions

Prefer straightforward, verbose code over clever abstractions. Three similar lines of code are better than a premature helper. Do not create generic "managers", "handlers", or "controllers" unless the pattern repeats identically in 3+ places.

**Rationale**: Game logic must be readable by any developer without hunting through abstraction layers. Debugging time matters more than DRY purity.

### P03: Readable & Deterministic Logic

All game logic MUST be pure functions where possible: same inputs produce same outputs. Side effects MUST be isolated to explicit boundaries (state commits, renders, network calls). Combat calculations, status effect applications, and damage formulas MUST NOT depend on execution order, timing, or external state.

**Rationale**: Deterministic logic enables replay systems, testing, and debugging. Non-determinism causes unreproducible bugs.

### P04: Seed-Driven Procedural Generation

All procedural generation (dungeon layouts, enemy spawns, loot drops, POI placement) MUST be driven by a seed value. Given the same seed, the same run MUST be reproduced exactly.

**Rationale**: Reproducibility enables bug reports, testing edge cases, and replay features. Seeds must be exposed in dev builds.

### P05: Deterministic Combat Resolution

Combat outcomes MUST be fully deterministic given: initial state, player equipment, enemy stats, and the RNG seed. The same combat setup with the same seed MUST produce identical results across runs, platforms, and time.

**Rationale**: Players must trust that combat is fair. QA must reproduce exact combat scenarios. Replays must be verifiable.

### P06: Mobile-First Performance (60 FPS)

Target 60 FPS on Solana Seeker hardware during exploration and combat. Rendering and game logic MUST NOT drop below 30 FPS under any normal gameplay condition. Profile before optimizing; measure after changes.

**Rationale**: Frame drops break immersion and can cause missed inputs. Mobile devices have limited thermal headroom.

**Constraints**:
- Minimize React re-renders via proper memoization
- Avoid heavy libraries (moment.js, lodash full builds)
- Batch state updates where possible
- Use Skia canvas efficiently; avoid per-frame allocations

### P07: Bounded Memory & No Leaks

No unbounded arrays, logs, or caches. Combat logs MUST have a maximum length (e.g., 100 entries). Entity pools MUST be bounded. All subscriptions and timers MUST be cleaned up on unmount.

**Rationale**: Mobile devices have limited RAM. Unbounded growth causes crashes and performance degradation over long sessions.

### P08: Strict UI Fidelity

The UI MUST strictly adhere to the provided landscape layout specification. Do not add, remove, or reposition UI panels beyond what the spec defines. If the spec is ambiguous, document the assumption and choose the option closest to "He is Coming".

**Rationale**: UI consistency builds muscle memory. Unexpected layouts confuse players and break immersion.

### P09: Consistent Iconography & Tooltips

Use emoji + accent color for all icons as specified. Every boss and item MUST have a tooltip accessible on long-press (touch) or hover (web). Tooltip content MUST match spec descriptions exactly.

**Rationale**: Visual consistency aids recognition. Tooltips reduce cognitive load and teach mechanics.

### P10: Comprehensive Unit Testing

Unit tests are REQUIRED for:
- Combat resolution (damage, crits, misses)
- Status effect rules (Chill, Shrapnel, Rust application, stacking, duration)
- Time/week progression (day/night cycles, boss triggers)
- Inventory slot growth logic
- POI interaction outcomes

Tests MUST use deterministic seeds and fixed inputs. No mocks for core game logic.

**Rationale**: Game rules are complex and interact. Tests catch regressions and serve as executable documentation.

### P11: RNG Determinism Testing

Every test involving randomness MUST use a fixed seed. Test suites MUST include determinism checks: running the same scenario twice with the same seed MUST produce identical results.

**Rationale**: Flaky tests waste time. Determinism testing catches accidental non-determinism early.

### P12: Centralized Input Handling

All player input (touch, D-pad overlay, keyboard for web dev) MUST flow through a single input handler module. Input state MUST be testable without UI. Beta builds MUST support:
- On-screen D-pad for touch
- Keyboard arrows/WASD for web development

**Rationale**: Centralized input enables input replay, testing, and consistent behavior across input methods.

### P13: Structured Combat Logging

Combat events MUST be logged to a structured, typed combat log (not console.log). Log entries MUST include: turn number, actor, action, target, result, and RNG values used. Log length MUST be capped (max 100 entries, oldest evicted).

**Rationale**: Structured logs enable debugging, replay validation, and player-facing combat history.

### P14: No Invention Rule

Do NOT add mechanics, statuses, items, enemies, bosses, or UI panels beyond what the spec explicitly defines. If the spec is ambiguous:
1. Choose the option closest to "He is Coming" behavior
2. Document the assumption in code comments and spec clarifications
3. Flag for product review

**Rationale**: Scope creep kills projects. Feature parity with the reference game is the goal, not innovation.

### P15: Debug Tooling Isolation

Dev-only debug overlays (seed display, state inspector, FPS counter) are allowed but MUST:
- Be toggled via dev-only flags (not affecting production builds)
- NOT affect gameplay logic or RNG sequences
- NOT consume resources when disabled

**Rationale**: Debug tools must not introduce Heisenbugs or affect production performance.

## Definition of Done

A feature or task is complete when ALL of the following are true:

### Code Quality
- [ ] State machines are explicit with defined states and transitions
- [ ] No clever abstractions introduced; code is readable without context
- [ ] All game logic is deterministic (same inputs = same outputs)
- [ ] No unbounded arrays, logs, or caches

### Testing
- [ ] Unit tests written for all combat resolution paths
- [ ] Unit tests written for all status effects (Chill, Shrapnel, Rust)
- [ ] Unit tests use fixed seeds; determinism verified
- [ ] All tests pass locally and in CI

### Performance
- [ ] Tested on target device (Solana Seeker or equivalent)
- [ ] Maintains 60 FPS during exploration and combat
- [ ] No memory leaks (subscriptions, timers cleaned up)
- [ ] No per-frame allocations in hot paths

### UX Consistency
- [ ] UI matches spec layout exactly (landscape orientation)
- [ ] Iconography uses emoji + accent as specified
- [ ] Tooltips present on all bosses and items
- [ ] Transitions between scenes are predictable

### Input & Accessibility
- [ ] Input flows through centralized handler
- [ ] On-screen D-pad functional on touch
- [ ] Keyboard controls functional for web dev

### Determinism
- [ ] Procedural generation uses seed; same seed = same result
- [ ] Combat outcomes reproducible with same seed
- [ ] RNG values logged in combat log for verification

### Spec Compliance
- [ ] No mechanics, items, or UI added beyond spec
- [ ] Ambiguities documented with "He is Coming" reference
- [ ] Debug overlays do not affect gameplay logic

## Governance

This constitution supersedes all other practices for the Dungeons & Moles project. Amendments require:

1. Written proposal documenting the change and rationale
2. Review of impact on existing code and tests
3. Update to this document with version increment
4. Migration plan for any non-compliant code

All pull requests MUST verify compliance with these principles. Reviewers SHOULD use the Definition of Done checklist.

**Version**: 1.0.0 | **Ratified**: 2026-01-06 | **Last Amended**: 2026-01-06
