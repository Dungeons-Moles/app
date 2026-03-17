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
import { sendSessionSignerTransaction, confirmErTransaction } from './sessionSigner';
import {
  deriveMapEnemiesPda,
  deriveInventoryPda,
  deriveGeneratedMapPda,
  deriveGameplayAuthorityPda,
  deriveMapPoisPda,
  deriveGameplayVrfStatePda,
  deriveSessionDiscoveryPda,
  deriveGauntletEchoesPda,
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

// Pre-computed Anchor discriminator for move_player: sha256("global:move_player")[0..8]
// Avoids going through Anchor's MethodsBuilder which adds ~120ms of async overhead.
const MOVE_PLAYER_DISCRIMINATOR = Buffer.from([17, 58, 68, 221, 186, 117, 140, 231]);

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
        .then((r: unknown) => gauntletEchoesExistsCache.set(sessionKey, !!r)),
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
  const [mapEnemiesPda] = deriveMapEnemiesPda(sessionPda);
  const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
  const [inventoryPda] = deriveInventoryPda(sessionPda);
  const [gameplayAuthorityPda] = deriveGameplayAuthorityPda();
  const [mapPoisPda] = deriveMapPoisPda(sessionPda);
  const [gameplayVrfStatePda] = deriveGameplayVrfStatePda(sessionPda);
  const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);
  // Optional accounts: include only when fully initialized/deserializable.
  // Cache both positive and negative results per session to avoid round trips on every move.
  // On first move (cold cache), all 3 checks run in parallel to avoid sequential latency.
  const sessionKey = sessionPda.toBase58();
  const [gauntletEchoesPda] = deriveGauntletEchoesPda(sessionPda);

  const vrfCached = vrfStateExistsCache.has(sessionKey);
  const discoveryCached = discoveryExistsCache.has(sessionKey);
  const gauntletCached = gauntletEchoesExistsCache.has(sessionKey);

  if (!vrfCached || !discoveryCached || !gauntletCached) {
    const [vrfResult, discoveryResult, gauntletResult] = await Promise.all([
      vrfCached ? Promise.resolve(null) :
        (program.account as any)?.gameplayVrfState
          ?.fetchNullable(gameplayVrfStatePda)
          .catch(() => null),
      discoveryCached ? Promise.resolve(null) :
        connection.getAccountInfo(sessionDiscoveryPda).catch(() => null),
      gauntletCached ? Promise.resolve(null) :
        connection.getAccountInfo(gauntletEchoesPda).catch(() => null),
    ]);
    if (!vrfCached) vrfStateExistsCache.set(sessionKey, !!vrfResult);
    if (!discoveryCached) discoveryExistsCache.set(sessionKey, !!discoveryResult);
    if (!gauntletCached) gauntletEchoesExistsCache.set(sessionKey, !!gauntletResult);
  }

  const vrfStateExists = vrfStateExistsCache.get(sessionKey)!;
  const discoveryExists = discoveryExistsCache.get(sessionKey)!;
  const gauntletEchoesExists = gauntletEchoesExistsCache.get(sessionKey)!;

  // Build instruction manually instead of using Anchor's MethodsBuilder.
  // Anchor's async account resolution loop adds ~120ms of overhead even when
  // all accounts are provided, due to Promise chains and IDL traversal.
  const data = Buffer.alloc(10); // 8 discriminator + 1 targetX (u8) + 1 targetY (u8)
  data.set(MOVE_PLAYER_DISCRIMINATOR, 0);
  data.writeUInt8(params.targetX, 8);
  data.writeUInt8(params.targetY, 9);

  const keys = [
    { pubkey: gameStatePda, isSigner: false, isWritable: true },
    { pubkey: sessionPda, isSigner: false, isWritable: false },
    { pubkey: mapEnemiesPda, isSigner: false, isWritable: true },
    { pubkey: generatedMapPda, isSigner: false, isWritable: true },
    { pubkey: inventoryPda, isSigner: false, isWritable: true },
    { pubkey: gameplayAuthorityPda, isSigner: false, isWritable: false },
    { pubkey: SOLANA_CONFIG.programs.playerInventory, isSigner: false, isWritable: false },
    { pubkey: SOLANA_CONFIG.programs.mapGenerator, isSigner: false, isWritable: false },
    { pubkey: mapPoisPda, isSigner: false, isWritable: true },
    { pubkey: SOLANA_CONFIG.programs.poiSystem, isSigner: false, isWritable: false },
    // Optional: session_discovery — when null, Anchor uses program_id as sentinel
    {
      pubkey: discoveryExists ? sessionDiscoveryPda : SOLANA_CONFIG.programs.gameplayState,
      isSigner: false,
      isWritable: discoveryExists,
    },
    // Optional: when null, Anchor uses program_id as sentinel
    {
      pubkey: vrfStateExists ? gameplayVrfStatePda : SOLANA_CONFIG.programs.gameplayState,
      isSigner: false,
      isWritable: false,
    },
    // Optional: gauntlet_echoes — when null, Anchor uses program_id as sentinel
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
  // move_player can resolve boss fights / gauntlet echoes inline on the last
  // move of night3 (up to 50-turn combat + CPIs), which far exceeds the
  // default 200k CU limit.
  transaction.instructions.unshift(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 })
  );

  // Skip ER confirmation here — caller runs it in parallel with state fetch
  // to overlap the round trips (saves ~150ms from high-latency locations).
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

  return sendSessionSignerTransaction(connection, transaction, sessionSignerKeypair);
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
  const [mapEnemiesPda] = deriveMapEnemiesPda(sessionPda);
  const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
  const [inventoryPda] = deriveInventoryPda(sessionPda);

  const transaction = await program.methods
    .triggerBossFight()
    .accountsPartial({
      gameState: gameStatePda,
      gameSession: sessionPda,
      mapEnemies: mapEnemiesPda,
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

  return sendSessionSignerTransaction(connection, transaction, sessionSignerKeypair);
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

  return sendSessionSignerTransaction(connection, transaction, sessionSignerKeypair);
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
// MapEnemies Fetch (for session restore)
// ============================================================================

/**
 * On-chain EnemyInstance structure from Anchor.
 */
interface OnChainEnemyInstance {
  archetypeId: number;
  tier: number;
  x: number;
  y: number;
  defeated: boolean;
}

/**
 * On-chain MapEnemies account structure from Anchor.
 */
interface OnChainMapEnemies {
  session: PublicKey;
  enemies: OnChainEnemyInstance[];
  count: number;
  bump: number;
}

export type { OnChainEnemyInstance, OnChainMapEnemies };

/**
 * Fetches current MapEnemies account from chain.
 *
 * @param program - Anchor program instance (gameplay_state)
 * @param mapEnemiesPda - MapEnemies PDA
 * @returns OnChainMapEnemies or null if not found
 */
export async function fetchMapEnemies(
  program: Program,
  mapEnemiesPda: PublicKey
): Promise<OnChainMapEnemies | null> {
  try {
    const account = await (
      program.account as {
        mapEnemies: {
          fetchNullable: (address: PublicKey) => Promise<OnChainMapEnemies | null>;
        };
      }
    ).mapEnemies.fetchNullable(mapEnemiesPda);

    return account ?? null;
  } catch (error) {
    console.error('Failed to fetch map enemies:', error);
    return null;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

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
