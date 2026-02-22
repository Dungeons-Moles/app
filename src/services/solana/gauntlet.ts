import { ComputeBudgetProgram, Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import type { Program } from '@coral-xyz/anchor';
import BN from 'bn.js';
import { SOLANA_CONFIG } from './config';
import {
  GAMEPLAY_STATE_PROGRAM_ID,
  deriveInventoryPda,
} from './constants';
import type { BackendCombatLogEntry } from './types/combat_events';
import { LogAction } from './types/combat_events';
import type { OnChainItemInstance } from './pitDraft';

export const GAUNTLET_ENTRY_LAMPORTS = 10_000_000; // 0.01 SOL
export const COMPANY_TREASURY = new PublicKey('5LvEA4tH5H5DtWCxa3FcauokxAycvafX9ruvcT2mEXt8');

const GAUNTLET_CONFIG_SEED = 'gauntlet_config';
const GAUNTLET_POOL_VAULT_SEED = 'gauntlet_pool_vault';
const GAUNTLET_WEEK_POOL_SEED = 'gauntlet_week_pool';
const GAUNTLET_EPOCH_POOL_SEED = 'gauntlet_epoch_pool';
const GAUNTLET_PLAYER_SCORE_SEED = 'gauntlet_player_score';
const GAUNTLET_COMBAT_VISUAL_DISC = Buffer.from([132, 232, 40, 83, 206, 86, 46, 58]);
const GAUNTLET_RUN_ENDED_DISC = Buffer.from([36, 102, 1, 250, 202, 105, 54, 159]);
const GAUNTLET_WEEK_ADVANCED_DISC = Buffer.from([19, 89, 61, 105, 33, 240, 42, 100]);
const GAUNTLET_WEEK_ECHO_SELECTED_DISC = Buffer.from([205, 91, 189, 92, 175, 108, 93, 119]);
const PUBKEY_LEN = 32;
const ITEM_OPTION_SIZE = 11;
const ENTRY_SIZE = 6;
const ENTER_CU_LIMIT = 500_000;
const INITIALIZE_CU_LIMIT = 1_400_000;
const LOCAL_FEE_ACCOUNT_AIRDROP_LAMPORTS = 1_000_000;

export interface GauntletCombatVisualEvent {
  player: PublicKey;
  week: number;
  playerTool: OnChainItemInstance | null;
  playerGear: (OnChainItemInstance | null)[];
  echoTool: OnChainItemInstance | null;
  echoGear: (OnChainItemInstance | null)[];
  combatLog: BackendCombatLogEntry[];
  playerWon: boolean;
  finalPlayerHp: number;
  finalEchoHp: number;
  turnsTaken: number;
}

export interface GauntletRunEndedEvent {
  player: PublicKey;
  week: number;
  completed: boolean;
}

export interface GauntletWeekAdvancedEvent {
  player: PublicKey;
  newWeek: number;
  completed: boolean;
}

export interface GauntletWeekEchoSelectedEvent {
  player: PublicKey;
  week: number;
  sourcePlayer: PublicKey | null;
}

export interface GauntletEventParseResult {
  combatVisual: GauntletCombatVisualEvent | null;
  runEnded: GauntletRunEndedEvent | null;
  weekAdvanced: GauntletWeekAdvancedEvent | null;
  weekEchoSelected: GauntletWeekEchoSelectedEvent | null;
}

export interface GauntletWeekEchoPreview {
  week: number;
  sourcePlayer: PublicKey | null;
  isBootstrap: boolean;
  tool: OnChainItemInstance | null;
  gear: (OnChainItemInstance | null)[];
  goldAtBattleStart: number;
}

export async function ensureLocalFeeAccounts(connection: Connection): Promise<void> {
  if (!SOLANA_CONFIG.isLocalValidator) return;

  const treasury = await connection.getAccountInfo(COMPANY_TREASURY, SOLANA_CONFIG.commitment);
  if (!treasury) {
    const sig = await connection.requestAirdrop(COMPANY_TREASURY, LOCAL_FEE_ACCOUNT_AIRDROP_LAMPORTS);
    await connection.confirmTransaction(sig, SOLANA_CONFIG.commitment);
  }
}

export function deriveGauntletConfigPda(programId: PublicKey = GAMEPLAY_STATE_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from(GAUNTLET_CONFIG_SEED)], programId);
}

