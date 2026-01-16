import type { PublicKey } from '@solana/web3.js';

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
}
