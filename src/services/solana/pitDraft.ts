/**
 * Pit Draft PvP Service Layer
 *
 * Handles all Solana interactions for the Pit Draft PvP mode:
 * - PDA derivation for queue and vault accounts
 * - Transaction building for enter_pit_draft instruction
 * - Event parsing for PitDraftQueued, PitDraftCombatVisual, PitDraftResolved
 * - On-chain item instance to frontend item conversion
 */

import { ComputeBudgetProgram, Connection, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import type { Program } from '@coral-xyz/anchor';
import { SOLANA_CONFIG } from './config';
import {
  GAMEPLAY_STATE_PROGRAM_ID,
  derivePlayerProfilePda,
  derivePitDraftVrfStatePda,
} from './constants';
import { toolToFrontend, gearToFrontend } from '@/data/id-mapping';
import type { Tool, Gear, ToolOil } from '@/game/engine/types';
import { getAllToolDefinitions, getToolStatsAtTier } from '@/game/entities/items';
import { getAllGearDefinitions, RARITY_MULTIPLIER, getTierFromRarity } from '@/data/gear';

// ============================================================================
// Constants
// ============================================================================

export const PIT_DRAFT_ENTRY_LAMPORTS = 100_000_000; // 0.1 SOL

export const COMPANY_TREASURY = new PublicKey('5LvEA4tH5H5DtWCxa3FcauokxAycvafX9ruvcT2mEXt8');

const PIT_DRAFT_QUEUE_SEED = 'pit_draft_queue';
const PIT_DRAFT_VAULT_SEED = 'pit_draft_vault';
const GAUNTLET_POOL_VAULT_SEED = 'gauntlet_pool_vault';
const PIT_DRAFT_CU_LIMIT = 1_400_000;
const PIT_DRAFT_CU_PRICE_MICROLAMPORTS = 1_000;
const TOOL_OIL_FLAG_ATK = 0x01;
const TOOL_OIL_FLAG_SPD = 0x02;
const TOOL_OIL_FLAG_DIG = 0x04;
const TOOL_OIL_FLAG_ARM = 0x08;
const PIT_DRAFT_MAX_START_GOLD = 30;
/** SOL funded to the temp keypair for background VRF TX fees. */
const PIT_DRAFT_VRF_TEMP_FUND_LAMPORTS = 5_000_000; // 0.005 SOL
const U64_MASK = (1n << 64n) - 1n;

// ============================================================================
// PDA Derivation
// ============================================================================

export function derivePitDraftQueuePda(
  programId: PublicKey = GAMEPLAY_STATE_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from(PIT_DRAFT_QUEUE_SEED)], programId);
}

export function derivePitDraftVaultPda(
  programId: PublicKey = GAMEPLAY_STATE_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from(PIT_DRAFT_VAULT_SEED)], programId);
}

export function deriveGauntletPoolVaultPda(
  programId: PublicKey = GAMEPLAY_STATE_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from(GAUNTLET_POOL_VAULT_SEED)], programId);
}

// ============================================================================
// Queue Fetching
// ============================================================================

export interface PitDraftQueueState {
  waitingPlayer: PublicKey | null;
  waitingProfile: PublicKey | null;
  bump: number;
}

export async function fetchPitDraftQueue(
  program: Program
): Promise<PitDraftQueueState | null> {
  try {
    const [queuePda] = derivePitDraftQueuePda();
    const account = await (program.account as Record<string, { fetch: (key: PublicKey) => Promise<Record<string, unknown>> }>).pitDraftQueue.fetch(queuePda);

    return {
      waitingPlayer: (account.waitingPlayer as PublicKey) ?? null,
      waitingProfile: (account.waitingProfile as PublicKey) ?? null,
      bump: account.bump as number,
    };
  } catch (err) {
    // Account not existing is expected when queue hasn't been initialized
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Account does not exist') || msg.includes('could not find account')) {
      console.log('[pitDraft] Queue account not initialized yet');
    } else {
      console.warn('[pitDraft] Failed to fetch queue:', err);
    }
    return null;
  }
}

// ============================================================================
// Transaction Building
// ============================================================================

