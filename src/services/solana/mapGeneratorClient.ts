/**
 * Map Generator Program Client - Read-only fetches
 *
 * Fetches GeneratedMap account data from the map-generator Solana program.
 */

import { PublicKey } from '@solana/web3.js';
import type { Program } from '@coral-xyz/anchor';

// ============================================================================
// Shared Types
// ============================================================================

export interface EnemySpawnData {
  archetypeId: number;
  tier: number;
  x: number;
  y: number;
}

export interface PoiSpawnData {
  poiType: number;
  isUsed: boolean;
  x: number;
  y: number;
}

export interface GeneratedMapData {
  session: PublicKey;
  width: number;
  height: number;
  seed: number | bigint;
  spawnX: number;
  spawnY: number;
  moleDenX: number;
  moleDenY: number;
  walkableCount: number;
  packedTiles: number[];
  discoveredTiles: number[];
  enemyCount: number;
  enemies: EnemySpawnData[];
  poiCount: number;
  pois: PoiSpawnData[];
  bump: number;
}

export interface DiscoveredPoiData extends PoiSpawnData {
  poiType: number;
  used: boolean;
  mapPoisIndex: number;
}

export interface DiscoveredEnemyData extends EnemySpawnData {
  defeated: number;
  mapEnemiesIndex: number;
}

export interface DiscoveryShopOffer {
  itemId: number[];
  tier: number;
  price: number;
  purchased: number;
}

export interface DiscoveryOfferItem {
  itemId: number[];
  rarity: number;
  tier: number;
}

export interface SessionDiscoveryData {
  session: PublicKey;
  discoveredTiles: number[];
  revealedTileTypes: number[];
  spawnX: number;
  spawnY: number;
  moleDenX: number;
  moleDenY: number;
  mapWidth: number;
  mapHeight: number;
  discoveredPoiCount: number;
  discoveredPois: DiscoveredPoiData[];
  bump: number;
  discoveredEnemyCount: number;
  discoveredEnemies: DiscoveredEnemyData[];
  currentBossId: number[];
  currentEchoPresent: number;
  currentEchoData: number[];
  // Offer data (dual-written from poi_system via CPI)
  activeOfferType: number;
  activeOfferPoiIndex: number;
  shopOffers: DiscoveryShopOffer[];
  shopRerollCount: number;
  shopActive: number;
  cacheOfferItems: DiscoveryOfferItem[];
  oilOfferOils: number[];
  scannerOfferCount: number;
  scannerOfferTypes: number[];
}

/**
 * Fetches the GeneratedMap account for a session.
 */
export async function fetchGeneratedMap(
  program: Program,
  generatedMapPda: PublicKey
): Promise<GeneratedMapData | null> {
  try {
    const account = await (
      program.account as {
        generatedMap: {
          fetchNullable: (address: PublicKey) => Promise<GeneratedMapData | null>;
        };
      }
    ).generatedMap.fetchNullable(generatedMapPda);

    return account ?? null;
  } catch (error) {
    const provider = program.provider as unknown as {
      connection?: {
        getAccountInfo?: (
          address: PublicKey,
          commitment?: string
        ) => Promise<{ data?: Buffer | Uint8Array } | null>;
      } | null;
    };
    const connection = provider.connection ?? null;
    if (!connection?.getAccountInfo) {
      console.error('Failed to fetch generated map:', error);
      return null;
    }

    try {
      const info = await connection.getAccountInfo(generatedMapPda, 'processed');
      if (!info?.data) {
        return null;
      }
      return decodeGeneratedMapFromAccountInfo(program, info.data);
    } catch (fallbackError) {
      console.error('Failed to fetch generated map:', fallbackError);
      return null;
    }
  }
}

/**
 * Fetches the SessionDiscovery account for a session.
 *
 * @param program - Anchor program instance for map_generator
 * @param sessionDiscoveryPda - SessionDiscovery PDA address
 * @returns SessionDiscoveryData or null if not found
 */
export async function fetchSessionDiscovery(
  program: Program,
  sessionDiscoveryPda: PublicKey
): Promise<SessionDiscoveryData | null> {
  try {
    const account = await (
      program.account as {
        sessionDiscovery: {
          fetchNullable: (address: PublicKey) => Promise<SessionDiscoveryData | null>;
        };
      }
    ).sessionDiscovery.fetchNullable(sessionDiscoveryPda);

    return account ?? null;
  } catch (error) {
    const provider = program.provider as unknown as {
      connection?: {
        getAccountInfo?: (
          address: PublicKey,
          commitment?: string
        ) => Promise<{ data?: Buffer | Uint8Array } | null>;
      } | null;
    };
    const connection = provider.connection ?? null;
    if (!connection?.getAccountInfo) {
      console.error('Failed to fetch session discovery:', error);
      return null;
    }

    try {
      const info = await connection.getAccountInfo(sessionDiscoveryPda, 'processed');
      if (!info?.data) {
        return null;
      }
      return decodeSessionDiscoveryFromAccountInfo(program, info.data);
    } catch (fallbackError) {
      console.error('Failed to fetch session discovery:', fallbackError);
      return null;
    }
  }
}

/**
 * Decodes raw AccountInfo data (from onAccountChange) into SessionDiscoveryData.
 * Returns null if decoding fails.
 */
export function decodeSessionDiscoveryFromAccountInfo(
  program: Program,
  data: Buffer | Uint8Array
): SessionDiscoveryData | null {
  try {
    const decoded = (program.coder.accounts as any).decode('sessionDiscovery', data);
    return (decoded as SessionDiscoveryData) ?? null;
  } catch {
    return null;
  }
}

/**
 * Decodes raw AccountInfo data into GeneratedMapData.
 */
export function decodeGeneratedMapFromAccountInfo(
  program: Program,
  data: Buffer | Uint8Array
): GeneratedMapData | null {
  try {
    const decoded = (program.coder.accounts as any).decode('generatedMap', data);
    return (decoded as GeneratedMapData) ?? null;
  } catch {
    return null;
  }
}
