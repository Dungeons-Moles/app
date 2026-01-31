/**
 * Burner Wallet Service
 *
 * Manages ephemeral keypairs for gasless gameplay transactions.
 * The burner wallet is created at session start, funded from the main wallet,
 * signs all gameplay transactions, and returns remaining SOL at session end.
 */

import {
  Keypair,
  PublicKey,
  Connection,
  Transaction,
  SystemProgram,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import * as SecureStorage from '@/services/storage/secureStorage';
import bs58 from 'bs58';
import { SOLANA_CONFIG } from './config';

// ============================================================================
// Constants
// ============================================================================

/** Default amount to fund burner (0.005 SOL) */
export const DEFAULT_FUND_AMOUNT = 5_000_000; // lamports

/** Low balance warning threshold (0.001 SOL) */
export const LOW_BALANCE_THRESHOLD = 1_000_000; // lamports

/** Storage key for burner wallet */
const BURNER_STORAGE_KEY = 'burner_wallet';

/** Estimated transaction fee */
const ESTIMATED_TX_FEE = 5_000; // lamports

// ============================================================================
// Types
// ============================================================================

/**
 * Stored burner wallet data in secure storage.
 */
export interface StoredBurner {
  /** Base58-encoded secret key (64 bytes) */
  secretKey: string;
  /** Associated main wallet address */
  mainWalletAddress: string;
  /** Creation timestamp (Unix ms) */
  createdAt: number;
}

/**
 * Burner wallet state machine states.
 */
export type BurnerState = 'idle' | 'funding' | 'active' | 'draining' | 'failed';

/**
 * Information about the current burner wallet.
 */
export interface BurnerWalletInfo {
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
  burnerBalance: number;
  burnerPublicKey: PublicKey | null;
}

// ============================================================================
// Burner Wallet Functions
// ============================================================================

/**
 * Creates a new ephemeral keypair and stores it securely.
 * Overwrites any existing stored burner.
 *
 * @param mainWalletAddress - The connected main wallet's public key (string)
 * @returns New Keypair instance
 */
export async function createBurnerWallet(mainWalletAddress: string): Promise<Keypair> {
  console.log('[burnerWallet] createBurnerWallet called - creating NEW burner for:', mainWalletAddress);
  const keypair = Keypair.generate();

  const stored: StoredBurner = {
    secretKey: bs58.encode(keypair.secretKey),
    mainWalletAddress,
    createdAt: Date.now(),
  };

  await SecureStorage.setItemAsync(BURNER_STORAGE_KEY, JSON.stringify(stored));
  console.log('[burnerWallet] NEW burner created and stored:', keypair.publicKey.toBase58());

  return keypair;
}

/**
 * Loads an existing burner wallet from secure storage.
 * Returns null if no stored burner or if mainWalletAddress doesn't match.
 *
 * @param mainWalletAddress - The connected main wallet's public key (string)
 * @returns Keypair if found and matches main wallet, null otherwise
 */
export async function loadBurnerWallet(mainWalletAddress: string): Promise<Keypair | null> {
  console.log('[burnerWallet] loadBurnerWallet called with address:', mainWalletAddress);
  try {
    const data = await SecureStorage.getItemAsync(BURNER_STORAGE_KEY);
    if (!data) {
      console.log('[burnerWallet] No stored burner found in SecureStorage');
      return null;
    }

    const stored: StoredBurner = JSON.parse(data);
    console.log('[burnerWallet] Found stored burner:', {
      storedMainWallet: stored.mainWalletAddress,
      requestedMainWallet: mainWalletAddress,
      match: stored.mainWalletAddress === mainWalletAddress,
      createdAt: new Date(stored.createdAt).toISOString(),
    });

    // Validate main wallet address matches
    if (stored.mainWalletAddress !== mainWalletAddress) {
      console.warn('[burnerWallet] Main wallet address mismatch - returning null');
      return null;
    }

    // Decode and reconstruct keypair
    const secretKey = bs58.decode(stored.secretKey);
    const keypair = Keypair.fromSecretKey(secretKey);
    console.log('[burnerWallet] Successfully loaded burner keypair:', keypair.publicKey.toBase58());
    return keypair;
  } catch (error) {
    console.error('[burnerWallet] Failed to load burner wallet:', error);
    return null;
  }
}

/**
 * Removes burner wallet from secure storage.
 * Should only be called after draining funds.
 */
export async function clearBurnerWallet(): Promise<void> {
  await SecureStorage.deleteItemAsync(BURNER_STORAGE_KEY);
}

/**
 * Gets information about the current burner wallet.
 *
 * @param connection - Solana connection
 * @param mainWalletAddress - The connected main wallet's public key
 * @returns Burner info including balance, or null if no burner
 */
export async function getBurnerInfo(
  connection: Connection,
  mainWalletAddress: string
): Promise<BurnerWalletInfo | null> {
  try {
    const data = await SecureStorage.getItemAsync(BURNER_STORAGE_KEY);
    if (!data) {
      return null;
    }

    const stored: StoredBurner = JSON.parse(data);

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
    console.error('Failed to get burner info:', error);
    return null;
  }
}

/**
 * Creates a transaction to transfer SOL from main wallet to burner.
 * Note: This transaction must be signed by main wallet via Mobile Wallet Adapter.
 *
 * @param mainWallet - Main wallet public key (payer)
 * @param burnerWallet - Burner wallet public key (recipient)
 * @param amount - Amount in lamports (default: 5,000,000 = 0.005 SOL)
 * @returns Unsigned Transaction
 */
export function createFundBurnerTransaction(
  mainWallet: PublicKey,
  burnerWallet: PublicKey,
  amount: number = DEFAULT_FUND_AMOUNT
): Transaction {
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: mainWallet,
      toPubkey: burnerWallet,
      lamports: amount,
    })
  );

  return transaction;
}

