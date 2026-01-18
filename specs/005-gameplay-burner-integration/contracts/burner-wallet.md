# Burner Wallet Service Interface

**Feature**: 005-gameplay-burner-integration
**Date**: 2025-01-17

## Overview

Service for managing ephemeral burner wallets used for gasless gameplay transactions. The burner wallet is created at session start, funded from the main wallet, signs all gameplay transactions, and returns remaining SOL at session end.

## Constants

```typescript
/** Default amount to fund burner (0.005 SOL) */
const DEFAULT_FUND_AMOUNT = 5_000_000; // lamports

/** Low balance warning threshold (0.001 SOL) */
const LOW_BALANCE_THRESHOLD = 1_000_000; // lamports

/** Storage key for burner wallet */
const BURNER_STORAGE_KEY = 'burner_wallet';

/** Estimated transaction fee */
const ESTIMATED_TX_FEE = 5_000; // lamports
```

## Types

### StoredBurner

```typescript
interface StoredBurner {
  /** Base58-encoded secret key (64 bytes) */
  secretKey: string;
  /** Associated main wallet address */
  mainWalletAddress: string;
  /** Creation timestamp (Unix ms) */
  createdAt: number;
}
```

### BurnerState

```typescript
type BurnerState = 'idle' | 'funding' | 'active' | 'draining' | 'failed';
```

### BurnerWalletInfo

```typescript
interface BurnerWalletInfo {
  publicKey: PublicKey;
  balance: number;
  isLowBalance: boolean;
  mainWalletAddress: string;
  createdAt: number;
}
```

## Functions

### createBurnerWallet

Creates a new ephemeral keypair and stores it securely.

```typescript
async function createBurnerWallet(
  mainWalletAddress: string
): Promise<Keypair>
```

**Parameters**:
- `mainWalletAddress`: The connected main wallet's public key (string)

**Returns**: New Keypair instance

**Side Effects**:
- Stores keypair in expo-secure-store
- Overwrites any existing stored burner

**Example**:
```typescript
const burner = await createBurnerWallet(wallet.publicKey.toString());
console.log('Burner created:', burner.publicKey.toString());
```

---

### loadBurnerWallet

Loads an existing burner wallet from secure storage.

```typescript
async function loadBurnerWallet(
  mainWalletAddress: string
): Promise<Keypair | null>
```

**Parameters**:
- `mainWalletAddress`: The connected main wallet's public key (string)

**Returns**: Keypair if found and matches main wallet, null otherwise

**Validation**:
- Returns null if no stored burner
- Returns null if stored mainWalletAddress doesn't match

**Example**:
```typescript
const burner = await loadBurnerWallet(wallet.publicKey.toString());
if (burner) {
  console.log('Loaded existing burner:', burner.publicKey.toString());
} else {
  console.log('No existing burner found');
}
```

---

### clearBurnerWallet

Removes burner wallet from secure storage.

```typescript
async function clearBurnerWallet(): Promise<void>
```

**Side Effects**:
- Deletes burner from expo-secure-store
- Should only be called after draining funds

**Example**:
```typescript
await drainBurnerToMain(connection, burner, mainWallet);
await clearBurnerWallet();
```

---

### getBurnerInfo

Gets information about the current burner wallet.

```typescript
async function getBurnerInfo(
  connection: Connection,
  mainWalletAddress: string
): Promise<BurnerWalletInfo | null>
```

**Parameters**:
- `connection`: Solana connection
- `mainWalletAddress`: The connected main wallet's public key

**Returns**: Burner info including balance, or null if no burner

---

### createFundBurnerTransaction

Creates a transaction to transfer SOL from main wallet to burner.

```typescript
function createFundBurnerTransaction(
  mainWallet: PublicKey,
  burnerWallet: PublicKey,
  amount: number = DEFAULT_FUND_AMOUNT
): Transaction
```

**Parameters**:
- `mainWallet`: Main wallet public key (payer)
- `burnerWallet`: Burner wallet public key (recipient)
- `amount`: Amount in lamports (default: 5,000,000 = 0.005 SOL)

**Returns**: Unsigned Transaction

**Note**: This transaction must be signed by main wallet via Mobile Wallet Adapter.

