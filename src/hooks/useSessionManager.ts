import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { SystemProgram, PublicKey, Transaction, ComputeBudgetProgram, Keypair } from '@solana/web3.js';
import { AnchorProvider } from '@coral-xyz/anchor';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import {
  createAnchorProvider,
  createSessionManagerProgram,
  createSessionManagerProgramWithProvider,
} from '@/services/solana/programs';
import { deriveSessionCounterPda } from '@/services/solana/types';
import { deriveSessionPda } from '@/services/solana/constants';
import {
  derivePlayerProfilePda,
  deriveGameStatePda,
  deriveMapEnemiesPda,
  deriveMapPoisPda,
  deriveInventoryPda,
  deriveGeneratedMapPda,
  deriveMapConfigPda,
} from '@/services/solana/constants';
import { SOLANA_CONFIG } from '@/services/solana/config';
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
  /** Tracks the on-chain level (1-indexed) of the current/last session for PDA derivation */
  const activeOnChainLevelRef = useRef<number>(1);

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
      const [sessionPda] = deriveSessionPda(wallet.publicKey, activeOnChainLevelRef.current);
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
        bump: account.bump,
        activeItemPool: Array.from(account.activeItemPool ?? []),
        burnerWallet: account.burnerWallet,
        stateHash: Array.from(account.stateHash),
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
        // Frontend levels are 0-indexed, on-chain expects 1-indexed (1-40)
        const onChainLevel = campaignLevel + 1;
        activeOnChainLevelRef.current = onChainLevel;

        const [sessionPda] = deriveSessionPda(wallet.publicKey, onChainLevel);
        const [counterPda] = deriveSessionCounterPda();
        const [profilePda] = derivePlayerProfilePda(wallet.publicKey);
        const [gameStatePda] = deriveGameStatePda(sessionPda);
        const [enemiesPda] = deriveMapEnemiesPda(sessionPda);
        const [poisPda] = deriveMapPoisPda(sessionPda);
        const [inventoryPda] = deriveInventoryPda(sessionPda);
        const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
        const [mapConfigPda] = deriveMapConfigPda();
        console.log('[useSessionManager] PDAs derived', {
          sessionPda: sessionPda.toBase58(),
          counterPda: counterPda.toBase58(),
        });
        console.log('[useSessionManager] Building transaction...');
        const transaction = await writeProgram.methods
          .startSession(onChainLevel)
          .accounts({
            gameSession: sessionPda,
            sessionCounter: counterPda,
            playerProfile: profilePda,
            player: wallet.publicKey,
            burnerWallet: wallet.publicKey, // Will be overridden by caller
            mapConfig: mapConfigPda,
            generatedMap: generatedMapPda,
            gameState: gameStatePda,
            mapEnemies: enemiesPda,
            mapPois: poisPda,
            inventory: inventoryPda,
            mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
            gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
            poiSystemProgram: SOLANA_CONFIG.programs.poiSystem,
            playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
            systemProgram: SystemProgram.programId,
          })
          .transaction();

        // start_session does multiple CPIs (map gen ~378k CUs, game state, inventory, POIs),
        // which far exceeds the default 200k compute unit limit
        transaction.instructions.unshift(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })
        );

        console.log('[useSessionManager] Requesting wallet signature...');
        const signature = await signAndSendTransaction(transaction);
        console.log('[useSessionManager] Transaction sent:', signature);
        await connection.confirmTransaction(signature, SOLANA_CONFIG.commitment);
        console.log('[useSessionManager] Transaction confirmed');

        // Fetch the created session
        await fetchSession();

        return { success: true, signature };
      } catch (txError) {
        console.error('[useSessionManager] Transaction error:', txError);
        const message = getUserErrorMessage(txError, 'session_manager');
        if (isMountedRef.current) setError(message);
        return { success: false, error: message };
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [connection, fetchSession, signAndSendTransaction, wallet.publicKey, writeProgram]
  );

  /**
   * Builds a start session transaction without sending it.
   * Used for combining with other instructions in a single transaction.
   */
  const buildStartSessionTransaction = useCallback(
    async (
      campaignLevel: number,
      burnerPublicKey: PublicKey
    ): Promise<{ transaction: Transaction; sessionPda: PublicKey } | null> => {
      if (!wallet.publicKey || !writeProgram) {
        return null;
      }

      if (campaignLevel < 0 || campaignLevel > MAX_CAMPAIGN_LEVEL) {
        return null;
      }

      // Frontend levels are 0-indexed, on-chain expects 1-indexed (1-40)
      const onChainLevel = campaignLevel + 1;
      activeOnChainLevelRef.current = onChainLevel;

      const [sessionPda] = deriveSessionPda(wallet.publicKey, onChainLevel);
      const [counterPda] = deriveSessionCounterPda();
      const [profilePda] = derivePlayerProfilePda(wallet.publicKey);
      const [gameStatePda] = deriveGameStatePda(sessionPda);
      const [enemiesPda] = deriveMapEnemiesPda(sessionPda);
      const [poisPda] = deriveMapPoisPda(sessionPda);
      const [inventoryPda] = deriveInventoryPda(sessionPda);
      const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
      const [mapConfigPda] = deriveMapConfigPda();
      const transaction = await writeProgram.methods
        .startSession(onChainLevel)
        .accounts({
          gameSession: sessionPda,
          sessionCounter: counterPda,
          playerProfile: profilePda,
          player: wallet.publicKey,
          burnerWallet: burnerPublicKey,
          mapConfig: mapConfigPda,
          generatedMap: generatedMapPda,
          gameState: gameStatePda,
          mapEnemies: enemiesPda,
          mapPois: poisPda,
          inventory: inventoryPda,
          mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
          gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
          poiSystemProgram: SOLANA_CONFIG.programs.poiSystem,
          playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      return { transaction, sessionPda };
    },
    [wallet.publicKey, writeProgram]
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
      const onChainLevel = session?.campaignLevel ?? activeOnChainLevelRef.current;
      const [sessionPda] = deriveSessionPda(wallet.publicKey, onChainLevel);

      const transaction = await writeProgram.methods
        .delegateSession(onChainLevel)
        .accounts({
          gameSession: sessionPda,
          player: wallet.publicKey,
        })
        .transaction();

      const signature = await signAndSendTransaction(transaction);
      await connection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

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
        const onChainLevel = session?.campaignLevel ?? activeOnChainLevelRef.current;
        const [sessionPda] = deriveSessionPda(wallet.publicKey, onChainLevel);

        const transaction = await writeProgram.methods
          .commitSession(onChainLevel, stateHash)
          .accounts({
            gameSession: sessionPda,
            player: wallet.publicKey,
          })
          .transaction();

        const signature = await signAndSendTransaction(transaction);
        await connection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

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

  const endSession = useCallback(
    async (victory: boolean = false, burnerKeypair?: Keypair): Promise<TransactionResult> => {
      if (!wallet.publicKey || !writeProgram) {
        return { success: false, error: 'Wallet not connected' };
      }

      if (!hasActiveSession || !session) {
        return { success: false, error: 'No active session to end' };
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const [sessionPda] = deriveSessionPda(wallet.publicKey, session.campaignLevel);
        const [inventoryPda] = deriveInventoryPda(sessionPda);

        // Get the burner wallet public key from the session
        const burnerWalletPubkey = session.burnerWallet;
        if (!burnerWalletPubkey) {
          return { success: false, error: 'Session missing burner wallet' };
        }

        const transaction = await writeProgram.methods
          .endSession(session.campaignLevel, victory)
          .accounts({
            gameSession: sessionPda,
            player: wallet.publicKey,
            burnerWallet: burnerWalletPubkey,
            inventory: inventoryPda,
            playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
          })
          .transaction();

        // Set blockhash and fee payer
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = wallet.publicKey;

        // If burner keypair is provided, partially sign the transaction
        // (burner_wallet is a Signer in the program)
        if (burnerKeypair) {
          transaction.partialSign(burnerKeypair);
        }

        const signature = await signAndSendTransaction(transaction);
        await connection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

        // Clear session state
        if (isMountedRef.current) {
          setSession(null);
          setHasActiveSession(false);
        }

        return { success: true, signature };
      } catch (txError) {
        const message = getUserErrorMessage(txError, 'session_manager');
        if (isMountedRef.current) setError(message);
        return { success: false, error: message };
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [connection, hasActiveSession, session, signAndSendTransaction, wallet.publicKey, writeProgram]
  );

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
    buildStartSessionTransaction,
    delegateSession,
    commitSession,
    endSession,
    resetSession,
  };
}
