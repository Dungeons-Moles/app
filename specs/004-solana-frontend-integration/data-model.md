# Data Model: Solana Frontend Integration

**Feature**: 004-solana-frontend-integration
**Date**: 2025-01-15

## Overview

This document defines the client-side TypeScript interfaces for integrating with the Solana Core Programs. These types mirror the on-chain account structures and provide type safety for frontend operations.

## On-Chain Account Types

These interfaces represent data fetched from Solana program accounts.

### PlayerProfile

```typescript
/**
 * Player profile stored on-chain in the player-profile program.
 * PDA seeds: ["player", owner.key()]
 */
interface PlayerProfile {
  /** Wallet public key that owns this profile */
  owner: PublicKey;
  /** Display name (max 32 characters) */
  name: string;
  /** Total dungeon runs completed */
  totalRuns: number;
  /** Current campaign level (0-80+) */
  currentLevel: number;
  /** Highest tier unlocked (0 = free tier, levels 0-39) */
  unlockedTier: number;
  /** Unix timestamp of profile creation */
  createdAt: number;
  /** PDA bump seed */
  bump: number;
}
```

### GameSession

```typescript
/**
 * Active game session stored on-chain in the session-manager program.
 * PDA seeds: ["session", player.key()]
 */
interface GameSession {
  /** Player wallet address */
  player: PublicKey;
  /** Unique session identifier */
  sessionId: bigint;
  /** Campaign level being played */
  campaignLevel: number;
  /** Session start timestamp */
  startedAt: number;
  /** Last activity timestamp */
  lastActivity: number;
  /** Whether delegated to MagicBlock rollup */
  isDelegated: boolean;
  /** Current state hash (32 bytes) */
  stateHash: Uint8Array;
  /** PDA bump seed */
  bump: number;
}
```

### MapConfig

```typescript
/**
 * Map configuration stored on-chain in the map-generator program.
 * PDA seeds: ["map_config"]
 */
interface MapConfig {
  /** Admin public key that can update seeds */
  admin: PublicKey;
  /** Seeds for levels 0-80 (81 entries) */
  seeds: bigint[];
  /** Config version for migrations */
  version: number;
  /** PDA bump seed */
  bump: number;
}
```

## Client-Side Types

### Profile Context State

```typescript
/**
 * State managed by ProfileContext for the connected wallet's profile.
 */
interface ProfileState {
  /** Current profile data (null if not loaded or doesn't exist) */
  profile: PlayerProfile | null;
  /** Loading state for profile operations */
  isLoading: boolean;
  /** Error message from last operation */
  error: string | null;
  /** Whether profile exists on-chain for connected wallet */
  exists: boolean;
  /** Whether using cached data (offline mode) */
  isCached: boolean;
}
```

### Session State Machine

```typescript
/**
 * Session states following Constitution P01 (Explicit State Machines).
 */
type SessionStatus =
  | 'IDLE'       // No active session
  | 'STARTING'   // Creating on-chain session
  | 'DELEGATING' // Delegating to MagicBlock
  | 'ACTIVE'     // Session active, gameplay in progress
  | 'ENDING'     // Committing final state, undelegating
  | 'FAILED';    // Error state, can retry or dismiss

/**
 * State managed by useGameSession hook.
 */
interface SessionState {
  /** Current session status */
  status: SessionStatus;
  /** Active session data (null if IDLE) */
  session: GameSession | null;
  /** Error message for FAILED state */
  error: string | null;
  /** Campaign level for current/pending session */
  campaignLevel: number | null;
}
```

### Campaign Level Selection

```typescript
/**
 * Represents a campaign level for UI display.
 */
interface CampaignLevel {
  /** Level number (0-80) */
  level: number;
  /** Whether player can access this level */
  isUnlocked: boolean;
  /** Whether player has completed this level */
  isCompleted: boolean;
  /** Tier this level belongs to (0-2) */
  tier: number;
  /** Seed for map generation (if unlocked) */
  seed: bigint | null;
}

/**
 * Campaign tier information for unlock prompts.
 */
interface CampaignTier {
  /** Tier number (0 = free, 1+  = paid) */
  tier: number;
  /** Level range start (inclusive) */
  levelStart: number;
  /** Level range end (inclusive) */
  levelEnd: number;
  /** Cost to unlock in lamports (0 for tier 0) */
  unlockCost: bigint;
  /** Whether this tier is unlocked */
  isUnlocked: boolean;
}

/** Cost per tier unlock in lamports (0.05 SOL) */
const TIER_UNLOCK_COST = 50_000_000n;

/** Levels per tier */
const LEVELS_PER_TIER = 40;
```

