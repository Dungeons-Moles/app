/**
 * useBurnerWallet Hook
 *
 * React hook for managing burner wallet lifecycle.
 * Implements a 5-state machine: idle, funding, active, draining, failed.
 */

import { useCallback, useState, useEffect, useRef } from 'react';
import { Keypair, Transaction } from '@solana/web3.js';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import {
  createBurnerWallet,
  loadBurnerWallet,
  clearBurnerWallet,
  createFundBurnerTransaction,
  drainBurnerToMain,
  checkBurnerBalance,
  checkForPendingSession,
  DEFAULT_FUND_AMOUNT,
  LOW_BALANCE_THRESHOLD,
  type BurnerState,
} from '@/services/solana/burnerWallet';

// ============================================================================
// Types
// ============================================================================

export interface UseBurnerWalletReturn {
  /** Current burner wallet state */
  state: BurnerState;
  /** Burner keypair (null if not active) */
  keypair: Keypair | null;
  /** Current balance in lamports */
  balance: number;
  /** Whether balance is below low threshold */
  isLowBalance: boolean;
  /** Error message if in failed state */
  error: string | null;
  /** Create a new burner and fund it from main wallet */
  createAndFund: (amount?: number) => Promise<boolean>;
  /** Create a burner without funding (returns fund transaction for combining) */
  createWithoutFunding: (
    amount?: number
  ) => Promise<{ keypair: Keypair; fundTransaction: Transaction } | null>;
  /** Mark burner as active after external funding transaction confirms */
  markAsActive: (burnerKeypair: Keypair) => Promise<void>;
  /** Top up the burner with additional SOL */
  topUp: (amount?: number) => Promise<boolean>;
  /** Drain all remaining SOL back to main wallet */
  drain: () => Promise<boolean>;
  /** Clear the burner wallet from storage */
  clear: () => Promise<void>;
  /** Check for pending session from previous app launch */
  checkPendingSession: () => Promise<boolean>;
  /** Refresh balance */
  refreshBalance: () => Promise<void>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useBurnerWallet(): UseBurnerWalletReturn {
  const { wallet, signAndSendTransaction } = useWallet();
  const { connection } = useSolanaConnection();

  const [state, setState] = useState<BurnerState>('idle');
  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [balance, setBalance] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Refresh the current burner balance.
   */
  const refreshBalance = useCallback(async () => {
    if (!keypair) {
      return;
    }

    try {
      const { balance: newBalance } = await checkBurnerBalance(connection, keypair.publicKey);
      if (isMountedRef.current) {
        setBalance(newBalance);
      }
    } catch (err) {
      console.error('Failed to refresh burner balance:', err);
    }
  }, [connection, keypair]);

  /**
   * Check for a pending session from previous app launch.
   * Returns true if a pending session was found and loaded.
   */
  const checkPendingSession = useCallback(async (): Promise<boolean> => {
    if (!wallet.address) {
      return false;
    }

    try {
      const recovery = await checkForPendingSession(wallet.address, connection);

      if (recovery.hasPendingSession && recovery.burnerPublicKey) {
        // Load the existing burner
        const existingBurner = await loadBurnerWallet(wallet.address);
        if (existingBurner && isMountedRef.current) {
          setKeypair(existingBurner);
          setBalance(recovery.burnerBalance);
          setState('active');
          return true;
        }
      }

      return false;
    } catch (err) {
      console.error('Failed to check for pending session:', err);
      return false;
    }
  }, [connection, wallet.address]);

  /**
   * Creates a new burner wallet and funds it from the main wallet.
   * Requires a signature from the main wallet.
   */
  const createAndFund = useCallback(
    async (amount: number = DEFAULT_FUND_AMOUNT): Promise<boolean> => {
      console.log('[useBurnerWallet] createAndFund called', {
        walletAddress: wallet.address,
        walletPublicKey: wallet.publicKey?.toBase58(),
        amount,
      });

      if (!wallet.address || !wallet.publicKey) {
        console.log('[useBurnerWallet] No wallet connected');
        if (isMountedRef.current) {
          setError('Wallet not connected');
          setState('failed');
        }
        return false;
      }

      if (isMountedRef.current) {
        setState('funding');
        setError(null);
      }

      try {
        // Create a new burner wallet
        console.log('[useBurnerWallet] Creating new burner wallet...');
        const newBurner = await createBurnerWallet(wallet.address);
        console.log('[useBurnerWallet] Burner created:', newBurner.publicKey.toBase58());

        // Create fund transaction
        console.log('[useBurnerWallet] Creating fund transaction...');
        const fundTx = createFundBurnerTransaction(wallet.publicKey, newBurner.publicKey, amount);

        // Sign and send via main wallet (requires user signature)
        console.log('[useBurnerWallet] Requesting wallet signature for funding...');
        const signature = await signAndSendTransaction(fundTx);
        console.log('[useBurnerWallet] Transaction signed and sent:', signature);
        await connection.confirmTransaction(signature, 'confirmed');
        console.log('[useBurnerWallet] Transaction confirmed');

        // Verify balance
        const { balance: newBalance } = await checkBurnerBalance(connection, newBurner.publicKey);
        console.log('[useBurnerWallet] Burner balance verified:', newBalance);

        if (isMountedRef.current) {
          setKeypair(newBurner);
          setBalance(newBalance);
          setState('active');
        }

        return true;
      } catch (err) {
        console.error('[useBurnerWallet] Failed to create and fund burner:', err);
        if (isMountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to fund burner wallet');
          setState('failed');
        }
        return false;
      }
    },
    [connection, signAndSendTransaction, wallet.address, wallet.publicKey]
  );

  /**
   * Top up the burner with additional SOL.
   * Requires a signature from the main wallet.
   */
  const topUp = useCallback(
    async (amount: number = DEFAULT_FUND_AMOUNT): Promise<boolean> => {
      if (!wallet.publicKey || !keypair) {
        if (isMountedRef.current) {
          setError('Wallet or burner not available');
        }
        return false;
      }

      try {
        // Create fund transaction
        const fundTx = createFundBurnerTransaction(wallet.publicKey, keypair.publicKey, amount);

        // Sign and send via main wallet
        const signature = await signAndSendTransaction(fundTx);
        await connection.confirmTransaction(signature, 'confirmed');

        // Refresh balance
        const { balance: newBalance } = await checkBurnerBalance(connection, keypair.publicKey);

        if (isMountedRef.current) {
          setBalance(newBalance);
        }

        return true;
      } catch (err) {
        console.error('Failed to top up burner:', err);
        if (isMountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to top up burner');
        }
        return false;
      }
    },
    [connection, keypair, signAndSendTransaction, wallet.publicKey]
  );

  /**
   * Drain all remaining SOL back to main wallet.
   * Signed automatically by burner (no user interaction).
   */
  const drain = useCallback(async (): Promise<boolean> => {
    if (!wallet.publicKey || !keypair) {
      if (isMountedRef.current) {
        setError('Wallet or burner not available');
      }
      return false;
    }

    if (isMountedRef.current) {
      setState('draining');
      setError(null);
    }

    try {
      await drainBurnerToMain(connection, keypair, wallet.publicKey);

      if (isMountedRef.current) {
        setBalance(0);
        setState('idle');
      }

      return true;
    } catch (err) {
      console.error('Failed to drain burner:', err);
      if (isMountedRef.current) {
        // If drain fails due to insufficient balance, that's okay - just proceed
        if (err instanceof Error && err.message.includes('Insufficient balance')) {
          setState('idle');
          return true;
        }
        setError(err instanceof Error ? err.message : 'Failed to drain burner');
        setState('failed');
      }
      return false;
    }
  }, [connection, keypair, wallet.publicKey]);

  /**
   * Clear the burner wallet from storage.
   * Should be called after drain.
   */
  const clear = useCallback(async (): Promise<void> => {
    await clearBurnerWallet();
    if (isMountedRef.current) {
      setKeypair(null);
      setBalance(0);
      setState('idle');
      setError(null);
    }
  }, []);

  /**
   * Create a burner wallet without funding it.
   * Used when combining with other instructions in a single transaction.
   * Returns the keypair and the fund transaction instruction.
   */
  const createWithoutFunding = useCallback(
    async (
      amount: number = DEFAULT_FUND_AMOUNT
    ): Promise<{
      keypair: Keypair;
      fundTransaction: ReturnType<typeof createFundBurnerTransaction>;
    } | null> => {
      if (!wallet.address || !wallet.publicKey) {
        console.log('[useBurnerWallet] createWithoutFunding: No wallet connected');
        return null;
      }

      try {
        // Create a new burner wallet
        const newBurner = await createBurnerWallet(wallet.address);
        console.log(
          '[useBurnerWallet] Burner created (not funded yet):',
          newBurner.publicKey.toBase58()
        );

        // Create fund transaction (but don't send it)
        const fundTx = createFundBurnerTransaction(wallet.publicKey, newBurner.publicKey, amount);

        // Update state
        if (isMountedRef.current) {
          setKeypair(newBurner);
          setState('funding');
        }

        return { keypair: newBurner, fundTransaction: fundTx };
      } catch (err) {
        console.error('[useBurnerWallet] Failed to create burner:', err);
        if (isMountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to create burner wallet');
          setState('failed');
        }
        return null;
      }
    },
    [wallet.address, wallet.publicKey]
  );

  /**
   * Mark burner as active after external funding transaction confirms.
   * Called after a combined transaction that includes the fund instruction.
   */
  const markAsActive = useCallback(
    async (burnerKeypair: Keypair): Promise<void> => {
      if (isMountedRef.current) {
        setKeypair(burnerKeypair);
        const { balance: newBalance } = await checkBurnerBalance(
          connection,
          burnerKeypair.publicKey
        );
        setBalance(newBalance);
        setState('active');
      }
    },
    [connection]
  );

  // Auto-load existing burner when wallet connects
  useEffect(() => {
    if (wallet.address && state === 'idle') {
      checkPendingSession();
    }
  }, [wallet.address, state, checkPendingSession]);

  // Periodically refresh balance when active
  useEffect(() => {
    if (state !== 'active' || !keypair) {
      return;
    }

    const interval = setInterval(refreshBalance, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [state, keypair, refreshBalance]);

  return {
    state,
    keypair,
    balance,
    isLowBalance: balance < LOW_BALANCE_THRESHOLD,
    error,
    createAndFund,
    createWithoutFunding,
    markAsActive,
    topUp,
    drain,
    clear,
    checkPendingSession,
    refreshBalance,
  };
}
