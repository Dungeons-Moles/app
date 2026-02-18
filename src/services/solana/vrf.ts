import { SOLANA_CONFIG } from './config';

/**
 * MagicBlock VRF helper with secure local fallback.
 *
 * If EXPO_PUBLIC_MAGICBLOCK_VRF_ENDPOINT is configured, this attempts to fetch
 * verifiable randomness from that endpoint. On failures, it falls back to
 * WebCrypto randomness to avoid blocking gameplay.
 */

const MAX_I31 = 2_147_483_647;

function normalizeSeed(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.floor(Math.abs(value)) % MAX_I31;
    return normalized > 0 ? normalized : 1;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed.startsWith('0x')) {
      try {
        const parsed = BigInt(trimmed);
        const normalized = Number(parsed % BigInt(MAX_I31));
        return normalized > 0 ? normalized : 1;
      } catch {
        return null;
      }
    }

    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isNaN(parsed)) {
      return null;
    }

    const normalized = Math.floor(Math.abs(parsed)) % MAX_I31;
    return normalized > 0 ? normalized : 1;
  }

  return null;
}

function getLocalSecureSeed(): number {
  const bytes = new Uint32Array(1);
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
    const normalized = bytes[0] % MAX_I31;
    return normalized > 0 ? normalized : 1;
  }

  // Last resort for environments without crypto.
  return (Date.now() % (MAX_I31 - 1)) + 1;
}

export async function getVrfSeed(): Promise<number> {
  const vrfEndpoint = SOLANA_CONFIG.vrfEndpoint;
  if (!vrfEndpoint) {
    return getLocalSecureSeed();
  }

  try {
    const response = await fetch(vrfEndpoint, { method: 'POST' });
    if (!response.ok) {
      throw new Error(`VRF endpoint returned ${response.status}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const fromSeed = normalizeSeed(payload.seed);
    const fromValue = normalizeSeed(payload.value);
    const fromRandomness = normalizeSeed(payload.randomness);
    const seed = fromSeed ?? fromValue ?? fromRandomness;
    if (seed !== null) {
      return seed;
    }

    throw new Error('VRF payload did not include a usable seed');
  } catch (error) {
    console.warn('[vrf] Falling back to local secure randomness:', error);
    return getLocalSecureSeed();
  }
}