export async function buildEnterPitDraftTransaction(
  connection: Connection,
  program: Program,
  playerPublicKey: PublicKey,
  matchAccounts?: {
    waitingProfile: PublicKey;
    waitingPlayerWallet: PublicKey;
    vrfStatePda: PublicKey;
  } | null
): Promise<Transaction> {
  const [queuePda] = derivePitDraftQueuePda();
  const [vaultPda] = derivePitDraftVaultPda();
  const [playerProfilePda] = derivePlayerProfilePda(playerPublicKey);

  // When matching, pass all required accounts. When just queuing, pass null for optional accounts.
  const [gauntletPoolVaultPda] = deriveGauntletPoolVaultPda();

  const enterPitDraftIx = await program.methods
    .enterPitDraft()
    .accountsPartial({
      pitDraftQueue: queuePda,
      pitDraftVault: vaultPda,
      player: playerPublicKey,
      playerProfile: playerProfilePda,
      waitingProfile: matchAccounts?.waitingProfile ?? null,
      waitingPlayerWallet: matchAccounts?.waitingPlayerWallet ?? null,
      companyTreasury: matchAccounts ? COMPANY_TREASURY : null,
      gauntletPoolVault: matchAccounts ? gauntletPoolVaultPda : null,
      gameplayVrfState: matchAccounts?.vrfStatePda ?? null,
      systemProgram: SystemProgram.programId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .instruction();

  const transaction = new Transaction();

  // Pit Draft queue entry + optional atomic match+combat can exceed default 200k CU.
  transaction.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: PIT_DRAFT_CU_LIMIT }),
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: PIT_DRAFT_CU_PRICE_MICROLAMPORTS,
    }),
  );

  // Match resolution (second player) builds inventories, generates combat effects,
  // and resolves PvP combat — exceeds the default 32KB heap. Request 256KB.
  if (matchAccounts) {
    transaction.add(
      ComputeBudgetProgram.requestHeapFrame({ bytes: 256 * 1024 }),
    );
  }

  transaction.add(enterPitDraftIx);

  const { blockhash } = await connection.getLatestBlockhash(SOLANA_CONFIG.commitment);
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = playerPublicKey;

  return transaction;
}

/**
 * Build a bundled TX for player 1 (queuing): enter_pit_draft + init VRF + fund temp keypair.
 * All three instructions in a single wallet-signed transaction.
 */
export async function buildQueueWithVrfInitTransaction(
  connection: Connection,
  program: Program,
  playerPublicKey: PublicKey,
  tempKeypairPublicKey: PublicKey,
): Promise<Transaction> {
  const [queuePda] = derivePitDraftQueuePda();
  const [vaultPda] = derivePitDraftVaultPda();
  const [playerProfilePda] = derivePlayerProfilePda(playerPublicKey);
  const [vrfStatePda] = derivePitDraftVrfStatePda(playerPublicKey);

  // 1. enter_pit_draft (queue-only, no match accounts)
  const enterPitDraftIx = await program.methods
    .enterPitDraft()
    .accountsPartial({
      pitDraftQueue: queuePda,
      pitDraftVault: vaultPda,
      player: playerPublicKey,
      playerProfile: playerProfilePda,
      waitingProfile: null,
      waitingPlayerWallet: null,
      companyTreasury: null,
      gauntletPoolVault: null,
      gameplayVrfState: null,
      systemProgram: SystemProgram.programId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .instruction();

  // 2. init_pit_draft_vrf_state (wallet pays rent, init_if_needed)
  const initVrfIx = await program.methods
    .initPitDraftVrfState()
    .accountsPartial({
      payer: playerPublicKey,
      seedKey: playerPublicKey,
      vrfState: vrfStatePda,
      systemProgram: SystemProgram.programId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .instruction();

  // 3. Fund temp keypair for background VRF operations (delegate, request, undelegate)
  const fundTempIx = SystemProgram.transfer({
    fromPubkey: playerPublicKey,
    toPubkey: tempKeypairPublicKey,
    lamports: PIT_DRAFT_VRF_TEMP_FUND_LAMPORTS,
  });

  const transaction = new Transaction();
  transaction.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: PIT_DRAFT_CU_LIMIT }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PIT_DRAFT_CU_PRICE_MICROLAMPORTS }),
    enterPitDraftIx,
    initVrfIx,
    fundTempIx,
  );

  const { blockhash } = await connection.getLatestBlockhash(SOLANA_CONFIG.commitment);
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = playerPublicKey;

  return transaction;
}


