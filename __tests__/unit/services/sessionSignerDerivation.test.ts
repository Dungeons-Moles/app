// Set required env vars before imports trigger config validation
process.env.EXPO_PUBLIC_SESSION_MANAGER_PROGRAM_ID = '11111111111111111111111111111111';
process.env.EXPO_PUBLIC_MAP_GENERATOR_PROGRAM_ID = '11111111111111111111111111111111';
process.env.EXPO_PUBLIC_PLAYER_PROFILE_PROGRAM_ID = '11111111111111111111111111111111';
process.env.EXPO_PUBLIC_GAMEPLAY_STATE_PROGRAM_ID = '11111111111111111111111111111111';
process.env.EXPO_PUBLIC_PLAYER_INVENTORY_PROGRAM_ID = '11111111111111111111111111111111';
process.env.EXPO_PUBLIC_POI_SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';
process.env.EXPO_PUBLIC_NFT_MARKETPLACE_PROGRAM_ID = '11111111111111111111111111111111';

// Mock react-native (not available in Node test environment)
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// Mock secure storage (depends on react-native Platform)
jest.mock('@/services/storage/secureStorage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  deleteItem: jest.fn(),
}));

import {
  buildSessionDerivationMessage,
  deriveSessionSignerFromSignature,
} from '@/services/solana/sessionSigner';

describe('session signer derivation', () => {
  const makeSignature = (seed: number): Uint8Array =>
    Uint8Array.from({ length: 64 }, (_, index) => (seed + index) % 256);

  it('derives the same session signer from the same wallet signature', () => {
    const message = buildSessionDerivationMessage('campaign-7', 3n);
    expect(new TextDecoder().decode(message)).toBe('DnM-session-campaign-7-3');

    const signatureA = makeSignature(11);
    const signatureB = makeSignature(11);

    const sessionSignerA = deriveSessionSignerFromSignature(signatureA);
    const sessionSignerB = deriveSessionSignerFromSignature(signatureB);

    expect(sessionSignerA.publicKey.toBase58()).toBe(sessionSignerB.publicKey.toBase58());
  });

  it('derives different session signers for different messages', () => {
    const signatureA = makeSignature(21);
    const signatureB = makeSignature(22);

    const sessionSignerA = deriveSessionSignerFromSignature(signatureA);
    const sessionSignerB = deriveSessionSignerFromSignature(signatureB);

    expect(sessionSignerA.publicKey.toBase58()).not.toBe(sessionSignerB.publicKey.toBase58());
  });
});
