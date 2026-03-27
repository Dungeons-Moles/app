/**
 * Combat Event Type Definitions
 *
 * Type definitions for combat-related events emitted by the gameplay-state program.
 * These events are parsed from transaction logs and used for combat replay animations.
 *
 * @see contracts/combat-events.md for full specification
 */

import { PublicKey } from '@solana/web3.js';
import type { CombatContribution, CombatLogEntry, CombatSourceRef } from '@/game/engine/types';
import type { CombatResolverInput } from '@/game/combat/types';

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

// Anchor's event coder returns camelCase names (e.g. 'combatStarted', not 'CombatStarted').
export const EVENT_NAMES = {
  COMBAT_STARTED: 'combatStarted',
  TURN_EXECUTED: 'turnExecuted',
  STATUS_APPLIED: 'statusApplied',
  COMBAT_ENDED: 'combatEnded',
  BOSS_COMBAT_STARTED: 'bossCombatStarted',
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
  COMBAT_LOG: 'combatLog',
} as const;

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
// Backend Combat Log Types (from Solana combat-system)
// ============================================================================

/**
 * Actions that can be logged during combat (matches Solana LogAction enum).
 * Order must match the Rust enum discriminant values.
 */
export enum LogAction {
  Attack = 0,
  Heal = 1,
  ApplyStatus = 2,
  StatusDamage = 3,
  ArmorChange = 4,
  AtkChange = 5,
  SpdChange = 6,
  NonWeaponDamage = 7,
  ShrapnelRetaliation = 8,
  GoldStolen = 9,
}

/**
 * Status IDs for ApplyStatus action's extra field.
 * Matches STATUS_* constants in combat-system/src/state.rs
 */
export enum StatusId {
  Chill = 0,
  Shrapnel = 1,
  Rust = 2,
  Bleed = 3,
  Reflection = 4,
}

/**
 * Backend combat log entry (matches CombatLogEntry in Solana).
 * Compact format: ~5 bytes per entry.
 */
export interface BackendCombatLogEntry {
  /** Turn number (1-50) */
  turn: number;
  /** true = player action, false = enemy action */
  isPlayer: boolean;
  /** The action type */
  action: LogAction;
  /** Primary value (damage, healing, stacks, etc.) */
  value: number;
  /** Extra data (status_id for ApplyStatus, 0 otherwise) */
  extra: number;
  /** Authoritative effect source from on-chain combat */
  source?: CombatSourceRef;
  /** Optional per-source breakdown for aggregated events */
  contributions?: CombatContribution[];
}

/**
 * CombatLog event from Solana (contains array of log entries).
 */
export interface CombatLogEvent {
  player: string;
  entries: BackendCombatLogEntry[];
}

interface BufferDecodeResult<T> {
  value: T;
  bytesRead: number;
}

function trimSourceId(idBytes: Uint8Array): string {
  return String.fromCharCode(...Array.from(idBytes)).replace(/\0+$/g, '').trim();
}

function parseCombatSourceKind(kind: number): CombatSourceRef['kind'] {
  switch (kind) {
    case 0:
      return 'tool';
    case 1:
      return 'gear';
    case 2:
      return 'itemset';
    case 3:
      return 'enemy';
    case 4:
      return 'boss';
    case 5:
      return 'status';
    default:
      return 'status';
  }
}

export function decodeCombatSourceRefBuffer(
  data: Buffer,
  offset: number
): BufferDecodeResult<CombatSourceRef> {
  const kind = parseCombatSourceKind(data.readUInt8(offset));
  const id = trimSourceId(data.subarray(offset + 1, offset + 17));
  return {
    value: { kind, id, name: id || undefined },
    bytesRead: 17,
  };
}

export function decodeOptionCombatSourceRefBuffer(
  data: Buffer,
  offset: number
): BufferDecodeResult<CombatSourceRef | undefined> {
  const tag = data.readUInt8(offset);
  if (tag === 0) {
    return { value: undefined, bytesRead: 1 };
  }
  const decoded = decodeCombatSourceRefBuffer(data, offset + 1);
  return {
    value: decoded.value,
    bytesRead: 1 + decoded.bytesRead,
  };
}

export function decodeCombatContributionBuffer(
  data: Buffer,
  offset: number
): BufferDecodeResult<CombatContribution> {
  const source = decodeCombatSourceRefBuffer(data, offset);
  const value = data.readInt16LE(offset + source.bytesRead);
  return {
    value: { source: source.value, value },
    bytesRead: source.bytesRead + 2,
  };
}

