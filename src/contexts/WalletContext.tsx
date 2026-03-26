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
import {
  deleteItemAsync as deleteSecureItemAsync,
  getItemAsync as getSecureItemAsync,
  setItemAsync as setSecureItemAsync,
} from '@/services/storage/secureStorage';
import { getUserErrorMessage } from '@/services/solana/errors';

const APP_IDENTITY = {
  name: 'Dungeons & Moles',
  uri: 'https://dungeonsandmoles.io',
  icon: 'favicon.ico',
};

const DEV_WEB_WALLET_KEY = 'dm_dev_web_wallet_secret';
const WEB_WALLET_CHOICE_KEY = 'dm_web_wallet_choice';
const MOBILE_WALLET_SESSION_KEY = 'dm_mobile_wallet_session';
const IS_WEB = Platform.OS === 'web';

type StoredMobileWalletSession = {
  address: string;
  authToken: string;
  label?: string;
};

function isStoredMobileWalletSession(value: unknown): value is StoredMobileWalletSession {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const session = value as Partial<StoredMobileWalletSession>;
  return typeof session.address === 'string' && typeof session.authToken === 'string';
}

async function persistMobileWalletSession(session: StoredMobileWalletSession): Promise<void> {
  if (IS_WEB) {
    return;
  }

  await setSecureItemAsync(MOBILE_WALLET_SESSION_KEY, JSON.stringify(session));
}

async function loadMobileWalletSession(): Promise<StoredMobileWalletSession | null> {
  if (IS_WEB) {
    return null;
  }

  try {
    const raw = await getSecureItemAsync(MOBILE_WALLET_SESSION_KEY);
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    return isStoredMobileWalletSession(parsed) ? parsed : null;
  } catch (error) {
    console.warn('[WalletContext] Failed to load stored mobile wallet session:', error);
    return null;
  }
}

async function clearMobileWalletSession(): Promise<void> {
  if (IS_WEB) {
    return;
  }

  await deleteSecureItemAsync(MOBILE_WALLET_SESSION_KEY);
}

function isPersistedWebWallet(value: string): value is SupportedWallet {
  return (
    value === 'Jupiter' ||
    value === 'Phantom' ||
    value === 'Backpack' ||
    value === 'Solflare' ||
    value === 'DevKeypair'
  );
}

function loadPreferredWebWallet(): SupportedWallet | null {
  if (!IS_WEB || typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(WEB_WALLET_CHOICE_KEY);
    return stored && isPersistedWebWallet(stored) ? (stored as SupportedWallet) : null;
  } catch (error) {
    return null;
  }
}

function storePreferredWebWallet(walletName: SupportedWallet | null): void {
  if (!IS_WEB || typeof window === 'undefined') {
    return;
  }

  try {
    if (walletName) {
      window.localStorage.setItem(WEB_WALLET_CHOICE_KEY, walletName);
    } else {
      window.localStorage.removeItem(WEB_WALLET_CHOICE_KEY);
    }
  } catch (error) {
    // ignore storage failures
  }
}

function isWebWalletProvider(provider: unknown): provider is WebWalletProvider {
  return !!provider && typeof provider === 'object' && 'connect' in provider;
}

