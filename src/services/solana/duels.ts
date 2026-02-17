/**
 * Duels PvP Service Layer
 *
 * Handles Solana interactions for seed-scoped Duels:
 * - PDA derivation for queue/vault
 * - Transaction building for enter_duel and finalize_duel_run
 * - Event parsing for DuelQueued, DuelRunFinalized, DuelCombatVisual, DuelResolved
 */

import { ComputeBudgetProgram, Connection, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import type { Program } from '@coral-xyz/anchor';
import { SOLANA_CONFIG } from './config';
import {
  GAMEPLAY_STATE_PROGRAM_ID,
  deriveGeneratedMapPda,
  deriveInventoryPda,
} from './constants';
import type { BackendCombatLogEntry } from './types/combat_events';
import { LogAction } from './types/combat_events';
import type { OnChainItemInstance } from './pitDraft';

export const DUEL_ENTRY_LAMPORTS = 100_000_000; // 0.1 SOL

export const COMPANY_TREASURY = new PublicKey('5LvEA4tH5H5DtWCxa3FcauokxAycvafX9ruvcT2mEXt8');

const DUEL_QUEUE_SEED = 'duel_queue';
const DUEL_VAULT_SEED = 'duel_vault';
const DUEL_OPEN_QUEUE_SEED = 'duel_open_queue';
const GAUNTLET_POOL_VAULT_SEED = 'gauntlet_pool_vault';
const DUEL_CU_LIMIT = 500_000;
const DUEL_CU_PRICE_MICROLAMPORTS = 1_000;

export function deriveDuelQueuePda(
  seed: bigint | number | string,
  programId: PublicKey = GAMEPLAY_STATE_PROGRAM_ID
): [PublicKey, number] {
  const seedValue = typeof seed === 'bigint' ? seed : BigInt(seed);
  const seedBuf = Buffer.alloc(8);
  seedBuf.writeBigUInt64LE(seedValue);
  return PublicKey.findProgramAddressSync([Buffer.from(DUEL_QUEUE_SEED), seedBuf], programId);
}

export function deriveDuelVaultPda(programId: PublicKey = GAMEPLAY_STATE_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from(DUEL_VAULT_SEED)], programId);
}

export function deriveDuelOpenQueuePda(programId: PublicKey = GAMEPLAY_STATE_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from(DUEL_OPEN_QUEUE_SEED)], programId);
}

export function deriveGauntletPoolVaultPda(
  programId: PublicKey = GAMEPLAY_STATE_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from(GAUNTLET_POOL_VAULT_SEED)], programId);
}

export interface DuelParticipantState {
  player: PublicKey;
  session: PublicKey;
  gameState: PublicKey;
  entryLamports: number;
  finalized: boolean;
}

export interface DuelQueueState {
  seed: bigint;
  playerA: DuelParticipantState | null;
  playerB: DuelParticipantState | null;
  bump: number;
}

export interface DuelEntryState {
  player: PublicKey;
  seed: bigint;
  matchedCreatorPlayer: PublicKey | null;
}

export interface DuelOpenCreatorHead {
  seed: bigint;
  player: PublicKey;
}

export async function fetchOldestOpenDuelCreator(
  program: Program
): Promise<DuelOpenCreatorHead | null> {
  try {
    const [openQueuePda] = deriveDuelOpenQueuePda();
    const account = await (
      program.account as Record<string, { fetch: (key: PublicKey) => Promise<Record<string, unknown>> }>
    ).duelOpenQueue.fetch(openQueuePda);
    const entries = account.entries as Array<Record<string, unknown>>;
    const entry = entries?.[0];
    if (!entry) return null;
    return {
      seed: BigInt((entry.seed as bigint | number).toString()),
      player: entry.player as PublicKey,
    };
  } catch {
    return null;
  }
}

