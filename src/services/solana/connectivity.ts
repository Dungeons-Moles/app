import { Connection } from '@solana/web3.js';
import { getCachedProfile } from './cache';
import type { CachedProfileData } from '@/types/solana';

export type ConnectivityMode = 'online' | 'cached' | 'guest';

export interface ConnectivityState {
  mode: ConnectivityMode;
  isRpcConnected: boolean;
  lastConnected: number | null;
}

export function determineMode(
  isConnected: boolean,
  cachedProfile: CachedProfileData | null
): ConnectivityMode {
  if (isConnected) {
    return 'online';
  }
  if (cachedProfile) {
    return 'cached';
  }
  return 'guest';
}

export async function detectConnectivity(
  connection: Connection,
  walletAddress: string | null
): Promise<ConnectivityState> {
  try {
    await connection.getLatestBlockhash();
    const cached = walletAddress ? await getCachedProfile(walletAddress) : null;
    return {
      mode: determineMode(true, cached),
      isRpcConnected: true,
      lastConnected: Date.now(),
    };
  } catch (error) {
    const cached = walletAddress ? await getCachedProfile(walletAddress) : null;
    return {
      mode: determineMode(false, cached),
      isRpcConnected: false,
      lastConnected: null,
    };
  }
}
