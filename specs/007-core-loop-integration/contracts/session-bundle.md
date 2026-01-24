# Contract: Session Bundle

**Feature**: `007-core-loop-integration` | **Date**: 2026-01-22

## Overview

Atomic session creation by bundling 5 instructions into a single transaction signed by the main wallet.

## Transaction Builder

### createSessionBundle

Creates a complete session initialization transaction.

```typescript
async function createSessionBundle(
  connection: Connection,
  mainWallet: PublicKey,
  burnerWallet: PublicKey,
  campaignLevel: number,
  burnerLamports: number
): Promise<Transaction>;
```

**Parameters**:

| Name           | Type       | Description                                   |
| -------------- | ---------- | --------------------------------------------- |
| connection     | Connection | Solana connection                             |
| mainWallet     | PublicKey  | Player's main wallet                          |
| burnerWallet   | PublicKey  | Ephemeral burner wallet                       |
| campaignLevel  | number     | Level 1-40                                    |
| burnerLamports | number     | SOL to transfer (e.g., 50_000_000 = 0.05 SOL) |

**Returns**: Transaction ready for main wallet signature

**Instructions Bundled**:

1. `session-manager.startSession(campaignLevel, burnerLamports)`
2. `gameplay-state.initializeGameState(9, 9, 4, 4)`
3. `field-enemies.spawnEnemies(campaignLevel, seed)`
4. `poi-system.spawnPois(campaignLevel, seed)`
5. `inventory.initializeInventory()`

---

## PDA Derivations

### Session PDA

```typescript
const [sessionPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('session'), mainWallet.toBuffer(), Buffer.from([campaignLevel])],
  SESSION_PROGRAM_ID
);
```

### GameState PDA

```typescript
const [gameStatePda] = PublicKey.findProgramAddressSync(
  [Buffer.from('game_state'), sessionPda.toBuffer()],
  GAMEPLAY_STATE_PROGRAM_ID
);
```

### MapEnemies PDA

```typescript
const [enemiesPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('enemies'), sessionPda.toBuffer()],
  FIELD_ENEMIES_PROGRAM_ID
);
```

### MapPois PDA

```typescript
const [poisPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('pois'), sessionPda.toBuffer()],
  POI_SYSTEM_PROGRAM_ID
);
```

### PlayerInventory PDA

```typescript
const [inventoryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('inventory'), sessionPda.toBuffer()],
  INVENTORY_PROGRAM_ID
);
```

---

## Account Requirements

### start_session

| Account        | Type        | Description    |
| -------------- | ----------- | -------------- |
| gameSession    | init        | Session PDA    |
| sessionCounter | mut         | Global counter |
| playerProfile  | read        | For validation |
| player         | signer, mut | Main wallet    |
| burnerWallet   | mut         | Receives SOL   |
| systemProgram  | program     | System         |

### initialize_game_state

| Account       | Type    | Description    |
| ------------- | ------- | -------------- |
| gameState     | init    | GameState PDA  |
| gameSession   | read    | Parent session |
| player        | signer  | Main wallet    |
| systemProgram | program | System         |

### spawn_enemies

| Account       | Type    | Description    |
| ------------- | ------- | -------------- |
| mapEnemies    | init    | Enemies PDA    |
| gameSession   | read    | Parent session |
| player        | signer  | Main wallet    |
| systemProgram | program | System         |

### spawn_pois

| Account       | Type    | Description    |
| ------------- | ------- | -------------- |
| mapPois       | init    | POIs PDA       |
| gameSession   | read    | Parent session |
| player        | signer  | Main wallet    |
| systemProgram | program | System         |

### initialize_inventory

| Account       | Type    | Description   |
| ------------- | ------- | ------------- |
| inventory     | init    | Inventory PDA |
| player        | signer  | Main wallet   |
| systemProgram | program | System        |

---

## Error Handling

| Error                | Cause                                   | UI Response                     |
| -------------------- | --------------------------------------- | ------------------------------- |
| NoAvailableRuns      | availableRuns == 0                      | Navigate to RunPurchaseScreen   |
| LevelNotUnlocked     | level > highestLevelUnlocked            | Show "Level Locked" message     |
| InvalidCampaignLevel | level < 1 or > 40                       | Should not occur (UI validated) |
| SessionAlreadyExists | PDA already initialized                 | Offer "Resume" or show error    |
| InsufficientFunds    | Main wallet lacks rent + burnerLamports | Show balance needed             |

---

## Usage Example

```typescript
import { createSessionBundle } from '@/services/solana/sessionBundle';

// In useSessionManager hook
const startNewSession = async (level: number) => {
  // 1. Generate burner if needed
  const burner = await getOrCreateBurner();

  // 2. Build atomic transaction
  const tx = await createSessionBundle(
    connection,
    mainWallet.publicKey,
    burner.publicKey,
    level,
    50_000_000 // 0.05 SOL
  );

  // 3. Sign with main wallet (single signature)
  const signature = await signAndSendTransaction(mainWallet, tx);

  // 4. Wait for confirmation
  await connection.confirmTransaction(signature);

  // 5. Fetch initial game state
  const gameState = await fetchGameState(sessionPda);

  return { sessionPda, gameState };
};
```

---

## Transaction Size Estimate

| Instruction           | Size (bytes) |
| --------------------- | ------------ |
| start_session         | ~200         |
| initialize_game_state | ~150         |
| spawn_enemies         | ~250         |
| spawn_pois            | ~200         |
| initialize_inventory  | ~100         |
| **Total**             | **~900**     |

Transaction limit: 1232 bytes. Bundle fits comfortably.
