/**
 * T054: CombatContext provider
 * Manages combat state and provides combat-specific actions
 * @see specs/001-pve-dungeon-crawler/spec.md User Story 2
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useMemo,
  useState,
  ReactNode,
  Dispatch,
} from 'react';
import type {
  CombatState,
  CombatantState,
  CombatLogEntry,
  CombatResult,
  CombatSourceRef,
} from '../game/engine/types';
import { CombatPhase } from '../game/engine/types';
import {
  resolveCombat,
  createCombatState,
  type CombatResolverInput,
} from '../game/combat/resolver';
import { resolveCombatWithParity } from '../game/combat/parity-resolver';
import type { CombatSpeed } from '../types';
import type { BackendCombatLogEntry } from '../services/solana/types/combat_events';
import {
  convertBackendLogToFrontend,
} from '../services/solana/types/combat_events';

export type { CombatSpeed } from '../types';

// ============================================================================
// Combat Speed
// ============================================================================

export const COMBAT_ANIMATION_BASE_MS = 500;

export const COMBAT_SPEED_MULTIPLIER: Record<CombatSpeed, number> = {
  paused: 0,
  normal: 1,
  fast: 2,
};

const FLOATING_NUMBER_FADE_DELAY_MS = 600;
const FLOATING_NUMBER_FADE_MS = 400;
const CONTRIBUTION_STAGGER_MS = 1000;
const INITIAL_COMBAT_START_DELAY_MS = 1000;
const POST_STATUS_APPLY_BUFFER_MS = 220;

const DEFAULT_COMBAT_SPEED: CombatSpeed = 'normal';

export function getCombatAnimationIntervalMs(speed: CombatSpeed): number | null {
  if (speed === 'paused') {
    return null;
  }

  return COMBAT_ANIMATION_BASE_MS / COMBAT_SPEED_MULTIPLIER[speed];
}

function entryHasFloatingNumber(entry: CombatLogEntry | undefined): boolean {
  if (!entry || entry.target === 'none') return false;
  const { result } = entry;

  return Boolean(
    (entry.action === 'APPLY_STATUS' && result.statusApplied) ||
      (result.damage && result.damage > 0) ||
      (result.healing && result.healing > 0) ||
      (result.armorGained && result.armorGained > 0) ||
      (result.armorLost && result.armorLost > 0) ||
      (result.goldStolen && result.goldStolen > 0) ||
      (result.atkBonus && result.atkBonus > 0) ||
      (result.spdBonus && result.spdBonus > 0)
  );
}

function entryIsStatusRemovalOnly(entry: CombatLogEntry | undefined): boolean {
  if (!entry || entry.target === 'none') return false;
  const { result } = entry;

  return Boolean(
    result.statusRemoved &&
      !result.damage &&
      !result.healing &&
      !result.armorLost &&
      !result.armorGained &&
      !result.goldStolen &&
      !result.atkBonus &&
      !result.spdBonus &&
      !result.statusApplied
  );
}

// ============================================================================
// Combat Actions
// ============================================================================

export type CombatAction =
  | { type: 'START_COMBAT'; input: CombatResolverInput }
  | {
      type: 'START_COMBAT_WITH_LOG';
      input: CombatResolverInput;
      backendLog: BackendCombatLogEntry[];
      /** Authoritative on-chain result to override log-derived result */
      onChainResult?: 'VICTORY' | 'DEFEAT';
    }
  | {
      type: 'START_COMBAT_WITH_ONCHAIN_OUTCOME';
      input: CombatResolverInput;
      outcome: {
        finalPlayerHp: number;
        playerWon: boolean;
        finalEnemyHp?: number;
      };
    }
  | { type: 'RESOLVE_COMBAT' }
  | { type: 'ADVANCE_LOG'; index: number }
  | { type: 'ADVANCE_CONTRIBUTION' }
  | { type: 'COMPLETE_ANIMATION' }
  | { type: 'RESET_COMBAT' };

// ============================================================================
// Combat UI State (extends CombatState for UI needs)
// ============================================================================

export interface CombatUIState {
  /** Base combat state before playback */
  combat: CombatState | null;
  /** The resolved combat state (for playback) */
  resolvedCombat: CombatState | null;
  /** Current log playback index */
  currentLogIndex: number;
  /** Current contribution index inside the active log entry, if split */
  currentContributionIndex: number | null;
  /** Is combat animation in progress */
  isAnimating: boolean;
  /** Is combat complete */
  isComplete: boolean;
  /** Damage numbers to display */
  damageNumbers: DamageNumber[];
  /** Effect notifications to display (item triggers, status effects, etc.) */
  effectNotifications: EffectNotification[];
  /** Whether replay should stop at the first terminal log entry */
  respectTerminalLogIndex: boolean;
}

export interface DamageNumber {
  id: string;
  value: number;
  type: 'damage' | 'heal' | 'armor' | 'gold' | 'split' | 'status' | 'stat';
  target: 'player' | 'enemy';
  timestamp: number;
  source?: CombatSourceRef;
  lane?: number;
  splitArmorValue?: number;
  splitDamageValue?: number;
  statusType?: 'chill' | 'shrapnel' | 'rust' | 'bleed';
  statType?: 'ATK' | 'SPD' | 'ARM';
}