export async function fetchDuelQueue(
  program: Program,
  seed: bigint | number | string
): Promise<DuelQueueState | null> {
  try {
    const [queuePda] = deriveDuelQueuePda(seed);
    const account = await (
      program.account as Record<string, { fetch: (key: PublicKey) => Promise<Record<string, unknown>> }>
    ).duelQueue.fetch(queuePda);

    const decodeParticipant = (raw: unknown): DuelParticipantState | null => {
      if (!raw || typeof raw !== 'object') return null;
      const v = raw as Record<string, unknown>;
      return {
        player: v.player as PublicKey,
        session: v.session as PublicKey,
        gameState: v.gameState as PublicKey,
        entryLamports: Number(v.entryLamports as bigint | number),
        finalized: Boolean(v.finalized),
      };
    };

    return {
      seed: BigInt((account.seed as bigint | number).toString()),
      playerA: decodeParticipant(account.playerA),
      playerB: decodeParticipant(account.playerB),
      bump: account.bump as number,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Account does not exist') || msg.includes('could not find account')) {
      return null;
    }
    console.warn('[duels] Failed to fetch duel queue:', err);
    return null;
  }
}

export async function fetchDuelEntry(
  program: Program,
  sessionPda: PublicKey
): Promise<DuelEntryState | null> {
  try {
    const [duelEntryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('duel_entry'), sessionPda.toBuffer()],
      GAMEPLAY_STATE_PROGRAM_ID
    );
    const account = await (
      program.account as Record<string, { fetch: (key: PublicKey) => Promise<Record<string, unknown>> }>
    ).duelEntry.fetch(duelEntryPda);
    const matchedCreator = account.matchedCreator as Record<string, unknown> | null | undefined;
    const matchedCreatorPlayer = matchedCreator ? (matchedCreator.player as PublicKey) : null;
    return {
      player: account.player as PublicKey,
      seed: BigInt((account.seed as bigint | number).toString()),
      matchedCreatorPlayer,
    };
  } catch {
    return null;
  }
}

export async function buildEnterDuelTransaction(
  connection: Connection,
  program: Program,
  playerPublicKey: PublicKey,
  gameStatePda: PublicKey,
  sessionPda: PublicKey,
  seed: bigint
): Promise<Transaction> {
  const [duelOpenQueuePda] = deriveDuelOpenQueuePda();
  const [duelVaultPda] = deriveDuelVaultPda();
  const [gauntletPoolVaultPda] = deriveGauntletPoolVaultPda();
  const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
  const [duelEntryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('duel_entry'), sessionPda.toBuffer()],
    GAMEPLAY_STATE_PROGRAM_ID
  );

  const tx = await (
    program.methods as unknown as {
      enterDuel: (seed: bigint) => {
        accounts: (accounts: {
          duelEntry: PublicKey;
          duelOpenQueue: PublicKey;
          duelVault: PublicKey;
          player: PublicKey;
          gameState: PublicKey;
          generatedMap: PublicKey;
          companyTreasury: PublicKey;
          gauntletPoolVault: PublicKey;
          systemProgram: PublicKey;
        }) => { transaction: () => Promise<Transaction> };
      };
    }
  )
    .enterDuel(seed)
    .accounts({
      duelEntry: duelEntryPda,
      duelOpenQueue: duelOpenQueuePda,
      duelVault: duelVaultPda,
      player: playerPublicKey,
      gameState: gameStatePda,
      generatedMap: generatedMapPda,
      companyTreasury: COMPANY_TREASURY,
      gauntletPoolVault: gauntletPoolVaultPda,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  tx.instructions.unshift(
    ComputeBudgetProgram.setComputeUnitLimit({ units: DUEL_CU_LIMIT }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: DUEL_CU_PRICE_MICROLAMPORTS })
  );

  const { blockhash } = await connection.getLatestBlockhash(SOLANA_CONFIG.commitment);
  tx.recentBlockhash = blockhash;
  tx.feePayer = playerPublicKey;

  return tx;
}

