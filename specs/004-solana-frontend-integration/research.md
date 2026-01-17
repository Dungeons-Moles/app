# Research: Solana Frontend Integration

**Feature**: 004-solana-frontend-integration
**Date**: 2025-01-15

## Research Decisions

### RD-001: Anchor TypeScript Client Integration

**Decision**: Use `@coral-xyz/anchor` with typed IDL imports for program interactions.

**Rationale**:
- Provides type-safe program method calls via `program.methods.instructionName()`
- Automatic PDA derivation and account resolution
- Built-in instruction builder pattern for transaction construction
- Native integration with `@solana/web3.js` Connection and Transaction

**Alternatives Considered**:
- Raw `@solana/web3.js` only: More boilerplate, manual instruction encoding
- solana-app-kit: Additional abstraction layer, potential lock-in

**Implementation Pattern**:
```typescript
import { Program } from "@coral-xyz/anchor";
import type { PlayerProfile } from "./idl/player_profile";
import idl from "./idl/player_profile.json";

const program = new Program(idl as PlayerProfile, { connection });

// Type-safe instruction building
const tx = await program.methods
  .initializeProfile("PlayerName")
  .accounts({
    playerProfile: profilePda,
    owner: walletPublicKey,
    systemProgram: SystemProgram.programId,
  })
  .transaction();
```

---

### RD-002: Mobile Wallet Adapter Transaction Signing

**Decision**: Extend existing `WalletContext` with `signAndSendTransaction` method using `transact()`.

**Rationale**:
- Existing app already uses `@solana-mobile/mobile-wallet-adapter-protocol-web3js`
- `transact()` provides atomic authorization + signing workflow
- Reuses existing `APP_IDENTITY` and auth token management

**Alternatives Considered**:
- solana-app-kit TransactionService: Additional dependency, different patterns
- Direct wallet SDK: Already using the recommended mobile approach

**Implementation Pattern**:
```typescript
const signAndSendTransaction = async (transaction: Transaction): Promise<string> => {
  return await transact(async (wallet: Web3MobileWallet) => {
    // Reauthorize if needed
    await wallet.authorize({
      cluster: 'devnet',
      identity: APP_IDENTITY,
      auth_token: authToken,
    });

    // Sign and send
    const signatures = await wallet.signAndSendTransactions({
      transactions: [transaction],
    });

    return bs58.encode(signatures[0]);
  });
};
```

---

### RD-003: Program Provider Pattern

**Decision**: Create program instances without wallet for read operations, with wallet for write operations.

**Rationale**:
- Read operations (fetching profiles, map seeds) don't require wallet connection
- Write operations need wallet for transaction signing
- Allows app to display data before wallet connects
- Follows Anchor's flexible program construction patterns

**Implementation Pattern**:
```typescript
// Read-only program (no wallet needed)
const readOnlyProgram = new Program(idl as PlayerProfile, { connection });

// Write-capable program (requires wallet)
const writeProgram = new Program(idl as PlayerProfile, {
  connection,
  // Wallet provider created from mobile wallet adapter
});
```

---

### RD-004: Local Profile Caching

**Decision**: Use `expo-secure-store` for profile cache with TTL-based invalidation.

**Rationale**:
- Already a dependency in the project (`expo-secure-store: ~15.0.8`)
- Secure storage for sensitive wallet-associated data
- Supports JSON serialization for complex objects
- Enables offline profile display and faster app startup

**Alternatives Considered**:
- AsyncStorage: Less secure, no encryption
- MMKV: Additional native dependency, overkill for profile data
- In-memory only: No offline support

**Implementation Pattern**:
```typescript
interface CachedProfile {
  data: ProfileData;
  timestamp: number;
  walletAddress: string;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getCachedProfile(address: string): Promise<ProfileData | null> {
  const cached = await SecureStore.getItemAsync(`profile_${address}`);
  if (!cached) return null;

  const parsed: CachedProfile = JSON.parse(cached);
  if (Date.now() - parsed.timestamp > CACHE_TTL) return null;

  return parsed.data;
}
```

