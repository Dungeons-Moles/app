/**
 * Gameplay State Program Client
 *
 * TypeScript client interface for interacting with the gameplay-state Solana program.
 * Uses burner wallet for signing all gameplay transactions.
 */

import { Keypair, PublicKey, SystemProgram, Connection } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import { SOLANA_CONFIG } from './config';
import { sendBurnerTransaction } from './burnerWallet';
import { buildResolveGauntletWeekTransaction, parseGauntletCombatVisualEvent } from './gauntlet';
import {
  deriveMapEnemiesPda,
  deriveInventoryPda,
  deriveGeneratedMapPda,
  deriveGameplayAuthorityPda,
  deriveMapPoisPda,
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

// ============================================================================
// Error Messages (T015)
// ============================================================================

/**
 * User-friendly error messages for gameplay-state program errors.
 */
export const GAMEPLAY_ERROR_MESSAGES: Record<number, string> = {
  6000: 'Target position is out of map boundaries',
  6001: 'Not enough moves remaining for this action',
  6002: 'Can only move to adjacent tiles',
  6003: 'Stat value is at maximum',
  6004: 'HP cannot go below zero',
  6005: 'Invalid stat modification',
  6006: 'Boss fight triggered - end your session!',
  6007: 'Not authorized for this action',
  6008: 'Game session is not active',
  6009: 'Calculation overflow',
  6033: 'Gauntlet mode is not active for this run.',
  6034: 'Gauntlet run has already ended.',
  6035: 'Invalid gauntlet week.',
};

/**
 * Extracts user-friendly error message from gameplay-state program error.
 */
export function getGameplayErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Extract error code from Anchor error
    const match = error.message.match(/custom program error: 0x([0-9a-fA-F]+)/);
    if (match) {
      const errorCode = parseInt(match[1], 16);
      const message = GAMEPLAY_ERROR_MESSAGES[errorCode];
      if (message) {
        return message;
      }
    }

    // Check for insufficient funds
    if (error.message.includes('insufficient funds')) {
      return 'Burner wallet needs more SOL. Please top up.';
    }
  }

  return 'An unexpected error occurred. Please try again.';
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
 * @param burnerKeypair - Burner wallet keypair (signer)
 * @param params - Initialization parameters (mapWidth, mapHeight, startX, startY)
 * @returns Transaction signature and GameState PDA
 */
export async function initializeGameState(
  connection: Connection,
  program: Program,
  sessionPda: PublicKey,
  burnerKeypair: Keypair,
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
      player: burnerKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  const signature = await sendBurnerTransaction(connection, transaction, burnerKeypair);

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
 * @param burnerKeypair - Burner wallet keypair (signer)
 * @param params - Move parameters (targetX, targetY)
 * @returns Transaction signature
 */
export async function movePlayer(
  connection: Connection,
  program: Program,
  gameStatePda: PublicKey,
  sessionPda: PublicKey,
  burnerKeypair: Keypair,
  params: MovePlayerParams
): Promise<string> {
  const [mapEnemiesPda] = deriveMapEnemiesPda(sessionPda);
  const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
  const [inventoryPda] = deriveInventoryPda(sessionPda);
  const [gameplayAuthorityPda] = deriveGameplayAuthorityPda();
  const [mapPoisPda] = deriveMapPoisPda(sessionPda);

  const transaction = await program.methods
    .movePlayer(params.targetX, params.targetY)
    .accounts({
      gameState: gameStatePda,
      gameSession: sessionPda,
      mapEnemies: mapEnemiesPda,
      generatedMap: generatedMapPda,
      inventory: inventoryPda,
      gameplayAuthority: gameplayAuthorityPda,
      playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
      mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
      mapPois: mapPoisPda,
      poiSystemProgram: SOLANA_CONFIG.programs.poiSystem,
      player: burnerKeypair.publicKey,
    })
    .transaction();

  // Await confirmation — on-chain-first principle requires confirmed state before UI update
  const signature = await sendBurnerTransaction(connection, transaction, burnerKeypair);

  return signature;
}

/**
 * Modifies a player stat by a delta value.
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance
 * @param gameStatePda - GameState PDA
 * @param burnerKeypair - Burner wallet keypair (signer)
 * @param params - Modify stat parameters (stat, delta)
 * @returns Transaction signature
 */
export async function modifyStat(
  connection: Connection,
  program: Program,
  gameStatePda: PublicKey,
  burnerKeypair: Keypair,
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
      player: burnerKeypair.publicKey,
    })
    .transaction();

  return sendBurnerTransaction(connection, transaction, burnerKeypair);
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
  burnerKeypair: Keypair
): Promise<string> {
  const [mapEnemiesPda] = deriveMapEnemiesPda(sessionPda);
  const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
  const [inventoryPda] = deriveInventoryPda(sessionPda);

  const transaction = await program.methods
    .triggerBossFight()
    .accounts({
      gameState: gameStatePda,
      gameSession: sessionPda,
      mapEnemies: mapEnemiesPda,
      generatedMap: generatedMapPda,
      inventory: inventoryPda,
      playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
      player: burnerKeypair.publicKey,
    })
    .transaction();

  return sendBurnerTransaction(connection, transaction, burnerKeypair);
}

export async function resolveGauntletWeek(
  connection: Connection,
  program: Program,
  gameStatePda: PublicKey,
  sessionPda: PublicKey,
  burnerKeypair: Keypair
): Promise<{
  signature: string;
  combatVisual: Awaited<ReturnType<typeof parseGauntletCombatVisualEvent>>;
}> {
  const transaction = await buildResolveGauntletWeekTransaction(
    connection,
    program,
    burnerKeypair.publicKey,
    gameStatePda,
    sessionPda
  );

  const signature = await sendBurnerTransaction(connection, transaction, burnerKeypair);
  const combatVisual = await parseGauntletCombatVisualEvent(connection, signature);

  return { signature, combatVisual };
}

/**
 * Closes the GameState account, returning rent to player.
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance
 * @param gameStatePda - GameState PDA
 * @param burnerKeypair - Burner wallet keypair (signer)
 * @returns Transaction signature
 */
export async function closeGameState(
  connection: Connection,
  program: Program,
  gameStatePda: PublicKey,
  burnerKeypair: Keypair
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
      player: burnerKeypair.publicKey,
    })
    .transaction();

  return sendBurnerTransaction(connection, transaction, burnerKeypair);
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
  burnerWallet?: PublicKey;
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
