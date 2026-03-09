/**
 * Event Parser Service
 *
 * Parses combat and gameplay events from Solana transaction logs.
 * Used for combat replay animations and night movement visualization.
 *
 * @see contracts/combat-events.md for event specifications
 */

import { Connection, PublicKey } from '@solana/web3.js';
import type { Program } from '@coral-xyz/anchor';
import type {
  CombatReplay,
  CombatStartedEvent,
  TurnExecutedEvent,
  StatusAppliedEvent,
  CombatEndedEvent,
  BossCombatStartedEvent,
  EnemyMovedEvent,
  PlayerDefeatedEvent,
  PlayerHealedEvent,
  LevelCompletedEvent,
  ItemUnlockedEvent,
  ParsedEvent,
  CombatEventParseResult,
  StatusEffect,
  BackendCombatLogEntry,
} from './types/combat_events';
import {
  EVENT_NAMES,
  LogAction,
} from './types/combat_events';
import { getItemForLevel } from '@/data/items/all-items';
import { getGearDefinition } from '@/data/gear';
import { getToolDefinition } from '@/game/entities/items';
import type { GearId, ToolId } from '@/game/engine/types';
import type { UnlockedItem } from '@/navigation';

// ============================================================================
// Main Event Parser
// ============================================================================

/**
 * Parse combat-related events from a transaction.
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance with event coder
 * @param signature - Transaction signature to parse
 * @returns CombatReplay if combat occurred, null otherwise
 */
export async function parseCombatEvents(
  connection: Connection,
  program: Program,
  signature: string
): Promise<CombatReplay | null> {
  const tx = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  if (!tx?.meta?.logMessages) {
    return null;
  }

  const events = parseEventsFromLogs(program, tx.meta.logMessages);

  const combatStarted = events.find((e) => e.name === EVENT_NAMES.COMBAT_STARTED);
  if (!combatStarted) {
    return null;
  }

  const bossIntro = events.find((e) => e.name === EVENT_NAMES.BOSS_COMBAT_STARTED);
  const combatEnded = events.find((e) => e.name === EVENT_NAMES.COMBAT_ENDED);

  if (!combatEnded) {
    console.warn('[eventParser] Found CombatStarted but no CombatEnded event');
    return null;
  }

  return {
    signature,
    combatStarted: combatStarted.data as CombatStartedEvent,
    turns: events
      .filter((e) => e.name === EVENT_NAMES.TURN_EXECUTED)
      .map((e) => e.data as TurnExecutedEvent),
    statusEffects: events
      .filter((e) => e.name === EVENT_NAMES.STATUS_APPLIED)
      .map((e) => e.data as StatusAppliedEvent),
    combatEnded: combatEnded.data as CombatEndedEvent,
    isBoss: !!bossIntro,
    bossIntro: bossIntro?.data as BossCombatStartedEvent | undefined,
  };
}

/**
 * Parse enemy movement events for night phase animation.
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance with event coder
 * @param signature - Transaction signature to parse
 * @returns Array of enemy movements in order
 */
export async function parseNightMovement(
  connection: Connection,
  program: Program,
  signature: string
): Promise<EnemyMovedEvent[]> {
  const tx = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  if (!tx?.meta?.logMessages) {
    return [];
  }

  const events = parseEventsFromLogs(program, tx.meta.logMessages);

  return events
    .filter((e) => e.name === EVENT_NAMES.ENEMY_MOVED)
    .map((e) => e.data as EnemyMovedEvent);
}

/**
 * Parse all relevant events from a gameplay transaction.
 *
 * @param connection - Solana connection
 * @param program - Anchor program instance with event coder
 * @param signature - Transaction signature to parse
 * @returns Complete parse result with all event types
 */
