# Implementation Plan: Core Gameplay Loop Integration

**Branch**: `007-core-loop-integration` | **Date**: 2026-01-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-core-loop-integration/spec.md`

## Summary

Integrate the complete core gameplay loop from Solana programs (010-core-gameplay-loop) with the React Native frontend. This feature extends the existing burner wallet infrastructure (005) to support:

1. **Atomic Session Creation**: Bundle 5 instructions (start_session, initialize_game_state, spawn_enemies, spawn_pois, initialize_inventory) into a single transaction with SOL transfer to burner wallet.

2. **Combat Event Display**: Listen to program events (CombatStarted, TurnExecuted, EnemyMoved, CombatEnded) and display animated combat sequences.

3. **Night Mechanics UI**: Animate enemy movement during night phases based on EnemyMoved events before player movement resolves.

4. **Multi-Session Management**: Support sessions on multiple levels with session switching UI.

5. **Death/Victory Handling**: Display run summary screens, handle level/item unlocks, update profile state.

6. **Run Economy**: Purchase runs flow (0.001 SOL for 20 runs).

7. **Item Progression**: Display 80-item collection with unlock status and animations.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**:

- React Native 0.81+, Expo 54+
- @coral-xyz/anchor (Anchor TypeScript client, from 004/005)
- @solana/web3.js 1.98+ (existing)
- @solana-mobile/mobile-wallet-adapter-protocol-web3js (existing)
- expo-secure-store (burner keypair storage, from 005)
- @shopify/react-native-skia (canvas rendering, from 002)

**Storage**:

- On-chain: GameSession, GameState, MapEnemies, MapPois, PlayerInventory, PlayerProfile
- Local: expo-secure-store for burner keypair, AsyncStorage for session cache

**Testing**: Jest with mocked Anchor programs, deterministic seed testing
**Target Platform**: Mobile (Android/iOS) via Expo, Solana Seeker hardware
**Project Type**: Mobile (React Native)
**Performance Goals**: 60 FPS gameplay, <2s transaction confirmation, <5s combat animation per encounter
**Constraints**: Single wallet signature for session creation, burner signs all gameplay, atomic death/victory handling
**Scale/Scope**: Single-player, extends 004/005/006 integration, multi-session (up to 40 concurrent)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                              | Status      | Notes                                                                         |
| -------------------------------------- | ----------- | ----------------------------------------------------------------------------- |
| P01: Explicit State Machines           | ✅ Pass     | CombatReplayState, SessionLifecycle, NightMovementState use explicit machines |
| P02: No Clever Abstractions            | ✅ Pass     | Direct hooks (useSessionManager, useCombatReplay) without generic patterns    |
| P03: Readable & Deterministic Logic    | ✅ Pass     | On-chain state is source of truth, combat events replayed deterministically   |
| P04: Seed-Driven Procedural Generation | ✅ Pass     | Map/enemy/POI generation driven by on-chain seeds                             |
| P05: Deterministic Combat Resolution   | ✅ Pass     | Combat resolved on-chain, events replayed in exact order                      |
| P06: Mobile-First Performance (60 FPS) | ✅ Pass     | Combat animations use Skia, async transactions don't block UI                 |
| P07: Bounded Memory & No Leaks         | ✅ Pass     | Combat log capped at 100 entries, event listeners cleaned on unmount          |
| P08: Strict UI Fidelity                | ✅ Pass     | UI displays on-chain data, death/victory screens match spec                   |
| P09: Consistent Iconography & Tooltips | ✅ Pass     | Item collection shows emoji+accent, tooltips on items                         |
| P10: Comprehensive Unit Testing        | ⚠️ Requires | Tests for combat replay, session lifecycle, event parsing                     |
| P11: RNG Determinism Testing           | ✅ Pass     | Item unlock PRNG tested with fixed seeds                                      |
| P12: Centralized Input Handling        | ✅ Pass     | Input flows through existing handler from 006                                 |
| P13: Structured Combat Logging         | ✅ Pass     | CombatReplay builds structured log from events                                |
| P14: No Invention Rule                 | ✅ Pass     | Features match spec exactly, no additions                                     |
| P15: Debug Tooling Isolation           | ✅ Pass     | Devnet flag controls endpoints, debug overlays isolated                       |

## Project Structure

### Documentation (this feature)

```text
specs/007-core-loop-integration/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (program client interfaces)
│   ├── session-bundle.md    # Atomic 5-instruction transaction
│   ├── combat-events.md     # Event parsing and replay
│   ├── multi-session.md     # Session list and switching
│   └── run-economy.md       # Purchase runs flow
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── contexts/
│   ├── SessionContext.tsx        # EXTEND: Multi-session support, session list
│   ├── GameplayStateContext.tsx  # EXTEND: Combat events, night movement
│   ├── ProfileContext.tsx        # EXTEND: Run economy, item collection
│   └── CombatReplayContext.tsx   # NEW: Combat animation state machine
├── hooks/
│   ├── useSessionBundle.ts       # NEW: Build atomic 5-instruction transaction
│   ├── useCombatReplay.ts        # NEW: Parse events, drive animation
│   ├── useNightMovement.ts       # NEW: Enemy movement during night
│   ├── useSessionList.ts         # NEW: Fetch/manage multiple sessions
│   ├── useRunEconomy.ts          # NEW: Purchase runs flow
│   └── useItemCollection.ts      # NEW: 80-item unlock tracking
├── services/
│   └── solana/
│       ├── sessionBundle.ts      # NEW: 5-instruction transaction builder
│       ├── eventParser.ts        # NEW: Parse CombatStarted, TurnExecuted, etc.
│       ├── sessionList.ts        # NEW: Fetch sessions for player
│       └── types/
│           ├── combat_events.ts  # NEW: Event type definitions
│           └── item_pool.ts      # NEW: Bitmask utilities for items
├── screens/
│   ├── GameScreen.tsx            # MODIFY: Combat overlay, night animation
│   ├── SessionListScreen.tsx     # NEW: List/switch active sessions
│   ├── DeathScreen.tsx           # NEW: Death summary with run stats
│   ├── VictoryScreen.tsx         # NEW: Victory with level/item unlocks
│   ├── RunPurchaseScreen.tsx     # NEW: Purchase runs flow
│   └── ItemCollectionScreen.tsx  # NEW: 80-item grid with unlock status
├── components/
│   ├── combat/
│   │   ├── CombatOverlay.tsx     # NEW: Full-screen combat animation
│   │   ├── TurnDisplay.tsx       # NEW: Single turn (damage, effects)
│   │   └── BossIntro.tsx         # NEW: Boss combat intro animation
│   ├── session/
│   │   ├── SessionCard.tsx       # NEW: Session preview in list
│   │   └── SessionSwitcher.tsx   # NEW: Quick switch UI
│   ├── night/
│   │   └── EnemyMovement.tsx     # NEW: Animate enemy positions during night
│   └── items/
│       ├── ItemGrid.tsx          # NEW: 80-item collection grid
│       ├── ItemCard.tsx          # NEW: Individual item display
│       └── UnlockAnimation.tsx   # NEW: Item unlock celebration
└── data/
    └── items/
        └── all-items.ts          # NEW: 80 item definitions (name, stats, set)
