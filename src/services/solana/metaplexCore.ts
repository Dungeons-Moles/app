import { Connection, PublicKey, GetProgramAccountsFilter } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
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
  const name = data.subarray(offset, offset + nameLen).toString('utf8');
  offset += nameLen;

  // URI (4 byte length prefix + string)
  const uriLen = data.readUInt32LE(offset);
  offset += 4;
  const uri = data.subarray(offset, offset + uriLen).toString('utf8');

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
