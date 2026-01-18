# Research: Gameplay State Integration with Burner Wallet

**Feature**: 005-gameplay-burner-integration
**Date**: 2025-01-17

## Research Decisions

### RD-001: Burner Wallet Keypair Generation and Storage

**Decision**: Use `@solana/web3.js` Keypair.generate() with expo-secure-store for persistent storage.

**Rationale**:
- Keypair.generate() uses cryptographically secure randomness
- expo-secure-store provides encrypted storage on device
- Allows session recovery if app closes mid-session
- Associates burner with main wallet public key for recovery validation

**Alternatives Considered**:
- HD wallet derivation from main wallet: Requires access to main wallet seed (not available via mobile wallet adapter)
- In-memory only: Would lose burner funds if app closes unexpectedly

**Implementation Pattern**:
```typescript
import { Keypair } from '@solana/web3.js';
import * as SecureStore from 'expo-secure-store';

interface StoredBurner {
  secretKey: string; // base58 encoded
  mainWalletAddress: string;
  createdAt: number;
}

async function createBurnerWallet(mainWalletAddress: string): Promise<Keypair> {
  const keypair = Keypair.generate();
  const stored: StoredBurner = {
    secretKey: bs58.encode(keypair.secretKey),
    mainWalletAddress,
    createdAt: Date.now(),
  };
  await SecureStore.setItemAsync('burner_wallet', JSON.stringify(stored));
  return keypair;
}

async function loadBurnerWallet(mainWalletAddress: string): Promise<Keypair | null> {
  const data = await SecureStore.getItemAsync('burner_wallet');
  if (!data) return null;

  const stored: StoredBurner = JSON.parse(data);
  if (stored.mainWalletAddress !== mainWalletAddress) return null;

  return Keypair.fromSecretKey(bs58.decode(stored.secretKey));
}
```

---

### RD-002: Burner Wallet Funding Strategy

**Decision**: Fund burner with configurable SOL amount via single transaction from main wallet.

**Rationale**:
- Single transaction minimizes user friction (1 signature to start)
- Configurable amount allows tuning based on expected transaction count
- Estimate: ~5000 lamports per transaction × 300 transactions ≈ 0.0015 SOL
- Default fund amount: 0.005 SOL (provides buffer for fee spikes)
- Low balance threshold: 0.001 SOL (triggers top-up warning)

**Implementation Pattern**:
```typescript
const DEFAULT_FUND_AMOUNT = 0.005 * LAMPORTS_PER_SOL; // 5,000,000 lamports
const LOW_BALANCE_THRESHOLD = 0.001 * LAMPORTS_PER_SOL; // 1,000,000 lamports

async function createFundBurnerTransaction(
  mainWallet: PublicKey,
  burnerWallet: PublicKey,
  amount: number = DEFAULT_FUND_AMOUNT
): Promise<Transaction> {
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: mainWallet,
      toPubkey: burnerWallet,
      lamports: amount,
    })
  );
  return transaction;
}
```

---

### RD-003: Gameplay State Program Integration

**Decision**: Use @coral-xyz/anchor with typed IDL for gameplay-state program calls.

**Rationale**:
- Consistent with 004-solana-frontend-integration patterns
- Type-safe instruction building
- Automatic PDA derivation matching on-chain seeds

**PDA Seeds** (from 002-gameplay-state-tracking):
```typescript
// GameState: ["game_state", session_pda.as_ref()]
const [gameStatePda] = PublicKey.findProgramAddressSync(
  [Buffer.from("game_state"), sessionPda.toBuffer()],
  GAMEPLAY_STATE_PROGRAM_ID
);
```

**Implementation Pattern**:
```typescript
import { Program } from "@coral-xyz/anchor";
import type { GameplayState } from "./idl/gameplay_state";

// Initialize game state (called once at session start)
async function initializeGameState(
  program: Program<GameplayState>,
  sessionPda: PublicKey,
  burnerKeypair: Keypair,
  mapWidth: number,
  mapHeight: number,
  startX: number,
  startY: number
): Promise<string> {
  const [gameStatePda] = getGameStatePda(sessionPda);

  const tx = await program.methods
    .initializeGameState(mapWidth, mapHeight, startX, startY)
    .accounts({
      gameState: gameStatePda,
      gameSession: sessionPda,
      player: burnerKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([burnerKeypair])
    .rpc();

  return tx;
}

// Move player (called on each movement)
async function movePlayer(
  program: Program<GameplayState>,
  gameStatePda: PublicKey,
  burnerKeypair: Keypair,
  targetX: number,
  targetY: number,
  isWall: boolean
): Promise<string> {
  const tx = await program.methods
    .movePlayer(targetX, targetY, isWall)
    .accounts({
      gameState: gameStatePda,
      player: burnerKeypair.publicKey,
    })
    .signers([burnerKeypair])
    .rpc();

  return tx;
}
```

