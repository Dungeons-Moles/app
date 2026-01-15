# Implementation Plan: GDD Mechanics Update

**Branch**: `003-gdd-mechanics-update` | **Date**: 2026-01-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-gdd-mechanics-update/spec.md`

## Summary

Comprehensive update to align game mechanics with GDD v0.1: expand item system to 80 items across 8 tags with tier scaling, implement complete field enemy roster (12 archetypes × 3 tiers), add all bosses from both biomes, implement 14 POI types with correct behaviors, add 12 itemsets, implement Bleed status effect (joining existing Chill, Shrapnel, Rust), replace emoji rendering with image-based sprites, and remove entity border squares from map.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: React Native, Expo, @shopify/react-native-skia (2.2.12) for canvas rendering
**Storage**: In-memory game state (no persistence for this feature set)
**Testing**: Jest with ts-jest, coverage from `src/game/**/*.ts`
**Target Platform**: Mobile (Solana Seeker hardware baseline), iOS/Android via Expo
**Project Type**: Mobile game (React Native)
**Performance Goals**: 60 FPS during exploration and combat
**Constraints**: Bounded memory (<100 combat log entries), deterministic combat, seeded RNG
**Scale/Scope**: 80 items, 36 enemies (12×3), 16 bosses, 14 POIs, 12 itemsets

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| P01: Explicit State Machines | ✅ PASS | Existing state machine (`state-machine.ts`) handles phase transitions; no new states needed |
| P02: No Clever Abstractions | ✅ PASS | Data-driven approach using static definitions in `src/data/`; no new abstraction layers |
| P03: Readable & Deterministic Logic | ✅ PASS | Existing pure functions in combat resolver; new status effect (Bleed) follows same pattern |
| P04: Seed-Driven Procedural Generation | ✅ PASS | Existing SeededRNG used for all item/enemy/boss selection |
| P05: Deterministic Combat Resolution | ✅ PASS | Combat resolver is already deterministic; new effects integrate into existing flow |
| P06: Mobile-First Performance (60 FPS) | ⚠️ VERIFY | Image loading needs performance validation; use Skia image caching |
| P07: Bounded Memory & No Leaks | ✅ PASS | No new subscriptions or unbounded arrays; combat log already capped |
| P08: Strict UI Fidelity | ✅ PASS | No UI layout changes; only entity rendering changes (emoji→image) |
| P09: Consistent Iconography & Tooltips | ✅ PASS | All items/bosses from GDD get tooltips; image assets already exist |
| P10: Comprehensive Unit Testing | ✅ REQUIRED | Tests required for all new status effects, enemy traits, boss abilities |
| P11: RNG Determinism Testing | ✅ REQUIRED | All new randomized selection must use seeded RNG |
| P12: Centralized Input Handling | ✅ N/A | No input changes required |
| P13: Structured Combat Logging | ✅ PASS | Existing log structure supports new status effects |
| P14: No Invention Rule | ✅ PASS | All mechanics from GDD v0.1; no new inventions |
| P15: Debug Tooling Isolation | ✅ N/A | No new debug tooling |

**Gate Result**: PASS - Proceed to Phase 0

## Project Structure

### Documentation (this feature)

```text
specs/003-gdd-mechanics-update/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── data/                # Static data definitions (EXPAND)
│   ├── gear.ts          # 80 items (was 29)
│   ├── itemsets.ts      # 12 itemsets (was 8)
│   ├── bosses.ts        # 16 bosses (was 7)
│   ├── pois.ts          # 14 POIs (was 12)
│   └── enemies.ts       # NEW: 12 archetypes × 3 tiers
├── game/
│   ├── combat/
│   │   ├── status-effects.ts  # ADD Bleed effect
│   │   ├── damage.ts          # Update for Bleed
│   │   └── resolver.ts        # Integrate new items/effects
│   ├── entities/
│   │   ├── enemies.ts         # Expand enemy definitions
│   │   └── player.ts          # Add DIG stat usage
│   └── map/
│       └── generator.ts       # POI spawning updates
├── components/game/
│   └── MapRenderer.tsx        # Image-based rendering
└── assets/
    ├── field-enemies/   # 12 enemy images
    ├── bosses/          # 16 boss images
    ├── POIs/            # 14 POI images
    └── characters/      # Player image

__tests__/
├── unit/
│   ├── combat/
│   │   ├── status-effects.test.ts   # Add Bleed tests
│   │   └── resolver.test.ts         # Expand for new items/traits
│   └── data/
│       ├── items.test.ts            # 80 item validation
│       ├── enemies.test.ts          # Enemy trait tests
│       └── bosses.test.ts           # Boss ability tests
└── integration/
    └── combat-flow.test.ts          # Full combat with new mechanics
```

**Structure Decision**: Extend existing mobile project structure. No new directories needed except `/src/data/enemies.ts` for field enemy definitions (currently inline in enemies.ts under game/entities).

## Complexity Tracking

> No constitution violations requiring justification.

| Aspect | Approach | Rationale |
|--------|----------|-----------|
| 80 items | Single data file with tagged structure | Matches existing `gear.ts` pattern |
| Image loading | Skia useImage with caching | Required for 60 FPS per P06 |
| Enemy traits | Pure functions in resolver | Matches existing boss trait pattern |
