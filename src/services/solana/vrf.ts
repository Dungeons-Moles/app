/**
 * On-chain VRF transaction builders.
 *
 * Replaces the previous HTTP-based VRF endpoint approach. Each program
 * (map-generator, poi-system, gameplay-state) has its own VRF state account
 * with request/fulfill/close lifecycle.
 *
 * All clusters use request_*_vrf and wait for MagicBlock VRF callbacks.
 */

import { PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import type { Connection } from '@solana/web3.js';
import type { Program } from '@coral-xyz/anchor';
import {
  deriveMapVrfStatePda,
  derivePoiVrfStatePda,
  deriveGameplayVrfStatePda,
  deriveGeneratedMapPda,
  deriveGameStatePda,
  deriveMapPoisPda,
  deriveMapConfigPda,
  deriveGameplayAuthorityPda,
  deriveSessionDiscoveryPda,
  derivePitDraftVrfStatePda,
} from './constants';
import { SOLANA_CONFIG } from './config';

const IDENTITY_SEED = Buffer.from('identity');
const DEFAULT_REMOTE_VRF_QUEUE = '5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc';
const DEFAULT_LOCAL_VRF_QUEUE = 'GKE6d7iv8kCBrsxr78W3xVdjGLLLJnxsGiuzrsZCGEvb';
/** ER oracle queue. All VRF requests must go through this queue on the Ephemeral Rollup. */
const VRF_EPHEMERAL_QUEUE = new PublicKey(
  process.env.EXPO_PUBLIC_VRF_ORACLE_QUEUE ??
    (SOLANA_CONFIG.isLocalValidator ? DEFAULT_LOCAL_VRF_QUEUE : DEFAULT_REMOTE_VRF_QUEUE)
);
const SLOT_HASHES_SYSVAR = new PublicKey('SysvarS1otHashes111111111111111111111111111');
const VRF_PROGRAM_ID = new PublicKey('Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz');

function pickMethod(
  program: Program,
  preferred: string,
  fallback: string,
  options?: { strictPreferred?: boolean }
) {
  const methods = (program.methods ?? {}) as Record<string, (...args: any[]) => any>;
  if (typeof methods[preferred] === 'function') return methods[preferred].bind(methods);
  if (options?.strictPreferred) {
    throw new Error(`Missing required method ${preferred} on program for current mode`);
  }
  if (typeof methods[fallback] === 'function') return methods[fallback].bind(methods);
  throw new Error(`Neither ${preferred} nor ${fallback} exists on program`);
}

/** Anchor discriminator for poi-system's fulfill_poi_vrf instruction. */
const FULFILL_POI_VRF_DISCRIMINATOR = Buffer.from([166, 31, 37, 201, 6, 212, 250, 168]);
/** Anchor discriminator for map-generator's fulfill_map_vrf instruction. */
const FULFILL_MAP_VRF_DISCRIMINATOR = Buffer.from([16, 129, 66, 174, 79, 226, 145, 92]);
/** Anchor discriminator for gameplay-state's fulfill_gameplay_vrf instruction. */
const FULFILL_GAMEPLAY_VRF_DISCRIMINATOR = Buffer.from([237, 45, 86, 168, 79, 105, 52, 69]);

/**
 * Build a raw `request_randomness` instruction for the ER VRF program.
 * Replicates ephemeral-vrf-sdk's `create_request_randomness_ix` in TypeScript
 * so the frontend can send it as a top-level instruction (avoiding CPI
 * writable-account restrictions on the ER).
 */
function buildRawVrfRequestInstruction(params: {
  payer: PublicKey;
  callbackProgramId: PublicKey;
  callbackDiscriminator: Buffer;
  vrfStatePda: PublicKey;
  sessionPda: PublicKey;
}): TransactionInstruction {
  const { payer, callbackProgramId, callbackDiscriminator, vrfStatePda, sessionPda } = params;
  const [programIdentity] = PublicKey.findProgramAddressSync([IDENTITY_SEED], callbackProgramId);

  // Build caller_seed: first 8 bytes = nonce (1 as u64 LE), rest from session key
  const callerSeed = Buffer.alloc(32);
  Buffer.from(sessionPda.toBytes()).copy(callerSeed);
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(1n);
  nonceBuf.copy(callerSeed, 0);

  // Borsh-serialize the RequestRandomness data
  // Format: caller_seed [u8;32] | callback_program_id [u8;32] |
  //   callback_discriminator (vec: u32 len + bytes) |
  //   callback_accounts_metas (vec: u32 len + items) |
  //   callback_args (vec: u32 len + bytes)
  const parts: Buffer[] = [];

  // caller_seed: [u8; 32]
  parts.push(callerSeed);

  // callback_program_id: Pubkey (32 bytes)
  parts.push(Buffer.from(callbackProgramId.toBytes()));

  // callback_discriminator: Vec<u8> (4-byte LE length + bytes)
  const discLenBuf = Buffer.alloc(4);
  discLenBuf.writeUInt32LE(callbackDiscriminator.length);
  parts.push(discLenBuf);
  parts.push(callbackDiscriminator);

  // callback_accounts_metas: Vec<SerializableAccountMeta> (4-byte LE count + items)
  // Each item: pubkey (32) + is_signer (1) + is_writable (1) = 34 bytes
  const accountsCountBuf = Buffer.alloc(4);
  accountsCountBuf.writeUInt32LE(1); // one callback account: vrf_state
  parts.push(accountsCountBuf);
  // vrf_state: writable, not signer
  parts.push(Buffer.from(vrfStatePda.toBytes())); // pubkey
  parts.push(Buffer.from([0])); // is_signer = false
  parts.push(Buffer.from([1])); // is_writable = true

  // callback_args: Vec<u8> (empty)
  const emptyVecBuf = Buffer.alloc(4);
  emptyVecBuf.writeUInt32LE(0);
  parts.push(emptyVecBuf);

  // Prepend 8-byte discriminator [3, 0, 0, 0, 0, 0, 0, 0]
  const discriminator = Buffer.from([3, 0, 0, 0, 0, 0, 0, 0]);
  const data = Buffer.concat([discriminator, ...parts]);

  return new TransactionInstruction({
    programId: VRF_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: programIdentity, isSigner: false, isWritable: false },
      { pubkey: VRF_EPHEMERAL_QUEUE, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SLOT_HASHES_SYSVAR, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function vrfRequestAccounts(
  programId: PublicKey,
  payer: PublicKey,
  sessionPda: PublicKey,
  vrfStatePda: PublicKey,
) {
  const [programIdentity] = PublicKey.findProgramAddressSync([IDENTITY_SEED], programId);
  return {
    payer,
    session: sessionPda,
    vrfState: vrfStatePda,
    programIdentity,
    // All VRF requests go to the ER oracle queue. poi-system's oracle_queue
    // is now unconstrained (matching map_generator / gameplay_state pattern).
    oracleQueue: VRF_EPHEMERAL_QUEUE,
    slotHashes: SLOT_HASHES_SYSVAR,
    vrfProgram: VRF_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  };
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
  _sessionSigner: PublicKey
): Promise<TransactionInstruction[]> {
  const [mapVrfStatePda] = deriveMapVrfStatePda(sessionPda);
  const requestMap = pickMethod(mapGeneratorProgram, 'requestMapVrf', 'requestMapVrf', {
    strictPreferred: true,
  });
  const requestMapVrfIx = await requestMap()
    .accounts(vrfRequestAccounts(mapGeneratorProgram.programId, payer, sessionPda, mapVrfStatePda))
    .instruction();
  return [requestMapVrfIx];
}

/**
 * Build a transaction that calls `generate_map_with_vrf` on the ER after map VRF fulfillment.
 * Generates the full maze using VRF-derived randomness.
 * Used for duel/gauntlet flows where map VRF is requested post-delegation on the ER.
 */
export async function buildFillMapWithVrfTransaction(
  mapGeneratorProgram: Program,
  sessionPda: PublicKey,
  sessionSigner: PublicKey,
  campaignLevel: number
): Promise<Transaction> {
  const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
  const [mapVrfStatePda] = deriveMapVrfStatePda(sessionPda);
  const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);

  const method = pickMethod(mapGeneratorProgram, 'generateMapWithVrf', 'generateMapWithVrf');
  const ix = await method(campaignLevel)
    .accountsPartial({
      sessionSigner,
      session: sessionPda,
      generatedMap: generatedMapPda,
      vrfState: mapVrfStatePda,
      sessionDiscovery: sessionDiscoveryPda,
    })
    .instruction();

  return new Transaction().add(ix);
}

/**
 * Build a transaction that calls `fill_map_for_campaign` on the ER.
 * The map-generator program loads the campaign seed from on-chain MapConfig,
 * so the client never needs to know the seed.
 */
export async function buildFillMapForCampaignTransaction(
  mapGeneratorProgram: Program,
  sessionPda: PublicKey,
  sessionSigner: PublicKey,
  campaignLevel: number
): Promise<Transaction> {
  const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
  const [mapConfigPda] = deriveMapConfigPda();
  const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);

  const method = pickMethod(mapGeneratorProgram, 'fillMapForCampaign', 'fillMapForCampaign');
  const ix = await method(campaignLevel)
    .accountsPartial({
      sessionSigner,
      session: sessionPda,
      mapConfig: mapConfigPda,
      generatedMap: generatedMapPda,
      sessionDiscovery: sessionDiscoveryPda,
    })
    .instruction();

  return new Transaction().add(ix);
}

/**
 * Build a transaction that calls `fill_map_with_seed` on the ER.
 * Generates the full maze using a deterministic seed (PvE campaign sessions).
 */
export async function buildFillMapWithSeedTransaction(
  mapGeneratorProgram: Program,
  sessionPda: PublicKey,
  sessionSigner: PublicKey,
  seed: bigint,
  campaignLevel: number
): Promise<Transaction> {
  const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
  const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);

  const method = pickMethod(mapGeneratorProgram, 'fillMapWithSeed', 'fillMapWithSeed');
  // Anchor BN for u64 seed
  const BN = (await import('bn.js')).default;
  const ix = await method(new BN(seed.toString()), campaignLevel)
    .accountsPartial({
      sessionSigner,
      session: sessionPda,
      generatedMap: generatedMapPda,
      sessionDiscovery: sessionDiscoveryPda,
    })
    .instruction();

  return new Transaction().add(ix);
}

/**
 * Build a `sync_map_enemies` instruction from gameplay-state.
 * Populates map_enemies from generated_map and updates game_state position/dims.
 * Must be called on ER immediately after map generation (fill_map_with_seed or generate_map_with_vrf).
 */
export async function buildSyncMapEnemiesInstruction(
  gameplayStateProgram: Program,
  sessionPda: PublicKey,
  sessionSigner: PublicKey,
  options?: { gauntletEchoesPda?: PublicKey; gameplayVrfStatePda?: PublicKey }
): Promise<TransactionInstruction> {
  const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
  const [gameStatePda] = deriveGameStatePda(sessionPda);
  const [mapPoisPda] = deriveMapPoisPda(sessionPda);
  const [gameplayAuthorityPda] = deriveGameplayAuthorityPda();
  const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);

  const method = pickMethod(gameplayStateProgram, 'syncMapEnemies', 'syncMapEnemies');
  return method()
    .accountsPartial({
      sessionSigner,
      session: sessionPda,
      generatedMap: generatedMapPda,
      gameState: gameStatePda,
      mapPois: mapPoisPda,
      poiSystemProgram: SOLANA_CONFIG.programs.poiSystem,
      gameplayAuthority: gameplayAuthorityPda,
      mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
      sessionDiscovery: sessionDiscoveryPda,
      gameplayVrfState: options?.gameplayVrfStatePda ?? null,
      gauntletEchoes: options?.gauntletEchoesPda ?? null,
    } as any)
    .instruction();
}

