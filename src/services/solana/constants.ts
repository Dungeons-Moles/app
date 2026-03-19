/**
 * Solana Program IDs and PDA Constants
 *
 * Centralized constants for all Solana program interactions.
 * Program IDs are loaded from environment variables.
 *
 * @see contracts/session-bundle.md for PDA derivation details
 */

import { PublicKey } from '@solana/web3.js';

// ============================================================================
// Program IDs (from environment)
// ============================================================================

const playerProfileProgramId = process.env.EXPO_PUBLIC_PLAYER_PROFILE_PROGRAM_ID;
const sessionManagerProgramId = process.env.EXPO_PUBLIC_SESSION_MANAGER_PROGRAM_ID;
const mapGeneratorProgramId = process.env.EXPO_PUBLIC_MAP_GENERATOR_PROGRAM_ID;
const gameplayStateProgramId = process.env.EXPO_PUBLIC_GAMEPLAY_STATE_PROGRAM_ID;
const poiSystemProgramId = process.env.EXPO_PUBLIC_POI_SYSTEM_PROGRAM_ID;
const inventoryProgramId = process.env.EXPO_PUBLIC_PLAYER_INVENTORY_PROGRAM_ID;

// Validate required program IDs
if (!playerProfileProgramId || !sessionManagerProgramId || !gameplayStateProgramId) {
  console.warn(
    '[constants] Missing required program IDs. Some features may not work.',
    '\n  PLAYER_PROFILE:',
    playerProfileProgramId ? 'OK' : 'MISSING',
    '\n  SESSION_MANAGER:',
    sessionManagerProgramId ? 'OK' : 'MISSING',
    '\n  GAMEPLAY_STATE:',
    gameplayStateProgramId ? 'OK' : 'MISSING'
  );
}

// ============================================================================
// Program ID Constants
// ============================================================================

export const PLAYER_PROFILE_PROGRAM_ID = playerProfileProgramId
  ? new PublicKey(playerProfileProgramId)
  : PublicKey.default;

export const SESSION_MANAGER_PROGRAM_ID = sessionManagerProgramId
  ? new PublicKey(sessionManagerProgramId)
  : PublicKey.default;

export const MAP_GENERATOR_PROGRAM_ID = mapGeneratorProgramId
  ? new PublicKey(mapGeneratorProgramId)
  : PublicKey.default;

export const GAMEPLAY_STATE_PROGRAM_ID = gameplayStateProgramId
  ? new PublicKey(gameplayStateProgramId)
  : PublicKey.default;

export const POI_SYSTEM_PROGRAM_ID = poiSystemProgramId
  ? new PublicKey(poiSystemProgramId)
  : PublicKey.default;

export const INVENTORY_PROGRAM_ID = inventoryProgramId
  ? new PublicKey(inventoryProgramId)
  : PublicKey.default;

const nftMarketplaceProgramId = process.env.EXPO_PUBLIC_NFT_MARKETPLACE_PROGRAM_ID;
export const NFT_MARKETPLACE_PROGRAM_ID = nftMarketplaceProgramId
  ? new PublicKey(nftMarketplaceProgramId)
  : PublicKey.default;

export const MPL_CORE_PROGRAM_ID = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');

// ============================================================================
// Treasury
// ============================================================================

/** Treasury pubkey for run purchases (set in environment or use placeholder) */
const treasuryPubkeyStr = process.env.EXPO_PUBLIC_TREASURY_PUBKEY;
export const TREASURY_PUBKEY = treasuryPubkeyStr
  ? new PublicKey(treasuryPubkeyStr)
  : PublicKey.default;

/** Gauntlet pool pubkey for run purchases (set in environment or defaults to gauntlet pool vault PDA) */
const gauntletPoolPubkeyStr = process.env.EXPO_PUBLIC_GAUNTLET_POOL_PUBKEY;
export const GAUNTLET_POOL_PUBKEY = gauntletPoolPubkeyStr
  ? new PublicKey(gauntletPoolPubkeyStr)
  : PublicKey.findProgramAddressSync([Buffer.from('gauntlet_pool_vault')], GAMEPLAY_STATE_PROGRAM_ID)[0];

// ============================================================================
// PDA Seeds
// ============================================================================

