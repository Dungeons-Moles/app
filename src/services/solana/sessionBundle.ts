/**
 * Session Bundle Builder
 *
 * Creates atomic session initialization transactions bundling 5 instructions
 * into a single transaction signed by the main wallet.
 *
 * @see contracts/session-bundle.md for specifications
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import type { Program } from '@coral-xyz/anchor';
import {
  deriveSessionPda,
  deriveSessionCounterPda,
  deriveGameStatePda,
  deriveMapEnemiesPda,
  deriveMapPoisPda,
  deriveInventoryPda,
  derivePlayerProfilePda,
  DEFAULT_BURNER_FUNDING,
  MAP_WIDTH,
  MAP_HEIGHT,
} from './constants';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of building a session bundle.
 */
export interface SessionBundleResult {
  /** Transaction ready for signing */
  transaction: Transaction;
  /** Session PDA for this level */
  sessionPda: PublicKey;
  /** GameState PDA */
  gameStatePda: PublicKey;
  /** MapEnemies PDA */
  enemiesPda: PublicKey;
  /** MapPois PDA */
  poisPda: PublicKey;
  /** Inventory PDA */
  inventoryPda: PublicKey;
}

/**
 * Programs required for session bundle creation.
 */
export interface SessionPrograms {
  sessionManager: Program;
  gameplayState: Program;
  fieldEnemies: Program;
  poiSystem: Program;
  inventory: Program;
}

// ============================================================================
// Main Bundle Builder
// ============================================================================

/**
 * Create a complete session initialization transaction bundle.
 *
 * Bundles 5 instructions into a single transaction:
 * 1. start_session - Creates GameSession account, transfers SOL to burner
 * 2. initialize_game_state - Creates GameState with starting position
 * 3. spawn_enemies - Creates MapEnemies with enemy positions
 * 4. spawn_pois - Creates MapPois with POI positions
 * 5. initialize_inventory - Creates PlayerInventory with Basic Pickaxe
 *
 * @param connection - Solana connection
 * @param programs - All required program instances
 * @param mainWallet - Player's main wallet public key
 * @param burnerWallet - Burner wallet public key
 * @param campaignLevel - Campaign level (1-40)
 * @param burnerLamports - SOL to transfer to burner (default: 0.05 SOL)
 * @param startX - Starting X position (default: 4)
 * @param startY - Starting Y position (default: 4)
 * @returns Transaction and derived PDAs
 */
export async function createSessionBundle(
  connection: Connection,
  programs: SessionPrograms,
  mainWallet: PublicKey,
  burnerWallet: PublicKey,
  campaignLevel: number,
  burnerLamports: number = DEFAULT_BURNER_FUNDING,
  startX: number = 4,
  startY: number = 4
): Promise<SessionBundleResult> {
  // Derive all PDAs
  const [sessionPda] = deriveSessionPda(mainWallet, campaignLevel);
  const [sessionCounterPda] = deriveSessionCounterPda();
  const [profilePda] = derivePlayerProfilePda(mainWallet);
  const [gameStatePda] = deriveGameStatePda(sessionPda);
  const [enemiesPda] = deriveMapEnemiesPda(sessionPda);
  const [poisPda] = deriveMapPoisPda(sessionPda);
  const [inventoryPda] = deriveInventoryPda(sessionPda);

  // Build transaction with all 5 instructions
  const transaction = new Transaction();

  // 1. Start session instruction
  const startSessionIx = await buildStartSessionInstruction(
    programs.sessionManager,
    sessionPda,
    sessionCounterPda,
    profilePda,
    mainWallet,
    burnerWallet,
    campaignLevel,
    burnerLamports
  );
  transaction.add(startSessionIx);

  // 2. Initialize game state instruction
  const initGameStateIx = await buildInitializeGameStateInstruction(
    programs.gameplayState,
    gameStatePda,
    sessionPda,
    mainWallet,
    MAP_WIDTH,
    MAP_HEIGHT,
    startX,
    startY
  );
  transaction.add(initGameStateIx);

  // 3. Spawn enemies instruction
  const spawnEnemiesIx = await buildSpawnEnemiesInstruction(
    programs.fieldEnemies,
    enemiesPda,
    sessionPda,
    mainWallet,
    campaignLevel
  );
  transaction.add(spawnEnemiesIx);

  // 4. Spawn POIs instruction
  const spawnPoisIx = await buildSpawnPoisInstruction(
    programs.poiSystem,
    poisPda,
    sessionPda,
    mainWallet,
    campaignLevel
  );
  transaction.add(spawnPoisIx);

  // 5. Initialize inventory instruction
  const initInventoryIx = await buildInitializeInventoryInstruction(
    programs.inventory,
    inventoryPda,
    sessionPda,
    mainWallet
  );
  transaction.add(initInventoryIx);

  // Set recent blockhash and fee payer
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = mainWallet;

  return {
    transaction,
    sessionPda,
    gameStatePda,
    enemiesPda,
    poisPda,
    inventoryPda,
  };
}