function getWebWalletProvider(walletName?: SupportedWallet): WebWalletProvider | null {
  if (!IS_WEB || typeof window === 'undefined') {
    return null;
  }

  const providers = window as typeof window & {
    solana?: unknown;
    backpack?: unknown;
    solflare?: unknown;
  };
  const solanaWallet = providers.solana;
  const backpackProvider = providers.backpack;
  const backpackWallet =
    backpackProvider && typeof backpackProvider === 'object' && 'solana' in backpackProvider
      ? (backpackProvider as { solana?: unknown }).solana
      : backpackProvider;

  if (walletName === 'Phantom') {
    return isWebWalletProvider(solanaWallet) && solanaWallet.isPhantom ? solanaWallet : null;
  }

  if (walletName === 'Backpack') {
    if (isWebWalletProvider(backpackWallet)) {
      return backpackWallet;
    }
    return isWebWalletProvider(solanaWallet) && solanaWallet.isBackpack ? solanaWallet : null;
  }

  if (walletName === 'Solflare') {
    const solflareProvider = providers.solflare;
    if (isWebWalletProvider(solflareProvider) && solflareProvider.isSolflare) {
      return solflareProvider;
    }
    return isWebWalletProvider(solanaWallet) && solanaWallet.isSolflare ? solanaWallet : null;
  }

  if (walletName === 'Jupiter') {
    return isWebWalletProvider(solanaWallet) &&
      (solanaWallet.isJupiterWallet || solanaWallet.isJupiter)
      ? solanaWallet
      : null;
  }

  if (isWebWalletProvider(solanaWallet)) {
    return solanaWallet;
  }

  if (isWebWalletProvider(backpackWallet)) {
    return backpackWallet;
  }

  return null;
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
  keypair: Keypair,
  options?: { skipPreflight?: boolean }
): Promise<string> {
  const skipPreflight = options?.skipPreflight ?? false;

  if (transaction instanceof VersionedTransaction) {
    transaction.sign([keypair]);
    return connection.sendTransaction(transaction, {
      preflightCommitment: SOLANA_CONFIG.commitment,
      skipPreflight,
    });
  }

  if (!transaction.feePayer) {
    transaction.feePayer = keypair.publicKey;
  }
  if (!transaction.recentBlockhash) {
    const latestBlockhash = await connection.getLatestBlockhash(SOLANA_CONFIG.commitment);
    transaction.recentBlockhash = latestBlockhash.blockhash;
  }
  // Preserve any existing partial signatures (e.g. sessionSigner wallet) and add only the dev wallet sig.
  transaction.partialSign(keypair);
  return connection.sendRawTransaction(transaction.serialize(), {
    preflightCommitment: SOLANA_CONFIG.commitment,
    skipPreflight,
  });
}

// TEMPORARY: 'DevKeypair' added to bypass Phantom issues during local development.
// Remove 'DevKeypair' once Phantom popup behavior is resolved.
export type SupportedWallet = 'Jupiter' | 'Phantom' | 'Backpack' | 'Solflare' | 'DevKeypair';

type WebWalletProvider = {
  isPhantom?: boolean;
  isBackpack?: boolean;
  isSolflare?: boolean;
  isJupiterWallet?: boolean;
  isJupiter?: boolean;
  connect: (options?: { onlyIfTrusted?: boolean; silent?: boolean }) => Promise<
    { publicKey?: PublicKey } | boolean | void
  >;
  signTransaction: (
    transaction: Transaction | VersionedTransaction
  ) => Promise<Transaction | VersionedTransaction>;
  signAllTransactions?: (
    transactions: Array<Transaction | VersionedTransaction>
  ) => Promise<Array<Transaction | VersionedTransaction>>;
  signMessage?: (message: Uint8Array) => Promise<{ signature: Uint8Array }>;
  on?: (event: string, callback: (...args: unknown[]) => void) => void;
  off?: (event: string, callback: (...args: unknown[]) => void) => void;
  publicKey?: PublicKey;
};

interface WalletContextType {
  wallet: WalletState;
  connect: (walletName?: SupportedWallet) => Promise<AuthorizationResult | null>;
  disconnect: () => void;
  isConnecting: boolean;
  isRestoringConnection: boolean;
  error: string | null;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  signAndSendTransaction: (
    transaction: Transaction | VersionedTransaction,
    options?: { connection?: Connection; skipPreflight?: boolean }
  ) => Promise<string>;
  signAndSendTransactions: (
    transactions: Array<Transaction | VersionedTransaction>,
    options?: { connection?: Connection; skipPreflight?: boolean }
  ) => Promise<string[]>;
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
  const [isRestoringConnection, setIsRestoringConnection] = useState(() => {
    if (IS_WEB) {
      if (typeof window === 'undefined') return false;
      return loadPreferredWebWallet() !== null;
    }
    return true;
  });
  const [error, setError] = useState<string | null>(null);
  const [devWebWallet] = useState<Keypair | null>(() => (IS_WEB ? loadDevWebWallet() : null));
  const [preferredWebWallet, setPreferredWebWallet] = useState<SupportedWallet | null>(() =>
    loadPreferredWebWallet()
  );

