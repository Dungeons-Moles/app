import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import {
  createAnchorProvider,
  createPlayerProfileProgramWithProvider,
} from '@/services/solana/programs';
import { derivePlayerProfilePda } from '@/services/solana/constants';
import { getUserErrorMessage } from '@/services/solana/errors';
import { SOLANA_CONFIG } from '@/services/solana/config';
import type { TransactionResult } from '@/types/solana';

export function useEquipSkin() {
  const { wallet, signAndSendTransaction } = useWallet();
  const { connection } = useSolanaConnection();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const provider = useMemo(() => {
    if (!wallet.publicKey) return null;
    const walletAdapter = {
      publicKey: wallet.publicKey,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any) => txs,
    } as any;
    return createAnchorProvider(connection, walletAdapter);
  }, [connection, wallet.publicKey]);

  const writeProgram = useMemo(() => {
    if (!provider) return null;
    return createPlayerProfileProgramWithProvider(provider);
  }, [provider]);

  const equipSkin = useCallback(
    async (skinAsset: PublicKey): Promise<TransactionResult> => {
      if (!wallet.publicKey || !writeProgram) {
        return { success: false, error: 'Wallet not connected' };
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const [profilePda] = derivePlayerProfilePda(wallet.publicKey);

        const transaction = await writeProgram.methods
          .equipSkin()
          .accounts({
            playerProfile: profilePda,
            owner: wallet.publicKey,
            skinAsset,
          })
          .transaction();

        const signature = await signAndSendTransaction(transaction);
        await connection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

        return { success: true, signature };
      } catch (txError) {
        const message = getUserErrorMessage(txError, 'player_profile');
        if (isMountedRef.current) setError(message);
        return { success: false, error: message };
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [connection, signAndSendTransaction, wallet.publicKey, writeProgram]
  );

  const unequipSkin = useCallback(
    async (): Promise<TransactionResult> => {
      if (!wallet.publicKey || !writeProgram) {
        return { success: false, error: 'Wallet not connected' };
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const [profilePda] = derivePlayerProfilePda(wallet.publicKey);

        const transaction = await writeProgram.methods
          .unequipSkin()
          .accounts({
            playerProfile: profilePda,
            owner: wallet.publicKey,
          })
          .transaction();

        const signature = await signAndSendTransaction(transaction);
        await connection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

        return { success: true, signature };
      } catch (txError) {
        const message = getUserErrorMessage(txError, 'player_profile');
        if (isMountedRef.current) setError(message);
        return { success: false, error: message };
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [connection, signAndSendTransaction, wallet.publicKey, writeProgram]
  );

  return {
    isLoading,
    error,
    equipSkin,
    unequipSkin,
  };
}
