/**
 * Gameplay State Program Client
 *
 * TypeScript client interface for interacting with the gameplay-state Solana program.
 * Uses sessionSigner wallet for signing all gameplay transactions.
 */

import {
  Keypair,
  PublicKey,
  SystemProgram,
  Connection,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import * as Sentry from '@sentry/react-native';
import { SOLANA_CONFIG } from './config';
import {
  sendSessionSignerTransaction,
  confirmErTransaction,
  getCachedErBlockhash,
  getMagicRouterBlockhashForAccounts,
  invalidateCachedErBlockhash,
  invalidateCachedRouterBlockhash,
  buildMessageTemplate,
  signTemplatedTransaction,
  fireAndForgetRawTx,
  type MessageTemplate,
} from './sessionSigner';
import { Platform } from 'react-native';
import {
  deriveInventoryPda,
  deriveGeneratedMapPda,
  deriveGameplayAuthorityPda,
  deriveMapPoisPda,
  deriveGameplayVrfStatePda,
  deriveSessionDiscoveryPda,
  deriveGauntletEchoesPda,
  GAMEPLAY_STATE_PROGRAM_ID,
} from './constants';

import {
  GameState,
  Phase,
  RunMode,
  StatType,
  GameStateInitParams,
  MovePlayerParams,
  ModifyStatParams,
  deriveGameStatePda,
} from './types/gameplay_state';

// Cache for gameplayVrfState existence per session — avoids a round trip on every move.
// Caches both positive (exists) and negative (doesn't exist) results.
const vrfStateExistsCache = new Map<string, boolean>();

// Cache for sessionDiscovery existence per session — avoids a round trip on every move.
const discoveryExistsCache = new Map<string, boolean>();

// Cache for gauntletEchoes existence per session — avoids a round trip on every move.
const gauntletEchoesExistsCache = new Map<string, boolean>();

// Cache PDA derivations per session — findProgramAddressSync is expensive on React Native
// (~20-30ms per call due to SHA-256 loops in Hermes JS engine).
const pdaCache = new Map<
  string,
  {
    generatedMap: PublicKey;
    inventory: PublicKey;
    gameplayAuthority: PublicKey;
    mapPois: PublicKey;
    gameplayVrfState: PublicKey;
    sessionDiscovery: PublicKey;
    gauntletEchoes: PublicKey;
  }
>();

// Pre-computed Anchor discriminator for move_player: sha256("global:move_player")[0..8]
// Avoids going through Anchor's MethodsBuilder which adds ~120ms of async overhead.
const MOVE_PLAYER_DISCRIMINATOR = Buffer.from([17, 58, 68, 221, 186, 117, 140, 231]);

// Pre-compiled message template per session — eliminates ~130ms message compilation on Hermes.
// The move transaction has the same accounts every call; only blockhash, targetX/Y, and CU price change.
const moveTemplateCache = new Map<string, MessageTemplate>();
// Cached Ed25519 seed (first 32 bytes of secretKey) to avoid .slice() allocation per move.
const seedCache = new Map<string, Uint8Array>();
const isMagicRouterRpc = (connection: Connection): boolean =>
  connection.rpcEndpoint.replace(/\/+$/, '').includes('router.magicblock.app');

const getMoveRoutedAccounts = (
  sessionPda: PublicKey,
  gameStatePda: PublicKey,
  generatedMapPda: PublicKey,
  inventoryPda: PublicKey,
  mapPoisPda: PublicKey,
  sessionDiscoveryPda: PublicKey,
  gauntletEchoesPda: PublicKey,
  discoveryExists: boolean,
  gauntletEchoesExists: boolean
): string[] => [
  sessionPda.toBase58(),
  gameStatePda.toBase58(),
  generatedMapPda.toBase58(),
  inventoryPda.toBase58(),
  mapPoisPda.toBase58(),
  ...(discoveryExists ? [sessionDiscoveryPda.toBase58()] : []),
  ...(gauntletEchoesExists ? [gauntletEchoesPda.toBase58()] : []),
];

/** Patch specs for locating mutable fields in the serialized move_player message. */
const MOVE_PATCH_SPECS = [
  {
    name: 'moveTarget',
    dataLength: 10, // 8-byte discriminator + targetX + targetY
    discriminator: Array.from(MOVE_PLAYER_DISCRIMINATOR),
    patchOffset: 8, // skip discriminator
    patchLength: 2, // targetX + targetY
  },
  {
    name: 'cuPrice',
    dataLength: 9, // 1-byte discriminator (3) + 8-byte u64 microLamports
    discriminator: [3],
    patchOffset: 1, // skip discriminator
    patchLength: 8, // microLamports (u64 LE)
  },
];

/**
 * Eagerly build the move message template in the background so the first
 * movePlayer() call on native doesn't pay the ~130-270ms Hermes compilation cost.
 * Must be called AFTER warmMovePlayerCaches has populated the existence caches.
 * Fire-and-forget — errors are silently ignored; first move will build if needed.
 */
export async function eagerBuildMoveTemplate(
  connection: Connection,
  gameStatePda: PublicKey,
  sessionPda: PublicKey,
  sessionSignerKeypair: Keypair
): Promise<void> {
  if (Platform.OS === 'web') return; // web doesn't use templates
  const sessionKey = sessionPda.toBase58();
  if (moveTemplateCache.has(sessionKey)) return; // already built

  // Need existence caches to be populated first
  if (
    !vrfStateExistsCache.has(sessionKey) ||
    !discoveryExistsCache.has(sessionKey) ||
    !gauntletEchoesExistsCache.has(sessionKey)
  ) {
    return; // caches not ready yet — first move will build
  }

  // Ensure PDA cache is populated
  if (!pdaCache.has(sessionKey)) {
    pdaCache.set(sessionKey, {
      generatedMap: deriveGeneratedMapPda(sessionPda)[0],
      inventory: deriveInventoryPda(sessionPda)[0],
      gameplayAuthority: deriveGameplayAuthorityPda()[0],
      mapPois: deriveMapPoisPda(sessionPda)[0],
      gameplayVrfState: deriveGameplayVrfStatePda(sessionPda)[0],
      sessionDiscovery: deriveSessionDiscoveryPda(sessionPda)[0],
      gauntletEchoes: deriveGauntletEchoesPda(sessionPda)[0],
    });
  }
  const pdas = pdaCache.get(sessionKey)!;

  const vrfStateExists = vrfStateExistsCache.get(sessionKey)!;
  const discoveryExists = discoveryExistsCache.get(sessionKey)!;
  const gauntletEchoesExists = gauntletEchoesExistsCache.get(sessionKey)!;

  try {
    const { blockhash } = isMagicRouterRpc(connection)
      ? await getMagicRouterBlockhashForAccounts(
          connection,
          getMoveRoutedAccounts(
            sessionPda,
            gameStatePda,
            pdas.generatedMap,
            pdas.inventory,
            pdas.mapPois,
            pdas.sessionDiscovery,
            pdas.gauntletEchoes,
            discoveryExists,
            gauntletEchoesExists
          )
        )
      : await getCachedErBlockhash(connection, 'processed');

    const data = Buffer.alloc(10);
    data.set(MOVE_PLAYER_DISCRIMINATOR, 0);
    data.writeUInt8(0, 8); // placeholder targetX
    data.writeUInt8(0, 9); // placeholder targetY

    const keys = [
      { pubkey: gameStatePda, isSigner: false, isWritable: true },
      { pubkey: sessionPda, isSigner: false, isWritable: false },
      { pubkey: pdas.generatedMap, isSigner: false, isWritable: true },
      { pubkey: pdas.inventory, isSigner: false, isWritable: true },
      { pubkey: pdas.gameplayAuthority, isSigner: false, isWritable: false },
      { pubkey: SOLANA_CONFIG.programs.playerInventory, isSigner: false, isWritable: false },
      { pubkey: SOLANA_CONFIG.programs.mapGenerator, isSigner: false, isWritable: false },
      { pubkey: pdas.mapPois, isSigner: false, isWritable: true },
      { pubkey: SOLANA_CONFIG.programs.poiSystem, isSigner: false, isWritable: false },
      {
        pubkey: discoveryExists ? pdas.sessionDiscovery : SOLANA_CONFIG.programs.gameplayState,
        isSigner: false,
        isWritable: discoveryExists,
      },
      {
        pubkey: vrfStateExists ? pdas.gameplayVrfState : SOLANA_CONFIG.programs.gameplayState,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: gauntletEchoesExists ? pdas.gauntletEchoes : SOLANA_CONFIG.programs.gameplayState,
        isSigner: false,
        isWritable: gauntletEchoesExists,
      },
      { pubkey: sessionSignerKeypair.publicKey, isSigner: true, isWritable: false },
    ];

    const tx = new Transaction();
    tx.feePayer = sessionSignerKeypair.publicKey;
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }));
    tx.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: Math.floor(Math.random() * 1000) + 1,
      })
    );
    tx.add(
      new TransactionInstruction({
        keys,
        programId: SOLANA_CONFIG.programs.gameplayState,
        data,
      })
    );
    tx.recentBlockhash = blockhash;

    const template = buildMessageTemplate(tx, MOVE_PATCH_SPECS);
    moveTemplateCache.set(sessionKey, template);

    // Also cache the seed
    if (!seedCache.has(sessionKey)) {
      seedCache.set(sessionKey, sessionSignerKeypair.secretKey.slice(0, 32));
    }

    console.log('[perf] eagerBuildMoveTemplate: DONE');
  } catch (err) {
    console.warn('[perf] eagerBuildMoveTemplate failed (first move will build):', err);
  }
}

