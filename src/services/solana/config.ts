import { PublicKey, Commitment } from '@solana/web3.js';

const cluster = (process.env.EXPO_PUBLIC_SOLANA_CLUSTER ?? 'devnet') as 'devnet' | 'mainnet-beta';
const rpcUrl = process.env.EXPO_PUBLIC_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const useMagicRouter = process.env.EXPO_PUBLIC_USE_MAGIC_ROUTER === 'true';
const directErRpcUrl =
  process.env.EXPO_PUBLIC_EPHEMERAL_PROVIDER_ENDPOINT ?? 'https://devnet.magicblock.app/';
const directErWsUrl =
  process.env.EXPO_PUBLIC_EPHEMERAL_WS_ENDPOINT ?? 'wss://devnet.magicblock.app/';
const routerRpcUrl =
  process.env.EXPO_PUBLIC_ROUTER_ENDPOINT ?? 'https://devnet-router.magicblock.app/';
const routerWsUrl =
  process.env.EXPO_PUBLIC_WS_ROUTER_ENDPOINT ?? 'wss://devnet-router.magicblock.app/';
const erRpcUrl = useMagicRouter ? routerRpcUrl : directErRpcUrl;
const erWsUrl = useMagicRouter ? routerWsUrl : directErWsUrl;
const delegateValidatorOverride = process.env.EXPO_PUBLIC_DELEGATION_VALIDATOR;
const delegateRegionRaw = (process.env.EXPO_PUBLIC_DELEGATION_REGION ?? 'auto').toLowerCase();

const DEVNET_VALIDATORS = {
  asia: 'MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57',
  eu: 'MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e',
  us: 'MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd',
} as const;

type DelegationRegion = 'auto' | 'asia' | 'eu' | 'us';

const normalizeDelegationRegion = (value: string): DelegationRegion => {
  if (value === 'asia' || value === 'eu' || value === 'us') return value;
  return 'auto';
};

const guessRegionByTimezone = (): Exclude<DelegationRegion, 'auto'> => {
  let timezone = '';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    timezone = '';
  }
  if (timezone.startsWith('Europe/') || timezone.startsWith('Africa/')) return 'eu';
  if (timezone.startsWith('Asia/') || timezone.startsWith('Australia/')) return 'asia';
  return 'us';
};

const resolveDelegationValidator = (): PublicKey | null => {
  const isLocalRpc = rpcUrl.includes('localhost') || rpcUrl.includes('127.0.0.1');
  if (isLocalRpc) {
    const localValidator =
      process.env.EXPO_PUBLIC_LOCAL_ER_VALIDATOR ?? 'mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev';
    return new PublicKey(localValidator);
  }
  if (cluster !== 'devnet') return null;
  if (delegateValidatorOverride) return new PublicKey(delegateValidatorOverride);

  const region = normalizeDelegationRegion(delegateRegionRaw);
  const resolvedRegion = region === 'auto' ? guessRegionByTimezone() : region;
  return new PublicKey(DEVNET_VALIDATORS[resolvedRegion]);
};

const delegationValidator = resolveDelegationValidator();

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
const erCommitment =
  (process.env.EXPO_PUBLIC_ER_COMMITMENT as Commitment | undefined) ?? 'processed';

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
  mobileChain: `solana:${cluster}` as `solana:${typeof cluster}`,
  rpcUrl,
  erRpcUrl,
  erWsUrl,
  useMagicRouter,
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
    delegationValidator,
  },
};
