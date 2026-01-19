# Feature Specification: Guest Mode Login & Movement Tracking

**Feature Branch**: `006-guest-mode-movement`  
**Created**: 2026-01-18  
**Status**: Draft  
**Input**: User description: "Allow users to play without wallet connection (guest mode) and integrate on-chain movement tracking for connected users"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Guest Mode Sign-In (Priority: P1)

A new user opens the app and wants to try the game without connecting a wallet. They see a "Play as Guest" button below the wallet options and can start playing immediately with random seeds and no blockchain transactions.

**Why this priority**: This removes the largest friction point for new users. Many players want to try a game before connecting their wallet.

**Independent Test**: User can complete the full game flow (Account -> Hub -> CampaignSelect -> Game -> Combat) without ever connecting a wallet.

**Acceptance Scenarios**:

1. **Given** user is on AccountScreen without wallet connected, **When** they tap "Play as Guest", **Then** they are navigated to HubScreen with guest mode active
2. **Given** user is in guest mode, **When** they view their profile area, **Then** it shows "(GUEST)" instead of wallet address
3. **Given** user is in guest mode, **When** they complete a dungeon run, **Then** no blockchain transactions are attempted

---

### User Story 2 - Guest Mode UI Restrictions (Priority: P2)

A guest user sees a simplified Hub interface with only essential buttons. They can play the game but cannot access wallet-dependent features.

**Why this priority**: Ensures guest users have a clean, focused experience without confusing "coming soon" features they can't use anyway.

**Independent Test**: Guest user sees only "Items" and "Play" buttons on HubScreen, settings shows "Disconnect" instead of "Reset Profile".

**Acceptance Scenarios**:

1. **Given** user is in guest mode on HubScreen, **When** they view bottom-left buttons, **Then** Quests/Ranks/Skins buttons are hidden
2. **Given** user is in guest mode on HubScreen, **When** they view bottom-right buttons, **Then** Marketplace/PVP buttons are hidden, Campaign is renamed to "Play"
3. **Given** user is in guest mode in Settings modal, **When** they view the reset button, **Then** it says "Disconnect" and returns them to AccountScreen

---

### User Story 3 - On-Chain Movement Tracking (Priority: P3)

A wallet-connected user's movements are tracked on-chain via the burner wallet for verifiable gameplay. Movements are sent asynchronously without blocking gameplay.

**Why this priority**: Enables fair, verifiable gameplay for competitive features. Lower priority because the core game works without it.

**Independent Test**: Connected user can play the game, and movement transactions are sent in the background (visible in console logs).

**Acceptance Scenarios**:

1. **Given** user is connected with active session, **When** they move in GameScreen, **Then** movePlayer() is called via SessionContext
2. **Given** movePlayer() fails, **When** user continues moving, **Then** gameplay is not blocked and user can continue playing
3. **Given** user is in guest mode, **When** they move in GameScreen, **Then** no movePlayer() call is made

---

### Edge Cases

- What happens when a guest user tries to access wallet-dependent features? They are prompted to connect a wallet.
- How does the system handle movement tracking failures? Failures are logged but don't block gameplay.
- What if a user switches from guest to connected mid-session? Not supported - they must disconnect and reconnect.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: AccountScreen MUST show "Play as Guest" button below wallet options when not connected
- **FR-002**: Guest mode MUST use random seeds for map generation (no on-chain seed fetch)
- **FR-003**: Guest mode MUST skip all blockchain transactions (start session, move player, end session)
- **FR-004**: ProfileContext MUST expose a `loginAsGuest()` function that sets mode to 'guest'
- **FR-005**: HubScreen MUST hide Quests, Ranks, Skins, Marketplace, and PVP buttons for guest users
- **FR-006**: HubScreen MUST rename "Campaign" to "Play" for guest users
- **FR-007**: Settings modal MUST show "Disconnect" instead of "Reset Profile" for guest users
- **FR-008**: Profile panel MUST show "(GUEST)" instead of wallet address for guest users
- **FR-009**: GameScreen MUST call `useSession().movePlayer()` when player moves (for connected users only)
- **FR-010**: Movement tracking failures MUST NOT block gameplay (fire-and-forget with error logging)

### Key Entities

- **ProfileContext.mode**: 'online' | 'cached' | 'guest' - determines user's connection state
- **SessionContext.movePlayer()**: Sends movement to on-chain via burner wallet
- **AccountScreen**: Entry point with wallet and guest login options

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can go from app launch to playing in under 10 seconds using guest mode (no wallet prompts)
- **SC-002**: Connected users' movements are recorded on-chain with >95% success rate (non-blocking)
- **SC-003**: Guest mode hides 5 Hub buttons (Quests, Ranks, Skins, Marketplace, PVP) and renames 2 labels (Campaign->Play, Reset Profile->Disconnect)
- **SC-004**: Zero transaction signature prompts for guest users throughout the entire game session
