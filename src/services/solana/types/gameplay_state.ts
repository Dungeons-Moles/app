import { PublicKey } from '@solana/web3.js';
import { SOLANA_CONFIG } from '../config';

/**
 * Gameplay state types derived from the gameplay-state program IDL.
 * These types are used for interacting with the on-chain GameState account.
 */

/**
 * Time phase enumeration determining move allowance.
 * Each day has 50 moves, each night has 30 moves.
 */
export enum Phase {
  Day1 = 0,
  Night1 = 1,
  Day2 = 2,
  Night2 = 3,
  Day3 = 4,
  Night3 = 5,
}

/**
 * Stat type enumeration for modify_stat instruction.
 */
export enum StatType {
  Hp = 0,
  MaxHp = 1,
  Atk = 2,
  Arm = 3,
  Spd = 4,
  Dig = 5,
}

export enum RunMode {
  Campaign = 0,
  Duel = 1,
  Gauntlet = 2,
}

/**
 * Move allowance per phase.
 */
export const PHASE_MOVE_ALLOWANCE: Record<Phase, number> = {
  [Phase.Day1]: 50,
  [Phase.Night1]: 30,
  [Phase.Day2]: 50,
  [Phase.Night2]: 30,
  [Phase.Day3]: 50,
  [Phase.Night3]: 30,
};

/**
 * Core gameplay state account linked to a GameSession.
 * Contains all mutable game data for a single run.
 */
export interface GameState {
  /** Session owner's wallet */
  player: PublicKey;
  /** Linked GameSession PDA */
  session: PublicKey;
  /** Current X coordinate (0 <= x < mapWidth) */
  positionX: number;
  /** Current Y coordinate (0 <= y < mapHeight) */
  positionY: number;
  /** Map boundary X (immutable after init) */
  mapWidth: number;
  /** Map boundary Y (immutable after init) */
  mapHeight: number;
  /** Current health points (0 <= hp <= maxHp) */
  hp: number;
  /** Maximum health points */
  maxHp: number;
  /** Attack stat (allows negative for debuffs) */
  atk: number;
  /** Armor stat (allows negative for debuffs) */
  arm: number;
  /** Speed stat (allows negative for debuffs) */
  spd: number;
  /** Digging stat (affects wall dig cost) */
  dig: number;
  /** Gear slot capacity (4 -> 6 -> 8) */
  gearSlots: number;
  /** Current week (1-3) */
  week: number;
  /** Current time phase */
  phase: Phase;
  /** Moves remaining in current phase (0-50) */
  movesRemaining: number;
  /** Total moves made across session */
  totalMoves: number;
  /** Boss fight triggered flag */
  bossFightReady: boolean;
  /** Current gold */
  gold: number;
  /** Campaign level being played */
  campaignLevel: number;
  /** Player death flag */
  isDead: boolean;
  /** Session mode */
  runMode: RunMode;
  /** Max weeks for current mode */
  maxWeeks: number;
  /** Completion flag */
  completed: boolean;
  /** Gauntlet epoch ID */
  gauntletEpochId: number;
  /** Gauntlet points earned this run */
  gauntletPointsEarned: number;
  /** Highest week won in gauntlet */
  gauntletHighestWeekWon: number;
  /** Whether gauntlet session has been settled */
  gauntletSettled: boolean;
  /** Pre-assigned duel map seed from base layer (0 = creator, non-zero = matched) */
  duelMapSeed: number;
  /** Number of enemies defeated this run */
  enemiesDefeated: number;
}

/**
 * GameState initialization parameters.
 */
export interface GameStateInitParams {
  /** Map boundary X dimension */
  mapWidth: number;
  /** Map boundary Y dimension */
  mapHeight: number;
  /** Starting X position */
  startX: number;
  /** Starting Y position */
  startY: number;
}

/**
 * Move player parameters.
 * Note: isWall is no longer needed — the on-chain program reads the map directly.
 */
export interface MovePlayerParams {
  /** Target X coordinate */
  targetX: number;
  /** Target Y coordinate */
  targetY: number;
}

/**
 * Accounts required for the move_player instruction.
 */
export interface MovePlayerAccounts {
  /** GameState PDA: ["game_state", session] */
  gameState: PublicKey;
  /** Session Manager program address (for CPI validation) */
  sessionManager: PublicKey;
  /** GameSession PDA: ["session", player, level] */
  gameSession: PublicKey;
  /** GeneratedMap PDA: ["generated_map", session] */
  generatedMap: PublicKey;
  /** PlayerInventory PDA: ["inventory", session] */
  inventory: PublicKey;
  /** Player Inventory program ID */
  playerInventoryProgram: PublicKey;
  /** Player signer (session signer key) */
  player: PublicKey;
  /** System program */
  systemProgram: PublicKey;
}

/**
 * Modify stat parameters.
 */
export interface ModifyStatParams {
  /** Which stat to modify */
  stat: StatType;
  /** Amount to add (negative for decrease) */
  delta: number;
}

/**
 * Event emitted when player moves.
 */
export interface PlayerMovedEvent {
  player: PublicKey;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  movesRemaining: number;
  isDig: boolean;
}

/**
 * Event emitted when phase advances.
 */
export interface PhaseAdvancedEvent {
  player: PublicKey;
  newPhase: Phase;
  newWeek: number;
  movesRemaining: number;
}

/**
 * Event emitted when stat is modified.
 */
export interface StatModifiedEvent {
  player: PublicKey;
  stat: StatType;
  oldValue: number;
  newValue: number;
}

/**
 * Event emitted when boss fight is ready.
 */
export interface BossFightReadyEvent {
  player: PublicKey;
  week: number;
}

/**
 * Event emitted when game state is closed.
 */
export interface GameStateClosedEvent {
  player: PublicKey;
  totalMoves: number;
  finalPhase: Phase;
  finalWeek: number;
}

/**
 * Derives the GameState PDA from session PDA.
 * PDA Seeds: ["game_state", session_pda.as_ref()]
 */
export function deriveGameStatePda(
  sessionPda: PublicKey,
  programId: PublicKey = SOLANA_CONFIG.programs.gameplayState
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('game_state'), sessionPda.toBuffer()],
    programId
  );
}