export async function buildInitializeDuelsTransaction(
  connection: Connection,
  program: Program,
  admin: PublicKey
): Promise<Transaction> {
  const [duelVaultPda] = deriveDuelVaultPda();
  const [duelOpenQueuePda] = deriveDuelOpenQueuePda();
  const tx = await (
    program.methods as unknown as {
      initializeDuels: () => {
        accounts: (accounts: {
          duelVault: PublicKey;
          duelOpenQueue: PublicKey;
          admin: PublicKey;
          systemProgram: PublicKey;
        }) => { transaction: () => Promise<Transaction> };
      };
    }
  )
    .initializeDuels()
    .accounts({
      duelVault: duelVaultPda,
      duelOpenQueue: duelOpenQueuePda,
      admin,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  tx.instructions.unshift(
    ComputeBudgetProgram.setComputeUnitLimit({ units: DUEL_CU_LIMIT }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: DUEL_CU_PRICE_MICROLAMPORTS })
  );

  const { blockhash } = await connection.getLatestBlockhash(SOLANA_CONFIG.commitment);
  tx.recentBlockhash = blockhash;
  tx.feePayer = admin;
  return tx;
}

export async function buildInitializeDuelQueueTransaction(
  connection: Connection,
  program: Program,
  admin: PublicKey,
  seed: bigint
): Promise<Transaction> {
  const [duelQueuePda] = deriveDuelQueuePda(seed);
  const tx = await (
    program.methods as unknown as {
      initializeDuelQueue: (seed: bigint) => {
        accounts: (accounts: {
          duelQueue: PublicKey;
          admin: PublicKey;
          systemProgram: PublicKey;
        }) => { transaction: () => Promise<Transaction> };
      };
    }
  )
    .initializeDuelQueue(seed)
    .accounts({
      duelQueue: duelQueuePda,
      admin,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  tx.instructions.unshift(
    ComputeBudgetProgram.setComputeUnitLimit({ units: DUEL_CU_LIMIT }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: DUEL_CU_PRICE_MICROLAMPORTS })
  );

  const { blockhash } = await connection.getLatestBlockhash(SOLANA_CONFIG.commitment);
  tx.recentBlockhash = blockhash;
  tx.feePayer = admin;
  return tx;
}

export async function buildFinalizeDuelRunTransaction(
  connection: Connection,
  program: Program,
  playerPublicKey: PublicKey,
  gameStatePda: PublicKey,
  sessionPda: PublicKey,
  seed: bigint,
  creatorWallet?: PublicKey | null
): Promise<Transaction> {
  const [duelOpenQueuePda] = deriveDuelOpenQueuePda();
  const [duelVaultPda] = deriveDuelVaultPda();
  const [gauntletPoolVaultPda] = deriveGauntletPoolVaultPda();
  const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
  const [inventoryPda] = deriveInventoryPda(sessionPda);
  const [duelEntryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('duel_entry'), sessionPda.toBuffer()],
    GAMEPLAY_STATE_PROGRAM_ID
  );

  const tx = await (
    program.methods as unknown as {
      finalizeDuelRun: (seed: bigint) => {
        accounts: (accounts: {
          duelEntry: PublicKey;
          duelOpenQueue: PublicKey;
          duelVault: PublicKey;
          player: PublicKey;
          gameState: PublicKey;
          inventory: PublicKey;
          generatedMap: PublicKey;
          creatorWallet?: PublicKey | null;
          companyTreasury: PublicKey;
          gauntletPoolVault: PublicKey;
        }) => { transaction: () => Promise<Transaction> };
      };
    }
  )
    .finalizeDuelRun(seed)
    .accounts({
      duelEntry: duelEntryPda,
      duelOpenQueue: duelOpenQueuePda,
      duelVault: duelVaultPda,
      player: playerPublicKey,
      gameState: gameStatePda,
      inventory: inventoryPda,
      generatedMap: generatedMapPda,
      creatorWallet: creatorWallet ?? null,
      companyTreasury: COMPANY_TREASURY,
      gauntletPoolVault: gauntletPoolVaultPda,
    })
    .transaction();

  tx.instructions.unshift(
    ComputeBudgetProgram.setComputeUnitLimit({ units: DUEL_CU_LIMIT }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: DUEL_CU_PRICE_MICROLAMPORTS })
  );

  const { blockhash } = await connection.getLatestBlockhash(SOLANA_CONFIG.commitment);
  tx.recentBlockhash = blockhash;
  tx.feePayer = playerPublicKey;

  return tx;
}