/**
 * Pre-warm the optional-account existence caches for a session so the first
 * movePlayer call doesn't pay 3 sequential RPC round trips (~450ms).
 * Fire-and-forget — RPC errors leave the cache unset so the next call retries.
 */
export function warmMovePlayerCaches(
  connection: Connection,
  program: Program,
  sessionPda: PublicKey
): Promise<void> {
  const sessionKey = sessionPda.toBase58();
  if (
    vrfStateExistsCache.has(sessionKey) &&
    discoveryExistsCache.has(sessionKey) &&
    gauntletEchoesExistsCache.has(sessionKey)
  ) {
    return Promise.resolve(); // already warm
  }
  const [gameplayVrfStatePda] = deriveGameplayVrfStatePda(sessionPda);
  const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);
  const [gauntletEchoesPda] = deriveGauntletEchoesPda(sessionPda);
  // Sentinel: a successful RPC read returns null for absent accounts.
  // A failed RPC throws — we must NOT cache false on error.
  const FETCH_ERROR = Symbol('fetch_error');
  return Promise.all([
    vrfStateExistsCache.has(sessionKey)
      ? null
      : (program.account as any)?.gameplayVrfState
          ?.fetchNullable(gameplayVrfStatePda)
          .catch(() => FETCH_ERROR)
          .then((r: unknown) => {
            if (r !== FETCH_ERROR) vrfStateExistsCache.set(sessionKey, !!r);
          }),
    discoveryExistsCache.has(sessionKey)
      ? null
      : connection
          .getAccountInfo(sessionDiscoveryPda)
          .catch(() => FETCH_ERROR)
          .then((r: unknown) => {
            if (r !== FETCH_ERROR) discoveryExistsCache.set(sessionKey, !!r);
          }),
    gauntletEchoesExistsCache.has(sessionKey)
      ? null
      : connection
          .getAccountInfo(gauntletEchoesPda)
          .catch(() => FETCH_ERROR)
          .then((info: unknown) => {
            if (info === FETCH_ERROR) return;
            const typedInfo = info as { owner?: { toBase58?: () => string } } | null;
            const isDelegated =
              typedInfo?.owner?.toBase58?.() === GAMEPLAY_STATE_PROGRAM_ID.toBase58();
            gauntletEchoesExistsCache.set(sessionKey, !!typedInfo && isDelegated);
          }),
  ])
    .then(() => {})
    .catch(() => {});
}