  // Auto-airdrop on local validator when using dev wallet
  useEffect(() => {
    if (!SOLANA_CONFIG.isLocalValidator || !devWebWallet || wallet.authToken !== 'dev-web-wallet')
      return;

    const airdropIfNeeded = async () => {
      try {
        const connection = new Connection(SOLANA_CONFIG.rpcUrl, SOLANA_CONFIG.commitment);
        const balance = await connection.getBalance(devWebWallet.publicKey);
        if (balance < 1_000_000_000) {
          await connection.requestAirdrop(devWebWallet.publicKey, 2_000_000_000);
          console.log(`[Dev Wallet] Airdropped 2 SOL to ${devWebWallet.publicKey.toBase58()}`);
        }
      } catch (err) {
        console.warn('[Dev Wallet] Airdrop failed:', err);
      }
    };

    airdropIfNeeded();
  }, [devWebWallet, wallet.authToken]);

  // Eagerly restore existing wallet connection on mount.
  useEffect(() => {
    const restoreConnection = async () => {
      if (!IS_WEB) {
        try {
          const storedSession = await loadMobileWalletSession();
          if (!storedSession) {
            return;
          }

          const result = await transact(async (walletAdapter: Web3MobileWallet) => {
            return walletAdapter.reauthorize({
              identity: APP_IDENTITY,
              auth_token: storedSession.authToken,
            });
          });

          if (!result || result.accounts.length === 0) {
            await clearMobileWalletSession();
            return;
          }

          const matchingAccount =
            result.accounts.find((account) => {
              try {
                const address = new PublicKey(Buffer.from(account.address, 'base64')).toBase58();
                return address === storedSession.address;
              } catch (error) {
                return false;
              }
            }) ?? result.accounts[0];

          const publicKey = new PublicKey(Buffer.from(matchingAccount.address, 'base64'));
          const base58Address = publicKey.toBase58();
          const authToken = result.auth_token ?? storedSession.authToken;

          setWallet({
            isConnected: true,
            address: base58Address,
            publicKey,
            authToken,
          });

          await persistMobileWalletSession({
            address: base58Address,
            authToken,
            label: matchingAccount.label,
          });
          return;
        } catch (error) {
          console.warn('[WalletContext] Mobile wallet restore failed:', error);
          await clearMobileWalletSession();
          return;
        } finally {
          setIsRestoringConnection(false);
        }
      }

      if (typeof window === 'undefined') {
        return;
      }

      const targetWallet = preferredWebWallet ?? loadPreferredWebWallet();

      // DevKeypair: synchronous restore
      if (targetWallet === 'DevKeypair' && devWebWallet) {
        setWallet({
          isConnected: true,
          address: devWebWallet.publicKey.toBase58(),
          publicKey: devWebWallet.publicKey,
          authToken: 'dev-web-wallet',
        });
        setIsRestoringConnection(false);
        return;
      }

      if (!targetWallet) {
        setIsRestoringConnection(false);
        return;
      }

      const webWallet = getWebWalletProvider(targetWallet);
      if (!webWallet) {
        setIsRestoringConnection(false);
        return;
      }

      // If the provider already has a publicKey, use it directly
      if (webWallet.publicKey) {
        setWallet({
          isConnected: true,
          address: webWallet.publicKey.toBase58(),
          publicKey: webWallet.publicKey,
          authToken: 'web-wallet',
        });
        setIsRestoringConnection(false);
        return;
      }

      // Silent reconnect: onlyIfTrusted avoids showing a popup
      try {
        const response = await webWallet.connect({ onlyIfTrusted: true });
        let rawKey =
          (typeof response === 'object' && response !== null ? response.publicKey : undefined) ??
          webWallet.publicKey;
        if (!rawKey && webWallet.on) {
          rawKey = await new Promise<PublicKey | undefined>((resolve) => {
            const timeout = setTimeout(() => resolve(undefined), 3000);
            webWallet.on!('connect', (key: unknown) => {
              clearTimeout(timeout);
              resolve((key as PublicKey) ?? webWallet.publicKey ?? undefined);
            });
          });
        }
        const publicKey = rawKey instanceof PublicKey ? rawKey : rawKey ? new PublicKey(rawKey) : null;
        if (publicKey) {
          setWallet({
            isConnected: true,
            address: publicKey.toBase58(),
            publicKey,
            authToken: 'web-wallet',
          });
        }
      } catch {
        // User hasn't previously approved this app, or extension not ready — stay disconnected
      } finally {
        setIsRestoringConnection(false);
      }
    };

    restoreConnection();
  }, [devWebWallet, preferredWebWallet]);