export type DuelResolution =
  | 'completedCombat'
  | 'opponentEliminated'
  | 'unmatchedEliminated'
  | 'bothEliminated';

export interface DuelQueuedEvent {
  seed: bigint;
  player: PublicKey;
  gameState: PublicKey;
  entryLamports: number;
  slot: number;
}

export interface DuelRunFinalizedEvent {
  seed: bigint;
  player: PublicKey;
  completedWeek3: boolean;
  finalWeek: number;
}

export interface DuelCombatVisualEvent {
  seed: bigint;
  playerA: PublicKey;
  playerB: PublicKey;
  playerATool: OnChainItemInstance | null;
  playerAGear: (OnChainItemInstance | null)[];
  playerBTool: OnChainItemInstance | null;
  playerBGear: (OnChainItemInstance | null)[];
  combatLog: BackendCombatLogEntry[];
  playerAWon: boolean;
  finalPlayerAHp: number;
  finalPlayerBHp: number;
  turnsTaken: number;
}

export interface DuelResolvedEvent {
  seed: bigint;
  playerA: PublicKey;
  playerB: PublicKey | null;
  winner: PublicKey | null;
  totalPot: number;
  winnerPayout: number;
  companyFee: number;
  gauntletFee: number;
  resolution: DuelResolution;
  turnsTaken: number | null;
}

export interface DuelEventParseResult {
  queued: DuelQueuedEvent | null;
  runFinalized: DuelRunFinalizedEvent | null;
  combatVisual: DuelCombatVisualEvent | null;
  resolved: DuelResolvedEvent | null;
}

const DUEL_COMBAT_VISUAL_DISC = Buffer.from([11, 36, 212, 224, 39, 220, 124, 50]);
const DUEL_QUEUED_DISC = Buffer.from([193, 135, 65, 234, 185, 110, 34, 44]);
const DUEL_RESOLVED_DISC = Buffer.from([224, 245, 214, 212, 111, 151, 50, 5]);
const DUEL_RUN_FINALIZED_DISC = Buffer.from([147, 189, 241, 126, 243, 108, 13, 76]);
const PUBKEY_LEN = 32;

export async function parseDuelEvents(
  connection: Connection,
  _program: Program,
  signature: string
): Promise<DuelEventParseResult> {
  const result: DuelEventParseResult = {
    queued: null,
    runFinalized: null,
    combatVisual: null,
    resolved: null,
  };

  const tx = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  if (!tx?.meta?.logMessages) {
    return result;
  }

  for (const logLine of tx.meta.logMessages) {
    if (!logLine.startsWith('Program data: ')) continue;
    const base64Data = logLine.slice('Program data: '.length);

    try {
      const buf = Buffer.from(base64Data, 'base64');
      if (buf.length < 8) continue;

      const disc = buf.subarray(0, 8);
      const data = buf.subarray(8);

      if (!result.queued && disc.equals(DUEL_QUEUED_DISC)) {
        result.queued = decodeDuelQueued(data);
      } else if (!result.runFinalized && disc.equals(DUEL_RUN_FINALIZED_DISC)) {
        result.runFinalized = decodeDuelRunFinalized(data);
      } else if (!result.combatVisual && disc.equals(DUEL_COMBAT_VISUAL_DISC)) {
        result.combatVisual = decodeDuelCombatVisual(data);
      } else if (!result.resolved && disc.equals(DUEL_RESOLVED_DISC)) {
        result.resolved = decodeDuelResolved(data);
      }
    } catch (err) {
      console.warn('[duels] Failed to decode event line:', err);
    }

    if (result.resolved && (result.combatVisual || result.runFinalized || result.queued)) {
      break;
    }
  }

  return result;
}

