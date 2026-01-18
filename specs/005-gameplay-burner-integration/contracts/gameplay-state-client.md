# Gameplay State Client Interface

**Feature**: 005-gameplay-burner-integration
**Date**: 2025-01-17

## Overview

TypeScript client interface for interacting with the gameplay-state Solana program from the React Native frontend. Uses burner wallet for signing all gameplay transactions.

## Types

### GameState

```typescript
interface GameState {
  player: PublicKey;
  session: PublicKey;
  positionX: number;
  positionY: number;
  mapWidth: number;
  mapHeight: number;
  hp: number;
  maxHp: number;
  atk: number;
  arm: number;
  spd: number;
  dig: number;
  gearSlots: number;
  week: number;
  phase: Phase;
  movesRemaining: number;
  totalMoves: number;
  bossFightReady: boolean;
}
```

### Phase

```typescript
enum Phase {
  Day1 = 0,
  Night1 = 1,
  Day2 = 2,
  Night2 = 3,
  Day3 = 4,
  Night3 = 5,
}
```

### StatType

```typescript
enum StatType {
  Hp = 0,
  MaxHp = 1,
  Atk = 2,
  Arm = 3,
  Spd = 4,
  Dig = 5,
}
```

## Functions

### initializeGameState

Creates a new GameState account linked to an active GameSession.

```typescript
async function initializeGameState(
  connection: Connection,
  program: Program<GameplayState>,
  sessionPda: PublicKey,
  burnerKeypair: Keypair,
  mapWidth: number,
  mapHeight: number,
  startX: number,
  startY: number
): Promise<{ signature: string; gameStatePda: PublicKey }>
```

**Parameters**:
- `connection`: Solana connection
- `program`: Anchor program instance
- `sessionPda`: Active GameSession PDA
- `burnerKeypair`: Burner wallet keypair (signer)
- `mapWidth`: Map boundary X dimension
- `mapHeight`: Map boundary Y dimension
- `startX`: Starting X position
- `startY`: Starting Y position

**Returns**: Transaction signature and GameState PDA

**Errors**:
- `SessionNotActive`: GameSession does not exist
- `Unauthorized`: Burner is not session owner
- `OutOfBounds`: Starting position outside map

---

### movePlayer

Moves the player to an adjacent tile, deducting move cost.

```typescript
async function movePlayer(
  connection: Connection,
  program: Program<GameplayState>,
  gameStatePda: PublicKey,
  burnerKeypair: Keypair,
  targetX: number,
  targetY: number,
  isWall: boolean
): Promise<{ signature: string; newState: GameState }>
```

**Parameters**:
- `connection`: Solana connection
- `program`: Anchor program instance
- `gameStatePda`: GameState PDA
- `burnerKeypair`: Burner wallet keypair (signer)
- `targetX`: Target X coordinate
- `targetY`: Target Y coordinate
- `isWall`: True if target is wall tile (digging)

**Returns**: Transaction signature and updated GameState

**Move Costs**:
- Floor tile: 1 move
- Wall tile: `max(2, 6 - dig)` moves

**Errors**:
- `OutOfBounds`: Target outside map boundaries
- `NotAdjacent`: Target not adjacent to current position
- `InsufficientMoves`: Not enough moves remaining
- `BossFightAlreadyTriggered`: Cannot move after boss ready

---

### modifyStat

Modifies a player stat by a delta value.

```typescript
async function modifyStat(
  connection: Connection,
  program: Program<GameplayState>,
  gameStatePda: PublicKey,
  burnerKeypair: Keypair,
  stat: StatType,
  delta: number
): Promise<{ signature: string; newValue: number }>
```

**Parameters**:
- `connection`: Solana connection
- `program`: Anchor program instance
- `gameStatePda`: GameState PDA
- `burnerKeypair`: Burner wallet keypair (signer)
- `stat`: Which stat to modify
- `delta`: Amount to add (negative for decrease)

**Returns**: Transaction signature and new stat value

**Validation**:
- HP: Cannot go below 0 or above maxHp
- Other stats: Allow negative values

**Errors**:
- `HpUnderflow`: HP would go below 0
- `StatOverflow`: Stat would overflow
- `InvalidStatModification`: Invalid stat type

---

### closeGameState

