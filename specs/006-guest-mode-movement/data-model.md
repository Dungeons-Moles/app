# Data Model: Guest Mode Login & Movement Tracking

**Feature Branch**: `006-guest-mode-movement`
**Date**: 2026-01-18
**Status**: Complete

## Entities

### ProfileContext State (Modified)

The existing ProfileContext already contains the required state structure. No modifications to the data model are needed.

```typescript
// Existing in src/contexts/ProfileContext.tsx
interface ProfileContextType {
  // ... existing fields
  mode: 'online' | 'cached' | 'guest';  // Already exists
  loginAsGuest: () => void;              // Already exists
}
```

**State Transitions**:
```
Initial State: mode = 'guest' (no wallet)
               ↓
[Wallet Connect] → mode = 'online' | 'cached' (based on connectivity)
               ↓
[loginAsGuest()] → mode = 'guest'
               ↓
[Wallet Disconnect] → mode = 'guest'
```

### MovePlayerParams (Existing)

Used for on-chain movement tracking. Already defined in the codebase.

```typescript
// Existing in src/services/solana/types/gameplay_state.ts
interface MovePlayerParams {
  direction: 'up' | 'down' | 'left' | 'right';
  // Additional fields as defined in the Solana program
}
```

### GameState Movement Data (Existing)

The on-chain gameplay state already tracks player position.

```typescript
// Existing in src/services/solana/types/gameplay_state.ts
interface GameState {
  playerX: number;
  playerY: number;
  // ... other fields
}
```

## No New Entities Required

This feature works entirely with existing data models:

1. **ProfileContext.mode** - Already supports 'guest' value
2. **SessionContext.movePlayer()** - Already handles on-chain movement
3. **GameState** - Already tracks position on-chain

## Validation Rules

### Guest Mode Entry
- User must NOT be wallet-connected to see "Play as Guest" option
- Guest mode sets `mode = 'guest'` and clears any errors

### Movement Tracking (Connected Users)
- Only triggered when `mode !== 'guest'`
- Requires active session (`hasActiveSession = true`)
- Requires valid burner wallet keypair
- Direction must be one of: 'up', 'down', 'left', 'right'

### HubScreen UI Rules (by mode)

| Element | mode='online' | mode='cached' | mode='guest' |
|---------|--------------|---------------|--------------|
| Quests button | Visible | Visible | Hidden |
| Ranks button | Visible | Visible | Hidden |
| Skins button | Visible | Visible | Hidden |
| Marketplace button | Visible | Visible | Hidden |
| PVP button | Visible | Visible | Hidden |
| Campaign/Play button | "Campaign" | "Campaign" | "Play" |
| Profile panel | Wallet address | Wallet address | "(GUEST)" |
| Settings: Reset | "Reset Profile" | "Reset Profile" | "Disconnect" |

## State Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     AccountScreen                            │
│  ┌─────────────────┐         ┌─────────────────────────┐    │
│  │  Wallet Login   │         │  "Play as Guest" link   │    │
│  │    Options      │         │                         │    │
│  └────────┬────────┘         └───────────┬─────────────┘    │
│           │                              │                   │
│           ▼                              ▼                   │
│    [mode='online']               [loginAsGuest()]           │
│    or [mode='cached']             [mode='guest']            │
└───────────┬──────────────────────────────┬──────────────────┘
            │                              │
            ▼                              ▼
┌───────────────────────────────────────────────────────────┐
│                        HubScreen                           │
│  ┌──────────────────────┐    ┌──────────────────────────┐ │
│  │ Full UI (connected)  │    │ Limited UI (guest)       │ │
│  │ - All buttons        │    │ - Items + Play only      │ │
│  │ - Wallet address     │    │ - (GUEST) label          │ │
│  │ - Reset Profile      │    │ - Disconnect option      │ │
│  └──────────────────────┘    └──────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
            │                              │
            ▼                              ▼
┌───────────────────────────────────────────────────────────┐
│                       GameScreen                           │
│  ┌──────────────────────┐    ┌──────────────────────────┐ │
│  │ Movement + On-chain  │    │ Movement only            │ │
│  │ tracking (fire&forget)│   │ (no blockchain calls)    │ │
│  └──────────────────────┘    └──────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```