function decodeDuelQueued(data: Buffer): DuelQueuedEvent | null {
  if (data.length < 81) return null;
  let offset = 0;
  const seed = data.readBigUInt64LE(offset);
  offset += 8;
  const player = new PublicKey(data.subarray(offset, offset + PUBKEY_LEN));
  offset += PUBKEY_LEN;
  const gameState = new PublicKey(data.subarray(offset, offset + PUBKEY_LEN));
  offset += PUBKEY_LEN;
  const entryLamports = Number(data.readBigUInt64LE(offset));
  offset += 8;
  const slot = data.readUInt8(offset);

  return { seed, player, gameState, entryLamports, slot };
}

function decodeDuelRunFinalized(data: Buffer): DuelRunFinalizedEvent | null {
  if (data.length < 42) return null;
  let offset = 0;
  const seed = data.readBigUInt64LE(offset);
  offset += 8;
  const player = new PublicKey(data.subarray(offset, offset + PUBKEY_LEN));
  offset += PUBKEY_LEN;
  const completedWeek3 = data.readUInt8(offset) !== 0;
  offset += 1;
  const finalWeek = data.readUInt8(offset);

  return { seed, player, completedWeek3, finalWeek };
}

function decodeOptionPubkey(
  data: Buffer,
  offset: number
): { value: PublicKey | null; bytesRead: number } {
  const tag = data.readUInt8(offset);
  if (tag === 0) {
    return { value: null, bytesRead: 1 };
  }

  return {
    value: new PublicKey(data.subarray(offset + 1, offset + 1 + PUBKEY_LEN)),
    bytesRead: 1 + PUBKEY_LEN,
  };
}

function decodeOptionU8(data: Buffer, offset: number): { value: number | null; bytesRead: number } {
  const tag = data.readUInt8(offset);
  if (tag === 0) {
    return { value: null, bytesRead: 1 };
  }

  return {
    value: data.readUInt8(offset + 1),
    bytesRead: 2,
  };
}

function decodeOptionItemInstance(
  data: Buffer,
  offset: number
): { value: OnChainItemInstance | null; bytesRead: number } {
  const tag = data.readUInt8(offset);
  if (tag === 0) {
    return { value: null, bytesRead: 1 };
  }

  const itemId = Array.from(data.subarray(offset + 1, offset + 9));
  const tierByte = data.readUInt8(offset + 9);
  const toolOilFlags = data.readUInt8(offset + 10);

  const tierMap: Record<number, string> = { 0: 'i', 1: 'ii', 2: 'iii' };
  const tier = { [tierMap[tierByte] ?? 'i']: {} };

  return {
    value: { itemId, tier, toolOilFlags },
    bytesRead: 11,
  };
}

function decodeDuelCombatVisual(data: Buffer): DuelCombatVisualEvent | null {
  try {
    let offset = 0;

    const seed = data.readBigUInt64LE(offset);
    offset += 8;

    const playerA = new PublicKey(data.subarray(offset, offset + PUBKEY_LEN));
    offset += PUBKEY_LEN;
    const playerB = new PublicKey(data.subarray(offset, offset + PUBKEY_LEN));
    offset += PUBKEY_LEN;

    const aTool = decodeOptionItemInstance(data, offset);
    offset += aTool.bytesRead;

    const aGear: (OnChainItemInstance | null)[] = [];
    for (let i = 0; i < 12; i++) {
      const entry = decodeOptionItemInstance(data, offset);
      aGear.push(entry.value);
      offset += entry.bytesRead;
    }

    const bTool = decodeOptionItemInstance(data, offset);
    offset += bTool.bytesRead;

    const bGear: (OnChainItemInstance | null)[] = [];
    for (let i = 0; i < 12; i++) {
      const entry = decodeOptionItemInstance(data, offset);
      bGear.push(entry.value);
      offset += entry.bytesRead;
    }

    const logCount = data.readUInt32LE(offset);
    offset += 4;

    const combatLog: BackendCombatLogEntry[] = [];
    for (let i = 0; i < logCount; i++) {
      combatLog.push({
        turn: data.readUInt8(offset),
        isPlayer: data.readUInt8(offset + 1) !== 0,
        action: data.readUInt8(offset + 2) as LogAction,
        value: data.readInt16LE(offset + 3),
        extra: data.readUInt8(offset + 5),
      });
      offset += 6;
    }

    // combat_log_truncated: bool (1 byte)
    offset += 1;
    // combat_log_total_entries: u16 (2 bytes)
    offset += 2;

    const playerAWon = data.readUInt8(offset) !== 0;
    offset += 1;
    const finalPlayerAHp = data.readInt16LE(offset);
    offset += 2;
    const finalPlayerBHp = data.readInt16LE(offset);
    offset += 2;
    const turnsTaken = data.readUInt8(offset);

    return {
      seed,
      playerA,
      playerB,
      playerATool: aTool.value,
      playerAGear: aGear,
      playerBTool: bTool.value,
      playerBGear: bGear,
      combatLog,
      playerAWon,
      finalPlayerAHp,
      finalPlayerBHp,
      turnsTaken,
    };
  } catch (err) {
    console.error('[duels] Failed to decode DuelCombatVisual:', err);
    return null;
  }
}

