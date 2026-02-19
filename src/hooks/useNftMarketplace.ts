import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import BN from 'bn.js';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import {
  createAnchorProvider,
  createNftMarketplaceProgram,
  createNftMarketplaceProgramWithProvider,
} from '@/services/solana/programs';
import {
  deriveMarketplaceConfigPda,
  deriveListingPda,
  deriveMintAuthorityPda,
  derivePlayerProfilePda,
  MPL_CORE_PROGRAM_ID,
  TREASURY_PUBKEY,
  GAUNTLET_POOL_PUBKEY,
} from '@/services/solana/constants';
import { fetchUserNfts, fetchAllListings } from '@/services/solana/metaplexCore';
import { getUserErrorMessage } from '@/services/solana/errors';
import { SOLANA_CONFIG } from '@/services/solana/config';
import type { MetaplexCoreAsset, ListingData, ListingWithAsset, TransactionResult } from '@/types/solana';

export function useNftMarketplace() {
  const { wallet, signAndSendTransaction } = useWallet();
  const { connection } = useSolanaConnection();
  const readOnlyProgram = useMemo(() => createNftMarketplaceProgram(connection), [connection]);

  const [userSkins, setUserSkins] = useState<MetaplexCoreAsset[]>([]);
  const [userNftItems, setUserNftItems] = useState<MetaplexCoreAsset[]>([]);
  const [listings, setListings] = useState<ListingWithAsset[]>([]);
  const [marketplaceConfig, setMarketplaceConfig] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const configRef = useRef<any>(null);
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
    return createNftMarketplaceProgramWithProvider(provider);
  }, [provider]);

  // Fetch marketplace config (cached in ref to avoid repeated RPC calls)
  const fetchConfig = useCallback(async () => {
    if (configRef.current) return configRef.current;
    try {
      const [configPda] = deriveMarketplaceConfigPda();
      const config = await (readOnlyProgram.account as any).marketplaceConfig.fetchNullable(configPda);
      configRef.current = config;
      if (isMountedRef.current) setMarketplaceConfig(config);
      return config;
    } catch {
      return null;
    }
  }, [readOnlyProgram]);

  // Fetch user's NFTs
  const fetchUserAssets = useCallback(async () => {
    if (!wallet.publicKey) return;
    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const config = marketplaceConfig ?? await fetchConfig();
      if (!config) {
        if (isMountedRef.current) {
          setUserSkins([]);
          setUserNftItems([]);
          setIsLoading(false);
        }
        return;
      }

      const [skins, items] = await Promise.all([
        fetchUserNfts(connection, wallet.publicKey, config.skinsCollection),
        fetchUserNfts(connection, wallet.publicKey, config.itemsCollection),
      ]);

      if (isMountedRef.current) {
        setUserSkins(skins);
        setUserNftItems(items);
      }
    } catch (e) {
      console.error('[useNftMarketplace]', e);
      if (isMountedRef.current) setError(getUserErrorMessage(e));
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [connection, fetchConfig, marketplaceConfig, wallet.publicKey]);

  // Fetch all listings
  const fetchMarketplaceListings = useCallback(async () => {
    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const rawListings = await fetchAllListings(readOnlyProgram);

      // Enrich with asset data
      const enriched: ListingWithAsset[] = [];
      for (const listing of rawListings) {
        try {
          const accountInfo = await connection.getAccountInfo(listing.asset);
          if (accountInfo) {
            const { parseMetaplexCoreAsset } = await import('@/services/solana/metaplexCore');
            const asset = parseMetaplexCoreAsset(listing.asset, accountInfo.data as Buffer);
            enriched.push({ listing, asset });
          }
        } catch {
          // Skip listings with unreadable assets
        }
      }

      if (isMountedRef.current) setListings(enriched);
    } catch (e) {
      console.error('[useNftMarketplace]', e);
      if (isMountedRef.current) setError(getUserErrorMessage(e));
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [connection, readOnlyProgram]);

  // List an NFT for sale
  const listNft = useCallback(
    async (asset: PublicKey, collection: PublicKey, priceLamports: number): Promise<TransactionResult> => {
      if (!wallet.publicKey || !writeProgram) {
        return { success: false, error: 'Wallet not connected' };
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const [listingPda] = deriveListingPda(asset);
        const [configPda] = deriveMarketplaceConfigPda();
        const [mintAuthPda] = deriveMintAuthorityPda();
        const [profilePda] = derivePlayerProfilePda(wallet.publicKey);

        const transaction = await writeProgram.methods
          .listNft(new BN(priceLamports))
          .accounts({
            listing: listingPda,
            marketplaceConfig: configPda,
            mintAuthority: mintAuthPda,
            asset,
            collection,
            seller: wallet.publicKey,
            playerProfile: profilePda,
            mplCoreProgram: MPL_CORE_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .transaction();

        const signature = await signAndSendTransaction(transaction);
        await connection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

        await refresh();
        return { success: true, signature };
      } catch (txError) {
        console.error('[useNftMarketplace]', txError);
        const message = getUserErrorMessage(txError, 'nft_marketplace');
        if (isMountedRef.current) setError(message);
        return { success: false, error: message };
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [connection, signAndSendTransaction, wallet.publicKey, writeProgram]
  );

  // Cancel a listing
  const cancelListing = useCallback(
    async (asset: PublicKey, collection: PublicKey): Promise<TransactionResult> => {
      if (!wallet.publicKey || !writeProgram) {
        return { success: false, error: 'Wallet not connected' };
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const [listingPda] = deriveListingPda(asset);

        const transaction = await writeProgram.methods
          .cancelListing()
          .accounts({
            listing: listingPda,
            asset,
            collection,
            seller: wallet.publicKey,
            mplCoreProgram: MPL_CORE_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .transaction();

        const signature = await signAndSendTransaction(transaction);
        await connection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

        await refresh();
        return { success: true, signature };
      } catch (txError) {
        console.error('[useNftMarketplace]', txError);
        const message = getUserErrorMessage(txError, 'nft_marketplace');
        if (isMountedRef.current) setError(message);
        return { success: false, error: message };
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [connection, signAndSendTransaction, wallet.publicKey, writeProgram]
  );

  // Buy an NFT
  const buyNft = useCallback(
    async (listingWithAsset: ListingWithAsset): Promise<TransactionResult> => {
      if (!wallet.publicKey || !writeProgram) {
        return { success: false, error: 'Wallet not connected' };
      }

      const config = marketplaceConfig ?? await fetchConfig();
      if (!config) {
        return { success: false, error: 'Marketplace not initialized' };
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const { listing, asset } = listingWithAsset;
        const [listingPda] = deriveListingPda(listing.asset);
        const [configPda] = deriveMarketplaceConfigPda();
        const [mintAuthPda] = deriveMintAuthorityPda();

        const transaction = await writeProgram.methods
          .buyNft()
          .accounts({
            listing: listingPda,
            marketplaceConfig: configPda,
            mintAuthority: mintAuthPda,
            asset: listing.asset,
            collection: listing.collection,
            buyer: wallet.publicKey,
            seller: listing.seller,
            companyTreasury: config.companyTreasury,
            gauntletPool: config.gauntletPool,
            mplCoreProgram: MPL_CORE_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .transaction();

        const signature = await signAndSendTransaction(transaction);
        await connection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

        await refresh();
        return { success: true, signature };
      } catch (txError) {
        console.error('[useNftMarketplace]', txError);
        const message = getUserErrorMessage(txError, 'nft_marketplace');
        if (isMountedRef.current) setError(message);
        return { success: false, error: message };
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [connection, fetchConfig, marketplaceConfig, signAndSendTransaction, wallet.publicKey, writeProgram]
  );

  // Refresh everything
  const refresh = useCallback(async () => {
    await fetchConfig();
    await Promise.all([fetchUserAssets(), fetchMarketplaceListings()]);
  }, [fetchConfig, fetchUserAssets, fetchMarketplaceListings]);

  return {
    userSkins,
    userNftItems,
    listings,
    marketplaceConfig,
    isLoading,
    error,
    fetchUserAssets,
    fetchListings: fetchMarketplaceListings,
    listNft,
    cancelListing,
    buyNft,
    refresh,
  };
}