export function decodeCombatLogEntryBuffer(
  data: Buffer,
  offset: number
): BufferDecodeResult<BackendCombatLogEntry> {
  const turn = data.readUInt8(offset);
  const isPlayer = data.readUInt8(offset + 1) !== 0;
  const action = data.readUInt8(offset + 2) as LogAction;
  const value = data.readInt16LE(offset + 3);
  const extra = data.readUInt8(offset + 5);

  let cursor = offset + 6;
  const source = decodeOptionCombatSourceRefBuffer(data, cursor);
  cursor += source.bytesRead;

  const contributionCount = data.readUInt32LE(cursor);
  cursor += 4;

  const contributions: CombatContribution[] = [];
  for (let i = 0; i < contributionCount; i++) {
    const decoded = decodeCombatContributionBuffer(data, cursor);
    contributions.push(decoded.value);
    cursor += decoded.bytesRead;
  }

  return {
    value: {
      turn,
      isPlayer,
      action,
      value,
      extra,
      source: source.value,
      contributions: contributions.length > 0 ? contributions : undefined,
    },
    bytesRead: cursor - offset,
  };
}

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

/**
 * Unified result from a move_player transaction.
 * Contains all possible events that can occur in a single move.
 */
export interface MoveResult {
  /** Player position change */
  playerMoved: PlayerMovedEvent | null;
  /** Enemy movements during night phase */
  enemyMoves: EnemyMovedEvent[];
  /** Combat replay if combat occurred */
  combat: CombatReplay | null;
  /** Phase transition if phase advanced */
  phaseAdvanced: PhaseAdvancedEvent | null;
  /** Boss combat replay if boss fight triggered */
  bossCombat: CombatReplay | null;
  /** Level completed event */
  levelCompleted: LevelCompletedEvent | null;
  /** Player defeated event */
  playerDefeated: PlayerDefeatedEvent | null;
  /** Player healed event (from POI CPI) */
  playerHealed: PlayerHealedEvent | null;
  /** Gold modification event (from POI CPI) */
  goldModified: GoldModifiedAuthorizedEvent | null;
}

// ============================================================================
// Backend Log to Frontend Log Converter
// ============================================================================

/**
 * Frontend CombatLogEntry format (imported from game engine types)
 * Re-defined here to avoid circular imports
 */
export interface FrontendCombatLogEntry {
  turn: number;
  timing: string;
  actor: 'player' | 'enemy' | 'system';
  action: string;
  target: 'player' | 'enemy' | 'none';
  result: {
    damage?: number;
    healing?: number;
    armorGained?: number;
    armorLost?: number;
    atkBonus?: number;
    statusApplied?: { type: string; stacks: number };
    effectName?: string;
    goldStolen?: number;
    spdBonus?: number;
    source?: CombatSourceRef;
    contributions?: CombatContribution[];
  };
  rngValues: number[];
}

/**
 * Map StatusId to status name string
 */
function getStatusName(statusId: StatusId): string {
  switch (statusId) {
    case StatusId.Chill:
      return 'chill';
    case StatusId.Shrapnel:
      return 'shrapnel';
    case StatusId.Rust:
      return 'rust';
    case StatusId.Bleed:
      return 'bleed';
    case StatusId.Reflection:
      return 'reflection';
    default:
      return 'unknown';
  }
}

function getStatusNameFromEntry(entry: BackendCombatLogEntry): string {
  if (entry.source?.kind === 'status') {
    return entry.source.id;
  }
  return getStatusName(entry.extra as StatusId);
}

function getReplayAttackSource(
  input: CombatResolverInput | undefined,
  actor: 'player' | 'enemy'
): CombatSourceRef | undefined {
  if (!input) return undefined;
  if (actor === 'player') {
    const tool = input.playerTool;
    return tool ? { kind: 'tool', id: tool.id, name: tool.name } : undefined;
  }

  if (input.enemyTool) {
    return { kind: 'tool', id: input.enemyTool.id, name: input.enemyTool.name };
  }
  if (input.bossId) {
    return { kind: 'boss', id: input.bossId };
  }
  if (input.enemyId) {
    return { kind: 'enemy', id: input.enemyId };
  }
  return undefined;
}

