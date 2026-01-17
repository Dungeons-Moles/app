import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import type { Connection } from '@solana/web3.js';
import { createSolanaConnection } from '@/services/solana/programs';

interface SolanaConnectionContextValue {
  connection: Connection;
}

const SolanaConnectionContext = createContext<SolanaConnectionContextValue | undefined>(undefined);

export function SolanaConnectionProvider({ children }: { children: ReactNode }) {
  const connection = useMemo(() => createSolanaConnection(), []);

  return (
    <SolanaConnectionContext.Provider value={{ connection }}>
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