// ============================================================================
// PDA Derivation (T014)
// ============================================================================

/**
 * Gets the GameState PDA for a session.
 * Re-export from types for convenience.
 */
export function getGameStatePda(
  sessionPda: PublicKey,
  programId: PublicKey = SOLANA_CONFIG.programs.gameplayState
): [PublicKey, number] {
  return deriveGameStatePda(sessionPda, programId);
}

// ============================================================================
// Gameplay State Functions (T016-T019)
// ============================================================================

/**
 * Initializes a new GameState account linked to an active GameSession.
 * Called once at session start.
 *
 * @param program - Anchor program instance
 * @param sessionPda - Active GameSession PDA
 * @param sessionSignerKeypair - SessionSigner wallet keypair (signer)
 * @param params - Initialization parameters (mapWidth, mapHeight, startX, startY)
 * @returns Transaction signature and GameState PDA
 */
export async function initializeGameState(
  connection: Connection,
  program: Program,
  sessionPda: PublicKey,
  sessionSignerKeypair: Keypair,
  params: GameStateInitParams
): Promise<{ signature: string; gameStatePda: PublicKey }> {
  const [gameStatePda] = getGameStatePda(sessionPda);

  const transaction = await (
    program.methods as unknown as {
      initializeGameState: (
        mapWidth: number,
        mapHeight: number,
        startX: number,
        startY: number
      ) => {
        accounts: (accounts: {
          gameState: PublicKey;
          gameSession: PublicKey;
          player: PublicKey;
          systemProgram: PublicKey;
        }) => {
          transaction: () => Promise<
            ReturnType<(typeof import('@solana/web3.js').Transaction)['prototype']['add']>
          >;
        };
      };
    }
  )
    .initializeGameState(params.mapWidth, params.mapHeight, params.startX, params.startY)
    .accounts({
      gameState: gameStatePda,
      gameSession: sessionPda,
      player: sessionSignerKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  const signature = await sendSessionSignerTransaction(
    connection,
    transaction,
    sessionSignerKeypair
  );

  return { signature, gameStatePda };
}

/**
 * Moves the player to an adjacent tile, deducting move cost.
 * The on-chain program reads the map directly, so isWall is no longer needed.
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance
 * @param gameStatePda - GameState PDA
 * @param sessionPda - GameSession PDA
 * @param sessionSignerKeypair - SessionSigner wallet keypair (signer)
 * @param params - Move parameters (targetX, targetY)
 * @returns Signature and connection for deferred confirmation
 */
export async function movePlayer(
  connection: Connection,
  program: Program,
  gameStatePda: PublicKey,
  sessionPda: PublicKey,
  sessionSignerKeypair: Keypair,
  params: MovePlayerParams,
  options?: { onSendFail?: (err: Error) => void }
): Promise<{ signature: string; connection: Connection }> {
  const sessionKey = sessionPda.toBase58();

  // Cache PDA derivations per session — findProgramAddressSync is expensive on RN
  // (~20-30ms per call due to SHA-256 loops in Hermes). 7 PDAs × ~25ms = ~175ms per move.
  if (!pdaCache.has(sessionKey)) {
    pdaCache.set(sessionKey, {
      generatedMap: deriveGeneratedMapPda(sessionPda)[0],
      inventory: deriveInventoryPda(sessionPda)[0],
      gameplayAuthority: deriveGameplayAuthorityPda()[0],
      mapPois: deriveMapPoisPda(sessionPda)[0],
      gameplayVrfState: deriveGameplayVrfStatePda(sessionPda)[0],
      sessionDiscovery: deriveSessionDiscoveryPda(sessionPda)[0],
      gauntletEchoes: deriveGauntletEchoesPda(sessionPda)[0],
    });
  }
  const pdas = pdaCache.get(sessionKey)!;
  const generatedMapPda = pdas.generatedMap;
  const inventoryPda = pdas.inventory;
  const gameplayAuthorityPda = pdas.gameplayAuthority;
  const mapPoisPda = pdas.mapPois;
  const gameplayVrfStatePda = pdas.gameplayVrfState;
  const sessionDiscoveryPda = pdas.sessionDiscovery;
  const gauntletEchoesPda = pdas.gauntletEchoes;

  const tCache = Date.now();
  const vrfCached = vrfStateExistsCache.has(sessionKey);
  const discoveryCached = discoveryExistsCache.has(sessionKey);
  const gauntletCached = gauntletEchoesExistsCache.has(sessionKey);

  if (!vrfCached || !discoveryCached || !gauntletCached) {
    console.log(
      `[perf]   cache MISS: vrf=${vrfCached} disc=${discoveryCached} gauntlet=${gauntletCached}`
    );
    // Sentinel: distinguish "account absent" (null) from "RPC failed" so we
    // don't permanently cache false on a transient network error.
    const FETCH_ERROR = Symbol('fetch_error');
    const [vrfResult, discoveryResult, gauntletResult] = await Promise.all([
      vrfCached
        ? Promise.resolve(null)
        : (program.account as any)?.gameplayVrfState
            ?.fetchNullable(gameplayVrfStatePda)
            .catch(() => FETCH_ERROR),
      discoveryCached
        ? Promise.resolve(null)
        : connection.getAccountInfo(sessionDiscoveryPda).catch(() => FETCH_ERROR),
      gauntletCached
        ? Promise.resolve(null)
        : // Check if gauntlet_echoes exists AND is owned by gameplay_state (delegated).
          // The ER proxies base-chain reads, so a non-delegated account would return data
          // but cause InvalidWritableAccount when included as writable in an ER tx.
          connection
            .getAccountInfo(gauntletEchoesPda)
            .catch(() => FETCH_ERROR)
            .then((info: unknown) => {
              if (info === FETCH_ERROR) return FETCH_ERROR;
              const typedInfo = info as { owner?: { toBase58?: () => string } } | null;
              return typedInfo?.owner?.toBase58?.() === GAMEPLAY_STATE_PROGRAM_ID.toBase58()
                ? typedInfo
                : null;
            }),
    ]);
    if (!vrfCached && vrfResult !== FETCH_ERROR) vrfStateExistsCache.set(sessionKey, !!vrfResult);
    if (!discoveryCached && discoveryResult !== FETCH_ERROR)
      discoveryExistsCache.set(sessionKey, !!discoveryResult);
    if (!gauntletCached && gauntletResult !== FETCH_ERROR)
      gauntletEchoesExistsCache.set(sessionKey, !!gauntletResult);
  }

  const vrfStateExists = vrfStateExistsCache.get(sessionKey)!;
  const discoveryExists = discoveryExistsCache.get(sessionKey)!;
  const gauntletEchoesExists = gauntletEchoesExistsCache.get(sessionKey)!;

  console.log(`[perf]   cacheCheck: ${Date.now() - tCache}ms`);

  // On React Native, use pre-compiled message template to avoid ~130ms compilation
  // on every move. First call compiles and caches; subsequent calls clone-and-patch.
  const isNative = Platform.OS !== 'web';

  if (isNative) {
    // --- Fast path: template-based fire-and-forget (React Native) ---
    const tTemplate = Date.now();

    // Get cached blockhash (pre-decoded bytes avoid bs58.decode per move)
    const { blockhash, blockhashBytes } = isMagicRouterRpc(connection)
      ? await getMagicRouterBlockhashForAccounts(
          connection,
          getMoveRoutedAccounts(
            sessionPda,
            gameStatePda,
            generatedMapPda,
            inventoryPda,
            mapPoisPda,
            sessionDiscoveryPda,
            gauntletEchoesPda,
            discoveryExists,
            gauntletEchoesExists
          )
        )
      : await getCachedErBlockhash(connection, 'processed');

    let template = moveTemplateCache.get(sessionKey);
    if (!template) {
      // First call: build full transaction and compile template (~130ms, once per session)
      const data = Buffer.alloc(10);
      data.set(MOVE_PLAYER_DISCRIMINATOR, 0);
      data.writeUInt8(params.targetX, 8);
      data.writeUInt8(params.targetY, 9);

      const keys = [
        { pubkey: gameStatePda, isSigner: false, isWritable: true },
        { pubkey: sessionPda, isSigner: false, isWritable: false },
        { pubkey: generatedMapPda, isSigner: false, isWritable: true },
        { pubkey: inventoryPda, isSigner: false, isWritable: true },
        { pubkey: gameplayAuthorityPda, isSigner: false, isWritable: false },
        { pubkey: SOLANA_CONFIG.programs.playerInventory, isSigner: false, isWritable: false },
        { pubkey: SOLANA_CONFIG.programs.mapGenerator, isSigner: false, isWritable: false },
        { pubkey: mapPoisPda, isSigner: false, isWritable: true },
        { pubkey: SOLANA_CONFIG.programs.poiSystem, isSigner: false, isWritable: false },
        {
          pubkey: discoveryExists ? sessionDiscoveryPda : SOLANA_CONFIG.programs.gameplayState,
          isSigner: false,
          isWritable: discoveryExists,
        },
        {
          pubkey: vrfStateExists ? gameplayVrfStatePda : SOLANA_CONFIG.programs.gameplayState,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: gauntletEchoesExists ? gauntletEchoesPda : SOLANA_CONFIG.programs.gameplayState,
          isSigner: false,
          isWritable: gauntletEchoesExists,
        },
        { pubkey: sessionSignerKeypair.publicKey, isSigner: true, isWritable: false },
      ];

      const tx = new Transaction();
      tx.feePayer = sessionSignerKeypair.publicKey;
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }));
      tx.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: Math.floor(Math.random() * 1000) + 1,
        })
      );
      tx.add(
        new TransactionInstruction({
          keys,
          programId: SOLANA_CONFIG.programs.gameplayState,
          data,
        })
      );
      tx.recentBlockhash = blockhash;

      template = buildMessageTemplate(tx, MOVE_PATCH_SPECS);
      moveTemplateCache.set(sessionKey, template);
      console.log(`[perf]   template: BUILT ${Date.now() - tTemplate}ms`);
    }

    const tSign = Date.now();

    // Patch variable fields: targetX/Y and CU price for uniqueness
    const moveTargetData = new Uint8Array([params.targetX, params.targetY]);
    const cuPriceData = new Uint8Array(8);
    new DataView(cuPriceData.buffer).setBigUint64(
      0,
      BigInt(Math.floor(Math.random() * 1000) + 1),
      true // little-endian
    );
    const patchData = new Map<string, Uint8Array>([
      ['moveTarget', moveTargetData],
      ['cuPrice', cuPriceData],
    ]);

    let seed = seedCache.get(sessionKey);
    if (!seed) {
      seed = sessionSignerKeypair.secretKey.slice(0, 32);
      seedCache.set(sessionKey, seed);
    }
    const { wireTransaction, signature } = signTemplatedTransaction(
      template,
      blockhashBytes,
      patchData,
      seed
    );
    const tDone = Date.now();

    // Fire-and-forget via direct fetch (bypasses Connection.sendRawTransaction
    // response parsing overhead on Hermes).
    const wireBase64 = Buffer.from(wireTransaction).toString('base64');
    fireAndForgetRawTx(connection.rpcEndpoint, wireBase64)
      .then(() => {
        console.log(`[perf] sendTransaction(bg): completed (router=${isMagicRouterRpc(connection)})`);
      })
      .catch((err) => {
        console.error('[movePlayer] Background send failed:', err);
        Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
          tags: {
            source: 'gameplayState.movePlayer.backgroundSend',
            flow: 'movement',
          },
          extra: {
            sessionPda: sessionPda.toBase58(),
            gameStatePda: gameStatePda.toBase58(),
            targetX: params.targetX,
            targetY: params.targetY,
            rpcEndpoint: connection.rpcEndpoint,
          },
        });
        const errMessage = (err instanceof Error ? err.message : String(err)).toLowerCase();
        if (errMessage.includes('blockhash not found')) {
          invalidateCachedErBlockhash(connection);
          invalidateCachedRouterBlockhash(connection);
        }
        options?.onSendFail?.(err instanceof Error ? err : new Error(String(err)));
      });
    console.log(
      `[perf] sendTransaction: 0ms (templated, sign: ${tDone - tSign}ms, sig=${signature.slice(0, 8)}...)`
    );
    return { signature, connection };
  }

  // --- Standard path (web): use Transaction.sign + sendSessionSignerTransaction ---
  const data = Buffer.alloc(10);
  data.set(MOVE_PLAYER_DISCRIMINATOR, 0);
  data.writeUInt8(params.targetX, 8);
  data.writeUInt8(params.targetY, 9);

  const keys = [
    { pubkey: gameStatePda, isSigner: false, isWritable: true },
    { pubkey: sessionPda, isSigner: false, isWritable: false },
    { pubkey: generatedMapPda, isSigner: false, isWritable: true },
    { pubkey: inventoryPda, isSigner: false, isWritable: true },
    { pubkey: gameplayAuthorityPda, isSigner: false, isWritable: false },
    { pubkey: SOLANA_CONFIG.programs.playerInventory, isSigner: false, isWritable: false },
    { pubkey: SOLANA_CONFIG.programs.mapGenerator, isSigner: false, isWritable: false },
    { pubkey: mapPoisPda, isSigner: false, isWritable: true },
    { pubkey: SOLANA_CONFIG.programs.poiSystem, isSigner: false, isWritable: false },
    {
      pubkey: discoveryExists ? sessionDiscoveryPda : SOLANA_CONFIG.programs.gameplayState,
      isSigner: false,
      isWritable: discoveryExists,
    },
    {
      pubkey: vrfStateExists ? gameplayVrfStatePda : SOLANA_CONFIG.programs.gameplayState,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: gauntletEchoesExists ? gauntletEchoesPda : SOLANA_CONFIG.programs.gameplayState,
      isSigner: false,
      isWritable: gauntletEchoesExists,
    },
    { pubkey: sessionSignerKeypair.publicKey, isSigner: true, isWritable: false },
  ];

  const transaction = new Transaction().add(
    new TransactionInstruction({
      keys,
      programId: SOLANA_CONFIG.programs.gameplayState,
      data,
    })
  );
  transaction.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }));

  const signature = await sendSessionSignerTransaction(
    connection,
    transaction,
    sessionSignerKeypair,
    {
      skipErConfirmation: true,
      fireAndForget: true,
      onSendFail: options?.onSendFail,
      routedAccounts: isMagicRouterRpc(connection) ? [sessionPda] : undefined,
    }
  );

  return { signature, connection };
}

