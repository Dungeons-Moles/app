/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/session_manager.json`.
 */
export type SessionManager = {
  address: 'FcMT7MzBLVQGaMATEMws3fjsL2Q77QSHmoEPdowTMxJa';
  metadata: {
    name: 'sessionManager';
    version: '0.1.0';
    spec: '0.1.0';
    description: 'Session Manager Program for MagicBlock Ephemeral Rollup integration';
  };
  instructions: [
    {
      name: 'commitSession';
      docs: [
        'Commits the current game state from the ephemeral rollup.',
        'Updates the state hash and last activity timestamp.',
      ];
      discriminator: [75, 2, 56, 144, 89, 208, 173, 167];
      accounts: [
        {
          name: 'gameSession';
          writable: true;
          pda: {
            seeds: [
              { kind: 'const'; value: [115, 101, 115, 115, 105, 111, 110] },
              { kind: 'account'; path: 'player' },
            ];
          };
        },
        { name: 'player'; signer: true; relations: ['gameSession'] },
      ];
      args: [{ name: 'stateHash'; type: { array: ['u8', 32] } }];
    },
    {
      name: 'delegateSession';
      docs: [
        'Delegates the session to the MagicBlock ephemeral rollup.',
        'NOTE: MagicBlock SDK is blocked due to Rust edition 2024 requirement.',
        'This is a stub that just sets the is_delegated flag.',
      ];
      discriminator: [82, 83, 119, 119, 196, 219, 5, 197];
      accounts: [
        {
          name: 'gameSession';
          writable: true;
          pda: {
            seeds: [
              { kind: 'const'; value: [115, 101, 115, 115, 105, 111, 110] },
              { kind: 'account'; path: 'player' },
            ];
          };
        },
        { name: 'player'; signer: true; relations: ['gameSession'] },
      ];
      args: [];
    },
    {
      name: 'endSession';
      docs: ['Ends the session normally, undelegating from rollup and closing the account.'];
      discriminator: [11, 244, 61, 154, 212, 249, 15, 66];
      accounts: [
        {
          name: 'gameSession';
          writable: true;
          pda: {
            seeds: [
              { kind: 'const'; value: [115, 101, 115, 115, 105, 111, 110] },
              { kind: 'account'; path: 'player' },
            ];
          };
        },
        { name: 'player'; writable: true; signer: true; relations: ['gameSession'] },
      ];
      args: [];
    },
    {
      name: 'forceCloseSession';
      docs: [
        'Forces a session to close.',
        'Can be called by anyone to clean up abandoned sessions.',
      ];
      discriminator: [7, 248, 122, 200, 47, 119, 244, 82];
      accounts: [
        {
          name: 'gameSession';
          writable: true;
          pda: {
            seeds: [
              { kind: 'const'; value: [115, 101, 115, 115, 105, 111, 110] },
              { kind: 'account'; path: 'sessionOwner' },
            ];
          };
        },
        { name: 'sessionOwner' },
        { name: 'recipient'; writable: true },
      ];
      args: [];
    },
    {
      name: 'initializeCounter';
      docs: ['Initializes the global session counter (one-time admin operation).'];
      discriminator: [67, 89, 100, 87, 231, 172, 35, 124];
      accounts: [
        {
          name: 'sessionCounter';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [115, 101, 115, 115, 105, 111, 110, 95, 99, 111, 117, 110, 116, 101, 114];
              },
            ];
          };
        },
        { name: 'admin'; writable: true; signer: true },
        { name: 'systemProgram'; address: '11111111111111111111111111111111' },
      ];
      args: [];
    },
    {
      name: 'startSession';
      docs: [
        'Starts a new game session for the player.',
        "Validates that the campaign level is within the player's unlocked tier.",
      ];
      discriminator: [23, 227, 111, 142, 212, 230, 3, 175];
      accounts: [
        {
          name: 'gameSession';
          writable: true;
          pda: {
            seeds: [
              { kind: 'const'; value: [115, 101, 115, 115, 105, 111, 110] },
              { kind: 'account'; path: 'player' },
            ];
          };
        },
        {
          name: 'sessionCounter';
          writable: true;
          pda: {
            seeds: [
              {
                kind: 'const';
                value: [115, 101, 115, 115, 105, 111, 110, 95, 99, 111, 117, 110, 116, 101, 114];
              },
            ];
          };
        },
        { name: 'player'; writable: true; signer: true },
        { name: 'systemProgram'; address: '11111111111111111111111111111111' },
      ];
      args: [{ name: 'campaignLevel'; type: 'u8' }];
    },
  ];
  accounts: [
    { name: 'gameSession'; discriminator: [150, 116, 20, 197, 205, 121, 220, 240] },
    { name: 'sessionCounter'; discriminator: [86, 109, 126, 139, 64, 30, 254, 100] },
  ];
  events: [
    { name: 'sessionDelegated'; discriminator: [196, 91, 183, 117, 146, 74, 195, 49] },
    { name: 'sessionEnded'; discriminator: [58, 51, 229, 78, 240, 232, 236, 18] },
    { name: 'sessionStarted'; discriminator: [97, 241, 44, 75, 210, 66, 122, 96] },
  ];
  errors: [
    { code: 6000; name: 'sessionAlreadyActive'; msg: 'Player already has an active session' },
    { code: 6001; name: 'sessionNotFound'; msg: 'No active session found for player' },
    { code: 6002; name: 'sessionNotDelegated'; msg: 'Session must be delegated first' },
    { code: 6003; name: 'sessionAlreadyDelegated'; msg: 'Session is already delegated' },
    { code: 6004; name: 'unauthorized'; msg: 'Signer is not the session owner' },
    {
      code: 6005;
      name: 'invalidCampaignLevel';
      msg: "Campaign level exceeds player's unlocked tier";
    },
    { code: 6006; name: 'profileNotFound'; msg: 'Player profile does not exist' },
    { code: 6007; name: 'arithmeticOverflow'; msg: 'Arithmetic overflow occurred' },
  ];
  types: [
    {
      name: 'gameSession';
      docs: [
        'Represents an active game session for a player.',
        'One session allowed per player (enforced via PDA uniqueness).',
      ];
      type: {
        kind: 'struct';
        fields: [
          { name: 'player'; docs: ["Player profile owner's wallet"]; type: 'pubkey' },
          { name: 'sessionId'; docs: ['Unique session identifier (incrementing)']; type: 'u64' },
          {
            name: 'campaignLevel';
            docs: ['Level being played in this session (campaign mode)'];
            type: 'u8';
          },
          { name: 'startedAt'; docs: ['Unix timestamp when session started']; type: 'i64' },
          { name: 'lastActivity'; docs: ['Unix timestamp of last activity']; type: 'i64' },
          {
            name: 'isDelegated';
            docs: ['Whether state is delegated to ephemeral rollup'];
            type: 'bool';
          },
          {
            name: 'stateHash';
            docs: ['Hash of current game state (for verification)'];
            type: { array: ['u8', 32] };
          },
          { name: 'bump'; docs: ['PDA bump seed']; type: 'u8' },
        ];
      };
    },
    {
      name: 'sessionCounter';
      docs: ['Global counter for generating unique session IDs'];
      type: {
        kind: 'struct';
        fields: [
          { name: 'count'; docs: ['Global session counter for unique IDs']; type: 'u64' },
          { name: 'bump'; docs: ['PDA bump seed']; type: 'u8' },
        ];
      };
    },
    {
      name: 'sessionDelegated';
      type: {
        kind: 'struct';
        fields: [
          { name: 'player'; type: 'pubkey' },
          { name: 'sessionId'; type: 'u64' },
          { name: 'timestamp'; type: 'i64' },
        ];
      };
    },
    {
      name: 'sessionEnded';
      type: {
        kind: 'struct';
        fields: [
          { name: 'player'; type: 'pubkey' },
          { name: 'sessionId'; type: 'u64' },
          { name: 'finalStateHash'; type: { array: ['u8', 32] } },
          { name: 'timestamp'; type: 'i64' },
        ];
      };
    },
    {
      name: 'sessionStarted';
      type: {
        kind: 'struct';
        fields: [
          { name: 'player'; type: 'pubkey' },
          { name: 'sessionId'; type: 'u64' },
          { name: 'campaignLevel'; type: 'u8' },
          { name: 'timestamp'; type: 'i64' },
        ];
      };
    },
  ];
};

// Helper types for the frontend
export interface OnChainGameSession {
  player: import('@solana/web3.js').PublicKey;
  sessionId: bigint;
  campaignLevel: number;
  startedAt: number;
  lastActivity: number;
  isDelegated: boolean;
  stateHash: number[];
  bump: number;
}

export interface OnChainSessionCounter {
  count: bigint;
  bump: number;
}
