/**
 * Payment token selection hook.
 *
 * Consumes the Jupiter service to provide token selection, pricing, and
 * balance information to UI components. Auto-refreshes prices every 30s.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { IS_DEVNET } from '@/services/solana/constants';
import {
  SUPPORTED_TOKENS,
  fetchTokenPrices,
  fetchTokenBalance,
  getSwapQuote,
  type SupportedToken,
  type SwapQuote,
} from '@/services/solana/jupiter';

const PRICE_REFRESH_INTERVAL_MS = 30_000;

export interface PaymentTokenState {
  supportedTokens: SupportedToken[];
  selectedToken: SupportedToken;
  setSelectedToken: (token: SupportedToken) => void;
  quote: SwapQuote | null;
  isQuoteLoading: boolean;
  quoteError: string | null;
  tokenBalance: number | null;
  hasEnoughBalance: boolean;
  solUsdPrice: number | null;
  tokenUsdPrice: number | null;
  isDevnet: boolean;
}

export function usePaymentToken(requiredLamports: bigint): PaymentTokenState {
  const { wallet } = useWallet();
  const { connection } = useSolanaConnection();

  const [selectedToken, setSelectedToken] = useState<SupportedToken>(SUPPORTED_TOKENS[0]);
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [solUsdPrice, setSolUsdPrice] = useState<number | null>(null);
  const [tokenUsdPrice, setTokenUsdPrice] = useState<number | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetch prices on mount and every 30s
  const refreshPrices = useCallback(async () => {
    try {
      const prices = await fetchTokenPrices();
      if (!mountedRef.current) return;

      const solMint = SUPPORTED_TOKENS[0].mint.toBase58();
      if (prices[solMint]) setSolUsdPrice(prices[solMint]);

      const tokenMint = selectedToken.mint.toBase58();
      if (prices[tokenMint]) setTokenUsdPrice(prices[tokenMint]);
    } catch {
      // Prices are best-effort
    }
  }, [selectedToken.mint]);

  useEffect(() => {
    refreshPrices();
    const interval = setInterval(refreshPrices, PRICE_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshPrices]);

  // Fetch balance when token or wallet changes
  useEffect(() => {
    if (!wallet.publicKey) {
      setTokenBalance(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const result = await fetchTokenBalance(connection, wallet.publicKey!, selectedToken);
      if (!cancelled && mountedRef.current) {
        setTokenBalance(result?.balance ?? null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connection, wallet.publicKey, selectedToken]);

  // Fetch quote when non-SOL token selected
  useEffect(() => {
    if (selectedToken.isNative) {
      setQuote(null);
      setIsQuoteLoading(false);
      setQuoteError(null);
      return;
    }

    let cancelled = false;
    setIsQuoteLoading(true);
    setQuoteError(null);

    (async () => {
      try {
        const result = await getSwapQuote(selectedToken, requiredLamports);
        if (!cancelled && mountedRef.current) {
          setQuote(result);
          if (!result) setQuoteError('Unable to get price quote');
        }
      } catch (err) {
        if (!cancelled && mountedRef.current) {
          setQuoteError(err instanceof Error ? err.message : 'Quote failed');
        }
      } finally {
        if (!cancelled && mountedRef.current) {
          setIsQuoteLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedToken, requiredLamports]);

  // Update token USD price when selected token changes
  useEffect(() => {
    (async () => {
      const prices = await fetchTokenPrices();
      if (!mountedRef.current) return;
      const key = selectedToken.mint.toBase58();
      setTokenUsdPrice(prices[key] ?? null);
    })();
  }, [selectedToken.mint]);

  const hasEnoughBalance = (() => {
    if (tokenBalance === null) return false;
    if (selectedToken.isNative) {
      return tokenBalance * 1e9 >= Number(requiredLamports);
    }
    if (!quote) return false;
    return tokenBalance >= quote.inputAmount;
  })();

  return {
    supportedTokens: SUPPORTED_TOKENS,
    selectedToken,
    setSelectedToken,
    quote,
    isQuoteLoading,
    quoteError,
    tokenBalance,
    hasEnoughBalance,
    solUsdPrice,
    tokenUsdPrice,
    isDevnet: IS_DEVNET,
  };
}
