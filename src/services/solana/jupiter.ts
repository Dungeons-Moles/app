/**
 * Jupiter Swap Service
 *
 * Core service for multi-token payment UX. No React dependencies.
 * - Fetches real USD prices from Jupiter Price API (works from devnet frontend)
 * - Provides mock swap quotes on devnet, real quotes on mainnet
 * - Builds composed swap+pay transactions for mainnet
 */
import { Connection, PublicKey } from '@solana/web3.js';
import * as Sentry from '@sentry/react-native';
import { TOKEN_MINTS, IS_DEVNET } from './constants';

const JUP_API_KEY = process.env.EXPO_PUBLIC_JUPITER_API_KEY ?? '';

// ============================================================================
// Token Registry
// ============================================================================

export interface SupportedToken {
  symbol: string;
  mint: PublicKey;
  decimals: number;
  isNative: boolean;
}

export const SUPPORTED_TOKENS: SupportedToken[] = [
  { symbol: 'SOL', mint: TOKEN_MINTS.SOL, decimals: 9, isNative: true },
  { symbol: 'USDC', mint: TOKEN_MINTS.USDC, decimals: 6, isNative: false },
  { symbol: 'JUP', mint: TOKEN_MINTS.JUP, decimals: 6, isNative: false },
  { symbol: 'SKR', mint: TOKEN_MINTS.SKR, decimals: 6, isNative: false },
];

// ============================================================================
// Price Cache
// ============================================================================

const PRICE_CACHE_TTL_MS = 30_000;

interface PriceCacheEntry {
  prices: Record<string, number>;
  fetchedAt: number;
}

let priceCache: PriceCacheEntry | null = null;

// ============================================================================
// Price Fetching
// ============================================================================

/**
 * Fetch USD prices for token mints from Jupiter Price API v2.
 * Uses mainnet prices — works from any cluster since it's a read-only HTTP call.
 * Results are cached for 30 seconds.
 */
export async function fetchTokenPrices(
  mints: PublicKey[] = SUPPORTED_TOKENS.map((t) => t.mint)
): Promise<Record<string, number>> {
  if (priceCache && Date.now() - priceCache.fetchedAt < PRICE_CACHE_TTL_MS) {
    return priceCache.prices;
  }

  const ids = mints.map((m) => m.toBase58()).join(',');
  const url = `https://api.jup.ag/price/v3?ids=${ids}`;

  try {
    const headers: Record<string, string> = {};
    if (JUP_API_KEY) headers['x-api-key'] = JUP_API_KEY;

    const response = await fetch(url, { headers });
    if (!response.ok) {
      console.warn('[jupiter] Price API returned', response.status);
      return priceCache?.prices ?? {};
    }

    const json = (await response.json()) as Record<
      string,
      { usdPrice: number } | undefined
    >;

    const prices: Record<string, number> = {};
    for (const mint of mints) {
      const key = mint.toBase58();
      const entry = json[key];
      if (entry?.usdPrice) {
        prices[key] = entry.usdPrice;
      }
    }

    priceCache = { prices, fetchedAt: Date.now() };
    return prices;
  } catch (err) {
    console.warn('[jupiter] Failed to fetch prices:', err);
    Sentry.captureException(err, { tags: { source: 'jupiter.fetchTokenPrices' } });
    return priceCache?.prices ?? {};
  }
}

// ============================================================================
// Token Balance
// ============================================================================

/**
 * Get token balance for a wallet.
 * - Native SOL: uses getBalance
 * - SPL tokens: uses getTokenAccountsByOwner (returns 0 on devnet if no account)
 */