```

**Structure Decision**: Mobile single-project structure extending existing `src/` layout from 004/005/006. New contexts for combat replay and item collection. New screens for session list, death, victory, run purchase, and item collection. Combat overlay component for in-game combat display.

## Complexity Tracking

No violations requiring justification. All patterns follow constitution guidelines.

## Constitution Check (Post-Design)

_Re-evaluated after Phase 1 design completion._

| Principle                              | Status      | Post-Design Notes                                                                                                |
| -------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------- |
| P01: Explicit State Machines           | ✅ Pass     | CombatReplayState (idle→intro→turns→outro→result), SessionLifecycle, NightMovementBatch defined in data-model.md |
| P02: No Clever Abstractions            | ✅ Pass     | Direct hooks and services, no generic patterns introduced                                                        |
| P03: Readable & Deterministic Logic    | ✅ Pass     | Event parsing from logs is deterministic, same events = same replay                                              |
| P04: Seed-Driven Procedural Generation | ✅ Pass     | Session bundle uses on-chain seeds for enemy/POI generation                                                      |
| P05: Deterministic Combat Resolution   | ✅ Pass     | Combat resolved on-chain, frontend only replays events                                                           |
| P06: Mobile-First Performance (60 FPS) | ✅ Pass     | Animation timings bounded (200ms/enemy, 300ms/turn), Skia canvas                                                 |
| P07: Bounded Memory & No Leaks         | ✅ Pass     | CombatReplay cleared after display, event listeners cleaned on unmount                                           |
| P08: Strict UI Fidelity                | ✅ Pass     | Screens match spec: DeathScreen, VictoryScreen, SessionListScreen                                                |
| P09: Consistent Iconography & Tooltips | ✅ Pass     | ItemCard uses emoji+accent, tooltips on items in collection                                                      |
| P10: Comprehensive Unit Testing        | ⚠️ Requires | Tasks will include tests for: eventParser, sessionBundle, bitmask utilities                                      |
| P11: RNG Determinism Testing           | ✅ Pass     | Item unlock uses deterministic PRNG on-chain, testable with fixed seeds                                          |
| P12: Centralized Input Handling        | ✅ Pass     | No input changes, extends existing handler                                                                       |
| P13: Structured Combat Logging         | ✅ Pass     | CombatReplay interface provides structured turn data                                                             |
| P14: No Invention Rule                 | ✅ Pass     | All features trace to spec.md requirements                                                                       |
| P15: Debug Tooling Isolation           | ✅ Pass     | No new debug tooling added                                                                                       |

**Gate Status**: ✅ PASS - Ready for Phase 2 task generation
