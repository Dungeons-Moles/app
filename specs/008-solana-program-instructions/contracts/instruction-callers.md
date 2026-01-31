# Instruction Caller Contracts

**Feature**: 008-solana-program-instructions
**Date**: 2026-01-27

This document defines the TypeScript function signatures for all Solana program instruction callers needed by the frontend.

## Profile Instructions (Existing — Verify Alignment)

```typescript
// src/services/solana/playerProfile.ts (existing in usePlayerProfile hook)

/** Create a new player profile on-chain */
function initializeProfile(
  connection: Connection,
  program: Program,
  ownerPubkey: PublicKey,
  name: string,
  signAndSend: (tx: Transaction) => Promise<string>
): Promise<{ signature: string; profilePda: PublicKey }>

/** Record the result of a completed run */
function recordRunResult(
  connection: Connection,
  program: Program,
  ownerPubkey: PublicKey,
  levelCompleted: number,
  victory: boolean,
  signAndSend: (tx: Transaction) => Promise<string>
): Promise<{ signature: string }>

/** Fetch player profile from chain */
function fetchPlayerProfile(
  program: Program,
  profilePda: PublicKey
): Promise<PlayerProfileData | null>
```

## Session Instructions (Existing — Update Account List)

```typescript
// src/services/solana/sessionBundle.ts (existing)

/** Start a new game session with all sub-accounts */
function createSessionBundle(
  connection: Connection,
  programs: SessionPrograms,
  mainWallet: PublicKey,
  burnerWallet: PublicKey,
  campaignLevel: number,
  burnerLamports?: number
): Promise<SessionBundleResult>

// SessionPrograms must now include:
interface SessionPrograms {
  sessionManager: Program;
  mapGenerator: Program;
  gameplayState: Program;
  playerInventory: Program;  // NEW
  poiSystem: Program;        // NEW
}

/** End session manually (abandon) */
function endSession(
  connection: Connection,
  program: Program,
  sessionPda: PublicKey,
  inventoryPda: PublicKey,
  playerPubkey: PublicKey,
  burnerKeypair: Keypair
): Promise<{ signature: string }>
```

## Gameplay Instructions (Existing — Update Accounts)

```typescript
// src/services/solana/gameplayState.ts (existing — needs account updates)

interface MovePlayerAccounts {
  gameState: PublicKey;          // PDA: ["game_state", session]
  sessionManager: PublicKey;    // Program ID (address validation)
  gameSession: PublicKey;       // PDA: ["session", player, level]
  mapEnemies: PublicKey;        // PDA: ["map_enemies", session]
  generatedMap: PublicKey;      // PDA: ["generated_map", session]
  inventory: PublicKey;         // PDA: ["inventory", session]
  playerInventoryProgram: PublicKey;
  player: PublicKey;            // Signer (burner wallet)
  systemProgram: PublicKey;
}

/** Move player with full on-chain combat resolution */
function movePlayer(
  connection: Connection,
  program: Program,
  accounts: MovePlayerAccounts,
  burnerKeypair: Keypair,
  params: { targetX: number; targetY: number }
): Promise<{ signature: string }>

/** Parse all events from a move_player transaction */
function parseMoveEvents(
  connection: Connection,
  program: Program,
  signature: string
): Promise<MoveResult>

interface MoveResult {
  playerMoved: PlayerMovedEvent | null;
  enemyMoves: EnemyMovedEvent[];
  combat: CombatReplay | null;
  phaseAdvanced: PhaseAdvancedEvent | null;
  bossCombat: CombatReplay | null;
  levelCompleted: LevelCompletedEvent | null;
  playerDefeated: PlayerDefeatedEvent | null;
}
```

## POI Instructions (New)

