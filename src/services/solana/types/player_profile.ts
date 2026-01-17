/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/player_profile.json`.
 */
export type PlayerProfile = {
  address: '29DPbP1zuCCRg63PiShMjxAmZos97BR5TmhpijUYQzze';
  metadata: {
    name: 'playerProfile';
    version: '0.1.0';
    spec: '0.1.0';
    description: 'Player Profile Program for Dungeons & Moles';
  };
  instructions: [
    {
      name: 'initializeProfile';
      docs: [
        "Creates a new player profile for the signer's wallet.",
        'Each wallet can only have one profile.',
      ];
      discriminator: [32, 145, 77, 213, 58, 39, 251, 234];
      accounts: [
        {
          name: 'playerProfile';
          writable: true;
          pda: {
            seeds: [
              { kind: 'const'; value: [112, 108, 97, 121, 101, 114] },
              { kind: 'account'; path: 'owner' },
            ];
          };
        },
        { name: 'owner'; writable: true; signer: true },
        { name: 'systemProgram'; address: '11111111111111111111111111111111' },
      ];
      args: [{ name: 'name'; type: 'string' }];
    },
    {
      name: 'recordRunResult';
      docs: ['Records the result of a completed dungeon run.'];
      discriminator: [135, 126, 78, 133, 237, 190, 21, 71];
      accounts: [
        {
          name: 'playerProfile';
          writable: true;
          pda: {
            seeds: [
              { kind: 'const'; value: [112, 108, 97, 121, 101, 114] },
              { kind: 'account'; path: 'owner' },
            ];
          };
        },
        { name: 'owner'; signer: true; relations: ['playerProfile'] },
      ];
      args: [{ name: 'levelReached'; type: 'u8' }, { name: 'victory'; type: 'bool' }];
    },
    {
      name: 'updateProfileName';
      docs: ['Updates the display name of an existing profile.'];
      discriminator: [96, 69, 10, 229, 192, 184, 200, 20];
      accounts: [
        {
          name: 'playerProfile';
          writable: true;
          pda: {
            seeds: [
              { kind: 'const'; value: [112, 108, 97, 121, 101, 114] },
              { kind: 'account'; path: 'owner' },
            ];
          };
        },
        { name: 'owner'; signer: true; relations: ['playerProfile'] },
      ];
      args: [{ name: 'name'; type: 'string' }];
    },
  ];
  accounts: [
    {
      name: 'playerProfile';
      discriminator: [82, 226, 99, 87, 164, 130, 181, 80];
    },
  ];
  events: [
    {
      name: 'profileCreated';
      discriminator: [134, 233, 199, 153, 77, 206, 128, 94];
    },
    {
      name: 'runCompleted';
      discriminator: [233, 115, 120, 101, 166, 52, 138, 133];
    },
  ];
  errors: [
    {
      code: 6000;
      name: 'profileAlreadyExists';
      msg: 'Player profile already exists for this wallet';
    },
    {
      code: 6001;
      name: 'nameTooLong';
      msg: 'Display name exceeds 32 character limit';
    },
    { code: 6002; name: 'noAvailableRuns'; msg: 'No available runs remaining' },
    { code: 6003; name: 'unauthorized'; msg: 'Signer is not the profile owner' },
    { code: 6004; name: 'arithmeticOverflow'; msg: 'Arithmetic overflow occurred' },
  ];
  types: [
    {
      name: 'playerProfile';
      docs: [
        'Player profile account storing identity and progression data.',
        'PDA Seeds: [b"player", owner.key()]',
      ];
      type: {
        kind: 'struct';
        fields: [
          { name: 'owner'; docs: ['Wallet address that owns this profile']; type: 'pubkey' },
          { name: 'name'; docs: ['Display name (max 32 chars)']; type: 'string' },
          { name: 'totalRuns'; docs: ['Total dungeon runs completed']; type: 'u32' },
          { name: 'currentLevel'; docs: ['Current campaign level (0-80+)']; type: 'u8' },
          { name: 'availableRuns'; docs: ['Remaining available dungeon runs']; type: 'u32' },
          { name: 'createdAt'; docs: ['Unix timestamp of profile creation']; type: 'i64' },
          { name: 'bump'; docs: ['PDA bump seed']; type: 'u8' },
        ];
      };
    },
    {
      name: 'profileCreated';
      type: {
        kind: 'struct';
        fields: [{ name: 'owner'; type: 'pubkey' }, { name: 'timestamp'; type: 'i64' }];
      };
    },
    {
      name: 'runCompleted';
      type: {
        kind: 'struct';
        fields: [
          { name: 'owner'; type: 'pubkey' },
          { name: 'totalRuns'; type: 'u32' },
          { name: 'availableRuns'; type: 'u32' },
          { name: 'levelReached'; type: 'u8' },
          { name: 'victory'; type: 'bool' },
          { name: 'timestamp'; type: 'i64' },
        ];
      };
    },
  ];
};
