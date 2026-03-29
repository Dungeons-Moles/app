/**
 * Session Bundle Builder
 *
 * Creates session initialization transactions. The `start_session` instruction
 * now atomically creates all sub-accounts (GameSession, GeneratedMap, GameState,
 * PlayerInventory, MapPois) via CPI in a single instruction.
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
  deriveMapPoisPda,
  deriveInventoryPda,
  derivePlayerProfilePda,
  deriveGeneratedMapPda,
  deriveMapConfigPda,
  deriveSessionManagerAuthorityPda,
  deriveMapVrfStatePda,
  derivePoiVrfStatePda,
  deriveGameplayVrfStatePda,
  deriveSessionDiscoveryPda,
  DEFAULT_SESSION_SIGNER_FUNDING,
} from './constants';
import { SOLANA_CONFIG } from './config';
import { buildResetDuelEntryInstruction, deriveDuelEntryPda, fetchDuelEntry } from './duels';
import { createGameplayStateProgram } from './programs';

// ============================================================================
// Types
// ============================================================================

export interface SessionBundleResult {
  transaction: Transaction;
  sessionPda: PublicKey;
  gameStatePda: PublicKey;
  poisPda: PublicKey;
  inventoryPda: PublicKey;
  generatedMapPda: PublicKey;
  sessionDiscoveryPda: PublicKey;
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
 * - GameState (gameplay-state)
 * - MapPois (poi-system)
 * - PlayerInventory (player-inventory)
 */
export async function createSessionBundle(
  connection: Connection,
  programs: SessionPrograms,
  mainWallet: PublicKey,
  sessionSigner: PublicKey,
  campaignLevel: number,
  nonce: bigint | number = 0
): Promise<SessionBundleResult> {
  // Derive all PDAs
  const [sessionPda] = deriveSessionPda(mainWallet, campaignLevel, nonce);
  const [sessionCounterPda] = deriveSessionCounterPda();
  const [profilePda] = derivePlayerProfilePda(mainWallet);
  const [gameStatePda] = deriveGameStatePda(sessionPda);
  const [poisPda] = deriveMapPoisPda(sessionPda);
  const [inventoryPda] = deriveInventoryPda(sessionPda);
  const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
  const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);
  const [mapConfigPda] = deriveMapConfigPda();

  const startSessionIx = await programs.sessionManager.methods
    .startSession(campaignLevel)
    .accounts({
      gameSession: sessionPda,
      sessionCounter: sessionCounterPda,
      playerProfile: profilePda,
      player: mainWallet,
      sessionSigner: sessionSigner,
      mapConfig: mapConfigPda,
      generatedMap: generatedMapPda,
      gameState: gameStatePda,
      mapPois: poisPda,
      inventory: inventoryPda,
      sessionDiscovery: sessionDiscoveryPda,
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
    poisPda,
    inventoryPda,
    generatedMapPda,
    sessionDiscoveryPda,
  };
}

// ============================================================================
// End Session
// ============================================================================

/**
 * End a session after death or level completion.
 * Only requires session signer signature - no user interaction needed.
 * Victory/defeat is determined on-chain from game_state.is_dead and game_state.completed.
 *
 * @param connection - Solana connection
 * @param program - Session manager program
 * @param sessionPda - Session PDA
 * @param gameStatePda - Game state PDA (for validating death/completion)
 * @param inventoryPda - Inventory PDA (closed as part of cleanup)
 * @param playerPubkey - Player wallet (receives rent refund, does NOT sign)
 * @param sessionSignerPubkey - Session signer (must sign)
 * @param campaignLevel - Campaign level for PDA derivation
 */
export async function endSession(
  connection: Connection,
  program: Program,
  sessionPda: PublicKey,
  gameStatePda: PublicKey,
  inventoryPda: PublicKey,
  playerPubkey: PublicKey,
  sessionSignerPubkey: PublicKey,
  campaignLevel: number
): Promise<Transaction> {
  // Derive additional PDAs
  const [playerProfilePda] = derivePlayerProfilePda(playerPubkey);
  const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
  const [mapPoisPda] = deriveMapPoisPda(sessionPda);
  const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);

  const endSessionIx = await program.methods
    .endSession(campaignLevel)
    .accountsPartial({
      gameSession: sessionPda,
      gameState: gameStatePda,
      generatedMap: generatedMapPda,
      mapPois: mapPoisPda,
      playerProfile: playerProfilePda,
      player: playerPubkey,
      sessionSigner: sessionSignerPubkey,
      sessionManagerAuthority: deriveSessionManagerAuthorityPda()[0],
      inventory: inventoryPda,
      sessionDiscovery: sessionDiscoveryPda,
      gauntletEchoes: null,
      playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
      gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
      playerProfileProgram: SOLANA_CONFIG.programs.playerProfile,
      mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
      poiSystemProgram: SOLANA_CONFIG.programs.poiSystem,
    } as any)
    .instruction();

  const transaction = new Transaction();
  transaction.add(endSessionIx);

  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  // Session signer pays and signs - no user interaction needed
  transaction.feePayer = sessionSignerPubkey;

  return transaction;
}

