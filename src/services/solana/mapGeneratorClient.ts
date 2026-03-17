/**
 * Map Generator Program Client - Read-only fetches
 *
 * Fetches GeneratedMap account data from the map-generator Solana program.
 */

import { PublicKey } from '@solana/web3.js';
import type { Program } from '@coral-xyz/anchor';

// ============================================================================
// SessionDiscovery Types
// ============================================================================

export interface DiscoveredPoiData {
  poiType: number;
  x: number;
  y: number;
  used: boolean;
  mapPoisIndex: number;
}

export interface DiscoveredEnemyData {
  archetypeId: number;
  tier: number;
  x: number;
  y: number;
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
    console.error('Failed to fetch session discovery:', error);
    return null;
  }
}
