import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
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
import { TREASURY_PUBKEY } from '@/services/solana/constants';
import { SOLANA_CONFIG } from '@/services/solana/config';
import { MAX_CAMPAIGN_LEVEL } from './useMapGenerator';
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
    return createPlayerProfileProgramWithProvider(provider);
  }, [provider]);

  const updateState = useCallback(
    (nextProfile: OnChainPlayerProfile | null, nextExists: boolean, cached = false) => {
      if (isMountedRef.current) {
        setProfile(nextProfile);
        setExists(nextExists);
        setIsCached(cached);
      }
    },
    []
  );

  const fetchProfile = useCallback(async () => {
    if (!wallet.publicKey || !wallet.address) {
      if (isMountedRef.current) setError('Wallet not connected');
      return;
    }

    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

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

      const highestLevel = account.highestLevelUnlocked ?? account.currentLevel ?? 1;
      // On-chain is 1-indexed (level 1 = first level), frontend is 0-indexed
      const profileData: OnChainPlayerProfile = {
        owner: account.owner,
        name: account.name,
        totalRuns: account.totalRuns,
        currentLevel: highestLevel - 1,
        highestLevelUnlocked: highestLevel,
        availableRuns: account.availableRuns ?? 0,
        createdAt: Number(account.createdAt),
        unlockedItems: account.unlockedItems
          ? new Uint8Array(account.unlockedItems)
          : new Uint8Array(10),
        activeItemPool: account.activeItemPool
          ? new Uint8Array(account.activeItemPool)
          : new Uint8Array(10),
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
            highestLevelUnlocked: cached.currentLevel,
            availableRuns: cached.availableRuns,
            createdAt: cached.createdAt,
            unlockedItems: new Uint8Array(10),
            activeItemPool: new Uint8Array(10),
          },
          true,
          true
        );
      } else {
        if (isMountedRef.current) setError(getUserErrorMessage(fetchError));
        updateState(null, false);
      }
    } finally {
      if (isMountedRef.current) setIsLoading(false);
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

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

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
        await connection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

        const account = await (
          readOnlyProgram.account as {
            playerProfile: {
              fetch: (address: PublicKey) => Promise<any>;
            };
          }
        ).playerProfile.fetch(profilePda);
        const createHighestLevel = account.highestLevelUnlocked ?? account.currentLevel ?? 1;
        // On-chain is 1-indexed (level 1 = first level), frontend is 0-indexed
        const profileData: OnChainPlayerProfile = {
          owner: account.owner,
          name: account.name,
          totalRuns: account.totalRuns,
          currentLevel: createHighestLevel - 1,
          highestLevelUnlocked: createHighestLevel,
          availableRuns: account.availableRuns ?? 0,
          createdAt: Number(account.createdAt),
          unlockedItems: account.unlockedItems
            ? new Uint8Array(account.unlockedItems)
            : new Uint8Array(10),
          activeItemPool: account.activeItemPool
            ? new Uint8Array(account.activeItemPool)
            : new Uint8Array(10),
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
        const message = getUserErrorMessage(txError, 'player_profile');
        if (isMountedRef.current) setError(message);
        return { success: false, error: message };
      } finally {
        if (isMountedRef.current) setIsLoading(false);
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

  /**
   * Records the result of a completed dungeon run on-chain.
   * Updates the profile with total runs, level progression (on victory), and available runs.
   *
   * @param levelReached - The level the player reached during the run
   * @param victory - Whether the player defeated the boss (true) or died (false)
   * @returns Transaction result with success status and optional signature
   */
  const recordRunResult = useCallback(
    async (levelReached: number, victory: boolean): Promise<TransactionResult> => {
      if (!wallet.publicKey || !wallet.address || !writeProgram) {
        return { success: false, error: 'Wallet not connected' };
      }

      if (levelReached < 0 || levelReached > MAX_CAMPAIGN_LEVEL) {
        return { success: false, error: `Level must be between 0 and ${MAX_CAMPAIGN_LEVEL}` };
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const [profilePda] = derivePlayerProfilePda(wallet.publicKey);
        const transaction = await writeProgram.methods
          .recordRunResult(levelReached, victory)
          .accounts({
            playerProfile: profilePda,
            owner: wallet.publicKey,
          })
          .transaction();

        const signature = await signAndSendTransaction(transaction);
        await connection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

        // Refresh profile data after successful transaction
        await fetchProfile();

        return { success: true, signature };
      } catch (txError) {
        const message = getUserErrorMessage(txError, 'player_profile');
        if (isMountedRef.current) setError(message);
        return { success: false, error: message };
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [
      connection,
      fetchProfile,
      signAndSendTransaction,
      wallet.address,
      wallet.publicKey,
      writeProgram,
    ]
  );

  /**
   * Updates the display name of an existing profile on-chain.
   *
   * @param name - New display name (max 32 characters)
   * @returns Transaction result with success status and optional signature
   */
  const updateName = useCallback(
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

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const [profilePda] = derivePlayerProfilePda(wallet.publicKey);
        const transaction = await writeProgram.methods
          .updateProfileName(name)
          .accounts({
            playerProfile: profilePda,
            owner: wallet.publicKey,
          })
          .transaction();

        const signature = await signAndSendTransaction(transaction);
        await connection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

        // Refresh profile data after successful transaction
        await fetchProfile();

        return { success: true, signature };
      } catch (txError) {
        const message = getUserErrorMessage(txError, 'player_profile');
        if (isMountedRef.current) setError(message);
        return { success: false, error: message };
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [
      connection,
      fetchProfile,
      signAndSendTransaction,
      wallet.address,
      wallet.publicKey,
      writeProgram,
    ]
  );

  /**
   * Updates the active item pool bitmask on-chain.
   *
   * @param activeItemPool - 10-byte bitmask where enabled bits represent active items
   */
  const updateActiveItemPool = useCallback(
    async (activeItemPool: Uint8Array): Promise<TransactionResult> => {
      if (!wallet.publicKey || !wallet.address || !writeProgram) {
        return { success: false, error: 'Wallet not connected' };
      }

      if (activeItemPool.length !== 10) {
        return { success: false, error: 'Invalid item pool bitmask length' };
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const [profilePda] = derivePlayerProfilePda(wallet.publicKey);
        const transaction = await writeProgram.methods
          .updateActiveItemPool(Array.from(activeItemPool))
          .accounts({
            playerProfile: profilePda,
            owner: wallet.publicKey,
          })
          .transaction();

        const signature = await signAndSendTransaction(transaction);
        await connection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

        await fetchProfile();

        return { success: true, signature };
      } catch (txError) {
        const message = getUserErrorMessage(txError, 'player_profile');
        if (isMountedRef.current) setError(message);
        return { success: false, error: message };
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [
      connection,
      fetchProfile,
      signAndSendTransaction,
      wallet.address,
      wallet.publicKey,
      writeProgram,
    ]
  );

  /**
   * Purchases 20 additional runs by paying 0.001 SOL to the treasury.
   */
  const purchaseRuns = useCallback(async (): Promise<TransactionResult> => {
    if (!wallet.publicKey || !wallet.address || !writeProgram) {
      return { success: false, error: 'Wallet not connected' };
    }

    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const [profilePda] = derivePlayerProfilePda(wallet.publicKey);
      const transaction = await writeProgram.methods
        .purchaseRuns()
        .accounts({
          playerProfile: profilePda,
          owner: wallet.publicKey,
          treasury: TREASURY_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      const signature = await signAndSendTransaction(transaction);
      await connection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

      // Refresh profile data after successful transaction
      await fetchProfile();

      return { success: true, signature };
    } catch (txError) {
      const message = getUserErrorMessage(txError, 'player_profile');
      if (isMountedRef.current) setError(message);
      return { success: false, error: message };
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [
    connection,
    fetchProfile,
    signAndSendTransaction,
    wallet.address,
    wallet.publicKey,
    writeProgram,
  ]);

  return {
    profile,
    exists,
    isLoading,
    error,
    isCached,
    fetchProfile,
    createProfile,
    recordRunResult,
    updateName,
    updateActiveItemPool,
    purchaseRuns,
    clearCache,
    resetProfile,
  };
}
