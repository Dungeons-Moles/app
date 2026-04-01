/**
 * SessionSigner Wallet Service
 *
 * Manages ephemeral keypairs for gasless gameplay transactions.
 * The sessionSigner wallet is created at session start, funded from the main wallet,
 * signs all gameplay transactions, and returns remaining SOL at session end.
 */

import {
  Keypair,
  PublicKey,
  Connection,
  Transaction,
  SystemProgram,
  ComputeBudgetProgram,
  SendTransactionError,
} from '@solana/web3.js';
import * as SecureStorage from '@/services/storage/secureStorage';
import bs58 from 'bs58';
import { ed25519 } from '@noble/curves/ed25519';
import { Platform } from 'react-native';
import { SOLANA_CONFIG } from './config';

// ============================================================================
// Ed25519 JIT warm-up — Hermes takes ~1.5s to JIT-compile @noble/curves on
// first call. Running a dummy sign at module load moves this cost to app startup
// (background) instead of blocking the first gameplay move.
// ============================================================================
if (Platform.OS !== 'web') {
  const _warmupSeed = new Uint8Array(32);
  _warmupSeed[0] = 1; // non-zero seed required by noble
  // Schedule off the critical path — InteractionManager.runAfterInteractions
  // is not available in service modules, so use setImmediate/setTimeout.
  const doWarmup = () => {
    try {
      const sig = ed25519.sign(new Uint8Array(64), _warmupSeed);
      // Also warm up bs58 encode/decode (used for signature and blockhash)
      const encoded = bs58.encode(sig);
      bs58.decode(encoded);
    } catch (_) {
      // ignore — the point is to trigger JIT compilation
    }
  };
  if (typeof setImmediate !== 'undefined') {
    setImmediate(doWarmup);
  } else {
    setTimeout(doWarmup, 0);
  }
}

// ============================================================================
// Pre-compiled message template for fire-and-forget transactions
// ============================================================================

/** Byte offsets into a serialized Solana message for fields that change per call. */
export interface MessageTemplate {
  bytes: Uint8Array;
  blockhashOffset: number;
  /** Patchable data regions: [{offset, length}] within the serialized message. */
  patches: { name: string; offset: number; length: number }[];
}

/** Read a compact-u16 from a byte array at the given offset. */
function readCompactU16(bytes: Uint8Array, offset: number): { value: number; size: number } {
  let value = 0;
  let size = 0;
  for (;;) {
    const byte = bytes[offset + size];
    value |= (byte & 0x7f) << (size * 7);
    size += 1;
    if ((byte & 0x80) === 0) break;
  }
  return { value, size };
}

/**
 * Build a message template from a fully-constructed Transaction.
 * Compiles the message once (expensive on Hermes: ~130ms) and locates
 * the byte offsets of all patchable fields so subsequent calls can
 * clone-and-patch in <1ms instead of recompiling.
 *
 * @param tx - Transaction with feePayer, recentBlockhash, and instructions set
 * @param patchSpecs - Named data regions to locate: [{name, discriminator, dataLength, patchOffset, patchLength}]
 *   - discriminator: first byte(s) of the instruction data to match
 *   - dataLength: total instruction data length to match
 *   - patchOffset: byte offset within the instruction data where the patchable region starts
 *   - patchLength: number of bytes in the patchable region
 */
export function buildMessageTemplate(
  tx: Transaction,
  patchSpecs: {
    name: string;
    dataLength: number;
    discriminator: number[];
    patchOffset: number;
    patchLength: number;
  }[]
): MessageTemplate {
  const messageBytes = tx.serializeMessage();

  // Parse the serialized message to find byte offsets.
  let offset = 3; // skip 3-byte header

  // Account keys
  const { value: numAccounts, size: accCountSize } = readCompactU16(messageBytes, offset);
  offset += accCountSize + numAccounts * 32;

  // Blockhash
  const blockhashOffset = offset;
  offset += 32;

  // Instructions
  const { value: numInstructions, size: ixCountSize } = readCompactU16(messageBytes, offset);
  offset += ixCountSize;

  const patches: MessageTemplate['patches'] = [];

  for (let i = 0; i < numInstructions; i++) {
    offset += 1; // programIdIndex

    const { value: numAccIdx, size: accIdxSize } = readCompactU16(messageBytes, offset);
    offset += accIdxSize + numAccIdx;

    const { value: dataLen, size: dataLenSize } = readCompactU16(messageBytes, offset);
    offset += dataLenSize;
    const dataStart = offset;

    // Match against patch specs
    for (const spec of patchSpecs) {
      if (dataLen === spec.dataLength) {
        let match = true;
        for (let d = 0; d < spec.discriminator.length; d++) {
          if (messageBytes[dataStart + d] !== spec.discriminator[d]) {
            match = false;
            break;
          }
        }
        if (match) {
          patches.push({
            name: spec.name,
            offset: dataStart + spec.patchOffset,
            length: spec.patchLength,
          });
        }
      }
    }

    offset += dataLen;
  }

  return { bytes: Uint8Array.from(messageBytes), blockhashOffset, patches };
}

/**
 * Clone a message template, patch the variable fields, sign, and build the
 * wire transaction — all without recompiling the message (~0ms vs ~130ms).
 */