export function deriveGauntletPoolVaultPda(programId: PublicKey = GAMEPLAY_STATE_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from(GAUNTLET_POOL_VAULT_SEED)], programId);
}

export function deriveGauntletWeekPoolPda(week: number, programId: PublicKey = GAMEPLAY_STATE_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(GAUNTLET_WEEK_POOL_SEED), Buffer.from([week])],
    programId
  );
}

export function deriveGauntletEpochPoolPda(epochId: bigint, programId: PublicKey = GAMEPLAY_STATE_PROGRAM_ID): [PublicKey, number] {
  const epochBytes = Buffer.alloc(8);
  epochBytes.writeBigUInt64LE(epochId);
  return PublicKey.findProgramAddressSync([Buffer.from(GAUNTLET_EPOCH_POOL_SEED), epochBytes], programId);
}

export function deriveGauntletPlayerScorePda(
  epochId: bigint,
  player: PublicKey,
  programId: PublicKey = GAMEPLAY_STATE_PROGRAM_ID
): [PublicKey, number] {
  const epochBytes = Buffer.alloc(8);
  epochBytes.writeBigUInt64LE(epochId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from(GAUNTLET_PLAYER_SCORE_SEED), epochBytes, player.toBuffer()],
    programId
  );
}

const U64_MASK = (1n << 64n) - 1n;

function normalizeTier(tier: unknown): Record<string, object> {
  if (typeof tier === 'string') {
    if (tier === 'iii') return { iii: {} };
    if (tier === 'ii') return { ii: {} };
    if (tier === 'i') return { i: {} };
  }
  if (tier && typeof tier === 'object') {
    const t = tier as Record<string, unknown>;
    if ('iii' in t) return { iii: {} };
    if ('ii' in t) return { ii: {} };
    if ('i' in t) return { i: {} };
  }
  return { i: {} };
}

function unwrapAnchorOption(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return value;
  const v = value as Record<string, unknown>;
  if ('none' in v) return null;
  if ('some' in v) return v.some ?? null;
  return value;
}

function normalizeItemInstance(raw: unknown): OnChainItemInstance | null {
  const unwrapped = unwrapAnchorOption(raw);
  if (!unwrapped || typeof unwrapped !== 'object') return null;
  const r = unwrapped as Record<string, unknown>;
  const itemIdRaw = r.itemId ?? r.item_id;
  if (!itemIdRaw) return null;

  let itemId: number[] = [];
  if (Array.isArray(itemIdRaw)) {
    itemId = itemIdRaw.map((v) => Number(v) & 0xff);
  } else if (itemIdRaw instanceof Uint8Array || Buffer.isBuffer(itemIdRaw)) {
    itemId = Array.from(itemIdRaw);
  } else if (itemIdRaw && typeof itemIdRaw === 'object') {
    const asObj = itemIdRaw as Record<string, unknown>;
    const numericEntries = Object.keys(asObj)
      .filter((k) => /^\d+$/.test(k))
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => Number(asObj[k]) & 0xff);
    itemId = numericEntries;
  }
  if (itemId.length === 0) return null;

  const tier = normalizeTier(r.tier);
  const toolOilRaw = r.toolOilFlags ?? r.tool_oil_flags ?? 0;
  const toolOilFlags =
    typeof toolOilRaw === 'bigint'
      ? Number(toolOilRaw & 0xffn)
      : Number(
          typeof toolOilRaw === 'object' && toolOilRaw !== null
            ? (toolOilRaw as { toString?: () => string }).toString?.() ?? 0
            : toolOilRaw
        ) & 0xff;
  return { itemId, tier, toolOilFlags };
}