export interface EffectNotification {
  id: string;
  /** The effect text to display (e.g., "+2 ATK", "+1 Chill") */
  text: string;
  /** Emoji to show with the effect */
  emoji: string;
  /** Which combatant this effect applies to */
  target: 'player' | 'enemy';
  /** Type of effect for styling */
  type: 'buff' | 'debuff' | 'status' | 'item';
  timestamp: number;
  source?: CombatSourceRef;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: CombatUIState = {
  combat: null,
  resolvedCombat: null,
  currentLogIndex: -1,
  currentContributionIndex: null,
  isAnimating: false,
  isComplete: false,
  damageNumbers: [],
  effectNotifications: [],
  respectTerminalLogIndex: false,
};

// ============================================================================
// Effect Notification Helpers
// ============================================================================

const STATUS_EMOJI: Record<string, string> = {
  chill: '❄️',
  shrapnel: '💥',
  rust: '🦠',
};

/**
 * Extract effect notification from a combat log entry
 */
function extractEffectNotification(
  entry: CombatLogEntry,
  index: number
): EffectNotification | null {
  if (!entry || entry.target === 'none') return null;

  const timestamp = Date.now();
  const target = entry.target as 'player' | 'enemy';

  // Status effect applied
  if (entry.action === 'APPLY_STATUS' && entry.result.statusApplied) {
    return null;
  }

  // Item triggered (with effect name)
  if (entry.action === 'TRIGGER_ITEM' && entry.result.effectName) {
    return null;
  }

  // Armor gained from item effect
  if (entry.action === 'GAIN_ARMOR' && entry.result.effectName && entry.result.armorGained) {
    return null;
  }

  // Trait triggered
  if (entry.action === 'TRIGGER_TRAIT' && entry.result.effectName) {
    if (entry.result.goldStolen) return null;
    if (entry.result.atkBonus || entry.result.spdBonus) return null;
    if (entry.result.source?.kind === 'status') return null;
    return {
      id: `trait-${index}-${timestamp}`,
      text: entry.result.effectName,
      emoji: '⚡',
      target,
      type: entry.actor === 'enemy' ? 'debuff' : 'buff',
      timestamp,
      source: entry.result.source,
    };
  }

  // Healing from item
  if (entry.action === 'HEAL' && entry.result.effectName && entry.result.healing) {
    return null;
  }

  return null;
}

// ============================================================================
// Combat Result Derivation
// ============================================================================

/**
 * Derive combat result from a combat log by replaying all entries against
 * initial combatant HP. Used for backend-log combats where the result
 * is not provided explicitly.
 */
function deriveCombatResultFromLog(combat: CombatState, log: CombatLogEntry[]): CombatResult {
  let playerHp = combat.player.hp;
  let playerMaxHp = combat.player.maxHp;
  let enemyHp = combat.enemy.hp;
  let enemyMaxHp = combat.enemy.maxHp;

  for (const entry of log) {
    if (entry.target === 'none') continue;

    const isPlayer = entry.target === 'player';
    const targetHp = isPlayer ? playerHp : enemyHp;
    const targetMaxHp = isPlayer ? playerMaxHp : enemyMaxHp;
    const { result } = entry;

    let newHp = targetHp;
    let newMaxHp = targetMaxHp;

    if (result.damage && result.damage > 0) {
      newHp = Math.max(0, newHp - result.damage);
    }

    if (result.healing && result.healing > 0) {
      if (result.effectName === 'Crystal Crown') {
        newMaxHp += result.healing;
        newHp += result.healing;
      } else {
        newHp = Math.min(newMaxHp, newHp + result.healing);
      }
    }

    if (isPlayer) {
      playerHp = newHp;
      playerMaxHp = newMaxHp;
    } else {
      enemyHp = newHp;
      enemyMaxHp = newMaxHp;
    }
  }

  return enemyHp <= 0 ? 'VICTORY' : playerHp <= 0 ? 'DEFEAT' : 'VICTORY';
}

/**
 * Find the first log index where either combatant reaches 0 HP.
 * Returns null if no lethal entry is found.
 */
function deriveTerminalLogIndex(combat: CombatState, log: CombatLogEntry[]): number | null {
  const player = {
    hp: combat.player.hp,
    maxHp: combat.player.maxHp,
  };
  const enemy = {
    hp: combat.enemy.hp,
    maxHp: combat.enemy.maxHp,
  };

  for (let index = 0; index < log.length; index += 1) {
    const entry = log[index];
    if (!entry || entry.target === 'none') continue;

    const target = entry.target === 'player' ? player : enemy;
    const { result } = entry;

    if (result.damage && result.damage > 0) {
      target.hp = Math.max(0, target.hp - result.damage);
    }

    if (result.healing && result.healing > 0) {
      if (result.effectName === 'Crystal Crown') {
        target.maxHp += result.healing;
        target.hp += result.healing;
      } else {
        target.hp = Math.min(target.maxHp, target.hp + result.healing);
      }
    }

    if (player.hp <= 0 || enemy.hp <= 0) {
      return index;
    }
  }

  return null;
}

function expandAttackContributions(
  entry: CombatLogEntry,
  logIndex: number
): DamageNumber[] {
  if (
    entry.action !== 'ATTACK' ||
    entry.target === 'none' ||
    !entry.result.contributions?.length
  ) {
    return [];
  }

  let remainingArmor = entry.result.armorLost ?? 0;
  let remainingDamage = entry.result.damage ?? 0;
  const timestamp = Date.now();
  const numbers: DamageNumber[] = [];
  const target = entry.target as 'player' | 'enemy';

  entry.result.contributions.forEach((contribution, contributionIndex) => {
    let contributionValue = contribution.value;
    if (contributionValue <= 0) return;

    const armorPart = Math.min(contributionValue, remainingArmor);
    if (armorPart > 0) {
      numbers.push({
        id: `arm-${logIndex}-${contributionIndex}-${timestamp}`,
        value: armorPart,
        type: 'armor',
        target,
        timestamp,
        source: contribution.source,
        lane: contributionIndex,
      });
      remainingArmor -= armorPart;
      contributionValue -= armorPart;
    }

    const damagePart = Math.min(contributionValue, remainingDamage);
    if (damagePart > 0) {
      numbers.push({
        id: `dmg-${logIndex}-${contributionIndex}-${timestamp}`,
        value: damagePart,
        type: 'damage',
        target,
        timestamp,
        source: contribution.source,
        lane: contributionIndex,
      });
      remainingDamage -= damagePart;
    }
  });

  if (numbers.length === 0) {
    if ((entry.result.damage ?? 0) > 0) {
      numbers.push({
        id: `dmg-${logIndex}-${timestamp}`,
        value: entry.result.damage ?? 0,
        type: 'damage',
        target,
        timestamp,
        source: entry.result.source,
      });
    }
    if ((entry.result.armorLost ?? 0) > 0) {
      numbers.push({
        id: `arm-${logIndex}-${timestamp}`,
        value: entry.result.armorLost ?? 0,
        type: 'armor',
        target,
        timestamp,
        source: entry.result.source,
      });
    }
  }

  return numbers;
}

function createContributionDamageNumber(
  entry: CombatLogEntry,
  logIndex: number,
  contributionIndex: number
): DamageNumber[] {
  if (
    entry.action !== 'ATTACK' ||
    entry.target === 'none' ||
    !entry.result.contributions?.length ||
    contributionIndex < 0 ||
    contributionIndex >= entry.result.contributions.length
  ) {
    return [];
  }

  const target = entry.target as 'player' | 'enemy';
  const timestamp = Date.now();
  const contribution = entry.result.contributions[contributionIndex];
  let remainingArmor = entry.result.armorLost ?? 0;
  let remainingDamage = entry.result.damage ?? 0;

  for (let i = 0; i < contributionIndex; i += 1) {
    const priorValue = entry.result.contributions[i]?.value ?? 0;
    const priorArmor = Math.min(priorValue, remainingArmor);
    remainingArmor -= priorArmor;
    remainingDamage -= Math.min(priorValue - priorArmor, remainingDamage);
  }

  let contributionValue = contribution.value;
  const armorPart = Math.min(contributionValue, remainingArmor);
  contributionValue -= armorPart;

  const damagePart = Math.min(contributionValue, remainingDamage);
  if (armorPart > 0 && damagePart > 0) {
    return [
      {
        id: `split-${logIndex}-${contributionIndex}-${timestamp}`,
        value: armorPart + damagePart,
        type: 'split',
        target,
        timestamp,
        source: contribution.source,
        splitArmorValue: armorPart,
        splitDamageValue: damagePart,
      },
    ];
  }

  if (armorPart > 0) {
    return [
      {
        id: `arm-${logIndex}-${contributionIndex}-${timestamp}`,
        value: armorPart,
        type: 'armor',
        target,
        timestamp,
        source: contribution.source,
      },
    ];
  }

  if (damagePart > 0) {
    return [
      {
        id: `dmg-${logIndex}-${contributionIndex}-${timestamp}`,
        value: damagePart,
        type: 'damage',
        target,
        timestamp,
        source: contribution.source,
      },
    ];
  }

  return [];
}

function appendFloatingNumbersForEntry(
  damageNumbers: DamageNumber[],
  entry: CombatLogEntry | undefined,
  logIndex: number
) {
  if (!entry) return;

  if (entry.result.contributions?.length) {
    damageNumbers.push(...createContributionDamageNumber(entry, logIndex, 0));
  } else {
    if (entry.result.damage && entry.target !== 'none') {
      damageNumbers.push({
        id: `dmg-${logIndex}-${Date.now()}`,
        value: entry.result.damage,
        type: 'damage',
        target: entry.target,
        timestamp: Date.now(),
        source: entry.result.source,
      });
    }

    if (entry.result.armorLost && entry.target !== 'none') {
      damageNumbers.push({
        id: `arm-${logIndex}-${Date.now()}`,
        value: entry.result.armorLost,
        type: 'armor',
        target: entry.target,
        timestamp: Date.now(),
        source: entry.result.source,
      });
    }
  }

  if (entry.result.healing && entry.target !== 'none') {
    damageNumbers.push({
      id: `heal-${logIndex}-${Date.now()}`,
      value: entry.result.healing,
      type: 'heal',
      target: entry.target,
      timestamp: Date.now(),
      source: entry.result.source,
    });
  }

  if (entry.result.armorGained && entry.target !== 'none') {
    damageNumbers.push({
      id: `armg-${logIndex}-${Date.now()}`,
      value: entry.result.armorGained,
      type: 'stat',
      statType: 'ARM',
      target: entry.target,
      timestamp: Date.now(),
      source: entry.result.source,
    });
  }

  if (entry.result.atkBonus && entry.target !== 'none') {
    damageNumbers.push({
      id: `atk-${logIndex}-${Date.now()}`,
      value: entry.result.atkBonus,
      type: 'stat',
      statType: 'ATK',
      target: entry.target,
      timestamp: Date.now(),
      source: entry.result.source,
    });
  }

  if (entry.result.spdBonus && entry.target !== 'none') {
    damageNumbers.push({
      id: `spd-${logIndex}-${Date.now()}`,
      value: entry.result.spdBonus,
      type: 'stat',
      statType: 'SPD',
      target: entry.target,
      timestamp: Date.now(),
      source: entry.result.source,
    });
  }

  if (entry.action === 'APPLY_STATUS' && entry.result.statusApplied && entry.target !== 'none') {
    const rawStatusType = entry.result.statusApplied.type;
    const statusType =
      rawStatusType === 'reflection' ? undefined : (rawStatusType as DamageNumber['statusType']);
    if (statusType) {
      damageNumbers.push({
        id: `status-${logIndex}-${Date.now()}`,
        value: entry.result.statusApplied.stacks,
        type: 'status',
        target: entry.target,
        timestamp: Date.now(),
        source: entry.result.source,
        statusType,
      });
    }
  }

  if (entry.result.goldStolen && entry.result.goldStolen > 0) {
    damageNumbers.push({
      id: `gold-${logIndex}-${Date.now()}`,
      value: entry.result.goldStolen,
      type: 'gold',
      target: entry.target === 'none' ? 'player' : entry.target,
      timestamp: Date.now(),
      source: entry.result.source,
    });
  }
}

function getSimultaneousPairIndex(log: CombatLogEntry[], index: number): number | null {
  const entry = log[index];
  const nextEntry = log[index + 1];
  if (!entry || !nextEntry) return null;
  if (!entryHasFloatingNumber(entry) || !entryHasFloatingNumber(nextEntry)) return null;
  if (entry.action === 'ATTACK' || nextEntry.action === 'ATTACK') return null;
  if (entry.result.contributions?.length || nextEntry.result.contributions?.length) return null;
  if (entry.turn !== nextEntry.turn || entry.timing !== nextEntry.timing || entry.actor !== nextEntry.actor) {
    return null;
  }
  if (entry.target === nextEntry.target || entry.target === 'none' || nextEntry.target === 'none') return null;

  const source = entry.result.source;
  const nextSource = nextEntry.result.source;
  if (!source || !nextSource) return null;
  if (source.kind !== nextSource.kind || source.id !== nextSource.id) return null;

  return index + 1;
}

function getAttackProgressThroughContribution(
  entry: CombatLogEntry,
  contributionIndex?: number | null
): { armorLost: number; damage: number } {
  if (entry.action !== 'ATTACK' || !entry.result.contributions?.length) {
    return {
      armorLost: entry.result.armorLost ?? 0,
      damage: entry.result.damage ?? 0,
    };
  }

  if (contributionIndex === undefined) {
    return {
      armorLost: entry.result.armorLost ?? 0,
      damage: entry.result.damage ?? 0,
    };
  }

  if (contributionIndex === null || contributionIndex < 0) {
    return { armorLost: 0, damage: 0 };
  }

  let remainingArmor = entry.result.armorLost ?? 0;
  let remainingDamage = entry.result.damage ?? 0;
  let appliedArmor = 0;
  let appliedDamage = 0;

  for (
    let index = 0;
    index <= contributionIndex && index < entry.result.contributions.length;
    index += 1
  ) {
    let contributionValue = entry.result.contributions[index]?.value ?? 0;
    if (contributionValue <= 0) continue;

    const armorPart = Math.min(contributionValue, remainingArmor);
    appliedArmor += armorPart;
    remainingArmor -= armorPart;
    contributionValue -= armorPart;

    const damagePart = Math.min(contributionValue, remainingDamage);
    appliedDamage += damagePart;
    remainingDamage -= damagePart;
  }

  return {
    armorLost: appliedArmor,
    damage: appliedDamage,
  };
}

function isFinalAttackEntryForActorPhase(
  log: CombatLogEntry[] | undefined,
  currentIndex: number
): boolean {
  if (!log) return true;
  const entry = log[currentIndex];
  if (!entry || entry.action !== 'ATTACK') return false;

  for (let index = currentIndex + 1; index < log.length; index += 1) {
    const nextEntry = log[index];
    if (!nextEntry) break;
    if (nextEntry.turn !== entry.turn || nextEntry.timing !== entry.timing || nextEntry.actor !== entry.actor) {
      break;
    }
    if (nextEntry.action === 'ATTACK') {
      return false;
    }
  }

  return true;
}

function applyLogEntryToCombatants(
  entry: CombatLogEntry,
  log: CombatLogEntry[] | undefined,
  entryIndex: number,
  player: CombatantState,
  enemy: CombatantState,
  gold: { player: number; enemy: number },
  contributionIndex?: number | null
) {
  if (!entry || entry.target === 'none') return;

  const target = entry.target === 'player' ? player : enemy;
  const { result } = entry;
  const attackProgress =
    entry.action === 'ATTACK'
      ? getAttackProgressThroughContribution(entry, contributionIndex)
      : {
          armorLost: result.armorLost ?? 0,
          damage: result.damage ?? 0,
        };

  if (attackProgress.armorLost > 0) {
    target.arm = Math.max(0, target.arm - attackProgress.armorLost);
  }

  if (attackProgress.damage > 0) {
    target.hp = Math.max(0, target.hp - attackProgress.damage);
  }

  if (result.armorGained && result.armorGained > 0) {
    target.arm += result.armorGained;
  }

  if (result.atkBonus && result.atkBonus > 0) {
    target.atk += result.atkBonus;
  }

  if (result.spdBonus && result.spdBonus > 0) {
    target.spd += result.spdBonus;
  }

  if (result.healing && result.healing > 0) {
    if (result.effectName === 'Crystal Crown') {
      target.maxHp += result.healing;
      target.hp += result.healing;
    } else {
      target.hp = Math.min(target.maxHp, target.hp + result.healing);
    }
  }

  if (result.statusApplied) {
    const { type, stacks } = result.statusApplied;
    target.statusEffects = {
      ...target.statusEffects,
      [type]: Math.max(0, (target.statusEffects[type] ?? 0) + stacks),
    };
  }

  if (result.statusRemoved) {
    const { type, stacks } = result.statusRemoved;
    if (type !== 'bleed') {
      target.statusEffects = {
        ...target.statusEffects,
        [type]: Math.max(0, (target.statusEffects[type] ?? 0) - stacks),
      };
    }
  }

  const actorCombatant =
    entry.actor === 'player' ? player : entry.actor === 'enemy' ? enemy : null;
  const targetCombatant =
    entry.target === 'player' ? player : entry.target === 'enemy' ? enemy : null;

  if (actorCombatant && result.source?.kind === 'status') {
    if (result.source.id === 'shrapnel' && (result.damage ?? 0) > 0) {
      actorCombatant.statusEffects = {
        ...actorCombatant.statusEffects,
        shrapnel: 0,
      };
    }
  }

  if (targetCombatant && result.source?.kind === 'status') {
    if (result.source.id === 'bleed' && (result.damage ?? 0) > 0) {
      targetCombatant.statusEffects = {
        ...targetCombatant.statusEffects,
        bleed: Math.max(0, targetCombatant.statusEffects.bleed - 1),
      };
    }
  }

  if (
    actorCombatant &&
    entry.action === 'ATTACK' &&
    isFinalAttackEntryForActorPhase(log, entryIndex)
  ) {
    actorCombatant.statusEffects = {
      ...actorCombatant.statusEffects,
      chill: Math.max(0, actorCombatant.statusEffects.chill - 1),
    };
  }

  if (result.goldStolen && result.goldStolen > 0) {
    if (entry.actor === 'player') {
      gold.enemy = Math.max(0, gold.enemy - result.goldStolen);
      gold.player += result.goldStolen;
    } else if (entry.actor === 'enemy') {
      gold.player = Math.max(0, gold.player - result.goldStolen);
      gold.enemy += result.goldStolen;
    } else if (entry.target === 'player') {
      gold.player = Math.max(0, gold.player - result.goldStolen);
      gold.enemy += result.goldStolen;
    } else if (entry.target === 'enemy') {
      gold.enemy = Math.max(0, gold.enemy - result.goldStolen);
      gold.player += result.goldStolen;
    }
  }
}

// ============================================================================
// Reducer
// ============================================================================

function combatReducer(state: CombatUIState, action: CombatAction): CombatUIState {
  switch (action.type) {
    case 'START_COMBAT': {
      const localCombat = action.input.useParityResolver
        ? resolveCombatWithParity(action.input)
        : resolveCombat(action.input);
      const baseCombat = createCombatState(action.input);
      const resolvedCombat = {
        ...baseCombat,
        player: localCombat.player,
        enemy: localCombat.enemy,
        log: localCombat.log,
        result: localCombat.result,
        turn: localCombat.log.reduce((max, entry) => Math.max(max, entry.turn), 0),
        playerGold: localCombat.playerGold,
        enemyGold: localCombat.enemyGold,
        goldReward: localCombat.goldReward,
      };

      console.log('[CombatContext] START_COMBAT:', {
        localLogEntries: localCombat.log.length,
        replayLogEntries: resolvedCombat.log.length,
        result: resolvedCombat.result,
        playerHp: action.input.player.hp,
        enemyHp: action.input.enemy.hp,
        bossId: action.input.bossId,
      });

      return {
        ...state,
        combat: baseCombat,
        resolvedCombat,
        currentLogIndex: -1,
        currentContributionIndex: null,
        isAnimating: true,
        isComplete: false,
        damageNumbers: [],
        effectNotifications: [],
        respectTerminalLogIndex: false,
      };
    }

    case 'START_COMBAT_WITH_LOG': {
      // Use backend log instead of local resolver
      // This ensures frontend animation matches on-chain combat exactly
      const baseCombat = createCombatState(action.input);

      const convertedLog = convertBackendLogToFrontend(action.backendLog, action.input);
      const typedLog = convertedLog as unknown as CombatLogEntry[];

      // If backend log is too short to produce a meaningful animation (< 3 entries),
      // fall back to the local resolver so the player sees turn-by-turn combat.
      // This handles cases where the on-chain combat log was truncated or incomplete.
      if (typedLog.length < 3) {
        console.warn('[CombatContext] Backend log too short, falling back to local resolver:', {
          backendEntries: action.backendLog.length,
          convertedEntries: typedLog.length,
          playerHp: action.input.player.hp,
          bossId: action.input.bossId,
        });
        const localCombat = action.input.useParityResolver
          ? resolveCombatWithParity(action.input)
          : resolveCombat(action.input);
        console.log('[CombatContext] Local resolver produced log with', localCombat.log.length, 'entries');
        return {
          ...state,
          combat: createCombatState(action.input),
          resolvedCombat: localCombat,
          currentLogIndex: -1,
          currentContributionIndex: null,
          isAnimating: true,
          isComplete: false,
          damageNumbers: [],
          effectNotifications: [],
        };
      }

      // Derive the combat result by replaying the log against initial HP
      const derivedResult = deriveCombatResultFromLog(baseCombat, typedLog);
      // Use authoritative on-chain result when available, fall back to derived
      const finalResult = action.onChainResult ?? derivedResult;

      // Derive the turn count from the log (max turn value across all entries)
      const maxTurn = typedLog.reduce((max, entry) => Math.max(max, entry.turn), 0);

      // Create a resolved combat state with the backend log
      // We still need the combat state structure for the animation system
      const resolvedCombat = {
        ...baseCombat,
        log: typedLog,
        result: finalResult,
        turn: maxTurn,
      };

      console.log('[CombatContext] Using backend combat log:', {
        entryCount: action.backendLog.length,
        convertedCount: convertedLog.length,
        derivedResult,
        onChainResult: action.onChainResult,
        finalResult,
      });

      return {
        ...state,
        combat: baseCombat,
        resolvedCombat,
        currentLogIndex: -1,
        currentContributionIndex: null,
        isAnimating: true,
        isComplete: false,
        damageNumbers: [],
        effectNotifications: [],
        respectTerminalLogIndex: true,
      };
    }

    case 'START_COMBAT_WITH_ONCHAIN_OUTCOME': {
      // On-chain fallback path when CombatLog event is unavailable.
      // Run local resolver for the combat animation log, but override
      // the result with the authoritative on-chain outcome.
      const baseCombat = createCombatState(action.input);
      const localCombat = action.input.useParityResolver
        ? resolveCombatWithParity(action.input)
        : resolveCombat(action.input);
      const onChainResult = action.outcome.playerWon
        ? ('VICTORY' as const)
        : ('DEFEAT' as const);

      const resolvedCombat = {
        ...localCombat,
        result: onChainResult,
      };

      console.log('[CombatContext] START_COMBAT_WITH_ONCHAIN_OUTCOME:', {
        logEntries: localCombat.log.length,
        localResult: localCombat.result,
        onChainResult,
        playerHp: action.input.player.hp,
        enemyHp: action.input.enemy.hp,
        bossId: action.input.bossId,
      });

      return {
        ...state,
        combat: baseCombat,
        resolvedCombat,
        currentLogIndex: -1,
        currentContributionIndex: null,
        isAnimating: true,
        isComplete: false,
        damageNumbers: [],
        effectNotifications: [],
        respectTerminalLogIndex: false,
      };
    }

    case 'RESOLVE_COMBAT': {
      if (!state.resolvedCombat) return state;

      return {
        ...state,
        isAnimating: false,
        isComplete: true,
      };
    }

    case 'ADVANCE_LOG': {
      if (!state.resolvedCombat) return state;

      const newIndex = Math.min(action.index, state.resolvedCombat.log.length - 1);
      const pairedIndex = getSimultaneousPairIndex(state.resolvedCombat.log, newIndex);
      const effectiveIndex = pairedIndex ?? newIndex;

      // Extract damage number from current log entry
      const entry = state.resolvedCombat.log[newIndex];
      const pairedEntry = pairedIndex !== null ? state.resolvedCombat.log[pairedIndex] : undefined;
      const newDamageNumbers = [...state.damageNumbers];
      const newEffectNotifications = [...state.effectNotifications];

      appendFloatingNumbersForEntry(newDamageNumbers, entry, newIndex);
      if (pairedEntry) {
        appendFloatingNumbersForEntry(newDamageNumbers, pairedEntry, pairedIndex!);
      }

      // Extract effect notification for this log entry
      if (entry) {
        const notification = extractEffectNotification(entry, newIndex);
        if (notification) {
          newEffectNotifications.push(notification);
        }
      }
      if (pairedEntry) {
        const pairedNotification = extractEffectNotification(pairedEntry, pairedIndex!);
        if (pairedNotification) {
          newEffectNotifications.push(pairedNotification);
        }
      }

      // Cap concurrent floating numbers to limit native-thread animation pressure
      // (each FloatingNumber creates 3 animated values: translateY, opacity, scale)
      const trimmedNumbers = newDamageNumbers.slice(-6);
      const trimmedNotifications = newEffectNotifications.slice(-4);

      return {
        ...state,
        currentLogIndex: effectiveIndex,
        currentContributionIndex: entry?.result.contributions?.length ? 0 : null,
        damageNumbers: trimmedNumbers,
        effectNotifications: trimmedNotifications,
      };
    }

    case 'ADVANCE_CONTRIBUTION': {
      if (!state.resolvedCombat) return state;
      const entry = state.resolvedCombat.log[state.currentLogIndex];
      if (!entry?.result.contributions?.length) return state;
      const nextContributionIndex = (state.currentContributionIndex ?? 0) + 1;
      if (nextContributionIndex >= entry.result.contributions.length) {
        return state;
      }

      const newDamageNumbers = [
        ...state.damageNumbers,
        ...createContributionDamageNumber(entry, state.currentLogIndex, nextContributionIndex),
      ].slice(-6);

      return {
        ...state,
        currentContributionIndex: nextContributionIndex,
        damageNumbers: newDamageNumbers,
      };
    }

    case 'COMPLETE_ANIMATION': {
      const currentEntry = state.resolvedCombat?.log[state.currentLogIndex];
      return {
        ...state,
        isAnimating: false,
        isComplete: true,
        currentContributionIndex: currentEntry?.result.contributions?.length
          ? currentEntry.result.contributions.length - 1
          : null,
      };
    }

    case 'RESET_COMBAT': {
      return initialState;
    }

    default:
      return state;
  }
}

// ============================================================================
// Context
// ============================================================================

interface CombatContextType {
  state: CombatUIState;
  dispatch: Dispatch<CombatAction>;
  /** Current combat animation speed */
  speed: CombatSpeed;
  /** Update combat animation speed */
  setSpeed: (speed: CombatSpeed) => void;
  /** Start a new combat */
  startCombat: (input: CombatResolverInput) => void;
  /** Start combat using backend log (for on-chain mode) */
  startCombatWithLog: (
    input: CombatResolverInput,
    backendLog: BackendCombatLogEntry[],
    onChainResult?: 'VICTORY' | 'DEFEAT'
  ) => void;
  /** Start combat from authoritative on-chain result when log is unavailable */
  startCombatWithOnchainOutcome: (
    input: CombatResolverInput,
    outcome: { finalPlayerHp: number; playerWon: boolean; finalEnemyHp?: number }
  ) => void;
  /** Current combatant states for display (includes dynamic gold tracking) */
  displayStates: {
    player: CombatantState | null;
    enemy: CombatantState | null;
    playerGold?: number;
    enemyGold?: number;
  };
  /** Get combat result */
  getResult: () => 'VICTORY' | 'DEFEAT' | null;
}

const CombatContext = createContext<CombatContextType | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

export type CombatProviderProps = {
  children: ReactNode;
  initialSpeed?: CombatSpeed;
  onSpeedChange?: (speed: CombatSpeed) => void | Promise<void>;
};

export function CombatProvider({ children, initialSpeed, onSpeedChange }: CombatProviderProps) {
  const [state, dispatch] = useReducer(combatReducer, initialState);
  const [speed, setSpeedState] = useState<CombatSpeed>(initialSpeed ?? DEFAULT_COMBAT_SPEED);

  useEffect(() => {
    if (state.combat) return;
    setSpeedState(initialSpeed ?? DEFAULT_COMBAT_SPEED);
  }, [initialSpeed, state.combat]);

  const setSpeed = useCallback(
    (nextSpeed: CombatSpeed) => {
      setSpeedState(nextSpeed);
      void onSpeedChange?.(nextSpeed);
    },
    [onSpeedChange]
  );

  const startCombat = useCallback(
    (input: CombatResolverInput) => {
      dispatch({ type: 'START_COMBAT', input });
    },
    [dispatch]
  );

  const startCombatWithLog = useCallback(
    (
      input: CombatResolverInput,
      backendLog: BackendCombatLogEntry[],
      onChainResult?: 'VICTORY' | 'DEFEAT'
    ) => {
      dispatch({ type: 'START_COMBAT_WITH_LOG', input, backendLog, onChainResult });
    },
    [dispatch]
  );

  const startCombatWithOnchainOutcome = useCallback(
    (
      input: CombatResolverInput,
      outcome: { finalPlayerHp: number; playerWon: boolean; finalEnemyHp?: number }
    ) => {
      dispatch({ type: 'START_COMBAT_WITH_ONCHAIN_OUTCOME', input, outcome });
    },
    [dispatch]
  );

  const displayStates = useMemo(() => {
    if (!state.resolvedCombat || !state.combat) {
      return { player: null, enemy: null } as const;
    }

    const normalizeCombatant = (combatant: CombatantState): CombatantState => ({
      ...combatant,
      atk: combatant.atk + combatant.bonusAtk,
      arm: combatant.arm + combatant.bonusArm,
      spd: combatant.spd + combatant.bonusSpd,
      bonusAtk: 0,
      bonusArm: 0,
      bonusSpd: 0,
      statusEffects: { ...combatant.statusEffects },
    });

    const player = normalizeCombatant(state.combat.player);
    const enemy = normalizeCombatant(state.combat.enemy);
    let playerGold = state.combat.playerGold;
    let enemyGold = state.combat.enemyGold;

    const log = state.resolvedCombat.log;
    const maxIndex = Math.min(state.currentLogIndex, log.length - 1);
    const gold = { player: playerGold, enemy: enemyGold };

    for (let index = 0; index < maxIndex; index += 1) {
      const entry = log[index];
      applyLogEntryToCombatants(entry, log, index, player, enemy, gold);
    }

    if (maxIndex >= 0 && log[maxIndex]) {
      applyLogEntryToCombatants(
        log[maxIndex],
        log,
        maxIndex,
        player,
        enemy,
        gold,
        state.currentContributionIndex
      );
    }

    return {
      player,
      enemy,
      playerGold: gold.player,
      enemyGold: gold.enemy,
    };
  }, [
    state.resolvedCombat,
    state.combat,
    state.currentLogIndex,
    state.currentContributionIndex,
  ]);

  const getResult = useCallback(() => {
    return state.resolvedCombat?.result ?? null;
  }, [state.resolvedCombat]);

  const terminalLogIndex = useCallback(() => {
    if (!state.resolvedCombat || !state.combat || !state.respectTerminalLogIndex) return null;
    return deriveTerminalLogIndex(state.combat, state.resolvedCombat.log);
  }, [state.resolvedCombat, state.combat, state.respectTerminalLogIndex]);

  useEffect(() => {
    if (!state.resolvedCombat || state.isComplete) return;

    const logLength = state.resolvedCombat.log.length;
    const stopAtIndex = terminalLogIndex() ?? (logLength - 1);
    const currentEntry = state.resolvedCombat.log[state.currentLogIndex];
    const activeContributionIndex = state.currentContributionIndex;
    const isInitialDelay = state.currentLogIndex < 0;
    const hasPendingContributions =
      !!currentEntry?.result.contributions?.length &&
      activeContributionIndex !== null &&
      activeContributionIndex < currentEntry.result.contributions.length - 1;
    const isWaitingForLastContributionToFinish =
      !!currentEntry?.result.contributions?.length &&
      activeContributionIndex !== null &&
      activeContributionIndex >= currentEntry.result.contributions.length - 1;
    const isWaitingForSinglePopupToFinish =
      !currentEntry?.result.contributions?.length && entryHasFloatingNumber(currentEntry);
    const isStatusApplyEntry =
      currentEntry?.action === 'APPLY_STATUS' && Boolean(currentEntry.result.statusApplied);
    const isInstantStatusRemoval = entryIsStatusRemovalOnly(currentEntry);
    const isAtTerminalEntry = !isInitialDelay && state.currentLogIndex >= stopAtIndex;
    const shouldCompleteAfterCurrentEntry =
      isAtTerminalEntry &&
      !hasPendingContributions &&
      !isWaitingForLastContributionToFinish &&
      !isWaitingForSinglePopupToFinish;

    if (shouldCompleteAfterCurrentEntry) {
      if (logLength <= 2) {
        console.warn('[CombatContext] Animation completing with very few log entries:', {
          logLength,
          currentLogIndex: state.currentLogIndex,
          playerHp: state.combat?.player.hp,
          enemyHp: state.combat?.enemy.hp,
          result: state.resolvedCombat.result,
        });
      }
      dispatch({ type: 'COMPLETE_ANIMATION' });
      return;
    }

    const delayMs = isInitialDelay
      ? speed === 'paused'
        ? null
        : INITIAL_COMBAT_START_DELAY_MS / COMBAT_SPEED_MULTIPLIER[speed]
      : hasPendingContributions
        ? speed === 'paused'
          ? null
          : CONTRIBUTION_STAGGER_MS / COMBAT_SPEED_MULTIPLIER[speed]
        : isWaitingForLastContributionToFinish
          ? speed === 'paused'
            ? null
            : (FLOATING_NUMBER_FADE_DELAY_MS + FLOATING_NUMBER_FADE_MS) /
              COMBAT_SPEED_MULTIPLIER[speed]
          : isWaitingForSinglePopupToFinish
          ? speed === 'paused'
            ? null
            : (FLOATING_NUMBER_FADE_DELAY_MS +
                FLOATING_NUMBER_FADE_MS +
                (isStatusApplyEntry ? POST_STATUS_APPLY_BUFFER_MS : 0)) /
              COMBAT_SPEED_MULTIPLIER[speed]
          : isInstantStatusRemoval
            ? 0
          : getCombatAnimationIntervalMs(speed);

    if (delayMs === null) return;

    const timer = setTimeout(() => {
      if (hasPendingContributions) {
        dispatch({ type: 'ADVANCE_CONTRIBUTION' });
        return;
      }

      if (isAtTerminalEntry) {
        dispatch({ type: 'COMPLETE_ANIMATION' });
        return;
      }

      dispatch({
        type: 'ADVANCE_LOG',
        index: Math.min(state.currentLogIndex + 1, stopAtIndex),
      });
    }, delayMs);

    return () => clearTimeout(timer);
  }, [
    state.currentLogIndex,
    state.currentContributionIndex,
    state.resolvedCombat,
    state.isComplete,
    speed,
    dispatch,
    terminalLogIndex,
  ]);

  const value = useMemo<CombatContextType>(() => ({
    state,
    dispatch,
    speed,
    setSpeed,
    startCombat,
    startCombatWithLog,
    startCombatWithOnchainOutcome,
    displayStates,
    getResult,
  }), [
    state,
    dispatch,
    speed,
    setSpeed,
    startCombat,
    startCombatWithLog,
    startCombatWithOnchainOutcome,
    displayStates,
    getResult,
  ]);

  return (
    <CombatContext.Provider value={value}>
      {children}
    </CombatContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * T055: useCombat hook
 * Provides access to combat state and actions
 */
export function useCombat() {
  const context = useContext(CombatContext);
  if (context === undefined) {
    throw new Error('useCombat must be used within a CombatProvider');
  }
  return context;
}