/**
 * Build a `discover_visible_waypoints` instruction to discover POIs near spawn.
 * Called after refresh_map_pois to discover POIs that were populated after sync_map_enemies.
 */
export async function buildDiscoverSpawnPoisInstruction(
  poiSystemProgram: Program,
  sessionPda: PublicKey,
  sessionSigner: PublicKey,
  visibilityRadius: number
): Promise<TransactionInstruction> {
  const [gameStatePda] = deriveGameStatePda(sessionPda);
  const [mapPoisPda] = deriveMapPoisPda(sessionPda);
  const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);

  const method = pickMethod(
    poiSystemProgram,
    'discoverVisibleWaypoints',
    'discoverVisibleWaypoints'
  );
  return method(visibilityRadius)
    .accountsPartial({
      mapPois: mapPoisPda,
      gameState: gameStatePda,
      player: sessionSigner,
      sessionDiscovery: sessionDiscoveryPda,
      session: sessionPda,
      mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
    } as any)
    .instruction();
}

/**
 * Build a `reveal_radius` instruction on map_generator.
 * Used after phase changes (rest alcove) to reveal tiles at the new visibility radius.
 */
export async function buildRevealRadiusInstruction(
  mapGeneratorProgram: Program,
  sessionPda: PublicKey,
  sessionSigner: PublicKey,
  centerX: number,
  centerY: number,
  radius: number
): Promise<TransactionInstruction> {
  const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
  const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);

  const method = pickMethod(mapGeneratorProgram, 'revealRadius', 'revealRadius');
  return method(centerX, centerY, radius)
    .accountsPartial({
      sessionSigner,
      session: sessionPda,
      generatedMap: generatedMapPda,
      sessionDiscovery: sessionDiscoveryPda,
    } as any)
    .instruction();
}

