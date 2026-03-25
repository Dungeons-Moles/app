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
import { SOLANA_CONFIG } from './config';
import {
  sendSessionSignerTransaction,
  confirmErTransaction,
  getCachedErBlockhash,
  buildMessageTemplate,
  signTemplatedTransaction,
  type MessageTemplate,
} from './sessionSigner';
import bs58 from 'bs58';
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
const pdaCache = new Map<string, {
  generatedMap: PublicKey;
  inventory: PublicKey;
  gameplayAuthority: PublicKey;
  mapPois: PublicKey;
  gameplayVrfState: PublicKey;
  sessionDiscovery: PublicKey;
  gauntletEchoes: PublicKey;
}>();

// Pre-computed Anchor discriminator for move_player: sha256("global:move_player")[0..8]
// Avoids going through Anchor's MethodsBuilder which adds ~120ms of async overhead.
const MOVE_PLAYER_DISCRIMINATOR = Buffer.from([17, 58, 68, 221, 186, 117, 140, 231]);

// Pre-compiled message template per session — eliminates ~130ms message compilation on Hermes.
// The move transaction has the same accounts every call; only blockhash, targetX/Y, and CU price change.
const moveTemplateCache = new Map<string, MessageTemplate>();

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
 * Pre-warm the optional-account existence caches for a session so the first
 * movePlayer call doesn't pay 3 sequential RPC round trips (~450ms).
 * Fire-and-forget — errors are silently swallowed.
 */
export function warmMovePlayerCaches(
  connection: Connection,
  program: Program,
  sessionPda: PublicKey
): void {
  const sessionKey = sessionPda.toBase58();
  if (
    vrfStateExistsCache.has(sessionKey) &&
    discoveryExistsCache.has(sessionKey) &&
    gauntletEchoesExistsCache.has(sessionKey)
  ) {
    return; // already warm
  }
  const [gameplayVrfStatePda] = deriveGameplayVrfStatePda(sessionPda);
  const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);
  const [gauntletEchoesPda] = deriveGauntletEchoesPda(sessionPda);
  Promise.all([
    vrfStateExistsCache.has(sessionKey) ? null :
      (program.account as any)?.gameplayVrfState
        ?.fetchNullable(gameplayVrfStatePda)
        .catch(() => null)
        .then((r: unknown) => vrfStateExistsCache.set(sessionKey, !!r)),
    discoveryExistsCache.has(sessionKey) ? null :
      connection.getAccountInfo(sessionDiscoveryPda)
        .catch(() => null)
        .then((r: unknown) => discoveryExistsCache.set(sessionKey, !!r)),
    gauntletEchoesExistsCache.has(sessionKey) ? null :
      connection.getAccountInfo(gauntletEchoesPda)
        .catch(() => null)
        .then((info: { owner?: { toBase58?: () => string } } | null) => {
          const isDelegated = (info as any)?.owner?.toBase58?.() === GAMEPLAY_STATE_PROGRAM_ID.toBase58();
          gauntletEchoesExistsCache.set(sessionKey, !!info && isDelegated);
        }),
  ]).catch(() => {});
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

  const signature = await sendSessionSignerTransaction(connection, transaction, sessionSignerKeypair);

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
  params: MovePlayerParams
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
    console.log(`[perf]   cache MISS: vrf=${vrfCached} disc=${discoveryCached} gauntlet=${gauntletCached}`);
    const [vrfResult, discoveryResult, gauntletResult] = await Promise.all([
      vrfCached ? Promise.resolve(null) :
        (program.account as any)?.gameplayVrfState
          ?.fetchNullable(gameplayVrfStatePda)
          .catch(() => null),
      discoveryCached ? Promise.resolve(null) :
        connection.getAccountInfo(sessionDiscoveryPda).catch(() => null),
      gauntletCached ? Promise.resolve(null) :
        // Check if gauntlet_echoes exists AND is owned by gameplay_state (delegated).
        // The ER proxies base-chain reads, so a non-delegated account would return data
        // but cause InvalidWritableAccount when included as writable in an ER tx.
        connection.getAccountInfo(gauntletEchoesPda).catch(() => null)
          .then((info: { owner?: { toBase58?: () => string } } | null) =>
            info?.owner?.toBase58?.() === GAMEPLAY_STATE_PROGRAM_ID.toBase58() ? info : null
          ),
    ]);
    if (!vrfCached) vrfStateExistsCache.set(sessionKey, !!vrfResult);
    if (!discoveryCached) discoveryExistsCache.set(sessionKey, !!discoveryResult);
    if (!gauntletCached) gauntletEchoesExistsCache.set(sessionKey, !!gauntletResult);
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

    // Get cached blockhash
    const { blockhash } = await getCachedErBlockhash(connection, 'processed');
    const blockhashBytes = bs58.decode(blockhash);

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
      tx.add(new TransactionInstruction({
        keys,
        programId: SOLANA_CONFIG.programs.gameplayState,
        data,
      }));
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

    const { wireTransaction, signature } = signTemplatedTransaction(
      template,
      blockhashBytes,
      patchData,
      sessionSignerKeypair.secretKey.slice(0, 32)
    );
    const tDone = Date.now();

    // Fire-and-forget the HTTP send
    connection.sendRawTransaction(Buffer.from(wireTransaction), {
      skipPreflight: true,
      maxRetries: 2,
    }).then(() => {
      console.log('[perf] sendTransaction(bg): completed (router=true)');
    }).catch((err) => {
      console.error('[movePlayer] Background send failed:', err);
    });

    console.log(`[perf] sendTransaction: 0ms (templated, sign: ${tDone - tSign}ms, sig=${signature.slice(0, 8)}...)`);
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
  transaction.instructions.unshift(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 })
  );

  const signature = await sendSessionSignerTransaction(connection, transaction, sessionSignerKeypair, {
    skipErConfirmation: true,
  });

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
  sessionSignerKeypair: Keypair
): Promise<string> {
  const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
  const [inventoryPda] = deriveInventoryPda(sessionPda);

  const transaction = await program.methods
    .triggerBossFight()
    .accountsPartial({
      gameState: gameStatePda,
      gameSession: sessionPda,
      generatedMap: generatedMapPda,
      inventory: inventoryPda,
      playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
      gameplayVrfState: null,
      sessionDiscovery: null,
      mapGeneratorProgram: null,
      player: sessionSignerKeypair.publicKey,
    } as any)
    .transaction();

  // Boss fight runs full combat resolution (up to 50 turns + effect processing)
  transaction.instructions.unshift(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 })
  );

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
    gauntletEpochId: account.gauntletEpochId ?? 0,
    gauntletPointsEarned: account.gauntletPointsEarned ?? 0,
    gauntletHighestWeekWon: account.gauntletHighestWeekWon ?? 0,
    gauntletSettled: account.gauntletSettled ?? false,
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

  const transaction = await (program.methods as any)
    .syncDiscoveryBoss()
    .accountsPartial({
      gameState: gameStatePda,
      gameSession: sessionPda,
      gameplayAuthority: gameplayAuthorityPda,
      sessionDiscovery: sessionDiscoveryPda,
      mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
      gameplayVrfState: vrfExists ? gameplayVrfStatePda : null,
      player: sessionSignerKeypair.publicKey,
    })
    .transaction();

  transaction.instructions.unshift(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 })
  );

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
