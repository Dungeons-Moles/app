/**
 * Session Bundle Builder
 *
 * Creates session initialization transactions. The `start_session` instruction
 * now atomically creates all sub-accounts (GameSession, GeneratedMap, GameState,
 * MapEnemies, PlayerInventory, MapPois) via CPI in a single instruction.
 */

import {
  Connection,
  PublicKey,
  Transaction,
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
  deriveGeneratedMapPda,
  deriveMapConfigPda,
  DEFAULT_BURNER_FUNDING,
} from './constants';
import { SOLANA_CONFIG } from './config';

// ============================================================================
// Types
// ============================================================================

export interface SessionBundleResult {
  transaction: Transaction;
  sessionPda: PublicKey;
  gameStatePda: PublicKey;
  enemiesPda: PublicKey;
  poisPda: PublicKey;
  inventoryPda: PublicKey;
  generatedMapPda: PublicKey;
}

export interface SessionPrograms {
  sessionManager: Program;
  mapGenerator: Program;
  gameplayState: Program;
  playerInventory: Program;
  poiSystem: Program;
}

// ============================================================================
// Main Bundle Builder
// ============================================================================

/**
 * Create a session initialization transaction.
 *
 * The `start_session` instruction handles all sub-account creation via CPI:
 * - GeneratedMap (map-generator)
 * - GameState + MapEnemies (gameplay-state)
 * - MapPois (poi-system)
 * - PlayerInventory (player-inventory)
 */
export async function createSessionBundle(
  connection: Connection,
  programs: SessionPrograms,
  mainWallet: PublicKey,
  burnerWallet: PublicKey,
  campaignLevel: number
): Promise<SessionBundleResult> {
  // Derive all PDAs
  const [sessionPda] = deriveSessionPda(mainWallet, campaignLevel);
  const [sessionCounterPda] = deriveSessionCounterPda();
  const [profilePda] = derivePlayerProfilePda(mainWallet);
  const [gameStatePda] = deriveGameStatePda(sessionPda);
  const [enemiesPda] = deriveMapEnemiesPda(sessionPda);
  const [poisPda] = deriveMapPoisPda(sessionPda);
  const [inventoryPda] = deriveInventoryPda(sessionPda);
  const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
  const [mapConfigPda] = deriveMapConfigPda();

  const startSessionIx = await programs.sessionManager.methods
    .startSession(campaignLevel)
    .accounts({
      gameSession: sessionPda,
      sessionCounter: sessionCounterPda,
      playerProfile: profilePda,
      player: mainWallet,
      burnerWallet: burnerWallet,
      mapConfig: mapConfigPda,
      generatedMap: generatedMapPda,
      gameState: gameStatePda,
      mapEnemies: enemiesPda,
      mapPois: poisPda,
      inventory: inventoryPda,
      mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
      gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
      poiSystemProgram: SOLANA_CONFIG.programs.poiSystem,
      playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
      playerProfileProgram: SOLANA_CONFIG.programs.playerProfile,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const transaction = new Transaction();
  transaction.add(startSessionIx);

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
    generatedMapPda,
  };
}

// ============================================================================
// End Session
// ============================================================================

/**
 * End a session (abandon or after defeat/victory).
 * The `end_session` instruction requires inventory PDA and program for cleanup.
 * Both main wallet and burner wallet must sign (burner owns the inventory).
 */
export async function endSession(
  connection: Connection,
  program: Program,
  sessionPda: PublicKey,
  inventoryPda: PublicKey,
  playerPubkey: PublicKey,
  burnerPubkey: PublicKey,
  campaignLevel: number,
  victory: boolean = false
): Promise<Transaction> {
  const endSessionIx = await program.methods
    .endSession(campaignLevel, victory)
    .accounts({
      gameSession: sessionPda,
      player: playerPubkey,
      burnerWallet: burnerPubkey,
      inventory: inventoryPda,
      playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
    })
    .instruction();

  const transaction = new Transaction();
  transaction.add(endSessionIx);

  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = playerPubkey;

  return transaction;
}

// ============================================================================
// Validation
// ============================================================================

export async function validateSessionCreation(
  connection: Connection,
  mainWallet: PublicKey,
  campaignLevel: number,
  profile: { availableRuns: number; highestLevelUnlocked: number }
): Promise<{ valid: boolean; error?: string }> {
  if (profile.availableRuns <= 0) {
    return { valid: false, error: 'No available sessions remaining' };
  }

  if (campaignLevel > profile.highestLevelUnlocked) {
    return { valid: false, error: `Level ${campaignLevel} is not unlocked yet` };
  }

  if (campaignLevel < 1 || campaignLevel > 40) {
    return { valid: false, error: 'Invalid campaign level' };
  }

  const [sessionPda] = deriveSessionPda(mainWallet, campaignLevel);
  const existingSession = await connection.getAccountInfo(sessionPda);
  if (existingSession) {
    return { valid: false, error: 'Session already exists for this level' };
  }

  const balance = await connection.getBalance(mainWallet);
  const requiredBalance = DEFAULT_BURNER_FUNDING + 10_000_000;
  if (balance < requiredBalance) {
    return {
      valid: false,
      error: `Insufficient balance. Need ${(requiredBalance / LAMPORTS_PER_SOL).toFixed(3)} SOL`,
    };
  }

  return { valid: true };
}