function parseOptionalPubkey(value: unknown): PublicKey | null {
  const unwrapped = unwrapAnchorOption(value);
  if (!unwrapped) return null;
  if (unwrapped instanceof PublicKey) return unwrapped;
  if (typeof unwrapped === 'string') {
    try {
      return new PublicKey(unwrapped);
    } catch {
      return null;
    }
  }
  if (Array.isArray(unwrapped)) {
    return unwrapped.length > 0 ? parseOptionalPubkey(unwrapped[0]) : null;
  }
  if (typeof unwrapped === 'object') {
    const v = unwrapped as Record<string, unknown>;
    if (typeof (v as { toBase58?: unknown }).toBase58 === 'function') {
      try {
        return new PublicKey((v as { toBase58: () => string }).toBase58());
      } catch {
        return null;
      }
    }
    if ('player' in v) return parseOptionalPubkey(v.player);
    if ('value' in v) return parseOptionalPubkey(v.value);
    if (0 in v) return parseOptionalPubkey(v[0]);
  }
  return null;
}

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

export async function fetchGauntletWeekEchoPreview(
  program: Program,
  params: {
    week: number;
    session: PublicKey;
    player: PublicKey;
  }
): Promise<GauntletWeekEchoPreview | null> {
  const week = Math.max(1, Math.min(5, params.week));
  const [weekPoolPda] = deriveGauntletWeekPoolPda(week);
  const weekPool = await (
    program.account as {
      gauntletWeekPool: { fetch: (address: PublicKey) => Promise<Record<string, unknown>> };
    }
  ).gauntletWeekPool.fetch(weekPoolPda);

  const entries = Array.isArray(weekPool.entries) ? weekPool.entries : [];
  if (entries.length === 0) return null;

  const rand = deriveU64Random([
    Buffer.from('gauntlet_draw'),
    Buffer.from([week]),
    params.session.toBuffer(),
    params.player.toBuffer(),
  ]);
  const index = Number(rand % BigInt(entries.length));
  const selected = entries[index] as Record<string, unknown>;

  const source = unwrapAnchorOption(selected.source) as Record<string, unknown> | null;
  const hasPlayerSource = !!source && 'player' in source;
  const sourcePlayer = hasPlayerSource ? parseOptionalPubkey(source.player) : null;
  const isBootstrap = !hasPlayerSource || sourcePlayer === null;

  const loadout = (selected.loadout as Record<string, unknown> | undefined) ?? {};
  const tool = normalizeItemInstance(loadout.tool);
  const gearRaw = Array.isArray(loadout.gear) ? loadout.gear : [];
  const gear: (OnChainItemInstance | null)[] = [];
  for (let i = 0; i < 12; i++) {
    gear.push(normalizeItemInstance(gearRaw[i] ?? null));
  }

  console.log('[gauntlet] fetchGauntletWeekEchoPreview:selected', {
    week,
    entries: entries.length,
    index,
    hasPlayerSource: hasPlayerSource,
    sourcePlayer: sourcePlayer?.toBase58?.() ?? null,
    toolDecoded: !!tool,
    gearDecodedCount: gear.filter((g) => g !== null).length,
  });

  return {
    week,
    sourcePlayer,
    isBootstrap,
    tool,
    gear,
    goldAtBattleStart: Number(loadout.goldAtBattleStart ?? loadout.gold_at_battle_start ?? 0),
  };
}

/**
 * Reads the echo for a given week directly from the game state's gauntletEchoes field.
 * This is the correct source of truth — the echoes are drawn at enter_gauntlet time and
 * stored in the game state. Reading from the week pool can return stale/different data
 * if the pool was reinitialized or modified after the echo was drawn.
 */
