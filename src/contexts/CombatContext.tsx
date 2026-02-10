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
  useState,
  ReactNode,
  Dispatch,
} from 'react';
import type {
  CombatState,
  CombatantState,
  CombatLogEntry,
  CombatResult,
} from '../game/engine/types';
import { CombatPhase } from '../game/engine/types';
import {
  resolveCombat,
  createCombatState,
  type CombatResolverInput,
} from '../game/combat/resolver';
import type { CombatSpeed } from '../types';
import type { BackendCombatLogEntry } from '../services/solana/types/combat_events';
import { convertBackendLogToFrontend } from '../services/solana/types/combat_events';

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

const DEFAULT_COMBAT_SPEED: CombatSpeed = 'normal';

export function getCombatAnimationIntervalMs(speed: CombatSpeed): number | null {
  if (speed === 'paused') {
    return null;
  }

  return COMBAT_ANIMATION_BASE_MS / COMBAT_SPEED_MULTIPLIER[speed];
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
  /** Is combat animation in progress */
  isAnimating: boolean;
  /** Is combat complete */
  isComplete: boolean;
  /** Damage numbers to display */
  damageNumbers: DamageNumber[];
  /** Effect notifications to display (item triggers, status effects, etc.) */
  effectNotifications: EffectNotification[];
}

export interface DamageNumber {
  id: string;
  value: number;
  type: 'damage' | 'heal' | 'armor' | 'gold';
  target: 'player' | 'enemy';
  timestamp: number;
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
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: CombatUIState = {
  combat: null,
  resolvedCombat: null,
  currentLogIndex: 0,
  isAnimating: false,
  isComplete: false,
  damageNumbers: [],
  effectNotifications: [],
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
    const { type, stacks } = entry.result.statusApplied;
    const emoji = STATUS_EMOJI[type] || '✨';
    const effectName = entry.result.effectName;
    return {
      id: `status-${index}-${timestamp}`,
      text: effectName ? `${effectName}` : `+${stacks} ${type}`,
      emoji,
      target,
      type: entry.actor === 'enemy' ? 'debuff' : 'buff',
      timestamp,
    };
  }

  // Item triggered (with effect name)
  if (entry.action === 'TRIGGER_ITEM' && entry.result.effectName) {
    const effectName = entry.result.effectName;
    // Skip "Battle Start" system message
    if (effectName === 'Battle Start') return null;

    let text = effectName;
    let emoji = '⚙️';

    // Add context based on what the item did
    if (entry.result.damage) {
      text = `${effectName}`;
      emoji = '💥';
    } else if (entry.result.healing) {
      text = `${effectName}`;
      emoji = '💚';
    } else if (entry.result.armorGained) {
      text = `${effectName}`;
      emoji = '🛡️';
    }

    return {
      id: `item-${index}-${timestamp}`,
      text,
      emoji,
      target,
      type: 'item',
      timestamp,
    };
  }

  // Armor gained from item effect
  if (entry.action === 'GAIN_ARMOR' && entry.result.effectName && entry.result.armorGained) {
    return {
      id: `armor-${index}-${timestamp}`,
      text: `${entry.result.effectName}`,
      emoji: '🛡️',
      target,
      type: 'buff',
      timestamp,
    };
  }

  // Trait triggered
  if (entry.action === 'TRIGGER_TRAIT' && entry.result.effectName) {
    return {
      id: `trait-${index}-${timestamp}`,
      text: entry.result.effectName,
      emoji: '⚡',
      target,
      type: entry.actor === 'enemy' ? 'debuff' : 'buff',
      timestamp,
    };
  }

