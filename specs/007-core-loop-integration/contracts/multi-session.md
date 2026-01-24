# Contract: Multi-Session Management

**Feature**: `007-core-loop-integration` | **Date**: 2026-01-22

## Overview

Support for multiple concurrent sessions across different campaign levels, with session listing and switching.

## Session List Service

### fetchSessionList

Fetches all active sessions for a player.

```typescript
async function fetchSessionList(
  connection: Connection,
  program: Program<SessionManager>,
  playerPubkey: PublicKey
): Promise<ActiveSession[]>;
```

**Implementation**:

```typescript
async function fetchSessionList(
  connection: Connection,
  program: Program<SessionManager>,
  playerPubkey: PublicKey
): Promise<ActiveSession[]> {
  // Fetch all GameSession accounts for this player
  const accounts = await connection.getProgramAccounts(SESSION_PROGRAM_ID, {
    filters: [
      { dataSize: GAME_SESSION_SIZE }, // Fixed account size
      { memcmp: { offset: 8, bytes: playerPubkey.toBase58() } }, // Player field after discriminator
    ],
  });

  const sessions: ActiveSession[] = [];

  for (const { pubkey, account } of accounts) {
    const session = program.coder.accounts.decode('GameSession', account.data);

    // Fetch associated GameState for current position/phase
    const [gameStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('game_state'), pubkey.toBuffer()],
      GAMEPLAY_STATE_PROGRAM_ID
    );

    const gameStateAccount = await connection.getAccountInfo(gameStatePda);
    if (!gameStateAccount) continue; // Session exists but no game state (shouldn't happen)

    const gameState = gameplayProgram.coder.accounts.decode('GameState', gameStateAccount.data);

    sessions.push({
      sessionPda: pubkey.toBase58(),
      level: session.campaignLevel,
      week: gameState.week,
      phase: gameState.phase,
      positionX: gameState.positionX,
      positionY: gameState.positionY,
      movesRemaining: gameState.movesRemaining,
      lastPlayedAt: Date.now(), // Could track in local storage
    });
  }

  // Sort by level ascending
  return sessions.sort((a, b) => a.level - b.level);
}
```

---

### checkSessionExists

Checks if a session exists for a specific level.

```typescript
async function checkSessionExists(
  connection: Connection,
  playerPubkey: PublicKey,
  level: number
): Promise<boolean>;
```

**Implementation**:

```typescript
async function checkSessionExists(
  connection: Connection,
  playerPubkey: PublicKey,
  level: number
): Promise<boolean> {
  const [sessionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('session'), playerPubkey.toBuffer(), Buffer.from([level])],
    SESSION_PROGRAM_ID
  );

  const account = await connection.getAccountInfo(sessionPda);
  return account !== null;
}
```

---

## Session Switching

### switchToSession

Loads a different session's state into the game context.

```typescript
async function switchToSession(connection: Connection, sessionPda: PublicKey): Promise<SessionData>;
```

**Returns**:

```typescript
interface SessionData {
  session: GameSession;
  gameState: GameState;
  enemies: MapEnemies;
  pois: MapPois;
  inventory: PlayerInventory;
}
```

**Implementation**:

```typescript
async function switchToSession(
  connection: Connection,
  sessionPda: PublicKey
): Promise<SessionData> {
  // Derive all PDAs
  const [gameStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('game_state'), sessionPda.toBuffer()],
    GAMEPLAY_STATE_PROGRAM_ID
  );
  const [enemiesPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('enemies'), sessionPda.toBuffer()],
    FIELD_ENEMIES_PROGRAM_ID
  );
  const [poisPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('pois'), sessionPda.toBuffer()],
    POI_SYSTEM_PROGRAM_ID
  );
  const [inventoryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('inventory'), sessionPda.toBuffer()],
    INVENTORY_PROGRAM_ID
  );

  // Fetch all accounts in parallel
  const [sessionAccount, gameStateAccount, enemiesAccount, poisAccount, inventoryAccount] =
    await connection.getMultipleAccountsInfo([
      sessionPda,
      gameStatePda,
      enemiesPda,
      poisPda,
      inventoryPda,
    ]);

  // Decode all accounts
  return {
    session: sessionProgram.coder.accounts.decode('GameSession', sessionAccount.data),
    gameState: gameplayProgram.coder.accounts.decode('GameState', gameStateAccount.data),
    enemies: enemiesProgram.coder.accounts.decode('MapEnemies', enemiesAccount.data),
    pois: poisProgram.coder.accounts.decode('MapPois', poisAccount.data),
    inventory: inventoryProgram.coder.accounts.decode('PlayerInventory', inventoryAccount.data),
  };
}
```