  const connect = useCallback(
    async (walletName?: SupportedWallet): Promise<AuthorizationResult | null> => {
      setIsConnecting(true);
      setError(null);

      try {
        // TEMPORARY: DevKeypair bypasses browser wallet detection for local dev.
        // Remove this block when reverting to browser wallets only.
        if (walletName === 'DevKeypair' && IS_WEB && devWebWallet) {
          const address = devWebWallet.publicKey.toBase58();
          const authResult: AuthorizationResult = {
            address,
            label: 'Dev Keypair',
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

        const selectedWebWallet =
          walletName && walletName !== 'DevKeypair' ? walletName : preferredWebWallet;
        const webWallet = getWebWalletProvider(selectedWebWallet ?? undefined);
        if (webWallet) {
          const response = await webWallet.connect();

          // Most wallets return { publicKey } from connect(), but Solflare
          // returns a boolean and emits a 'connect' event with the publicKey.
          let rawKey =
            (typeof response === 'object' && response !== null ? response.publicKey : undefined) ??
            webWallet.publicKey;

          // If publicKey isn't available yet, wait for the provider's 'connect' event
          if (!rawKey && webWallet.on) {
            rawKey = await new Promise<PublicKey | undefined>((resolve) => {
              const timeout = setTimeout(() => resolve(undefined), 5000);
              webWallet.on!('connect', (key: unknown) => {
                clearTimeout(timeout);
                resolve((key as PublicKey) ?? webWallet.publicKey ?? undefined);
              });
            });
          }

          const publicKey = rawKey instanceof PublicKey ? rawKey : rawKey ? new PublicKey(rawKey) : null;
          if (!publicKey) {
            throw new Error(
              `Wallet connection failed — no publicKey returned. Is ${walletName ?? 'the wallet'} unlocked?`
            );
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

          if (selectedWebWallet) {
            setPreferredWebWallet(selectedWebWallet);
            storePreferredWebWallet(selectedWebWallet);
          }

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
            chain: SOLANA_CONFIG.mobileChain,
            identity: APP_IDENTITY,
          });

          return authorizationResult;
        });

        if (result && result.accounts.length > 0) {
          const account = result.accounts[0];
          // Mobile Wallet Adapter returns address as Base64-encoded bytes,
          // not base58. Decode to bytes first, then create PublicKey.
          const publicKey = new PublicKey(Buffer.from(account.address, 'base64'));
          const base58Address = publicKey.toBase58();

          const authResult: AuthorizationResult = {
            address: base58Address,
            label: account.label,
            authToken: result.auth_token,
          };

          setWallet({
            isConnected: true,
            address: base58Address,
            publicKey,
            authToken: result.auth_token,
          });

          await persistMobileWalletSession({
            address: base58Address,
            authToken: result.auth_token,
            label: account.label,
          });

          return authResult;
        }

        return null;
      } catch (err) {
        const errorMessage = getUserErrorMessage(err);
        setError(errorMessage);
        console.error('Wallet connection error:', err);
        return null;
      } finally {
        setIsConnecting(false);
      }
    },
    [devWebWallet, preferredWebWallet]
  );

  const disconnect = useCallback(() => {
    setWallet({
      isConnected: false,
      address: null,
      publicKey: null,
      authToken: null,
    });
    setPreferredWebWallet(null);
    storePreferredWebWallet(null);
    setError(null);
    void clearMobileWalletSession();
  }, []);