export async function parseGameplayEvents(
  connection: Connection,
  program: Program,
  signature: string
): Promise<CombatEventParseResult> {
  const tx = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  const result: CombatEventParseResult = {
    combat: null,
    nightMovements: [],
    playerDefeated: null,
    levelCompleted: null,
    itemUnlocked: null,
  };

  if (!tx?.meta?.logMessages) {
    return result;
  }

  const events = parseEventsFromLogs(program, tx.meta.logMessages);

  // Parse combat replay
  const combatStarted = events.find((e) => e.name === EVENT_NAMES.COMBAT_STARTED);
  const combatEnded = events.find((e) => e.name === EVENT_NAMES.COMBAT_ENDED);

  if (combatStarted && combatEnded) {
    const bossIntro = events.find((e) => e.name === EVENT_NAMES.BOSS_COMBAT_STARTED);
    result.combat = {
      signature,
      combatStarted: combatStarted.data as CombatStartedEvent,
      turns: events
        .filter((e) => e.name === EVENT_NAMES.TURN_EXECUTED)
        .map((e) => e.data as TurnExecutedEvent),
      statusEffects: events
        .filter((e) => e.name === EVENT_NAMES.STATUS_APPLIED)
        .map((e) => e.data as StatusAppliedEvent),
      combatEnded: combatEnded.data as CombatEndedEvent,
      isBoss: !!bossIntro,
      bossIntro: bossIntro?.data as BossCombatStartedEvent | undefined,
    };
  }

  // Parse night movements
  result.nightMovements = events
    .filter((e) => e.name === EVENT_NAMES.ENEMY_MOVED)
    .map((e) => e.data as EnemyMovedEvent);

  // Parse player defeated
  const playerDefeated = events.find((e) => e.name === EVENT_NAMES.PLAYER_DEFEATED);
  if (playerDefeated) {
    result.playerDefeated = playerDefeated.data as PlayerDefeatedEvent;
  }

  // Parse level completed
  const levelCompleted = events.find((e) => e.name === EVENT_NAMES.LEVEL_COMPLETED);
  if (levelCompleted) {
    result.levelCompleted = levelCompleted.data as LevelCompletedEvent;
  }

  // Parse item unlocked
  const itemUnlocked = events.find((e) => e.name === EVENT_NAMES.ITEM_UNLOCKED);
  if (itemUnlocked) {
    result.itemUnlocked = itemUnlocked.data as ItemUnlockedEvent;
  }

  return result;
}

// CombatStarted event discriminator from the IDL
const COMBAT_STARTED_DISCRIMINATOR = Buffer.from([172, 94, 187, 254, 85, 115, 217, 37]);

/**
 * Info extracted from the CombatStarted event (enemy archetype + HP for tier derivation).
 */
export interface CombatEnemyInfo {
  /** On-chain archetype index (0-11), maps to EnemyId via ARCHETYPE_TO_ENEMY_ID */
  archetype: number;
  /** Enemy HP at combat start (used to derive tier) */
  hp: number;
}

/**
 * Combined result from parsing a combat transaction.
 * Extracts compact enemy info from CombatStarted.
 */
export interface CombatTransactionInfo {
  enemyInfo: CombatEnemyInfo | null;
}

/**
 * Manually decode CombatStarted event to extract enemy archetype + HP.
 * Binary layout (after 8-byte discriminator):
 *   - player: Pubkey (32 bytes)
 *   - player_hp: i16 LE (2 bytes)
 *   - player_atk: i16 LE (2 bytes)
 *   - enemy_archetype: u8 (1 byte)
 *   - enemy_hp: i16 LE (2 bytes)
 *   - enemy_atk: i16 LE (2 bytes)
 */
function decodeCombatStartedEnemyInfo(data: Buffer): CombatEnemyInfo | null {
  const PUBKEY_LEN = 32;
  // player(32) + player_hp(2) + player_atk(2) + enemy_archetype(1) + enemy_hp(2) + enemy_atk(2) = 41
  if (data.length < PUBKEY_LEN + 2 + 2 + 1 + 2 + 2) return null;

  const archetype = data.readUInt8(PUBKEY_LEN + 2 + 2); // offset 36
  const hp = data.readInt16LE(PUBKEY_LEN + 2 + 2 + 1); // offset 37

  return { archetype, hp };
}

export async function parseCombatLog(
  connection: Connection,
  _program: Program,
  signature: string
): Promise<CombatTransactionInfo> {
  const tx = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  if (!tx) {
    console.warn('[parseCombatLog] getTransaction returned null for', signature.slice(0, 12));
    return { enemyInfo: null };
  }

  if (!tx.meta?.logMessages) {
    console.warn('[parseCombatLog] Transaction has no log messages');
    return { enemyInfo: null };
  }

  let enemyInfo: CombatEnemyInfo | null = null;

  for (const logLine of tx.meta.logMessages) {
    if (!logLine.startsWith('Program data: ')) continue;
    const base64Data = logLine.slice('Program data: '.length);
    try {
      const buf = Buffer.from(base64Data, 'base64');
      if (buf.length >= 8) {
        const disc = Buffer.from(buf.subarray(0, 8));
        const data = Buffer.from(buf.subarray(8));
        if (!enemyInfo && disc.equals(COMBAT_STARTED_DISCRIMINATOR)) {
          enemyInfo = decodeCombatStartedEnemyInfo(data);
          if (enemyInfo) {
            console.log('[parseCombatLog] Extracted enemy info: archetype=', enemyInfo.archetype, 'hp=', enemyInfo.hp);
          }
        }
      }
    } catch (err) {
      console.warn('[parseCombatLog] Manual decode error:', err);
    }
    if (enemyInfo) break;
  }

  return { enemyInfo };
}