  // Healing from item
  if (entry.action === 'HEAL' && entry.result.effectName && entry.result.healing) {
    return {
      id: `heal-${index}-${timestamp}`,
      text: `${entry.result.effectName}`,
      emoji: '💚',
      target,
      type: 'buff',
      timestamp,
    };
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

// ============================================================================
// Reducer
// ============================================================================

function combatReducer(state: CombatUIState, action: CombatAction): CombatUIState {
  switch (action.type) {
    case 'START_COMBAT': {
      // Resolve combat immediately (it's deterministic)
      const baseCombat = createCombatState(action.input);
      const resolvedCombat = resolveCombat(action.input);

      console.log('[CombatContext] START_COMBAT:', {
        logEntries: resolvedCombat.log.length,
        result: resolvedCombat.result,
        playerHp: action.input.player.hp,
        enemyHp: action.input.enemy.hp,
        bossId: action.input.bossId,
      });

      return {
        ...state,
        combat: baseCombat,
        resolvedCombat,
        currentLogIndex: 0,
        isAnimating: true,
        isComplete: false,
        damageNumbers: [],
        effectNotifications: [],
      };
    }

    case 'START_COMBAT_WITH_LOG': {
      // Use backend log instead of local resolver
      // This ensures frontend animation matches on-chain combat exactly
      const baseCombat = createCombatState(action.input);

      // On-chain combat starts with arm=0; gear ARM bonuses (e.g., Work Vest +1)
      // are applied via BattleStart effects which are already in the backend log.
      // Reset player ARM to avoid double-counting in getDisplayStates replay.
      baseCombat.player = { ...baseCombat.player, arm: 0, bonusArm: 0 };
      const convertedLog = convertBackendLogToFrontend(action.backendLog);
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
        const localCombat = resolveCombat(action.input);
        console.log('[CombatContext] Local resolver produced log with', localCombat.log.length, 'entries');
        return {
          ...state,
          combat: createCombatState(action.input),
          resolvedCombat: localCombat,
          currentLogIndex: 0,
          isAnimating: true,
          isComplete: false,
          damageNumbers: [],
          effectNotifications: [],
        };
      }

      // Derive the combat result by replaying the log against initial HP
      const derivedResult = deriveCombatResultFromLog(baseCombat, typedLog);

      // Derive the turn count from the log (max turn value across all entries)
      const maxTurn = typedLog.reduce((max, entry) => Math.max(max, entry.turn), 0);

      // Create a resolved combat state with the backend log
      // We still need the combat state structure for the animation system
      const resolvedCombat = {
        ...baseCombat,
        log: typedLog,
        result: derivedResult,
        turn: maxTurn,
      };

      console.log('[CombatContext] Using backend combat log:', {
        entryCount: action.backendLog.length,
        convertedCount: convertedLog.length,
        derivedResult,
      });

      return {
        ...state,
        combat: baseCombat,
        resolvedCombat,
        currentLogIndex: 0,
        isAnimating: true,
        isComplete: false,
        damageNumbers: [],
        effectNotifications: [],
      };
    }

    case 'START_COMBAT_WITH_ONCHAIN_OUTCOME': {
      // On-chain fallback path when CombatLog event is unavailable.
      // Run local resolver for the combat animation log, but override
      // the result with the authoritative on-chain outcome.
      const baseCombat = createCombatState(action.input);
      const localCombat = resolveCombat(action.input);
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
        currentLogIndex: 0,
        isAnimating: true,
        isComplete: false,
        damageNumbers: [],
        effectNotifications: [],
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

      // Extract damage number from current log entry
      const entry = state.resolvedCombat.log[newIndex];
      const newDamageNumbers = [...state.damageNumbers];
      const newEffectNotifications = [...state.effectNotifications];

      if (entry?.result.damage && entry.target !== 'none') {
        newDamageNumbers.push({
          id: `dmg-${newIndex}-${Date.now()}`,
          value: entry.result.damage,
          type: 'damage',
          target: entry.target,
          timestamp: Date.now(),
        });
      }

      if (entry?.result.armorLost && entry.target !== 'none') {
        newDamageNumbers.push({
          id: `arm-${newIndex}-${Date.now()}`,
          value: entry.result.armorLost,
          type: 'armor',
          target: entry.target,
          timestamp: Date.now(),
        });
      }

      if (entry?.result.healing && entry.target !== 'none') {
        newDamageNumbers.push({
          id: `heal-${newIndex}-${Date.now()}`,
          value: entry.result.healing,
          type: 'heal',
          target: entry.target,
          timestamp: Date.now(),
        });
      }

      if (entry?.result.goldStolen && entry.result.goldStolen > 0) {
        newDamageNumbers.push({
          id: `gold-${newIndex}-${Date.now()}`,
          value: entry.result.goldStolen,
          type: 'gold',
          target: 'player',
          timestamp: Date.now(),
        });
      }

      // Extract effect notification for this log entry
      if (entry) {
        const notification = extractEffectNotification(entry, newIndex);
        if (notification) {
          newEffectNotifications.push(notification);
        }
      }

      // Keep only recent items (last 10)
      const trimmedNumbers = newDamageNumbers.slice(-10);
      const trimmedNotifications = newEffectNotifications.slice(-8);

      return {
        ...state,
        currentLogIndex: newIndex,
        damageNumbers: trimmedNumbers,
        effectNotifications: trimmedNotifications,
      };
    }

    case 'COMPLETE_ANIMATION': {
      return {
        ...state,
        isAnimating: false,
        isComplete: true,
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
  startCombatWithLog: (input: CombatResolverInput, backendLog: BackendCombatLogEntry[]) => void;
  /** Start combat from authoritative on-chain result when log is unavailable */
  startCombatWithOnchainOutcome: (
    input: CombatResolverInput,
    outcome: { finalPlayerHp: number; playerWon: boolean; finalEnemyHp?: number }
  ) => void;
  /** Get current combatant states for display (includes dynamic gold tracking) */
  getDisplayStates: () => {
    player: CombatantState | null;
    enemy: CombatantState | null;
    playerGold?: number;
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
    (input: CombatResolverInput, backendLog: BackendCombatLogEntry[]) => {
      dispatch({ type: 'START_COMBAT_WITH_LOG', input, backendLog });
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

  const getDisplayStates = useCallback(() => {
    if (!state.resolvedCombat || !state.combat) {
      return { player: null, enemy: null };
    }

    const normalizeCombatant = (combatant: CombatantState): CombatantState => ({
      ...combatant,
      arm: combatant.arm + combatant.bonusArm,
      bonusArm: 0,
      statusEffects: { ...combatant.statusEffects },
    });

    const player = normalizeCombatant(state.combat.player);
    const enemy = normalizeCombatant(state.combat.enemy);
    let playerGold = state.combat.playerGold;

    const log = state.resolvedCombat.log;
    const maxIndex = Math.min(state.currentLogIndex, log.length - 1);

    for (let index = 0; index <= maxIndex; index += 1) {
      const entry = log[index];
      if (!entry || entry.target === 'none') continue;

      const target = entry.target === 'player' ? player : enemy;
      const { result } = entry;

      if (result.armorLost && result.armorLost > 0) {
        target.arm = Math.max(0, target.arm - result.armorLost);
      }

      if (result.damage && result.damage > 0) {
        target.hp = Math.max(0, target.hp - result.damage);
      }

      if (result.armorGained && result.armorGained > 0) {
        target.arm += result.armorGained;
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
          [type]: Math.max(0, target.statusEffects[type] + stacks),
        };
      }

      if (result.statusRemoved) {
        const { type, stacks } = result.statusRemoved;
        target.statusEffects = {
          ...target.statusEffects,
          [type]: Math.max(0, target.statusEffects[type] - stacks),
        };
      }

      if (result.goldStolen && result.goldStolen > 0) {
        playerGold = Math.max(0, playerGold - result.goldStolen);
      }
    }

    return { player, enemy, playerGold };
  }, [state.resolvedCombat, state.combat, state.currentLogIndex]);

  const getResult = useCallback(() => {
    return state.resolvedCombat?.result ?? null;
  }, [state.resolvedCombat]);

  useEffect(() => {
    if (!state.resolvedCombat || state.isComplete) return;

    const logLength = state.resolvedCombat.log.length;
    if (state.currentLogIndex >= logLength - 1) {
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

    const intervalMs = getCombatAnimationIntervalMs(speed);
    if (intervalMs === null) return;

    const timer = setTimeout(() => {
      dispatch({ type: 'ADVANCE_LOG', index: state.currentLogIndex + 1 });
    }, intervalMs);

    return () => clearTimeout(timer);
  }, [state.currentLogIndex, state.resolvedCombat, state.isComplete, speed, dispatch]);

  return (
    <CombatContext.Provider
      value={{
        state,
        dispatch,
        speed,
        setSpeed,
        startCombat,
        startCombatWithLog,
        startCombatWithOnchainOutcome,
        getDisplayStates,
        getResult,
      }}
    >
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