export async function fetchGauntletEchoFromGameState(
  program: Program,
  gameStatePda: PublicKey,
  week: number
): Promise<GauntletWeekEchoPreview | null> {
  const clampedWeek = Math.max(1, Math.min(5, week));
  const raw = await (
    program.account as {
      gameState: { fetch: (address: PublicKey) => Promise<Record<string, unknown>> };
    }
  ).gameState.fetch(gameStatePda);

  const echoes = raw.gauntletEchoes as unknown[] | undefined;
  if (!Array.isArray(echoes)) return null;

  const echoRaw = unwrapAnchorOption(echoes[clampedWeek - 1]);
  if (!echoRaw || typeof echoRaw !== 'object') return null;

  const echo = echoRaw as Record<string, unknown>;
  const source = unwrapAnchorOption(echo.source) as Record<string, unknown> | null;
  const hasPlayerSource = !!source && 'player' in source;
  const sourcePlayer = hasPlayerSource ? parseOptionalPubkey(source.player) : null;
  const isBootstrap = !hasPlayerSource || sourcePlayer === null;

  const loadout = (echo.loadout as Record<string, unknown> | undefined) ?? {};
  const tool = normalizeItemInstance(loadout.tool);
  const gearRaw = Array.isArray(loadout.gear) ? loadout.gear : [];
  const gear: (OnChainItemInstance | null)[] = [];
  for (let i = 0; i < 12; i++) {
    gear.push(normalizeItemInstance(gearRaw[i] ?? null));
  }

  console.log('[gauntlet] fetchGauntletEchoFromGameState', {
    week: clampedWeek,
    isBootstrap,
    sourcePlayer: sourcePlayer?.toBase58?.() ?? null,
    toolDecoded: !!tool,
    gearDecodedCount: gear.filter((g) => g !== null).length,
  });

  return {
    week: clampedWeek,
    sourcePlayer,
    isBootstrap,
    tool,
    gear,
    goldAtBattleStart: Number(loadout.goldAtBattleStart ?? loadout.gold_at_battle_start ?? 0),
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
  const tierKey = tierMap[tierByte] ?? 'i';

  return {
    value: { itemId, tier: { [tierKey]: {} }, toolOilFlags },
    bytesRead: ITEM_OPTION_SIZE,
  };
}

function decodeGauntletCombatVisual(data: Buffer): GauntletCombatVisualEvent | null {
  try {
    let offset = 0;
    const player = new PublicKey(data.subarray(offset, offset + PUBKEY_LEN));
    offset += PUBKEY_LEN;
    const week = data.readUInt8(offset);
    offset += 1;

    const playerToolDecoded = decodeOptionItemInstance(data, offset);
    offset += playerToolDecoded.bytesRead;

    const playerGear: (OnChainItemInstance | null)[] = [];
    for (let i = 0; i < 12; i++) {
      const decoded = decodeOptionItemInstance(data, offset);
      playerGear.push(decoded.value);
      offset += decoded.bytesRead;
    }

    const echoToolDecoded = decodeOptionItemInstance(data, offset);
    offset += echoToolDecoded.bytesRead;

    const echoGear: (OnChainItemInstance | null)[] = [];
    for (let i = 0; i < 12; i++) {
      const decoded = decodeOptionItemInstance(data, offset);
      echoGear.push(decoded.value);
      offset += decoded.bytesRead;
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
      offset += ENTRY_SIZE;
    }

    // combat_log_truncated: bool (1 byte)
    offset += 1;
    // combat_log_total_entries: u16 (2 bytes)
    offset += 2;

    const playerWon = data.readUInt8(offset) !== 0;
    offset += 1;
    const finalPlayerHp = data.readInt16LE(offset);
    offset += 2;
    const finalEchoHp = data.readInt16LE(offset);
    offset += 2;
    const turnsTaken = data.readUInt8(offset);

    return {
      player,
      week,
      playerTool: playerToolDecoded.value,
      playerGear,
      echoTool: echoToolDecoded.value,
      echoGear,
      combatLog,
      playerWon,
      finalPlayerHp,
      finalEchoHp,
      turnsTaken,
    };
  } catch (error) {
    console.warn('[gauntlet] Failed to decode GauntletCombatVisual event:', error);
    return null;
  }
}

function decodeGauntletRunEnded(data: Buffer): GauntletRunEndedEvent | null {
  if (data.length < 34) return null;
  const player = new PublicKey(data.subarray(0, 32));
  const week = data.readUInt8(32);
  const completed = data.readUInt8(33) !== 0;
  return { player, week, completed };
}

function decodeGauntletWeekAdvanced(data: Buffer): GauntletWeekAdvancedEvent | null {
  if (data.length < 34) return null;
  const player = new PublicKey(data.subarray(0, 32));
  const newWeek = data.readUInt8(32);
  const completed = data.readUInt8(33) !== 0;
  return { player, newWeek, completed };
}

function decodeGauntletWeekEchoSelected(data: Buffer): GauntletWeekEchoSelectedEvent | null {
  if (data.length < 35) return null;
  let offset = 0;
  const player = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const week = data.readUInt8(offset);
  offset += 1;
  const hasSource = data.readUInt8(offset) !== 0;
  offset += 1;
  const sourcePlayer = hasSource ? new PublicKey(data.subarray(offset, offset + 32)) : null;
  return { player, week, sourcePlayer };
}

export async function parseGauntletCombatVisualEvent(
  connection: Connection,
  signature: string
): Promise<GauntletCombatVisualEvent | null> {
  const parsed = await parseGauntletEvents(connection, signature);
  return parsed.combatVisual;
}

export async function parseGauntletEvents(
  connection: Connection,
  signature: string
): Promise<GauntletEventParseResult> {
  const tx = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  const result: GauntletEventParseResult = {
    combatVisual: null,
    runEnded: null,
    weekAdvanced: null,
    weekEchoSelected: null,
  };

  if (!tx?.meta?.logMessages) {
    return result;
  }

  for (const logLine of tx.meta.logMessages) {
    if (!logLine.startsWith('Program data: ')) continue;
    const buf = Buffer.from(logLine.slice('Program data: '.length), 'base64');
    if (buf.length < 8) continue;
    const disc = buf.subarray(0, 8);
    const data = buf.subarray(8);

    if (!result.combatVisual && disc.equals(GAUNTLET_COMBAT_VISUAL_DISC)) {
      result.combatVisual = decodeGauntletCombatVisual(data);
      continue;
    }
    if (!result.runEnded && disc.equals(GAUNTLET_RUN_ENDED_DISC)) {
      result.runEnded = decodeGauntletRunEnded(data);
      continue;
    }
    if (!result.weekAdvanced && disc.equals(GAUNTLET_WEEK_ADVANCED_DISC)) {
      result.weekAdvanced = decodeGauntletWeekAdvanced(data);
      continue;
    }
    if (!result.weekEchoSelected && disc.equals(GAUNTLET_WEEK_ECHO_SELECTED_DISC)) {
      result.weekEchoSelected = decodeGauntletWeekEchoSelected(data);
      continue;
    }
  }

  return result;
}

export async function buildEnterGauntletInstruction(
  program: Program,
  playerPublicKey: PublicKey,
  gameStatePda: PublicKey,
  epochIdBN: BN,
  epochIdBigInt: bigint
): Promise<TransactionInstruction> {
  const [gauntletConfigPda] = deriveGauntletConfigPda();
  const [gauntletPoolVaultPda] = deriveGauntletPoolVaultPda();
  const [epochPoolPda] = deriveGauntletEpochPoolPda(epochIdBigInt);
  const [playerScorePda] = deriveGauntletPlayerScorePda(epochIdBigInt, playerPublicKey);

  const [week1] = deriveGauntletWeekPoolPda(1);
  const [week2] = deriveGauntletWeekPoolPda(2);
  const [week3] = deriveGauntletWeekPoolPda(3);
  const [week4] = deriveGauntletWeekPoolPda(4);
  const [week5] = deriveGauntletWeekPoolPda(5);

  const tx = await (
    program.methods as unknown as {
      enterGauntlet: (epochId: BN) => {
        accounts: (accounts: {
          gameState: PublicKey;
          player: PublicKey;
          gauntletConfig: PublicKey;
          gauntletPoolVault: PublicKey;
          companyTreasury: PublicKey;
          gauntletEpochPool: PublicKey;
          gauntletPlayerScore: PublicKey;
          systemProgram: PublicKey;
        }) => {
          remainingAccounts: (accounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]) => {
            transaction: () => Promise<Transaction>;
          };
        };
      };
    }
  )
    .enterGauntlet(epochIdBN)
    .accounts({
      gameState: gameStatePda,
      player: playerPublicKey,
      gauntletConfig: gauntletConfigPda,
      gauntletPoolVault: gauntletPoolVaultPda,
      companyTreasury: COMPANY_TREASURY,
      gauntletEpochPool: epochPoolPda,
      gauntletPlayerScore: playerScorePda,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts([
      { pubkey: week1, isSigner: false, isWritable: false },
      { pubkey: week2, isSigner: false, isWritable: false },
      { pubkey: week3, isSigner: false, isWritable: false },
      { pubkey: week4, isSigner: false, isWritable: false },
      { pubkey: week5, isSigner: false, isWritable: false },
    ])
    .transaction();

  return tx.instructions[0];
}

export async function buildEnterGauntletTransaction(
  connection: Connection,
  program: Program,
  playerPublicKey: PublicKey,
  gameStatePda: PublicKey
): Promise<Transaction> {
  await ensureLocalFeeAccounts(connection);

  const [gauntletConfigPda] = deriveGauntletConfigPda();

  const gauntletConfig = await (
    program.account as {
      gauntletConfig: { fetch: (address: PublicKey) => Promise<{ currentEpochId: bigint | number }> };
    }
  ).gauntletConfig.fetch(gauntletConfigPda);

  const epochIdBigInt = BigInt(gauntletConfig.currentEpochId.toString());
  const epochIdBN = new BN(gauntletConfig.currentEpochId.toString());

  const ix = await buildEnterGauntletInstruction(
    program,
    playerPublicKey,
    gameStatePda,
    epochIdBN,
    epochIdBigInt
  );

  const tx = new Transaction();
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: ENTER_CU_LIMIT }));
  tx.add(ix);

  const { blockhash } = await connection.getLatestBlockhash(SOLANA_CONFIG.commitment);
  tx.recentBlockhash = blockhash;
  tx.feePayer = playerPublicKey;
  return tx;
}

