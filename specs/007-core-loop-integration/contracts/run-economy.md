# Contract: Run Economy

**Feature**: `007-core-loop-integration` | **Date**: 2026-01-22

## Overview

Run purchase flow allowing players to buy 20 runs for 0.001 SOL.

## Constants

```typescript
const RUN_PRICE_LAMPORTS = 1_000_000; // 0.001 SOL
const RUNS_PER_PURCHASE = 20;
const TREASURY_PUBKEY = new PublicKey('...'); // Production treasury
```

## Instructions

### purchaseRuns

Purchases 20 runs for 0.001 SOL.

```typescript
async function purchaseRuns(
  connection: Connection,
  program: Program<PlayerProfile>,
  mainWallet: PublicKey
): Promise<string>;
```

**Accounts**:

| Account       | Type        | Description            |
| ------------- | ----------- | ---------------------- |
| playerProfile | mut         | Player's profile PDA   |
| owner         | signer, mut | Main wallet (pays SOL) |
| treasury      | mut         | Treasury receiving SOL |
| systemProgram | program     | System program         |

**Implementation**:

```typescript
async function purchaseRuns(
  connection: Connection,
  program: Program<PlayerProfile>,
  mainWallet: PublicKey
): Promise<string> {
  const [profilePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('player'), mainWallet.toBuffer()],
    PLAYER_PROFILE_PROGRAM_ID
  );

  const signature = await program.methods
    .purchaseRuns()
    .accounts({
      playerProfile: profilePda,
      owner: mainWallet,
      treasury: TREASURY_PUBKEY,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return signature;
}
```

---

## Events

### RunsPurchasedEvent

Emitted when runs are purchased.

```typescript
interface RunsPurchasedEvent {
  owner: PublicKey;
  runsAdded: number;
  newTotal: number;
  timestamp: number;
}
```

**Anchor Event Schema**:

```rust
#[event]
pub struct RunsPurchased {
    pub owner: Pubkey,
    pub runs_added: u32,
    pub new_total: u32,
    pub timestamp: i64,
}
```

---

## Profile Queries

### getRunCount

Fetches current available runs.

```typescript
async function getRunCount(
  connection: Connection,
  program: Program<PlayerProfile>,
  playerPubkey: PublicKey
): Promise<number>;
```

**Implementation**:

```typescript
async function getRunCount(
  connection: Connection,
  program: Program<PlayerProfile>,
  playerPubkey: PublicKey
): Promise<number> {
  const [profilePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('player'), playerPubkey.toBuffer()],
    PLAYER_PROFILE_PROGRAM_ID
  );

  const profile = await program.account.playerProfile.fetch(profilePda);
  return profile.availableRuns;
}
```

---

## UI Components

### RunPurchaseScreen

Dedicated screen for purchasing runs.

```typescript
interface RunPurchaseScreenProps {
  currentRuns: number;
  solBalance: number;
  onPurchase: () => Promise<void>;
  onCancel: () => void;
}
```

**Layout**:

```
┌─────────────────────────────────────────┐
│                                         │
│           Purchase Runs                 │
│                                         │
│     Current Runs: 3                     │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │                                 │   │
│   │   20 Runs for 0.001 SOL        │   │
│   │                                 │   │
│   └─────────────────────────────────┘   │
│                                         │
│     Your Balance: 0.125 SOL             │
│                                         │
│   [Cancel]            [Purchase]        │
│                                         │
└─────────────────────────────────────────┘
```

---

### RunCountBadge

Displays run count in profile/hub areas.

```typescript
interface RunCountBadgeProps {
  runs: number;
  onPress: () => void; // Navigate to purchase
}
```

**Display**:

- Shows run count with icon
- Turns red when runs <= 3
- Tappable to navigate to purchase screen

---

## State Machine

### PurchaseState

```typescript
type PurchaseState =
  | { status: 'idle' }
  | { status: 'confirming' }
  | { status: 'pending'; signature: string }
  | { status: 'success'; newTotal: number }
  | { status: 'error'; message: string };
```

**Transitions**:

```
idle → confirming (user taps Purchase)
confirming → pending (user confirms in wallet)
pending → success (transaction confirmed)
pending → error (transaction failed)
success → idle (user dismisses)
error → idle (user dismisses)
```

---

## Error Handling

| Error             | Cause                      | UI Response                     |
| ----------------- | -------------------------- | ------------------------------- |
| InsufficientFunds | Balance < 0.001 SOL        | Show "Insufficient SOL" message |
| UserRejected      | Wallet signature cancelled | Return to confirming state      |
| TransactionFailed | Network/program error      | Show error with retry option    |

---

## Usage Example

```typescript
// In useRunEconomy hook
const {
  mutate: purchaseRuns,
  isLoading,
  error,
} = useMutation(
  async () => {
    // Check balance first
    const balance = await connection.getBalance(mainWallet.publicKey);
    if (balance < RUN_PRICE_LAMPORTS + 5000) {
      throw new Error('Insufficient SOL balance');
    }

    // Execute purchase
    const signature = await purchaseRuns(connection, program, mainWallet.publicKey);
    await connection.confirmTransaction(signature);

    // Refetch profile
    await refetchProfile();

    return signature;
  },
  {
    onSuccess: () => {
      showToast('Successfully purchased 20 runs!');
      navigation.goBack();
    },
    onError: (error) => {
      showToast(`Purchase failed: ${error.message}`);
    },
  }
);
```

---

## Integration Points

### Session Creation

If `availableRuns === 0` when starting a session:

1. Block session creation
2. Show modal: "No Runs Available"
3. Offer "Purchase Runs" button → navigate to RunPurchaseScreen
4. After purchase, return to level selection

### Hub Screen

- Display run count prominently
- Visual warning when runs <= 3
- Quick access to purchase screen

### Profile Screen

- Show total runs (lifetime)
- Show available runs
- Show purchase button