export function signTemplatedTransaction(
  template: MessageTemplate,
  blockhashBytes: Uint8Array,
  patchData: Map<string, Uint8Array>,
  secretKeySeed: Uint8Array
): { wireTransaction: Uint8Array; signature: string } {
  // Clone template bytes
  const msg = new Uint8Array(template.bytes.length);
  msg.set(template.bytes);

  // Patch blockhash
  msg.set(blockhashBytes, template.blockhashOffset);

  // Patch instruction data
  for (const patch of template.patches) {
    const data = patchData.get(patch.name);
    if (data) msg.set(data, patch.offset);
  }

  // Sign
  const signatureBytes = ed25519.sign(msg, secretKeySeed);

  // Build wire: [1 (compact-u16)] [64-byte signature] [message]
  const wire = new Uint8Array(1 + 64 + msg.length);
  wire[0] = 1;
  wire.set(signatureBytes, 1);
  wire.set(msg, 65);

  return { wireTransaction: wire, signature: bs58.encode(signatureBytes) };
}

// ============================================================================
// Constants
// ============================================================================

/** Session signer funding per game mode.
 * Each covers: account rents + delegation PDAs + VRF inits + tx fees + 10% buffer.
 * All rent is reclaimed at session close and stays in the signer for reuse.
 */
export const SESSION_COST_CAMPAIGN = 85_000_000; // 0.085 SOL
export const SESSION_COST_DUEL = 85_000_000; // 0.085 SOL (same accounts as campaign)
export const SESSION_COST_GAUNTLET = 100_000_000; // 0.1 SOL (extra: GauntletEchoes + delegation)

/** Fallback / max funding amount. */
export const DEFAULT_FUND_AMOUNT = SESSION_COST_GAUNTLET;

/** Maximum balance cap for session signer. Auto-withdraw excess after session end. */
export const MAX_SIGNER_BALANCE = 110_000_000; // 0.11 SOL

/** Total SOL needed by session signer per session (defaults to most expensive mode). */
export const TOTAL_SESSION_COST = DEFAULT_FUND_AMOUNT;

/** Low balance warning threshold (0.005 SOL) */
export const LOW_BALANCE_THRESHOLD = 5_000_000; // lamports

/** Storage key for sessionSigner wallet */
const SESSION_SIGNER_STORAGE_KEY = 'session_signer';

/** Estimated transaction fee */
const ESTIMATED_TX_FEE = 5_000; // lamports
const ER_SEND_MAX_RETRIES = 12;
const ER_RETRY_BASE_DELAY_MS = 500;

// ER blockhash cache — avoids a full round trip per transaction.
// ER blockhashes are valid for ~60-90s; we use a conservative 15s TTL.
const ER_BLOCKHASH_CACHE_TTL_MS = 15_000;
type CachedErBlockhash = {
  blockhash: string;
  blockhashBytes: Uint8Array;
  lastValidBlockHeight: number;
  fetchedAt: number;
};
const erBlockhashCache = new Map<string, CachedErBlockhash>();

const getErBlockhashCacheKey = (connection: Connection): string =>
  normalizeEndpoint(connection.rpcEndpoint);

export const invalidateCachedErBlockhash = (connection: Connection): void => {
  erBlockhashCache.delete(getErBlockhashCacheKey(connection));
};

export const getCachedErBlockhash = async (
  connection: Connection,
  commitment: import('@solana/web3.js').Commitment
): Promise<{ blockhash: string; blockhashBytes: Uint8Array; lastValidBlockHeight: number }> => {
  const cacheKey = getErBlockhashCacheKey(connection);
  const now = Date.now();
  const cached = erBlockhashCache.get(cacheKey);
  if (cached && now - cached.fetchedAt < ER_BLOCKHASH_CACHE_TTL_MS) {
    return cached;
  }
  const latest = await connection.getLatestBlockhash(commitment);
  const next = { ...latest, blockhashBytes: bs58.decode(latest.blockhash), fetchedAt: now };
  erBlockhashCache.set(cacheKey, next);
  return next;
};

const getWritableAccounts = (tx: Transaction): string[] => {
  const writable = new Set<string>();
  if (tx.feePayer) writable.add(tx.feePayer.toBase58());
  for (const ix of tx.instructions) {
    for (const key of ix.keys) {
      if (key.isWritable) writable.add(key.pubkey.toBase58());
    }
  }
  return [...writable];
};

// Router blockhash cache — the router's getBlockhashForAccounts returns a blockhash
// from the validator holding the routed accounts. During a session all accounts live
// on the same validator, so we can cache per endpoint with a short TTL.
const ROUTER_BLOCKHASH_CACHE_TTL_MS = 5_000;
type CachedRouterBlockhash = {
  blockhash: string;
  blockhashBytes: Uint8Array;
  lastValidBlockHeight: number;
  fetchedAt: number;
};
const routerBlockhashCache = new Map<string, CachedRouterBlockhash>();

const fetchRouterBlockhashForAccounts = async (
  connection: Connection,
  accounts: string[]
): Promise<{ blockhash: string; blockhashBytes: Uint8Array; lastValidBlockHeight: number }> => {
  const response = await fetch(connection.rpcEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getBlockhashForAccounts',
      params: [accounts],
    }),
  });
  const payload = (await response.json()) as {
    result?: { blockhash?: string; lastValidBlockHeight?: number };
    error?: { message?: string };
  };
  const blockhash = payload.result?.blockhash;
  const lastValidBlockHeight = payload.result?.lastValidBlockHeight;
  if (!blockhash || typeof lastValidBlockHeight !== 'number') {
    throw new Error(
      payload.error?.message ??
        'Router did not return blockhash for routed accounts (missing result.blockhash)'
    );
  }
  return {
    blockhash,
    blockhashBytes: bs58.decode(blockhash),
    lastValidBlockHeight,
  };
};

