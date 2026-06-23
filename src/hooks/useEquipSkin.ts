import { useCallback, useRef, useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { buildEquipSkinTx, buildUnequipSkinTx } from '@/services/solana/quasarPilots';
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

  const equipSkin = useCallback(
    async (skinAsset: PublicKey): Promise<TransactionResult> => {
      if (!wallet.publicKey) {
        return { success: false, error: 'Wallet not connected' };
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const [profilePda] = derivePlayerProfilePda(wallet.publicKey);
        const transaction = buildEquipSkinTx({
          owner: wallet.publicKey,
          playerProfile: profilePda,
          skinAsset,
        });

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
    [connection, signAndSendTransaction, wallet.publicKey]
  );

  const unequipSkin = useCallback(
    async (): Promise<TransactionResult> => {
      if (!wallet.publicKey) {
        return { success: false, error: 'Wallet not connected' };
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const [profilePda] = derivePlayerProfilePda(wallet.publicKey);
        const transaction = buildUnequipSkinTx({
          owner: wallet.publicKey,
          playerProfile: profilePda,
        });

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
    [connection, signAndSendTransaction, wallet.publicKey]
  );

  return {
    isLoading,
    error,
    equipSkin,
    unequipSkin,
  };
}