// ============================================================================
// Event Types
// ============================================================================

export interface PitDraftQueuedEvent {
  player: PublicKey;
  profile: PublicKey;
  entryLamports: number;
}

export interface PitDraftResolvedEvent {
  playerA: PublicKey;
  playerB: PublicKey;
  winner: PublicKey;
  entryLamports: number;
  totalPot: number;
  winnerPayout: number;
  companyFee: number;
  gauntletFee: number;
  turnsTaken: number;
}

export interface OnChainItemInstance {
  itemId: number[];
  tier: Record<string, object>;
  toolOilFlags: number;
}

export interface PitDraftCombatVisualEvent {
  playerA: PublicKey;
  playerB: PublicKey;
  playerATool: OnChainItemInstance | null;
  playerAGear: (OnChainItemInstance | null)[];
  playerBTool: OnChainItemInstance | null;
  playerBGear: (OnChainItemInstance | null)[];
  playerAGold: number;
  playerBGold: number;
  playerAWon: boolean;
  finalPlayerAHp: number;
  finalPlayerBHp: number;
  turnsTaken: number;
}

export interface PitDraftEventParseResult {
  queued: PitDraftQueuedEvent | null;
  combatVisual: PitDraftCombatVisualEvent | null;
  resolved: PitDraftResolvedEvent | null;
}

// ============================================================================
// Event Parsing
// ============================================================================

// Discriminators from the IDL (sha256("event:<EventName>")[..8])
const PIT_DRAFT_QUEUED_DISC = Buffer.from([66, 238, 37, 54, 83, 248, 251, 246]);
const PIT_DRAFT_COMBAT_VISUAL_DISC = Buffer.from([0, 40, 95, 5, 28, 192, 191, 227]);
const PIT_DRAFT_RESOLVED_DISC = Buffer.from([200, 164, 181, 53, 37, 147, 146, 7]);

/**
 * Parse Pit Draft events from a transaction's logs.
 * Uses manual binary decoding for PitDraftCombatVisual (complex types with Vec + arrays).
 * Uses Anchor decoder for PitDraftQueued and PitDraftResolved.
 */
export function parsePitDraftEventsFromLogs(
  logMessages: string[],
  slot: number
): PitDraftEventParseResult {
  const result: PitDraftEventParseResult = {
    queued: null,
    combatVisual: null,
    resolved: null,
  };

  for (const logLine of logMessages) {
    if (!logLine.startsWith('Program data: ')) continue;
    const base64Data = logLine.slice('Program data: '.length);

    try {
      const buf = Buffer.from(base64Data, 'base64');
      if (buf.length < 8) continue;

      const disc = Buffer.from(buf.subarray(0, 8));
      const data = Buffer.from(buf.subarray(8));

      if (!result.queued && disc.equals(PIT_DRAFT_QUEUED_DISC)) {
        result.queued = decodePitDraftQueued(data);
      } else if (!result.combatVisual && disc.equals(PIT_DRAFT_COMBAT_VISUAL_DISC)) {
        const decoded = decodePitDraftCombatVisual(data);
        if (decoded) {
          const { waitingGold, entrantGold } = derivePitDraftStartGold(
            decoded.playerA,
            decoded.playerB,
            BigInt(slot)
          );
          decoded.playerAGold = waitingGold;
          decoded.playerBGold = entrantGold;
        }
        result.combatVisual = decoded;
      } else if (!result.resolved && disc.equals(PIT_DRAFT_RESOLVED_DISC)) {
        result.resolved = decodePitDraftResolved(data);
      }
    } catch (err) {
      console.warn('[pitDraft] Event decode error:', err);
    }

    if (result.queued || (result.combatVisual && result.resolved)) break;
  }

  return result;
}

