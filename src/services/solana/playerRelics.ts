import { PublicKey } from '@solana/web3.js';
import type { Program } from '@coral-xyz/anchor';

export interface PlayerRelicEntryData {
  itemId: string;
  ownedCount: number;
  inActivePool: boolean;
}

export interface PlayerRelicPoolData {
  owner: PublicKey;
  count: number;
  relics: PlayerRelicEntryData[];
  bump: number;
}

interface OnChainRelicEntry {
  itemId?: number[] | Uint8Array;
  item_id?: number[] | Uint8Array;
  ownedCount?: number;
  owned_count?: number;
  inActivePool?: boolean;
  in_active_pool?: boolean;
}

interface OnChainPlayerRelicPool {
  owner: PublicKey;
  count: number;
  relics: OnChainRelicEntry[];
  bump: number;
}

function decodeFixedItemId(itemId: number[] | Uint8Array | undefined): string {
  if (!itemId) return '';
  return String.fromCharCode(...Array.from(itemId).filter((byte) => byte !== 0));
}

export async function fetchPlayerRelicPool(
  program: Program,
  poolPda: PublicKey
): Promise<PlayerRelicPoolData | null> {
  try {
    const account = await (
      program.account as {
        playerRelicPool: {
          fetchNullable: (address: PublicKey) => Promise<OnChainPlayerRelicPool | null>;
        };
      }
    ).playerRelicPool.fetchNullable(poolPda);

    if (!account) return null;

    return {
      owner: account.owner,
      count: account.count,
      relics: account.relics.map((relic) => ({
        itemId: decodeFixedItemId(relic.itemId ?? relic.item_id),
        ownedCount: relic.ownedCount ?? relic.owned_count ?? 0,
        inActivePool: relic.inActivePool ?? relic.in_active_pool ?? false,
      })),
      bump: account.bump,
    };
  } catch (error) {
    console.error('Failed to fetch player relic pool:', error);
    return null;
  }
}

export function encodeFixedItemId(itemId: string): number[] {
  const bytes = new Uint8Array(8);
  const encoded = new TextEncoder().encode(itemId);
  bytes.set(encoded.slice(0, 8));
  return Array.from(bytes);
}