export async function buildInitializeGauntletTransaction(
  connection: Connection,
  program: Program,
  adminPublicKey: PublicKey
): Promise<Transaction> {
  const [gauntletConfigPda] = deriveGauntletConfigPda();
  const [gauntletPoolVaultPda] = deriveGauntletPoolVaultPda();
  const [week1] = deriveGauntletWeekPoolPda(1);
  const [week2] = deriveGauntletWeekPoolPda(2);
  const [week3] = deriveGauntletWeekPoolPda(3);
  const [week4] = deriveGauntletWeekPoolPda(4);
  const [week5] = deriveGauntletWeekPoolPda(5);

  const tx = await (
    program.methods as unknown as {
      initializeGauntlet: () => {
        accounts: (accounts: {
          gauntletConfig: PublicKey;
          gauntletPoolVault: PublicKey;
          gauntletWeek1: PublicKey;
          gauntletWeek2: PublicKey;
          gauntletWeek3: PublicKey;
          gauntletWeek4: PublicKey;
          gauntletWeek5: PublicKey;
          admin: PublicKey;
          systemProgram: PublicKey;
        }) => { transaction: () => Promise<Transaction> };
      };
    }
  )
    .initializeGauntlet()
    .accounts({
      gauntletConfig: gauntletConfigPda,
      gauntletPoolVault: gauntletPoolVaultPda,
      gauntletWeek1: week1,
      gauntletWeek2: week2,
      gauntletWeek3: week3,
      gauntletWeek4: week4,
      gauntletWeek5: week5,
      admin: adminPublicKey,
      systemProgram: SystemProgram.programId,
    })
    .transaction();

  tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: INITIALIZE_CU_LIMIT }));
  const { blockhash } = await connection.getLatestBlockhash(SOLANA_CONFIG.commitment);
  tx.recentBlockhash = blockhash;
  tx.feePayer = adminPublicKey;
  return tx;
}