/**
 * Transfers all remaining SOL from burner back to main wallet.
 * Transaction signed by burner (automatic, no user interaction).
 *
 * @param connection - Solana connection
 * @param burnerKeypair - Burner wallet keypair (signer)
 * @param mainWalletAddress - Main wallet to receive funds
 * @returns Transaction signature
 * @throws Error if balance insufficient for transaction fee
 */
export async function drainBurnerToMain(
  connection: Connection,
  burnerKeypair: Keypair,
  mainWalletAddress: PublicKey
): Promise<string> {
  const balance = await connection.getBalance(burnerKeypair.publicKey);

  const transferAmount = balance - ESTIMATED_TX_FEE;
  if (transferAmount <= 0) {
    throw new Error('Insufficient balance to drain');
  }

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: burnerKeypair.publicKey,
      toPubkey: mainWalletAddress,
      lamports: transferAmount,
    })
  );

  return sendBurnerTransaction(connection, transaction, burnerKeypair);
}

/**
 * Checks burner balance and returns low balance warning if applicable.
 *
 * @param connection - Solana connection
 * @param burnerPublicKey - Burner wallet public key
 * @returns Balance in lamports and whether it's below threshold
 */
export async function checkBurnerBalance(
  connection: Connection,
  burnerPublicKey: PublicKey
): Promise<{ balance: number; isLow: boolean }> {
  const balance = await connection.getBalance(burnerPublicKey);
  return {
    balance,
    isLow: balance < LOW_BALANCE_THRESHOLD,
  };
}

/**
 * Signs and sends a transaction using the burner keypair.
 *
 * @param connection - Solana connection
 * @param transaction - Transaction to send
 * @param burnerKeypair - Burner keypair for signing
 * @returns Transaction signature
 */
export async function sendBurnerTransaction(
  connection: Connection,
  transaction: Transaction,
  burnerKeypair: Keypair
): Promise<string> {
  transaction.feePayer = burnerKeypair.publicKey;

  // Add a random compute unit price to ensure transaction uniqueness on localnet.
  // This prevents "transaction already processed" errors when making similar
  // transactions (e.g., moving back and forth) within the same blockhash slot.
  const randomMicroLamports = Math.floor(Math.random() * 1000) + 1;
  transaction.add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: randomMicroLamports })
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(
    SOLANA_CONFIG.commitment
  );
  transaction.recentBlockhash = blockhash;
  transaction.sign(burnerKeypair);

  const signature = await connection.sendRawTransaction(transaction.serialize());
  await connection.confirmTransaction(
    {
      signature,
      blockhash,
      lastValidBlockHeight,
    },
    SOLANA_CONFIG.commitment
  );

  return signature;
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
  const burner = await loadBurnerWallet(mainWalletAddress);

  if (!burner) {
    return {
      hasPendingSession: false,
      burnerBalance: 0,
      burnerPublicKey: null,
    };
  }

  const balance = await connection.getBalance(burner.publicKey);

  if (balance > 0) {
    return {
      hasPendingSession: true,
      burnerBalance: balance,
      burnerPublicKey: burner.publicKey,
    };
  }

  // Burner exists but empty - Keep it! It might be needed for an active session.
  // We can top it up later if needed.
  return {
    hasPendingSession: true, // Treat as pending so it loads
    burnerBalance: 0,
    burnerPublicKey: burner.publicKey,
  };
}