---

### RD-005: Session State Machine

**Decision**: Implement explicit session state machine with 6 states.

**Rationale**:
- Constitution P01 requires explicit state machines
- Session lifecycle has clear states and transitions
- Prevents invalid operations (e.g., ending non-active session)
- Enables clear UI feedback for each state

**State Diagram**:
```
IDLE → STARTING → DELEGATING → ACTIVE → ENDING → IDLE
                      ↓
                   FAILED (→ IDLE on retry/dismiss)
```

**States**:
1. `IDLE`: No active session
2. `STARTING`: Creating on-chain session account
3. `DELEGATING`: Delegating to MagicBlock ephemeral rollup
4. `ACTIVE`: Session delegated, gameplay in progress
5. `ENDING`: Committing final state and undelegating
6. `FAILED`: Error occurred, can retry or dismiss

---

### RD-006: Offline Mode Strategy

**Decision**: Three-tier fallback with graceful degradation.

**Rationale**:
- FR-022 requires basic gameplay without on-chain connectivity
- Players shouldn't be blocked from playing by network issues
- Progress can be synced when connectivity returns

**Tiers**:
1. **Online Mode**: Full on-chain session, seed verification, run recording
2. **Cached Mode**: Use cached profile, random seed, queue run results for later sync
3. **Guest Mode**: No profile, random seed, no run recording

**Implementation Pattern**:
```typescript
type ConnectivityMode = 'online' | 'cached' | 'guest';

function determineMode(
  isConnected: boolean,
  cachedProfile: ProfileData | null
): ConnectivityMode {
  if (isConnected) return 'online';
  if (cachedProfile) return 'cached';
  return 'guest';
}
```

---

### RD-007: PDA Derivation

**Decision**: Client-side PDA derivation using seeds matching on-chain programs.

**Rationale**:
- PDAs must match exactly between client and program
- Reduces on-chain compute by pre-computing addresses
- Enables account existence checks before transactions

**Seeds** (from Solana program specs):
```typescript
// PlayerProfile: ["player", owner.key()]
const [profilePda] = PublicKey.findProgramAddressSync(
  [Buffer.from("player"), ownerPubkey.toBuffer()],
  PLAYER_PROFILE_PROGRAM_ID
);

// GameSession: ["session", player.key()]
const [sessionPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("session"), playerPubkey.toBuffer()],
  SESSION_MANAGER_PROGRAM_ID
);

// MapConfig: ["map_config"]
const [mapConfigPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("map_config")],
  MAP_GENERATOR_PROGRAM_ID
);

// Treasury: ["treasury"]
const [treasuryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("treasury")],
  PLAYER_PROFILE_PROGRAM_ID
);
```

---

### RD-008: Error Handling Strategy

**Decision**: Typed error mapping with user-friendly messages.

**Rationale**:
- Anchor errors have specific codes (6000+)
- Users need understandable error messages
- Constitution requires clear error handling (FR-021)

**Implementation Pattern**:
```typescript
const ERROR_MESSAGES: Record<number, string> = {
  6000: "You already have a profile for this wallet",
  6001: "Name must be 32 characters or less",
  6002: "Complete your current tier before unlocking the next",
  6003: "Insufficient SOL balance for tier unlock",
  6004: "Wallet authentication required",
  6005: "This level is beyond your unlocked tier",
};

function getUserErrorMessage(error: unknown): string {
  if (error instanceof AnchorError) {
    return ERROR_MESSAGES[error.error.errorCode.number] ??
           `Transaction failed: ${error.error.errorMessage}`;
  }
  return "An unexpected error occurred. Please try again.";
}
```

## Dependencies to Add

```json
{
  "dependencies": {
    "@coral-xyz/anchor": "^0.30.0"
  }
}
```

Note: `@solana/web3.js`, `@solana-mobile/mobile-wallet-adapter-protocol-web3js`, and `expo-secure-store` are already installed.
