# Feature Specification: Solana Frontend Integration

**Feature Branch**: `004-solana-frontend-integration`
**Created**: 2025-01-15
**Status**: Draft
**Input**: User description: "Integrate Solana Core Programs with React Native Frontend for wallet-based player profiles, session management, and on-chain progression"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First-Time Player Onboarding (Priority: P1)

A new player opens Dungeons & Moles and connects their Solana wallet. The app detects they have no on-chain profile and prompts them to create one. They enter a display name and the profile is created on-chain. They can then access the game hub and start playing.

**Why this priority**: This is the entry point for all blockchain features. Without profile creation, no other on-chain features can function.

**Independent Test**: Can be fully tested by connecting a new wallet, completing profile creation, and verifying the profile appears in the hub screen with correct data.

**Acceptance Scenarios**:

1. **Given** a player connects a wallet with no existing profile, **When** the app loads, **Then** they are shown a profile creation screen.
2. **Given** a player is on the profile creation screen, **When** they enter a valid name and confirm, **Then** their profile is created on-chain and they are taken to the hub.
3. **Given** a player connects a wallet with an existing profile, **When** the app loads, **Then** they are taken directly to the hub with their profile data displayed.
4. **Given** a player on the hub screen, **When** they view their profile, **Then** they see their name, total runs, current level, and unlocked tier.

---

### User Story 2 - Campaign Level Selection (Priority: P2)

A player wants to play a specific campaign level. They see a list of available levels based on their unlocked tier. They select a level, and the game fetches the seed from on-chain to generate the map. The map generation is verified to match the on-chain configuration.

**Why this priority**: This connects the existing game loop to on-chain data, enabling the campaign progression system.

**Independent Test**: Can be tested by selecting different campaign levels and verifying the correct seed is used for map generation.

**Acceptance Scenarios**:

1. **Given** a player with tier 0 unlocked, **When** they view campaign selection, **Then** they see levels 0-39 available and levels 40+ locked.
2. **Given** a player selects campaign level 5, **When** the game starts, **Then** the map is generated using the seed configured on-chain for level 5.
3. **Given** a player at level 39 (tier boundary), **When** they try to select level 40, **Then** they are prompted to unlock the next tier.

---

### User Story 3 - Tier Unlock Payment (Priority: P3)

A player has completed the free tier (levels 0-39) and wants to unlock the next tier. They see a prompt to pay 0.05 SOL. They confirm the payment, which is processed on-chain, and the next 40 levels become available.

**Why this priority**: This is the monetization mechanism and requires wallet transaction signing.

**Independent Test**: Can be tested by having a player at the tier boundary, initiating payment, and verifying tier unlocks after successful transaction.

**Acceptance Scenarios**:

1. **Given** a player at level 39 who selects "Unlock Next Tier", **When** they confirm the 0.05 SOL payment, **Then** their unlocked tier increases and levels 40-79 become available.
2. **Given** a player without sufficient SOL balance, **When** they attempt to unlock, **Then** they see an error message about insufficient funds.
3. **Given** a payment transaction fails, **When** the error occurs, **Then** the player sees a clear error message and their tier remains unchanged.

---

### User Story 4 - Game Session with On-Chain State (Priority: P4)

A player starts a dungeon run. A game session is created on-chain and delegated to the ephemeral rollup for real-time gameplay. During gameplay, state is periodically committed. When the player completes the run (victory or defeat), the session ends and results are recorded on-chain.

**Why this priority**: This enables the full on-chain gameplay loop but depends on profiles and level selection working first.

**Independent Test**: Can be tested by starting a game, playing through a short run, and verifying session creation, state commits, and run result recording.

**Acceptance Scenarios**:

1. **Given** a player selects a campaign level, **When** they start the game, **Then** a session is created on-chain and delegated to the ephemeral rollup.
2. **Given** a player is in an active session, **When** they defeat the boss, **Then** the session ends, their total runs increments, and their level advances (if applicable).
3. **Given** a player is in an active session, **When** they are defeated, **Then** the session ends, their total runs increments, but their level does not advance.
4. **Given** a player exits the game mid-session, **When** they return, **Then** they can resume their session or abandon it.

---

### User Story 5 - Profile Management (Priority: P5)

A player wants to update their display name or view detailed profile statistics. They access profile settings, make changes, and the updates are persisted on-chain.

**Why this priority**: This is a quality-of-life feature that enhances the user experience but is not critical for core gameplay.