const getRouterBlockhashForAccounts = async (
  connection: Connection,
  accounts: string[]
): Promise<{ blockhash: string; blockhashBytes: Uint8Array; lastValidBlockHeight: number }> => {
  const cacheKey = normalizeEndpoint(connection.rpcEndpoint);
  const now = Date.now();
  const cached = routerBlockhashCache.get(cacheKey);
  if (cached && now - cached.fetchedAt < ROUTER_BLOCKHASH_CACHE_TTL_MS) {
    return cached;
  }
  const result = await fetchRouterBlockhashForAccounts(connection, accounts);
  routerBlockhashCache.set(cacheKey, { ...result, fetchedAt: now });
  return result;
};

export const getMagicRouterBlockhashForAccounts = getRouterBlockhashForAccounts;

export const invalidateCachedRouterBlockhash = (connection: Connection): void => {
  routerBlockhashCache.delete(normalizeEndpoint(connection.rpcEndpoint));
};

/** Pre-warm the ER blockhash cache so the first move doesn't pay a round-trip penalty. */
export const warmErBlockhashCache = (connection: Connection): void => {
  if (isErConnection(connection)) {
    getCachedErBlockhash(connection, 'processed').catch(() => {});
  }
};

// Periodic blockhash refresh — keeps the cache warm during active gameplay so
// the first move after a pause never pays a cold-fetch penalty (~200-500ms).
let _blockhashRefreshTimer: ReturnType<typeof setInterval> | null = null;
let _blockhashRefreshConnection: Connection | null = null;

/**
 * Start a background interval that refreshes the ER blockhash cache every 10s.
 * Call once when the game screen mounts; call stopErBlockhashRefresh on unmount.
 */
export const startErBlockhashRefresh = (connection: Connection): void => {
  if (!isErConnection(connection)) return;
  // Already running for this connection
  if (_blockhashRefreshTimer && _blockhashRefreshConnection === connection) return;
  stopErBlockhashRefresh();
  _blockhashRefreshConnection = connection;
  // Refresh every 10s — well within the 15s TTL, so the cache is always warm.
  _blockhashRefreshTimer = setInterval(() => {
    getCachedErBlockhash(connection, 'processed').catch(() => {});
  }, 10_000);
};

export const stopErBlockhashRefresh = (): void => {
  if (_blockhashRefreshTimer) {
    clearInterval(_blockhashRefreshTimer);
    _blockhashRefreshTimer = null;
    _blockhashRefreshConnection = null;
  }
};

/**
 * Fire-and-forget raw transaction send via direct fetch.
 * Bypasses @solana/web3.js Connection.sendRawTransaction which parses the
 * JSON-RPC response synchronously (~30-50ms on Hermes). For fire-and-forget
 * we don't need the parsed response — just fire the HTTP POST.
 */
export function fireAndForgetRawTx(
  endpoint: string,
  wireBase64: string,
): Promise<void> {
  return fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [wireBase64, { encoding: 'base64', skipPreflight: true, maxRetries: 2 }],
    }),
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const payload = (await response.json().catch(() => null)) as
      | { error?: { code?: number; message?: string } }
      | null;
    if (payload?.error) {
      throw new Error(
        `RPC response error ${payload.error.code ?? 'unknown'}: ${payload.error.message ?? 'unknown error'}`
      );
    }
  });
}

const normalizeEndpoint = (url: string): string => url.replace(/\/+$/, '');
const directErRpcUrl =
  process.env.EXPO_PUBLIC_EPHEMERAL_PROVIDER_ENDPOINT ?? 'https://devnet.magicblock.app/';
const isErConnection = (connection: Connection): boolean => {
  const endpoint = normalizeEndpoint(connection.rpcEndpoint);
  return (
    endpoint === normalizeEndpoint(SOLANA_CONFIG.erRpcUrl) ||
    endpoint === normalizeEndpoint(directErRpcUrl) ||
    // Resolved validator endpoints (e.g. devnet-us.magicblock.app)
    endpoint.includes('magicblock.app')
  );
};
const isMagicRouterConnection = (connection: Connection): boolean =>
  normalizeEndpoint(connection.rpcEndpoint).includes('router.magicblock.app');
const isRetriableErWriteLockError = (err: unknown): boolean => {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('cannot be written') && message.includes('writable account');
};
const isRetriableErBlockhashError = (err: unknown): boolean => {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return message.includes('blockhash not found');
};
const formatErr = (err: unknown): string =>
  err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);

const waitForSignatureStatus = async (
  connection: Connection,
  signature: string,
  erConnection: boolean
) => {
  if (!erConnection) {
    const result = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    return result.value[0];
  }

  // Fast-path for ER: short local poll first, then one history lookup fallback.
  for (let i = 0; i < 6; i += 1) {
    const fast = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: false,
    });
    if (fast.value[0]) return fast.value[0];
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  const fallback = await connection.getSignatureStatuses([signature], {
    searchTransactionHistory: true,
  });
  return fallback.value[0];
};

const waitForErProcessedStatus = async (
  connection: Connection,
  signature: string,
  timeoutMs = 2000
) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const polled = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: false,
    });
    const status = polled.value[0];
    if (status) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  // Final fallback against history in case the status rotated out quickly.
  const fallback = await connection.getSignatureStatuses([signature], {
    searchTransactionHistory: true,
  });
  return fallback.value[0] ?? null;
};

// ============================================================================
// Deterministic Session Key Derivation
// ============================================================================

/** @deprecated Use buildGameWalletDerivationMessage() for reusable signer. */
export function buildSessionDerivationMessage(mode: string, nonce: bigint | number): Uint8Array {
  return new TextEncoder().encode(`DnM-session-${mode}-${nonce}`);
}

/**
 * Fixed derivation message for the reusable game wallet signer.
 * Same message → same wallet signature → same keypair across all sessions.
 */
