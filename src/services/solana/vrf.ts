/**
 * On-chain VRF transaction builders.
 *
 * Replaces the previous HTTP-based VRF endpoint approach. Each program
 * (map-generator, poi-system, gameplay-state) has its own VRF state account
 * with request/fulfill/close lifecycle.
 *
 * Since the oracle signer is currently stubbed (no address constraint),
 * the frontend acts as the oracle by signing fulfill calls with the session
 * signer and providing crypto.getRandomValues() randomness.
 */

import { ComputeBudgetProgram, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import type { Connection, Keypair } from '@solana/web3.js';
import type { Program } from '@coral-xyz/anchor';
import {
  deriveMapVrfStatePda,
  derivePoiVrfStatePda,
  deriveGameplayVrfStatePda,
  deriveGeneratedMapPda,
} from './constants';

// ============================================================================
// Randomness Generation
// ============================================================================

/** Generate 32 bytes of randomness for manual VRF fulfill (stubbed oracle). */
export function generateRandomness(): number[] {
  const bytes = new Uint8Array(32);
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    // Fallback for environments without WebCrypto
    for (let i = 0; i < 32; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes);
}

// ============================================================================
// All-VRF Request + Fulfill (Duel / Gauntlet)
// ============================================================================

/**
 * Build a transaction that requests and fulfills VRF for all three programs.
 * Bundles 6 instructions: request+fulfill pairs for map, poi, and gameplay.
 *
 * Used for PvP modes (duel/gauntlet) that need all three VRF states.
 */
export async function buildRequestAndFulfillAllVrfTransaction(
  programs: {
    mapGenerator: Program;
    poiSystem: Program;
    gameplayState: Program;
  },
  sessionPda: PublicKey,
  payer: PublicKey,
  sessionSigner: PublicKey
): Promise<Transaction> {
  const [mapVrfStatePda] = deriveMapVrfStatePda(sessionPda);
  const [poiVrfStatePda] = derivePoiVrfStatePda(sessionPda);
  const [gameplayVrfStatePda] = deriveGameplayVrfStatePda(sessionPda);

  const mapRandomness = generateRandomness();
  const poiRandomness = generateRandomness();
  const gameplayRandomness = generateRandomness();

  // Map VRF: request + fulfill
  const requestMapVrfIx = await programs.mapGenerator.methods
    .requestMapVrf()
    .accounts({
      payer,
      session: sessionPda,
      vrfState: mapVrfStatePda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const fulfillMapVrfIx = await programs.mapGenerator.methods
    .fulfillMapVrf(mapRandomness)
    .accounts({
      oracle: sessionSigner,
      vrfState: mapVrfStatePda,
    })
    .instruction();

  // POI VRF: request + fulfill
  const requestPoiVrfIx = await programs.poiSystem.methods
    .requestPoiVrf()
    .accounts({
      payer,
      session: sessionPda,
      vrfState: poiVrfStatePda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const fulfillPoiVrfIx = await programs.poiSystem.methods
    .fulfillPoiVrf(poiRandomness)
    .accounts({
      oracle: sessionSigner,
      vrfState: poiVrfStatePda,
    })
    .instruction();

  // Gameplay VRF: request + fulfill
  const requestGameplayVrfIx = await programs.gameplayState.methods
    .requestGameplayVrf()
    .accounts({
      payer,
      session: sessionPda,
      vrfState: gameplayVrfStatePda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const fulfillGameplayVrfIx = await programs.gameplayState.methods
    .fulfillGameplayVrf(gameplayRandomness)
    .accounts({
      vrfProgramIdentity: sessionSigner,
      vrfState: gameplayVrfStatePda,
    })
    .instruction();

  const tx = new Transaction();
  tx.add(
    requestMapVrfIx,
    fulfillMapVrfIx,
    requestPoiVrfIx,
    fulfillPoiVrfIx,
    requestGameplayVrfIx,
    fulfillGameplayVrfIx
  );
  return tx;
}

// ============================================================================
// Map Regeneration with VRF Seed
// ============================================================================

/**
 * Build a transaction to regenerate the map using VRF-derived seed.
 * Called after VRF fulfill to replace the fallback-seeded map.
 */
export async function buildRegenerateMapTransaction(
  mapGeneratorProgram: Program,
  sessionPda: PublicKey,
  sessionSigner: PublicKey,
  campaignLevel: number
): Promise<Transaction> {
  const [mapVrfStatePda] = deriveMapVrfStatePda(sessionPda);
  const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);

  const ix = await mapGeneratorProgram.methods
    .regenerateMap(campaignLevel)
    .accounts({
      sessionSigner,
      session: sessionPda,
      generatedMap: generatedMapPda,
      vrfState: mapVrfStatePda,
    })
    .instruction();

  return new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
    ix
  );
}

// ============================================================================
// POI-Only VRF Request + Fulfill (Campaign)
// ============================================================================

/**
 * Build a transaction that requests and fulfills POI VRF only.
 * Used for campaign sessions where the map seed is deterministic
 * but POI offers need VRF for fairness.
 */
export async function buildRequestAndFulfillPoiVrfTransaction(
  poiSystemProgram: Program,
  sessionPda: PublicKey,
  payer: PublicKey,
  sessionSigner: PublicKey
): Promise<Transaction> {
  const [poiVrfStatePda] = derivePoiVrfStatePda(sessionPda);
  const poiRandomness = generateRandomness();

  const requestIx = await poiSystemProgram.methods
    .requestPoiVrf()
    .accounts({
      payer,
      session: sessionPda,
      vrfState: poiVrfStatePda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const fulfillIx = await poiSystemProgram.methods
    .fulfillPoiVrf(poiRandomness)
    .accounts({
      oracle: sessionSigner,
      vrfState: poiVrfStatePda,
    })
    .instruction();

  return new Transaction().add(requestIx, fulfillIx);
}

// ============================================================================
// VRF State Polling (for future oracle integration)
// ============================================================================

/**
 * Poll a VRF state account until its status indicates fulfillment.
 * For future use when a real oracle provides randomness asynchronously.
 */
export async function waitForVrfFulfillment(
  connection: Connection,
  vrfStatePda: PublicKey,
  timeoutMs = 30_000
): Promise<boolean> {
  const startTime = Date.now();
  const VRF_STATUS_OFFSET = 8 + 32 + 32 + 8; // discriminator + session + randomness + nonce
  const VRF_STATUS_FULFILLED = 1;

  while (Date.now() - startTime < timeoutMs) {
    const info = await connection.getAccountInfo(vrfStatePda);
    if (info?.data && info.data.length > VRF_STATUS_OFFSET) {
      const status = info.data[VRF_STATUS_OFFSET];
      if (status >= VRF_STATUS_FULFILLED) {
        return true;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

// ============================================================================
// Guest / Offline Seed (backward-compatible export)
// ============================================================================

const MAX_I31 = 2_147_483_647;

/** Generate a secure local seed for guest/offline mode. */
function getLocalSecureSeed(): number {
  const bytes = new Uint32Array(1);
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
    const normalized = bytes[0] % MAX_I31;
    return normalized > 0 ? normalized : 1;
  }
  return (Date.now() % (MAX_I31 - 1)) + 1;
}

/**
 * Get a random seed for guest/offline mode.
 * On-chain sessions now use VRF via request/fulfill lifecycle instead.
 */
export async function getVrfSeed(): Promise<number> {
  return getLocalSecureSeed();
}
