/**
 * Session List Service
 *
 * Fetches and manages player's active sessions across campaign levels.
 * Supports multi-session gameplay with session switching.
 *
 * @see contracts/multi-session.md for specifications
 */

import { Connection, PublicKey } from '@solana/web3.js';
import type { Program } from '@coral-xyz/anchor';
import {
  SESSION_MANAGER_PROGRAM_ID,
  GAMEPLAY_STATE_PROGRAM_ID,
  deriveSessionPda,
  deriveGameStatePda,
  deriveMapEnemiesPda,
  deriveMapPoisPda,
  deriveInventoryPda,
} from './constants';

const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');

function isSupportedOwner(owner: PublicKey, primaryProgramId: PublicKey): boolean {
  return owner.equals(primaryProgramId) || owner.equals(DELEGATION_PROGRAM_ID);
}

async function hasCompatibleSessionRuntime(
  connection: Connection,
  playerPubkey: PublicKey,
  onChainLevel: number
): Promise<boolean> {
  const [sessionPda] = deriveSessionPda(playerPubkey, onChainLevel);
  const [gameStatePda] = deriveGameStatePda(sessionPda);
  const [sessionInfo, gameStateInfo] = await connection.getMultipleAccountsInfo([sessionPda, gameStatePda]);
  if (!sessionInfo || !gameStateInfo) {
    return false;
  }
  if (!isSupportedOwner(sessionInfo.owner, SESSION_MANAGER_PROGRAM_ID)) {
    return false;
  }
  if (!isSupportedOwner(gameStateInfo.owner, GAMEPLAY_STATE_PROGRAM_ID)) {
    return false;
  }
  return true;
}

// ============================================================================
// Types
// ============================================================================

/**
 * Active session summary for list display.
 */
export interface ActiveSession {
  /** Session PDA as base58 string */
  sessionPda: string;
  /** Campaign level (1-40) */
  level: number;
  /** Current week (1-3) */
  week: number;
  /** Current phase (0-5) */
  phase: number;
  /** Player X position */
  positionX: number;
  /** Player Y position */
  positionY: number;
  /** Moves remaining in current phase */
  movesRemaining: number;
  /** Last activity timestamp */
  lastPlayedAt: number;
}

/**
 * Complete session data for game restoration.
 */
export interface SessionData {
  /** Session account data */
  session: SessionAccount;
  /** Game state account data */
  gameState: GameStateAccount;
  /** Map enemies account data */
  enemies: MapEnemiesAccount;
  /** Map POIs account data */
  pois: MapPoisAccount;
  /** Player inventory account data */
  inventory: PlayerInventoryAccount;
}

/** Session account structure */
export interface SessionAccount {
  player: PublicKey;
  sessionId: bigint;
  campaignLevel: number;
  sessionSigner: PublicKey;
  activeItemPool: Uint8Array;
  stateHash: Uint8Array;
  createdAt: bigint;
}

/** Game state account structure */
export interface GameStateAccount {
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
  phase: number;
  movesRemaining: number;
  totalMoves: number;
  bossFightReady: boolean;
}

/** Map enemies account structure */
export interface MapEnemiesAccount {
  enemies: EnemyData[];
}

/** Individual enemy data */
export interface EnemyData {
  x: number;
  y: number;
  archetype: number;
  currentHp: number;
  alive: boolean;
}

/** Map POIs account structure */
export interface MapPoisAccount {
  pois: PoiData[];
}

/** Individual POI data */
export interface PoiData {
  x: number;
  y: number;
  poiType: number;
  consumed: boolean;
}

/** Player inventory account structure */
export interface PlayerInventoryAccount {
  items: InventoryItem[];
}

/** Inventory item */
export interface InventoryItem {
  itemIndex: number;
  equipped: boolean;
}

// ============================================================================
// Session List Functions
// ============================================================================

/**
 * Fetch all active sessions for a player.
 *
 * @param connection - Solana connection
 * @param sessionProgram - Session manager program
 * @param gameplayProgram - Gameplay state program
 * @param playerPubkey - Player's main wallet
 * @returns Array of active sessions sorted by level
 */