/**
 * Parse boss combat data from a move_player transaction that resolved the boss
 * fight inline (Campaign mode, Duel weeks 1-2).
 *
 * When move_player resolves both field enemy combat and boss combat in the same
 * transaction, this extracts the LAST CombatLog and CombatStarted events
 * (boss combat is always resolved after field enemies on-chain).
 */
export async function parseBossCombatFromMoveTx(
  connection: Connection,
  signature: string,
  program?: Program
): Promise<{
  preBossPlayerHp?: number;
  combatEnded?: CombatEndedEvent;
}> {
  const tx = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  if (!tx?.meta?.logMessages) {
    return {};
  }

  let lastPlayerHp: number | undefined;
  let preBossPlayerHpFromHeal: number | undefined;
  let lastCombatEnded: CombatEndedEvent | undefined;
  let bossStartedSeen = false;

  for (const logLine of tx.meta.logMessages) {
    if (!logLine.startsWith('Program data: ')) continue;
    const base64Data = logLine.slice('Program data: '.length);
    try {
      const buf = Buffer.from(base64Data, 'base64');

      // Prefer typed event decoding when program is available so we can
      // recover extra context (PlayerHealed + CombatEnded) in POI-driven boss flows.
      if (program) {
        try {
          const raw = program.coder.events.decode(buf.toString('base64'));
          if (raw) {
            const eventName = raw.name;
            const eventData = convertEventData(
              eventName,
              raw.data as Record<string, unknown>
            );
            if (eventName === EVENT_NAMES.BOSS_COMBAT_STARTED) {
              bossStartedSeen = true;
            } else if (eventName === EVENT_NAMES.PLAYER_HEALED && !bossStartedSeen) {
              const healed = eventData as PlayerHealedEvent;
              preBossPlayerHpFromHeal = healed.newHp;
            } else if (eventName === EVENT_NAMES.COMBAT_ENDED) {
              lastCombatEnded = eventData as CombatEndedEvent;
            }
          }
        } catch {
          // Ignore non-event program-data lines.
        }
      }

      if (buf.length >= 8) {
        const disc = Buffer.from(buf.subarray(0, 8));
        if (disc.equals(COMBAT_STARTED_DISCRIMINATOR)) {
          const PUBKEY_LEN = 32;
          const data = Buffer.from(buf.subarray(8));
          if (data.length >= PUBKEY_LEN + 2) {
            lastPlayerHp = data.readInt16LE(PUBKEY_LEN); // player_hp at offset 32
          }
        }
      }
    } catch {
      // Skip unparseable events
    }
  }

  return {
    preBossPlayerHp: preBossPlayerHpFromHeal ?? lastPlayerHp,
    combatEnded: lastCombatEnded,
  };
}

// ============================================================================
// Low-Level Log Parser
// ============================================================================

/**
 * Parse events from transaction log messages using Anchor's event coder.
 *
 * @param program - Anchor program with coder
 * @param logs - Array of log messages from transaction
 * @returns Array of parsed events
 */
export function parseEventsFromLogs(program: Program, logs: string[]): Array<ParsedEvent> {
  const events: Array<ParsedEvent> = [];

  for (const log of logs) {
    // Anchor events are encoded as "Program data: <base64>"
    if (log.startsWith('Program data: ')) {
      const base64Data = log.replace('Program data: ', '');

      try {
        const buffer = Buffer.from(base64Data, 'base64');
        const event = decodeAnchorEvent(program, buffer);

        if (event) {
          events.push(event);
        }
      } catch {
        // Not an event we care about, or decoding failed
        continue;
      }
    }
  }

  return events;
}

/**
 * Decode an Anchor event from a buffer.
 *
 * @param program - Anchor program with coder
 * @param buffer - Buffer containing event data
 * @returns Parsed event or null
 */