export async function parsePitDraftEvents(
  connection: Connection,
  program: Program,
  signature: string
): Promise<PitDraftEventParseResult> {
  const tx = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  if (!tx?.meta?.logMessages) {
    console.warn('[pitDraft] No log messages in transaction');
    return { queued: null, combatVisual: null, resolved: null };
  }

  return parsePitDraftEventsFromLogs(tx.meta.logMessages, tx.slot ?? 0);
}

// ============================================================================
// Manual Binary Decoders
// ============================================================================

const PUBKEY_LEN = 32;

function deriveU64Random(seeds: Uint8Array[]): bigint {
  let acc = 0xcbf29ce484222325n;
  for (const seed of seeds) {
    for (const byte of seed) {
      acc ^= BigInt(byte);
      acc = (acc * 0x10000000001b3n) & U64_MASK;
    }
  }
  acc ^= acc >> 30n;
  acc = (acc * 0xbf58476d1ce4e5b9n) & U64_MASK;
  acc ^= acc >> 27n;
  acc = (acc * 0x94d049bb133111ebn) & U64_MASK;
  return (acc ^ (acc >> 31n)) & U64_MASK;
}

function derivePitDraftStartGold(
  waitingPlayer: PublicKey,
  entrantPlayer: PublicKey,
  slot: bigint
): { waitingGold: number; entrantGold: number } {
  const slotBytes = Buffer.alloc(8);
  slotBytes.writeBigUInt64LE(slot);
  const max = BigInt(PIT_DRAFT_MAX_START_GOLD) + 1n;
  const waitingGold = Number(
    deriveU64Random([
      Buffer.from('pit_waiting_gold'),
      waitingPlayer.toBuffer(),
      entrantPlayer.toBuffer(),
      slotBytes,
    ]) % max
  );
  const entrantGold = Number(
    deriveU64Random([
      Buffer.from('pit_entrant_gold'),
      entrantPlayer.toBuffer(),
      waitingPlayer.toBuffer(),
      slotBytes,
    ]) % max
  );
  return { waitingGold, entrantGold };
}

function decodePitDraftQueued(data: Buffer): PitDraftQueuedEvent | null {
  // player(32) + profile(32) + entry_lamports(8) = 72
  if (data.length < 72) return null;

  const player = new PublicKey(data.subarray(0, 32));
  const profile = new PublicKey(data.subarray(32, 64));
  const entryLamports = Number(data.readBigUInt64LE(64));

  return { player, profile, entryLamports };
}

function decodePitDraftResolved(data: Buffer): PitDraftResolvedEvent | null {
  // player_a(32) + player_b(32) + winner(32) + entry_lamports(8) + total_pot(8) +
  // winner_payout(8) + company_fee(8) + gauntlet_fee(8) + turns_taken(1) = 137
  if (data.length < 137) return null;

  let offset = 0;
  const playerA = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const playerB = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const winner = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const entryLamports = Number(data.readBigUInt64LE(offset));
  offset += 8;
  const totalPot = Number(data.readBigUInt64LE(offset));
  offset += 8;
  const winnerPayout = Number(data.readBigUInt64LE(offset));
  offset += 8;
  const companyFee = Number(data.readBigUInt64LE(offset));
  offset += 8;
  const gauntletFee = Number(data.readBigUInt64LE(offset));
  offset += 8;
  const turnsTaken = data.readUInt8(offset);

  return {
    playerA,
    playerB,
    winner,
    entryLamports,
    totalPot,
    winnerPayout,
    companyFee,
    gauntletFee,
    turnsTaken,
  };
}

/**
 * Decode an Option<ItemInstance> from a buffer.
 * Borsh Option: 1 byte tag (0=None, 1=Some) + optional content.
 * ItemInstance: item_id([u8;8]) + tier(u8 enum) + tool_oil_flags(u8) = 10 bytes
 */
