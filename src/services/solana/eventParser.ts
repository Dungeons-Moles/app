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
  LevelCompletedEvent,
  ItemUnlockedEvent,
  ParsedEvent,
  CombatEventParseResult,
  StatusEffect,
} from './types/combat_events';
import { EVENT_NAMES } from './types/combat_events';
import { getItemById, getItemForLevel } from '@/data/items/all-items';
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
  } catch {
    // Decoding failed
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

    default:
      return data;
  }
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
 * Convert an ItemUnlockedEvent to UnlockedItem format for VictoryScreen.
 *
 * @param event - ItemUnlockedEvent from transaction logs
 * @returns UnlockedItem with name, emoji, and stats, or undefined if item not found
 */
export function itemUnlockedEventToUnlockedItem(
  event: ItemUnlockedEvent
): UnlockedItem | undefined {
  const item = getItemById(event.itemIndex);
  if (!item) {
    console.warn('[eventParser] Item not found for index:', event.itemIndex);
    return undefined;
  }

  return {
    name: item.name,
    emoji: item.emoji,
    stats: item.stats,
  };
}

/**
 * Get the item that should be unlocked for a given level completion.
 *
 * @param level - Campaign level that was completed
 * @returns UnlockedItem for the level, or undefined if no item for this level
 */
export function getUnlockedItemForLevel(level: number): UnlockedItem | undefined {
  const item = getItemForLevel(level);
  if (!item) {
    return undefined;
  }

  return {
    name: item.name,
    emoji: item.emoji,
    stats: item.stats,
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