function decodeAnchorEvent(program: Program, buffer: Buffer): ParsedEvent | null {
  try {
    // Try to decode using the program's event coder
    const event = program.coder.events.decode(buffer.toString('base64'));

    if (event) {
      return {
        name: event.name,
        data: convertEventData(event.name, event.data),
      };
    }
  } catch (err) {
    console.warn('[decodeAnchorEvent] Failed to decode event:', err);
  }

  return null;
}

/**
 * Convert raw event data to our typed interfaces.
 */
function convertEventData(name: string, data: Record<string, unknown>): unknown {
  switch (name) {
    case EVENT_NAMES.COMBAT_STARTED:
      return {
        player: data.player as PublicKey,
        playerHp: Number(data.playerHp ?? data.player_hp ?? 0),
        playerAtk: Number(data.playerAtk ?? data.player_atk ?? 0),
        enemyArchetype: Number(data.enemyArchetype ?? data.enemy_archetype ?? 0),
        enemyHp: Number(data.enemyHp ?? data.enemy_hp ?? 0),
        enemyAtk: Number(data.enemyAtk ?? data.enemy_atk ?? 0),
      } as CombatStartedEvent;

    case EVENT_NAMES.TURN_EXECUTED:
      return {
        turn: Number(data.turn ?? 0),
        playerHp: Number(data.playerHp ?? data.player_hp ?? 0),
        enemyHp: Number(data.enemyHp ?? data.enemy_hp ?? 0),
        playerDamage: Number(data.playerDamage ?? data.player_damage ?? 0),
        enemyDamage: Number(data.enemyDamage ?? data.enemy_damage ?? 0),
      } as TurnExecutedEvent;

    case EVENT_NAMES.STATUS_APPLIED:
      return {
        target: Number(data.target ?? 0) === 0 ? 'player' : 'enemy',
        effectType: Number(data.effectType ?? data.effect_type ?? 0) as StatusEffect,
        stacks: Number(data.stacks ?? 0),
      } as StatusAppliedEvent;

    case EVENT_NAMES.COMBAT_ENDED:
      return {
        player: data.player as PublicKey,
        playerWon: Boolean(data.playerWon ?? data.player_won ?? false),
        finalPlayerHp: Number(data.finalPlayerHp ?? data.final_player_hp ?? 0),
        finalEnemyHp: Number(data.finalEnemyHp ?? data.final_enemy_hp ?? 0),
        goldEarned: Number(data.goldEarned ?? data.gold_earned ?? 0),
        turnsTaken: Number(data.turnsTaken ?? data.turns_taken ?? 0),
      } as CombatEndedEvent;

    case EVENT_NAMES.BOSS_COMBAT_STARTED:
      return {
        player: data.player as PublicKey,
        bossId: decodeBossId(data.bossId ?? data.boss_id),
        bossHp: Number(data.bossHp ?? data.boss_hp ?? 0),
        week: Number(data.week ?? 0),
      } as BossCombatStartedEvent;

    case EVENT_NAMES.ENEMY_MOVED:
      return {
        enemyIndex: Number(data.enemyIndex ?? data.enemy_index ?? 0),
        fromX: Number(data.fromX ?? data.from_x ?? 0),
        fromY: Number(data.fromY ?? data.from_y ?? 0),
        toX: Number(data.toX ?? data.to_x ?? 0),
        toY: Number(data.toY ?? data.to_y ?? 0),
      } as EnemyMovedEvent;

    case EVENT_NAMES.PLAYER_DEFEATED:
      return {
        player: data.player as PublicKey,
        killedBy: Number(data.killedBy ?? data.killed_by ?? 0) === 0 ? 'enemy' : 'boss',
        finalHp: Number(data.finalHp ?? data.final_hp ?? 0),
      } as PlayerDefeatedEvent;

    case EVENT_NAMES.LEVEL_COMPLETED:
      return {
        player: data.player as PublicKey,
        level: Number(data.level ?? 0),
        totalMoves: Number(data.totalMoves ?? data.total_moves ?? 0),
        goldEarned: Number(data.goldEarned ?? data.gold_earned ?? 0),
      } as LevelCompletedEvent;

    case EVENT_NAMES.ITEM_UNLOCKED:
      return {
        owner: data.owner as PublicKey,
        itemIndex: Number(data.itemIndex ?? data.item_index ?? 0),
        levelCompleted: Number(data.levelCompleted ?? data.level_completed ?? 0),
        timestamp: Number(data.timestamp ?? 0),
      } as ItemUnlockedEvent;

    case EVENT_NAMES.COMBAT_LOG:
      return {
        player: (data.player as PublicKey)?.toString() ?? '',
        entries: parseCombatLogEntries(data.entries),
      } as { player: string; entries: BackendCombatLogEntry[] };

    default:
      return data;
  }
}

