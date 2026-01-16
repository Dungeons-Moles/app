/**
 * Core types for Dungeons & Moles
 */

// Re-export game types for convenient access
// Core engine and map types (primary definitions)
export * from '../game/engine/types';
export * from '../game/map/types';

// Combat-specific additions (EffectContext, Effect)
export { EffectContext, Effect } from '../game/combat/types';

// Time-specific constants (PHASE_MOVES, WEEK_PHASES, SIGHT_RADIUS)
export { PHASE_MOVES, WEEK_PHASES, SIGHT_RADIUS } from '../game/time/types';

// Input types (Direction, InputEvent, DIRECTION_DELTA)
import type { PublicKey } from '@solana/web3.js';

export * from '../game/input/types';

export type CombatSpeed = 'paused' | 'normal' | 'fast';

export interface PlayerProfile {
  id: string;
  walletAddress: string;
  displayName: string;
  createdAt: number;
  lastPlayedAt: number;
  defaultCombatSpeed?: CombatSpeed;
}

export interface WalletState {
  isConnected: boolean;
  address: string | null;
  publicKey: PublicKey | null;
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

export type PhaseType = (typeof GAME_RULES.WEEK_STRUCTURE)[number];
