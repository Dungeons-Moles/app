import { Connection, PublicKey, GetProgramAccountsFilter } from '@solana/web3.js';
import { Program } from '@anchor-lang/core';
import * as Sentry from '@sentry/react-native';
import type { MetaplexCoreAsset, ListingData } from '@/types/solana';
import { MPL_CORE_PROGRAM_ID } from './constants';

/**
 * Parse a Metaplex Core V1 asset from raw account data.
 * Layout: key(1) + owner(32) + updateAuthority discriminator(1) + updateAuthority pubkey(32) + name(4+str) + uri(4+str)
 */
export function parseMetaplexCoreAsset(address: PublicKey, data: Buffer): MetaplexCoreAsset {
  let offset = 0;

  // Key (1 byte - asset type discriminator)
  const key = data[offset];
  offset += 1;

  // Owner (32 bytes)
  const owner = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  // Update authority (1 byte discriminator + 32 bytes pubkey)
  const updateAuthorityType = data[offset];
  offset += 1;

  let collection: PublicKey | null = null;
  if (updateAuthorityType === 2) {
    // Collection update authority
    collection = new PublicKey(data.subarray(offset, offset + 32));
  }
  offset += 32;

  // Name (4 byte length prefix + string)
  const nameLen = data.readUInt32LE(offset);
  offset += 4;
  const name = Buffer.from(data.subarray(offset, offset + nameLen)).toString('utf8');
  offset += nameLen;

  // URI (4 byte length prefix + string)
  const uriLen = data.readUInt32LE(offset);
  offset += 4;
  const uri = Buffer.from(data.subarray(offset, offset + uriLen)).toString('utf8');

  return { address, owner, name, uri, collection };
}

/**
 * Fetch all Metaplex Core NFTs owned by a user, optionally filtered by collection.
 * Uses getProgramAccounts with memcmp filters on owner (offset 1) and collection (offset 34).
 */
export async function fetchUserNfts(
  connection: Connection,
  owner: PublicKey,
  collection?: PublicKey
): Promise<MetaplexCoreAsset[]> {
  const filters: GetProgramAccountsFilter[] = [
    // Filter by owner at offset 1
    { memcmp: { offset: 1, bytes: owner.toBase58() } },
  ];

  if (collection) {
    // Filter by collection update authority type (0x01) + collection pubkey at offset 33+1
    // updateAuthority discriminator is at offset 33, pubkey at offset 34
    filters.push({ memcmp: { offset: 34, bytes: collection.toBase58() } });
  }

  const accounts = await connection.getProgramAccounts(MPL_CORE_PROGRAM_ID, {
    filters,
  });

  return accounts.map(({ pubkey, account }) =>
    parseMetaplexCoreAsset(pubkey, account.data as Buffer)
  );
}

/**
 * Fetch all active listings from the marketplace program.
 */
export async function fetchAllListings(program: Program): Promise<ListingData[]> {
  const listings = await (
    program.account as {
      listing: { all: () => Promise<{ publicKey: PublicKey; account: any }[]> };
    }
  ).listing.all();

  return listings.map(({ account }) => ({
    seller: account.seller,
    asset: account.asset,
    collection: account.collection,
    priceLamports: BigInt(account.priceLamports.toString()),
    createdAt: Number(account.createdAt),
  }));
}

export interface DasAsset {
  id: string;
  content: { metadata: { name: string }; json_uri: string };
  ownership: { owner: string };
  grouping: { group_key: string; group_value: string }[];
}

/**
 * Fetch NFTs owned by a wallet using the Helius DAS API (getAssetsByOwner).
 * Much faster than getProgramAccounts (~200ms vs ~3.5s).
 * Falls back to getProgramAccounts if DAS is unavailable.
 */
export async function fetchUserSkinsDas(
  rpcUrl: string,
  owner: PublicKey,
  collection?: PublicKey,
): Promise<MetaplexCoreAsset[]> {
  try {
    const body: any = {
      jsonrpc: '2.0',
      id: 1,
      method: 'getAssetsByOwner',
      params: {
        ownerAddress: owner.toBase58(),
        page: 1,
        limit: 50,
        displayOptions: { showCollectionMetadata: false },
      },
    };

    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    if (json.error) throw new Error(json.error.message ?? 'DAS RPC error');
    if (!json.result?.items) throw new Error('DAS returned no items field');

    let items: DasAsset[] = json.result.items;

    // Filter by collection if specified
    if (collection) {
      const collectionKey = collection.toBase58();
      items = items.filter((item) =>
        item.grouping.some(
          (g) => g.group_key === 'collection' && g.group_value === collectionKey,
        ),
      );
    }

    return items.map((item) => ({
      address: new PublicKey(item.id),
      owner: new PublicKey(item.ownership.owner),
      name: item.content.metadata.name,
      uri: item.content.json_uri ?? '',
      collection: collection ?? null,
    }));
  } catch (e) {
    console.warn('[DAS] getAssetsByOwner failed, will fall back to getProgramAccounts:', e);
    Sentry.captureException(e, { tags: { source: 'metaplexCore.fetchUserSkinsDas' } });
    throw e;
  }
}