function decodeOptionItemInstance(
  data: Buffer,
  offset: number
): { value: OnChainItemInstance | null; bytesRead: number } {
  const tag = data.readUInt8(offset);
  if (tag === 0) {
    return { value: null, bytesRead: 1 };
  }

  // Some(ItemInstance)
  const itemId = Array.from(data.subarray(offset + 1, offset + 9));
  const tierByte = data.readUInt8(offset + 9);
  const toolOilFlags = data.readUInt8(offset + 10);

  const tierMap: Record<number, string> = { 0: 'i', 1: 'ii', 2: 'iii' };
  const tierKey = tierMap[tierByte] ?? 'i';
  const tier = { [tierKey]: {} };

  return {
    value: { itemId, tier, toolOilFlags },
    bytesRead: 11, // 1 (tag) + 8 (item_id) + 1 (tier) + 1 (tool_oil_flags)
  };
}

/**
 * Decode PitDraftCombatVisual from raw binary data.
 *
 * Layout (after discriminator):
 *   player_a: Pubkey (32)
 *   player_b: Pubkey (32)
 *   player_a_tool: Option<ItemInstance>
 *   player_a_gear: [Option<ItemInstance>; 12]
 *   player_b_tool: Option<ItemInstance>
 *   player_b_gear: [Option<ItemInstance>; 12]
 *   player_a_won: bool (1)
 *   final_player_a_hp: i16 (2)
 *   final_player_b_hp: i16 (2)
 *   turns_taken: u8 (1)
 */
function decodePitDraftCombatVisual(data: Buffer): PitDraftCombatVisualEvent | null {
  try {
    let offset = 0;

    // player_a (32 bytes)
    const playerA = new PublicKey(data.subarray(offset, offset + PUBKEY_LEN));
    offset += PUBKEY_LEN;

    // player_b (32 bytes)
    const playerB = new PublicKey(data.subarray(offset, offset + PUBKEY_LEN));
    offset += PUBKEY_LEN;

    // player_a_tool: Option<ItemInstance>
    const aTool = decodeOptionItemInstance(data, offset);
    offset += aTool.bytesRead;

    // player_a_gear: [Option<ItemInstance>; 12]
    const aGear: (OnChainItemInstance | null)[] = [];
    for (let i = 0; i < 12; i++) {
      const item = decodeOptionItemInstance(data, offset);
      aGear.push(item.value);
      offset += item.bytesRead;
    }

    // player_b_tool: Option<ItemInstance>
    const bTool = decodeOptionItemInstance(data, offset);
    offset += bTool.bytesRead;

    // player_b_gear: [Option<ItemInstance>; 12]
    const bGear: (OnChainItemInstance | null)[] = [];
    for (let i = 0; i < 12; i++) {
      const item = decodeOptionItemInstance(data, offset);
      bGear.push(item.value);
      offset += item.bytesRead;
    }

    // player_a_won: bool (1 byte)
    const playerAWon = data.readUInt8(offset) !== 0;
    offset += 1;

    // final_player_a_hp: i16 (2 bytes)
    const finalPlayerAHp = data.readInt16LE(offset);
    offset += 2;

    // final_player_b_hp: i16 (2 bytes)
    const finalPlayerBHp = data.readInt16LE(offset);
    offset += 2;

    // turns_taken: u8 (1 byte)
    const turnsTaken = data.readUInt8(offset);

    return {
      playerA,
      playerB,
      playerATool: aTool.value,
      playerAGear: aGear,
      playerBTool: bTool.value,
      playerBGear: bGear,
      playerAGold: 0,
      playerBGold: 0,
      playerAWon,
      finalPlayerAHp,
      finalPlayerBHp,
      turnsTaken,
    };
  } catch (err) {
    console.error('[pitDraft] Failed to decode PitDraftCombatVisual:', err);
    return null;
  }
}

// ============================================================================
// Item Instance Conversion
// ============================================================================

/**
 * Decode an on-chain item_id [u8; 8] to a frontend string ID.
 * e.g., [84, 45, 83, 84, 45, 48, 49, 0] -> "T-ST-01"
 */
function decodeItemIdBytes(itemId: number[]): string {
  return String.fromCharCode(...itemId.filter((b) => b !== 0));
}

function tierToRarity(
  tier: Record<string, object>,
  baseRarity: Tool['rarity'] | Gear['baseRarity']
): Tool['rarity'] | Gear['baseRarity'] {
  if ('iii' in tier) return 'DIAMOND';
  if ('ii' in tier) return 'GILDED';
  return baseRarity;
}