export async function fetchSessionList(
  connection: Connection,
  sessionProgram: Program,
  gameplayProgram: Program,
  playerPubkey: PublicKey
): Promise<ActiveSession[]> {
  const sessions: ActiveSession[] = [];
  const candidatePdas: PublicKey[] = [];
  for (let onChainLevel = 1; onChainLevel <= 40; onChainLevel += 1) {
    const [sessionPda] = deriveSessionPda(playerPubkey, onChainLevel);
    candidatePdas.push(sessionPda);
  }

  // NOTE: cannot rely on getProgramAccounts(session-manager) because delegated sessions
  // are owned by the delegation program while active.
  const candidateAccounts = await connection.getMultipleAccountsInfo(candidatePdas);

  for (let i = 0; i < candidateAccounts.length; i += 1) {
    const account = candidateAccounts[i];
    const pubkey = candidatePdas[i];
    if (!account) {
      continue;
    }
    // Derive GameState PDA for this session
    const [gameStatePda] = deriveGameStatePda(pubkey);
    const gameStateAccount = await connection.getAccountInfo(gameStatePda);
    if (!gameStateAccount) {
      // Session exists but no game state (shouldn't happen normally)
      continue;
    }
    if (
      !isSupportedOwner(account.owner, SESSION_MANAGER_PROGRAM_ID) ||
      !isSupportedOwner(gameStateAccount.owner, GAMEPLAY_STATE_PROGRAM_ID)
    ) {
      console.warn('[sessionList] Skipping incompatible legacy session account', {
        sessionPda: pubkey.toBase58(),
        sessionOwner: account.owner.toBase58(),
        gameStateOwner: gameStateAccount.owner.toBase58(),
      });
      continue;
    }

    const decodedLevel = i + 1; // deterministic from PDA seed, avoids coder decode edge-cases

    try {
      const gameState = gameplayProgram.coder.accounts.decode('gameState', gameStateAccount.data);
      sessions.push({
        sessionPda: pubkey.toBase58(),
        level: decodedLevel - 1, // Convert 1-indexed on-chain to 0-indexed frontend
        week: gameState.week,
        phase: gameState.phase,
        positionX: gameState.positionX,
        positionY: gameState.positionY,
        movesRemaining: gameState.movesRemaining,
        lastPlayedAt: Date.now(),
      });
    } catch (error) {
      // Keep session visible/resumable even if game_state decode fails transiently.
      sessions.push({
        sessionPda: pubkey.toBase58(),
        level: decodedLevel - 1,
        week: 1,
        phase: 0,
        positionX: 0,
        positionY: 0,
        movesRemaining: 0,
        lastPlayedAt: Date.now(),
      });
      console.warn('[sessionList] Failed to decode game_state, using fallback metadata', {
        sessionPda: pubkey.toBase58(),
        gameStatePda: gameStatePda.toBase58(),
        error,
      });
    }
  }

  // Sort by level ascending
  return sessions.sort((a, b) => a.level - b.level);
}

/**
 * Check if a session exists for a specific level.
 *
 * @param connection - Solana connection
 * @param playerPubkey - Player's main wallet
 * @param level - Campaign level (0-indexed frontend)
 * @returns true if session exists
 */
export async function checkSessionExists(
  connection: Connection,
  playerPubkey: PublicKey,
  level: number
): Promise<boolean> {
  const onChainLevel = level + 1; // Convert 0-indexed frontend to 1-indexed on-chain
  return hasCompatibleSessionRuntime(connection, playerPubkey, onChainLevel);
}

/**
 * Get existing session PDA for a level if it exists.
 *
 * @param connection - Solana connection
 * @param playerPubkey - Player's main wallet
 * @param level - Campaign level (0-indexed frontend)
 * @returns Session PDA if exists, null otherwise
 */
export async function getSessionForLevel(
  connection: Connection,
  playerPubkey: PublicKey,
  level: number
): Promise<PublicKey | null> {
  const onChainLevel = level + 1; // Convert 0-indexed frontend to 1-indexed on-chain
  const isCompatible = await hasCompatibleSessionRuntime(connection, playerPubkey, onChainLevel);
  if (!isCompatible) {
    return null;
  }
  const [sessionPda] = deriveSessionPda(playerPubkey, onChainLevel);
  return sessionPda;
}

// ============================================================================
// Session Switching
// ============================================================================

/**
 * Load a session's complete state for game restoration.
 *
 * @param connection - Solana connection
 * @param sessionProgram - Session manager program
 * @param gameplayProgram - Gameplay state program
 * @param enemiesProgram - Field enemies program
 * @param poisProgram - POI system program
 * @param inventoryProgram - Inventory program
 * @param sessionPda - Session PDA to load
 * @returns Complete session data
 */
