/**
 * Client-side hook interfaces for Solana program interactions.
 * Feature: 004-solana-frontend-integration
 *
 * These interfaces define the API for React hooks that interact with
 * the Solana Core Programs (player-profile, session-manager, map-generator).
 */

import { PublicKey, Transaction, TransactionSignature } from '@solana/web3.js';

// ============================================================================
// Common Types
// ============================================================================

export interface TransactionResult {
  success: boolean;
  signature?: TransactionSignature;
  error?: string;
}

export interface LoadingState {
  isLoading: boolean;
  error: string | null;
}

// ============================================================================
// usePlayerProfile Hook
// ============================================================================

export interface PlayerProfileData {
  owner: PublicKey;
  name: string;
  totalRuns: number;
  currentLevel: number;
  unlockedTier: number;
  createdAt: number;
}

export interface UsePlayerProfileReturn extends LoadingState {
  /** Current profile data, null if not loaded or doesn't exist */
  profile: PlayerProfileData | null;
  /** Whether a profile exists for the connected wallet */
  exists: boolean;
  /** Whether using cached data */
  isCached: boolean;

  /** Fetch profile for connected wallet */
  fetchProfile: () => Promise<void>;
  /** Create new profile with given name */
  createProfile: (name: string) => Promise<TransactionResult>;
  /** Update profile display name */
  updateName: (newName: string) => Promise<TransactionResult>;
  /** Unlock next campaign tier (pays 0.05 SOL) */
  unlockNextTier: () => Promise<TransactionResult>;
  /** Record completed run result */
  recordRunResult: (levelReached: number, victory: boolean) => Promise<TransactionResult>;
  /** Clear local cache */
  clearCache: () => Promise<void>;
}

// ============================================================================
// useGameSession Hook
// ============================================================================

export type SessionStatus =
  | 'IDLE'
  | 'STARTING'
  | 'DELEGATING'
  | 'ACTIVE'
  | 'ENDING'
  | 'FAILED';

export interface GameSessionData {
  player: PublicKey;
  sessionId: bigint;
  campaignLevel: number;
  startedAt: number;
  lastActivity: number;
  isDelegated: boolean;
  stateHash: Uint8Array;
}

export interface UseGameSessionReturn {
  /** Current session status */
  status: SessionStatus;
  /** Active session data */
  session: GameSessionData | null;
  /** Error message for FAILED state */
  error: string | null;
  /** Whether operations are in progress */
  isLoading: boolean;

  /** Start new session for campaign level */
  startSession: (campaignLevel: number) => Promise<void>;
  /** Delegate session to MagicBlock ephemeral rollup */
  delegateSession: () => Promise<void>;
  /** Commit current state hash (periodic checkpoint) */
  commitState: (stateHash: Uint8Array) => Promise<void>;
  /** End session with final state and record result */
  endSession: (finalStateHash: Uint8Array, victory: boolean) => Promise<void>;
  /** Dismiss error and return to IDLE */
  dismissError: () => void;
  /** Retry last failed operation */
  retry: () => Promise<void>;
  /** Check if player has active session */
  checkActiveSession: () => Promise<boolean>;
}

// ============================================================================
// useMapGenerator Hook
// ============================================================================

export interface CampaignLevel {
  level: number;
  isUnlocked: boolean;
  isCompleted: boolean;
  tier: number;
  seed: bigint | null;
}

export interface CampaignTier {
  tier: number;
  levelStart: number;
  levelEnd: number;
  unlockCost: bigint;
  isUnlocked: boolean;
}

export interface UseMapGeneratorReturn extends LoadingState {
  /** Map config loaded from on-chain */
  isConfigLoaded: boolean;

  /** Get seed for specific campaign level */
  getSeed: (level: number) => Promise<bigint | null>;
  /** Get all campaign levels with unlock status */
  getCampaignLevels: (playerLevel: number, unlockedTier: number) => CampaignLevel[];
  /** Get all campaign tiers with unlock status */
  getCampaignTiers: (unlockedTier: number) => CampaignTier[];
  /** Verify map hash matches expected for level */
  verifyMapHash: (level: number, mapHash: Uint8Array) => Promise<boolean>;
  /** Refresh map config from on-chain */
  refreshConfig: () => Promise<void>;
}

// ============================================================================
// WalletContext Extensions
// ============================================================================

export interface WalletContextExtensions {
  /** Sign and send a transaction using mobile wallet adapter */
  signAndSendTransaction: (transaction: Transaction) => Promise<TransactionSignature>;
  /** Sign a message using mobile wallet adapter */
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  /** Check if wallet has sufficient balance */
  checkBalance: (requiredLamports: bigint) => Promise<boolean>;
  /** Get current SOL balance */
  getBalance: () => Promise<bigint>;
}

// ============================================================================
// ProfileContext Interface
// ============================================================================

export interface ProfileContextValue extends UsePlayerProfileReturn {
  /** Connectivity mode (online, cached, guest) */
  mode: 'online' | 'cached' | 'guest';
  /** Refresh profile from on-chain */
  refresh: () => Promise<void>;
}

// ============================================================================
// Constants
// ============================================================================

/** Cost per tier unlock in lamports (0.05 SOL) */
export const TIER_UNLOCK_COST = 50_000_000n;

/** Levels per tier */
export const LEVELS_PER_TIER = 40;

/** Maximum campaign level */
export const MAX_CAMPAIGN_LEVEL = 80;

/** Profile name maximum length */
export const MAX_NAME_LENGTH = 32;

/** Session state commit interval in milliseconds */
export const STATE_COMMIT_INTERVAL = 30_000;

/** Profile cache TTL in milliseconds */
export const PROFILE_CACHE_TTL = 5 * 60 * 1000;
