/**
 * Map Generator Program Client - Read-only fetches
 *
 * Fetches GeneratedMap account data from the map-generator Solana program.
 */

import { PublicKey } from '@solana/web3.js';
import type { Program } from '@coral-xyz/anchor';

// ============================================================================
// On-Chain Types
// ============================================================================

export interface OnChainEnemySpawn {
  archetypeId: number;
  tier: number;
  x: number;
  y: number;
}

export interface OnChainPoiSpawn {
  poiType: number;
  isUsed: boolean;
  x: number;
  y: number;
}

export interface GeneratedMapData {
  session: PublicKey;
  width: number;
  height: number;
  seed: bigint;
  spawnX: number;
  spawnY: number;
  moleDenX: number;
  moleDenY: number;
  walkableCount: number;
  packedTiles: number[];
  discoveredTiles: number[];
  enemyCount: number;
  enemies: OnChainEnemySpawn[];
  poiCount: number;
  pois: OnChainPoiSpawn[];
  bump: number;
}

// ============================================================================
// SessionDiscovery Types
// ============================================================================

export interface DiscoveredPoiData {
  poiType: number;
  x: number;
  y: number;
  used: boolean;
}

export interface DiscoveredEnemyData {
  archetypeId: number;
  tier: number;
  x: number;
  y: number;
  defeated: number;
  mapEnemiesIndex: number;
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
}

// ============================================================================
// Fetch Function
// ============================================================================

/**
 * Fetches the GeneratedMap account for a session.
 *
 * @param program - Anchor program instance for map_generator
 * @param generatedMapPda - GeneratedMap PDA address
 * @returns GeneratedMapData or null if not found
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
    console.error('Failed to fetch generated map:', error);
    return null;
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
    console.error('Failed to fetch session discovery:', error);
    return null;
  }
}
