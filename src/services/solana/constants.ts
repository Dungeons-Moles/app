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
const fieldEnemiesProgramId = process.env.EXPO_PUBLIC_FIELD_ENEMIES_PROGRAM_ID;
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

export const FIELD_ENEMIES_PROGRAM_ID = fieldEnemiesProgramId
  ? new PublicKey(fieldEnemiesProgramId)
  : PublicKey.default;

export const POI_SYSTEM_PROGRAM_ID = poiSystemProgramId
  ? new PublicKey(poiSystemProgramId)
  : PublicKey.default;

export const INVENTORY_PROGRAM_ID = inventoryProgramId
  ? new PublicKey(inventoryProgramId)
  : PublicKey.default;

// ============================================================================
// Treasury
// ============================================================================

/** Treasury pubkey for run purchases (set in environment or use placeholder) */
const treasuryPubkeyStr = process.env.EXPO_PUBLIC_TREASURY_PUBKEY;
export const TREASURY_PUBKEY = treasuryPubkeyStr
  ? new PublicKey(treasuryPubkeyStr)
  : PublicKey.default;

// ============================================================================
// PDA Seeds
// ============================================================================

export const PDA_SEEDS = {
  /** Player profile: ["player", owner] */
  PLAYER: 'player',
  /** Game session: ["session", player, campaign_level] */
  SESSION: 'session',
  /** Session counter: ["session_counter"] */
  SESSION_COUNTER: 'session_counter',
  /** Game state: ["game_state", session_pda] */
  GAME_STATE: 'game_state',
  /** Map enemies: ["map_enemies", session_pda] */
  MAP_ENEMIES: 'map_enemies',
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
 * Derive GameSession PDA for a specific campaign level.
 *
 * @param player - Player's main wallet public key
 * @param campaignLevel - Campaign level (1-40)
 * @returns [PDA, bump]
 */
export function deriveSessionPda(player: PublicKey, campaignLevel: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.SESSION), player.toBuffer(), Buffer.from([campaignLevel])],
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
 * Derive MapEnemies PDA for a session.
 *
 * @param sessionPda - Session PDA
 * @returns [PDA, bump]
 */
export function deriveMapEnemiesPda(sessionPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PDA_SEEDS.MAP_ENEMIES), sessionPda.toBuffer()],
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

// ============================================================================
// Account Sizes (for rent calculation)
// ============================================================================

export const ACCOUNT_SIZES = {
  /** GameSession account size */
  GAME_SESSION: 8 + 32 + 8 + 1 + 32 + 10 + 32 + 8, // ~131 bytes
  /** GameState account size */
  GAME_STATE: 8 + 32 + 32 + 2 + 2 + 2 + 6 * 2 + 1 + 1 + 1 + 4 + 1, // ~90 bytes
  /** MapEnemies account size (10 enemies max) */
  MAP_ENEMIES: 8 + 10 * (1 + 1 + 1 + 2 + 1), // ~68 bytes
  /** MapPois account size (varies) */
  MAP_POIS: 8 + 20 * (1 + 1 + 1 + 1), // ~88 bytes
  /** PlayerInventory account size */
  PLAYER_INVENTORY: 8 + 8 * 20, // ~168 bytes
} as const;

// ============================================================================
// Run Economy Constants
// ============================================================================

/** Price for 20 sessions in lamports (0.005 SOL) */
export const RUN_PRICE_LAMPORTS = 5_000_000;

/** Number of runs received per purchase */
export const RUNS_PER_PURCHASE = 20;

/** Minimum lamports to keep in burner wallet */
export const MIN_BURNER_BALANCE = 5_000;

/** Default burner wallet funding amount (0.05 SOL) */
export const DEFAULT_BURNER_FUNDING = 50_000_000;

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