/**
 * Build a `refresh_discovered_enemies` instruction.
 * Syncs enemies from MapEnemies to SessionDiscovery based on discovered tiles.
 * Called after tile-revealing POIs (survey beacon, seismic scanner).
 */
export async function buildRefreshDiscoveredEnemiesInstruction(
  gameplayStateProgram: Program,
  sessionPda: PublicKey,
  sessionSigner: PublicKey
): Promise<TransactionInstruction> {
  const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
  const [gameStatePda] = deriveGameStatePda(sessionPda);
  const [mapPoisPda] = deriveMapPoisPda(sessionPda);
  const [gameplayAuthorityPda] = deriveGameplayAuthorityPda();
  const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);

  const method = pickMethod(
    gameplayStateProgram,
    'refreshDiscoveredEnemies',
    'refreshDiscoveredEnemies'
  );
  return method()
    .accountsPartial({
      sessionSigner,
      session: sessionPda,
      generatedMap: generatedMapPda,
      gameplayAuthority: gameplayAuthorityPda,
      mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
      sessionDiscovery: sessionDiscoveryPda,
    } as any)
    .instruction();
}

/**
 * Build two transactions: map generation and enemy sync (separate due to CU limits).
 * - mode 'vrf': uses generate_map_with_vrf (Gauntlet/Duel on ER)
 * - mode 'campaign': uses fill_map_for_campaign (PvE campaign on ER)
 * - mode 'seed': uses fill_map_with_seed (legacy/local deterministic path)
 *
 * Returns { mapTx, syncTx } — callers must send them sequentially.
 */
