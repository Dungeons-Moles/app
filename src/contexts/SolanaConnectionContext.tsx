import React, { createContext, useContext, useMemo, useEffect, ReactNode, useState, useCallback } from 'react';
import { Connection } from '@solana/web3.js';
import { createErConnection, createSolanaConnection } from '@/services/solana/programs';
import { checkValidatorFingerprint } from '@/services/solana/validatorFingerprint';
import { SOLANA_CONFIG } from '@/services/solana/config';

interface SolanaConnectionContextValue {
  /** Base layer Solana connection (L1). */
  connection: Connection;
  /** Alias for base connection, for explicitness at callsites. */
  baseConnection: Connection;
  /** Fallback base layer connection (public RPC), null if same as primary. */
  fallbackConnection: Connection | null;
  /** Ephemeral rollup connection (MagicBlock). */
  erConnection: Connection;
  /** Direct ER connection (bypasses router, for reads). */
  directErConnection: Connection;
  /** Connection to use for in-session gameplay writes (router). */
  gameplayConnection: Connection;
  /** Connection to use for in-session gameplay reads (resolved validator). */
  gameplayReadConnection: Connection;
  /** Whether gameplay writes are currently routed to ER. */
  useErForGameplay: boolean;
  /** Toggle routing of gameplay writes to ER. */
  setUseErForGameplay: (enabled: boolean) => void;
  /** Set the resolved ER validator endpoint (discovered after delegation). */
  setResolvedErEndpoint: (endpoint: string | null) => void;
}

const SolanaConnectionContext = createContext<SolanaConnectionContextValue | undefined>(undefined);

export function SolanaConnectionProvider({ children }: { children: ReactNode }) {
  const baseConnection = useMemo(() => createSolanaConnection(), []);
  const fallbackConnection = useMemo(() => {
    const url = SOLANA_CONFIG.rpcFallbackUrl;
    if (!url || url === SOLANA_CONFIG.rpcUrl) return null;
    return new Connection(url, SOLANA_CONFIG.commitment);
  }, []);
  const erConnection = useMemo(() => createErConnection(), []);
  const directErConnection = useMemo(
    () =>
      new Connection(SOLANA_CONFIG.directErRpcUrl, {
        commitment: SOLANA_CONFIG.erCommitment,
        wsEndpoint: SOLANA_CONFIG.directErWsUrl,
      }),
    []
  );
  const [useErForGameplay, setUseErForGameplayState] = useState(false);
  const setUseErForGameplay = useCallback((enabled: boolean) => {
    setUseErForGameplayState(enabled);
    if (!enabled) setResolvedErEndpointState(null);
  }, []);
  const [resolvedErEndpoint, setResolvedErEndpointState] = useState<string | null>(null);
  const setResolvedErEndpoint = useCallback((endpoint: string | null) => {
    setResolvedErEndpointState(endpoint);
  }, []);
  const resolvedErConnection = useMemo(() => {
    if (!resolvedErEndpoint) return directErConnection;
    return new Connection(resolvedErEndpoint, {
      commitment: SOLANA_CONFIG.erCommitment,
      wsEndpoint: resolvedErEndpoint
        .replace(/^https:\/\//, 'wss://')
        .replace(/^http:\/\//, 'ws://'),
    });
  }, [resolvedErEndpoint, directErConnection]);

  // Check for validator reset on startup (local dev only).
  // Clears stale caches when genesis hash changes.
  useEffect(() => {
    checkValidatorFingerprint(baseConnection).then((wasReset) => {
      if (wasReset) {
        console.log('[SolanaConnectionProvider] Validator reset detected — caches cleared');
      }
    });
  }, [baseConnection]);
  // Gameplay writes go through the router (erConnection) which has optimized
  // routing and is geographically distributed. The resolvedErConnection is only
  // for reads — it points directly to the specific validator node which has the
  // actual account data (the router returns zeroed data for reads).
  const gameplayConnection = useErForGameplay ? erConnection : baseConnection;
  // Read connection for fetching on-chain state during gameplay.
  // Uses the resolved validator endpoint when available, falls back to router.
  const gameplayReadConnection = useErForGameplay ? resolvedErConnection : baseConnection;
  const contextValue = useMemo(
    () => ({
      connection: baseConnection,
      baseConnection,
      fallbackConnection,
      erConnection,
      directErConnection: resolvedErConnection,
      gameplayConnection,
      gameplayReadConnection,
      useErForGameplay,
      setUseErForGameplay,
      setResolvedErEndpoint,
    }),
    [baseConnection, fallbackConnection, erConnection, resolvedErConnection, gameplayConnection, gameplayReadConnection, useErForGameplay, setUseErForGameplay, setResolvedErEndpoint]
  );

  return (
    <SolanaConnectionContext.Provider value={contextValue}>
      {children}
    </SolanaConnectionContext.Provider>
  );
}

export function useSolanaConnection() {
  const context = useContext(SolanaConnectionContext);
  if (!context) {
    throw new Error('useSolanaConnection must be used within a SolanaConnectionProvider');
  }
  return context;
}
