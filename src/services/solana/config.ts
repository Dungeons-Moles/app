import { PublicKey } from '@solana/web3.js';

const cluster = (process.env.EXPO_PUBLIC_SOLANA_CLUSTER ?? 'devnet') as 'devnet' | 'mainnet-beta';
const rpcUrl = process.env.EXPO_PUBLIC_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';

const playerProfileProgramId = process.env.EXPO_PUBLIC_PLAYER_PROFILE_PROGRAM_ID;
const sessionManagerProgramId = process.env.EXPO_PUBLIC_SESSION_MANAGER_PROGRAM_ID;
const mapGeneratorProgramId = process.env.EXPO_PUBLIC_MAP_GENERATOR_PROGRAM_ID;

if (!playerProfileProgramId || !sessionManagerProgramId || !mapGeneratorProgramId) {
  throw new Error('Missing required Solana program IDs in environment variables');
}

export const SOLANA_CONFIG = {
  cluster,
  rpcUrl,
  programs: {
    playerProfile: new PublicKey(playerProfileProgramId),
    sessionManager: new PublicKey(sessionManagerProgramId),
    mapGenerator: new PublicKey(mapGeneratorProgramId),
  },
};
