/**
 * useSessionSigner Hook
 *
 * React hook for managing sessionSigner wallet lifecycle.
 * Implements a 5-state machine: idle, funding, active, draining, failed.
 */

import { useCallback, useState, useEffect, useRef } from 'react';
import { Keypair, Transaction } from '@solana/web3.js';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import {
  createSessionSignerWallet,
  loadSessionSignerWallet,
  storeSessionSignerWallet,
  storeSessionSignerForSession,
  loadSessionSignerForSession,
  clearSessionSignerWallet,
  createFundSessionSignerTransaction,
  drainSessionSignerToMain,
  checkSessionSignerBalance,
  checkForPendingSession,
  DEFAULT_FUND_AMOUNT,
  LOW_BALANCE_THRESHOLD,
  type SessionSignerState,
} from '@/services/solana/sessionSigner';
import { SOLANA_CONFIG } from '@/services/solana/config';

// ============================================================================
// Types
// ============================================================================

export interface UseSessionSignerReturn {
  /** Current sessionSigner wallet state */
  state: SessionSignerState;
  /** SessionSigner keypair (null if not active) */
  keypair: Keypair | null;
  /** Current balance in lamports */
  balance: number;
  /** Whether balance is below low threshold */
  isLowBalance: boolean;
  /** Error message if in failed state */
  error: string | null;
  /** Create a new sessionSigner and fund it from main wallet */
  createAndFund: (amount?: number) => Promise<boolean>;
  /** Create a sessionSigner without funding (returns fund transaction for combining) */
  createWithoutFunding: (
    amount?: number
  ) => Promise<{ keypair: Keypair; fundTransaction: Transaction } | null>;
  /** Create a sessionSigner from a pre-derived keypair without funding */
  createWithoutFundingFromKeypair: (
    derivedKeypair: Keypair,
    amount?: number
  ) => Promise<{ keypair: Keypair; fundTransaction: Transaction } | null>;
  /** Mark sessionSigner as active after external funding transaction confirms */
  markAsActive: (sessionSignerKeypair: Keypair) => Promise<void>;
  /** Top up the sessionSigner with additional SOL */
  topUp: (amount?: number) => Promise<boolean>;
  /** Drain all remaining SOL back to main wallet */
  drain: () => Promise<boolean>;
  /** Clear the sessionSigner wallet from storage */
  clear: () => Promise<void>;
  /** Check for pending session from previous app launch */
  checkPendingSession: () => Promise<boolean>;
  /** Associate current keypair with a specific session PDA for later recovery */
  associateWithSession: (keypair: Keypair, sessionPda: string) => Promise<void>;
  /** Load the keypair associated with a specific session PDA */
  loadForSession: (sessionPda: string) => Promise<boolean>;
  /** Refresh balance */
  refreshBalance: () => Promise<void>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useSessionSigner(): UseSessionSignerReturn {
  const { wallet, signAndSendTransaction } = useWallet();
  const { connection } = useSolanaConnection();
  const walletAddress = wallet.address ?? wallet.publicKey?.toBase58() ?? null;

  const [state, setState] = useState<SessionSignerState>('idle');
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
   * Refresh the current sessionSigner balance.
   */
  const refreshBalance = useCallback(async () => {
    if (!keypair) {
      return;
    }

    try {
      const { balance: newBalance } = await checkSessionSignerBalance(connection, keypair.publicKey);
      if (isMountedRef.current) {
        setBalance(newBalance);
      }
    } catch (err) {
      console.error('Failed to refresh sessionSigner balance:', err);
    }
  }, [connection, keypair]);

  /**
   * Check for a pending session from previous app launch.
   * Returns true if a pending session was found and loaded.
   */
  const checkPendingSession = useCallback(async (): Promise<boolean> => {
    console.log('[useSessionSigner] checkPendingSession called | wallet.address:', walletAddress);
    if (!walletAddress) {
      console.log('[useSessionSigner] checkPendingSession: no wallet address, returning false');
      return false;
    }

    try {
      const recovery = await checkForPendingSession(walletAddress, connection);
      console.log('[useSessionSigner] checkPendingSession recovery result:', {
        hasPendingSession: recovery.hasPendingSession,
        sessionSignerBalance: recovery.sessionSignerBalance,
        sessionSignerPublicKey: recovery.sessionSignerPublicKey?.toBase58() ?? null,
      });

      if (recovery.hasPendingSession && recovery.sessionSignerPublicKey) {
        // Load the existing sessionSigner
        const existingSessionSigner = await loadSessionSignerWallet(walletAddress);
        console.log('[useSessionSigner] checkPendingSession: existingSessionSigner loaded?', !!existingSessionSigner);
        if (existingSessionSigner && isMountedRef.current) {
          setKeypair(existingSessionSigner);
          setBalance(recovery.sessionSignerBalance);
          setState('active');
          console.log('[useSessionSigner] checkPendingSession: sessionSigner restored successfully');
          return true;
        }
      }

      console.log('[useSessionSigner] checkPendingSession: no pending session to restore');
      return false;
    } catch (err) {
      console.error('[useSessionSigner] Failed to check for pending session:', err);
      return false;
    }
  }, [connection, walletAddress]);

  /**
   * Creates a new sessionSigner wallet and funds it from the main wallet.
   * Requires a signature from the main wallet.
   */
  const createAndFund = useCallback(
    async (amount: number = DEFAULT_FUND_AMOUNT): Promise<boolean> => {
      console.log('[useSessionSigner] createAndFund called', {
        walletAddress: wallet.address,
        walletPublicKey: wallet.publicKey?.toBase58(),
        amount,
      });

      if (!walletAddress || !wallet.publicKey) {
        console.log('[useSessionSigner] No wallet connected');
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
        // Create a new sessionSigner wallet
        console.log('[useSessionSigner] Creating new sessionSigner wallet...');
        const newSessionSigner = await createSessionSignerWallet(walletAddress);
        console.log('[useSessionSigner] SessionSigner created:', newSessionSigner.publicKey.toBase58());

        // Create fund transaction
        console.log('[useSessionSigner] Creating fund transaction...');
        const fundTx = createFundSessionSignerTransaction(wallet.publicKey, newSessionSigner.publicKey, amount);

        // Sign and send via main wallet (requires user signature)
        console.log('[useSessionSigner] Requesting wallet signature for funding...');
        const signature = await signAndSendTransaction(fundTx);
        console.log('[useSessionSigner] Transaction signed and sent:', signature);
        await connection.confirmTransaction(signature, SOLANA_CONFIG.commitment);
        console.log('[useSessionSigner] Transaction confirmed');

        // Verify balance
        const { balance: newBalance } = await checkSessionSignerBalance(connection, newSessionSigner.publicKey);
        console.log('[useSessionSigner] SessionSigner balance verified:', newBalance);

        if (isMountedRef.current) {
          setKeypair(newSessionSigner);
          setBalance(newBalance);
          setState('active');
        }

        return true;
      } catch (err) {
        console.error('[useSessionSigner] Failed to create and fund sessionSigner:', err);
        if (isMountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to fund sessionSigner wallet');
          setState('failed');
        }
        return false;
      }
    },
    [connection, signAndSendTransaction, walletAddress, wallet.publicKey]
  );

  /**
   * Top up the sessionSigner with additional SOL.
   * Requires a signature from the main wallet.
   */
  const topUp = useCallback(
    async (amount: number = DEFAULT_FUND_AMOUNT): Promise<boolean> => {
      if (!wallet.publicKey || !keypair) {
        if (isMountedRef.current) {
          setError('Wallet or sessionSigner not available');
        }
        return false;
      }

      try {
        // Create fund transaction
        const fundTx = createFundSessionSignerTransaction(wallet.publicKey, keypair.publicKey, amount);

        // Sign and send via main wallet
        const signature = await signAndSendTransaction(fundTx);
        await connection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

        // Refresh balance
        const { balance: newBalance } = await checkSessionSignerBalance(connection, keypair.publicKey);

        if (isMountedRef.current) {
          setBalance(newBalance);
        }

        return true;
      } catch (err) {
        console.error('Failed to top up sessionSigner:', err);
        if (isMountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to top up sessionSigner');
        }
        return false;
      }
    },
    [connection, keypair, signAndSendTransaction, wallet.publicKey]
  );

  /**
   * Drain all remaining SOL back to main wallet.
   * Signed automatically by sessionSigner (no user interaction).
   */
  const drain = useCallback(async (): Promise<boolean> => {
    if (!wallet.publicKey || !keypair) {
      if (isMountedRef.current) {
        setError('Wallet or sessionSigner not available');
      }
      return false;
    }

    if (isMountedRef.current) {
      setState('draining');
      setError(null);
    }

    try {
      await drainSessionSignerToMain(connection, keypair, wallet.publicKey);

      if (isMountedRef.current) {
        setBalance(0);
        setState('idle');
      }

      return true;
    } catch (err) {
      console.error('Failed to drain sessionSigner:', err);
      if (isMountedRef.current) {
        // If drain fails due to insufficient balance, that's okay - just proceed
        if (
          err instanceof Error &&
          (err.message.includes('Insufficient balance') ||
            err.message.toLowerCase().includes('insufficient lamports'))
        ) {
          setState('idle');
          return true;
        }
        setError(err instanceof Error ? err.message : 'Failed to drain sessionSigner');
        setState('failed');
      }
      return false;
    }
  }, [connection, keypair, wallet.publicKey]);

  /**
   * Clear the sessionSigner wallet from storage.
   * Should be called after drain.
   */
  const clear = useCallback(async (): Promise<void> => {
    await clearSessionSignerWallet();
    if (isMountedRef.current) {
      setKeypair(null);
      setBalance(0);
      setState('idle');
      setError(null);
    }
  }, []);

  /**
   * Create a sessionSigner wallet without funding it.
   * Used when combining with other instructions in a single transaction.
   * Returns the keypair and the fund transaction instruction.
   */
  const createWithoutFunding = useCallback(
    async (
      amount: number = DEFAULT_FUND_AMOUNT
    ): Promise<{
      keypair: Keypair;
      fundTransaction: ReturnType<typeof createFundSessionSignerTransaction>;
    } | null> => {
      if (!walletAddress || !wallet.publicKey) {
        console.log('[useSessionSigner] createWithoutFunding: No wallet connected');
        return null;
      }

      try {
        // Generate sessionSigner and persist immediately as "pending" so the keypair
        // survives an app crash between tx confirmation and markAsActive.
        // If the tx never lands, checkPendingSession cleans up the orphan.
        const newSessionSigner = Keypair.generate();
        await storeSessionSignerWallet(walletAddress, newSessionSigner, Date.now(), true);
        console.log(
          '[useSessionSigner] SessionSigner created and persisted (pending):',
          newSessionSigner.publicKey.toBase58()
        );

        // Create fund transaction (but don't send it)
        const fundTx = createFundSessionSignerTransaction(wallet.publicKey, newSessionSigner.publicKey, amount);

        // Update state
        if (isMountedRef.current) {
          setKeypair(newSessionSigner);
          setState('funding');
        }

        return { keypair: newSessionSigner, fundTransaction: fundTx };
      } catch (err) {
        console.error('[useSessionSigner] Failed to create sessionSigner:', err);
        if (isMountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to create sessionSigner wallet');
          setState('failed');
        }
        return null;
      }
    },
    [walletAddress, wallet.publicKey]
  );

  const createWithoutFundingFromKeypair = useCallback(
    async (
      derivedKeypair: Keypair,
      amount: number = DEFAULT_FUND_AMOUNT
    ): Promise<{
      keypair: Keypair;
      fundTransaction: ReturnType<typeof createFundSessionSignerTransaction>;
    } | null> => {
      if (!walletAddress || !wallet.publicKey) {
        console.log('[useSessionSigner] createWithoutFundingFromKeypair: No wallet connected');
        return null;
      }

      try {
        await storeSessionSignerWallet(walletAddress, derivedKeypair, Date.now(), true);
        console.log(
          '[useSessionSigner] Derived sessionSigner persisted (pending):',
          derivedKeypair.publicKey.toBase58()
        );

        const fundTx = createFundSessionSignerTransaction(
          wallet.publicKey,
          derivedKeypair.publicKey,
          amount
        );

        if (isMountedRef.current) {
          setKeypair(derivedKeypair);
          setState('funding');
        }

        return { keypair: derivedKeypair, fundTransaction: fundTx };
      } catch (err) {
        console.error('[useSessionSigner] Failed to persist derived sessionSigner:', err);
        if (isMountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to create sessionSigner wallet');
          setState('failed');
        }
        return null;
      }
    },
    [walletAddress, wallet.publicKey]
  );

  /**
   * Mark sessionSigner as active after external funding transaction confirms.
   * Called after a combined transaction that includes the fund instruction.
   */
  const markAsActive = useCallback(
    async (sessionSignerKeypair: Keypair): Promise<void> => {
      if (!walletAddress) {
        throw new Error('Wallet not connected');
      }
      await storeSessionSignerWallet(walletAddress, sessionSignerKeypair);
      if (isMountedRef.current) {
        setKeypair(sessionSignerKeypair);
        const { balance: newBalance } = await checkSessionSignerBalance(
          connection,
          sessionSignerKeypair.publicKey
        );
        setBalance(newBalance);
        setState('active');
      }
    },
    [connection, walletAddress]
  );

  /**
   * Associate a keypair with a specific session PDA so it can be recovered
   * later when switching between concurrent sessions.
   */
  const associateWithSession = useCallback(
    async (sessionKeypair: Keypair, sessionPda: string): Promise<void> => {
      if (!walletAddress) return;
      await storeSessionSignerForSession(walletAddress, sessionKeypair, sessionPda);
    },
    [walletAddress]
  );

  /**
   * Load the keypair stored for a specific session PDA.
   * Returns true if found and set, false otherwise.
   */
  const loadForSession = useCallback(
    async (sessionPda: string): Promise<boolean> => {
      if (!walletAddress) return false;
      try {
        const loaded = await loadSessionSignerForSession(walletAddress, sessionPda);
        if (loaded && isMountedRef.current) {
          setKeypair(loaded);
          setState('active');
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [walletAddress]
  );

  // Auto-load existing sessionSigner when wallet connects
  useEffect(() => {
    if (walletAddress && state === 'idle') {
      checkPendingSession();
    }
  }, [walletAddress, state, checkPendingSession]);

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
    createWithoutFundingFromKeypair,
    markAsActive,
    topUp,
    drain,
    clear,
    checkPendingSession,
    associateWithSession,
    loadForSession,
    refreshBalance,
  };
}