/**
 * Convert backend combat log entries to frontend format for animation.
 *
 * Backend format is compact (5 bytes per entry) while frontend needs
 * detailed action/result info for the animation system.
 *
 * @param backendLog - Array of backend log entries from on-chain combat
 * @returns Array of frontend log entries for combat animation
 */
export function convertBackendLogToFrontend(
  backendLog: BackendCombatLogEntry[],
  input?: CombatResolverInput
): FrontendCombatLogEntry[] {
  return backendLog.map((entry): FrontendCombatLogEntry => {
    // On-chain semantics: for Attack, is_player = !is_target_player (attacker).
    // For most other actions, is_player = is_target_player (who is affected).
    // We derive actor/target per action type accordingly.
    const actorAsAttacker = entry.isPlayer ? 'player' : 'enemy';
    const targetOfAttacker = entry.isPlayer ? 'enemy' : 'player';
    const attackerTiming = entry.isPlayer ? 'PLAYER_ATTACK' : 'ENEMY_ATTACK';
    // For target-semantics actions: is_player identifies who is affected
    const affected: 'player' | 'enemy' = entry.isPlayer ? 'player' : 'enemy';
    const affectedOpposite: 'player' | 'enemy' = entry.isPlayer ? 'enemy' : 'player';

    switch (entry.action) {
      case LogAction.Attack:
        // is_player = !is_target_player → isPlayer = attacker
        return {
          turn: entry.turn,
          timing: attackerTiming,
          actor: actorAsAttacker,
          action: 'ATTACK',
          target: targetOfAttacker,
          result: {
            damage: entry.value,
            source: entry.source ?? getReplayAttackSource(input, actorAsAttacker),
            contributions: entry.contributions,
          },
          rngValues: [],
        };

      case LogAction.Heal:
        // is_player = is_target_player → isPlayer = who is healed
        return {
          turn: entry.turn,
          timing: 'TURN_START',
          actor: affected,
          action: 'HEAL',
          target: affected, // Heal self
          result: {
            healing: entry.value,
          },
          rngValues: [],
        };

      case LogAction.ApplyStatus:
        // is_player = is_target_player → isPlayer = who receives the status
        return {
          turn: entry.turn,
          timing: 'ON_HIT',
          actor: affectedOpposite, // The OTHER combatant applied the status
          action: 'APPLY_STATUS',
          target: affected, // isPlayer identifies the target
          result: {
            statusApplied: {
              type: getStatusName(entry.extra as StatusId),
              stacks: entry.value,
            },
          },
          rngValues: [],
        };

      case LogAction.StatusDamage:
        // is_player = who takes the status damage (target semantics)
        {
        const statusName = getStatusNameFromEntry(entry);
        return {
          turn: entry.turn,
          timing: 'TURN_START',
          actor: 'system',
          action: 'ATTACK',
          target: affected, // isPlayer = who takes the damage
          result: {
            damage: entry.value,
            effectName: `${statusName} damage`,
            source: entry.source ?? {
              kind: 'status',
              id: statusName,
              name: statusName,
            },
          },
          rngValues: [],
        };
      }

      case LogAction.ArmorChange:
        // is_player = is_target_player (who gains/loses armor)
        if (entry.value > 0) {
          return {
            turn: entry.turn,
            timing: 'TURN_START',
            actor: affected,
            action: 'GAIN_ARMOR',
            target: affected,
            result: {
              armorGained: entry.value,
              source: entry.source,
            },
            rngValues: [],
          };
        } else {
          return {
            turn: entry.turn,
            timing: 'ON_HIT',
            actor: affectedOpposite,
            action: 'LOSE_ARMOR',
            target: affected,
            result: {
              armorLost: Math.abs(entry.value),
              source: entry.source,
              contributions: entry.contributions,
            },
            rngValues: [],
          };
        }

      case LogAction.AtkChange:
        // is_player = is_target_player (who gains/loses ATK)
        return {
          turn: entry.turn,
          timing: 'TURN_START',
          actor: affected,
          action: 'TRIGGER_ITEM',
          target: affected,
          result: {
            atkBonus: entry.value,
            effectName: entry.value > 0 ? `+${entry.value} ATK` : `${entry.value} ATK`,
            source: entry.source,
          },
          rngValues: [],
        };

      case LogAction.SpdChange:
        // is_player = is_target_player (who gains/loses SPD)
        return {
          turn: entry.turn,
          timing: 'TURN_START',
          actor: affected,
          action: 'TRIGGER_ITEM',
          target: affected,
          result: {
            spdBonus: entry.value,
            effectName: entry.value > 0 ? `+${entry.value} SPD` : `${entry.value} SPD`,
            source: entry.source,
          },
          rngValues: [],
        };

      case LogAction.NonWeaponDamage:
        // is_player = is_target_player → isPlayer = who TAKES the damage
        return {
          turn: entry.turn,
          timing: 'TURN_START',
          actor: affectedOpposite,
          action: 'TRIGGER_ITEM',
          target: affected, // isPlayer identifies who receives damage
          result: {
            damage: entry.value,
            effectName: 'Item damage',
            source: entry.source,
          },
          rngValues: [],
        };

      case LogAction.ShrapnelRetaliation:
        // is_player = is_player_attacking → the attacker takes shrapnel damage
        return {
          turn: entry.turn,
          timing: attackerTiming,
          actor: entry.isPlayer ? 'enemy' : 'player', // Defender's shrapnel triggers
          action: 'TRIGGER_ITEMSET',
          target: entry.isPlayer ? 'player' : 'enemy', // Attacker takes the damage
          result: {
            damage: entry.value,
            effectName: 'Shrapnel Harness',
            source: entry.source ?? { kind: 'status', id: 'shrapnel', name: 'Shrapnel' },
          },
          rngValues: [],
        };

      case LogAction.GoldStolen:
        // On-chain: is_player=true means player gained gold, is_player=false means player lost
        // value is positive when player gains, negative when player loses
        return {
          turn: entry.turn,
          timing: 'ON_HIT',
          actor: entry.isPlayer ? 'player' : 'enemy',
          action: 'TRIGGER_TRAIT',
          target: entry.isPlayer ? 'enemy' : 'player',
          result: {
            effectName: `Stole ${Math.abs(entry.value)} gold`,
            goldStolen: Math.abs(entry.value),
            source: entry.source ?? getReplayAttackSource(input, entry.isPlayer ? 'player' : 'enemy'),
          },
          rngValues: [],
        };

      default:
        // Fallback for unknown actions
        return {
          turn: entry.turn,
          timing: 'TURN_START',
          actor: actorAsAttacker,
          action: 'ATTACK',
          target: targetOfAttacker,
          result: {
            damage: entry.value,
          },
          rngValues: [],
        };
    }
  });
}

