import { useSessionSigner, type UseSessionSignerReturn } from './useSessionSigner';

/**
 * Session-key signer hook.
 *
 * Current implementation reuses the existing local ephemeral signer flow
 * (formerly called sessionSigner wallet) to remain compatible with on-chain signer
 * constraints while frontend migrates to session-key terminology.
 */
export function useSessionKey(): UseSessionSignerReturn {
  return useSessionSigner();
}

