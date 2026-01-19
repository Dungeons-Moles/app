# Internal API Contract: Guest Mode & Movement Tracking

**Feature Branch**: `006-guest-mode-movement`
**Date**: 2026-01-18

This feature does not introduce new external APIs. It defines internal component contracts for React context consumers.

## ProfileContext API

### loginAsGuest()

Transitions the application to guest mode.

```typescript
loginAsGuest(): void
```

**Behavior**:
- Sets `mode` to `'guest'`
- Clears any existing errors
- Does NOT require wallet connection
- Navigation to HubScreen handled by AccountScreen useEffect

**Pre-conditions**: None

**Post-conditions**:
- `mode === 'guest'`
- `error === null`

### mode Property

```typescript
mode: 'online' | 'cached' | 'guest'
```

**Usage**:
```typescript
const { mode } = useProfile();
const isGuest = mode === 'guest';
```

## SessionContext API

### movePlayer(params)

Sends player movement to on-chain gameplay state.

```typescript
movePlayer(params: MovePlayerParams): Promise<{ success: boolean; newState?: GameState }>
```

**Parameters**:
```typescript
interface MovePlayerParams {
  direction: 'up' | 'down' | 'left' | 'right';
}
```

**Behavior**:
- Uses burner wallet for gasless transaction
- Returns immediately (caller should NOT await for non-blocking UX)
- Logs errors but does not throw

**Pre-conditions**:
- `mode !== 'guest'`
- `hasActiveSession === true`
- Burner wallet keypair available

**Post-conditions**:
- On-chain gameplay state updated (if successful)
- No UI blocking regardless of success/failure

## Component Contracts

### AccountScreen

**Guest Mode Entry**:
```typescript
// Shows "Play as Guest" link when not connected
{!isConnected && (
  <TouchableOpacity onPress={handlePlayAsGuest}>
    <Text>or play as guest</Text>
  </TouchableOpacity>
)}
```

### HubScreen

**Conditional UI Rendering**:
```typescript
const { mode } = useProfile();
const isGuest = mode === 'guest';

// Hide wallet-dependent buttons for guests
{!isGuest && <QuestsButton />}
{!isGuest && <RanksButton />}
{!isGuest && <SkinsButton />}
{!isGuest && <MarketplaceButton />}
{!isGuest && <PVPButton />}

// Rename Campaign to Play for guests
<Text>{isGuest ? 'Play' : 'Campaign'}</Text>

// Show (GUEST) instead of wallet address
{isGuest ? '(GUEST)' : shortenAddress(profile.owner)}

// Settings modal: Disconnect vs Reset Profile
<Text>{isGuest ? 'Disconnect' : 'Reset Profile'}</Text>
```

### GameScreen/GameContext

**Movement Tracking Integration**:
```typescript
// After successful MOVE action dispatch
const handleMove = (direction: Direction) => {
  dispatch({ type: 'MOVE', direction });

  // Fire-and-forget movement tracking for connected users
  if (mode !== 'guest' && hasActiveSession) {
    movePlayer({ direction }).catch((error) => {
      console.error('[GameContext] Movement tracking failed:', error);
    });
  }
};
```

## Error Handling Contract

### Movement Tracking Failures

Per FR-010, failures must NOT block gameplay:

```typescript
// CORRECT: Fire-and-forget with error logging
movePlayer({ direction }).catch((error) => {
  console.error('[GameContext] Movement tracking failed:', error);
  // NO: Don't show user-facing error
  // NO: Don't block or retry
});

// INCORRECT: Awaiting the result
const result = await movePlayer({ direction }); // DON'T DO THIS
if (!result.success) {
  showError(result.error); // DON'T DO THIS
}
```

### Guest Mode Blockchain Bypass

All blockchain operations check mode before executing:

```typescript
// In ProfileContext.recordRunResult
if (mode === 'guest') {
  return { success: true }; // No-op for guests
}

// In GameContext/GameScreen
if (mode !== 'guest') {
  movePlayer({ direction }); // Only for connected users
}
```
