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

import { PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import type { Connection, Keypair } from '@solana/web3.js';
import type { Program } from '@coral-xyz/anchor';
import { deriveMapVrfStatePda, derivePoiVrfStatePda, deriveGameplayVrfStatePda } from './constants';
import { SOLANA_CONFIG } from './config';

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

function pickMethod(program: Program, preferred: string, fallback: string) {
  const methods = (program.methods ?? {}) as Record<string, (...args: any[]) => any>;
  if (typeof methods[preferred] === 'function') return methods[preferred].bind(methods);
  if (typeof methods[fallback] === 'function') return methods[fallback].bind(methods);
  throw new Error(`Neither ${preferred} nor ${fallback} exists on program`);
}

// ============================================================================
// VRF Request + Fulfill (Duel / Gauntlet)
// ============================================================================

/**
 * Build request+fulfill instructions for map VRF.
 * Intended to run before start_duel_session/start_gauntlet_session so map seed
 * is available during start_* initialization.
 */
export async function buildRequestAndFulfillMapVrfInstructions(
  mapGeneratorProgram: Program,
  sessionPda: PublicKey,
  payer: PublicKey,
  sessionSigner: PublicKey
): Promise<TransactionInstruction[]> {
  const [mapVrfStatePda] = deriveMapVrfStatePda(sessionPda);
  const localMode = SOLANA_CONFIG.isLocalValidator;
  const mapRandomness = localMode ? generateRandomness() : null;

  const requestMap = pickMethod(mapGeneratorProgram, 'requestMapRng', 'requestMapVrf');
  const requestMapVrfIx = await requestMap()
    .accounts({
      payer,
      session: sessionPda,
      vrfState: mapVrfStatePda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  if (!localMode) {
    return [requestMapVrfIx];
  }

  const fulfillMap = pickMethod(mapGeneratorProgram, 'fulfillMapRng', 'fulfillMapVrf');
  const fulfillMapVrfIx = await fulfillMap(mapRandomness)
    .accounts({
      oracle: sessionSigner,
      vrfState: mapVrfStatePda,
    })
    .instruction();

  return [requestMapVrfIx, fulfillMapVrfIx];
}

/**
 * Build a transaction that requests and fulfills POI+gameplay VRF.
 * Map VRF is intentionally excluded and should be handled pre-start.
 */
export async function buildRequestAndFulfillPoiAndGameplayVrfTransaction(
  programs: {
    poiSystem: Program;
    gameplayState: Program;
  },
  sessionPda: PublicKey,
  payer: PublicKey,
  sessionSigner: PublicKey
): Promise<Transaction> {
  const [poiVrfStatePda] = derivePoiVrfStatePda(sessionPda);
  const [gameplayVrfStatePda] = deriveGameplayVrfStatePda(sessionPda);
  const localMode = SOLANA_CONFIG.isLocalValidator;

  const poiRandomness = localMode ? generateRandomness() : null;
  const gameplayRandomness = localMode ? generateRandomness() : null;

  const requestPoi = pickMethod(programs.poiSystem, 'requestPoiRng', 'requestPoiVrf');
  const requestPoiVrfIx = await requestPoi()
    .accounts({
      payer,
      session: sessionPda,
      vrfState: poiVrfStatePda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const requestGameplay = pickMethod(
    programs.gameplayState,
    'requestGameplayRng',
    'requestGameplayVrf'
  );
  const requestGameplayVrfIx = await requestGameplay()
    .accounts({
      payer,
      session: sessionPda,
      vrfState: gameplayVrfStatePda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const tx = new Transaction();
  tx.add(requestPoiVrfIx, requestGameplayVrfIx);
  if (localMode) {
    const fulfillPoi = pickMethod(programs.poiSystem, 'fulfillPoiRng', 'fulfillPoiVrf');
    const fulfillPoiVrfIx = await fulfillPoi(poiRandomness)
      .accounts({
        oracle: sessionSigner,
        vrfState: poiVrfStatePda,
      })
      .instruction();
    const fulfillGameplay = pickMethod(
      programs.gameplayState,
      'fulfillGameplayRng',
      'fulfillGameplayVrf'
    );
    const fulfillGameplayVrfIx = await fulfillGameplay(gameplayRandomness)
      .accounts({
        vrfProgramIdentity: sessionSigner,
        vrfState: gameplayVrfStatePda,
      })
      .instruction();
    tx.add(fulfillPoiVrfIx, fulfillGameplayVrfIx);
  }
  return tx;
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
  const localMode = SOLANA_CONFIG.isLocalValidator;
  const poiRandomness = localMode ? generateRandomness() : null;

  const requestPoi = pickMethod(poiSystemProgram, 'requestPoiRng', 'requestPoiVrf');
  const requestIx = await requestPoi()
    .accounts({
      payer,
      session: sessionPda,
      vrfState: poiVrfStatePda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  if (!localMode) {
    return new Transaction().add(requestIx);
  }

  const fulfillPoi = pickMethod(poiSystemProgram, 'fulfillPoiRng', 'fulfillPoiVrf');
  const fulfillIx = await fulfillPoi(poiRandomness)
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
