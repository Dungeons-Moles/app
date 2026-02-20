import React, { createContext, useContext, useMemo, useEffect, ReactNode, useState, useCallback } from 'react';
import type { Connection } from '@solana/web3.js';
import { createErConnection, createSolanaConnection } from '@/services/solana/programs';
import { checkValidatorFingerprint } from '@/services/solana/validatorFingerprint';

interface SolanaConnectionContextValue {
  /** Base layer Solana connection (L1). */
  connection: Connection;
  /** Alias for base connection, for explicitness at callsites. */
  baseConnection: Connection;
  /** Ephemeral rollup connection (MagicBlock). */
  erConnection: Connection;
  /** Connection to use for in-session gameplay writes. */
  gameplayConnection: Connection;
  /** Whether gameplay writes are currently routed to ER. */
  useErForGameplay: boolean;
  /** Toggle routing of gameplay writes to ER. */
  setUseErForGameplay: (enabled: boolean) => void;
}

const SolanaConnectionContext = createContext<SolanaConnectionContextValue | undefined>(undefined);

export function SolanaConnectionProvider({ children }: { children: ReactNode }) {
  const baseConnection = useMemo(() => createSolanaConnection(), []);
  const erConnection = useMemo(() => createErConnection(), []);
  const [useErForGameplay, setUseErForGameplayState] = useState(false);
  const setUseErForGameplay = useCallback((enabled: boolean) => {
    setUseErForGameplayState(enabled);
  }, []);

  // Check for validator reset on startup (local dev only).
  // Clears stale caches when genesis hash changes.
  useEffect(() => {
    checkValidatorFingerprint(baseConnection).then((wasReset) => {
      if (wasReset) {
        console.log('[SolanaConnectionProvider] Validator reset detected — caches cleared');
      }
    });
  }, [baseConnection]);
  const gameplayConnection = useErForGameplay ? erConnection : baseConnection;
  const contextValue = useMemo(
    () => ({
      connection: baseConnection,
      baseConnection,
      erConnection,
      gameplayConnection,
      useErForGameplay,
      setUseErForGameplay,
    }),
    [baseConnection, erConnection, gameplayConnection, useErForGameplay, setUseErForGameplay]
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
