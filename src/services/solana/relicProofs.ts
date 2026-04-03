import type { Program } from '@coral-xyz/anchor';
import type { AccountMeta, Connection, PublicKey } from '@solana/web3.js';
import { deriveMarketplaceConfigPda, deriveRelicAssetPda } from './constants';
import { fetchUserNfts } from './metaplexCore';

export async function fetchOwnedRelicProofAccounts(
  connection: Connection,
  marketplaceProgram: Program,
  owner: PublicKey
): Promise<AccountMeta[]> {
  const [marketplaceConfigPda] = deriveMarketplaceConfigPda();
  const marketplaceConfig = await (marketplaceProgram.account as {
    marketplaceConfig: {
      fetchNullable: (address: PublicKey) => Promise<{ itemsCollection?: PublicKey } | null>;
    };
  }).marketplaceConfig.fetchNullable(marketplaceConfigPda);

  if (!marketplaceConfig?.itemsCollection) {
    return [];
  }

  const ownedRelicAssets = await fetchUserNfts(
    connection,
    owner,
    marketplaceConfig.itemsCollection
  );

  if (ownedRelicAssets.length === 0) {
    return [];
  }

  const relicAssetPdas = ownedRelicAssets.map((asset) => deriveRelicAssetPda(asset.address)[0]);
  const relicAssetInfos = await connection.getMultipleAccountsInfo(relicAssetPdas);

  const remainingAccounts: AccountMeta[] = [];
  ownedRelicAssets.forEach((asset, index) => {
    if (!relicAssetInfos[index]) return;
    remainingAccounts.push(
      { pubkey: asset.address, isWritable: false, isSigner: false },
      { pubkey: relicAssetPdas[index], isWritable: false, isSigner: false }
    );
  });

  return remainingAccounts;
}
