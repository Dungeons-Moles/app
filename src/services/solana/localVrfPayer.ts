import { Keypair } from '@solana/web3.js';
import { SOLANA_CONFIG } from './config';

let _localVrfPayer: Keypair | null | undefined;

const loadFromEnv = (value: string | undefined): Keypair | null => {
  if (!value) return null;
  try {
    return Keypair.fromSecretKey(new Uint8Array(Buffer.from(value, 'base64')));
  } catch {
    return null;
  }
};

/**
 * Local-only VRF request payer.
 *
 * This is a workaround for local ER behavior where freshly-created session
 * signers can fail as fee payers for request_*_vrf transactions. It never
 * applies outside localhost mode.
 */
export const getLocalVrfPayerKeypair = (): Keypair | null => {
  // Only available in dev builds against a local validator.
  // EXPO_PUBLIC_ values are inlined into the bundle — reading private keys
  // outside __DEV__ would ship them to every client.
  if (!__DEV__ || !SOLANA_CONFIG.isLocalValidator) return null;
  if (_localVrfPayer !== undefined) return _localVrfPayer;

  const explicit = loadFromEnv(process.env.EXPO_PUBLIC_LOCAL_VRF_PAYER_KEYPAIR);
  if (explicit) {
    _localVrfPayer = explicit;
    return _localVrfPayer;
  }

  const validatorFallback = loadFromEnv(process.env.EXPO_PUBLIC_ER_VALIDATOR_KEYPAIR);
  if (validatorFallback) {
    _localVrfPayer = validatorFallback;
    return _localVrfPayer;
  }

  _localVrfPayer = null;
  return _localVrfPayer;
};
