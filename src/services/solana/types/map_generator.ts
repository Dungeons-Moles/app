/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/map_generator.json`.
 */
export type MapGenerator = {
  address: 'BYdGuEGf8NqtLnHpSRuZFrPGEgvdxMfGfTt71QVBxYHa';
  metadata: {
    name: 'mapGenerator';
    version: '0.1.0';
    spec: '0.1.0';
    description: 'Map Generator Program for deterministic procedural dungeon generation';
  };
  instructions: [
    {
      name: 'batchUpdateMapConfig';
      docs: ['Batch updates multiple seed mappings (admin only).'];
      discriminator: [237, 50, 79, 73, 13, 64, 249, 35];
      accounts: [
        {
          name: 'mapConfig';
          writable: true;
          pda: {
            seeds: [{ kind: 'const'; value: [109, 97, 112, 95, 99, 111, 110, 102, 105, 103] }];
          };
        },
        { name: 'admin'; signer: true; relations: ['mapConfig'] },
      ];
      args: [{ name: 'updates'; type: { vec: { defined: { name: 'seedUpdate' } } } }];
    },
    {
      name: 'getMapSeed';
      docs: [
        'Returns the seed for a given level.',
        'This is a view function - state is not modified.',
      ];
      discriminator: [62, 220, 207, 99, 99, 196, 117, 214];
      accounts: [
        {
          name: 'mapConfig';
          pda: {
            seeds: [{ kind: 'const'; value: [109, 97, 112, 95, 99, 111, 110, 102, 105, 103] }];
          };
        },
      ];
      args: [{ name: 'level'; type: 'u8' }];
      returns: 'u64';
    },
    {
      name: 'initializeMapConfig';
      docs: [
        'Initializes the map configuration with default seed mappings.',
        'Each level i gets seed value i as default.',
      ];
      discriminator: [158, 211, 210, 224, 140, 216, 211, 35];
      accounts: [
        {
          name: 'mapConfig';
          writable: true;
          pda: {
            seeds: [{ kind: 'const'; value: [109, 97, 112, 95, 99, 111, 110, 102, 105, 103] }];
          };
        },
        { name: 'admin'; writable: true; signer: true },
        { name: 'systemProgram'; address: '11111111111111111111111111111111' },
      ];
      args: [];
    },
    {
      name: 'transferAdmin';
      docs: ['Transfers admin authority to a new address.'];
      discriminator: [42, 242, 66, 106, 228, 10, 111, 156];
      accounts: [
        {
          name: 'mapConfig';
          writable: true;
          pda: {
            seeds: [{ kind: 'const'; value: [109, 97, 112, 95, 99, 111, 110, 102, 105, 103] }];
          };
        },
        { name: 'admin'; signer: true; relations: ['mapConfig'] },
      ];
      args: [{ name: 'newAdmin'; type: 'pubkey' }];
    },
    {
      name: 'updateMapConfig';
      docs: ['Updates the seed for a single level (admin only).'];
      discriminator: [155, 134, 158, 245, 122, 214, 185, 116];
      accounts: [
        {
          name: 'mapConfig';
          writable: true;
          pda: {
            seeds: [{ kind: 'const'; value: [109, 97, 112, 95, 99, 111, 110, 102, 105, 103] }];
          };
        },
        { name: 'admin'; signer: true; relations: ['mapConfig'] },
      ];
      args: [{ name: 'level'; type: 'u8' }, { name: 'seed'; type: 'u64' }];
    },
    {
      name: 'verifyMapHash';
      docs: [
        'Verifies that a submitted map hash matches the expected hash.',
        'Used to validate off-chain map generation.',
      ];
      discriminator: [8, 182, 82, 250, 35, 144, 217, 47];
      accounts: [
        {
          name: 'mapConfig';
          pda: {
            seeds: [{ kind: 'const'; value: [109, 97, 112, 95, 99, 111, 110, 102, 105, 103] }];
          };
        },
      ];
      args: [{ name: 'level'; type: 'u8' }, { name: 'submittedHash'; type: { array: ['u8', 32] } }];
      returns: 'bool';
    },
  ];
  accounts: [{ name: 'mapConfig'; discriminator: [186, 3, 214, 68, 161, 115, 92, 173] }];
  events: [
    { name: 'adminTransferred'; discriminator: [255, 147, 182, 5, 199, 217, 38, 179] },
    { name: 'mapConfigUpdated'; discriminator: [75, 210, 48, 93, 233, 166, 60, 111] },
  ];
  errors: [
    { code: 6000; name: 'invalidLevel'; msg: 'Campaign level must be 0-80' },
    { code: 6001; name: 'unauthorized'; msg: 'Signer is not the config admin' },
    { code: 6002; name: 'configAlreadyInitialized'; msg: 'Map config is already initialized' },
    { code: 6003; name: 'invalidMapHash'; msg: 'Map hash does not match expected value' },
    { code: 6004; name: 'tooManyUpdates'; msg: 'Batch update exceeds maximum allowed' },
  ];
  types: [
    {
      name: 'adminTransferred';
      type: {
        kind: 'struct';
        fields: [
          { name: 'oldAdmin'; type: 'pubkey' },
          { name: 'newAdmin'; type: 'pubkey' },
          { name: 'timestamp'; type: 'i64' },
        ];
      };
    },
    {
      name: 'mapConfig';
      docs: ['Configuration for map generation, storing seed values for each level.'];
      type: {
        kind: 'struct';
        fields: [
          { name: 'admin'; docs: ['Authority that can update seed mappings']; type: 'pubkey' },
          {
            name: 'seeds';
            docs: ['Seed values for campaign levels 0-80'];
            type: { array: ['u64', 81] };
          },
          { name: 'version'; docs: ['Config version for migrations']; type: 'u8' },
          { name: 'bump'; docs: ['PDA bump seed']; type: 'u8' },
        ];
      };
    },
    {
      name: 'mapConfigUpdated';
      type: {
        kind: 'struct';
        fields: [
          { name: 'admin'; type: 'pubkey' },
          { name: 'level'; type: 'u8' },
          { name: 'oldSeed'; type: 'u64' },
          { name: 'newSeed'; type: 'u64' },
          { name: 'timestamp'; type: 'i64' },
        ];
      };
    },
    {
      name: 'seedUpdate';
      docs: ['Represents a single seed update for batch operations'];
      type: {
        kind: 'struct';
        fields: [
          { name: 'level'; docs: ['Level to update (0-80)']; type: 'u8' },
          { name: 'seed'; docs: ['New seed value']; type: 'u64' },
        ];
      };
    },
  ];
};

// Helper types for the frontend
export interface OnChainMapConfig {
  admin: import('@solana/web3.js').PublicKey;
  seeds: bigint[];
  version: number;
  bump: number;
}