### Local Cache Types

```typescript
/**
 * Cached profile data stored in expo-secure-store.
 */
interface CachedProfile {
  /** Profile data */
  data: ProfileData;
  /** Cache timestamp */
  timestamp: number;
  /** Wallet address this cache belongs to */
  walletAddress: string;
}

/**
 * Simplified profile data for caching (without PublicKey objects).
 */
interface ProfileData {
  owner: string;
  name: string;
  totalRuns: number;
  currentLevel: number;
  unlockedTier: number;
  createdAt: number;
}
```

### Connectivity Mode

```typescript
/**
 * App connectivity mode determining available features.
 */
type ConnectivityMode =
  | 'online'  // Full on-chain functionality
  | 'cached'  // Using cached profile, limited functionality
  | 'guest';  // No profile, guest gameplay only

/**
 * Connectivity state for the app.
 */
interface ConnectivityState {
  /** Current mode */
  mode: ConnectivityMode;
  /** Whether Solana RPC is reachable */
  isRpcConnected: boolean;
  /** Last successful RPC timestamp */
  lastConnected: number | null;
}
```

### Transaction State

```typescript
/**
 * State for tracking in-flight transactions.
 */
interface TransactionState {
  /** Whether a transaction is pending */
  isPending: boolean;
  /** Transaction signature (after send, before confirm) */
  signature: string | null;
  /** Transaction status */
  status: 'idle' | 'signing' | 'sending' | 'confirming' | 'confirmed' | 'failed';
  /** Error message if failed */
  error: string | null;
}
```

## Relationships

```text
┌─────────────────────────────────────────────────────────────────┐
│                        WalletContext                            │
│  (wallet connection, transaction signing)                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ ProfileContext  │ │ useGameSession  │ │ useMapGenerator │
│                 │ │                 │ │                 │
│ - PlayerProfile │ │ - GameSession   │ │ - MapConfig     │
│ - CachedProfile │ │ - SessionState  │ │ - CampaignLevel │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         └───────────────────┴───────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   GameContext   │
                    │ (game state +   │
                    │  session sync)  │
                    └─────────────────┘
```

## Validation Rules

### Profile Name
- Maximum 32 characters
- Minimum 1 character
- No validation on character types (allows unicode)

### Campaign Level
- Must be 0-80 (inclusive)
- Must be within unlocked tier: `level < (unlockedTier + 1) * 40`

### Tier Unlock
- Player must have completed current tier (at tier boundary)
- Wallet must have sufficient SOL balance (0.05 SOL + rent)

## State Transitions

### Profile Lifecycle

```
[Wallet Connected] → [Check Profile Exists]
                            │
           ┌────────────────┴────────────────┐
           ▼                                 ▼
    [Profile Exists]                 [No Profile]
           │                                 │
           ▼                                 ▼
    [Fetch Profile]              [Show Profile Creation]
           │                                 │
           ▼                                 ▼
    [Profile Loaded]             [Create Profile TX]
                                             │
                                             ▼
                                    [Profile Created]
```

### Session Lifecycle

```
[IDLE] ──start_session()──► [STARTING]
                                 │
                        success  │  failure
                    ┌────────────┴────────────┐
                    ▼                         ▼
             [DELEGATING]                 [FAILED]
                    │                         │
           success  │  failure      dismiss/  │
              ┌─────┴─────┐         retry     │
              ▼           ▼                   │
          [ACTIVE]    [FAILED]◄───────────────┘
              │
     end_session()
              │
              ▼
          [ENDING]
              │
     success  │  failure
         ┌────┴────┐
         ▼         ▼
      [IDLE]   [FAILED]
```
