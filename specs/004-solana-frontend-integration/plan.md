# Implementation Plan: Solana Frontend Integration

**Branch**: `004-solana-frontend-integration` | **Date**: 2025-01-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-solana-frontend-integration/spec.md`

## Summary

Integrate the existing Solana Core Programs (player-profile, session-manager, map-generator) with the React Native frontend to enable wallet-based player profiles, on-chain session management, tier-based campaign progression, and deterministic map generation from on-chain seeds.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**:
- React Native 0.81+, Expo 54+
- @coral-xyz/anchor (Anchor TypeScript client)
- @solana-mobile/mobile-wallet-adapter-protocol-web3js (existing)
- @solana/web3.js 1.98+ (existing)
- expo-secure-store (local profile caching)

**Storage**:
- On-chain: PlayerProfile, GameSession, MapConfig (Solana accounts)
- Local: expo-secure-store for profile cache, AsyncStorage for session state backup

**Testing**: Jest with mocked Anchor programs
**Target Platform**: Mobile (Android/iOS) via Expo
**Project Type**: Mobile (React Native)
**Performance Goals**: 60 FPS gameplay, <3s level load, <60s onboarding
**Constraints**: Offline-capable with local state sync, <200ms UI feedback
**Scale/Scope**: Single-player, ~5 screens, 3 program integrations

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| P01: Explicit State Machines | ✅ Pass | Session states (idle, creating, delegated, active, ended) will use explicit state machine |
| P02: No Clever Abstractions | ✅ Pass | Direct hooks per program (usePlayerProfile, useGameSession) instead of generic abstraction |
| P03: Readable & Deterministic Logic | ✅ Pass | On-chain operations isolated in hooks, game logic unchanged |
| P04: Seed-Driven Procedural Generation | ✅ Pass | Seeds fetched from on-chain MapConfig, deterministic generation preserved |
| P05: Deterministic Combat Resolution | ✅ Pass | No changes to combat system |
| P06: Mobile-First Performance (60 FPS) | ✅ Pass | Async operations with loading states, no blocking |
| P07: Bounded Memory & No Leaks | ✅ Pass | Session cache bounded, subscriptions cleaned on unmount |
| P08: Strict UI Fidelity | ✅ Pass | New screens follow existing patterns |
| P09: Consistent Iconography & Tooltips | ✅ Pass | SOL amounts displayed with wallet icon |
| P10: Comprehensive Unit Testing | ⚠️ Requires | Tests for hooks with mocked programs |
| P11: RNG Determinism Testing | ✅ Pass | Seed verification tests required |
| P12: Centralized Input Handling | ✅ Pass | No input changes |
| P13: Structured Combat Logging | ✅ Pass | No combat changes |
| P14: No Invention Rule | ✅ Pass | Features match spec exactly |
| P15: Debug Tooling Isolation | ✅ Pass | Devnet flag controls program endpoints |

## Project Structure

### Documentation (this feature)

```text
specs/004-solana-frontend-integration/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (client interfaces)
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
src/
├── contexts/
│   ├── WalletContext.tsx          # EXTEND: Add program providers
│   ├── GameContext.tsx            # EXTEND: On-chain session integration
│   └── ProfileContext.tsx         # NEW: On-chain profile state
├── hooks/
│   ├── usePlayerProfile.ts        # NEW: Profile program interactions
│   ├── useGameSession.ts          # NEW: Session program interactions
│   └── useMapGenerator.ts         # NEW: Map program seed fetching
├── services/
│   └── solana/
│       ├── programs.ts            # NEW: Program initialization
│       ├── cache.ts               # NEW: Local profile caching
│       └── types.ts               # NEW: Shared Solana types
├── screens/
│   ├── ProfileCreationScreen.tsx  # NEW: First-time onboarding
│   ├── CampaignSelectScreen.tsx   # NEW: Campaign level selection
│   └── HubScreen.tsx              # MODIFY: Add profile display
└── components/
    └── profile/
        ├── ProfileCard.tsx        # NEW: Profile data display
        └── TierUnlockModal.tsx    # NEW: Tier purchase modal
```

**Structure Decision**: Mobile single-project structure extending existing `src/` layout. New Solana-specific code isolated in `src/services/solana/` and `src/hooks/` to maintain separation from game logic.

## Complexity Tracking

No violations requiring justification. All patterns follow constitution guidelines.