export async function buildMapAndSyncTransaction(
  mode: 'vrf' | 'campaign' | 'seed',
  mapGeneratorProgram: Program,
  gameplayStateProgram: Program,
  sessionPda: PublicKey,
  sessionSigner: PublicKey,
  opts: { campaignLevel: number; seed?: bigint; gauntletEchoesPda?: PublicKey; gameplayVrfStatePda?: PublicKey }
): Promise<{ mapTx: Transaction; syncTx: Transaction }> {
  const mapTx = new Transaction();

  if (mode === 'vrf') {
    const tx = await buildFillMapWithVrfTransaction(
      mapGeneratorProgram,
      sessionPda,
      sessionSigner,
      opts.campaignLevel
    );
    mapTx.add(...tx.instructions);
  } else if (mode === 'campaign') {
    const tx = await buildFillMapForCampaignTransaction(
      mapGeneratorProgram,
      sessionPda,
      sessionSigner,
      opts.campaignLevel
    );
    mapTx.add(...tx.instructions);
  } else {
    const seed = opts.seed ?? BigInt(opts.campaignLevel);
    const tx = await buildFillMapWithSeedTransaction(
      mapGeneratorProgram,
      sessionPda,
      sessionSigner,
      seed,
      opts.campaignLevel
    );
    mapTx.add(...tx.instructions);
  }

  const syncIx = await buildSyncMapEnemiesInstruction(gameplayStateProgram, sessionPda, sessionSigner, {
    gauntletEchoesPda: opts.gauntletEchoesPda,
    gameplayVrfStatePda: opts.gameplayVrfStatePda,
  });
  const syncTx = new Transaction().add(syncIx);

  return { mapTx, syncTx };
}

/**
 * @deprecated Use buildFillMapWithVrfTransaction instead.
 * Kept for backward compatibility during transition.
 */
