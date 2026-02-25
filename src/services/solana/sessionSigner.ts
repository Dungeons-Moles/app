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
import { SOLANA_CONFIG } from './config';

// ============================================================================
// Constants
// ============================================================================

/** Default amount to fund sessionSigner (0.2 SOL).
 * Must cover all delegation-account rent allocations across gameplay/map/inventory/POI/session.
 * GenerateMap alone can consume ~0.07 SOL for the full map grid on devnet.
 */
export const DEFAULT_FUND_AMOUNT = 200_000_000; // lamports

/** Low balance warning threshold (0.01 SOL) */
export const LOW_BALANCE_THRESHOLD = 10_000_000; // lamports

/** Storage key for sessionSigner wallet */
const SESSION_SIGNER_STORAGE_KEY = 'session_signer';

/** Estimated transaction fee */
const ESTIMATED_TX_FEE = 5_000; // lamports
const ER_SEND_MAX_RETRIES = 12;
const ER_RETRY_BASE_DELAY_MS = 500;

const normalizeEndpoint = (url: string): string => url.replace(/\/+$/, '');
const isErConnection = (connection: Connection): boolean =>
  normalizeEndpoint(connection.rpcEndpoint) === normalizeEndpoint(SOLANA_CONFIG.erRpcUrl);
const isRetriableErWriteLockError = (err: unknown): boolean => {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('cannot be written') && message.includes('writable account');
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
  return `${SESSION_SIGNER_STORAGE_KEY}:${sessionPda}`;
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
 * Creates a transaction to transfer SOL from main wallet to sessionSigner.
 * Note: This transaction must be signed by main wallet via Mobile Wallet Adapter.
 *
 * @param mainWallet - Main wallet public key (payer)
 * @param sessionSignerWallet - SessionSigner wallet public key (recipient)
 * @param amount - Amount in lamports (default: 80,000,000 = 0.08 SOL)
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
 * Signs and sends a transaction using the sessionSigner keypair.
 *
 * @param connection - Solana connection
 * @param transaction - Transaction to send
 * @param sessionSignerKeypair - SessionSigner keypair for signing
 * @returns Transaction signature
 */
export async function sendSessionSignerTransaction(
  connection: Connection,
  transaction: Transaction,
  sessionSignerKeypair: Keypair
): Promise<string> {
  const erConnection = isErConnection(connection);
  const baseInstructions = [...transaction.instructions];
  const maxAttempts = erConnection ? ER_SEND_MAX_RETRIES : 1;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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

    const confirmationCommitment = erConnection
      ? SOLANA_CONFIG.erCommitment
      : SOLANA_CONFIG.commitment;
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash(confirmationCommitment);
    tx.recentBlockhash = blockhash;
    tx.sign(sessionSignerKeypair);

    try {
      const signature = await connection.sendRawTransaction(tx.serialize(), {
        // MagicBlock ER recommends skipping preflight; preflight can fail with
        // transient writable-account verification errors before ER state settles.
        skipPreflight: erConnection,
        maxRetries: 2,
      });

      if (erConnection) {
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
      if (!erConnection || !isRetriableErWriteLockError(err) || attempt >= maxAttempts) {
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
            } catch (_logErr) {
              // getLogs requires 'confirmed' commitment but ER/localnet connections
              // use 'processed'. Log what we have from the error itself.
              console.error('[sessionSignerWallet] Transaction failed:', err.message);
            }
          }
        }
        throw err;
      }
      const delayMs = ER_RETRY_BASE_DELAY_MS;
      console.warn(
        `[sessionSignerWallet] Retrying transient ER writable-account error (attempt ${attempt}/${maxAttempts}) in ${delayMs}ms`
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
