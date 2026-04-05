import type { PublicKey } from '@solana/web3.js';
import type { GameState } from '@/services/solana/types/gameplay_state';

export interface OnChainPlayerProfile {
  owner: PublicKey;
  name: string;
  totalRuns: number;
  currentLevel: number;
  highestLevelUnlocked: number;
  availableRuns: number;
  createdAt: number;
  unlockedItems: Uint8Array;
  activeItemPool: Uint8Array;
  equippedSkin: PublicKey | null;
  gauntletBoosters: number;
}

export interface CachedProfileData {
  owner: string;
  name: string;
  totalRuns: number;
  currentLevel: number;
  availableRuns: number;
  createdAt: number;
}

export interface TransactionResult {
  success: boolean;
  signature?: string;
  error?: string;
  /** True when the user explicitly cancelled (e.g. dismissed the funding prompt). */
  cancelled?: boolean;
  /** When set, the user chose to resume an existing session in this game mode. */
  resumeSessionType?: 'campaign' | 'duel' | 'gauntlet';
  gameState?: GameState | null;
  mapSeed?: bigint | null;
  sessionPda?: string;
  isResumed?: boolean;
  duelQueued?: { seed: bigint; slot: number };
  /** Resolved ER connection (specific validator, not generic router). */
  resolvedErConnection?: import('@solana/web3.js').Connection;
  /** VRF fulfillment was not confirmed yet — caller should retry via retryErVrfForSession. */
  vrfPending?: boolean;
  /** Signature of the settle_session_result TX (emits ItemUnlocked event). */
  settleSignature?: string;
}

/**
 * Represents a campaign level for UI display.
 */
export interface CampaignLevel {
  /** Level number (0-80) */
  level: number;
  /** Whether player can access this level */
  isUnlocked: boolean;
  /** Whether player has completed this level */
  isCompleted: boolean;
  /** Seed for map generation (if unlocked) */
  seed: bigint | null;
}

export interface MetaplexCoreAsset {
  address: PublicKey;
  owner: PublicKey;
  name: string;
  uri: string;
  collection: PublicKey | null;
}

export interface ListingData {
  seller: PublicKey;
  asset: PublicKey;
  collection: PublicKey;
  priceLamports: bigint;
  createdAt: number;
}

export interface ListingWithAsset {
  listing: ListingData;
  asset: MetaplexCoreAsset;
}

export interface QuestDefinitionData {
  questId: number;
  questType: { daily: {} } | { weekly: {} } | { seasonal: {} };
  objectiveType: { winBattles: {} } | { completeLevels: {} } | { playPvpMatches: {} } | { defeatBosses: {} } | { collectGold: {} };
  objectiveCount: number;
  rewardType: { gauntletBooster: {} } | { skin: {} } | { nftItem: {} };
  rewardData: Uint8Array;
  season: number;
  active: boolean;
}

export interface QuestProgressData {
  player: PublicKey;
  questId: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
  lastReset: number;
}

export interface QuestWithProgress {
  definition: QuestDefinitionData;
  progress: QuestProgressData | null;
}