const SETTLE_CU_LIMIT = 500_000;

export async function buildSettleGauntletSessionTransaction(
  connection: Connection,
  program: Program,
  playerPublicKey: PublicKey,
  sessionSignerPublicKey: PublicKey,
  gameStatePda: PublicKey,
  sessionPda: PublicKey
): Promise<Transaction> {
  const [gauntletConfigPda] = deriveGauntletConfigPda();

  const gauntletConfig = await (
    program.account as {
      gauntletConfig: { fetch: (address: PublicKey) => Promise<{ currentEpochId: bigint | number }> };
    }
  ).gauntletConfig.fetch(gauntletConfigPda);

  const epochIdBigInt = BigInt(gauntletConfig.currentEpochId.toString());
  const epochIdBN = new BN(gauntletConfig.currentEpochId.toString());
  const [epochPoolPda] = deriveGauntletEpochPoolPda(epochIdBigInt);
  const [playerScorePda] = deriveGauntletPlayerScorePda(epochIdBigInt, playerPublicKey);
  const [inventoryPda] = deriveInventoryPda(sessionPda);
  const [week1] = deriveGauntletWeekPoolPda(1);
  const [week2] = deriveGauntletWeekPoolPda(2);
  const [week3] = deriveGauntletWeekPoolPda(3);
  const [week4] = deriveGauntletWeekPoolPda(4);
  const [week5] = deriveGauntletWeekPoolPda(5);

  const tx = await (
    program.methods as unknown as {
      settleGauntletSession: (epochIdArg: BN) => {
        accounts: (accounts: {
          gameState: PublicKey;
          player: PublicKey;
          sessionSigner: PublicKey;
          gauntletEpochPool: PublicKey;
          gauntletPlayerScore: PublicKey;
          inventory: PublicKey;
          gauntletWeek1: PublicKey;
          gauntletWeek2: PublicKey;
          gauntletWeek3: PublicKey;
          gauntletWeek4: PublicKey;
          gauntletWeek5: PublicKey;
        }) => { transaction: () => Promise<Transaction> };
      };
    }
  )
    .settleGauntletSession(epochIdBN)
    .accounts({
      gameState: gameStatePda,
      player: playerPublicKey,
      sessionSigner: sessionSignerPublicKey,
      gauntletEpochPool: epochPoolPda,
      gauntletPlayerScore: playerScorePda,
      inventory: inventoryPda,
      gauntletWeek1: week1,
      gauntletWeek2: week2,
      gauntletWeek3: week3,
      gauntletWeek4: week4,
      gauntletWeek5: week5,
    })
    .transaction();

  tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: SETTLE_CU_LIMIT }));

  const { blockhash } = await connection.getLatestBlockhash(SOLANA_CONFIG.commitment);
  tx.recentBlockhash = blockhash;
  tx.feePayer = sessionSignerPublicKey;
  return tx;
}