---

## Session Abandonment

### abandonSession

Ends a session early, deducting a run.

```typescript
async function abandonSession(
  connection: Connection,
  mainWallet: Keypair,
  burnerWallet: Keypair,
  sessionPda: PublicKey
): Promise<string>;
```

**Implementation**:

```typescript
async function abandonSession(
  connection: Connection,
  mainWallet: Keypair,
  burnerWallet: Keypair,
  sessionPda: PublicKey
): Promise<string> {
  // Build end_session instruction with victory=false
  const endSessionIx = await sessionProgram.methods
    .endSession(false) // false = defeat/abandon
    .accounts({
      gameSession: sessionPda,
      playerProfile: profilePda,
      player: mainWallet.publicKey,
      playerProfileProgram: PLAYER_PROFILE_PROGRAM_ID,
    })
    .instruction();

  // Drain burner wallet
  const burnerBalance = await connection.getBalance(burnerWallet.publicKey);
  const drainIx = SystemProgram.transfer({
    fromPubkey: burnerWallet.publicKey,
    toPubkey: mainWallet.publicKey,
    lamports: burnerBalance - 5000, // Leave rent
  });

  const tx = new Transaction().add(endSessionIx, drainIx);

  // Sign with both main wallet and burner
  tx.feePayer = burnerWallet.publicKey;
  const signature = await sendAndConfirmTransaction(connection, tx, [burnerWallet, mainWallet]);

  return signature;
}
```

---

## UI Components

### SessionListScreen

Displays all active sessions with selection.

```typescript
interface SessionListScreenProps {
  sessions: ActiveSession[];
  onSelect: (sessionPda: string) => void;
  onAbandon: (sessionPda: string) => void;
  onStartNew: (level: number) => void;
}
```

**Display per session**:

- Level number
- Current week and phase (e.g., "Week 2 - Night 1")
- Moves remaining
- Mini-map preview (optional)
- "Continue" button
- "Abandon" button (with confirmation)

---

### SessionCard

Individual session preview in list.

```typescript
interface SessionCardProps {
  session: ActiveSession;
  onContinue: () => void;
  onAbandon: () => void;
}
```

**Layout**:

```
┌─────────────────────────────────────────┐
│ Level 5                           Week 2│
│ Night 1 • 24 moves left                 │
│                                         │
│   [Continue]            [Abandon]       │
└─────────────────────────────────────────┘
```

---

### SessionSwitcher

Quick switch component (e.g., in game header).

```typescript
interface SessionSwitcherProps {
  currentLevel: number;
  activeSessions: ActiveSession[];
  onSwitch: (sessionPda: string) => void;
}
```

---

## Usage Example

```typescript
// In useSessionList hook
const { data: sessions, refetch } = useQuery(
  ['sessions', playerPubkey?.toBase58()],
  () => fetchSessionList(connection, program, playerPubkey!),
  { enabled: !!playerPubkey }
);

const handleContinueSession = async (sessionPda: string) => {
  const data = await switchToSession(connection, new PublicKey(sessionPda));
  setGameState(data.gameState);
  setMapEnemies(data.enemies);
  setMapPois(data.pois);
  navigation.navigate('Game');
};

const handleAbandonSession = async (sessionPda: string) => {
  // Show confirmation dialog
  const confirmed = await showConfirmDialog(
    'Abandon Run?',
    'This will end your run and use 1 run. This cannot be undone.'
  );

  if (confirmed) {
    await abandonSession(connection, mainWallet, burnerWallet, new PublicKey(sessionPda));
    refetch();
  }
};
```

---

## Constraints

- Maximum 40 concurrent sessions (one per campaign level)
- Cannot have two sessions on the same level
- Abandoning a session deducts 1 run (same as death)
- Switching sessions does not end the previous session
