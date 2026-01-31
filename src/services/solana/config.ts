import { PublicKey, Commitment } from '@solana/web3.js';

const cluster = (process.env.EXPO_PUBLIC_SOLANA_CLUSTER ?? 'devnet') as 'devnet' | 'mainnet-beta';
const rpcUrl = process.env.EXPO_PUBLIC_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';

/**
 * Detect if we're running against a local validator (localhost/127.0.0.1).
 * Local validators don't need 'confirmed' commitment - 'processed' is faster.
 */
const isLocalValidator = rpcUrl.includes('localhost') || rpcUrl.includes('127.0.0.1');

/**
 * Commitment level for transaction confirmation.
 * - Local: 'processed' for fast confirmation
 * - Remote: 'confirmed' for safety
 */
const commitment: Commitment = isLocalValidator ? 'processed' : 'confirmed';

const playerProfileProgramId = process.env.EXPO_PUBLIC_PLAYER_PROFILE_PROGRAM_ID;
const sessionManagerProgramId = process.env.EXPO_PUBLIC_SESSION_MANAGER_PROGRAM_ID;
const mapGeneratorProgramId = process.env.EXPO_PUBLIC_MAP_GENERATOR_PROGRAM_ID;
const gameplayStateProgramId = process.env.EXPO_PUBLIC_GAMEPLAY_STATE_PROGRAM_ID;
const playerInventoryProgramId = process.env.EXPO_PUBLIC_PLAYER_INVENTORY_PROGRAM_ID;
const poiSystemProgramId = process.env.EXPO_PUBLIC_POI_SYSTEM_PROGRAM_ID;

if (
  !playerProfileProgramId ||
  !sessionManagerProgramId ||
  !mapGeneratorProgramId ||
  !gameplayStateProgramId ||
  !playerInventoryProgramId ||
  !poiSystemProgramId
) {
  throw new Error('Missing required Solana program IDs in environment variables');
}

export const SOLANA_CONFIG = {
  cluster,
  rpcUrl,
  commitment,
  isLocalValidator,
  programs: {
    playerProfile: new PublicKey(playerProfileProgramId),
    sessionManager: new PublicKey(sessionManagerProgramId),
    mapGenerator: new PublicKey(mapGeneratorProgramId),
    gameplayState: new PublicKey(gameplayStateProgramId),
    playerInventory: new PublicKey(playerInventoryProgramId),
    poiSystem: new PublicKey(poiSystemProgramId),
  },
};
