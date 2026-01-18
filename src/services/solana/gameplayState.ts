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
import {
  GameState,
  Phase,
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
  6006: 'Boss fight triggered - end your run!',
  6007: 'Not authorized for this action',
  6008: 'Game session is not active',
  6009: 'Calculation overflow',
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
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance
 * @param gameStatePda - GameState PDA
 * @param burnerKeypair - Burner wallet keypair (signer)
 * @param params - Move parameters (targetX, targetY, isWall)
 * @returns Transaction signature
 */
export async function movePlayer(
  connection: Connection,
  program: Program,
  gameStatePda: PublicKey,
  burnerKeypair: Keypair,
  params: MovePlayerParams
): Promise<string> {
  const transaction = await (
    program.methods as unknown as {
      movePlayer: (
        targetX: number,
        targetY: number,
        isWall: boolean
      ) => {
        accounts: (accounts: { gameState: PublicKey; player: PublicKey }) => {
          transaction: () => Promise<
            ReturnType<(typeof import('@solana/web3.js').Transaction)['prototype']['add']>
          >;
        };
      };
    }
  )
    .movePlayer(params.targetX, params.targetY, params.isWall)
    .accounts({
      gameState: gameStatePda,
      player: burnerKeypair.publicKey,
    })
    .transaction();

  return sendBurnerTransaction(connection, transaction, burnerKeypair);
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
 */
interface OnChainGameState {
  player: PublicKey;
  session: PublicKey;
  positionX: number;
  positionY: number;
  mapWidth: number;
  mapHeight: number;
  hp: number;
  maxHp: number;
  atk: number;
  arm: number;
  spd: number;
  dig: number;
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
  bump: number;
}

/**
 * Parses on-chain GameState to typed GameState.
 */
function parseOnChainGameState(account: OnChainGameState): GameState {
  return {
    player: account.player,
    session: account.session,
    positionX: account.positionX,
    positionY: account.positionY,
    mapWidth: account.mapWidth,
    mapHeight: account.mapHeight,
    hp: account.hp,
    maxHp: account.maxHp,
    atk: account.atk,
    arm: account.arm,
    spd: account.spd,
    dig: account.dig,
    gearSlots: account.gearSlots,
    week: account.week,
    phase: parsePhase(account.phase),
    movesRemaining: account.movesRemaining,
    totalMoves: account.totalMoves,
    bossFightReady: account.bossFightReady,
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