**Example**:
```typescript
const tx = createFundBurnerTransaction(
  mainWallet.publicKey,
  burner.publicKey,
  10_000_000 // 0.01 SOL
);
const signature = await signAndSendTransaction(tx);
```

---

### drainBurnerToMain

Transfers all remaining SOL from burner back to main wallet.

```typescript
async function drainBurnerToMain(
  connection: Connection,
  burnerKeypair: Keypair,
  mainWalletAddress: PublicKey
): Promise<string>
```

**Parameters**:
- `connection`: Solana connection
- `burnerKeypair`: Burner wallet keypair (signer)
- `mainWalletAddress`: Main wallet to receive funds

**Returns**: Transaction signature

**Behavior**:
- Fetches current burner balance
- Transfers `balance - txFee` to main wallet
- Throws if balance insufficient for fee

**Example**:
```typescript
const signature = await drainBurnerToMain(
  connection,
  burner,
  mainWallet.publicKey
);
console.log('Drained burner, signature:', signature);
await clearBurnerWallet();
```

---

### checkBurnerBalance

Checks burner balance and returns low balance warning if applicable.

```typescript
async function checkBurnerBalance(
  connection: Connection,
  burnerPublicKey: PublicKey
): Promise<{ balance: number; isLow: boolean }>
```

**Parameters**:
- `connection`: Solana connection
- `burnerPublicKey`: Burner wallet public key

**Returns**: Balance in lamports and whether it's below threshold

---

### sendBurnerTransaction

Signs and sends a transaction using the burner keypair.

```typescript
async function sendBurnerTransaction(
  connection: Connection,
  transaction: Transaction,
  burnerKeypair: Keypair
): Promise<string>
```

**Parameters**:
- `connection`: Solana connection
- `transaction`: Transaction to send
- `burnerKeypair`: Burner keypair for signing

**Returns**: Transaction signature

**Behavior**:
- Sets feePayer to burner
- Gets recent blockhash
- Signs with burner keypair
- Sends and confirms transaction

## State Machine

```
┌─────────────────────────────────────────────────────────────────┐
│                       IDLE                                       │
│   - No burner exists                                            │
│   - loadBurnerWallet() returns null                             │
└───────────────────────────┬─────────────────────────────────────┘
                            │ createBurnerWallet() + fundBurner()
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FUNDING                                      │
│   - Burner created, awaiting main wallet signature              │
│   - Shows "Approve to fund game session"                        │
└────────────┬─────────────────────────────────────┬──────────────┘
             │ Transaction confirmed               │ Transaction failed
             ▼                                     ▼
┌───────────────────────────────────┐   ┌─────────────────────────┐
│           ACTIVE                  │   │        FAILED           │
│   - Burner funded                 │   │  - Error message shown  │
│   - Can sign gameplay transactions│   │  - Can retry or dismiss │
│   - Balance tracked               │   └────────────┬────────────┘
└───────────┬───────────────────────┘                │
            │ endSession() / drain()                 │ dismiss/retry
            ▼                                        │
┌───────────────────────────────────┐                │
│          DRAINING                 │                │
│   - Returning funds to main       │                │
│   - Burner signs transfer         │                │
└───────────┬───────────────────────┘                │
            │ drain complete                         │
            ▼                                        │
┌───────────────────────────────────────────────────┴─────────────┐
│                       IDLE                                       │
│   - clearBurnerWallet() called                                  │
│   - Ready for new session                                       │
└─────────────────────────────────────────────────────────────────┘
```

## Security Considerations

1. **Keypair Storage**: Uses expo-secure-store which provides encrypted storage on device
2. **Wallet Association**: Stored burner is validated against connected main wallet
3. **Fund Limits**: Default funding is minimal (0.005 SOL) to limit exposure
4. **Automatic Drain**: Funds returned to main wallet at session end
5. **No Private Key Export**: Burner keypair never leaves secure storage (except for signing)

## Error Handling

| Error | Cause | Recovery |
|-------|-------|----------|
| "Burner not found" | No stored burner for wallet | Create new burner |
| "Wallet mismatch" | Different main wallet connected | Connect correct wallet or create new burner |
| "Insufficient funds" | Burner balance too low | Top up or end session |
| "Transaction failed" | Network/program error | Retry or end session |
| "Storage error" | expo-secure-store issue | Clear and recreate |