export async function fetchTokenBalance(
  connection: Connection,
  owner: PublicKey,
  token: SupportedToken
): Promise<{ balance: number; rawBalance: bigint } | null> {
  try {
    if (token.isNative) {
      const lamports = await connection.getBalance(owner);
      return {
        balance: lamports / 10 ** token.decimals,
        rawBalance: BigInt(lamports),
      };
    }

    // SPL token — on devnet these likely don't exist
    const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const accounts = await connection.getTokenAccountsByOwner(owner, {
      mint: token.mint,
      programId: TOKEN_PROGRAM_ID,
    });

    if (accounts.value.length === 0) {
      return { balance: 0, rawBalance: 0n };
    }

    // Parse token account data — amount is at offset 64, 8 bytes LE
    const data = accounts.value[0].account.data;
    const rawBalance = data.readBigUInt64LE(64);
    return {
      balance: Number(rawBalance) / 10 ** token.decimals,
      rawBalance,
    };
  } catch (err) {
    console.warn('[jupiter] Failed to fetch balance for', token.symbol, err);
    Sentry.captureException(err, { tags: { source: 'jupiter.fetchTokenBalance' } });
    return null;
  }
}

// ============================================================================
// Swap Quote
// ============================================================================

export interface SwapQuote {
  inputToken: SupportedToken;
  inputAmount: number;
  inputAmountRaw: bigint;
  outputLamports: bigint;
  outputSol: number;
  priceImpactPct: number;
  inputUsdValue: number;
  outputUsdValue: number;
  isDevnetMock: boolean;
}

/**
 * Get a swap quote for converting inputToken to SOL.
 * - Devnet: returns a mock quote calculated from real Jupiter prices.
 * - Mainnet: calls Jupiter quote API with ExactOut mode.
 */
export async function getSwapQuote(
  inputToken: SupportedToken,
  outputLamports: bigint
): Promise<SwapQuote | null> {
  if (inputToken.isNative) return null;

  const prices = await fetchTokenPrices();
  const solMint = TOKEN_MINTS.SOL.toBase58();
  const inputMint = inputToken.mint.toBase58();
  const solPrice = prices[solMint];
  const inputPrice = prices[inputMint];

  if (!solPrice || !inputPrice) {
    console.warn('[jupiter] Missing prices for quote', { solPrice, inputPrice });
    return null;
  }

  const outputSol = Number(outputLamports) / 1e9;
  const outputUsdValue = outputSol * solPrice;

  if (IS_DEVNET) {
    // Mock quote using real USD prices
    const inputAmount = outputUsdValue / inputPrice;
    const inputAmountRaw = BigInt(Math.ceil(inputAmount * 10 ** inputToken.decimals));

    return {
      inputToken,
      inputAmount,
      inputAmountRaw,
      outputLamports,
      outputSol,
      priceImpactPct: 0.01, // Mock minimal impact
      inputUsdValue: inputAmount * inputPrice,
      outputUsdValue,
      isDevnetMock: true,
    };
  }

  // Mainnet: call Jupiter quote API
  try {
    const params = new URLSearchParams({
      inputMint,
      outputMint: solMint,
      amount: outputLamports.toString(),
      swapMode: 'ExactOut',
      slippageBps: '50',
    });

    const quoteHeaders: Record<string, string> = {};
    if (JUP_API_KEY) quoteHeaders['x-api-key'] = JUP_API_KEY;

    const response = await fetch(`https://api.jup.ag/swap/v1/quote?${params}`, { headers: quoteHeaders });
    if (!response.ok) {
      console.warn('[jupiter] Quote API returned', response.status);
      return null;
    }

    const data = (await response.json()) as {
      inAmount: string;
      outAmount: string;
      priceImpactPct: string;
    };

    const inputAmountRaw = BigInt(data.inAmount);
    const inputAmount = Number(inputAmountRaw) / 10 ** inputToken.decimals;

    return {
      inputToken,
      inputAmount,
      inputAmountRaw,
      outputLamports,
      outputSol,
      priceImpactPct: parseFloat(data.priceImpactPct),
      inputUsdValue: inputAmount * inputPrice,
      outputUsdValue,
      isDevnetMock: false,
    };
  } catch (err) {
    console.warn('[jupiter] Failed to get swap quote:', err);
    Sentry.captureException(err, { tags: { source: 'jupiter.getSwapQuote' } });
    return null;
  }
}