export function buildGameWalletDerivationMessage(): Uint8Array {
  return new TextEncoder().encode('DnM-game-wallet-v1');
}

export function deriveSessionSignerFromSignature(signature: Uint8Array): Keypair {
  return Keypair.fromSeed(signature.slice(0, 32));
}

// ============================================================================
// Types
// ============================================================================

/**
 * Stored sessionSigner wallet data in secure storage.
 */
export interface StoredSessionSigner {
  /** Base58-encoded secret key (64 bytes) */
  secretKey: string;
  /** Associated main wallet address */
  mainWalletAddress: string;
  /** Creation timestamp (Unix ms) */
  createdAt: number;
  /** True when persisted before the funding tx confirms (pre-commit safety net) */
  pending?: boolean;
}

/**
 * SessionSigner wallet state machine states.
 */
export type SessionSignerState = 'idle' | 'funding' | 'active' | 'draining' | 'failed';

/**
 * Information about the current sessionSigner wallet.
 */
export interface SessionSignerWalletInfo {
  publicKey: PublicKey;
  balance: number;
  isLowBalance: boolean;
  mainWalletAddress: string;
  createdAt: number;
}

/**
 * Session recovery state for detecting pending sessions.
 */
export interface SessionRecoveryState {
  hasPendingSession: boolean;
  sessionSignerBalance: number;
  sessionSignerPublicKey: PublicKey | null;
}

// ============================================================================
// SessionSigner Wallet Functions
// ============================================================================

/**
 * Persists a sessionSigner keypair to secure storage.
 *
 * @param pending - When true the keypair is stored before the funding tx
 *   confirms, acting as a crash-recovery safety net. `markAsActive` later
 *   overwrites with `pending: false`.
 */
export async function storeSessionSignerWallet(
  mainWalletAddress: string,
  keypair: Keypair,
  createdAt: number = Date.now(),
  pending: boolean = false
): Promise<void> {
  const stored: StoredSessionSigner = {
    secretKey: bs58.encode(keypair.secretKey),
    mainWalletAddress,
    createdAt,
    ...(pending ? { pending: true } : {}),
  };
  await SecureStorage.setItemAsync(SESSION_SIGNER_STORAGE_KEY, JSON.stringify(stored));
}

/**
 * Creates a new ephemeral keypair and stores it securely.
 * Overwrites any existing stored sessionSigner.
 *
 * @param mainWalletAddress - The connected main wallet's public key (string)
 * @returns New Keypair instance
 */
export async function createSessionSignerWallet(mainWalletAddress: string): Promise<Keypair> {
  console.log('[sessionSignerWallet] createSessionSignerWallet called - creating NEW sessionSigner for:', mainWalletAddress);
  const keypair = Keypair.generate();
  await storeSessionSignerWallet(mainWalletAddress, keypair);
  console.log('[sessionSignerWallet] NEW sessionSigner created and stored:', keypair.publicKey.toBase58());

  return keypair;
}

/**
 * Reads the raw stored sessionSigner data from SecureStore.
 * Returns null if nothing is stored or if the main wallet doesn't match.
 */
export async function loadStoredSessionSigner(
  mainWalletAddress: string
): Promise<StoredSessionSigner | null> {
  try {
    const data = await SecureStorage.getItemAsync(SESSION_SIGNER_STORAGE_KEY);
    if (!data) return null;

    const stored: StoredSessionSigner = JSON.parse(data);
    if (stored.mainWalletAddress !== mainWalletAddress) return null;

    return stored;
  } catch {
    return null;
  }
}

/**
 * Loads an existing sessionSigner wallet from secure storage.
 * Returns null if no stored sessionSigner or if mainWalletAddress doesn't match.
 *
 * @param mainWalletAddress - The connected main wallet's public key (string)
 * @returns Keypair if found and matches main wallet, null otherwise
 */
export async function loadSessionSignerWallet(mainWalletAddress: string): Promise<Keypair | null> {
  console.log('[sessionSignerWallet] loadSessionSignerWallet called with address:', mainWalletAddress);
  try {
    const stored = await loadStoredSessionSigner(mainWalletAddress);
    if (!stored) {
      console.log('[sessionSignerWallet] No stored sessionSigner found for this wallet');
      return null;
    }

    console.log('[sessionSignerWallet] Found stored sessionSigner:', {
      pending: !!stored.pending,
      createdAt: new Date(stored.createdAt).toISOString(),
    });

    const secretKey = bs58.decode(stored.secretKey);
    const keypair = Keypair.fromSecretKey(secretKey);
    console.log('[sessionSignerWallet] Successfully loaded sessionSigner keypair:', keypair.publicKey.toBase58());
    return keypair;
  } catch (error) {
    console.error('[sessionSignerWallet] Failed to load sessionSigner wallet:', error);
    return null;
  }
}

/**
 * Removes sessionSigner wallet from secure storage.
 * Should only be called after draining funds.
 */
export async function clearSessionSignerWallet(): Promise<void> {
  await SecureStorage.deleteItemAsync(SESSION_SIGNER_STORAGE_KEY);
}

// ============================================================================
// Per-Session Keypair Storage
// ============================================================================

/** Returns the SecureStorage key for a specific session's signer keypair. */
function sessionSignerKeyForSession(sessionPda: string): string {
  return `${SESSION_SIGNER_STORAGE_KEY}.${sessionPda}`;
}

/**
 * Associates a session signer keypair with a specific session PDA.
 * This allows restoring the correct keypair when switching between sessions.
 */
