import { PublicKey } from '@solana/web3.js';

const cluster = (process.env.EXPO_PUBLIC_SOLANA_CLUSTER ?? 'devnet') as 'devnet' | 'mainnet-beta';
const rpcUrl = process.env.EXPO_PUBLIC_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';

const playerProfileProgramId =
  process.env.EXPO_PUBLIC_PLAYER_PROFILE_PROGRAM_ID ?? 'YOUR_PLAYER_PROFILE_PROGRAM_ID';
const sessionManagerProgramId =
  process.env.EXPO_PUBLIC_SESSION_MANAGER_PROGRAM_ID ?? 'YOUR_SESSION_MANAGER_PROGRAM_ID';
const mapGeneratorProgramId =
  process.env.EXPO_PUBLIC_MAP_GENERATOR_PROGRAM_ID ?? 'YOUR_MAP_GENERATOR_PROGRAM_ID';

export const SOLANA_CONFIG = {
  cluster,
  rpcUrl,
  programs: {
    playerProfile: new PublicKey(playerProfileProgramId),
    sessionManager: new PublicKey(sessionManagerProgramId),
    mapGenerator: new PublicKey(mapGeneratorProgramId),
  },
};
