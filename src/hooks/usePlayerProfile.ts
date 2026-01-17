import { useCallback, useMemo, useState } from 'react';
import { SystemProgram, PublicKey } from '@solana/web3.js';
import { AnchorProvider } from '@coral-xyz/anchor';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import {
  createAnchorProvider,
  createPlayerProfileProgram,
  createPlayerProfileProgramWithProvider,
} from '@/services/solana/programs';
import { derivePlayerProfilePda } from '@/services/solana/types';
import { getCachedProfile, setCachedProfile, clearCachedProfile } from '@/services/solana/cache';
import { getUserErrorMessage } from '@/services/solana/errors';
import type { CachedProfileData, OnChainPlayerProfile, TransactionResult } from '@/types/solana';

const NAME_MAX_LENGTH = 32;

export function usePlayerProfile() {
  const { wallet, signAndSendTransaction } = useWallet();
  const { connection } = useSolanaConnection();
  const readOnlyProgram = useMemo(() => createPlayerProfileProgram(connection), [connection]);
  const [profile, setProfile] = useState<OnChainPlayerProfile | null>(null);
  const [exists, setExists] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);

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
    return createPlayerProfileProgramWithProvider(provider);
  }, [provider]);

  const updateState = useCallback(
    (nextProfile: OnChainPlayerProfile | null, nextExists: boolean, cached = false) => {
      setProfile(nextProfile);
      setExists(nextExists);
      setIsCached(cached);
    },
    []
  );

  const fetchProfile = useCallback(async () => {
    if (!wallet.publicKey || !wallet.address) {
      setError('Wallet not connected');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [profilePda] = derivePlayerProfilePda(wallet.publicKey);
      const account = await (
        readOnlyProgram.account as {
          playerProfile: {
            fetchNullable: (address: PublicKey) => Promise<any>;
          };
        }
      ).playerProfile.fetchNullable(profilePda);
      if (!account) {
        updateState(null, false);
        return;
      }

      const profileData: OnChainPlayerProfile = {
        owner: account.owner,
        name: account.name,
        totalRuns: account.totalRuns,
        currentLevel: account.currentLevel,
        availableRuns: account.availableRuns ?? 0, // Fallback for old accounts
        createdAt: Number(account.createdAt),
      };

      updateState(profileData, true);
      const cachePayload: CachedProfileData = {
        owner: profileData.owner.toBase58(),
        name: profileData.name,
        totalRuns: profileData.totalRuns,
        currentLevel: profileData.currentLevel,
        availableRuns: profileData.availableRuns,
        createdAt: profileData.createdAt,
      };
      await setCachedProfile(wallet.address, cachePayload);
    } catch (fetchError) {
      const cached = await getCachedProfile(wallet.address);
      if (cached && wallet.publicKey) {
        updateState(
          {
            owner: wallet.publicKey,
            name: cached.name,
            totalRuns: cached.totalRuns,
            currentLevel: cached.currentLevel,
            availableRuns: cached.availableRuns,
            createdAt: cached.createdAt,
          },
          true,
          true
        );
      } else {
        setError(getUserErrorMessage(fetchError));
        updateState(null, false);
      }
    } finally {
      setIsLoading(false);
    }
  }, [readOnlyProgram, updateState, wallet.address, wallet.publicKey]);

  const createProfile = useCallback(
    async (name: string): Promise<TransactionResult> => {
      if (!wallet.publicKey || !wallet.address || !writeProgram) {
        return { success: false, error: 'Wallet not connected' };
      }

      if (!name.trim()) {
        return { success: false, error: 'Name is required' };
      }

      if (name.length > NAME_MAX_LENGTH) {
        return { success: false, error: `Name must be ${NAME_MAX_LENGTH} characters or less` };
      }

      setIsLoading(true);
      setError(null);

      try {
        const [profilePda] = derivePlayerProfilePda(wallet.publicKey);
        const transaction = await writeProgram.methods
          .initializeProfile(name)
          .accounts({
            playerProfile: profilePda,
            owner: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .transaction();

        const signature = await signAndSendTransaction(transaction);
        await connection.confirmTransaction(signature, 'confirmed');

        const account = await (
          readOnlyProgram.account as {
            playerProfile: {
              fetch: (address: PublicKey) => Promise<any>;
            };
          }
        ).playerProfile.fetch(profilePda);
        const profileData: OnChainPlayerProfile = {
          owner: account.owner,
          name: account.name,
          totalRuns: account.totalRuns,
          currentLevel: account.currentLevel,
          availableRuns: account.availableRuns ?? 0,
          createdAt: Number(account.createdAt),
        };

        updateState(profileData, true);
        const cachePayload: CachedProfileData = {
          owner: profileData.owner.toBase58(),
          name: profileData.name,
          totalRuns: profileData.totalRuns,
          currentLevel: profileData.currentLevel,
          availableRuns: profileData.availableRuns,
          createdAt: profileData.createdAt,
        };
        await setCachedProfile(wallet.address, cachePayload);
        return { success: true, signature };
      } catch (txError) {
        const message = getUserErrorMessage(txError);
        setError(message);
        return { success: false, error: message };
      } finally {
        setIsLoading(false);
      }
    },
    [
      connection,
      readOnlyProgram,
      signAndSendTransaction,
      updateState,
      wallet.address,
      wallet.publicKey,
      writeProgram,
    ]
  );

  const clearCache = useCallback(async () => {
    if (wallet.address) {
      await clearCachedProfile(wallet.address);
    }
  }, [wallet.address]);

  const resetProfile = useCallback(async () => {
    updateState(null, false, false);
    setError(null);
    if (wallet.address) {
      await clearCachedProfile(wallet.address);
    }
  }, [updateState, wallet.address]);

  return {
    profile,
    exists,
    isLoading,
    error,
    isCached,
    fetchProfile,
    createProfile,
    clearCache,
    resetProfile,
  };
}
