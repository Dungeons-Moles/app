import { Connection } from '@solana/web3.js';

const NETWORK_FAILURE_RE =
  /network request failed|fetch failed|econnrefused|503|502|504|service unavailable/i;

/**
 * Run an RPC operation with automatic fallback to a secondary connection.
 * If `fn(primary)` throws a network-level error and `fallback` is provided,
 * retries once with the fallback connection.
 */
export async function withRpcFallback<T>(
  primary: Connection,
  fallback: Connection | null | undefined,
  fn: (conn: Connection) => Promise<T>
): Promise<T> {
  try {
    return await fn(primary);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (fallback && NETWORK_FAILURE_RE.test(msg)) {
      console.warn('[withRpcFallback] Primary RPC failed, trying fallback:', msg);
      return fn(fallback);
    }
    throw err;
  }
}

/**
 * Generic retry utility for parsing on-chain events.
 *
 * Retries a function up to `maxAttempts` times with a delay between each attempt.
 * Returns the first truthy result, or null if all attempts fail.
 */
export async function parseWithRetry<T>(
  fn: () => Promise<T | null | undefined>,
  options?: { maxAttempts?: number; delayMs?: number; label?: string; quiet?: boolean }
): Promise<T | null> {
  const { maxAttempts = 3, delayMs = 400, label = 'event', quiet = false } = options ?? {};

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await fn();
      if (result != null) return result;
      if (!quiet) {
        console.warn(
          `[parseWithRetry] ${label} attempt ${attempt + 1}/${maxAttempts}: no result`
        );
      }
    } catch (err) {
      if (!quiet) {
        console.warn(
          `[parseWithRetry] ${label} attempt ${attempt + 1}/${maxAttempts} error:`,
          err
        );
      }
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (!quiet) {
    console.warn(`[parseWithRetry] Could not parse ${label} after ${maxAttempts} attempts`);
  }
  return null;
}
