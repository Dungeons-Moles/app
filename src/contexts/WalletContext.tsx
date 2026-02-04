import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';
import { Platform } from 'react-native';
import { transact, Web3MobileWallet } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { WalletState, AuthorizationResult } from '../types';
import { SOLANA_CONFIG } from '@/services/solana/config';

const APP_IDENTITY = {
  name: 'Dungeons & Moles',
  uri: 'https://dungeonsandmoles.io',
  icon: 'favicon.ico',
};

const DEV_WEB_WALLET_KEY = 'dm_dev_web_wallet_secret';
const IS_WEB = Platform.OS === 'web';

function isWebWalletProvider(provider: unknown): provider is WebWalletProvider {
  return !!provider && typeof provider === 'object' && 'connect' in provider;
}

function getWebWalletProvider(walletName?: SupportedWallet): WebWalletProvider | null {
  if (!IS_WEB || typeof window === 'undefined') {
    return null;
  }

  const wallet = (window as typeof window & { solana?: unknown }).solana;
  if (!isWebWalletProvider(wallet)) {
    return null;
  }

  if (walletName === 'Phantom') {
    return wallet.isPhantom ? wallet : null;
  }

  if (walletName === 'Jupiter') {
    return wallet.isJupiterWallet || wallet.isJupiter ? wallet : null;
  }

  return wallet;
}

function loadDevWebWallet(): Keypair {
  if (!IS_WEB || typeof window === 'undefined') {
    return Keypair.generate();
  }

  try {
    const stored = window.localStorage.getItem(DEV_WEB_WALLET_KEY);
    if (stored) {
      const secretKey = Uint8Array.from(JSON.parse(stored) as number[]);
      return Keypair.fromSecretKey(secretKey);
    }
  } catch (error) {
    // ignore and regenerate
  }

  const keypair = Keypair.generate();
  try {
    window.localStorage.setItem(DEV_WEB_WALLET_KEY, JSON.stringify(Array.from(keypair.secretKey)));
  } catch (error) {
    // ignore storage failures
  }
  return keypair;
}

async function signAndSendWithDevWallet(
  connection: Connection,
  transaction: Transaction | VersionedTransaction,
  keypair: Keypair
): Promise<string> {
  if (transaction instanceof VersionedTransaction) {
    transaction.sign([keypair]);
    return connection.sendTransaction(transaction, {
      preflightCommitment: SOLANA_CONFIG.commitment,
    });
  }

  transaction.feePayer = keypair.publicKey;
  const latestBlockhash = await connection.getLatestBlockhash(SOLANA_CONFIG.commitment);
  transaction.recentBlockhash = latestBlockhash.blockhash;
  transaction.sign(keypair);
  return connection.sendRawTransaction(transaction.serialize(), {
    preflightCommitment: SOLANA_CONFIG.commitment,
  });
}

export type SupportedWallet = 'Jupiter' | 'Phantom';

type WebWalletProvider = {
  isPhantom?: boolean;
  isJupiterWallet?: boolean;
  isJupiter?: boolean;
  connect: () => Promise<{ publicKey: PublicKey }>;
  signTransaction: (
    transaction: Transaction | VersionedTransaction
  ) => Promise<Transaction | VersionedTransaction>;
  publicKey?: PublicKey;
};