/**
 * Modifies a player stat by a delta value.
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance
 * @param gameStatePda - GameState PDA
 * @param sessionSignerKeypair - SessionSigner wallet keypair (signer)
 * @param params - Modify stat parameters (stat, delta)
 * @returns Transaction signature
 */
export async function modifyStat(
  connection: Connection,
  program: Program,
  gameStatePda: PublicKey,
  sessionSignerKeypair: Keypair,
  params: ModifyStatParams
): Promise<string> {
  // Convert StatType enum to Anchor-compatible format
  const statTypeArg = getStatTypeArg(params.stat);

  const transaction = await (
    program.methods as unknown as {
      modifyStat: (
        stat: { [key: string]: Record<string, never> },
        delta: number
      ) => {
        accounts: (accounts: { gameState: PublicKey; player: PublicKey }) => {
          transaction: () => Promise<
            ReturnType<(typeof import('@solana/web3.js').Transaction)['prototype']['add']>
          >;
        };
      };
    }
  )
    .modifyStat(statTypeArg, params.delta)
    .accounts({
      gameState: gameStatePda,
      player: sessionSignerKeypair.publicKey,
    })
    .transaction();

  const isNative = Platform.OS !== 'web';
  return sendSessionSignerTransaction(connection, transaction, sessionSignerKeypair, {
    fireAndForget: isNative,
    skipErConfirmation: true,
  });
}