```typescript
// src/services/solana/poiSystem.ts (NEW)

/** Common accounts for most POI interactions */
interface PoiBaseAccounts {
  mapPois: PublicKey;       // PDA: ["map_pois", session]
  gameState: PublicKey;     // PDA: ["game_state", session]
  player: PublicKey;        // Signer (burner wallet)
}

/** Accounts for POI interactions that modify HP */
interface PoiHealAccounts extends PoiBaseAccounts {
  inventory: PublicKey;       // PDA: ["inventory", session]
  poiAuthority: PublicKey;    // PDA: ["poi_authority"] from poi-system
  gameplayStateProgram: PublicKey;
}

/** Accounts for POI interactions that modify gold */
interface PoiGoldAccounts extends PoiBaseAccounts {
  poiAuthority: PublicKey;
  gameplayStateProgram: PublicKey;
}

// --- Rest POIs (L1, L5) ---
function interactRest(
  connection: Connection,
  program: Program,
  accounts: PoiHealAccounts,
  burnerKeypair: Keypair,
  poiIndex: number
): Promise<{ signature: string }>

// --- Pick Item POIs (L2, L3, L12, L13) ---
function interactPickItem(
  connection: Connection,
  program: Program,
  accounts: PoiBaseAccounts,
  burnerKeypair: Keypair,
  params: { poiIndex: number; choiceIndex: number; weakness1: number; weakness2: number; seed: bigint }
): Promise<{ signature: string }>

// --- Tool Oil (L4) ---
function interactToolOil(
  connection: Connection,
  program: Program,
  accounts: PoiBaseAccounts,
  burnerKeypair: Keypair,
  params: { poiIndex: number; currentOilFlags: number; modification: number }
): Promise<{ signature: string }>

// --- Shop (L9) ---
function enterShop(
  connection: Connection,
  program: Program,
  accounts: PoiBaseAccounts,
  burnerKeypair: Keypair,
  params: { poiIndex: number; weakness1: number; weakness2: number; seed: bigint }
): Promise<{ signature: string }>

function shopPurchase(
  connection: Connection,
  program: Program,
  accounts: PoiGoldAccounts,
  burnerKeypair: Keypair,
  offerIndex: number
): Promise<{ signature: string }>

function shopReroll(
  connection: Connection,
  program: Program,
  accounts: PoiGoldAccounts,
  burnerKeypair: Keypair,
  params: { weakness1: number; weakness2: number; seed: bigint }
): Promise<{ signature: string }>

function leaveShop(
  connection: Connection,
  program: Program,
  accounts: PoiBaseAccounts,
  burnerKeypair: Keypair
): Promise<{ signature: string }>

// --- Waypoint (L8) ---
function discoverWaypoint(
  connection: Connection,
  program: Program,
  accounts: PoiBaseAccounts,
  burnerKeypair: Keypair,
  poiIndex: number
): Promise<{ signature: string }>

function fastTravel(
  connection: Connection,
  program: Program,
  accounts: PoiBaseAccounts,
  burnerKeypair: Keypair,
  params: { fromPoiIndex: number; toPoiIndex: number }
): Promise<{ signature: string }>

// --- Survey Beacon (L6) ---
function interactSurveyBeacon(
  connection: Connection,
  program: Program,
  accounts: PoiBaseAccounts,
  burnerKeypair: Keypair,
  poiIndex: number
): Promise<{ signature: string }>

// --- Seismic Scanner (L7) ---
function interactSeismicScanner(
  connection: Connection,
  program: Program,
  accounts: PoiBaseAccounts,
  burnerKeypair: Keypair,
  params: { poiIndex: number; category: number }
): Promise<{ signature: string }>

// --- Rusty Anvil (L10) ---
function interactRustyAnvil(
  connection: Connection,
  program: Program,
  accounts: PoiGoldAccounts,
  burnerKeypair: Keypair,
  params: { poiIndex: number; itemId: Uint8Array; currentTier: number }
): Promise<{ signature: string }>

// --- Rune Kiln (L11) ---
function interactRuneKiln(
  connection: Connection,
  program: Program,
  accounts: PoiBaseAccounts,
  burnerKeypair: Keypair,
  params: {
    poiIndex: number;
    item1Id: Uint8Array; item1Tier: number;
    item2Id: Uint8Array; item2Tier: number;
  }
): Promise<{ signature: string }>

// --- Scrap Chute (L14) ---
function interactScrapChute(
  connection: Connection,
  program: Program,
  accounts: PoiGoldAccounts,
  burnerKeypair: Keypair,
  params: { poiIndex: number; itemId: Uint8Array }
): Promise<{ signature: string }>
```

## Inventory Read (New)

```typescript
// src/services/solana/playerInventory.ts (NEW — read-only)

/** Fetch player inventory from chain */
function fetchInventory(
  program: Program,
  inventoryPda: PublicKey
): Promise<PlayerInventoryData | null>

interface PlayerInventoryData {
  session: PublicKey;
  player: PublicKey;
  tool: ItemInstanceData | null;
  gear: (ItemInstanceData | null)[];
  gearSlotCapacity: number;
}

interface ItemInstanceData {
  itemId: string;     // 8-byte ID as string (e.g., "T-ST-01")
  tier: number;       // 0=I, 1=II, 2=III
  toolOilFlags: number; // bitmask: 0x01=ATK, 0x02=SPD, 0x04=DIG
}
```

## Program Factory Extensions

```typescript
// src/services/solana/programs.ts (UPDATE)

// Add these to existing program factories:
function createPlayerInventoryProgram(connection: Connection): Program
function createPlayerInventoryProgramWithProvider(provider: AnchorProvider): Program
function createPoiSystemProgram(connection: Connection): Program
function createPoiSystemProgramWithProvider(provider: AnchorProvider): Program
```

## Config Extensions

```typescript
// src/services/solana/config.ts (UPDATE)

// Add to SOLANA_CONFIG:
EXPO_PUBLIC_PLAYER_INVENTORY_PROGRAM_ID: string
EXPO_PUBLIC_POI_SYSTEM_PROGRAM_ID: string
```
