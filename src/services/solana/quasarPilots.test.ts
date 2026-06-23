import { PublicKey, SYSVAR_RENT_PUBKEY, SystemProgram } from '@solana/web3.js';
import {
  buildInitializeProfileTx,
  decodeMarketplaceConfig,
  decodePlayerProfile,
  fetchPlayerProfileAccount,
} from './quasarPilots';

function key(fill: number): PublicKey {
  return new PublicKey(new Uint8Array(32).fill(fill));
}

describe('quasar pilot adapters', () => {
  it('decodes the player-profile zero-copy account layout', () => {
    const owner = key(1);
    const skin = key(2);
    const data = Buffer.alloc(145);
    Buffer.from([82, 226, 99, 87, 164, 130, 181, 80]).copy(data, 0);
    owner.toBuffer().copy(data, 8);
    data.writeUInt32LE(7, 40);
    data[44] = 3;
    data.writeUInt32LE(11, 45);
    data.writeBigInt64LE(1234n, 49);
    data[57] = 255;
    data[58] = 0xaa;
    data[68] = 0xbb;
    data[78] = 1;
    skin.toBuffer().copy(data, 79);
    data[111] = 4;
    data[112] = 5;
    Buffer.from('Moles').copy(data, 113);

    const decoded = decodePlayerProfile(data);

    expect(decoded.owner.toBase58()).toBe(owner.toBase58());
    expect(decoded.equippedSkin?.toBase58()).toBe(skin.toBase58());
    expect(decoded.name).toBe('Moles');
    expect(decoded.totalRuns).toBe(7);
    expect(decoded.highestLevelUnlocked).toBe(3);
    expect(decoded.availableRuns).toBe(11);
    expect(decoded.unlockedItems[0]).toBe(0xaa);
    expect(decoded.activeItemPool[0]).toBe(0xbb);
    expect(decoded.gauntletBoosters).toBe(4);
  });

  it('fetches player-profile through confirmed on-chain state', async () => {
    const owner = key(3);
    const data = Buffer.alloc(145);
    Buffer.from([82, 226, 99, 87, 164, 130, 181, 80]).copy(data, 0);
    owner.toBuffer().copy(data, 8);
    data.writeUInt32LE(2, 40);
    data[44] = 1;
    data.writeUInt32LE(5, 45);
    data.writeBigInt64LE(99n, 49);

    const address = key(4);
    const connection = {
      getAccountInfo: jest.fn().mockResolvedValue({ data }),
    };

    const decoded = await fetchPlayerProfileAccount(connection as any, address);

    expect(connection.getAccountInfo).toHaveBeenCalledWith(address, 'confirmed');
    expect(decoded?.owner.toBase58()).toBe(owner.toBase58());
    expect(decoded?.availableRuns).toBe(5);
  });

  it('decodes the marketplace config zero-copy account layout', () => {
    const data = Buffer.alloc(173);
    Buffer.from([169, 22, 247, 131, 182, 200, 81, 124]).copy(data, 0);
    key(1).toBuffer().copy(data, 8);
    key(2).toBuffer().copy(data, 40);
    key(3).toBuffer().copy(data, 72);
    key(4).toBuffer().copy(data, 104);
    key(5).toBuffer().copy(data, 136);
    data.writeUInt16LE(250, 168);
    data.writeUInt16LE(150, 170);
    data[172] = 9;

    const decoded = decodeMarketplaceConfig(data);

    expect(decoded.skinsCollection.toBase58()).toBe(key(2).toBase58());
    expect(decoded.itemsCollection.toBase58()).toBe(key(3).toBase58());
    expect(decoded.companyFeeBps).toBe(250);
    expect(decoded.gauntletFeeBps).toBe(150);
    expect(decoded.bump).toBe(9);
  });

  it('builds initializeProfile with Quasar account order and string encoding', () => {
    const owner = key(7);
    const profile = key(8);
    const tx = buildInitializeProfileTx({
      owner,
      playerProfile: profile,
      name: 'pilot',
    });
    const ix = tx.instructions[0];

    expect(ix.keys.map((meta) => meta.pubkey.toBase58())).toEqual([
      owner.toBase58(),
      profile.toBase58(),
      SYSVAR_RENT_PUBKEY.toBase58(),
      SystemProgram.programId.toBase58(),
    ]);
    expect(ix.keys[0]).toMatchObject({ isWritable: true, isSigner: true });
    expect(ix.keys[1]).toMatchObject({ isWritable: true, isSigner: false });
    expect(ix.data.subarray(0, 8)).toEqual(Buffer.from([32, 145, 77, 213, 58, 39, 251, 234]));
    expect(ix.data[8]).toBe(5);
    expect(ix.data.subarray(9).toString('utf8')).toBe('pilot');
  });
});