export async function storeSessionSignerForSession(
  mainWalletAddress: string,
  keypair: Keypair,
  sessionPda: string
): Promise<void> {
  const stored: StoredSessionSigner = {
    secretKey: bs58.encode(keypair.secretKey),
    mainWalletAddress,
    createdAt: Date.now(),
  };
  await SecureStorage.setItemAsync(
    sessionSignerKeyForSession(sessionPda),
    JSON.stringify(stored)
  );
}

/**
 * Loads the session signer keypair associated with a specific session PDA.
 * Returns null if no keypair is stored for this session or if the wallet doesn't match.
 */
export async function loadSessionSignerForSession(
  mainWalletAddress: string,
  sessionPda: string
): Promise<Keypair | null> {
  try {
    const data = await SecureStorage.getItemAsync(sessionSignerKeyForSession(sessionPda));
    if (!data) return null;
    const stored: StoredSessionSigner = JSON.parse(data);
    if (stored.mainWalletAddress !== mainWalletAddress) return null;
    return Keypair.fromSecretKey(bs58.decode(stored.secretKey));
  } catch {
    return null;
  }
}

/**
 * Removes the session-specific signer keypair from storage.
 */
export async function clearSessionSignerForSession(sessionPda: string): Promise<void> {
  await SecureStorage.deleteItemAsync(sessionSignerKeyForSession(sessionPda));
}

/**
 * Gets information about the current sessionSigner wallet.
 *
 * @param connection - Solana connection
 * @param mainWalletAddress - The connected main wallet's public key
 * @returns SessionSigner info including balance, or null if no sessionSigner
 */
export async function getSessionSignerInfo(
  connection: Connection,
  mainWalletAddress: string
): Promise<SessionSignerWalletInfo | null> {
  try {
    const data = await SecureStorage.getItemAsync(SESSION_SIGNER_STORAGE_KEY);
    if (!data) {
      return null;
    }

    const stored: StoredSessionSigner = JSON.parse(data);

    // Validate main wallet address matches
    if (stored.mainWalletAddress !== mainWalletAddress) {
      return null;
    }

    // Decode keypair to get public key
    const secretKey = bs58.decode(stored.secretKey);
    const keypair = Keypair.fromSecretKey(secretKey);

    // Fetch balance
    const balance = await connection.getBalance(keypair.publicKey);

    return {
      publicKey: keypair.publicKey,
      balance,
      isLowBalance: balance < LOW_BALANCE_THRESHOLD,
      mainWalletAddress: stored.mainWalletAddress,
      createdAt: stored.createdAt,
    };
  } catch (error) {
    console.error('Failed to get sessionSigner info:', error);
    return null;
  }
}

/**
 * Calculates how much SOL the signer needs to be topped up for a new session.
 * Returns 0 if the signer already has enough.
 */
export function calculateRequiredFunding(currentBalance: number, sessionCost: number = TOTAL_SESSION_COST): number {
  const needed = sessionCost - currentBalance;
  return Math.max(0, needed);
}

/**
 * Creates a transaction to transfer SOL from main wallet to sessionSigner.
 * Note: This transaction must be signed by main wallet via Mobile Wallet Adapter.
 *
 * @param mainWallet - Main wallet public key (payer)
 * @param sessionSignerWallet - SessionSigner wallet public key (recipient)
 * @param amount - Amount in lamports (default: 50,000,000 = 0.05 SOL)
 * @returns Unsigned Transaction
 */
export function createFundSessionSignerTransaction(
  mainWallet: PublicKey,
  sessionSignerWallet: PublicKey,
  amount: number = DEFAULT_FUND_AMOUNT
): Transaction {
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: mainWallet,
      toPubkey: sessionSignerWallet,
      lamports: amount,
    })
  );

  return transaction;
}

/**
 * Transfers all remaining SOL from sessionSigner back to main wallet.
 * Transaction signed by sessionSigner (automatic, no user interaction).
 *
 * @param connection - Solana connection
 * @param sessionSignerKeypair - SessionSigner wallet keypair (signer)
 * @param mainWalletAddress - Main wallet to receive funds
 * @returns Transaction signature
 * @throws Error if balance insufficient for transaction fee
 */
export async function drainSessionSignerToMain(
  connection: Connection,
  sessionSignerKeypair: Keypair,
  mainWalletAddress: PublicKey
): Promise<string> {
  const balance = await connection.getBalance(sessionSignerKeypair.publicKey);
  const latestBlockhash = await connection.getLatestBlockhash(SOLANA_CONFIG.commitment);

  // Build the exact transaction we'll send (no extra ComputeBudget instruction)
  // so the fee probe matches the actual fee precisely. We need the account to
  // end at exactly 0 lamports — any non-zero residual below rent-exempt (~890K)
  // causes "insufficient funds for rent".
  const tx = new Transaction({
    feePayer: sessionSignerKeypair.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
  }).add(
    SystemProgram.transfer({
      fromPubkey: sessionSignerKeypair.publicKey,
      toPubkey: mainWalletAddress,
      lamports: 1, // placeholder, replaced below
    })
  );
  const exactFee = (await connection.getFeeForMessage(tx.compileMessage(), SOLANA_CONFIG.commitment))
    .value;
  const fee = exactFee ?? ESTIMATED_TX_FEE;
  const transferAmount = balance - fee;
  if (transferAmount <= 0) {
    throw new Error('Insufficient balance to drain');
  }

  // Rebuild with the correct transfer amount
  const drainTx = new Transaction({
    feePayer: sessionSignerKeypair.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
  }).add(
    SystemProgram.transfer({
      fromPubkey: sessionSignerKeypair.publicKey,
      toPubkey: mainWalletAddress,
      lamports: transferAmount,
    })
  );
  drainTx.sign(sessionSignerKeypair);

  const signature = await connection.sendRawTransaction(drainTx.serialize(), {
    skipPreflight: false,
    maxRetries: 2,
  });
  await connection.confirmTransaction(
    { signature, blockhash: latestBlockhash.blockhash, lastValidBlockHeight: latestBlockhash.lastValidBlockHeight },
    SOLANA_CONFIG.commitment
  );
  return signature;
}