/**
 * Triggers the boss fight for the current week.
 * Only callable at end of Night3 when all moves are exhausted.
 */
export async function triggerBossFight(
  connection: Connection,
  program: Program,
  gameStatePda: PublicKey,
  sessionPda: PublicKey,
  sessionSignerKeypair: Keypair,
  options?: { gauntletEchoesPda?: PublicKey }
): Promise<string> {
  const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
  const [inventoryPda] = deriveInventoryPda(sessionPda);

  const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);
  const [gameplayVrfStatePda] = deriveGameplayVrfStatePda(sessionPda);

  const transaction = await program.methods
    .triggerBossFight()
    .accountsPartial({
      gameState: gameStatePda,
      gameSession: sessionPda,
      generatedMap: generatedMapPda,
      inventory: inventoryPda,
      playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
      gameplayVrfState: gameplayVrfStatePda,
      sessionDiscovery: sessionDiscoveryPda,
      mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
      gauntletEchoes: options?.gauntletEchoesPda ?? null,
      player: sessionSignerKeypair.publicKey,
    } as any)
    .transaction();

  // Boss fight runs full combat resolution (up to 50 turns + effect processing)
  // and may CPI into inventory mutations. Duel and gauntlet paths both exceed
  // the default 32KB BPF heap in practice, so match the program tests by
  // requesting a larger heap frame for all boss triggers.
  transaction.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }));
  transaction.instructions.unshift(ComputeBudgetProgram.requestHeapFrame({ bytes: 256 * 1024 }));

  return sendSessionSignerTransaction(connection, transaction, sessionSignerKeypair);
}