const GAUNTLET_ERROR_MESSAGES: Record<number, string> = {
  6033: 'Gauntlet mode is not active for this run.',
  6034: 'Gauntlet run has already ended.',
  6035: 'Invalid gauntlet week.',
  6036: 'Gauntlet pools not initialized yet.',
  6039: 'Invalid gauntlet fee account.',
  6040: 'Gauntlet score mismatch.',
  6042: 'Gauntlet entry has already been paid for this run.',
};

export function getGauntletErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('Account does not exist') || error.message.includes('has no data')) {
      return 'Gauntlet is not initialized on this cluster yet.';
    }
    if (error.message.includes('exceeded CUs meter') || error.message.includes('Program failed to complete')) {
      return 'Gauntlet transaction exceeded compute budget. Please try again.';
    }
    const match = error.message.match(/custom program error: 0x([0-9a-fA-F]+)/);
    if (match) {
      const errorCode = parseInt(match[1], 16);
      const message = GAUNTLET_ERROR_MESSAGES[errorCode];
      if (message) return message;
    }
    if (error.message.includes('insufficient funds')) {
      return 'Insufficient SOL balance for Gauntlet entry (0.01 SOL required).';
    }
    if (error.message.includes('Gauntlet entry already paid')) {
      return 'Gauntlet entry has already been paid for this run.';
    }
  }
  return 'Failed to process gauntlet transaction.';
}
