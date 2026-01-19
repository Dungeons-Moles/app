# Implementation Plan: Guest Mode Login & Movement Tracking

**Branch**: `006-guest-mode-movement` | **Date**: 2026-01-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-guest-mode-movement/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Enable users to play the game without wallet connection (guest mode) and integrate on-chain movement tracking for connected users via the existing burner wallet infrastructure. Guest mode provides frictionless onboarding with random seeds and no blockchain transactions, while connected users get verifiable gameplay via fire-and-forget movement tracking.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: React Native, Expo, @coral-xyz/anchor, @solana/web3.js
**Storage**: In-memory game state (no persistence), expo-secure-store for burner wallet
**Testing**: Jest (npm test), unit tests for game logic with fixed seeds
**Target Platform**: Mobile (Android/iOS via Expo), Web for development
**Project Type**: Mobile React Native application
**Performance Goals**: 60 FPS during exploration and combat (P06 constitution requirement)
**Constraints**: Movement tracking must be non-blocking (fire-and-forget), guest mode must skip all blockchain transactions
**Scale/Scope**: Single-player mobile game, ~15 screens, existing burner wallet and session infrastructure

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Requirement | Status | Notes |
|-----------|------------|--------|-------|
| P01: Explicit State Machines | Game phases managed via state machine | ✅ PASS | Guest mode uses existing `mode` state in ProfileContext ('online' \| 'cached' \| 'guest') |
| P02: No Clever Abstractions | Straightforward code over abstractions | ✅ PASS | Simple mode checks, no new abstractions needed |
| P03: Readable & Deterministic Logic | Pure functions, isolated side effects | ✅ PASS | Movement tracking is fire-and-forget side effect at explicit boundary |
| P04: Seed-Driven Procedural Generation | All generation driven by seeds | ✅ PASS | Guest mode uses `Math.random()` for random seed generation (not `SeededRNG` - seed source only) |
| P06: Mobile-First Performance (60 FPS) | Maintain 60 FPS | ✅ PASS | Fire-and-forget calls don't block render loop |
| P07: Bounded Memory & No Leaks | No unbounded arrays/caches | ✅ PASS | No new state storage required |
| P10: Comprehensive Unit Testing | Tests for game logic | ✅ PASS | Movement tracking integration testable via mocks |
| P14: No Invention Rule | No features beyond spec | ✅ PASS | Implementing exactly spec requirements |
| P15: Debug Tooling Isolation | Dev tools don't affect gameplay | N/A | No debug tooling in this feature |

## Project Structure

### Documentation (this feature)

```text
specs/006-guest-mode-movement/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── contexts/
│   ├── ProfileContext.tsx    # Add loginAsGuest(), mode state (EXISTS - modify)
│   └── SessionContext.tsx    # movePlayer() for on-chain tracking (EXISTS - use as-is)
├── screens/
│   ├── AccountScreen.tsx     # Add "Play as Guest" button (EXISTS - modify)
│   ├── HubScreen.tsx         # Conditional UI based on guest mode (EXISTS - modify)
│   └── GameScreen.tsx        # Movement tracking integration (EXISTS - modify)
├── hooks/
│   └── useGameplayState.ts   # movePlayer integration (EXISTS - use as-is)
└── game/
    └── engine/
        └── game-reducer.ts   # MOVE action handling (EXISTS - read-only reference)

__tests__/
├── unit/
│   └── contexts/
│       └── ProfileContext.test.ts  # Guest mode tests (CREATE)
└── integration/
    └── guest-mode.test.ts          # E2E guest flow tests (CREATE)
```

**Structure Decision**: Mobile React Native application with existing context-based architecture. This feature modifies existing contexts and screens rather than introducing new structural patterns. All changes align with the established reducer + context pattern.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations - all constitution checks pass. This feature uses existing patterns without introducing new complexity.

## Post-Design Constitution Re-evaluation

*Completed after Phase 1 design artifacts.*

| Principle | Post-Design Status | Validation |
|-----------|-------------------|------------|
| P01 | ✅ CONFIRMED | Design uses existing `mode` state machine pattern |
| P02 | ✅ CONFIRMED | No new abstractions in data-model.md or contracts |
| P03 | ✅ CONFIRMED | Movement tracking isolated as explicit side effect |
| P04 | ✅ CONFIRMED | Guest mode seed generation documented in research.md R5 |
| P06 | ✅ CONFIRMED | Fire-and-forget pattern documented in contracts |
| P07 | ✅ CONFIRMED | No new storage in data-model.md |
| P10 | ✅ CONFIRMED | Test structure defined in project structure |
| P14 | ✅ CONFIRMED | Design matches spec exactly - no additions |

All gates passed. Ready for task generation via `/speckit.tasks`.

## Generated Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Implementation Plan | `specs/006-guest-mode-movement/plan.md` | ✅ Complete |
| Research | `specs/006-guest-mode-movement/research.md` | ✅ Complete |
| Data Model | `specs/006-guest-mode-movement/data-model.md` | ✅ Complete |
| Internal API Contract | `specs/006-guest-mode-movement/contracts/internal-api.md` | ✅ Complete |
| Quickstart Guide | `specs/006-guest-mode-movement/quickstart.md` | ✅ Complete |
| Agent Context | `CLAUDE.md` | ✅ Updated |
