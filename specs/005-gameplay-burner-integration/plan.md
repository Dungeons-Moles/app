# Implementation Plan: Gameplay State Integration with Burner Wallet

**Branch**: `005-gameplay-burner-integration` | **Date**: 2025-01-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-gameplay-burner-integration/spec.md`

## Summary

Integrate the on-chain gameplay-state program (002-gameplay-state-tracking) with the React Native frontend and introduce a burner wallet system for gasless gameplay. The burner wallet is an ephemeral keypair created at session start, funded from the player's main wallet with a single signature, then used to automatically sign all gameplay transactions (move_player, modify_stat). Remaining SOL is returned to the main wallet at session end. This enables uninterrupted gameplay while maintaining on-chain state tracking for future MagicBlock integration.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**:
- React Native 0.81+, Expo 54+
- @coral-xyz/anchor (Anchor TypeScript client, already installed from 004)
- @solana/web3.js 1.98+ (existing)
- @solana-mobile/mobile-wallet-adapter-protocol-web3js (existing)
- expo-secure-store (burner keypair storage)

**Storage**:
- On-chain: GameState account (gameplay-state program)
- Local: expo-secure-store for burner keypair, AsyncStorage for sync queue

**Testing**: Jest with mocked Anchor programs
**Target Platform**: Mobile (Android/iOS) via Expo
**Project Type**: Mobile (React Native)
**Performance Goals**: 60 FPS gameplay, <2s transaction confirmation, <3s state sync
**Constraints**: 2 wallet signatures per session (start/end), burner management must not lose SOL
**Scale/Scope**: Single-player, extends 004 integration, 1 new program (gameplay-state)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| P01: Explicit State Machines | ✅ Pass | Burner state (idle, funding, active, draining, drained) uses explicit state machine |
| P02: No Clever Abstractions | ✅ Pass | Direct hook (useBurnerWallet) and service (burnerWallet.ts) |
| P03: Readable & Deterministic Logic | ✅ Pass | On-chain state is source of truth, local display syncs from chain |
| P04: Seed-Driven Procedural Generation | ✅ Pass | No changes to map generation seeds |
| P05: Deterministic Combat Resolution | ✅ Pass | No changes to combat system |
| P06: Mobile-First Performance (60 FPS) | ✅ Pass | Async transactions don't block UI, optimistic updates |
| P07: Bounded Memory & No Leaks | ✅ Pass | Burner cleaned on session end, subscriptions cleaned on unmount |
| P08: Strict UI Fidelity | ✅ Pass | UI displays on-chain data, shows sync states |
| P09: Consistent Iconography & Tooltips | ✅ Pass | SOL balance shown with wallet icon |
| P10: Comprehensive Unit Testing | ⚠️ Requires | Tests for burner lifecycle, gameplay-state integration |
| P11: RNG Determinism Testing | ✅ Pass | No RNG changes |
| P12: Centralized Input Handling | ✅ Pass | No input changes |
| P13: Structured Combat Logging | ✅ Pass | No combat changes |
| P14: No Invention Rule | ✅ Pass | Features match spec exactly |
| P15: Debug Tooling Isolation | ✅ Pass | Devnet flag controls program endpoints |

## Project Structure

### Documentation (this feature)

```text
specs/005-gameplay-burner-integration/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (gameplay-state client interface)
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
src/
├── contexts/
│   ├── SessionContext.tsx          # EXTEND: Integrate gameplay-state + burner
│   └── GameplayStateContext.tsx    # NEW: On-chain gameplay state management
├── hooks/
│   ├── useBurnerWallet.ts          # NEW: Burner wallet lifecycle
│   ├── useGameplayState.ts         # NEW: Gameplay-state program interactions
│   └── useOfflineSync.ts           # NEW: Offline queue management
├── services/
│   └── solana/
│       ├── burnerWallet.ts         # NEW: Ephemeral keypair management
│       ├── gameplayState.ts        # NEW: Gameplay-state program client
│       ├── syncQueue.ts            # NEW: Offline transaction queue
│       └── types/
│           └── gameplay_state.ts   # NEW: Gameplay-state types from IDL
├── screens/
│   └── CombatScreen.tsx            # MODIFY: Display on-chain state
└── components/
    └── common/
        ├── BurnerBalanceIndicator.tsx  # NEW: Show burner SOL balance
        └── SyncStatusIndicator.tsx     # NEW: Show chain sync status
```

**Structure Decision**: Mobile single-project structure extending existing `src/` layout from 004. Burner wallet isolated in `src/services/solana/burnerWallet.ts`. New gameplay-state context manages on-chain state parallel to existing GameContext.

## Complexity Tracking

No violations requiring justification. All patterns follow constitution guidelines.