/**
 * Skips all remaining phases in the current week, jumping directly to end-of-week
 * boss/echo resolution. The player forfeits all remaining moves. Same accounts as
 * triggerBossFight since it resolves the boss inline.
 */
export async function skipToEow(
  connection: Connection,
  program: Program,
  gameStatePda: PublicKey,
  sessionSignerKeypair: Keypair,
): Promise<string> {
  const transaction = await program.methods
    .skipToEow()
    .accountsPartial({
      gameState: gameStatePda,
      player: sessionSignerKeypair.publicKey,
    } as any)
    .transaction();

  const isNative = Platform.OS !== 'web';
  return sendSessionSignerTransaction(connection, transaction, sessionSignerKeypair, {
    fireAndForget: isNative,
    skipErConfirmation: true,
  });
}

/**
 * Closes the GameState account, returning rent to player.
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance
 * @param gameStatePda - GameState PDA
 * @param sessionSignerKeypair - SessionSigner wallet keypair (signer)
 * @returns Transaction signature
 */
export async function closeGameState(
  connection: Connection,
  program: Program,
  gameStatePda: PublicKey,
  sessionSignerKeypair: Keypair
): Promise<string> {
  const transaction = await (
    program.methods as unknown as {
      closeGameState: () => {
        accounts: (accounts: { gameState: PublicKey; player: PublicKey }) => {
          transaction: () => Promise<
            ReturnType<(typeof import('@solana/web3.js').Transaction)['prototype']['add']>
          >;
        };
      };
    }
  )
    .closeGameState()
    .accounts({
      gameState: gameStatePda,
      player: sessionSignerKeypair.publicKey,
    })
    .transaction();

  return sendSessionSignerTransaction(connection, transaction, sessionSignerKeypair, {
    skipErConfirmation: true,
  });
}