export async function buildRegenerateMapTransaction(
  mapGeneratorProgram: Program,
  sessionPda: PublicKey,
  sessionSigner: PublicKey,
  campaignLevel: number
): Promise<Transaction> {
  return buildFillMapWithVrfTransaction(mapGeneratorProgram, sessionPda, sessionSigner, campaignLevel);
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
  _sessionSigner: PublicKey
): Promise<Transaction> {
  const [poiVrfStatePda] = derivePoiVrfStatePda(sessionPda);
  const [gameplayVrfStatePda] = deriveGameplayVrfStatePda(sessionPda);

  const requestPoi = pickMethod(programs.poiSystem, 'requestPoiVrf', 'requestPoiVrf', {
    strictPreferred: true,
  });
  const requestPoiVrfIx = await requestPoi()
    .accounts(vrfRequestAccounts(programs.poiSystem.programId, payer, sessionPda, poiVrfStatePda))
    .instruction();

  const requestGameplay = pickMethod(
    programs.gameplayState,
    'requestGameplayVrf',
    'requestGameplayVrf',
    { strictPreferred: true }
  );
  const requestGameplayVrfIx = await requestGameplay()
    .accounts(
      vrfRequestAccounts(
        programs.gameplayState.programId,
        payer,
        sessionPda,
        gameplayVrfStatePda
      )
    )
    .instruction();

  return new Transaction().add(requestPoiVrfIx, requestGameplayVrfIx);
}

// ============================================================================
// POI-Only VRF Request + Fulfill (Campaign)
// ============================================================================

/**
 * Build a transaction that sends a RAW VRF request directly to the VRF program
 * on the Ephemeral Rollup, bypassing poi-system's requestPoiVrf CPI.
 *
 * Why this is needed:
 *   poi-system's requestPoiVrf CPI marks PoiVrfState as writable in the request
 *   transaction. The ER's post-execution validation rejects any write to a
 *   delegated account that was not written by an oracle callback — even if the
 *   delegation record exists. The raw approach puts PoiVrfState only in the
 *   callback_accounts_metas serialized data; it is NOT a writable key in the
 *   request tx. The oracle calls fulfill_poi_vrf as an ER-side callback and
 *   handles delegation transparently.
 *
 * Requires:
 *   - PoiVrfState must already be initialized (init_poi_vrf_state on base)
 *   - PoiVrfState must be delegated to ER
 *   - Must be sent to the Ephemeral Rollup (directErConnection)
 */
export function buildRawPoiVrfRequestTransaction(
  sessionPda: PublicKey,
  payer: PublicKey,
  poiSystemProgramId: PublicKey,
): Transaction {
  const [poiVrfStatePda] = derivePoiVrfStatePda(sessionPda);
  const ix = buildRawVrfRequestInstruction({
    payer,
    callbackProgramId: poiSystemProgramId,
    callbackDiscriminator: FULFILL_POI_VRF_DISCRIMINATOR,
    vrfStatePda: poiVrfStatePda,
    sessionPda,
  });
  return new Transaction().add(ix);
}

/**
 * Build a raw VRF request for map generation on the ER.
 * Same approach as buildRawPoiVrfRequestTransaction — bypasses CPI to avoid
 * ER post-execution validation rejecting non-delegated account writes.
 *
 * Requires:
 *   - MapVrfState must already be initialized (init_map_vrf_state on base)
 *   - MapVrfState must be delegated to ER
 */
export function buildRawMapVrfRequestTransaction(
  sessionPda: PublicKey,
  payer: PublicKey,
  mapGeneratorProgramId: PublicKey,
): Transaction {
  const [mapVrfStatePda] = deriveMapVrfStatePda(sessionPda);
  const ix = buildRawVrfRequestInstruction({
    payer,
    callbackProgramId: mapGeneratorProgramId,
    callbackDiscriminator: FULFILL_MAP_VRF_DISCRIMINATOR,
    vrfStatePda: mapVrfStatePda,
    sessionPda,
  });
  return new Transaction().add(ix);
}

/**
 * Build a raw VRF request for gameplay on the ER.
 * Same approach as buildRawPoiVrfRequestTransaction — bypasses CPI to avoid
 * ER post-execution validation rejecting non-delegated account writes.
 *
 * Requires:
 *   - GameplayVrfState must already be initialized (init_gameplay_vrf_state on base)
 *   - GameplayVrfState must be delegated to ER
 */