---

### RD-004: Burner Wallet State Machine

**Decision**: Implement explicit 5-state machine for burner lifecycle.

**Rationale**:
- Constitution P01 requires explicit state machines
- Clear states prevent invalid operations
- Enables deterministic UI feedback

**State Diagram**:
```
IDLE → FUNDING → ACTIVE → DRAINING → IDLE
         ↓                    ↓
      FAILED              FAILED (→ IDLE on retry/dismiss)
```

**States**:
1. `IDLE`: No burner wallet exists or has been cleared
2. `FUNDING`: Main wallet funding burner (awaiting signature)
3. `ACTIVE`: Burner funded and ready for gameplay transactions
4. `DRAINING`: Returning funds to main wallet
5. `FAILED`: Error occurred, can retry or dismiss

**Implementation Pattern**:
```typescript
type BurnerState = 'idle' | 'funding' | 'active' | 'draining' | 'failed';

interface BurnerWalletState {
  state: BurnerState;
  keypair: Keypair | null;
  balance: number; // lamports
  error: string | null;
}
```

---

### RD-005: Transaction Signing with Burner

**Decision**: Burner keypair signs transactions directly without wallet adapter.

**Rationale**:
- Burner keypair is locally available (unlike main wallet)
- No mobile wallet adapter popup needed
- Transactions execute instantly without user interaction
- Main wallet only needed for funding and draining

**Implementation Pattern**:
```typescript
async function sendBurnerTransaction(
  connection: Connection,
  transaction: Transaction,
  burnerKeypair: Keypair
): Promise<string> {
  transaction.feePayer = burnerKeypair.publicKey;
  transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  transaction.sign(burnerKeypair);

  const signature = await connection.sendRawTransaction(transaction.serialize());
  await connection.confirmTransaction(signature, 'confirmed');

  return signature;
}
```

---

### RD-006: On-Chain State Synchronization

**Decision**: Fetch on-chain GameState after each transaction with optimistic UI updates.

**Rationale**:
- On-chain state is source of truth (Constitution P03)
- Optimistic updates maintain responsive UI (Constitution P06)
- Reconcile on-chain state if differs from local expectation

**Implementation Pattern**:
```typescript
interface GameplayStateSync {
  // Local state (for optimistic UI)
  local: GameState | null;
  // On-chain state (source of truth)
  onChain: GameState | null;
  // Whether states match
  isSynced: boolean;
  // Last sync timestamp
  lastSyncAt: number;
}

async function syncGameplayState(
  program: Program<GameplayState>,
  gameStatePda: PublicKey
): Promise<GameState | null> {
  try {
    const account = await program.account.gameState.fetch(gameStatePda);
    return {
      positionX: account.positionX,
      positionY: account.positionY,
      hp: account.hp,
      maxHp: account.maxHp,
      atk: account.atk,
      arm: account.arm,
      spd: account.spd,
      dig: account.dig,
      gearSlots: account.gearSlots,
      week: account.week,
      phase: account.phase,
      movesRemaining: account.movesRemaining,
      totalMoves: account.totalMoves,
      bossFightReady: account.bossFightReady,
    };
  } catch {
    return null;
  }
}
```

---

### RD-007: Offline Transaction Queue

**Decision**: Queue transactions locally when offline, execute when connectivity returns.

**Rationale**:
- FR-020 requires retry logic for transient network errors
- Spec edge case: "Queue move locally, retry when network returns"
- Maintains gameplay continuity during brief connectivity issues

**Implementation Pattern**:
```typescript
interface QueuedTransaction {
  id: string;
  type: 'move' | 'modifyStat';
  params: MoveParams | ModifyStatParams;
  timestamp: number;
  retries: number;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function processQueue(
  queue: QueuedTransaction[],
  execute: (tx: QueuedTransaction) => Promise<boolean>
): Promise<void> {
  for (const tx of queue) {
    const success = await execute(tx);
    if (success) {
      // Remove from queue
    } else if (tx.retries < MAX_RETRIES) {
      tx.retries++;
      await delay(RETRY_DELAY_MS);
    } else {
      // Mark as failed, alert user
    }
  }
}
```

