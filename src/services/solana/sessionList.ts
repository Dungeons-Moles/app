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
  deriveDuelSessionPda,
  deriveGauntletSessionPda,
  deriveGameStatePda,
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
  onChainLevel: number,
  campaignNonce: bigint | number = 0
): Promise<boolean> {
  const [sessionPda] = deriveSessionPda(playerPubkey, onChainLevel, campaignNonce);
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
export type SessionType = 'campaign' | 'duel' | 'gauntlet';

export interface ActiveSession {
  /** Session PDA as base58 string */
  sessionPda: string;
  /** Campaign level (1-40 for campaign, 20 for duel/gauntlet) */
  level: number;
  /** Session type */
  sessionType: SessionType;
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
  mapPoisIndex?: number;
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
 * Fetch all active sessions for a player (campaign, duel, and gauntlet).
 *
 * @param connection - Solana connection
 * @param sessionProgram - Session manager program
 * @param gameplayProgram - Gameplay state program
 * @param playerPubkey - Player's main wallet
 * @param nonces - Session nonces (campaign, duel, gauntlet). Defaults to 0 for all.
 * @returns Array of active sessions sorted by level
 */
export async function fetchSessionList(
  connection: Connection,
  sessionProgram: Program,
  gameplayProgram: Program,
  playerPubkey: PublicKey,
  nonces: { campaign?: bigint | number; duel?: bigint | number; gauntlet?: bigint | number } = {}
): Promise<ActiveSession[]> {
  const sessions: ActiveSession[] = [];

  // Build candidate list: 40 campaign levels + 1 duel + 1 gauntlet
  const candidates: { pda: PublicKey; level: number; sessionType: SessionType }[] = [];
  const campaignNonce = nonces.campaign ?? 0;
  for (let onChainLevel = 1; onChainLevel <= 40; onChainLevel += 1) {
    const [sessionPda] = deriveSessionPda(playerPubkey, onChainLevel, campaignNonce);
    candidates.push({ pda: sessionPda, level: onChainLevel - 1, sessionType: 'campaign' });
  }
  const [duelPda] = deriveDuelSessionPda(playerPubkey, nonces.duel ?? 0);
  candidates.push({ pda: duelPda, level: 19, sessionType: 'duel' }); // level 20 on-chain → 19 frontend
  const [gauntletPda] = deriveGauntletSessionPda(playerPubkey, nonces.gauntlet ?? 0);
  candidates.push({ pda: gauntletPda, level: 19, sessionType: 'gauntlet' });

  // NOTE: cannot rely on getProgramAccounts(session-manager) because delegated sessions
  // are owned by the delegation program while active.
  const candidateAccounts = await connection.getMultipleAccountsInfo(
    candidates.map((c) => c.pda)
  );

  for (let i = 0; i < candidateAccounts.length; i += 1) {
    const account = candidateAccounts[i];
    const { pda: pubkey, level, sessionType } = candidates[i];
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

    try {
      const gameState = gameplayProgram.coder.accounts.decode('gameState', gameStateAccount.data);
      sessions.push({
        sessionPda: pubkey.toBase58(),
        level,
        sessionType,
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
        level,
        sessionType,
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

  // Sort by level ascending, then by session type
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
  level: number,
  campaignNonce: bigint | number = 0
): Promise<boolean> {
  const onChainLevel = level + 1; // Convert 0-indexed frontend to 1-indexed on-chain
  return hasCompatibleSessionRuntime(connection, playerPubkey, onChainLevel, campaignNonce);
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
  level: number,
  campaignNonce: bigint | number = 0
): Promise<PublicKey | null> {
  const onChainLevel = level + 1; // Convert 0-indexed frontend to 1-indexed on-chain
  const isCompatible = await hasCompatibleSessionRuntime(connection, playerPubkey, onChainLevel, campaignNonce);
  if (!isCompatible) {
    return null;
  }
  const [sessionPda] = deriveSessionPda(playerPubkey, onChainLevel, campaignNonce);
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
 * @param _enemiesProgram - Unused (kept for API compatibility)
 * @param poisProgram - POI system program
 * @param inventoryProgram - Inventory program
 * @param sessionPda - Session PDA to load
 * @returns Complete session data
 */
export async function switchToSession(
  connection: Connection,
  sessionProgram: Program,
  gameplayProgram: Program,
  _enemiesProgram: Program,
  poisProgram: Program,
  inventoryProgram: Program,
  sessionPda: PublicKey
): Promise<SessionData | null> {
  // Derive all PDAs
  const [gameStatePda] = deriveGameStatePda(sessionPda);
  const [poisPda] = deriveMapPoisPda(sessionPda);
  const [inventoryPda] = deriveInventoryPda(sessionPda);

  // Fetch all accounts in parallel
  const [sessionAccount, gameStateAccount, poisAccount, inventoryAccount] =
    await connection.getMultipleAccountsInfo([
      sessionPda,
      gameStatePda,
      poisPda,
      inventoryPda,
    ]);

  if (!sessionAccount || !gameStateAccount) {
    return null;
  }

  try {
    const session = sessionProgram.coder.accounts.decode('gameSession', sessionAccount.data) as SessionAccount;

    const gameState = gameplayProgram.coder.accounts.decode('gameState', gameStateAccount.data) as GameStateAccount;

    const pois: MapPoisAccount = poisAccount
      ? (poisProgram.coder.accounts.decode('mapPois', poisAccount.data) as MapPoisAccount)
      : { pois: [] };

    const inventory: PlayerInventoryAccount = inventoryAccount
      ? (inventoryProgram.coder.accounts.decode(
          'playerInventory',
          inventoryAccount.data
        ) as PlayerInventoryAccount)
      : { items: [] };

    return {
      session,
      gameState,
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
  poisAccount: Buffer | null;
  inventoryAccount: Buffer | null;
}> {
  const [gameStatePda] = deriveGameStatePda(sessionPda);
  const [poisPda] = deriveMapPoisPda(sessionPda);
  const [inventoryPda] = deriveInventoryPda(sessionPda);

  const accounts = await connection.getMultipleAccountsInfo([
    sessionPda,
    gameStatePda,
    poisPda,
    inventoryPda,
  ]);

  return {
    sessionAccount: accounts[0]?.data ? Buffer.from(accounts[0].data) : null,
    gameStateAccount: accounts[1]?.data ? Buffer.from(accounts[1].data) : null,
    poisAccount: accounts[2]?.data ? Buffer.from(accounts[2].data) : null,
    inventoryAccount: accounts[3]?.data ? Buffer.from(accounts[3].data) : null,
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
  playerPubkey: PublicKey,
  campaignNonce: bigint | number = 0
): Promise<number> {
  const checks: PublicKey[] = [];
  for (let onChainLevel = 1; onChainLevel <= 40; onChainLevel += 1) {
    const [sessionPda] = deriveSessionPda(playerPubkey, onChainLevel, campaignNonce);
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
  playerPubkey: PublicKey,
  campaignNonce: bigint | number = 0
): Promise<number[]> {
  const active: number[] = [];
  for (let onChainLevel = 1; onChainLevel <= 40; onChainLevel += 1) {
    const [sessionPda] = deriveSessionPda(playerPubkey, onChainLevel, campaignNonce);
    const account = await connection.getAccountInfo(sessionPda, 'processed');
    if (account) {
      active.push(onChainLevel);
    }
  }
  return active;
}