/**
 * Abandon a session at any time (user-initiated).
 * Requires main wallet signature.
 * Used when player wants to quit a session early.
 * Closes all session-related accounts to allow starting a new session on the same level.
 *
 * If a duel_entry exists for this session PDA, prepend reset_duel_entry to refund
 * staked SOL and clean up duel state before closing the session.
 */
export async function abandonSession(
  connection: Connection,
  program: Program,
  sessionPda: PublicKey,
  inventoryPda: PublicKey,
  playerPubkey: PublicKey,
  sessionSignerPubkey: PublicKey,
  campaignLevel: number,
  duelNonce: bigint | number = 0
): Promise<Transaction> {
  // Derive all PDAs that need to be closed
  const [gameStatePda] = deriveGameStatePda(sessionPda);
  const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
  const [mapPoisPda] = deriveMapPoisPda(sessionPda);
  const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);

  const transaction = new Transaction();

  // duel_entry is non-delegated and keyed by session PDA, so detect it directly
  // instead of relying on a caller-provided duel nonce.
  const [duelEntryPda] = deriveDuelEntryPda(sessionPda);
  const duelEntryInfo = await connection.getAccountInfo(duelEntryPda);
  if (duelEntryInfo) {
    const gameplayProgram = createGameplayStateProgram(connection);
    const duelEntry = await fetchDuelEntry(gameplayProgram, sessionPda).catch(() => null);
    const resetIx = await buildResetDuelEntryInstruction(
      gameplayProgram,
      sessionPda,
      gameStatePda,
      playerPubkey,
      sessionSignerPubkey,
      duelEntry?.matchedCreatorPlayer
    );
    transaction.add(resetIx);
  }

  // Check which VRF accounts exist and are closeable (owned by the program, not delegated).
  // Delegated accounts are owned by the delegation program and cannot be closed on base layer.
  const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');
  const [mapVrfStatePda] = deriveMapVrfStatePda(sessionPda);
  const [poiVrfStatePda] = derivePoiVrfStatePda(sessionPda);
  const [gameplayVrfStatePda] = deriveGameplayVrfStatePda(sessionPda);
  const [mapVrfInfoRaw, poiVrfInfoRaw, gameplayVrfInfoRaw] = await Promise.all([
    connection.getAccountInfo(mapVrfStatePda).catch(() => null),
    connection.getAccountInfo(poiVrfStatePda).catch(() => null),
    connection.getAccountInfo(gameplayVrfStatePda).catch(() => null),
  ]);
  // Only include VRF accounts that are NOT still delegated
  const mapVrfInfo = mapVrfInfoRaw && !mapVrfInfoRaw.owner.equals(DELEGATION_PROGRAM_ID) ? mapVrfInfoRaw : null;
  const poiVrfInfo = poiVrfInfoRaw && !poiVrfInfoRaw.owner.equals(DELEGATION_PROGRAM_ID) ? poiVrfInfoRaw : null;
  const gameplayVrfInfo = gameplayVrfInfoRaw && !gameplayVrfInfoRaw.owner.equals(DELEGATION_PROGRAM_ID) ? gameplayVrfInfoRaw : null;

  const abandonSessionIx = await program.methods
    .abandonSession(campaignLevel)
    .accountsPartial({
      gameSession: sessionPda,
      gameState: gameStatePda,
      generatedMap: generatedMapPda,
      mapPois: mapPoisPda,
      player: playerPubkey,
      sessionSigner: sessionSignerPubkey,
      inventory: inventoryPda,
      sessionDiscovery: sessionDiscoveryPda,
      gauntletEchoes: null,
      mapVrfState: mapVrfInfo ? mapVrfStatePda : null,
      poiVrfState: poiVrfInfo ? poiVrfStatePda : null,
      gameplayVrfState: gameplayVrfInfo ? gameplayVrfStatePda : null,
      playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
      gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
      mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
      poiSystemProgram: SOLANA_CONFIG.programs.poiSystem,
    } as any)
    .instruction();
  transaction.add(abandonSessionIx);

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
  profile: { availableRuns: number; highestLevelUnlocked: number },
  nonce: bigint | number = 0
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

  const [sessionPda] = deriveSessionPda(mainWallet, campaignLevel, nonce);
  const existingSession = await connection.getAccountInfo(sessionPda);
  if (existingSession) {
    return { valid: false, error: 'Session already exists for this level' };
  }

  const balance = await connection.getBalance(mainWallet);
  const requiredBalance = DEFAULT_SESSION_SIGNER_FUNDING + 5_000_000; // reduced buffer since signer may already be funded
  if (balance < requiredBalance) {
    return {
      valid: false,
      error: `Insufficient balance. Need ${(requiredBalance / LAMPORTS_PER_SOL).toFixed(3)} SOL`,
    };
  }

  return { valid: true };
}
