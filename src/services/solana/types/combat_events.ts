/**
 * Combat Event Type Definitions
 *
 * Type definitions for combat-related events emitted by the gameplay-state program.
 * These events are parsed from transaction logs and used for combat replay animations.
 *
 * @see contracts/combat-events.md for full specification
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

/**
 * Emitted for each combat turn.
 */
export interface TurnExecutedEvent {
  turn: number;
  playerHp: number;
  enemyHp: number;
  playerDamage: number;
  enemyDamage: number;
}

/**
 * Status effect types that can be applied during combat.
 */
export enum StatusEffect {
  Chill = 0,
  Shrapnel = 1,
  Rust = 2,
}

/**
 * Emitted when a status effect is applied.
 */
export interface StatusAppliedEvent {
  target: 'player' | 'enemy';
  effectType: StatusEffect;
  stacks: number;
}

/**
 * Emitted when combat concludes.
 */
export interface CombatEndedEvent {
  player: PublicKey;
  playerWon: boolean;
  finalPlayerHp: number;
  finalEnemyHp: number;
  goldEarned: number;
  turnsTaken: number;
}

/**
 * Emitted when boss combat begins (Week 1/2/3 boss encounter).
 */
export interface BossCombatStartedEvent {
  player: PublicKey;
  bossId: string; // 12-char ID like "STONE_GOLEM"
  bossHp: number;
  week: number;
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
// Combat Replay Data Structure
// ============================================================================

/**
 * Complete combat data for replay animation.
 */
export interface CombatReplay {
  /** Transaction signature */
  signature: string;
  /** Combat start event */
  combatStarted: CombatStartedEvent;
  /** Turn-by-turn events */
  turns: TurnExecutedEvent[];
  /** Status effect applications */
  statusEffects: StatusAppliedEvent[];
  /** Combat end event */
  combatEnded: CombatEndedEvent;
  /** Whether this is boss combat */
  isBoss: boolean;
  /** Boss intro data (if boss combat) */
  bossIntro?: BossCombatStartedEvent;
}

/**
 * Enemy movements during night phase.
 */
export interface NightMovementBatch {
  /** Ordered enemy movements */
  movements: EnemyMovedEvent[];
  /** Current animation index */
  currentIndex: number;
  /** Whether all movements are animated */
  complete: boolean;
}

// ============================================================================
// Combat Replay State Machine
// ============================================================================

/**
 * Animation state for combat overlay.
 */
export type CombatReplayState = 'idle' | 'intro' | 'turns' | 'outro' | 'result';

// ============================================================================
// Animation Timing Constants
// ============================================================================

/** Duration for intro animation (show combatants) */
export const INTRO_DURATION_MS = 500;

/** Duration for each turn animation */
export const TURN_DURATION_MS = 300;

/** Duration for status effect animation */
export const STATUS_DURATION_MS = 200;

/** Duration for outro animation (victory/defeat) */
export const OUTRO_DURATION_MS = 500;

/** Duration for each enemy movement during night */
export const ENEMY_MOVE_DURATION_MS = 200;

// ============================================================================
// Event Name Constants
// ============================================================================

export const EVENT_NAMES = {
  COMBAT_STARTED: 'CombatStarted',
  TURN_EXECUTED: 'TurnExecuted',
  STATUS_APPLIED: 'StatusApplied',
  COMBAT_ENDED: 'CombatEnded',
  BOSS_COMBAT_STARTED: 'BossCombatStarted',
  ENEMY_MOVED: 'EnemyMoved',
  PLAYER_DEFEATED: 'PlayerDefeated',
  LEVEL_COMPLETED: 'LevelCompleted',
  ITEM_UNLOCKED: 'ItemUnlocked',
  RUNS_PURCHASED: 'RunsPurchased',
} as const;

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Parsed event with name and data.
 */
export interface ParsedEvent<T = unknown> {
  name: string;
  data: T;
}

/**
 * Result of parsing combat events from a transaction.
 */
export interface CombatEventParseResult {
  /** Combat replay data if combat occurred */
  combat: CombatReplay | null;
  /** Night movement events if any */
  nightMovements: EnemyMovedEvent[];
  /** Player defeated event if player died */
  playerDefeated: PlayerDefeatedEvent | null;
  /** Level completed event if level was completed */
  levelCompleted: LevelCompletedEvent | null;
  /** Item unlocked event if an item was unlocked */
  itemUnlocked: ItemUnlockedEvent | null;
}
