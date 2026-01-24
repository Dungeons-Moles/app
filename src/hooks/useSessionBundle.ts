/**
 * useSessionBundle Hook
 *
 * Provides functionality to create atomic session initialization transactions
 * bundling 5 instructions into a single transaction.
 *
 * @see contracts/session-bundle.md for specifications
 */

import { useState, useCallback } from 'react';
import { PublicKey, Keypair } from '@solana/web3.js';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { useWallet } from '@/contexts/WalletContext';
import {
  createSessionBundle,
  createSimplifiedSessionBundle,
  validateSessionCreation,
  type SessionBundleResult,
  type SessionPrograms,
} from '@/services/solana/sessionBundle';
import {
  deriveSessionPda,
  deriveGameStatePda,
  deriveMapEnemiesPda,
  deriveMapPoisPda,
  deriveInventoryPda,
} from '@/services/solana/constants';
import type { TransactionResult } from '@/types/solana';

// ============================================================================
// Types
// ============================================================================

export interface UseSessionBundleResult {
  /** Whether bundle creation is in progress */
  isCreating: boolean;
  /** Error message if any */
  error: string | null;
  /** Last created bundle result */
  bundleResult: SessionBundleResult | null;
  /** Create and send a full session bundle */
  createAndSendBundle: (
    campaignLevel: number,
    burnerKeypair: Keypair
  ) => Promise<TransactionResult & { sessionPda?: string }>;
  /** Create and send a simplified bundle (session + game state only) */
  createAndSendSimplifiedBundle: (
    campaignLevel: number,
    burnerKeypair: Keypair
  ) => Promise<TransactionResult & { sessionPda?: string }>;
  /** Validate if session can be created */
  validateSession: (
    campaignLevel: number,
    availableRuns: number,
    highestLevelUnlocked: number
  ) => Promise<{ valid: boolean; error?: string }>;
  /** Derive all PDAs for a session without creating it */
  deriveSessionPdas: (campaignLevel: number) => SessionPdas | null;
  /** Clear any errors */
  clearError: () => void;
}

export interface SessionPdas {
  sessionPda: PublicKey;
  gameStatePda: PublicKey;
  enemiesPda: PublicKey;
  poisPda: PublicKey;
  inventoryPda: PublicKey;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useSessionBundle(): UseSessionBundleResult {
  const { connection } = useSolanaConnection();
  const { wallet, signAndSendTransaction } = useWallet();

  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundleResult, setBundleResult] = useState<SessionBundleResult | null>(null);

  /**
   * Derive all PDAs for a session.
   */
  const deriveSessionPdas = useCallback(
    (campaignLevel: number): SessionPdas | null => {
      if (!wallet.publicKey) {
        return null;
      }

      const [sessionPda] = deriveSessionPda(wallet.publicKey, campaignLevel);
      const [gameStatePda] = deriveGameStatePda(sessionPda);
      const [enemiesPda] = deriveMapEnemiesPda(sessionPda);
      const [poisPda] = deriveMapPoisPda(sessionPda);
      const [inventoryPda] = deriveInventoryPda(sessionPda);

      return {
        sessionPda,
        gameStatePda,
        enemiesPda,
        poisPda,
        inventoryPda,
      };
    },
    [wallet.publicKey]
  );

  /**
   * Validate if a session can be created.
   */
  const validateSession = useCallback(
    async (
      campaignLevel: number,
      availableRuns: number,
      highestLevelUnlocked: number
    ): Promise<{ valid: boolean; error?: string }> => {
      if (!wallet.publicKey || !connection) {
        return { valid: false, error: 'Wallet not connected' };
      }

      return validateSessionCreation(connection, wallet.publicKey, campaignLevel, {
        availableRuns,
        highestLevelUnlocked,
      });
    },
    [connection, wallet.publicKey]
  );

  /**
   * Create and send a full session bundle (5 instructions).
   */
  const createAndSendBundle = useCallback(
    async (
      campaignLevel: number,
      burnerKeypair: Keypair
    ): Promise<TransactionResult & { sessionPda?: string }> => {
      if (!wallet.publicKey || !connection) {
        return { success: false, error: 'Wallet not connected' };
      }

      setIsCreating(true);
      setError(null);

      try {
        console.log('[useSessionBundle] Creating full session bundle for level:', campaignLevel);

        // Note: In a full implementation, we'd get these programs from a provider
        // For now, we'll create a simplified bundle that works without all programs
        // TODO: Inject program instances from context when available
        const programs: SessionPrograms = {
          sessionManager: null as any,
          gameplayState: null as any,
          fieldEnemies: null as any,
          poiSystem: null as any,
          inventory: null as any,
        };

        const result = await createSessionBundle(
          connection,
          programs,
          wallet.publicKey,
          burnerKeypair.publicKey,
          campaignLevel
        );

        setBundleResult(result);

        // Sign and send the transaction
        const signature = await signAndSendTransaction(result.transaction);
        await connection.confirmTransaction(signature, 'confirmed');

        console.log('[useSessionBundle] Bundle transaction confirmed:', signature);

        return {
          success: true,
          signature,
          sessionPda: result.sessionPda.toBase58(),
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to create session bundle';
        console.error('[useSessionBundle] Error creating bundle:', err);
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setIsCreating(false);
      }
    },
    [connection, wallet.publicKey, signAndSendTransaction]
  );

  /**
   * Create and send a simplified bundle (session + game state only).
   * This is useful when the full program suite isn't deployed.
   */
  const createAndSendSimplifiedBundle = useCallback(
    async (
      campaignLevel: number,
      burnerKeypair: Keypair
    ): Promise<TransactionResult & { sessionPda?: string }> => {
      if (!wallet.publicKey || !connection) {
        return { success: false, error: 'Wallet not connected' };
      }

      setIsCreating(true);
      setError(null);

      try {
        console.log(
          '[useSessionBundle] Creating simplified session bundle for level:',
          campaignLevel
        );

        // This would use the simplified bundle builder
        // For now, return an error indicating full implementation is needed
        return {
          success: false,
          error: 'Simplified bundle not yet implemented - use createAndSendBundle',
        };
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to create simplified bundle';
        console.error('[useSessionBundle] Error creating simplified bundle:', err);
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setIsCreating(false);
      }
    },
    [connection, wallet.publicKey]
  );

  /**
   * Clear any error state.
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isCreating,
    error,
    bundleResult,
    createAndSendBundle,
    createAndSendSimplifiedBundle,
    validateSession,
    deriveSessionPdas,
    clearError,
  };
}
