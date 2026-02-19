import { PublicKey, Commitment } from '@solana/web3.js';

const cluster = (process.env.EXPO_PUBLIC_SOLANA_CLUSTER ?? 'devnet') as 'devnet' | 'mainnet-beta';
const rpcUrl = process.env.EXPO_PUBLIC_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const erRpcUrl = process.env.EXPO_PUBLIC_EPHEMERAL_PROVIDER_ENDPOINT ?? 'https://devnet.magicblock.app/';
const erWsUrl = process.env.EXPO_PUBLIC_EPHEMERAL_WS_ENDPOINT ?? 'wss://devnet.magicblock.app/';
const vrfEndpoint = process.env.EXPO_PUBLIC_MAGICBLOCK_VRF_ENDPOINT;

/**
 * Detect if we're running against a local validator (localhost/127.0.0.1).
 * Local validators don't need 'confirmed' commitment - 'processed' is faster.
 */
const isLocalValidator = rpcUrl.includes('localhost') || rpcUrl.includes('127.0.0.1');

/**
 * Base-layer commitment:
 * - Local validator: processed (fast iteration)
 * - Remote clusters: confirmed (safer settlement)
 */
const baseCommitment: Commitment = isLocalValidator ? 'processed' : 'confirmed';

/**
 * ER commitment:
 * - Default to processed to prioritize realtime responsiveness for delegated gameplay.
 * - Can be overridden via env for debugging/tuning.
 */
const erCommitment = (process.env.EXPO_PUBLIC_ER_COMMITMENT as Commitment | undefined) ?? 'processed';

const playerProfileProgramId = process.env.EXPO_PUBLIC_PLAYER_PROFILE_PROGRAM_ID;
const sessionManagerProgramId = process.env.EXPO_PUBLIC_SESSION_MANAGER_PROGRAM_ID;
const mapGeneratorProgramId = process.env.EXPO_PUBLIC_MAP_GENERATOR_PROGRAM_ID;
const gameplayStateProgramId = process.env.EXPO_PUBLIC_GAMEPLAY_STATE_PROGRAM_ID;
const playerInventoryProgramId = process.env.EXPO_PUBLIC_PLAYER_INVENTORY_PROGRAM_ID;
const poiSystemProgramId = process.env.EXPO_PUBLIC_POI_SYSTEM_PROGRAM_ID;
const nftMarketplaceProgramId = process.env.EXPO_PUBLIC_NFT_MARKETPLACE_PROGRAM_ID;

if (
  !playerProfileProgramId ||
  !sessionManagerProgramId ||
  !mapGeneratorProgramId ||
  !gameplayStateProgramId ||
  !playerInventoryProgramId ||
  !poiSystemProgramId ||
  !nftMarketplaceProgramId
) {
  throw new Error('Missing required Solana program IDs in environment variables');
}

export const SOLANA_CONFIG = {
  cluster,
  rpcUrl,
  erRpcUrl,
  erWsUrl,
  vrfEndpoint,
  commitment: baseCommitment,
  baseCommitment,
  erCommitment,
  isLocalValidator,
  programs: {
    playerProfile: new PublicKey(playerProfileProgramId),
    sessionManager: new PublicKey(sessionManagerProgramId),
    mapGenerator: new PublicKey(mapGeneratorProgramId),
    gameplayState: new PublicKey(gameplayStateProgramId),
    playerInventory: new PublicKey(playerInventoryProgramId),
    poiSystem: new PublicKey(poiSystemProgramId),
    nftMarketplace: new PublicKey(nftMarketplaceProgramId),
  },
  magic: {
    programId: new PublicKey('Magic11111111111111111111111111111111111111'),
    contextId: new PublicKey('MagicContext1111111111111111111111111111111'),
  },
};
