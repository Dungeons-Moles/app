# Research: Guest Mode Login & Movement Tracking

**Feature Branch**: `006-guest-mode-movement`
**Date**: 2026-01-18
**Status**: Complete

## Research Questions

### R1: How should guest mode state be managed?

**Decision**: Extend the existing `mode` state in `ProfileContext` to support 'guest' mode

**Rationale**:
- ProfileContext already has `mode: 'online' | 'cached' | 'guest'` state
- The `loginAsGuest()` function already exists and sets mode to 'guest'
- Guest mode simply needs to skip wallet/blockchain operations
- No new state management infrastructure needed

**Alternatives Considered**:
- Separate GuestContext: Rejected - would fragment authentication state
- Boolean `isGuest` flag: Rejected - `mode` already handles this cleanly

**Evidence**: `src/contexts/ProfileContext.tsx:26` shows mode type, line 149-152 shows `loginAsGuest()` implementation already exists

### R2: How should movement tracking integrate with the game loop?

**Decision**: Fire-and-forget pattern - call `movePlayer()` asynchronously without awaiting

**Rationale**:
- FR-010 requires movement tracking failures NOT to block gameplay
- Constitution P06 requires 60 FPS - blocking on network would cause frame drops
- Existing `useSession().movePlayer()` returns `Promise<{success, newState}>` - can be called without await
- Error logging for debugging without user-facing errors

**Alternatives Considered**:
- Queue-based batch sending: Rejected - over-engineering for this use case
- Synchronous blocking: Rejected - violates P06 performance requirement

**Evidence**: `src/contexts/SessionContext.tsx:417-424` shows movePlayer implementation uses burner wallet

### R3: Where in the code should movement tracking be triggered?

**Decision**: In GameContext/GameScreen after the MOVE action is successfully dispatched to the reducer

**Rationale**:
- The MOVE action in game-reducer.ts handles pure game state transitions
- Movement tracking is a side effect that should happen after state update
- GameContext wraps the reducer and is the right place for side effects
- Already has access to both game state and session context

**Alternatives Considered**:
- Inside game-reducer.ts: Rejected - violates pure reducer pattern (P03)
- In MapRenderer component: Rejected - mixes rendering with side effects

**Evidence**: `src/game/engine/game-reducer.ts:74` shows MOVE action type

### R4: How should HubScreen handle conditional UI for guest mode?

**Decision**: Simple conditional rendering based on `mode === 'guest'` from ProfileContext

**Rationale**:
- FR-005 through FR-008 specify exact UI changes
- Simple ternary/conditional rendering is sufficient
- No need for complex component abstraction
- Aligns with P02 (No Clever Abstractions)

**Implementation Details**:
- Hide: Quests, Ranks, Skins, Marketplace, PVP buttons when guest
- Show: Items, Play (renamed from Campaign) buttons for guest
- Settings modal: "Disconnect" instead of "Reset Profile" for guest
- Profile panel: "(GUEST)" instead of wallet address for guest

**Evidence**: `src/screens/HubScreen.tsx:47` shows `isGuest = mode === 'guest'` already exists

### R5: How should random seeds work in guest mode?

**Decision**: Use `Math.random() * 2^32` for generating a random seed value

**Rationale**:
- FR-002 requires random seeds for guest map generation
- The seed value itself just needs to be random, not the generation process
- Once a seed is chosen, the game uses `SeededRNG` with that seed
- This maintains deterministic gameplay while having random starting seeds

**Alternatives Considered**:
- Always use seed 12345: Rejected - would give same map every time
- Use Date.now(): Could work but `Math.random()` is simpler

**Evidence**: Guest mode cannot fetch on-chain seeds since no wallet connection

### R6: What changes are needed to AccountScreen?

**Decision**: The "Play as Guest" button already exists and functions correctly

**Rationale**:
- `src/screens/AccountScreen.tsx:87-90` already has `handlePlayAsGuest` handler
- Lines 249-256 show the guest link UI is already implemented
- Navigation to Hub on guest mode is handled at lines 73-77
- No changes needed - FR-001 is already satisfied

**Evidence**: Reading AccountScreen.tsx shows complete guest mode entry point implementation

## Key Findings Summary

1. **Guest mode infrastructure largely exists** - ProfileContext already has mode state and loginAsGuest()
2. **AccountScreen guest button already works** - Navigation and UI in place
3. **HubScreen needs UI modifications** - Conditional rendering for buttons/labels
4. **Movement tracking needs GameContext integration** - Fire-and-forget after MOVE action
5. **No new abstractions needed** - Simple conditional logic throughout

## Dependencies Identified

- `@coral-xyz/anchor` - For Solana program interaction (existing)
- `@solana/web3.js` - For transaction handling (existing)
- `useSession().movePlayer()` - For on-chain movement (existing)
- `useProfile().mode` - For guest mode detection (existing)