/**
 * Parse combat log entries from raw event data.
 * The entries come as an array of objects from Anchor's event decoder.
 */
function parseCombatLogEntries(entries: unknown): BackendCombatLogEntry[] {
  if (!Array.isArray(entries)) {
    console.warn('[eventParser] CombatLog entries is not an array:', entries);
    return [];
  }

  return entries.map((entry: Record<string, unknown>) => ({
    turn: Number(entry.turn ?? 0),
    isPlayer: Boolean(entry.isPlayer ?? entry.is_player ?? false),
    action: parseLogAction(entry.action),
    value: Number(entry.value ?? 0),
    extra: Number(entry.extra ?? 0),
    source: parseCombatSourceRef(entry.source),
    contributions: parseCombatContributions(entry.contributions),
  }));
}

function parseCombatSourceKind(kind: unknown): 'tool' | 'gear' | 'itemset' | 'enemy' | 'boss' | 'status' {
  if (typeof kind === 'string') {
    const normalized = kind.toLowerCase();
    if (
      normalized === 'tool' ||
      normalized === 'gear' ||
      normalized === 'itemset' ||
      normalized === 'enemy' ||
      normalized === 'boss' ||
      normalized === 'status'
    ) {
      return normalized;
    }
  }

  if (typeof kind === 'object' && kind !== null) {
    const enumKey = Object.keys(kind)[0]?.toLowerCase();
    return parseCombatSourceKind(enumKey);
  }

  switch (Number(kind)) {
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
    default:
      return 'status';
  }
}

function parseCombatSourceId(id: unknown): string {
  if (typeof id === 'string') return id.replace(/\0+$/g, '').trim();
  if (Array.isArray(id) || id instanceof Uint8Array) {
    const bytes = Array.from(id as number[] | Uint8Array);
    return String.fromCharCode(...bytes).replace(/\0+$/g, '').trim();
  }
  return '';
}

function parseCombatSourceRef(source: unknown): BackendCombatLogEntry['source'] {
  if (!source || typeof source !== 'object') return undefined;
  const raw = source as Record<string, unknown>;
  const id = parseCombatSourceId(raw.id);
  return {
    kind: parseCombatSourceKind(raw.kind),
    id,
    name: id || undefined,
  };
}