/**
 * Fetches current GameState from chain.
 *
 * @param program - Anchor program instance
 * @param gameStatePda - GameState PDA
 * @returns GameState or null if not found
 */
export async function fetchGameState(
  program: Program,
  gameStatePda: PublicKey
): Promise<GameState | null> {
  try {
    const account = await (
      program.account as {
        gameState: {
          fetchNullable: (address: PublicKey) => Promise<OnChainGameState | null>;
        };
      }
    ).gameState.fetchNullable(gameStatePda);

    if (!account) {
      return null;
    }

    return parseOnChainGameState(account);
  } catch (error) {
    console.error('Failed to fetch game state:', error);
    return null;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * On-chain GameState account structure from Anchor.
 * Note: ATK, ARM, SPD, DIG, MaxHP are NOT stored on-chain - they are derived
 * from PlayerInventory at runtime. The fields are optional here and will use
 * defaults if not present (which happens when fetching from chain).
 */
interface OnChainGameState {
  player: PublicKey;
  sessionSignerWallet?: PublicKey;
  session: PublicKey;
  positionX: number;
  positionY: number;
  mapWidth: number;
  mapHeight: number;
  hp: number;
  // Stats derived from inventory - NOT stored on-chain
  maxHp?: number;
  atk?: number;
  arm?: number;
  spd?: number;
  dig?: number;
  gearSlots: number;
  week: number;
  phase: {
    day1?: object;
    night1?: object;
    day2?: object;
    night2?: object;
    day3?: object;
    night3?: object;
  };
  movesRemaining: number;
  totalMoves: number;
  bossFightReady: boolean;
  gold: number;
  campaignLevel: number;
  isDead: boolean;
  runMode?: {
    campaign?: object;
    duel?: object;
    gauntlet?: object;
  };
  maxWeeks?: number;
  completed?: boolean;
  gauntletEpochId?: number;
  gauntletPointsEarned?: number;
  gauntletDefenderCredit?: { defender: PublicKey; points: number | bigint } | null;
  gauntletHighestWeekWon?: number;
  gauntletSettled?: boolean;
  duelMapSeed?: number;
  enemies?: Array<{ archetype: number; x: number; y: number; defeated: boolean }>;
  enemyCount?: number;
  bump: number;
}

function parseRunMode(runMode: OnChainGameState['runMode']): RunMode {
  if (!runMode) return RunMode.Campaign;
  if ('duel' in runMode) return RunMode.Duel;
  if ('gauntlet' in runMode) return RunMode.Gauntlet;
  return RunMode.Campaign;
}

/**
 * Parses on-chain GameState to typed GameState.
 * Note: Stats (maxHp, atk, arm, spd, dig) are derived from inventory at runtime
 * and not stored on-chain. We provide defaults here, but the frontend should
 * preserve local stats rather than using these placeholders.
 */
function parseOnChainGameState(account: OnChainGameState): GameState {
  // Default stats for when inventory derivation isn't available.
  // These are starting stats for a new game - actual stats come from inventory.
  const DEFAULT_MAX_HP = 10;
  const DEFAULT_ATK = 1;
  const DEFAULT_ARM = 0;
  const DEFAULT_SPD = 1;
  const DEFAULT_DIG = 1;

  const toPlainNumber = (value: unknown, fallback = 0): number => {
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);
    if (value && typeof value === 'object' && 'toString' in value) {
      const parsed = Number((value as { toString: () => string }).toString());
      return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
  };

  return {
    player: account.player,
    session: account.session,
    positionX: account.positionX,
    positionY: account.positionY,
    mapWidth: account.mapWidth,
    mapHeight: account.mapHeight,
    hp: account.hp,
    // Stats derived from inventory - use defaults if not present
    maxHp: account.maxHp ?? DEFAULT_MAX_HP,
    atk: account.atk ?? DEFAULT_ATK,
    arm: account.arm ?? DEFAULT_ARM,
    spd: account.spd ?? DEFAULT_SPD,
    dig: account.dig ?? DEFAULT_DIG,
    gearSlots: account.gearSlots,
    week: account.week,
    phase: parsePhase(account.phase),
    movesRemaining: account.movesRemaining,
    totalMoves: account.totalMoves,
    bossFightReady: account.bossFightReady,
    gold: account.gold ?? 0,
    campaignLevel: account.campaignLevel ?? 1,
    isDead: account.isDead ?? false,
    runMode: parseRunMode(account.runMode),
    maxWeeks: account.maxWeeks ?? 3,
    completed: account.completed ?? false,
    gauntletEpochId: toPlainNumber(account.gauntletEpochId, 0),
    gauntletPointsEarned: toPlainNumber(account.gauntletPointsEarned, 0),
    gauntletHighestWeekWon: toPlainNumber(account.gauntletHighestWeekWon, 0),
    gauntletSettled: account.gauntletSettled ?? false,
    duelMapSeed: toPlainNumber(account.duelMapSeed, 0),
    enemiesDefeated: toPlainNumber((account as any).enemiesDefeated, 0),
    enemies: account.enemies?.map((enemy) => ({
      archetype: enemy.archetype,
      tier: (enemy as any).tier,
      x: enemy.x,
      y: enemy.y,
      defeated: enemy.defeated,
    })),
    enemyCount: toPlainNumber(account.enemyCount, account.enemies?.length ?? 0),
  };
}

/**
 * Parses on-chain Phase enum to typed Phase.
 */
function parsePhase(phase: OnChainGameState['phase']): Phase {
  if ('day1' in phase) return Phase.Day1;
  if ('night1' in phase) return Phase.Night1;
  if ('day2' in phase) return Phase.Day2;
  if ('night2' in phase) return Phase.Night2;
  if ('day3' in phase) return Phase.Day3;
  if ('night3' in phase) return Phase.Night3;
  return Phase.Day1; // Default fallback
}

/**
 * Builds and sends a sync_discovery_boss transaction on the ER.
 * Called after rest-alcove boss wins in Duel mode to update the boss ID
 * in SessionDiscovery (skip_to_day can't do this due to ER CPI depth limits).
 */
export async function syncDiscoveryBoss(
  connection: Connection,
  program: Program,
  gameStatePda: PublicKey,
  sessionPda: PublicKey,
  sessionSignerKeypair: Keypair
): Promise<string> {
  const [gameplayAuthorityPda] = deriveGameplayAuthorityPda();
  const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);
  const [gameplayVrfStatePda] = deriveGameplayVrfStatePda(sessionPda);

  // Check if VRF state exists (needed for Duel boss selection)
  const vrfExists = await (program.account as any)?.gameplayVrfState
    ?.fetchNullable(gameplayVrfStatePda)
    .catch(() => null);

  const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);

  const transaction = await (program.methods as any)
    .syncDiscoveryBoss()
    .accountsPartial({
      gameState: gameStatePda,
      gameSession: sessionPda,
      gameplayAuthority: gameplayAuthorityPda,
      sessionDiscovery: sessionDiscoveryPda,
      mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
      gameplayVrfState: vrfExists ? gameplayVrfStatePda : null,
      generatedMap: generatedMapPda,
      player: sessionSignerKeypair.publicKey,
    })
    .transaction();

  transaction.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));

  const isNative = Platform.OS !== 'web';
  return sendSessionSignerTransaction(connection, transaction, sessionSignerKeypair, {
    fireAndForget: isNative,
    skipErConfirmation: true,
  });
}