/**
 * Withdraws excess SOL above MAX_SIGNER_BALANCE back to main wallet.
 * Called after session end to prevent balance accumulation.
 */
export async function withdrawExcessToMain(
  connection: Connection,
  sessionSignerKeypair: Keypair,
  mainWalletAddress: PublicKey
): Promise<string | null> {
  const balance = await connection.getBalance(sessionSignerKeypair.publicKey);
  if (balance <= MAX_SIGNER_BALANCE) return null;

  const excess = balance - MAX_SIGNER_BALANCE;
  const latestBlockhash = await connection.getLatestBlockhash(SOLANA_CONFIG.commitment);

  const tx = new Transaction({
    feePayer: sessionSignerKeypair.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
  }).add(
    SystemProgram.transfer({
      fromPubkey: sessionSignerKeypair.publicKey,
      toPubkey: mainWalletAddress,
      lamports: 1,
    })
  );
  const exactFee = (await connection.getFeeForMessage(tx.compileMessage(), SOLANA_CONFIG.commitment))
    .value;
  const fee = exactFee ?? ESTIMATED_TX_FEE;

  const transferAmount = excess - fee;
  if (transferAmount <= 0) return null;

  const withdrawTx = new Transaction({
    feePayer: sessionSignerKeypair.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
  }).add(
    SystemProgram.transfer({
      fromPubkey: sessionSignerKeypair.publicKey,
      toPubkey: mainWalletAddress,
      lamports: transferAmount,
    })
  );
  withdrawTx.sign(sessionSignerKeypair);

  const signature = await connection.sendRawTransaction(withdrawTx.serialize(), {
    skipPreflight: false,
    maxRetries: 2,
  });
  await connection.confirmTransaction(
    { signature, blockhash: latestBlockhash.blockhash, lastValidBlockHeight: latestBlockhash.lastValidBlockHeight },
    SOLANA_CONFIG.commitment
  );
  return signature;
}

/**
 * Checks sessionSigner balance and returns low balance warning if applicable.
 *
 * @param connection - Solana connection
 * @param sessionSignerPublicKey - SessionSigner wallet public key
 * @returns Balance in lamports and whether it's below threshold
 */
export async function checkSessionSignerBalance(
  connection: Connection,
  sessionSignerPublicKey: PublicKey
): Promise<{ balance: number; isLow: boolean }> {
  const balance = await connection.getBalance(sessionSignerPublicKey);
  return {
    balance,
    isLow: balance < LOW_BALANCE_THRESHOLD,
  };
}

/**
 * Confirms an ER transaction by polling for processed status.
 * Exported so callers can defer confirmation and run it in parallel with other work.
 */
export async function confirmErTransaction(
  connection: Connection,
  signature: string
): Promise<void> {
  const erStatus = await waitForErProcessedStatus(connection, signature);
  if (!erStatus) {
    throw new Error(
      `[sessionSignerWallet] ER transaction ${signature} did not reach processed status before timeout`
    );
  }
  if (erStatus.err) {
    throw new Error(
      `[sessionSignerWallet] Transaction ${signature} failed on-chain: ${formatErr(erStatus.err)}`
    );
  }
}

// Cache ed25519 seed (first 32 bytes of secretKey) per signer to avoid
// .slice() allocation on every transaction. Keyed by pubkey base58.
const signerSeedCache = new Map<string, Uint8Array>();
function getCachedSignerSeed(keypair: Keypair): Uint8Array {
  const key = keypair.publicKey.toBase58();
  let seed = signerSeedCache.get(key);
  if (!seed) {
    seed = keypair.secretKey.slice(0, 32);
    signerSeedCache.set(key, seed);
  }
  return seed;
}

/**
 * Signs and sends a transaction using the sessionSigner keypair.
 *
 * @param connection - Solana connection
 * @param transaction - Transaction to send
 * @param sessionSignerKeypair - SessionSigner keypair for signing
 * @param options - Optional: skipErConfirmation to defer confirmation to the caller
 * @returns Transaction signature
 */