---

### RD-008: Session End and Burner Drain

**Decision**: Drain burner back to main wallet via transfer instruction, signed by burner.

**Rationale**:
- Burner can sign its own drain transaction (no main wallet signature needed)
- Returns all remaining SOL minus transaction fee
- Main wallet receives funds automatically

**Implementation Pattern**:
```typescript
async function drainBurnerToMain(
  connection: Connection,
  burnerKeypair: Keypair,
  mainWalletAddress: PublicKey
): Promise<string> {
  const balance = await connection.getBalance(burnerKeypair.publicKey);
  const rentExempt = await connection.getMinimumBalanceForRentExemption(0);
  const txFee = 5000; // Estimated transaction fee

  const transferAmount = balance - txFee;
  if (transferAmount <= 0) {
    throw new Error('Insufficient balance to drain');
  }

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: burnerKeypair.publicKey,
      toPubkey: mainWalletAddress,
      lamports: transferAmount,
    })
  );

  return sendBurnerTransaction(connection, transaction, burnerKeypair);
}
```

---

### RD-009: Session Recovery on App Restart

**Decision**: Detect existing burner wallet on app launch, offer resume or abandon.

**Rationale**:
- FR-015 requires session detection on app launch
- Prevents loss of burner funds if app closes unexpectedly
- User can choose to resume or drain funds and start fresh

**Implementation Pattern**:
```typescript
interface SessionRecoveryState {
  hasPendingSession: boolean;
  burnerBalance: number;
  gameStatePda: PublicKey | null;
}

async function checkForPendingSession(
  mainWalletAddress: string,
  connection: Connection
): Promise<SessionRecoveryState> {
  const burner = await loadBurnerWallet(mainWalletAddress);
  if (!burner) {
    return { hasPendingSession: false, burnerBalance: 0, gameStatePda: null };
  }

  const balance = await connection.getBalance(burner.publicKey);
  if (balance > 0) {
    // Check if game state exists
    const [gameStatePda] = await findGameStatePda(burner.publicKey);
    const gameStateExists = await checkAccountExists(connection, gameStatePda);

    return {
      hasPendingSession: true,
      burnerBalance: balance,
      gameStatePda: gameStateExists ? gameStatePda : null,
    };
  }

  // Burner exists but empty - clear it
  await clearBurnerWallet();
  return { hasPendingSession: false, burnerBalance: 0, gameStatePda: null };
}
```

---

### RD-010: Error Handling Strategy

**Decision**: Map Anchor errors to user-friendly messages with retry options.

**Rationale**:
- FR-019 requires clear error messages
- Gameplay-state program has specific error codes (6000+)
- Users need actionable error information

**Implementation Pattern**:
```typescript
const GAMEPLAY_ERROR_MESSAGES: Record<number, string> = {
  6000: "Target position is out of map boundaries",
  6001: "Not enough moves remaining for this action",
  6002: "Target position is not adjacent to current position",
  6003: "Stat value would overflow",
  6004: "HP cannot go below 0",
  6005: "Invalid stat modification",
  6006: "Boss fight already triggered - session ending",
  6007: "Unauthorized action",
  6008: "Session is not active",
  6009: "Arithmetic overflow",
};

function getUserErrorMessage(error: unknown): string {
  if (error instanceof AnchorError) {
    return GAMEPLAY_ERROR_MESSAGES[error.error.errorCode.number] ??
           `Transaction failed: ${error.error.errorMessage}`;
  }
  if (error instanceof Error && error.message.includes('insufficient funds')) {
    return "Burner wallet needs more SOL. Please top up.";
  }
  return "An unexpected error occurred. Please try again.";
}
```

## Dependencies

No new dependencies required. All packages already installed from 004-solana-frontend-integration:
- `@coral-xyz/anchor`
- `@solana/web3.js`
- `expo-secure-store`

## IDL Integration

Copy the gameplay-state IDL from `solana-programs/target/idl/gameplay_state.json` to:
`src/services/solana/idl/gameplay_state.json`

Generate TypeScript types:
```bash
anchor idl types -o src/services/solana/types/gameplay_state.ts target/idl/gameplay_state.json
```
