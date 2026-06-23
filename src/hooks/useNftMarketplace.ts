import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import * as Sentry from '@sentry/react-native';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { createNftMarketplaceProgram } from '@/services/solana/programs';
import {
  deriveMarketplaceConfigPda,
  deriveListingPda,
  deriveMintAuthorityPda,
  derivePlayerProfilePda,
  derivePlayerRelicPoolPda,
  NFT_MARKETPLACE_PROGRAM_ID,
} from '@/services/solana/constants';
import { buildBuyNftTx, buildCancelListingTx, buildListNftTx } from '@/services/solana/quasarPilots';
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
      Sentry.captureException(e, { tags: { source: 'useNftMarketplace.fetchUserAssets' } });
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
      Sentry.captureException(e, { tags: { source: 'useNftMarketplace.fetchMarketplaceListings' } });
      if (isMountedRef.current) setError(getUserErrorMessage(e));
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [connection, readOnlyProgram]);

  // List an NFT for sale
  const listNft = useCallback(
    async (asset: PublicKey, collection: PublicKey, priceLamports: number): Promise<TransactionResult> => {
      if (!wallet.publicKey) {
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

        const transaction = buildListNftTx({
          listing: listingPda,
          marketplaceConfig: configPda,
          mintAuthority: mintAuthPda,
          asset,
          collection,
          seller: wallet.publicKey,
          playerProfile: profilePda,
          priceLamports,
        });

        const signature = await signAndSendTransaction(transaction);
        await connection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

        await refresh();
        return { success: true, signature };
      } catch (txError) {
        console.error('[useNftMarketplace]', txError);
        Sentry.captureException(txError, { tags: { source: 'useNftMarketplace.listNft' } });
        const message = getUserErrorMessage(txError, 'nft_marketplace');
        if (isMountedRef.current) setError(message);
        return { success: false, error: message };
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [connection, signAndSendTransaction, wallet.publicKey]
  );

  // Cancel a listing
  const cancelListing = useCallback(
    async (asset: PublicKey, collection: PublicKey): Promise<TransactionResult> => {
      if (!wallet.publicKey) {
        return { success: false, error: 'Wallet not connected' };
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const [listingPda] = deriveListingPda(asset);

        const transaction = buildCancelListingTx({
          listing: listingPda,
          asset,
          collection,
          seller: wallet.publicKey,
        });

        const signature = await signAndSendTransaction(transaction);
        await connection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

        await refresh();
        return { success: true, signature };
      } catch (txError) {
        console.error('[useNftMarketplace]', txError);
        Sentry.captureException(txError, { tags: { source: 'useNftMarketplace.cancelListing' } });
        const message = getUserErrorMessage(txError, 'nft_marketplace');
        if (isMountedRef.current) setError(message);
        return { success: false, error: message };
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [connection, signAndSendTransaction, wallet.publicKey]
  );

  // Buy an NFT
  const buyNft = useCallback(
    async (listingWithAsset: ListingWithAsset): Promise<TransactionResult> => {
      if (!wallet.publicKey) {
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
        const { listing } = listingWithAsset;
        const [listingPda] = deriveListingPda(listing.asset);
        const [configPda] = deriveMarketplaceConfigPda();
        const [mintAuthPda] = deriveMintAuthorityPda();
        const isRelicItem = listing.collection.equals(config.itemsCollection);
        const [buyerRelicPoolPda] = derivePlayerRelicPoolPda(wallet.publicKey);
        const [sellerRelicPoolPda] = derivePlayerRelicPoolPda(listing.seller);
        const relicAssetRecordPda = PublicKey.findProgramAddressSync(
          [Buffer.from('relic_asset'), listing.asset.toBuffer()],
          NFT_MARKETPLACE_PROGRAM_ID
        )[0];

        const transaction = buildBuyNftTx({
          listing: listingPda,
          marketplaceConfig: configPda,
          mintAuthority: mintAuthPda,
          asset: listing.asset,
          relicAssetRecord: isRelicItem ? relicAssetRecordPda : undefined,
          collection: listing.collection,
          buyer: wallet.publicKey,
          seller: listing.seller,
          sellerPlayerRelicPool: isRelicItem ? sellerRelicPoolPda : undefined,
          buyerPlayerRelicPool: buyerRelicPoolPda,
          companyTreasury: config.companyTreasury,
          gauntletPool: config.gauntletPool,
        });

        const signature = await signAndSendTransaction(transaction);
        await connection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

        await refresh();
        return { success: true, signature };
      } catch (txError) {
        console.error('[useNftMarketplace]', txError);
        Sentry.captureException(txError, { tags: { source: 'useNftMarketplace.buyNft' } });
        const message = getUserErrorMessage(txError, 'nft_marketplace');
        if (isMountedRef.current) setError(message);
        return { success: false, error: message };
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [connection, fetchConfig, marketplaceConfig, signAndSendTransaction, wallet.publicKey]
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