  const signMessage = useCallback(
    async (message: Uint8Array): Promise<Uint8Array> => {
      // DevKeypair: sign locally with ed25519
      if (wallet.authToken === 'dev-web-wallet' && devWebWallet) {
        const { ed25519 } = await import('@noble/curves/ed25519');
        return ed25519.sign(message, devWebWallet.secretKey.slice(0, 32));
      }

      // Web wallet (Phantom/Backpack/Jupiter)
      const webWallet = preferredWebWallet ? getWebWalletProvider(preferredWebWallet) : null;
      if (webWallet?.signMessage) {
        const result = await webWallet.signMessage(message);
        return result.signature;
      }

      if (IS_WEB) {
        throw new Error('Connected web wallet does not support signMessage');
      }

      // Mobile (MWA): sign via transact session
      const authToken = wallet.authToken;
      if (!authToken) {
        throw new Error('Wallet not connected');
      }

      return transact(async (walletAdapter: Web3MobileWallet) => {
        try {
          await walletAdapter.reauthorize({
            identity: APP_IDENTITY,
            auth_token: authToken,
          });
        } catch {
          await walletAdapter.authorize({
            chain: SOLANA_CONFIG.mobileChain,
            identity: APP_IDENTITY,
          });
        }

        const address = wallet.address;
        if (!address) throw new Error('No wallet address for signMessage');
        const base64Address = Buffer.from(new PublicKey(address).toBytes()).toString('base64');
        const result = await walletAdapter.signMessages({
          addresses: [base64Address],
          payloads: [message],
        });
        return result[0];
      });
    },
    [devWebWallet, preferredWebWallet, wallet.authToken, wallet.address]
  );