export function buildRawGameplayVrfRequestTransaction(
  sessionPda: PublicKey,
  payer: PublicKey,
  gameplayStateProgramId: PublicKey,
): Transaction {
  const [gameplayVrfStatePda] = deriveGameplayVrfStatePda(sessionPda);
  const ix = buildRawVrfRequestInstruction({
    payer,
    callbackProgramId: gameplayStateProgramId,
    callbackDiscriminator: FULFILL_GAMEPLAY_VRF_DISCRIMINATOR,
    vrfStatePda: gameplayVrfStatePda,
    sessionPda,
  });
  return new Transaction().add(ix);
}

/**
 * Build a transaction that requests and fulfills POI VRF only.
 * Used for campaign sessions where the map seed is deterministic
 * but POI offers need VRF for fairness.
 *
 * Must be sent to the Ephemeral Rollup after delegation.
 * request_poi_vrf now inits the VrfState account inline (matching map/gameplay pattern).
 * Send on ER and wait for oracle fulfillment.
 */
export async function buildRequestAndFulfillPoiVrfTransaction(
  poiSystemProgram: Program,
  sessionPda: PublicKey,
  payer: PublicKey,
  _sessionSigner: PublicKey
): Promise<Transaction> {
  const [poiVrfStatePda] = derivePoiVrfStatePda(sessionPda);
  const requestPoi = pickMethod(poiSystemProgram, 'requestPoiVrf', 'requestPoiVrf', {
    strictPreferred: true,
  });
  const requestIx = await requestPoi()
    .accounts(vrfRequestAccounts(poiSystemProgram.programId, payer, sessionPda, poiVrfStatePda))
    .instruction();
  return new Transaction().add(requestIx);
}

/**
 * Build a transaction that requests gameplay VRF only (no poi VRF).
 * Used on the ER after delegation when poi VRF was already handled on base.
 */
export async function buildRequestGameplayVrfTransaction(
  gameplayStateProgram: Program,
  sessionPda: PublicKey,
  payer: PublicKey,
  _sessionSigner: PublicKey
): Promise<Transaction> {
  const [gameplayVrfStatePda] = deriveGameplayVrfStatePda(sessionPda);
  const requestGameplay = pickMethod(
    gameplayStateProgram,
    'requestGameplayVrf',
    'requestGameplayVrf',
    { strictPreferred: true }
  );
  const requestGameplayVrfIx = await requestGameplay()
    .accounts(
      vrfRequestAccounts(
        gameplayStateProgram.programId,
        payer,
        sessionPda,
        gameplayVrfStatePda
      )
    )
    .instruction();
  return new Transaction().add(requestGameplayVrfIx);
}

/**
 * Pre-creates PoiVrfState on base chain before delegation to ER.
 * Must be called on the base layer so the account exists for delegation.
 * After delegation, use buildRawPoiVrfRequestTransaction on ER.
 */