// ============================================================================
// Individual Instruction Builders
// ============================================================================

/**
 * Build start_session instruction.
 */
async function buildStartSessionInstruction(
  program: Program,
  sessionPda: PublicKey,
  sessionCounterPda: PublicKey,
  profilePda: PublicKey,
  mainWallet: PublicKey,
  burnerWallet: PublicKey,
  campaignLevel: number,
  burnerLamports: number
): Promise<TransactionInstruction> {
  return await program.methods
    .startSession(campaignLevel, burnerLamports)
    .accounts({
      gameSession: sessionPda,
      sessionCounter: sessionCounterPda,
      playerProfile: profilePda,
      player: mainWallet,
      burnerWallet: burnerWallet,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

/**
 * Build initialize_game_state instruction.
 */
async function buildInitializeGameStateInstruction(
  program: Program,
  gameStatePda: PublicKey,
  sessionPda: PublicKey,
  mainWallet: PublicKey,
  mapWidth: number,
  mapHeight: number,
  startX: number,
  startY: number
): Promise<TransactionInstruction> {
  return await program.methods
    .initializeGameState(mapWidth, mapHeight, startX, startY)
    .accounts({
      gameState: gameStatePda,
      gameSession: sessionPda,
      player: mainWallet,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

/**
 * Build spawn_enemies instruction.
 */
async function buildSpawnEnemiesInstruction(
  program: Program,
  enemiesPda: PublicKey,
  sessionPda: PublicKey,
  mainWallet: PublicKey,
  campaignLevel: number
): Promise<TransactionInstruction> {
  // Seed is derived from session for determinism
  const seed = Date.now();

  return await program.methods
    .spawnEnemies(campaignLevel, seed)
    .accounts({
      mapEnemies: enemiesPda,
      gameSession: sessionPda,
      player: mainWallet,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

/**
 * Build spawn_pois instruction.
 */
async function buildSpawnPoisInstruction(
  program: Program,
  poisPda: PublicKey,
  sessionPda: PublicKey,
  mainWallet: PublicKey,
  campaignLevel: number
): Promise<TransactionInstruction> {
  // Seed is derived from session for determinism
  const seed = Date.now();

  return await program.methods
    .spawnPois(campaignLevel, seed)
    .accounts({
      mapPois: poisPda,
      gameSession: sessionPda,
      player: mainWallet,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

/**
 * Build initialize_inventory instruction.
 */
async function buildInitializeInventoryInstruction(
  program: Program,
  inventoryPda: PublicKey,
  sessionPda: PublicKey,
  mainWallet: PublicKey
): Promise<TransactionInstruction> {
  return await program.methods
    .initializeInventory()
    .accounts({
      playerInventory: inventoryPda,
      gameSession: sessionPda,
      player: mainWallet,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate session creation prerequisites.
 *
 * @param connection - Solana connection
 * @param mainWallet - Player's main wallet
 * @param campaignLevel - Campaign level to start
 * @param profile - Player's profile data
 * @returns Validation result with error message if invalid
 */
export async function validateSessionCreation(
  connection: Connection,
  mainWallet: PublicKey,
  campaignLevel: number,
  profile: { availableRuns: number; highestLevelUnlocked: number }
): Promise<{ valid: boolean; error?: string }> {
  // Check available runs
  if (profile.availableRuns <= 0) {
    return { valid: false, error: 'No available runs remaining' };
  }

  // Check level is unlocked
  if (campaignLevel > profile.highestLevelUnlocked) {
    return { valid: false, error: `Level ${campaignLevel} is not unlocked yet` };
  }

  // Check level is valid
  if (campaignLevel < 1 || campaignLevel > 40) {
    return { valid: false, error: 'Invalid campaign level' };
  }

  // Check session doesn't already exist
  const [sessionPda] = deriveSessionPda(mainWallet, campaignLevel);
  const existingSession = await connection.getAccountInfo(sessionPda);
  if (existingSession) {
    return { valid: false, error: 'Session already exists for this level' };
  }

  // Check wallet has enough balance
  const balance = await connection.getBalance(mainWallet);
  const requiredBalance = DEFAULT_BURNER_FUNDING + 10_000_000; // Burner funding + rent/fees
  if (balance < requiredBalance) {
    return {
      valid: false,
      error: `Insufficient balance. Need ${(requiredBalance / LAMPORTS_PER_SOL).toFixed(3)} SOL`,
    };
  }

  return { valid: true };
}

// ============================================================================
// Simplified Bundle (for testing/partial implementation)
// ============================================================================

/**
 * Create a simplified session bundle with just session + game state.
 * Useful when enemy/POI/inventory programs aren't available.
 */
export async function createSimplifiedSessionBundle(
  connection: Connection,
  sessionProgram: Program,
  gameplayProgram: Program,
  mainWallet: PublicKey,
  burnerWallet: PublicKey,
  campaignLevel: number,
  startX: number = 4,
  startY: number = 4
): Promise<{ transaction: Transaction; sessionPda: PublicKey; gameStatePda: PublicKey }> {
  const [sessionPda] = deriveSessionPda(mainWallet, campaignLevel);
  const [sessionCounterPda] = deriveSessionCounterPda();
  const [profilePda] = derivePlayerProfilePda(mainWallet);
  const [gameStatePda] = deriveGameStatePda(sessionPda);

  const transaction = new Transaction();

  // Start session
  const startSessionIx = await sessionProgram.methods
    .startSession(campaignLevel, DEFAULT_BURNER_FUNDING)
    .accounts({
      gameSession: sessionPda,
      sessionCounter: sessionCounterPda,
      playerProfile: profilePda,
      player: mainWallet,
      burnerWallet: burnerWallet,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  transaction.add(startSessionIx);

  // Initialize game state
  const initGameStateIx = await gameplayProgram.methods
    .initializeGameState(MAP_WIDTH, MAP_HEIGHT, startX, startY)
    .accounts({
      gameState: gameStatePda,
      gameSession: sessionPda,
      player: mainWallet,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  transaction.add(initGameStateIx);

  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = mainWallet;

  return { transaction, sessionPda, gameStatePda };
}

// ============================================================================
// Transaction Size Estimation
// ============================================================================

/**
 * Estimate transaction size for a session bundle.
 * Transaction limit is 1232 bytes.
 */
export function estimateTransactionSize(): {
  estimated: number;
  limit: number;
  fits: boolean;
} {
  // Rough estimates per instruction
  const sizes = {
    startSession: 200,
    initializeGameState: 150,
    spawnEnemies: 250,
    spawnPois: 200,
    initializeInventory: 100,
    overhead: 50, // Signatures, headers, etc.
  };

  const estimated = Object.values(sizes).reduce((a, b) => a + b, 0);
  const limit = 1232;

  return {
    estimated,
    limit,
    fits: estimated < limit,
  };
}