  const signAndSendTransaction = useCallback(
    async (
      transaction: Transaction | VersionedTransaction,
      options?: { connection?: Connection; skipPreflight?: boolean }
    ) => {
      try {
        const targetConnection =
          options?.connection ?? new Connection(SOLANA_CONFIG.rpcUrl, 'confirmed');
        const sendOptions = {
          preflightCommitment: SOLANA_CONFIG.commitment,
          skipPreflight: options?.skipPreflight ?? false,
        };

        // TEMPORARY: Route DevKeypair directly to local signing, bypassing browser wallet detection.
        // Remove this block when reverting to browser wallets only.
        if (wallet.authToken === 'dev-web-wallet' && devWebWallet) {
          return signAndSendWithDevWallet(targetConnection, transaction, devWebWallet, {
            skipPreflight: options?.skipPreflight,
          });
        }

        const webWallet = preferredWebWallet ? getWebWalletProvider(preferredWebWallet) : null;
        if (webWallet) {
          // Only set blockhash if the transaction doesn't already have one.
          // If the transaction has already been partially signed, changing the
          // blockhash would invalidate those signatures.
          if (transaction instanceof VersionedTransaction) {
            if (!transaction.message.recentBlockhash) {
              const latestBlockhash = await targetConnection.getLatestBlockhash(
                SOLANA_CONFIG.commitment
              );
              transaction.message.recentBlockhash = latestBlockhash.blockhash;
            }
          } else {
            // Check if transaction already has partial signatures - if so, don't modify blockhash
            const hasSignatures = transaction.signatures.some(
              (sig) => sig.signature !== null && !sig.signature.every((b) => b === 0)
            );
            // Only set blockhash if missing AND no partial signatures exist
            if (!hasSignatures && !transaction.recentBlockhash) {
              const latestBlockhash = await targetConnection.getLatestBlockhash(
                SOLANA_CONFIG.commitment
              );
              transaction.recentBlockhash = latestBlockhash.blockhash;
            }
            // Only set feePayer if not already set
            if (!transaction.feePayer) {
              transaction.feePayer = webWallet.publicKey ?? wallet.publicKey ?? undefined;
            }
          }

          const signed = await webWallet.signTransaction(transaction);
          const serialized = signed.serialize();
          return targetConnection.sendRawTransaction(serialized, sendOptions);
        }

        if (IS_WEB && devWebWallet) {
          return signAndSendWithDevWallet(targetConnection, transaction, devWebWallet);
        }

        if (IS_WEB && wallet.authToken === 'web-wallet') {
          throw new Error('Selected web wallet not available. Please reconnect your wallet.');
        }

        const authToken = wallet.authToken;
        if (!authToken) {
          throw new Error('Wallet not connected');
        }

        // Mobile wallet path: ensure blockhash and feePayer are set
        if (transaction instanceof VersionedTransaction) {
          if (!transaction.message.recentBlockhash) {
            const latestBlockhash = await targetConnection.getLatestBlockhash(
              SOLANA_CONFIG.commitment
            );
            transaction.message.recentBlockhash = latestBlockhash.blockhash;
          }
        } else {
          if (!transaction.recentBlockhash) {
            const latestBlockhash = await targetConnection.getLatestBlockhash(
              SOLANA_CONFIG.commitment
            );
            transaction.recentBlockhash = latestBlockhash.blockhash;
          }
          if (!transaction.feePayer) {
            transaction.feePayer = wallet.publicKey ?? undefined;
          }
        }

        return transact(async (walletAdapter: Web3MobileWallet) => {
          // Try reauthorize first; fall back to fresh authorize if token is stale
          try {
            console.log('[WalletContext] Mobile: reauthorizing...');
            await walletAdapter.reauthorize({
              identity: APP_IDENTITY,
              auth_token: authToken,
            });
          } catch (reauthorizeError) {
            console.warn('[WalletContext] Mobile: reauthorize failed, falling back to authorize...', reauthorizeError);
            const freshAuth = await walletAdapter.authorize({
              chain: SOLANA_CONFIG.mobileChain,
              identity: APP_IDENTITY,
            });
            if (freshAuth && freshAuth.accounts.length > 0) {
              const newToken = freshAuth.auth_token;
              const account = freshAuth.accounts[0];
              const pubkey = new PublicKey(Buffer.from(account.address, 'base64'));
              setWallet((prev) => ({ ...prev, authToken: newToken }));
              await persistMobileWalletSession({
                address: pubkey.toBase58(),
                authToken: newToken,
                label: account.label,
              });
              console.log('[WalletContext] Mobile: re-authorized with fresh token');
            }
          }
          console.log('[WalletContext] Mobile: signing tx...');

          const signed = await walletAdapter.signTransactions({
            transactions: [transaction],
          });
          console.log('[WalletContext] Mobile: signed, sending to RPC...');

          const serialized = signed[0].serialize();
          const signature = await targetConnection.sendRawTransaction(serialized, sendOptions);
          console.log('[WalletContext] Mobile: sent, signature:', signature);

          return signature;
        });
      } catch (err) {
        const e = err as
          | Error
          | {
              message?: string;
              logs?: string[];
              transactionLogs?: string[];
              cause?: unknown;
            };
        console.error('[WalletContext] signAndSendTransaction failed', {
          message: e?.message ?? String(err),
          logs: (e as { logs?: string[] }).logs ?? null,
          transactionLogs: (e as { transactionLogs?: string[] }).transactionLogs ?? null,
          cause: (e as { cause?: unknown }).cause ?? null,
          raw: err,
        });
        throw err;
      }
    },
    [devWebWallet, preferredWebWallet, wallet.authToken, wallet.publicKey]
  );