Closes the GameState account, returning rent to player.

```typescript
async function closeGameState(
  connection: Connection,
  program: Program<GameplayState>,
  gameStatePda: PublicKey,
  burnerKeypair: Keypair
): Promise<{ signature: string; totalMoves: number }>
```

**Parameters**:
- `connection`: Solana connection
- `program`: Anchor program instance
- `gameStatePda`: GameState PDA
- `burnerKeypair`: Burner wallet keypair (signer)

**Returns**: Transaction signature and total moves made

---

### fetchGameState

Fetches current GameState from chain.

```typescript
async function fetchGameState(
  program: Program<GameplayState>,
  gameStatePda: PublicKey
): Promise<GameState | null>
```

**Parameters**:
- `program`: Anchor program instance
- `gameStatePda`: GameState PDA

**Returns**: GameState or null if not found

---

### getGameStatePda

Derives GameState PDA from session.

```typescript
function getGameStatePda(
  sessionPda: PublicKey,
  programId: PublicKey
): [PublicKey, number]
```

**PDA Seeds**: `["game_state", session_pda.as_ref()]`

## Burner Wallet Interface

### createBurnerWallet

Creates new ephemeral keypair for gameplay.

```typescript
async function createBurnerWallet(
  mainWalletAddress: string
): Promise<Keypair>
```

---

### loadBurnerWallet

Loads existing burner from secure storage.

```typescript
async function loadBurnerWallet(
  mainWalletAddress: string
): Promise<Keypair | null>
```

---

### clearBurnerWallet

Removes burner from secure storage.

```typescript
async function clearBurnerWallet(): Promise<void>
```

---

### fundBurner

Creates transaction to fund burner from main wallet.

```typescript
async function createFundBurnerTransaction(
  mainWallet: PublicKey,
  burnerWallet: PublicKey,
  amount?: number  // Default: 0.005 SOL
): Promise<Transaction>
```

**Note**: Transaction must be signed by main wallet via Mobile Wallet Adapter.

---

### drainBurner

Drains remaining SOL from burner to main wallet.

```typescript
async function drainBurnerToMain(
  connection: Connection,
  burnerKeypair: Keypair,
  mainWalletAddress: PublicKey
): Promise<string>
```

**Note**: Transaction signed by burner (automatic, no user interaction).

## Hook Interface

### useBurnerWallet

React hook for burner wallet management.

```typescript
interface UseBurnerWalletReturn {
  state: 'idle' | 'funding' | 'active' | 'draining' | 'failed';
  keypair: Keypair | null;
  balance: number;
  error: string | null;
  createAndFund: () => Promise<void>;
  topUp: (amount: number) => Promise<void>;
  drain: () => Promise<void>;
  clear: () => Promise<void>;
}

function useBurnerWallet(): UseBurnerWalletReturn
```

---

### useGameplayState

React hook for gameplay state management.

```typescript
interface UseGameplayStateReturn {
  gameState: GameState | null;
  isLoading: boolean;
  error: string | null;
  initialize: (mapWidth: number, mapHeight: number, startX: number, startY: number) => Promise<void>;
  move: (targetX: number, targetY: number, isWall: boolean) => Promise<void>;
  modifyStat: (stat: StatType, delta: number) => Promise<void>;
  close: () => Promise<void>;
  refresh: () => Promise<void>;
  syncStatus: 'synced' | 'syncing' | 'offline' | 'error';
}

function useGameplayState(): UseGameplayStateReturn
```

## Error Codes

| Code | Name | User Message |
|------|------|--------------|
| 6000 | OutOfBounds | "Target position is out of map boundaries" |
| 6001 | InsufficientMoves | "Not enough moves remaining" |
| 6002 | NotAdjacent | "Can only move to adjacent tiles" |
| 6003 | StatOverflow | "Stat value is at maximum" |
| 6004 | HpUnderflow | "HP cannot go below zero" |
| 6005 | InvalidStatModification | "Invalid stat modification" |
| 6006 | BossFightAlreadyTriggered | "Boss fight triggered - end your run!" |
| 6007 | Unauthorized | "Not authorized for this action" |
| 6008 | SessionNotActive | "Game session is not active" |
| 6009 | ArithmeticOverflow | "Calculation overflow" |
