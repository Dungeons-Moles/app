/**
 * Generic retry utility for parsing on-chain events.
 *
 * Retries a function up to `maxAttempts` times with a delay between each attempt.
 * Returns the first truthy result, or null if all attempts fail.
 */
export async function parseWithRetry<T>(
  fn: () => Promise<T | null | undefined>,
  options?: { maxAttempts?: number; delayMs?: number; label?: string }
): Promise<T | null> {
  const { maxAttempts = 3, delayMs = 400, label = 'event' } = options ?? {};

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await fn();
      if (result != null) return result;
      console.warn(
        `[parseWithRetry] ${label} attempt ${attempt + 1}/${maxAttempts}: no result`
      );
    } catch (err) {
      console.warn(
        `[parseWithRetry] ${label} attempt ${attempt + 1}/${maxAttempts} error:`,
        err
      );
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  console.warn(`[parseWithRetry] Could not parse ${label} after ${maxAttempts} attempts`);
  return null;
}
