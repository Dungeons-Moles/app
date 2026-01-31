# Implementation Plan: Solana Program Instructions Integration

**Branch**: `008-solana-program-instructions` | **Date**: 2026-01-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-solana-program-instructions/spec.md`

## Summary

Integrate the frontend app with the full set of deployed Solana programs by updating IDL files, extending program service modules, and wiring POI interaction instructions. The existing codebase already has working instruction callers for `initialize_profile`, `start_session`, `move_player`, and `record_run_result`, but they are built against outdated IDL files (4 of 8 programs). The `move_player` instruction now auto-triggers combat, boss fights, phase transitions, and session endings on-chain — requiring the frontend to parse a richer set of transaction events rather than calling those instructions separately. POI interactions are the only fully unimplemented instruction category.

## Technical Context

**Language/Version**: TypeScript 5.9.2 (React Native / Expo 54.0)
**Primary Dependencies**: @solana/web3.js 1.98.4, @coral-xyz/anchor 0.32.1, React Native 0.81.5, Shopify React Native Skia
**Storage**: AsyncStorage (profile cache), Expo SecureStore (burner wallet keys)
**Testing**: Jest with ts-jest
**Target Platform**: iOS, Android (React Native), Web (Expo)
**Project Type**: Mobile app
**Performance Goals**: 60 FPS during gameplay (P06), <3s per move round-trip (SC-003)
**Constraints**: Transaction size ≤ 1232 bytes, burner wallet auto-signing, offline-capable with sync queue
**Scale/Scope**: 6 on-chain programs, 14 POI types, ~30 instruction types total

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| P01: Explicit State Machines | PASS | Session lifecycle (idle→funding→active→draining) already explicit in SessionContext. POI interaction states will follow same pattern. |
| P02: No Clever Abstractions | PASS | Each POI instruction gets its own function call, not a generic "interact" dispatcher. |
| P03: Readable & Deterministic Logic | PASS | On-chain combat is deterministic. Frontend parses events, does not re-resolve. |
| P04: Seed-Driven Procedural Generation | PASS | Map generation uses on-chain seeds. No change needed. |
| P05: Deterministic Combat Resolution | PASS | Combat resolves on-chain. Frontend displays results from events. |
| P06: Mobile-First Performance (60 FPS) | PASS | Move transactions are fire-and-forget with optimistic updates. Event parsing is async. |
| P07: Bounded Memory & No Leaks | PASS | Combat logs capped. Event arrays bounded by transaction log size. |
| P08: Strict UI Fidelity | PASS | No UI layout changes in this feature. |
| P09: Consistent Iconography & Tooltips | PASS | POI tooltips already exist in game UI. |
| P10: Comprehensive Unit Testing | PASS | Will add tests for event parsing, PDA derivation, and instruction builder functions. |
| P11: RNG Determinism Testing | N/A | No RNG in frontend integration layer. |
| P12: Centralized Input Handling | PASS | No input handling changes. |
| P13: Structured Combat Logging | PASS | Combat events parsed from on-chain logs into typed CombatReplay structure. |
| P14: No Invention Rule | PASS | Only implementing instructions that exist in the deployed programs. |
| P15: Debug Tooling Isolation | PASS | No debug tooling changes. |

## Project Structure

### Documentation (this feature)

```text
specs/008-solana-program-instructions/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── services/solana/
│   ├── idl/                          # Updated IDL files (8 total)
│   │   ├── gameplay_state.json       # UPDATE (outdated)
│   │   ├── map_generator.json        # UPDATE (outdated)
│   │   ├── player_profile.json       # UPDATE (outdated)
│   │   ├── session_manager.json      # UPDATE (outdated)
│   │   ├── player_inventory.json     # NEW
│   │   └── poi_system.json           # NEW
│   ├── programs.ts                   # UPDATE (add inventory + poi program factories)
│   ├── config.ts                     # UPDATE (add INVENTORY + POI program ID env vars)
│   ├── constants.ts                  # VERIFY (PDA seeds match current programs)
│   ├── gameplayState.ts              # UPDATE (move_player accounts now include more PDAs)
│   ├── poiSystem.ts                  # NEW (POI instruction callers)
│   ├── sessionBundle.ts              # UPDATE (align with new IDL signatures)
│   ├── eventParser.ts                # UPDATE (handle new event types from move_player)
│   ├── errors.ts                     # UPDATE (add POI + inventory error codes)
│   └── types/
│       ├── gameplay_state.ts         # UPDATE (MovePlayerParams needs more accounts)
│       ├── poi_system.ts             # NEW (POI types, shop state, interaction params)
│       ├── player_inventory.ts       # NEW (inventory types, item instances)
│       └── combat_events.ts          # UPDATE (new event types)
├── hooks/
│   ├── useGameplayState.ts           # UPDATE (move returns richer event data)
│   ├── usePoiInteraction.ts          # UPDATE (wire to on-chain instructions)
│   └── usePlayerInventory.ts         # NEW (inventory state from on-chain)
├── contexts/
│   ├── SessionContext.tsx            # UPDATE (pass new accounts to move_player)
│   ├── GameplayStateContext.tsx      # UPDATE (richer state from on-chain events)
│   └── ProfileContext.tsx            # VERIFY (createProfile + recordRunResult alignment)
└── screens/
    └── GameScreen.tsx                # UPDATE (handle new event types from moves)

__tests__/
├── services/solana/
│   ├── poiSystem.test.ts             # NEW
│   ├── gameplayState.test.ts         # UPDATE
│   └── eventParser.test.ts           # UPDATE
└── hooks/
    └── usePoiInteraction.test.ts     # UPDATE
```

**Structure Decision**: Extends the existing `src/services/solana/` module structure. New POI and inventory services follow the same pattern as `gameplayState.ts`. No new directories or architectural changes needed.

## Complexity Tracking

No constitution violations to justify.