/**
 * Converts StatType enum to Anchor-compatible argument format.
 */
function getStatTypeArg(stat: StatType): { [key: string]: Record<string, never> } {
  switch (stat) {
    case StatType.Hp:
      return { hp: {} };
    case StatType.MaxHp:
      return { maxHp: {} };
    case StatType.Atk:
      return { atk: {} };
    case StatType.Arm:
      return { arm: {} };
    case StatType.Spd:
      return { spd: {} };
    case StatType.Dig:
      return { dig: {} };
    default:
      throw new Error(`Unknown stat type: ${stat}`);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Decodes raw AccountInfo data (from onAccountChange) into a typed GameState.
 * Returns null if decoding fails.
 */
export function decodeGameStateFromAccountInfo(
  program: Program,
  data: Buffer | Uint8Array
): GameState | null {
  try {
    const decoded = (program.coder.accounts as any).decode('gameState', data);
    return decoded ? parseOnChainGameState(decoded) : null;
  } catch {
    return null;
  }
}

/**
 * Clears the per-session account existence caches for a given session.
 * Call on session end to prevent memory leaks across sessions.
 */
export function clearMovePlayerCaches(sessionKey: string): void {
  vrfStateExistsCache.delete(sessionKey);
  discoveryExistsCache.delete(sessionKey);
  gauntletEchoesExistsCache.delete(sessionKey);
  pdaCache.delete(sessionKey);
  moveTemplateCache.delete(sessionKey);
}

/**
 * Calculates move cost for a tile.
 * Floor tile: 1 move
 * Wall tile: max(2, 6 - dig) moves
 */
export function calculateMoveCost(isWall: boolean, dig: number): number {
  if (!isWall) {
    return 1;
  }
  return Math.max(2, 6 - dig);
}
