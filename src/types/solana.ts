import type { PublicKey } from '@solana/web3.js';
import type { GameState } from '@/services/solana/types/gameplay_state';

export interface OnChainPlayerProfile {
  owner: PublicKey;
  name: string;
  totalRuns: number;
  currentLevel: number;
  availableRuns: number;
  createdAt: number;
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
  gameState?: GameState | null;
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