export const PDA_SEEDS = {
  /** Player profile: ["player", owner] */
  PLAYER: 'player',
  /** Game session: ["session", player, campaign_level] */
  SESSION: 'session',
  /** Duel session: ["duel_session", player] */
  DUEL_SESSION: 'duel_session',
  /** Gauntlet session: ["gauntlet_session", player] */
  GAUNTLET_SESSION: 'gauntlet_session',
  /** Session nonces: ["session_nonces", player] */
  SESSION_NONCES: 'session_nonces',
  /** Session counter: ["session_counter"] */
  SESSION_COUNTER: 'session_counter',
  /** Game state: ["game_state", session_pda] */
  GAME_STATE: 'game_state',
  /** Map POIs: ["map_pois", session_pda] */
  MAP_POIS: 'map_pois',
  /** Generated map: ["generated_map", session_pda] */
  GENERATED_MAP: 'generated_map',
  /** POI authority: ["poi_authority"] */
  POI_AUTHORITY: 'poi_authority',
  /** Player inventory: ["inventory", session_pda] */
  INVENTORY: 'inventory',
  /** Map generator config: ["map_config"] */
  MAP_CONFIG: 'map_config',
  /** Gameplay authority: ["gameplay_authority"] - for CPI calls from gameplay_state */
  GAMEPLAY_AUTHORITY: 'gameplay_authority',
  /** Session manager authority: ["session_manager_authority"] - signer PDA for run mode configuration */
  SESSION_MANAGER_AUTHORITY: 'session_manager_authority',
  /** Inventory authority: ["inventory_authority"] - for CPI calls from player_inventory */
  INVENTORY_AUTHORITY: 'inventory_authority',
  /** Marketplace config: ["marketplace_config"] */
  MARKETPLACE_CONFIG: 'marketplace_config',
  /** Listing: ["listing", asset] */
  LISTING: 'listing',
  /** Mint authority: ["mint_authority"] */
  MINT_AUTHORITY: 'mint_authority',
  /** Quest definition: ["quest_def", quest_id(u16 LE)] */
  QUEST_DEF: 'quest_def',
  /** Quest progress: ["quest_progress", player, quest_id(u16 LE)] */
  QUEST_PROGRESS: 'quest_progress',
  /** Map VRF state: ["map_vrf", session_pda] */
  MAP_VRF: 'map_vrf',
  /** POI VRF state: ["poi_vrf", session_pda] */
  POI_VRF: 'poi_vrf',
  /** Gameplay VRF state: ["gameplay_vrf", session_pda] */
  GAMEPLAY_VRF: 'gameplay_vrf',
  /** Session discovery: ["session_discovery", session_pda] */
  SESSION_DISCOVERY: 'session_discovery',
  /** Gauntlet echoes: ["gauntlet_echoes", session_pda] */
  GAUNTLET_ECHOES: 'gauntlet_echoes',
} as const;

// ============================================================================
// PDA Derivation Functions
// ============================================================================

/**
 * Derive PlayerProfile PDA.
 *
 * @param owner - Player's main wallet public key
 * @returns [PDA, bump]
 */
export function derivePlayerProfilePda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.PLAYER), owner.toBuffer()],
    PLAYER_PROFILE_PROGRAM_ID
  );
}

/**
 * Derive SessionNonces PDA for a player.
 * Stores per-mode nonces for session override/recovery.
 *
 * @param player - Player's main wallet public key
 * @returns [PDA, bump]
 */
export function deriveSessionNoncesPda(player: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.SESSION_NONCES), player.toBuffer()],
    SESSION_MANAGER_PROGRAM_ID
  );
}

/**
 * Derive GameSession PDA for a specific campaign level.
 *
 * @param player - Player's main wallet public key
 * @param campaignLevel - Campaign level (1-40)
 * @param nonce - Session nonce (default 0, incremented by override)
 * @returns [PDA, bump]
 */
export function deriveSessionPda(
  player: PublicKey,
  campaignLevel: number,
  nonce: bigint | number = 0
): [PublicKey, number] {
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(BigInt(nonce));
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.SESSION), player.toBuffer(), Buffer.from([campaignLevel]), nonceBuf],
    SESSION_MANAGER_PROGRAM_ID
  );
}

