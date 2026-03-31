/**
 * Combat Event Type Definitions
 *
 * Type definitions for combat-related events emitted by the gameplay-state program.
 * These events are parsed from transaction logs for enemy info and night movement.
 */

import { PublicKey } from '@solana/web3.js';

// ============================================================================
// Combat Events
// ============================================================================

/**
 * Emitted when combat begins (player enters enemy tile or enemy enters player tile during night).
 */
export interface CombatStartedEvent {
  player: PublicKey;
  playerHp: number;
  playerAtk: number;
  enemyArchetype: number;
  enemyHp: number;
  enemyAtk: number;
}

// ============================================================================
// Movement Events
// ============================================================================

/**
 * Emitted during night phase when an enemy moves toward player.
 */
export interface EnemyMovedEvent {
  enemyIndex: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

// ============================================================================
// Session Lifecycle Events
// ============================================================================

/**
 * Emitted when player HP reaches 0.
 */
export interface PlayerDefeatedEvent {
  player: PublicKey;
  killedBy: 'enemy' | 'boss';
  finalHp: number;
}

/**
 * Emitted when Week 3 boss is defeated.
 */
export interface LevelCompletedEvent {
  player: PublicKey;
  level: number;
  totalMoves: number;
  goldEarned: number;
}

/**
 * Emitted when an item is unlocked upon level completion.
 */
export interface ItemUnlockedEvent {
  owner: PublicKey;
  itemIndex: number;
  levelCompleted: number;
  timestamp: number;
}

/**
 * Emitted when runs are purchased.
 */
export interface RunsPurchasedEvent {
  owner: PublicKey;
  runsAdded: number;
  newTotal: number;
  timestamp: number;
}

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Emitted when player moves to a new tile.
 */
export interface PlayerMovedEvent {
  player: PublicKey;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

/**
 * Emitted when phase advances (day to night, night to day, etc.).
 */
export interface PhaseAdvancedEvent {
  player: PublicKey;
  oldPhase: number;
  newPhase: number;
  movesAllowed: number;
}

/**
 * Emitted when boss fight becomes ready at end of Night3.
 */
export interface BossFightReadyEvent {
  player: PublicKey;
  week: number;
}

/**
 * Emitted when player is healed (via POI CPI).
 */
export interface PlayerHealedEvent {
  player: PublicKey;
  amount: number;
  newHp: number;
}

/**
 * Emitted when gold is modified via authorized CPI.
 */
export interface GoldModifiedAuthorizedEvent {
  player: PublicKey;
  delta: number;
  newGold: number;
}

// ============================================================================
// Event Name Constants
// ============================================================================

export const EVENT_NAMES = {
  COMBAT_STARTED: 'combatStarted',
  COMBAT_ENDED: 'combatEnded',
  ENEMY_MOVED: 'enemyMoved',
  PLAYER_MOVED: 'playerMoved',
  PLAYER_DEFEATED: 'playerDefeated',
  LEVEL_COMPLETED: 'levelCompleted',
  ITEM_UNLOCKED: 'itemUnlocked',
  RUNS_PURCHASED: 'runsPurchased',
  PHASE_ADVANCED: 'phaseAdvanced',
  BOSS_FIGHT_READY: 'bossFightReady',
  PLAYER_HEALED: 'playerHealed',
  GOLD_MODIFIED_AUTHORIZED: 'goldModifiedAuthorized',
} as const;