function parseCombatContributions(
  contributions: unknown
): BackendCombatLogEntry['contributions'] {
  if (!Array.isArray(contributions) || contributions.length === 0) return undefined;
  return contributions
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const raw = entry as Record<string, unknown>;
      const source = parseCombatSourceRef(raw.source);
      if (!source) return null;
      return {
        source,
        value: Number(raw.value ?? 0),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

/**
 * Parse LogAction from Anchor's decoded enum format.
 * Anchor decodes enums as objects like { attack: {} } or { heal: {} }
 */
function parseLogAction(action: unknown): LogAction {
  if (typeof action === 'number') {
    return action as LogAction;
  }

  if (typeof action === 'object' && action !== null) {
    const keys = Object.keys(action);
    if (keys.length > 0) {
      const actionName = keys[0].toLowerCase();
      switch (actionName) {
        case 'attack':
          return LogAction.Attack;
        case 'heal':
          return LogAction.Heal;
        case 'applystatus':
          return LogAction.ApplyStatus;
        case 'statusdamage':
          return LogAction.StatusDamage;
        case 'armorchange':
          return LogAction.ArmorChange;
        case 'atkchange':
          return LogAction.AtkChange;
        case 'spdchange':
          return LogAction.SpdChange;
        case 'nonweapondamage':
          return LogAction.NonWeaponDamage;
        case 'shrapnelretaliation':
          return LogAction.ShrapnelRetaliation;
        case 'goldstolen':
          return LogAction.GoldStolen;
        default:
          console.warn('[eventParser] Unknown LogAction:', actionName);
          return LogAction.Attack;
      }
    }
  }

  console.warn('[eventParser] Could not parse LogAction:', action);
  return LogAction.Attack;
}

/**
 * Decode boss ID from bytes to string.
 */
function decodeBossId(bossId: unknown): string {
  if (typeof bossId === 'string') {
    return bossId;
  }

  if (Array.isArray(bossId) || bossId instanceof Uint8Array) {
    // Convert byte array to string, trimming null bytes
    const bytes = Array.from(bossId as number[] | Uint8Array);
    return String.fromCharCode(...bytes.filter((b) => b !== 0));
  }

  return 'UNKNOWN';
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a transaction contains combat events.
 *
 * @param connection - Solana connection
 * @param signature - Transaction signature
 * @returns true if combat events are present
 */
export async function hasCombatEvents(connection: Connection, signature: string): Promise<boolean> {
  const tx = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  if (!tx?.meta?.logMessages) {
    return false;
  }

  // Quick check for combat event in logs
  return tx.meta.logMessages.some(
    (log) => log.includes('CombatStarted') || log.includes('BossCombatStarted')
  );
}

/**
 * Check if a transaction contains night movement events.
 *
 * @param connection - Solana connection
 * @param signature - Transaction signature
 * @returns true if enemy movement events are present
 */
export async function hasNightMovementEvents(
  connection: Connection,
  signature: string
): Promise<boolean> {
  const tx = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  if (!tx?.meta?.logMessages) {
    return false;
  }

  return tx.meta.logMessages.some((log) => log.includes('EnemyMoved'));
}

// ============================================================================
// Victory Event Conversion (T056)
// ============================================================================

/**
 * Look up gear/tool definition by pool index and return UnlockedItem data.
 * Pool indices 0-63 map to gear I1-I64, indices 64-79 map to tools T1-T16.
 */
function poolIndexToUnlockedItem(index: number): UnlockedItem | undefined {
  if (index >= 0 && index <= 63) {
    const gearId = `I${index + 1}` as GearId;
    try {
      const def = getGearDefinition(gearId);
      if (!def) return undefined;
      return { name: def.name, emoji: def.emoji, image: def.image, stats: def.stats };
    } catch {
      return undefined;
    }
  }
  if (index >= 64 && index <= 79) {
    const toolId = `T${index - 63}` as ToolId;
    try {
      const def = getToolDefinition(toolId);
      if (!def) return undefined;
      return { name: def.name, emoji: def.emoji, image: def.image, stats: def.stats };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Convert an ItemUnlockedEvent to UnlockedItem format for VictoryScreen.
 * Uses gear/tool definitions directly from the pool index.
 *
 * @param event - ItemUnlockedEvent from transaction logs
 * @returns UnlockedItem with name, emoji, image, and stats, or undefined if item not found
 */
export function itemUnlockedEventToUnlockedItem(
  event: ItemUnlockedEvent
): UnlockedItem | undefined {
  const result = poolIndexToUnlockedItem(event.itemIndex);
  if (!result) {
    console.warn('[eventParser] Item not found for pool index:', event.itemIndex);
  }
  return result;
}

/**
 * Get the item that should be unlocked for a given level completion.
 * Uses the legacy all-items level mapping to find the pool index,
 * then looks up display data from gear/tool definitions.
 *
 * @param level - Campaign level that was completed
 * @returns UnlockedItem for the level, or undefined if no item for this level
 */
export function getUnlockedItemForLevel(level: number): UnlockedItem | undefined {
  // all-items.ts provides the level → pool index mapping
  const legacyItem = getItemForLevel(level);
  if (!legacyItem) {
    return undefined;
  }
  // Look up the actual gear/tool definition for display data
  return poolIndexToUnlockedItem(legacyItem.id) ?? {
    name: legacyItem.name,
    emoji: legacyItem.emoji,
    stats: legacyItem.stats,
  };
}

/**
 * Extract victory data from gameplay events parse result.
 *
 * @param result - CombatEventParseResult from parseGameplayEvents
 * @returns Object with levelUnlocked and itemUnlocked data
 */
export function extractVictoryData(result: CombatEventParseResult): {
  levelUnlocked: number | undefined;
  itemUnlocked: UnlockedItem | undefined;
  totalMoves: number | undefined;
  goldEarned: number | undefined;
} {
  let levelUnlocked: number | undefined;
  let itemUnlocked: UnlockedItem | undefined;
  let totalMoves: number | undefined;
  let goldEarned: number | undefined;

  if (result.levelCompleted) {
    levelUnlocked = result.levelCompleted.level + 1; // Completing level N unlocks level N+1
    totalMoves = result.levelCompleted.totalMoves;
    goldEarned = result.levelCompleted.goldEarned;
  }

  if (result.itemUnlocked) {
    itemUnlocked = itemUnlockedEventToUnlockedItem(result.itemUnlocked);
  }

  return { levelUnlocked, itemUnlocked, totalMoves, goldEarned };
}
