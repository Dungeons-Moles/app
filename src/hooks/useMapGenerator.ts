import { useCallback, useMemo, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { createMapGeneratorProgram } from '@/services/solana/programs';
import { deriveMapConfigPda } from '@/services/solana/types';
import { getUserErrorMessage } from '@/services/solana/errors';
import type { OnChainMapConfig } from '@/services/solana/types/map_generator';

export function useMapGenerator() {
  const { connection } = useSolanaConnection();
  const program = useMemo(() => createMapGeneratorProgram(connection), [connection]);
  const [mapConfig, setMapConfig] = useState<OnChainMapConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMapConfig = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [configPda] = deriveMapConfigPda();
      const account = await (
        program.account as {
          mapConfig: {
            fetchNullable: (address: PublicKey) => Promise<any>;
          };
        }
      ).mapConfig.fetchNullable(configPda);

      if (!account) {
        setMapConfig(null);
        return null;
      }

      const configData: OnChainMapConfig = {
        admin: account.admin,
        seeds: account.seeds.map((s: any) => BigInt(s.toString())),
        version: account.version,
        bump: account.bump,
      };

      setMapConfig(configData);
      return configData;
    } catch (fetchError) {
      setError(getUserErrorMessage(fetchError));
      setMapConfig(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [program]);

  /**
   * Gets the seed for a specific campaign level.
   * Returns from cached mapConfig if available, otherwise fetches from chain.
   */
  const getMapSeed = useCallback(
    async (level: number): Promise<bigint | null> => {
      if (level < 0 || level > 80) {
        setError('Level must be between 0 and 80');
        return null;
      }

      // Use cached config if available
      if (mapConfig) {
        return mapConfig.seeds[level];
      }

      // Fetch config and get seed
      const config = await fetchMapConfig();
      if (config) {
        return config.seeds[level];
      }

      return null;
    },
    [fetchMapConfig, mapConfig]
  );

  /**
   * Gets seeds for multiple levels at once.
   * More efficient than calling getMapSeed multiple times.
   */
  const getMapSeeds = useCallback(
    async (levels: number[]): Promise<Map<number, bigint> | null> => {
      const invalidLevels = levels.filter((l) => l < 0 || l > 80);
      if (invalidLevels.length > 0) {
        setError(`Invalid levels: ${invalidLevels.join(', ')}. Must be 0-80.`);
        return null;
      }

      // Ensure we have config
      let config = mapConfig;
      if (!config) {
        config = await fetchMapConfig();
      }

      if (!config) {
        return null;
      }

      const seedMap = new Map<number, bigint>();
      for (const level of levels) {
        seedMap.set(level, config.seeds[level]);
      }

      return seedMap;
    },
    [fetchMapConfig, mapConfig]
  );

  /**
   * Checks if the map config has been initialized on-chain.
   */
  const isConfigInitialized = useCallback(async (): Promise<boolean> => {
    try {
      const [configPda] = deriveMapConfigPda();
      const accountInfo = await connection.getAccountInfo(configPda);
      return accountInfo !== null;
    } catch {
      return false;
    }
  }, [connection]);

  const resetMapConfig = useCallback(() => {
    setMapConfig(null);
    setError(null);
  }, []);

  return {
    mapConfig,
    isLoading,
    error,
    fetchMapConfig,
    getMapSeed,
    getMapSeeds,
    isConfigInitialized,
    resetMapConfig,
  };
}