  const signAndSendTransactions = useCallback(
    async (
      transactions: Array<Transaction | VersionedTransaction>,
      options?: { connection?: Connection; skipPreflight?: boolean }
    ): Promise<string[]> => {
      if (transactions.length === 0) {
        return [];
      }

      const targetConnection =
        options?.connection ?? new Connection(SOLANA_CONFIG.rpcUrl, 'confirmed');
      const sendOptions = {
        preflightCommitment: SOLANA_CONFIG.commitment,
        skipPreflight: options?.skipPreflight ?? false,
      };

      // TEMPORARY: DevKeypair path
      if (wallet.authToken === 'dev-web-wallet' && devWebWallet) {
        const signatures: string[] = [];
        for (const tx of transactions) {
          const signature = await signAndSendWithDevWallet(targetConnection, tx, devWebWallet, {
            skipPreflight: sendOptions.skipPreflight,
          });
          signatures.push(signature);
          await targetConnection.confirmTransaction(signature, SOLANA_CONFIG.commitment);
        }
        return signatures;
      }

      const webWallet = preferredWebWallet ? getWebWalletProvider(preferredWebWallet) : null;
      if (webWallet && webWallet.signAllTransactions) {
        const prepared = [...transactions];
        for (const tx of prepared) {
          if (tx instanceof VersionedTransaction) {
            if (!tx.message.recentBlockhash) {
              const latestBlockhash = await targetConnection.getLatestBlockhash(
                SOLANA_CONFIG.commitment
              );
              tx.message.recentBlockhash = latestBlockhash.blockhash;
            }
          } else {
            const hasSignatures = tx.signatures.some(
              (sig) => sig.signature !== null && !sig.signature.every((b) => b === 0)
            );
            if (!hasSignatures && !tx.recentBlockhash) {
              const latestBlockhash = await targetConnection.getLatestBlockhash(
                SOLANA_CONFIG.commitment
              );
              tx.recentBlockhash = latestBlockhash.blockhash;
            }
            if (!tx.feePayer) {
              tx.feePayer = webWallet.publicKey ?? wallet.publicKey ?? undefined;
            }
          }
        }

        const signed = await webWallet.signAllTransactions(prepared);
        const signatures: string[] = [];
        for (const tx of signed) {
          const signature = await targetConnection.sendRawTransaction(tx.serialize(), sendOptions);
          signatures.push(signature);
          // Preserve transaction order dependencies (e.g. start_session -> delegate_session)
          // by waiting for each tx to confirm before submitting the next.
          await targetConnection.confirmTransaction(signature, SOLANA_CONFIG.commitment);
        }
        return signatures;
      }

      if (IS_WEB && wallet.authToken === 'web-wallet') {
        throw new Error('Selected web wallet does not support batched signing. Please reconnect.');
      }

      const authToken = wallet.authToken;
      if (!authToken) {
        throw new Error('Wallet not connected');
      }

      return transact(async (walletAdapter: Web3MobileWallet) => {
        // Try reauthorize first; fall back to fresh authorize if token is stale
        try {
          await walletAdapter.reauthorize({
            identity: APP_IDENTITY,
            auth_token: authToken,
          });
        } catch (reauthorizeError) {
          console.warn('[WalletContext] Mobile: reauthorize failed (batch), falling back to authorize...', reauthorizeError);
          const freshAuth = await walletAdapter.authorize({
            chain: SOLANA_CONFIG.mobileChain,
            identity: APP_IDENTITY,
          });
          if (freshAuth && freshAuth.accounts.length > 0) {
            const newToken = freshAuth.auth_token;
            const account = freshAuth.accounts[0];
            const pubkey = new PublicKey(Buffer.from(account.address, 'base64'));
            setWallet((prev) => ({ ...prev, authToken: newToken }));
            await persistMobileWalletSession({
              address: pubkey.toBase58(),
              authToken: newToken,
              label: account.label,
            });
            console.log('[WalletContext] Mobile: re-authorized with fresh token (batch)');
          }
        }

        // Use signTransactions + manual send instead of signAndSendTransactions
        // to properly handle partially-signed transactions (e.g. session signer).
        // MWA's signAndSendTransactions can fail to show the approval UI when
        // transactions already carry partial signatures.
        const signed = await walletAdapter.signTransactions({ transactions });
        const signatures: string[] = [];
        for (const tx of signed) {
          const serialized = tx.serialize();
          const signature = await targetConnection.sendRawTransaction(serialized, sendOptions);
          signatures.push(signature);
        }
        return signatures;
      });
    },
    [devWebWallet, preferredWebWallet, wallet.authToken, wallet.publicKey]
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
        isRestoringConnection,
        error,
        signMessage,
        signAndSendTransaction,
        signAndSendTransactions,
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