export async function sendSessionSignerTransaction(
  connection: Connection,
  transaction: Transaction,
  sessionSignerKeypair: Keypair,
  options?: {
    skipErConfirmation?: boolean;
    skipConfirmation?: boolean;
    fireAndForget?: boolean;
    onSendFail?: (err: Error) => void;
    routedAccounts?: PublicKey[];
  }
): Promise<string> {
  const erConnection = isErConnection(connection);
  const baseInstructions = [...transaction.instructions];
  const maxAttempts = erConnection ? ER_SEND_MAX_RETRIES : 1;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const tSetup = Date.now();
    const tx = new Transaction();
    tx.feePayer = sessionSignerKeypair.publicKey;
    tx.add(...baseInstructions);

    // Add a random compute unit price to ensure transaction uniqueness on localnet.
    // This prevents "transaction already processed" errors when making similar
    // transactions (e.g., moving back and forth) within the same blockhash slot.
    // Skip if the transaction already has a setComputeUnitPrice instruction.
    const COMPUTE_BUDGET_PROGRAM_ID = ComputeBudgetProgram.programId;
    const SET_CU_PRICE_DISCRIMINATOR = 3;
    const hasCuPrice = baseInstructions.some(
      (ix) =>
        ix.programId.equals(COMPUTE_BUDGET_PROGRAM_ID) &&
        ix.data.length > 0 &&
        ix.data[0] === SET_CU_PRICE_DISCRIMINATOR
    );
    if (!hasCuPrice) {
      const randomMicroLamports = Math.floor(Math.random() * 1000) + 1;
      tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: randomMicroLamports }));
    }
    console.log(`[perf]   txSetup: ${Date.now() - tSetup}ms`);

    const confirmationCommitment = erConnection
      ? SOLANA_CONFIG.erCommitment
      : SOLANA_CONFIG.commitment;
    const isRouterPath = erConnection && isMagicRouterConnection(connection);
    let blockhash = '';
    let lastValidBlockHeight = 0;

    {
      const tBh = Date.now();
      const blockhashCommitment = erConnection ? 'processed' : confirmationCommitment;
      const latest =
        erConnection && isRouterPath && options?.routedAccounts?.length
          ? await getRouterBlockhashForAccounts(connection, [
              ...new Set([
                ...getWritableAccounts(tx),
                ...options.routedAccounts.map((account) => account.toBase58()),
              ]),
            ])
          : erConnection
            ? await getCachedErBlockhash(connection, blockhashCommitment)
            : await connection.getLatestBlockhash(blockhashCommitment);
      blockhash = latest.blockhash;
      lastValidBlockHeight = latest.lastValidBlockHeight;
      tx.recentBlockhash = blockhash;
      console.log(`[perf]   blockhash: ${Date.now() - tBh}ms`);
    }

    // Fire-and-forget mode: compile message ONCE, sign raw bytes, build wire
    // format manually. This avoids the double-compilation overhead in
    // Transaction.sign() + Transaction.serialize() which costs ~280ms on Hermes.
    if (options?.fireAndForget && erConnection) {
      const tCompile = Date.now();
      // Compile and serialize message ONCE (the expensive part: account dedup,
      // sorting, compact-array building — ~130ms on Hermes).
      const messageBytes = tx.serializeMessage();
      const tSign = Date.now();

      // Sign raw message bytes with @noble/curves ed25519 (bypasses
      // Transaction.sign's internal re-compilation).
      const seed = getCachedSignerSeed(sessionSignerKeypair);
      const signatureBytes = ed25519.sign(messageBytes, seed);
      const tWire = Date.now();

      // Build wire transaction: [1 (compact-u16)] [64-byte signature] [message]
      const wireTransaction = Buffer.alloc(1 + 64 + messageBytes.length);
      wireTransaction.writeUInt8(1, 0);
      wireTransaction.set(signatureBytes, 1);
      wireTransaction.set(messageBytes, 65);

      const signature = bs58.encode(signatureBytes);

      // Use direct fetch on native to bypass Connection.sendRawTransaction's
      // JSON-RPC response parsing overhead (~30-50ms on Hermes).
      if (Platform.OS !== 'web') {
        const wireBase64 = Buffer.from(wireTransaction).toString('base64');
        fireAndForgetRawTx(connection.rpcEndpoint, wireBase64).then(() => {
          console.log(`[perf] sendTransaction(bg): completed (router=${isRouterPath})`);
        }).catch((err) => {
          console.error('[sessionSignerWallet] Background send failed:', err);
          if (erConnection && isRetriableErBlockhashError(err)) {
            invalidateCachedErBlockhash(connection);
            invalidateCachedRouterBlockhash(connection);
          }
          options?.onSendFail?.(err instanceof Error ? err : new Error(String(err)));
        });
      } else {
        connection.sendRawTransaction(wireTransaction, {
          skipPreflight: true,
          maxRetries: 2,
        }).then(() => {
          console.log(`[perf] sendTransaction(bg): completed (router=${isRouterPath})`);
        }).catch((err) => {
          console.error('[sessionSignerWallet] Background send failed:', err);
          if (erConnection && isRetriableErBlockhashError(err)) {
            invalidateCachedErBlockhash(connection);
            invalidateCachedRouterBlockhash(connection);
          }
          options?.onSendFail?.(err instanceof Error ? err : new Error(String(err)));
        });
      }
      console.log(`[perf] sendTransaction: 0ms (fire-and-forget, compile: ${tSign - tCompile}ms, sign: ${tWire - tSign}ms, sig=${signature.slice(0, 8)}...)`);
      return signature;
    }

    // Standard path: single-compilation with @noble/curves ed25519.
    // On Hermes, Transaction.sign() + serialize() compiles the message twice (~280ms).
    // Single compilation + noble sign: ~130ms + ~22ms = ~152ms.
    let serializedTx: Uint8Array;
    let precomputedSig: string;
    {
      const tSign = Date.now();
      const messageBytes = tx.serializeMessage();
      const seed = getCachedSignerSeed(sessionSignerKeypair);
      const signatureBytes = ed25519.sign(messageBytes, seed);
      const wire = new Uint8Array(1 + 64 + messageBytes.length);
      wire[0] = 1;
      wire.set(signatureBytes, 1);
      wire.set(messageBytes, 65);
      serializedTx = wire;
      precomputedSig = bs58.encode(signatureBytes);
      console.log(`[perf]   compile+sign: ${Date.now() - tSign}ms`);
    }

    try {
      const tSend = Date.now();
      const signature = await connection.sendRawTransaction(
        Buffer.from(serializedTx),
        {
          // MagicBlock ER recommends skipping preflight; preflight can fail with
          // transient writable-account verification errors before ER state settles.
          skipPreflight: erConnection,
          maxRetries: 2,
        },
      );
      const tSent = Date.now();
      console.log(`[perf] sendTransaction: ${tSent - tSend}ms (router=${isRouterPath})`);

      // Fire-and-forget: skip all confirmation. Caller verifies via other means
      // (e.g., waitForErSessionAccounts for delegation TXs).
      if (options?.skipConfirmation) {
        return signature;
      }

      if (erConnection) {
        if (options?.skipErConfirmation) {
          // Caller will handle confirmation (e.g., run it in parallel with state fetch).
          console.log(`[perf] sendOnly: ${tSent - tSend}ms (confirmation deferred)`);
          return signature;
        }
        // ER processes transactions in ~10-50ms. From high-latency locations,
        // the tx is already confirmed by the time the first poll arrives, so
        // a simple 40ms-interval poll finds it immediately. This is faster
        // than websocket confirmTransaction which has subscription setup overhead.
        await confirmErTransaction(connection, signature);
        console.log(`[perf] confirmTransaction: ${Date.now() - tSent}ms | total send+confirm: ${Date.now() - tSend}ms`);
        return signature;
      }

      const confirmResult = await connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        confirmationCommitment
      );
      const confirmErr = (confirmResult as { value?: { err?: unknown } })?.value?.err;
      if (confirmErr) {
        throw new Error(
          `[sessionSignerWallet] Transaction failed during confirmation: ${formatErr(confirmErr)}`
        );
      }

      // ER can return a signature and confirmed status even when the tx finalized with err.
      // Always inspect signature status explicitly before reporting success.
      const status = await waitForSignatureStatus(connection, signature, erConnection);
      if (status?.err) {
        let logs: string[] | null = null;
        try {
          const txMeta = await connection.getTransaction(signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
          });
          logs = txMeta?.meta?.logMessages ?? null;
        } catch (logFetchErr) {
          console.error(
            '[sessionSignerWallet] Failed to fetch failed tx logs from chain:',
            logFetchErr
          );
        }
        throw new Error(
          `[sessionSignerWallet] Transaction ${signature} failed on-chain: ${formatErr(status.err)}${
            logs ? ` | logs: ${logs.join(' || ')}` : ''
          }`
        );
      }
      return signature;
    } catch (err) {
      lastError = err;
      const shouldRetryEr =
        erConnection && (isRetriableErWriteLockError(err) || isRetriableErBlockhashError(err));
      if (erConnection && isRetriableErBlockhashError(err)) {
        invalidateCachedErBlockhash(connection);
        invalidateCachedRouterBlockhash(connection);
      }
      if (!shouldRetryEr || attempt >= maxAttempts) {
        if (err instanceof SendTransactionError) {
          // Log preflight simulation logs if available (works on base chain
          // where skipPreflight=false). Fallback to getLogs() only if needed.
          const preflightLogs = err.logs;
          if (preflightLogs?.length) {
            console.error('[sessionSignerWallet] Transaction failed. Logs:', preflightLogs);
          } else {
            try {
              const fetchedLogs = await err.getLogs(connection);
              console.error('[sessionSignerWallet] Transaction failed. Logs:', fetchedLogs);
            } catch {
              // getLogs requires 'confirmed' commitment but ER/localnet connections
              // use 'processed'. Log what we have from the error itself.
              console.error('[sessionSignerWallet] Transaction failed:', err.message);
            }
          }
        }
        throw err;
      }
      const delayMs = isRetriableErBlockhashError(err) ? 80 : ER_RETRY_BASE_DELAY_MS;
      console.warn(
        `[sessionSignerWallet] Retrying transient ER send error (attempt ${attempt}/${maxAttempts}) in ${delayMs}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to send session transaction');
}

/**
 * Checks for a pending session from a previous app launch.
 * Used for session recovery when app restarts.
 *
 * @param mainWalletAddress - The connected main wallet's public key
 * @param connection - Solana connection
 * @returns Session recovery state
 */
export async function checkForPendingSession(
  mainWalletAddress: string,
  connection: Connection
): Promise<SessionRecoveryState> {
  const stored = await loadStoredSessionSigner(mainWalletAddress);
  if (!stored) {
    return {
      hasPendingSession: false,
      sessionSignerBalance: 0,
      sessionSignerPublicKey: null,
    };
  }

  const secretKey = bs58.decode(stored.secretKey);
  const sessionSigner = Keypair.fromSecretKey(secretKey);
  const balance = await connection.getBalance(sessionSigner.publicKey);

  if (balance > 0) {
    // SessionSigner has funds on-chain. If it was still marked pending (crash between
    // tx confirm and markAsActive), promote it to non-pending so future
    // launches skip this branch.
    if (stored.pending) {
      console.log(
        '[sessionSignerWallet] Recovering pending sessionSigner with on-chain balance:',
        sessionSigner.publicKey.toBase58()
      );
      await storeSessionSignerWallet(mainWalletAddress, sessionSigner, stored.createdAt);
    }
    return {
      hasPendingSession: true,
      sessionSignerBalance: balance,
      sessionSignerPublicKey: sessionSigner.publicKey,
    };
  }

  // SessionSigner has zero balance.
  if (stored.pending) {
    // Still marked pending AND zero balance → the funding tx never landed.
    // Clean up the orphaned entry.
    console.log(
      '[sessionSignerWallet] Cleaning up orphaned pending sessionSigner:',
      sessionSigner.publicKey.toBase58()
    );
    await clearSessionSignerWallet();
    return {
      hasPendingSession: false,
      sessionSignerBalance: 0,
      sessionSignerPublicKey: null,
    };
  }

  // Non-pending, zero balance → active session whose sessionSigner was drained.
  // Keep it so the session can be resumed or topped up.
  return {
    hasPendingSession: true,
    sessionSignerBalance: 0,
    sessionSignerPublicKey: sessionSigner.publicKey,
  };
}
