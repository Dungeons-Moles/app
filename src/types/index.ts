/**
 * Core types for Dungeons & Moles
 */

export interface PlayerProfile {
  id: string;
  walletAddress: string;
  displayName: string;
  createdAt: number;
  lastPlayedAt: number;
}

export interface WalletState {
  isConnected: boolean;
  address: string | null;
  authToken: string | null;
}

export interface AuthorizationResult {
  address: string;
  label?: string;
  authToken: string;
}

// Game constants
export const GAME_RULES = {
  WEEK_STRUCTURE: ['day', 'night', 'day', 'night', 'day', 'night', 'boss'] as const,
  DAY_MOVES: 50,
  NIGHT_MOVES: 30,
  CYCLES_PER_WEEK: 3,
} as const;

export type PhaseType = typeof GAME_RULES.WEEK_STRUCTURE[number];