export async function buildInitPoiVrfStateTransaction(
  poiSystemProgram: Program,
  sessionPda: PublicKey,
  payer: PublicKey
): Promise<Transaction> {
  const [poiVrfStatePda] = derivePoiVrfStatePda(sessionPda);
  const method = pickMethod(poiSystemProgram, 'initPoiVrfState', 'initPoiVrfState');
  const ix = await method()
    .accounts({
      payer,
      session: sessionPda,
      vrfState: poiVrfStatePda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return new Transaction().add(ix);
}

/**
 * Pre-creates MapVrfState on base chain before delegation to ER.
 * Must be called on the base layer so the account exists for delegation.
 * After delegation, use buildRawMapVrfRequestTransaction on ER.
 */
export async function buildInitMapVrfStateTransaction(
  mapGeneratorProgram: Program,
  sessionPda: PublicKey,
  payer: PublicKey
): Promise<Transaction> {
  const [mapVrfStatePda] = deriveMapVrfStatePda(sessionPda);
  const method = pickMethod(mapGeneratorProgram, 'initMapVrfState', 'initMapVrfState');
  const ix = await method()
    .accounts({
      payer,
      session: sessionPda,
      vrfState: mapVrfStatePda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return new Transaction().add(ix);
}

/**
 * Pre-creates GameplayVrfState on base chain before delegation to ER.
 * Must be called on the base layer so the account exists for delegation.
 * After delegation, use buildRawGameplayVrfRequestTransaction on ER.
 */
export async function buildInitGameplayVrfStateTransaction(
  gameplayStateProgram: Program,
  sessionPda: PublicKey,
  payer: PublicKey
): Promise<Transaction> {
  const [gameplayVrfStatePda] = deriveGameplayVrfStatePda(sessionPda);
  const method = pickMethod(gameplayStateProgram, 'initGameplayVrfState', 'initGameplayVrfState');
  const ix = await method()
    .accounts({
      payer,
      session: sessionPda,
      vrfState: gameplayVrfStatePda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return new Transaction().add(ix);
}

/**
 * Pre-creates GameplayVrfState for pit draft on base chain.
 * Uses playerA pubkey as the seed key (no session-manager ownership required).
 */
export async function buildInitPitDraftVrfStateTransaction(
  gameplayStateProgram: Program,
  seedKey: PublicKey,
  payer: PublicKey
): Promise<Transaction> {
  const [vrfStatePda] = derivePitDraftVrfStatePda(seedKey);
  const method = pickMethod(gameplayStateProgram, 'initPitDraftVrfState', 'initPitDraftVrfState');
  const ix = await method()
    .accounts({
      payer,
      seedKey,
      vrfState: vrfStatePda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return new Transaction().add(ix);
}

// ============================================================================
// VRF State Polling (for future oracle integration)
// ============================================================================

/**
 * Wait for a VRF state account to reach fulfilled status.
 *
 * Runs a WebSocket subscription and a polling loop in parallel — whichever
 * detects fulfillment first wins. This avoids the old sequential bug where
 * the WebSocket consumed the full timeout budget, leaving the polling fallback
 * with zero time remaining (and thus never running a single iteration).
 *
 * On Ephemeral Rollup endpoints the WebSocket may never fire for oracle writes,
 * so the polling loop is the reliable path; the WebSocket is a fast-path bonus.
 */
export async function waitForVrfFulfillment(
  connection: Connection,
  vrfStatePda: PublicKey,
  timeoutMs = 30_000
): Promise<boolean> {
  const VRF_STATUS_OFFSET = 8 + 32 + 32 + 8; // discriminator + session + randomness + nonce
  const VRF_STATUS_FULFILLED = 1;
  const POLL_INTERVAL_MS = 500;
  const startTime = Date.now();

  const isFulfilled = (data?: Buffer | Uint8Array | null): boolean => {
    if (!data || data.length <= VRF_STATUS_OFFSET) return false;
    return data[VRF_STATUS_OFFSET] >= VRF_STATUS_FULFILLED;
  };

  // Fast path: already fulfilled before we start.
  const initialInfo = await connection.getAccountInfo(vrfStatePda);
  if (isFulfilled(initialInfo?.data)) {
    return true;
  }

  const remainingMs = Math.max(0, timeoutMs - (Date.now() - startTime));
  if (remainingMs === 0) return false;

  // Shared resolve — first of the two racers to call this wins.
  let resolveRace!: (value: boolean) => void;
  const racePromise = new Promise<boolean>((resolve) => {
    resolveRace = resolve;
  });

  // ── Racer 1: WebSocket subscription ──────────────────────────────────────
  let subId: number | null = null;
  const cleanupSub = () => {
    if (subId !== null) {
      void connection.removeAccountChangeListener(subId).catch(() => {});
      subId = null;
    }
  };
  try {
    subId = connection.onAccountChange(
      vrfStatePda,
      (accountInfo) => {
        if (isFulfilled(accountInfo?.data)) {
          cleanupSub();
          resolveRace(true);
        }
      },
      SOLANA_CONFIG.commitment
    );
  } catch {
    // WebSocket setup failed — polling will cover it.
  }

  // ── Racer 2: polling loop ─────────────────────────────────────────────────
  const pollRacer = (async () => {
    while (Date.now() - startTime < timeoutMs) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      try {
        const info = await connection.getAccountInfo(vrfStatePda);
        if (isFulfilled(info?.data)) {
          resolveRace(true);
          return;
        }
      } catch {
        // transient RPC error — keep polling
      }
    }
    resolveRace(false); // timeout
  })();

  // ── Timeout safety net ────────────────────────────────────────────────────
  const timeoutHandle = setTimeout(() => resolveRace(false), remainingMs);

  const result = await racePromise;

  // Cleanup whatever is still running.
  clearTimeout(timeoutHandle);
  cleanupSub();
  await pollRacer.catch(() => {}); // let the poll loop exit naturally

  return result;
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