interface WalletContextType {
  wallet: WalletState;
  connect: (walletName?: SupportedWallet) => Promise<AuthorizationResult | null>;
  disconnect: () => void;
  isConnecting: boolean;
  error: string | null;
  signAndSendTransaction: (transaction: Transaction | VersionedTransaction) => Promise<string>;
  getBalance: () => Promise<bigint>;
  checkBalance: (requiredLamports: bigint) => Promise<boolean>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletState>({
    isConnected: false,
    address: null,
    publicKey: null,
    authToken: null,
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devWebWallet] = useState<Keypair | null>(() => (IS_WEB ? loadDevWebWallet() : null));

  // Eagerly restore existing wallet connection on mount (web only)
  useEffect(() => {
    if (!IS_WEB || typeof window === 'undefined') return;

    const checkExistingConnection = () => {
      const webWallet = getWebWalletProvider();
      if (webWallet?.publicKey) {
        const address = webWallet.publicKey.toBase58();
        setWallet({
          isConnected: true,
          address,
          publicKey: webWallet.publicKey,
          authToken: 'web-wallet',
        });
      }
    };

    // Check immediately
    checkExistingConnection();

    // Also listen for Phantom's connect event in case it connects after mount
    const webWallet = getWebWalletProvider();
    if (webWallet && 'on' in webWallet) {
      const provider = webWallet as WebWalletProvider & {
        on: (event: string, handler: () => void) => void;
      };
      provider.on('connect', checkExistingConnection);
    }
  }, []);

  const connect = useCallback(
    async (walletName?: SupportedWallet): Promise<AuthorizationResult | null> => {
      setIsConnecting(true);
      setError(null);

      try {
        const webWallet = getWebWalletProvider(walletName);
        if (webWallet) {
          const response = await webWallet.connect();
          const publicKey = response.publicKey ?? webWallet.publicKey;
          if (!publicKey) {
            throw new Error('Wallet connection failed');
          }

          const address = publicKey.toBase58();
          const authResult: AuthorizationResult = {
            address,
            label: walletName ?? 'Web Wallet',
            authToken: 'web-wallet',
          };

          setWallet({
            isConnected: true,
            address,
            publicKey,
            authToken: 'web-wallet',
          });

          return authResult;
        }

        if (IS_WEB && devWebWallet) {
          const address = devWebWallet.publicKey.toBase58();
          const authResult: AuthorizationResult = {
            address,
            label: 'Dev Web Wallet',
            authToken: 'dev-web-wallet',
          };

          setWallet({
            isConnected: true,
            address,
            publicKey: devWebWallet.publicKey,
            authToken: 'dev-web-wallet',
          });

          return authResult;
        }

        const result = await transact(async (wallet: Web3MobileWallet) => {
          const authorizationResult = await wallet.authorize({
            chain: SOLANA_CONFIG.cluster,
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
            publicKey: new PublicKey(account.address),
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
    },
    [devWebWallet]
  );

  const disconnect = useCallback(() => {
    setWallet({
      isConnected: false,
      address: null,
      publicKey: null,
      authToken: null,
    });
    setError(null);
  }, []);

  const signAndSendTransaction = useCallback(
    async (transaction: Transaction | VersionedTransaction) => {
      const webWallet = getWebWalletProvider();
      if (webWallet) {
        const connection = new Connection(SOLANA_CONFIG.rpcUrl, 'confirmed');

        // Only set blockhash if the transaction doesn't already have one.
        // If the transaction has already been partially signed, changing the
        // blockhash would invalidate those signatures.
        if (transaction instanceof VersionedTransaction) {
          if (!transaction.message.recentBlockhash) {
            const latestBlockhash = await connection.getLatestBlockhash(SOLANA_CONFIG.commitment);
            transaction.message.recentBlockhash = latestBlockhash.blockhash;
          }
        } else {
          // Check if transaction already has partial signatures - if so, don't modify blockhash
          const hasSignatures = transaction.signatures.some(
            (sig) => sig.signature !== null && !sig.signature.every((b) => b === 0)
          );
          // Only set blockhash if missing AND no partial signatures exist
          if (!hasSignatures && !transaction.recentBlockhash) {
            const latestBlockhash = await connection.getLatestBlockhash(SOLANA_CONFIG.commitment);
            transaction.recentBlockhash = latestBlockhash.blockhash;
          }
          // Only set feePayer if not already set
          if (!transaction.feePayer) {
            transaction.feePayer = webWallet.publicKey ?? wallet.publicKey ?? undefined;
          }
        }

        const signed = await webWallet.signTransaction(transaction);
        const serialized = signed.serialize();
        return connection.sendRawTransaction(serialized, {
          preflightCommitment: SOLANA_CONFIG.commitment,
        });
      }

      if (IS_WEB && devWebWallet) {
        const connection = new Connection(SOLANA_CONFIG.rpcUrl, 'confirmed');
        return signAndSendWithDevWallet(connection, transaction, devWebWallet);
      }

      if (!wallet.authToken) {
        throw new Error('Wallet not connected');
      }

      return transact(async (walletAdapter: Web3MobileWallet) => {
        await walletAdapter.authorize({
          chain: SOLANA_CONFIG.cluster,
          identity: APP_IDENTITY,
          auth_token: wallet.authToken ?? undefined,
        });

        const signatures = await walletAdapter.signAndSendTransactions({
          transactions: [transaction],
        });

        return signatures[0];
      });
    },
    [devWebWallet, wallet.authToken, wallet.publicKey]
  );

  const getBalance = useCallback(async () => {
    if (!wallet.publicKey) {
      return 0n;
    }

    const connection = new Connection(SOLANA_CONFIG.rpcUrl, 'confirmed');
    const lamports = await connection.getBalance(wallet.publicKey, 'confirmed');
    return BigInt(lamports);
  }, [wallet.publicKey]);

  const checkBalance = useCallback(
    async (requiredLamports: bigint) => {
      const balance = await getBalance();
      return balance >= requiredLamports;
    },
    [getBalance]
  );

  return (
    <WalletContext.Provider
      value={{
        wallet,
        connect,
        disconnect,
        isConnecting,
        error,
        signAndSendTransaction,
        getBalance,
        checkBalance,
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