export async function switchToSession(
  connection: Connection,
  sessionProgram: Program,
  gameplayProgram: Program,
  enemiesProgram: Program,
  poisProgram: Program,
  inventoryProgram: Program,
  sessionPda: PublicKey
): Promise<SessionData | null> {
  // Derive all PDAs
  const [gameStatePda] = deriveGameStatePda(sessionPda);
  const [enemiesPda] = deriveMapEnemiesPda(sessionPda);
  const [poisPda] = deriveMapPoisPda(sessionPda);
  const [inventoryPda] = deriveInventoryPda(sessionPda);

  // Fetch all accounts in parallel
  const [sessionAccount, gameStateAccount, enemiesAccount, poisAccount, inventoryAccount] =
    await connection.getMultipleAccountsInfo([
      sessionPda,
      gameStatePda,
      enemiesPda,
      poisPda,
      inventoryPda,
    ]);

  if (!sessionAccount || !gameStateAccount) {
    return null;
  }

  try {
    const session = sessionProgram.coder.accounts.decode(
      'gameSession',
      sessionAccount.data
    ) as SessionAccount;

    const gameState = gameplayProgram.coder.accounts.decode(
      'gameState',
      gameStateAccount.data
    ) as GameStateAccount;

    // Enemies and POIs might not exist yet
    const enemies: MapEnemiesAccount = enemiesAccount
      ? (enemiesProgram.coder.accounts.decode(
          'MapEnemies',
          enemiesAccount.data
        ) as MapEnemiesAccount)
      : { enemies: [] };

    const pois: MapPoisAccount = poisAccount
      ? (poisProgram.coder.accounts.decode('MapPois', poisAccount.data) as MapPoisAccount)
      : { pois: [] };

    const inventory: PlayerInventoryAccount = inventoryAccount
      ? (inventoryProgram.coder.accounts.decode(
          'PlayerInventory',
          inventoryAccount.data
        ) as PlayerInventoryAccount)
      : { items: [] };

    return {
      session,
      gameState,
      enemies,
      pois,
      inventory,
    };
  } catch (error) {
    console.error('[sessionList] Failed to decode session data:', error);
    return null;
  }
}

/**
 * Load session data with simplified program interface.
 * Used when you don't have all program instances available.
 *
 * @param connection - Solana connection
 * @param sessionPda - Session PDA
 * @returns Partial session data (raw accounts)
 */
export async function fetchSessionRawData(
  connection: Connection,
  sessionPda: PublicKey
): Promise<{
  sessionAccount: Buffer | null;
  gameStateAccount: Buffer | null;
  enemiesAccount: Buffer | null;
  poisAccount: Buffer | null;
  inventoryAccount: Buffer | null;
}> {
  const [gameStatePda] = deriveGameStatePda(sessionPda);
  const [enemiesPda] = deriveMapEnemiesPda(sessionPda);
  const [poisPda] = deriveMapPoisPda(sessionPda);
  const [inventoryPda] = deriveInventoryPda(sessionPda);

  const accounts = await connection.getMultipleAccountsInfo([
    sessionPda,
    gameStatePda,
    enemiesPda,
    poisPda,
    inventoryPda,
  ]);

  return {
    sessionAccount: accounts[0]?.data ? Buffer.from(accounts[0].data) : null,
    gameStateAccount: accounts[1]?.data ? Buffer.from(accounts[1].data) : null,
    enemiesAccount: accounts[2]?.data ? Buffer.from(accounts[2].data) : null,
    poisAccount: accounts[3]?.data ? Buffer.from(accounts[3].data) : null,
    inventoryAccount: accounts[4]?.data ? Buffer.from(accounts[4].data) : null,
  };
}

// ============================================================================
// Session Count
// ============================================================================

/**
 * Get count of active sessions for a player.
 *
 * @param connection - Solana connection
 * @param playerPubkey - Player's main wallet
 * @returns Number of active sessions
 */
export async function getSessionCount(
  connection: Connection,
  playerPubkey: PublicKey
): Promise<number> {
  const checks: PublicKey[] = [];
  for (let onChainLevel = 1; onChainLevel <= 40; onChainLevel += 1) {
    const [sessionPda] = deriveSessionPda(playerPubkey, onChainLevel);
    checks.push(sessionPda);
  }
  const infos = await connection.getMultipleAccountsInfo(checks);
  return infos.filter((a) => a !== null).length;
}

/**
 * Get list of active session levels for a player.
 *
 * @param connection - Solana connection
 * @param playerPubkey - Player's main wallet
 * @returns Array of active campaign levels
 */
export async function getActiveLevels(
  connection: Connection,
  playerPubkey: PublicKey
): Promise<number[]> {
  const active: number[] = [];
  for (let onChainLevel = 1; onChainLevel <= 40; onChainLevel += 1) {
    const [sessionPda] = deriveSessionPda(playerPubkey, onChainLevel);
    const account = await connection.getAccountInfo(sessionPda, 'processed');
    if (account) {
      active.push(onChainLevel);
    }
  }
  return active;
}