function decodeResolution(tag: number): DuelResolution | null {
  if (tag === 0) return 'completedCombat';
  if (tag === 1) return 'opponentEliminated';
  if (tag === 2) return 'unmatchedEliminated';
  if (tag === 3) return 'bothEliminated';
  return null;
}

function decodeDuelResolved(data: Buffer): DuelResolvedEvent | null {
  try {
    let offset = 0;

    const seed = data.readBigUInt64LE(offset);
    offset += 8;
    const playerA = new PublicKey(data.subarray(offset, offset + PUBKEY_LEN));
    offset += PUBKEY_LEN;

    const playerB = decodeOptionPubkey(data, offset);
    offset += playerB.bytesRead;
    const winner = decodeOptionPubkey(data, offset);
    offset += winner.bytesRead;

    const totalPot = Number(data.readBigUInt64LE(offset));
    offset += 8;
    const winnerPayout = Number(data.readBigUInt64LE(offset));
    offset += 8;
    const companyFee = Number(data.readBigUInt64LE(offset));
    offset += 8;
    const gauntletFee = Number(data.readBigUInt64LE(offset));
    offset += 8;

    const resolutionRaw = data.readUInt8(offset);
    offset += 1;
    const resolution = decodeResolution(resolutionRaw);
    if (!resolution) return null;

    const turnsTaken = decodeOptionU8(data, offset);

    return {
      seed,
      playerA,
      playerB: playerB.value,
      winner: winner.value,
      totalPot,
      winnerPayout,
      companyFee,
      gauntletFee,
      resolution,
      turnsTaken: turnsTaken.value,
    };
  } catch (err) {
    console.error('[duels] Failed to decode DuelResolved:', err);
    return null;
  }
}

export const DUELS_ERROR_MESSAGES: Record<number, string> = {
  6030: "You're already queued for this duel seed",
  6031: 'Duel queue is full for this seed',
  6032: 'Your run is not finished yet',
  6033: 'Seed mismatch between session and duel queue',
  6034: 'You are not queued in this duel',
  6035: 'Session mismatch for queued duel participant',
  6036: 'Cannot match against yourself',
  6037: 'Invalid duel fee configuration',
  6038: 'Missing duel wallet account for payout',
  6039: 'Duel queue is in an invalid state',
};

export function getDuelsErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (
      error.message.includes('exceeded CUs meter') ||
      error.message.includes('Program failed to complete')
    ) {
      return 'Duel transaction exceeded compute budget. Please try again.';
    }
    const match = error.message.match(/custom program error: 0x([0-9a-fA-F]+)/);
    if (match) {
      const errorCode = parseInt(match[1], 16);
      const message = DUELS_ERROR_MESSAGES[errorCode];
      if (message) return message;
    }
    if (error.message.includes('insufficient funds')) {
      return 'Insufficient SOL balance for Duels entry (0.1 SOL required).';
    }
  }
  return 'An unexpected error occurred. Please try again.';
}
