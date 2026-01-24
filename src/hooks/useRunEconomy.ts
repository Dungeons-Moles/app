/**
 * useRunEconomy - Run purchase and balance management hook
 * T067: Create useRunEconomy hook in src/hooks/useRunEconomy.ts (purchase, balance check)
 */

import { useState, useCallback, useEffect } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { useSolanaConnection } from '../contexts/SolanaConnectionContext';
import { useProfile } from '../contexts/ProfileContext';

/** Price for 20 runs in lamports (0.001 SOL) */
export const RUN_PRICE_LAMPORTS = 1_000_000;
/** Number of runs per purchase */
export const RUNS_PER_PURCHASE = 20;
/** Minimum SOL balance required (price + transaction fees) */
export const MIN_BALANCE_LAMPORTS = RUN_PRICE_LAMPORTS + 10_000;

interface UseRunEconomyResult {
  /** Current available runs */
  availableRuns: number;
  /** Current SOL balance in lamports */
  solBalance: number;
  /** Whether balance is sufficient for purchase */
  canAffordPurchase: boolean;
  /** Whether a purchase is in progress */
  isPurchasing: boolean;
  /** Purchase error message if any */
  purchaseError: string | null;
  /** Whether runs are low (3 or fewer) */
  isRunsLow: boolean;
  /** Whether runs are depleted (0) */
  isRunsDepleted: boolean;
  /** Purchase 20 runs */
  purchaseRuns: () => Promise<boolean>;
  /** Refresh balance */
  refreshBalance: () => Promise<void>;
  /** Clear purchase error */
  clearError: () => void;
}

export function useRunEconomy(): UseRunEconomyResult {
  const { wallet } = useWallet();
  const { connection } = useSolanaConnection();
  const { availableRuns, purchaseRuns: profilePurchaseRuns, isPurchasing } = useProfile();

  const [solBalance, setSolBalance] = useState(0);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  const refreshBalance = useCallback(async () => {
    if (!wallet.publicKey) {
      setSolBalance(0);
      return;
    }

    setIsLoadingBalance(true);
    try {
      const balance = await connection.getBalance(wallet.publicKey);
      setSolBalance(balance);
    } catch (err) {
      console.error('[useRunEconomy] Failed to fetch balance:', err);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [connection, wallet.publicKey]);

  // Fetch balance on mount and when wallet changes
  useEffect(() => {
    if (wallet.publicKey) {
      refreshBalance();
    }
  }, [wallet.publicKey, refreshBalance]);

  const canAffordPurchase = solBalance >= MIN_BALANCE_LAMPORTS;
  const isRunsLow = availableRuns <= 3;
  const isRunsDepleted = availableRuns === 0;

  const purchaseRuns = useCallback(async (): Promise<boolean> => {
    setPurchaseError(null);

    // Check balance first
    if (!canAffordPurchase) {
      const requiredSol = (MIN_BALANCE_LAMPORTS / 1e9).toFixed(4);
      const currentSol = (solBalance / 1e9).toFixed(4);
      setPurchaseError(`Insufficient SOL. Need ${requiredSol} SOL, have ${currentSol} SOL`);
      return false;
    }

    try {
      const result = await profilePurchaseRuns();
      if (result.success) {
        // Refresh balance after successful purchase
        await refreshBalance();
        return true;
      } else {
        setPurchaseError(result.error ?? 'Purchase failed');
        return false;
      }
    } catch (err) {
      console.error('[useRunEconomy] Purchase failed:', err);
      setPurchaseError(err instanceof Error ? err.message : 'Purchase failed');
      return false;
    }
  }, [canAffordPurchase, solBalance, profilePurchaseRuns, refreshBalance]);

  const clearError = useCallback(() => {
    setPurchaseError(null);
  }, []);

  return {
    availableRuns,
    solBalance,
    canAffordPurchase,
    isPurchasing,
    purchaseError,
    isRunsLow,
    isRunsDepleted,
    purchaseRuns,
    refreshBalance,
    clearError,
  };
}

/**
 * Format lamports as SOL string
 */
export function formatSol(lamports: number): string {
  return (lamports / 1e9).toFixed(4);
}

/**
 * Format run count with low/depleted indicator
 */
export function formatRunCount(runs: number): string {
  if (runs === 0) return '0 (depleted)';
  if (runs <= 3) return `${runs} (low)`;
  return `${runs}`;
}