function scaleStatsWithRarity(stats: Tool['stats'], rarity: Tool['rarity']): Tool['stats'] {
  const multiplier = RARITY_MULTIPLIER[rarity];
  return {
    atk: stats.atk !== undefined ? Math.floor(stats.atk * multiplier) : stats.atk,
    arm: stats.arm !== undefined ? Math.floor(stats.arm * multiplier) : stats.arm,
    spd: stats.spd !== undefined ? Math.floor(stats.spd * multiplier) : stats.spd,
    dig: stats.dig !== undefined ? Math.floor(stats.dig * multiplier) : stats.dig,
    hp: stats.hp !== undefined ? Math.floor(stats.hp * multiplier) : stats.hp,
  };
}

function getToolOilFromFlags(toolOilFlags: number): ToolOil | null {
  if (toolOilFlags & TOOL_OIL_FLAG_ATK) return 'ATK';
  if (toolOilFlags & TOOL_OIL_FLAG_SPD) return 'SPD';
  if (toolOilFlags & TOOL_OIL_FLAG_DIG) return 'DIG';
  if (toolOilFlags & TOOL_OIL_FLAG_ARM) return 'ARM';
  return null;
}

/**
 * Convert an on-chain ItemInstance to a frontend Tool object.
 */
export function convertItemInstanceToTool(item: OnChainItemInstance): Tool | null {
  const backendId = decodeItemIdBytes(item.itemId);
  const frontendId = toolToFrontend(backendId);
  if (!frontendId) return null;

  const allTools = getAllToolDefinitions();
  const toolDef = allTools.find((t) => t.id === frontendId);
  if (!toolDef) return null;

  const rarity = tierToRarity(item.tier, toolDef.rarity);

  const tier = getTierFromRarity(rarity);

  return {
    id: toolDef.id,
    name: toolDef.name,
    emoji: toolDef.emoji,
    image: toolDef.image,
    stats: { ...getToolStatsAtTier(toolDef.id, tier) },
    rarity,
    tags: toolDef.tags,
    oil: getToolOilFromFlags(item.toolOilFlags),
  };
}

/**
 * Convert an on-chain ItemInstance to a frontend Gear object.
 */
export function convertItemInstanceToGear(item: OnChainItemInstance): Gear | null {
  const backendId = decodeItemIdBytes(item.itemId);
  const frontendId = gearToFrontend(backendId);
  if (!frontendId) return null;

  const allGear = getAllGearDefinitions();
  const gearDef = allGear.find((g) => g.id === frontendId);
  if (!gearDef) return null;

  const currentRarity = tierToRarity(item.tier, gearDef.baseRarity);

  return {
    id: gearDef.id,
    name: gearDef.name,
    emoji: gearDef.emoji,
    image: gearDef.image,
    stats: scaleStatsWithRarity(gearDef.stats, currentRarity),
    baseRarity: gearDef.baseRarity,
    currentRarity,
    tags: gearDef.tags,
  };
}

// ============================================================================
// Error Handling
// ============================================================================

export const PIT_DRAFT_ERROR_MESSAGES: Record<number, string> = {
  6022: "You're already in the queue",
  6023: 'Queue state error. Try again.',
  6024: 'Match setup failed. Try again.',
  6025: 'Cannot match against yourself',
  6026: 'Queue changed. Try again.',
  6027: 'Invalid fee configuration',
  6028: 'Vault error. Contact support.',
  6029: 'Not enough items unlocked for Pit Draft (need 1 tool + 7 gear)',
};

export function getPitDraftErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (
      error.message.includes('exceeded CUs meter') ||
      error.message.includes('Program failed to complete')
    ) {
      return 'Pit Draft transaction exceeded compute budget. Please try again.';
    }
    const match = error.message.match(/custom program error: 0x([0-9a-fA-F]+)/);
    if (match) {
      const errorCode = parseInt(match[1], 16);
      const message = PIT_DRAFT_ERROR_MESSAGES[errorCode];
      if (message) return message;
    }
    if (error.message.includes('insufficient funds')) {
      return 'Insufficient SOL balance for Pit Draft entry (0.1 SOL required).';
    }
  }
  return 'An unexpected error occurred. Please try again.';
}