/**
 * Derive Duel GameSession PDA.
 *
 * @param player - Player's main wallet public key
 * @param nonce - Session nonce (default 0, incremented by override)
 * @returns [PDA, bump]
 */
export function deriveDuelSessionPda(
  player: PublicKey,
  nonce: bigint | number = 0
): [PublicKey, number] {
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(BigInt(nonce));
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.DUEL_SESSION), player.toBuffer(), nonceBuf],
    SESSION_MANAGER_PROGRAM_ID
  );
}

/**
 * Derive Gauntlet GameSession PDA.
 *
 * @param player - Player's main wallet public key
 * @param nonce - Session nonce (default 0, incremented by override)
 * @returns [PDA, bump]
 */
export function deriveGauntletSessionPda(
  player: PublicKey,
  nonce: bigint | number = 0
): [PublicKey, number] {
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(BigInt(nonce));
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.GAUNTLET_SESSION), player.toBuffer(), nonceBuf],
    SESSION_MANAGER_PROGRAM_ID
  );
}

/**
 * Derive SessionCounter PDA (global counter).
 *
 * @returns [PDA, bump]
 */
export function deriveSessionCounterPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.SESSION_COUNTER)],
    SESSION_MANAGER_PROGRAM_ID
  );
}

/**
 * Derive GameState PDA for a session.
 *
 * @param sessionPda - Session PDA
 * @returns [PDA, bump]
 */
export function deriveGameStatePda(sessionPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.GAME_STATE), sessionPda.toBuffer()],
    GAMEPLAY_STATE_PROGRAM_ID
  );
}

/**
 * Derive MapPois PDA for a session.
 *
 * @param sessionPda - Session PDA
 * @returns [PDA, bump]
 */
export function deriveMapPoisPda(sessionPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.MAP_POIS), sessionPda.toBuffer()],
    POI_SYSTEM_PROGRAM_ID
  );
}

/**
 * Derive PlayerInventory PDA for a session.
 *
 * @param sessionPda - Session PDA
 * @returns [PDA, bump]
 */
export function deriveInventoryPda(sessionPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.INVENTORY), sessionPda.toBuffer()],
    INVENTORY_PROGRAM_ID
  );
}

/**
 * Derive MapConfig PDA (global, no session-specific seed).
 *
 * @returns [PDA, bump]
 */
export function deriveMapConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.MAP_CONFIG)],
    MAP_GENERATOR_PROGRAM_ID
  );
}

/**
 * Derive POI Authority PDA (global, no session-specific seed).
 *
 * @returns [PDA, bump]
 */
export function derivePoiAuthorityPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.POI_AUTHORITY)],
    POI_SYSTEM_PROGRAM_ID
  );
}

/**
 * Derive GeneratedMap PDA for a session.
 *
 * @param sessionPda - Session PDA
 * @returns [PDA, bump]
 */
export function deriveGeneratedMapPda(sessionPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.GENERATED_MAP), sessionPda.toBuffer()],
    MAP_GENERATOR_PROGRAM_ID
  );
}

/**
 * Derive Gameplay Authority PDA (global, no session-specific seed).
 * Used for CPI calls from gameplay_state to map_generator.
 *
 * @returns [PDA, bump]
 */
export function deriveGameplayAuthorityPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.GAMEPLAY_AUTHORITY)],
    GAMEPLAY_STATE_PROGRAM_ID
  );
}

/**
 * Derive Session Manager Authority PDA (global, no session-specific seed).
 * Used as signer for configure_run_mode CPI into gameplay_state.
 *
 * @returns [PDA, bump]
 */
export function deriveSessionManagerAuthorityPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.SESSION_MANAGER_AUTHORITY)],
    SESSION_MANAGER_PROGRAM_ID
  );
}

/**
 * Derive Inventory Authority PDA (global, no session-specific seed).
 * Used for CPI calls from player_inventory to gameplay_state.
 *
 * @returns [PDA, bump]
 */
export function deriveInventoryAuthorityPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.INVENTORY_AUTHORITY)],
    INVENTORY_PROGRAM_ID
  );
}

/**
 * Derive MarketplaceConfig PDA (global).
 *
 * @returns [PDA, bump]
 */