**Independent Test**: Can be tested by changing profile name and verifying the change persists across app restarts.

**Acceptance Scenarios**:

1. **Given** a player on the profile settings screen, **When** they enter a new name and save, **Then** their on-chain profile name is updated.
2. **Given** a player enters a name longer than 32 characters, **When** they try to save, **Then** they see a validation error.
3. **Given** a player views their profile, **When** the screen loads, **Then** they see accurate statistics from on-chain data.

---

### Edge Cases

- What happens when the player loses internet connection during a session? The app should cache state locally and sync when reconnected.
- What happens if the on-chain profile fetch fails? The app should show an error and offer retry, with offline mode as fallback.
- What happens if session delegation fails? The app should allow playing in "offline mode" without on-chain state.
- What happens if the player's wallet is disconnected mid-session? The app should prompt to reconnect before continuing.
- What happens if transaction signing is rejected? The app should handle gracefully without crashing.

## Requirements *(mandatory)*

### Functional Requirements

**Wallet & Profile Integration**

- **FR-001**: App MUST detect when a connected wallet has no on-chain profile and prompt for creation.
- **FR-002**: App MUST display profile data (name, total runs, current level, unlocked tier) from on-chain state.
- **FR-003**: App MUST allow players to update their display name via on-chain transaction.
- **FR-004**: App MUST show loading states during all on-chain operations.
- **FR-005**: App MUST handle transaction signing through the mobile wallet adapter.

**Campaign & Level Selection**

- **FR-006**: App MUST fetch the seed-to-level mapping from on-chain MapConfig.
- **FR-007**: App MUST show only levels within the player's unlocked tier as playable.
- **FR-008**: App MUST use the on-chain seed to generate maps for campaign levels.
- **FR-009**: App MUST verify map generation matches the expected seed.
- **FR-010**: App MUST display locked tiers with unlock prompts.

**Payment & Tier Unlocking**

- **FR-011**: App MUST display the cost (0.05 SOL) clearly before tier unlock.
- **FR-012**: App MUST process tier unlock payment through on-chain transaction.
- **FR-013**: App MUST update UI immediately after successful tier unlock.
- **FR-014**: App MUST show clear error messages for failed payments.

**Session Management**

- **FR-015**: App MUST create an on-chain session when starting a campaign level.
- **FR-016**: App MUST delegate session state to the ephemeral rollup on game start.
- **FR-017**: App MUST commit session state periodically during gameplay.
- **FR-018**: App MUST record run results on-chain when the game ends.
- **FR-019**: App MUST handle session resumption for interrupted games.
- **FR-020**: App MUST prevent starting a new session if one is already active.

**Error Handling & Offline Support**

- **FR-021**: App MUST provide clear error messages for all on-chain failures.
- **FR-022**: App MUST allow basic gameplay without on-chain connectivity (offline mode).
- **FR-023**: App MUST sync offline progress when connectivity is restored.

### Key Entities

- **PlayerProfile (on-chain)**: Player's blockchain identity including wallet address, display name, total runs, current level, and unlocked tier.

- **GameSession (on-chain)**: Active gameplay session with delegation status, session ID, and state hash for verification.

- **LocalProfileCache**: Client-side cache of profile data to enable faster loading and offline access.

- **SessionState**: Local game state that syncs with on-chain session, includes map data, player position, inventory, and combat state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Players can create a profile and start playing within 60 seconds of first wallet connection.
- **SC-002**: 95% of tier unlock payments complete successfully on first attempt.
- **SC-003**: Campaign level loads with correct map within 3 seconds of selection.
- **SC-004**: Session state commits succeed 99% of the time during normal gameplay.
- **SC-005**: Run results are recorded on-chain within 5 seconds of game completion.
- **SC-006**: App remains usable in offline mode when blockchain is unavailable.
- **SC-007**: 90% of players successfully complete the onboarding flow without errors.
- **SC-008**: Profile data refreshes and displays correctly within 2 seconds of app foreground.

## Assumptions

- Solana programs (player-profile, session-manager, map-generator) are deployed to devnet and functional.
- Mobile wallet adapter is available and functional on the target device.
- Players have a Solana wallet app installed (Phantom, Solflare, etc.).
- Initial target is devnet; mainnet deployment is out of scope for this feature.
- Offline mode stores data locally but does not sync to blockchain until online.
- The existing game architecture (GameContext, GameReducer) will be extended, not replaced.
- Session state commits happen every 30 seconds during active gameplay.
