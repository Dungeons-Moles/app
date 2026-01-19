# Quickstart: Guest Mode Login & Movement Tracking

**Feature Branch**: `006-guest-mode-movement`
**Date**: 2026-01-18

## Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI
- Android/iOS simulator or physical device

## Quick Start

```bash
# Clone and checkout feature branch
git checkout 006-guest-mode-movement

# Install dependencies
npm install

# Start development server
npm start

# Run on Android
npm run android

# Run on iOS
npm run ios

# Run in web browser (for development)
npm run web
```

## Testing the Feature

### Test Guest Mode Flow

1. Launch the app (AccountScreen appears)
2. Click "or play as guest" below the wallet options
3. Verify navigation to HubScreen
4. Verify profile panel shows "(GUEST)"
5. Verify only "Items" and "Play" buttons are visible
6. Click settings gear and verify "Disconnect" button
7. Click "Disconnect" to return to AccountScreen
8. Navigate through: Play → CampaignSelect → Game
9. Play the game and verify no wallet prompts appear

### Test Connected User Flow (Movement Tracking)

1. Launch the app (AccountScreen appears)
2. Connect wallet (Jupiter or Phantom)
3. Create profile if needed
4. Navigate: Campaign → Select Level → Start Game
5. Move around the map using D-pad
6. Check console logs for movement tracking:
   ```
   [GameContext] Movement tracking: {direction: 'up', success: true}
   ```
7. Verify movement tracking failures don't block gameplay

### Test HubScreen UI Differences

| Element | Connected | Guest |
|---------|-----------|-------|
| Profile name | "YourName" | "Adventurer" |
| Wallet address | "ABC...XYZ" | "(GUEST)" |
| Quests button | ✅ Visible | ❌ Hidden |
| Ranks button | ✅ Visible | ❌ Hidden |
| Skins button | ✅ Visible | ❌ Hidden |
| Marketplace | ✅ Visible | ❌ Hidden |
| PVP button | ✅ Visible | ❌ Hidden |
| Items button | ✅ Visible | ✅ Visible |
| Play/Campaign | "Campaign" | "Play" |
| Settings reset | "Reset Profile" | "Disconnect" |

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- __tests__/unit/contexts/ProfileContext.test.ts

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

## Quality Checks

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Format code
npm run format
```

## Key Files to Review

| File | Purpose |
|------|---------|
| `src/contexts/ProfileContext.tsx` | Guest mode state and loginAsGuest() |
| `src/contexts/SessionContext.tsx` | movePlayer() for on-chain tracking |
| `src/screens/AccountScreen.tsx` | Guest mode entry point |
| `src/screens/HubScreen.tsx` | Conditional UI for guest mode |
| `src/screens/GameScreen.tsx` | Movement tracking integration |

## Debugging

### Console Logs to Monitor

```typescript
// Guest mode activation
[ProfileContext] loginAsGuest called

// Movement tracking (connected users only)
[GameContext] Movement tracking: {direction: 'up'}
[GameContext] Movement tracking result: {success: true, newState: {...}}
[GameContext] Movement tracking failed: {error: '...'}  // Should not block

// Session management
[SessionContext] movePlayer called: {direction: 'up'}
```

### Common Issues

1. **Guest mode not navigating to Hub**
   - Check AccountScreen useEffect for mode === 'guest' condition
   - Verify loginAsGuest() is setting mode correctly

2. **Movement tracking blocking gameplay**
   - Ensure movePlayer() is called without await
   - Verify .catch() is handling errors silently

3. **UI not updating for guest mode**
   - Check `isGuest = mode === 'guest'` in HubScreen
   - Verify conditional rendering logic

## Success Criteria Verification

- [ ] SC-001: App launch → Playing in under 10 seconds via guest mode
- [ ] SC-002: Connected user movements logged in console (>95% success)
- [ ] SC-003: 5 buttons hidden, 2 labels renamed in guest mode
- [ ] SC-004: Zero wallet signature prompts for guest users