export function deriveMarketplaceConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.MARKETPLACE_CONFIG)],
    NFT_MARKETPLACE_PROGRAM_ID
  );
}

/**
 * Derive Listing PDA for a Metaplex Core asset.
 *
 * @param asset - Asset public key
 * @returns [PDA, bump]
 */
export function deriveListingPda(asset: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.LISTING), asset.toBuffer()],
    NFT_MARKETPLACE_PROGRAM_ID
  );
}

/**
 * Derive MintAuthority PDA (global).
 *
 * @returns [PDA, bump]
 */
export function deriveMintAuthorityPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.MINT_AUTHORITY)],
    NFT_MARKETPLACE_PROGRAM_ID
  );
}

/**
 * Derive QuestDefinition PDA.
 *
 * @param questId - Quest ID (u16)
 * @returns [PDA, bump]
 */
export function deriveQuestDefPda(questId: number): [PublicKey, number] {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(questId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.QUEST_DEF), buf],
    NFT_MARKETPLACE_PROGRAM_ID
  );
}

/**
 * Derive QuestProgress PDA for a player.
 *
 * @param player - Player's public key
 * @param questId - Quest ID (u16)
 * @returns [PDA, bump]
 */
export function deriveQuestProgressPda(player: PublicKey, questId: number): [PublicKey, number] {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(questId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.QUEST_PROGRESS), player.toBuffer(), buf],
    NFT_MARKETPLACE_PROGRAM_ID
  );
}

// ============================================================================
// VRF State PDA Derivation
// ============================================================================

/**
 * Derive MapVrfState PDA for a session.
 * Seeds: ["map_vrf", session_pda] — owned by map-generator program.
 */
export function deriveMapVrfStatePda(sessionPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.MAP_VRF), sessionPda.toBuffer()],
    MAP_GENERATOR_PROGRAM_ID
  );
}

/**
 * Derive PoiVrfState PDA for a session.
 * Seeds: ["poi_vrf", session_pda] — owned by poi-system program.
 */
export function derivePoiVrfStatePda(sessionPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.POI_VRF), sessionPda.toBuffer()],
    POI_SYSTEM_PROGRAM_ID
  );
}

/**
 * Derive GameplayVrfState PDA for a session.
 * Seeds: ["gameplay_vrf", session_pda] — owned by gameplay-state program.
 */
export function deriveGameplayVrfStatePda(sessionPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.GAMEPLAY_VRF), sessionPda.toBuffer()],
    GAMEPLAY_STATE_PROGRAM_ID
  );
}

/**
 * Derive SessionDiscovery PDA for a session.
 * Seeds: ["session_discovery", session_pda] — owned by map-generator program.
 */
export function deriveSessionDiscoveryPda(sessionPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.SESSION_DISCOVERY), sessionPda.toBuffer()],
    MAP_GENERATOR_PROGRAM_ID
  );
}

/**
 * Derive GauntletEchoes PDA for a session.
 * Seeds: ["gauntlet_echoes", session_pda] — owned by gameplay-state program.
 */
export function deriveGauntletEchoesPda(sessionPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.GAUNTLET_ECHOES), sessionPda.toBuffer()],
    GAMEPLAY_STATE_PROGRAM_ID
  );
}

// ============================================================================
// Composite PDA Derivation
// ============================================================================

/** All session-scoped PDAs derived from a single session PDA. */
export interface SessionPdas {
  gameStatePda: PublicKey;
  mapPoisPda: PublicKey;
  inventoryPda: PublicKey;
  generatedMapPda: PublicKey;
  mapVrfStatePda: PublicKey;
  poiVrfStatePda: PublicKey;
  gameplayVrfStatePda: PublicKey;
  sessionDiscoveryPda: PublicKey;
  gauntletEchoesPda: PublicKey;
}

/**
 * Derive all session-scoped PDAs from a session PDA in one call.
 * Eliminates repeated individual derivation calls scattered across services.
 */
