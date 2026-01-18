import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { SystemProgram, PublicKey } from '@solana/web3.js';
import { AnchorProvider } from '@coral-xyz/anchor';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import {
  createAnchorProvider,
  createSessionManagerProgram,
  createSessionManagerProgramWithProvider,
} from '@/services/solana/programs';
import { deriveGameSessionPda, deriveSessionCounterPda } from '@/services/solana/types';
import { getUserErrorMessage } from '@/services/solana/errors';
import { MAX_CAMPAIGN_LEVEL } from './useMapGenerator';
import type { TransactionResult } from '@/types/solana';
import type { OnChainGameSession } from '@/services/solana/types/session_manager';

export function useSessionManager() {
  const { wallet, signAndSendTransaction } = useWallet();
  const { connection } = useSolanaConnection();
  const readOnlyProgram = useMemo(() => createSessionManagerProgram(connection), [connection]);
  const [session, setSession] = useState<OnChainGameSession | null>(null);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const provider = useMemo(() => {
    if (!wallet.publicKey) {
      return null;
    }

    const walletAdapter: AnchorProvider['wallet'] = {
      publicKey: wallet.publicKey,
      signTransaction: async (transaction) => transaction,
      signAllTransactions: async (transactions) => transactions,
    } as AnchorProvider['wallet'];

    return createAnchorProvider(connection, walletAdapter);
  }, [connection, wallet.publicKey]);

  const writeProgram = useMemo(() => {
    if (!provider) {
      return null;
    }
    return createSessionManagerProgramWithProvider(provider);
  }, [provider]);

  const fetchSession = useCallback(async () => {
    if (!wallet.publicKey) {
      if (isMountedRef.current) setError('Wallet not connected');
      return;
    }

    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const [sessionPda] = deriveGameSessionPda(wallet.publicKey);
      const account = await (
        readOnlyProgram.account as {
          gameSession: {
            fetchNullable: (address: PublicKey) => Promise<any>;
          };
        }
      ).gameSession.fetchNullable(sessionPda);

      if (!isMountedRef.current) return;

      if (!account) {
        setSession(null);
        setHasActiveSession(false);
        return;
      }

      const sessionData: OnChainGameSession = {
        player: account.player,
        sessionId: BigInt(account.sessionId.toString()),
        campaignLevel: account.campaignLevel,
        startedAt: Number(account.startedAt),
        lastActivity: Number(account.lastActivity),
        isDelegated: account.isDelegated,
        stateHash: Array.from(account.stateHash),
        bump: account.bump,
      };

      setSession(sessionData);
      setHasActiveSession(true);
    } catch (fetchError) {
      if (isMountedRef.current) {
        setError(getUserErrorMessage(fetchError));
        setSession(null);
        setHasActiveSession(false);
      }
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [readOnlyProgram, wallet.publicKey]);

  const startSession = useCallback(
    async (campaignLevel: number): Promise<TransactionResult> => {
      console.log('[useSessionManager] startSession called', {
        campaignLevel,
        walletPublicKey: wallet.publicKey?.toBase58(),
        hasWriteProgram: !!writeProgram,
      });

      if (!wallet.publicKey || !writeProgram) {
        console.log('[useSessionManager] No wallet or write program');
        return { success: false, error: 'Wallet not connected' };
      }

      if (campaignLevel < 0 || campaignLevel > MAX_CAMPAIGN_LEVEL) {
        return {
          success: false,
          error: `Campaign level must be between 0 and ${MAX_CAMPAIGN_LEVEL}`,
        };
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const [sessionPda] = deriveGameSessionPda(wallet.publicKey);
        const [counterPda] = deriveSessionCounterPda();
        console.log('[useSessionManager] PDAs derived', {
          sessionPda: sessionPda.toBase58(),
          counterPda: counterPda.toBase58(),
        });

        console.log('[useSessionManager] Building transaction...');
        const transaction = await writeProgram.methods
          .startSession(campaignLevel)
          .accounts({
            gameSession: sessionPda,
            sessionCounter: counterPda,
            player: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .transaction();

        console.log('[useSessionManager] Requesting wallet signature...');
        const signature = await signAndSendTransaction(transaction);
        console.log('[useSessionManager] Transaction sent:', signature);
        await connection.confirmTransaction(signature, 'confirmed');
        console.log('[useSessionManager] Transaction confirmed');

        // Fetch the created session
        await fetchSession();

        return { success: true, signature };
      } catch (txError) {
        console.error('[useSessionManager] Transaction error:', txError);
        const message = getUserErrorMessage(txError);
        if (isMountedRef.current) setError(message);
        return { success: false, error: message };
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [connection, fetchSession, signAndSendTransaction, wallet.publicKey, writeProgram]
  );

  const delegateSession = useCallback(async (): Promise<TransactionResult> => {
    if (!wallet.publicKey || !writeProgram) {
      return { success: false, error: 'Wallet not connected' };
    }

    if (!hasActiveSession) {
      return { success: false, error: 'No active session to delegate' };
    }

    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const [sessionPda] = deriveGameSessionPda(wallet.publicKey);

      const transaction = await writeProgram.methods
        .delegateSession()
        .accounts({
          gameSession: sessionPda,
          player: wallet.publicKey,
        })
        .transaction();

      const signature = await signAndSendTransaction(transaction);
      await connection.confirmTransaction(signature, 'confirmed');

      // Refresh session state
      await fetchSession();

      return { success: true, signature };
    } catch (txError) {
      const message = getUserErrorMessage(txError);
      if (isMountedRef.current) setError(message);
      return { success: false, error: message };
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [
    connection,
    fetchSession,
    hasActiveSession,
    signAndSendTransaction,
    wallet.publicKey,
    writeProgram,
  ]);

  const commitSession = useCallback(
    async (stateHash: number[]): Promise<TransactionResult> => {
      if (!wallet.publicKey || !writeProgram) {
        return { success: false, error: 'Wallet not connected' };
      }

      if (!hasActiveSession) {
        return { success: false, error: 'No active session to commit' };
      }

      if (stateHash.length !== 32) {
        return { success: false, error: 'State hash must be 32 bytes' };
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const [sessionPda] = deriveGameSessionPda(wallet.publicKey);

        const transaction = await writeProgram.methods
          .commitSession(stateHash)
          .accounts({
            gameSession: sessionPda,
            player: wallet.publicKey,
          })
          .transaction();

        const signature = await signAndSendTransaction(transaction);
        await connection.confirmTransaction(signature, 'confirmed');

        // Refresh session state
        await fetchSession();

        return { success: true, signature };
      } catch (txError) {
        const message = getUserErrorMessage(txError);
        if (isMountedRef.current) setError(message);
        return { success: false, error: message };
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [
      connection,
      fetchSession,
      hasActiveSession,
      signAndSendTransaction,
      wallet.publicKey,
      writeProgram,
    ]
  );

  const endSession = useCallback(async (): Promise<TransactionResult> => {
    if (!wallet.publicKey || !writeProgram) {
      return { success: false, error: 'Wallet not connected' };
    }

    if (!hasActiveSession) {
      return { success: false, error: 'No active session to end' };
    }

    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const [sessionPda] = deriveGameSessionPda(wallet.publicKey);

      const transaction = await writeProgram.methods
        .endSession()
        .accounts({
          gameSession: sessionPda,
          player: wallet.publicKey,
        })
        .transaction();

      const signature = await signAndSendTransaction(transaction);
      await connection.confirmTransaction(signature, 'confirmed');

      // Clear session state
      if (isMountedRef.current) {
        setSession(null);
        setHasActiveSession(false);
      }

      return { success: true, signature };
    } catch (txError) {
      const message = getUserErrorMessage(txError);
      if (isMountedRef.current) setError(message);
      return { success: false, error: message };
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [connection, hasActiveSession, signAndSendTransaction, wallet.publicKey, writeProgram]);

  const resetSession = useCallback(() => {
    setSession(null);
    setHasActiveSession(false);
    setError(null);
  }, []);

  return {
    session,
    hasActiveSession,
    isLoading,
    error,
    fetchSession,
    startSession,
    delegateSession,
    commitSession,
    endSession,
    resetSession,
  };
}
