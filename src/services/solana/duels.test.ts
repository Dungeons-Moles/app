// Set required env vars before imports trigger config validation
process.env.EXPO_PUBLIC_SESSION_MANAGER_PROGRAM_ID = '11111111111111111111111111111111';
process.env.EXPO_PUBLIC_MAP_GENERATOR_PROGRAM_ID = '11111111111111111111111111111111';
process.env.EXPO_PUBLIC_PLAYER_PROFILE_PROGRAM_ID = '11111111111111111111111111111111';
process.env.EXPO_PUBLIC_GAMEPLAY_STATE_PROGRAM_ID = '11111111111111111111111111111111';
process.env.EXPO_PUBLIC_PLAYER_INVENTORY_PROGRAM_ID = '11111111111111111111111111111111';
process.env.EXPO_PUBLIC_POI_SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';
process.env.EXPO_PUBLIC_NFT_MARKETPLACE_PROGRAM_ID = '11111111111111111111111111111111';

import { PublicKey } from '@solana/web3.js';
import type { Program } from '@coral-xyz/anchor';

import { fetchDuelEntry, deriveDuelEntryPda } from './duels';
import { GAMEPLAY_STATE_PROGRAM_ID } from './constants';

describe('fetchDuelEntry', () => {
  it('decodes matched creator from the raw duel entry account', async () => {
    const sessionPda = new PublicKey('11111111111111111111111111111112');
    const player = new PublicKey('11111111111111111111111111111113');
    const creator = new PublicKey('11111111111111111111111111111114');
    const [duelEntryPda] = deriveDuelEntryPda(sessionPda);

    const getAccountInfo = jest.fn().mockResolvedValue({
      owner: GAMEPLAY_STATE_PROGRAM_ID,
      data: Buffer.from('duel-entry-data'),
    });
    const decode = jest.fn().mockReturnValue({
      player,
      seed: 99n,
      entryLamports: 100_000_000n,
      matchedCreator: { player: creator },
      settled: false,
    });

    const program = {
      provider: {
        connection: {
          getAccountInfo,
        },
      },
      coder: {
        accounts: {
          decode,
        },
      },
    } as unknown as Program;

    const duelEntry = await fetchDuelEntry(program, sessionPda);

    expect(getAccountInfo).toHaveBeenCalledWith(duelEntryPda, expect.anything());
    expect(decode).toHaveBeenCalledWith('duelEntry', Buffer.from('duel-entry-data'));
    expect(duelEntry).toEqual({
      player,
      seed: 99n,
      entryLamports: 100_000_000,
      matchedCreatorPlayer: creator,
      settled: false,
    });
  });
});