export function deriveSessionPdas(sessionPda: PublicKey): SessionPdas {
  return {
    gameStatePda: deriveGameStatePda(sessionPda)[0],
    mapPoisPda: deriveMapPoisPda(sessionPda)[0],
    inventoryPda: deriveInventoryPda(sessionPda)[0],
    generatedMapPda: deriveGeneratedMapPda(sessionPda)[0],
    mapVrfStatePda: deriveMapVrfStatePda(sessionPda)[0],
    poiVrfStatePda: derivePoiVrfStatePda(sessionPda)[0],
    gameplayVrfStatePda: deriveGameplayVrfStatePda(sessionPda)[0],
    sessionDiscoveryPda: deriveSessionDiscoveryPda(sessionPda)[0],
    gauntletEchoesPda: deriveGauntletEchoesPda(sessionPda)[0],
  };
}

/** All global authority PDAs (not session-specific). */
export interface GlobalAuthorityPdas {
  poiAuthorityPda: PublicKey;
  gameplayAuthorityPda: PublicKey;
  inventoryAuthorityPda: PublicKey;
  sessionManagerAuthorityPda: PublicKey;
}

/**
 * Derive all global authority PDAs in one call.
 * These are constant across all sessions.
 */
export function deriveGlobalAuthorityPdas(): GlobalAuthorityPdas {
  return {
    poiAuthorityPda: derivePoiAuthorityPda()[0],
    gameplayAuthorityPda: deriveGameplayAuthorityPda()[0],
    inventoryAuthorityPda: deriveInventoryAuthorityPda()[0],
    sessionManagerAuthorityPda: deriveSessionManagerAuthorityPda()[0],
  };
}

// ============================================================================
// Account Sizes (for rent calculation)
// ============================================================================

export const ACCOUNT_SIZES = {
  /** GameSession account size */
  GAME_SESSION: 8 + 32 + 8 + 1 + 32 + 10 + 32 + 8, // ~131 bytes
  /** GameState account size */
  GAME_STATE: 8 + 32 + 32 + 2 + 2 + 2 + 6 * 2 + 1 + 1 + 1 + 4 + 1, // ~90 bytes
  /** MapPois account size (varies) */
  MAP_POIS: 8 + 20 * (1 + 1 + 1 + 1), // ~88 bytes
  /** PlayerInventory account size */
  PLAYER_INVENTORY: 8 + 8 * 20, // ~168 bytes
} as const;

// ============================================================================
// Run Economy Constants
// ============================================================================

/** Price for 20 sessions in lamports (0.05 SOL) */
export const RUN_PRICE_LAMPORTS = 50_000_000;

/** Number of runs received per purchase */
export const RUNS_PER_PURCHASE = 20;

/** Minimum lamports to keep in sessionSigner wallet */
export const MIN_SESSION_SIGNER_BALANCE = 5_000;

/** Default sessionSigner wallet funding amount (0.05 SOL) */
export const DEFAULT_SESSION_SIGNER_FUNDING = 50_000_000;

// ============================================================================
// Game Constants
// ============================================================================

/** Map dimensions */
export const MAP_WIDTH = 9;
export const MAP_HEIGHT = 9;

/** Maximum concurrent sessions (one per level) */
export const MAX_SESSIONS = 40;

/** Maximum enemies per map */
export const MAX_ENEMIES = 10;

/** Starting gear slots */
export const INITIAL_GEAR_SLOTS = 4;

/** Gear slots after Week 1 boss */
export const GEAR_SLOTS_WEEK_2 = 6;

/** Gear slots after Week 2 boss */
export const GEAR_SLOTS_WEEK_3 = 8;

// ============================================================================
// Network Configuration
// ============================================================================

/** Solana cluster */
export const CLUSTER = (process.env.EXPO_PUBLIC_SOLANA_CLUSTER ?? 'devnet') as
  | 'devnet'
  | 'mainnet-beta';

/** RPC endpoint */
export const RPC_URL = process.env.EXPO_PUBLIC_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';

/** Whether we're on devnet */
export const IS_DEVNET = CLUSTER === 'devnet';

// ============================================================================
// Token Mints (mainnet addresses, used for Jupiter Price API on all clusters)
// ============================================================================

export const TOKEN_MINTS = {
  SOL: new PublicKey('So11111111111111111111111111111111111111112'),
  USDC: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  JUP: new PublicKey('JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'),
  SKR: new PublicKey('SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3'),
} as const;