function getStatusId(status: string): StatusId {
  switch (status) {
    case 'chill':
      return StatusId.Chill;
    case 'shrapnel':
      return StatusId.Shrapnel;
    case 'rust':
      return StatusId.Rust;
    case 'bleed':
      return StatusId.Bleed;
    case 'reflection':
      return StatusId.Reflection;
    default:
      return StatusId.Chill;
  }
}

function parseSignedStatDelta(effectName: string | undefined, stat: 'ATK' | 'SPD'): number | null {
  if (!effectName) return null;
  const match = effectName.match(new RegExp(`([+-]?\\d+)\\s+${stat}`));
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isStatusDamage(entry: CombatLogEntry): boolean {
  const effectName = entry.result.effectName?.toLowerCase();
  return entry.actor === 'system' && entry.action === 'ATTACK' && effectName?.endsWith(' damage') === true;
}

export function convertFrontendLogToBackend(
  frontendLog: CombatLogEntry[]
): BackendCombatLogEntry[] {
  const backendLog: BackendCombatLogEntry[] = [];

  for (const entry of frontendLog) {
    if (!entry || entry.target === 'none') continue;

    if ((entry.result.armorLost ?? 0) > 0 && entry.action !== 'LOSE_ARMOR') {
      const armorLost = entry.result.armorLost ?? 0;
      backendLog.push({
        turn: entry.turn,
        isPlayer: entry.target === 'player',
        action: LogAction.ArmorChange,
        value: -armorLost,
        extra: 0,
        source: entry.result.source,
        contributions: entry.result.contributions,
      });
    }

    if (entry.action === 'ATTACK' && entry.result.damage !== undefined) {
      backendLog.push({
        turn: entry.turn,
        isPlayer: entry.actor === 'player',
        action: isStatusDamage(entry) ? LogAction.StatusDamage : LogAction.Attack,
        value: entry.result.damage,
        extra: isStatusDamage(entry)
          ? getStatusId((entry.result.effectName ?? '').replace(/ damage$/i, '').toLowerCase())
          : (entry.result.spdBonus ?? 0),
        source: entry.result.source,
        contributions: entry.result.contributions,
      });
      continue;
    }

    if (entry.action === 'HEAL' && entry.result.healing !== undefined) {
      backendLog.push({
        turn: entry.turn,
        isPlayer: entry.target === 'player',
        action: LogAction.Heal,
        value: entry.result.healing,
        extra: 0,
        source: entry.result.source,
      });
      continue;
    }

    if (entry.action === 'APPLY_STATUS' && entry.result.statusApplied) {
      backendLog.push({
        turn: entry.turn,
        isPlayer: entry.target === 'player',
        action: LogAction.ApplyStatus,
        value: entry.result.statusApplied.stacks,
        extra: getStatusId(entry.result.statusApplied.type),
        source: entry.result.source,
      });
      continue;
    }

    if (entry.action === 'GAIN_ARMOR' && entry.result.armorGained !== undefined) {
      backendLog.push({
        turn: entry.turn,
        isPlayer: entry.target === 'player',
        action: LogAction.ArmorChange,
        value: entry.result.armorGained,
        extra: 0,
        source: entry.result.source,
      });
      continue;
    }

    if (entry.action === 'LOSE_ARMOR' && (entry.result.armorLost ?? 0) > 0) {
      const armorLost = entry.result.armorLost ?? 0;
      backendLog.push({
        turn: entry.turn,
        isPlayer: entry.target === 'player',
        action: LogAction.ArmorChange,
        value: -armorLost,
        extra: 0,
        source: entry.result.source,
      });
      continue;
    }

    if (entry.result.goldStolen !== undefined) {
      const playerGainedGold = entry.actor === 'player';
      backendLog.push({
        turn: entry.turn,
        isPlayer: playerGainedGold,
        action: LogAction.GoldStolen,
        value: playerGainedGold ? entry.result.goldStolen : -entry.result.goldStolen,
        extra: 0,
        source: entry.result.source,
      });
      continue;
    }

    if (
      (entry.action === 'TRIGGER_ITEM' ||
        entry.action === 'TRIGGER_ITEMSET' ||
        entry.action === 'TRIGGER_TRAIT') &&
      entry.result.damage !== undefined
    ) {
      backendLog.push({
        turn: entry.turn,
        isPlayer: entry.target === 'player',
        action: entry.result.effectName === 'Shrapnel Harness'
          ? LogAction.ShrapnelRetaliation
          : LogAction.NonWeaponDamage,
        value: entry.result.damage,
        extra: 0,
        source: entry.result.source,
      });
      continue;
    }

    if (
      (entry.action === 'TRIGGER_ITEM' ||
        entry.action === 'TRIGGER_ITEMSET' ||
        entry.action === 'TRIGGER_TRAIT') &&
      entry.result.healing !== undefined
    ) {
      backendLog.push({
        turn: entry.turn,
        isPlayer: entry.target === 'player',
        action: LogAction.Heal,
        value: entry.result.healing,
        extra: 0,
        source: entry.result.source,
      });
      continue;
    }

    if (
      (entry.action === 'TRIGGER_ITEM' ||
        entry.action === 'TRIGGER_ITEMSET' ||
        entry.action === 'TRIGGER_TRAIT') &&
      entry.result.armorGained !== undefined
    ) {
      backendLog.push({
        turn: entry.turn,
        isPlayer: entry.target === 'player',
        action: LogAction.ArmorChange,
        value: entry.result.armorGained,
        extra: 0,
        source: entry.result.source,
      });
      continue;
    }

    const atkDelta = parseSignedStatDelta(entry.result.effectName, 'ATK');
    if (atkDelta !== null) {
      backendLog.push({
        turn: entry.turn,
        isPlayer: entry.target === 'player',
        action: LogAction.AtkChange,
        value: atkDelta,
        extra: 0,
        source: entry.result.source,
      });
      continue;
    }

    const spdDelta = parseSignedStatDelta(entry.result.effectName, 'SPD');
    if (spdDelta !== null) {
      backendLog.push({
        turn: entry.turn,
        isPlayer: entry.target === 'player',
        action: LogAction.SpdChange,
        value: spdDelta,
        extra: 0,
        source: entry.result.source,
      });
    }
  }

  return backendLog;
}
