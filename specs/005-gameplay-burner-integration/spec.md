# Feature Specification: Gameplay State Integration with Burner Wallet

**Feature Branch**: `005-gameplay-burner-integration`
**Created**: 2025-01-17
**Status**: Draft
**Input**: Integrate gameplay-state Solana program with frontend and add burner wallet for gasless gameplay

## Overview

This feature integrates the on-chain gameplay-state program (002-gameplay-state-tracking) with the mobile app frontend, enabling verifiable game runs. To provide a seamless gaming experience without constant wallet signature prompts, a burner wallet system is introduced: an ephemeral keypair funded by the player's main wallet that handles all in-game transactions automatically. This is a stepping stone toward MagicBlock session keys integration.

## User Scenarios & Testing

### User Story 1 - Seamless Gameplay Session (Priority: P1)

As a player, I want to play through a dungeon run without being interrupted by wallet signature prompts for every move, so that I can enjoy uninterrupted gameplay.

**Why this priority**: Core user experience. Without this, players would need to sign 200+ transactions per run (50+30+50+30+50+30 moves per week × 3 weeks), making the game unplayable.

**Independent Test**: Start a game session, make multiple moves and dig through walls, verify moves execute instantly without signature prompts after initial session setup.

**Acceptance Scenarios**:

1. **Given** a player with a connected wallet, **When** they start a new game session, **Then** they are prompted to sign once to fund the burner wallet
2. **Given** an active game session with a funded burner, **When** the player moves to an adjacent floor tile, **Then** the move executes immediately without any signature prompt
3. **Given** an active game session with a funded burner, **When** the player digs through a wall, **Then** the dig executes immediately and deducts the correct move cost
4. **Given** an active game session, **When** the player makes a move, **Then** the on-chain position updates to match the displayed position
5. **Given** an active game session, **When** the player makes the last move of a day phase, **Then** the game automatically transitions to night phase with correct moves remaining

---

### User Story 2 - On-Chain State Visibility (Priority: P2)

As a player, I want to see my game state (position, stats, phase, week) reflected accurately from the on-chain data, so that I can trust the game is tracking my progress verifiably.

**Why this priority**: Builds trust in the on-chain verification system. Players need confidence their progress is recorded.

**Independent Test**: Start a session, make moves, verify the UI displays data fetched from the on-chain GameState account.

**Acceptance Scenarios**:

1. **Given** an initialized game state, **When** the game screen loads, **Then** it displays position, stats, phase, week, and moves remaining from on-chain data
2. **Given** a game in progress, **When** a move completes on-chain, **Then** the UI updates to reflect the new on-chain state within 2 seconds
3. **Given** a game state with modified stats, **When** the player views their stats, **Then** they see the on-chain values (HP, ATK, ARM, SPD, DIG)
4. **Given** a game entering a new week, **When** gear slots increase on-chain, **Then** the UI reflects the updated gear slot count

---

### User Story 3 - Session Lifecycle Management (Priority: P3)

As a player, I want the game to properly manage my session lifecycle (start, play, end) and handle edge cases gracefully, so that I don't lose progress or funds.

**Why this priority**: Essential for reliability. Players need confidence the system handles errors and cleanup properly.

**Independent Test**: Start session, play partially, end session early, verify cleanup happens and funds return.

**Acceptance Scenarios**:

1. **Given** a player starting a new game, **When** the session is created, **Then** both the game session and gameplay state are initialized on-chain
2. **Given** an active session with burner funds, **When** the player ends the session, **Then** remaining SOL is returned to the main wallet
3. **Given** a player who closes the app mid-session, **When** they reopen the app, **Then** the existing session is detected and resumed
4. **Given** a burner wallet running low on funds during gameplay, **When** balance drops below threshold, **Then** the player is warned and offered to top up

---

### User Story 4 - Run Completion and Recording (Priority: P4)

As a player, I want my completed runs to be recorded to my profile, so that my progress persists across sessions.

**Why this priority**: Enables progression system. Without this, runs have no lasting impact.

**Independent Test**: Complete a run (reach boss fight ready state), verify profile's totalRuns increments and currentLevel updates if applicable.

**Acceptance Scenarios**:

1. **Given** a player reaching boss fight ready state, **When** the run ends successfully, **Then** their profile's totalRuns is incremented
2. **Given** a player completing a campaign level for the first time, **When** the run ends with victory, **Then** their currentLevel increases by 1
3. **Given** a player who abandons a run early, **When** they end the session, **Then** totalRuns still increments but currentLevel does not change

