import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { createMapGeneratorProgram } from '@/services/solana/programs';
import { deriveMapConfigPda } from '@/services/solana/types';
import { getUserErrorMessage } from '@/services/solana/errors';
import type { OnChainMapConfig } from '@/services/solana/types/map_generator';
import type { CampaignLevel } from '@/types/solana';

/** Maximum campaign level (0-79 = 80 levels total) */
export const MAX_CAMPAIGN_LEVEL = 79;

export function useMapGenerator() {
  const { connection } = useSolanaConnection();
  const program = useMemo(() => createMapGeneratorProgram(connection), [connection]);
  const [mapConfig, setMapConfig] = useState<OnChainMapConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchMapConfig = useCallback(async () => {
    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const [configPda] = deriveMapConfigPda();
      const account = await (
        program.account as {
          mapConfig: {
            fetchNullable: (address: PublicKey) => Promise<any>;
          };
        }
      ).mapConfig.fetchNullable(configPda);

      if (!isMountedRef.current) return null;

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
      if (isMountedRef.current) {
        setError(getUserErrorMessage(fetchError));
        setMapConfig(null);
      }
      return null;
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [program]);

  /**
   * Gets the seed for a specific campaign level.
   * Returns from cached mapConfig if available, otherwise fetches from chain.
   */
  const getMapSeed = useCallback(
    async (level: number): Promise<bigint | null> => {
      if (level < 0 || level > MAX_CAMPAIGN_LEVEL) {
        if (isMountedRef.current) setError(`Level must be between 0 and ${MAX_CAMPAIGN_LEVEL}`);
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
      const invalidLevels = levels.filter((l) => l < 0 || l > MAX_CAMPAIGN_LEVEL);
      if (invalidLevels.length > 0) {
        if (isMountedRef.current)
          setError(`Invalid levels: ${invalidLevels.join(', ')}. Must be 0-${MAX_CAMPAIGN_LEVEL}.`);
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

  /**
   * Gets the list of campaign levels with unlock status based on player's currentLevel.
   * Levels 0 to currentLevel are unlocked, levels beyond are locked.
   *
   * @param playerCurrentLevel - The player's current level (highest completed + 1)
   * @returns Array of CampaignLevel objects for levels 0-79
   */
  const getCampaignLevels = useCallback(
    async (playerCurrentLevel: number): Promise<CampaignLevel[]> => {
      // Ensure we have config for seeds
      let config = mapConfig;
      if (!config) {
        config = await fetchMapConfig();
      }

      const levels: CampaignLevel[] = [];

      for (let level = 0; level <= MAX_CAMPAIGN_LEVEL; level++) {
        // Level is unlocked if player has reached or passed it
        // Player at currentLevel=5 can play levels 0-5
        const isUnlocked = level <= playerCurrentLevel;

        // Level is completed if player has passed it
        // Player at currentLevel=5 has completed levels 0-4
        const isCompleted = level < playerCurrentLevel;

        // Only provide seed for unlocked levels
        const seed = isUnlocked && config ? config.seeds[level] : null;

        levels.push({
          level,
          isUnlocked,
          isCompleted,
          seed,
        });
      }

      return levels;
    },
    [fetchMapConfig, mapConfig]
  );

  return {
    mapConfig,
    isLoading,
    error,
    fetchMapConfig,
    getMapSeed,
    getMapSeeds,
    getCampaignLevels,
    isConfigInitialized,
    resetMapConfig,
  };
}
