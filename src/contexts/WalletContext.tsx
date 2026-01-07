import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import {
  transact,
  Web3MobileWallet,
} from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { WalletState, AuthorizationResult } from '../types';

const APP_IDENTITY = {
  name: 'Dungeons & Moles',
  uri: 'https://dungeonsandmoles.io',
  icon: 'favicon.ico',
};

interface WalletContextType {
  wallet: WalletState;
  connect: () => Promise<AuthorizationResult | null>;
  disconnect: () => void;
  isConnecting: boolean;
  error: string | null;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletState>({
    isConnected: false,
    address: null,
    authToken: null,
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async (): Promise<AuthorizationResult | null> => {
    setIsConnecting(true);
    setError(null);

    try {
      const result = await transact(async (wallet: Web3MobileWallet) => {
        const authorizationResult = await wallet.authorize({
          cluster: 'devnet',
          identity: APP_IDENTITY,
        });

        return authorizationResult;
      });

      if (result && result.accounts.length > 0) {
        const account = result.accounts[0];
        const authResult: AuthorizationResult = {
          address: account.address,
          label: account.label,
          authToken: result.auth_token,
        };

        setWallet({
          isConnected: true,
          address: account.address,
          authToken: result.auth_token,
        });

        return authResult;
      }

      return null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect wallet';
      setError(errorMessage);
      console.error('Wallet connection error:', err);
      return null;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setWallet({
      isConnected: false,
      address: null,
      authToken: null,
    });
    setError(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{
        wallet,
        connect,
        disconnect,
        isConnecting,
        error,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