---

### Edge Cases

- What happens if the burner wallet runs out of SOL mid-game? Display warning, allow top-up, pause gameplay until funded.
- What happens if the network is unavailable during a move? Queue move locally, retry when network returns, show offline indicator.
- What happens if a player has an existing session from a previous app instance? Detect and offer to resume or abandon.
- What happens if the main wallet disconnects mid-session? Pause gameplay, prompt reconnection, burner continues to hold funds safely.
- What happens if transaction confirmation takes too long? Show pending state, retry with higher priority fee if needed.
- What happens if the on-chain state and local state diverge? Trust on-chain state, resync local display.

## Requirements

### Functional Requirements

#### Burner Wallet Management

- **FR-001**: System MUST create a new ephemeral keypair when starting a game session
- **FR-002**: System MUST securely store the burner keypair locally for session recovery
- **FR-003**: System MUST transfer a configurable amount of SOL from main wallet to burner on session start
- **FR-004**: System MUST use the burner wallet to sign all gameplay transactions (move, modify_stat)
- **FR-005**: System MUST return remaining SOL from burner to main wallet when session ends
- **FR-006**: System MUST warn users when burner balance drops below a threshold
- **FR-007**: System MUST allow users to top up the burner wallet mid-session

#### Gameplay State Integration

- **FR-008**: System MUST call initialize_game_state when starting a new game with map dimensions and starting position
- **FR-009**: System MUST call move_player for each player movement with target coordinates and tile type
- **FR-010**: System MUST call modify_stat when game events require stat changes
- **FR-011**: System MUST call close_game_state when ending a session
- **FR-012**: System MUST fetch and display on-chain GameState data (position, stats, phase, week, moves)
- **FR-013**: System MUST handle phase transitions triggered by on-chain logic (day→night, week changes)
- **FR-014**: System MUST display boss_fight_ready state when triggered on-chain

#### Session Lifecycle

- **FR-015**: System MUST detect existing sessions on app launch and offer resume/abandon options
- **FR-016**: System MUST coordinate GameSession (session-manager) and GameState (gameplay-state) creation
- **FR-017**: System MUST handle session cleanup when player ends game (close GameState, end GameSession, drain burner)
- **FR-018**: System MUST integrate with player-profile to record run results after session ends

#### Error Handling

- **FR-019**: System MUST display clear error messages for transaction failures
- **FR-020**: System MUST implement retry logic for transient network errors
- **FR-021**: System MUST gracefully handle wallet disconnection during active session
- **FR-022**: System MUST validate on-chain state before displaying to prevent stale data

### Key Entities

- **BurnerWallet**: Ephemeral keypair created per session, stores keypair securely, associated with main wallet public key, tracks balance and session association.

- **GameplayStateAccount**: On-chain account containing position (x,y), stats (HP, ATK, ARM, SPD, DIG), phase, week, moves_remaining, gear_slots, boss_fight_ready flag.

- **SessionContext**: Extended context managing both session-manager session and gameplay-state, coordinates lifecycle between the two programs plus burner wallet.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Players complete full game sessions (240 moves) with only 2 wallet signature prompts (session start, session end)
- **SC-002**: 95% of move transactions confirm within 2 seconds on devnet
- **SC-003**: Game state synchronization between local display and on-chain data occurs within 2 seconds of transaction confirmation
- **SC-004**: 100% of ended sessions return remaining burner funds to main wallet
- **SC-005**: App correctly resumes 100% of interrupted sessions when reopened
- **SC-006**: Zero SOL lost due to burner wallet management issues in normal operation

## Assumptions

- The gameplay-state program (002-gameplay-state-tracking) is deployed and functional
- The session-manager and player-profile programs from 001-solana-core-programs are available
- Players have sufficient SOL in their main wallet to fund the burner (minimum 0.01 SOL)
- Network connectivity is generally available (offline mode is queued for future feature)
- Map data (dimensions, tile types) is available from the existing map generation system
- This is a devnet/hackathon implementation; mainnet would require additional security review

## Out of Scope

- MagicBlock session keys integration (future enhancement)
- Full offline gameplay with sync (future feature)
- Multi-device session handoff
- Automated burner top-up without user confirmation
- Gas optimization beyond basic transaction bundling
