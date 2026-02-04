/**
 * Effect Executor - Processes combat effects using the type system
 *
 * This module handles the execution of ItemEffect objects, providing
 * a centralized way to apply effects that matches the Solana backend behavior.
 */

import type { CombatState, CombatantState, GearId } from '../engine/types';
import type { ItemEffect, EffectType, Condition, TriggerType } from '../../data/combat-types';
import { applyStatus } from './status-effects';

// ============================================================================
// Effect Execution Context
// ============================================================================

export interface CombatEffectContext {
  /** Current combat state */
  state: CombatState;
  /** Who owns the effect (player or enemy) */
  owner: 'player' | 'enemy';
  /** Current turn number */
  turn: number;
  /** Player's current gold */
  playerGold: number;
  /** Callback to update player gold */
  updateGold: (amount: number) => void;
  /** Callback to add log entry */
  addLog: (entry: EffectLogEntry) => void;
  /** Track effects that have fired this turn (for once-per-turn) */
  firedThisTurn: Set<string>;
  /** Stored damage for Time Charge */
  storedDamage: number;
  /** Update stored damage */
  setStoredDamage: (value: number) => void;
  /** Non-weapon damage amplification */
  nonWeaponAmplify: number;
  /** Blast immunity active */
  blastImmunity: boolean;
  /** Double bomb triggers active */
  doubleBombTrigger: boolean;
  /** Double on-hit effects active */
  doubleOnHitEffects: boolean;
  /** Armor piercing amount */
  armorPiercing: number;
  /** Prevent death charges remaining */
  preventDeathCharges: number;
  /** Update prevent death charges */
  setPreventDeathCharges: (value: number) => void;
  /** Countdown items state */
  countdownItems: Map<GearId, number>;
  /** First time wounded flag (for Gore Mantle) */
  firstTimeWoundedTriggered: boolean;
  /** Set first time wounded flag */
  setFirstTimeWoundedTriggered: (value: boolean) => void;
}

export interface EffectLogEntry {
  effectName: string;
  target: 'player' | 'enemy' | 'none';
  damage?: number;
  healing?: number;
  armorGained?: number;
  armorLost?: number;
  statusApplied?: { type: string; stacks: number };
  goldChange?: number;
}

export interface EffectResult {
  /** Updated combat state */
  state: CombatState;
  /** Whether the effect was applied */
  applied: boolean;
  /** Log entries generated */
  logs: EffectLogEntry[];
}

// ============================================================================
// Condition Checking
// ============================================================================

export function checkCondition(
  condition: Condition,
  owner: CombatantState,
  enemy: CombatantState
): boolean {
  switch (condition.type) {
    case 'None':
      return true;

    case 'EnemyHasStatus': {
      const statusKey = condition.status.toLowerCase() as keyof typeof enemy.statusEffects;
      return enemy.statusEffects[statusKey] > 0;
    }

    case 'EnemyHasArmor':
      return enemy.arm > 0;

    case 'DigGreaterThanEnemyDig':
      return owner.dig > enemy.dig;

    case 'SpdGreaterThanEnemySpd':
      return owner.spd + owner.bonusSpd > enemy.spd + enemy.bonusSpd;

    case 'OwnerWounded':
      return owner.hp < owner.maxHp / 2;

    case 'OwnerExposed':
      return owner.arm <= 0;

    case 'EnemyWounded':
      return enemy.hp < enemy.maxHp / 2;

    case 'OwnerHasArmor':
      return owner.arm > 0;

    default:
      return true;
  }
}

// ============================================================================
// Trigger Checking
// ============================================================================

export function shouldTrigger(
  trigger: TriggerType,
  phase: string,
  turn: number,
  context: {
    isFirstStrike?: boolean;
    wasWounded?: boolean;
    isWounded?: boolean;
    wasExposed?: boolean;
    isExposed?: boolean;
    enemyTookBleedDamage?: boolean;
    rustApplied?: boolean;
    shrapnelGained?: boolean;
    isDayStart?: boolean;
  }
): boolean {
  switch (trigger.type) {
    case 'BattleStart':
      return phase === 'BATTLE_START';

    case 'FirstTurn':
      return phase === 'TURN_START' && turn === 1;

    case 'FirstTurnIfFaster':
      // Requires additional context about who acts first
      return phase === 'TURN_START' && turn === 1;

    case 'FirstTurnIfSlower':
      return phase === 'TURN_START' && turn === 1;

    case 'TurnStart':
      return phase === 'TURN_START';

    case 'EveryOtherTurn':
      return phase === 'TURN_START' && turn % 2 === 0;

    case 'OnHit':
      return phase === 'ON_HIT';

    case 'Exposed':
      return !context.wasExposed && context.isExposed === true;

    case 'Wounded':
      return !context.wasWounded && context.isWounded === true;

    case 'Countdown':
      // Countdown is handled separately via countdown tracking
      return false;

    case 'Victory':
      return phase === 'VICTORY';

    case 'OnStruck':
      return phase === 'ON_STRUCK';

    case 'TurnN':
      return phase === 'TURN_START' && turn === trigger.turn;

    case 'EveryOtherTurnFirstHit':
      return phase === 'ON_HIT' && turn % 2 === 0 && context.isFirstStrike === true;

    case 'TurnEnd':
      return phase === 'TURN_END';

    case 'OnEnemyBleedDamage':
      return context.enemyTookBleedDamage === true;

    case 'OnApplyRust':
      return context.rustApplied === true;

    case 'OnGainShrapnel':
      return context.shrapnelGained === true;

    case 'DayStart':
      return context.isDayStart === true;

    case 'FirstTimeWounded':
      return !context.wasWounded && context.isWounded === true;

    default:
      return false;
  }
}

// ============================================================================
// Effect Execution
// ============================================================================

export function executeEffect(
  effect: ItemEffect,
  ctx: CombatEffectContext,
  effectId: string,
  effectName: string
): EffectResult {
  const logs: EffectLogEntry[] = [];
  let { state } = ctx;
  const owner = ctx.owner === 'player' ? state.player : state.enemy;
  const enemy = ctx.owner === 'player' ? state.enemy : state.player;
  const target = ctx.owner === 'player' ? 'enemy' : 'player';

  // Check once-per-turn
  if (effect.oncePerTurn && ctx.firedThisTurn.has(effectId)) {
    return { state, applied: false, logs };
  }

  // Check condition
  if (!checkCondition(effect.condition, owner, enemy)) {
    return { state, applied: false, logs };
  }

  // Mark as fired if once-per-turn
  if (effect.oncePerTurn) {
    ctx.firedThisTurn.add(effectId);
  }

  const value = effect.value;

  switch (effect.effectType) {
    case 'DealDamage': {
      // ARM is "HP before HP": deplete ARM first, overflow to HP
      const armDamage = Math.min(value, Math.max(0, enemy.arm));
      const hpDamage = value - armDamage;
      const updatedEnemy = {
        ...enemy,
        arm: enemy.arm - armDamage,
        hp: Math.max(0, enemy.hp - hpDamage),
      };
      state = {
        ...state,
        [target]: updatedEnemy,
      };
      if (armDamage > 0) {
        logs.push({ effectName, target, armorLost: armDamage });
      }
      if (hpDamage > 0) {
        logs.push({ effectName, target, damage: hpDamage });
      }
      break;
    }

    case 'DealNonWeaponDamage': {
      const amplifiedDamage = value + ctx.nonWeaponAmplify;
      const updatedEnemy = {
        ...enemy,
        hp: Math.max(0, enemy.hp - amplifiedDamage),
      };
      state = {
        ...state,
        [target]: updatedEnemy,
      };
      logs.push({ effectName, target, damage: amplifiedDamage });
      break;
    }

    case 'DealSelfNonWeaponDamage': {
      if (ctx.blastImmunity) {
        break; // Immune to self blast damage
      }
      const amplifiedDamage = value + ctx.nonWeaponAmplify;
      const updatedOwner = {
        ...owner,
        hp: Math.max(0, owner.hp - amplifiedDamage),
      };
      state = {
        ...state,
        [ctx.owner]: updatedOwner,
      };
      logs.push({ effectName, target: ctx.owner, damage: amplifiedDamage });
      break;
    }

    case 'Heal': {
      const healed = Math.min(value, owner.maxHp - owner.hp);
      if (healed > 0) {
        const updatedOwner = {
          ...owner,
          hp: owner.hp + healed,
        };
        state = {
          ...state,
          [ctx.owner]: updatedOwner,
        };
        logs.push({ effectName, target: ctx.owner, healing: healed });
      }
      break;
    }

    case 'GainArmor': {
      const updatedOwner = {
        ...owner,
        arm: owner.arm + value,
      };
      state = {
        ...state,
        [ctx.owner]: updatedOwner,
      };
      logs.push({ effectName, target: ctx.owner, armorGained: value });
      break;
    }

    case 'GainAtk': {
      const updatedOwner = {
        ...owner,
        bonusAtk: owner.bonusAtk + value,
      };
      state = {
        ...state,
        [ctx.owner]: updatedOwner,
      };
      logs.push({ effectName, target: ctx.owner });
      break;
    }

    case 'GainSpd': {
      const updatedOwner = {
        ...owner,
        bonusSpd: owner.bonusSpd + value,
      };
      state = {
        ...state,
        [ctx.owner]: updatedOwner,
      };
      logs.push({ effectName, target: ctx.owner });
      break;
    }

    case 'GainDig': {
      const updatedOwner = {
        ...owner,
        dig: owner.dig + value,
      };
      state = {
        ...state,
        [ctx.owner]: updatedOwner,
      };
      logs.push({ effectName, target: ctx.owner });
      break;
    }

    case 'GainGold': {
      ctx.updateGold(ctx.playerGold + value);
      logs.push({ effectName, target: ctx.owner, goldChange: value });
      break;
    }

    case 'ApplyChill': {
      const updatedEnemy = applyStatus(enemy, 'chill', value);
      state = {
        ...state,
        [target]: updatedEnemy,
      };
      logs.push({ effectName, target, statusApplied: { type: 'chill', stacks: value } });
      break;
    }

    case 'ApplyShrapnel': {
      const updatedOwner = applyStatus(owner, 'shrapnel', value);
      state = {
        ...state,
        [ctx.owner]: updatedOwner,
      };
      logs.push({
        effectName,
        target: ctx.owner,
        statusApplied: { type: 'shrapnel', stacks: value },
      });
      break;
    }

    case 'ApplyRust': {
      const updatedEnemy = applyStatus(enemy, 'rust', value);
      state = {
        ...state,
        [target]: updatedEnemy,
      };
      logs.push({ effectName, target, statusApplied: { type: 'rust', stacks: value } });
      break;
    }

    case 'ApplyBleed': {
      const updatedEnemy = applyStatus(enemy, 'bleed', value);
      state = {
        ...state,
        [target]: updatedEnemy,
      };
      logs.push({ effectName, target, statusApplied: { type: 'bleed', stacks: value } });
      break;
    }

    case 'RemoveArmor': {
      const removed = Math.min(value, enemy.arm);
      if (removed > 0) {
        const updatedEnemy = {
          ...enemy,
          arm: enemy.arm - removed,
        };
        state = {
          ...state,
          [target]: updatedEnemy,
        };
        logs.push({ effectName, target, armorLost: removed });
      }
      break;
    }

    case 'GainStrikes': {
      const updatedOwner = {
        ...owner,
        strikesPerTurn: owner.strikesPerTurn + value,
      };
      state = {
        ...state,
        [ctx.owner]: updatedOwner,
      };
      logs.push({ effectName, target: ctx.owner });
      break;
    }

    case 'MaxHp': {
      const updatedOwner = {
        ...owner,
        maxHp: owner.maxHp + value,
        hp: owner.hp + value, // Also heal for the bonus
      };
      state = {
        ...state,
        [ctx.owner]: updatedOwner,
      };
      logs.push({ effectName, target: ctx.owner, healing: value });
      break;
    }

    case 'ReduceEnemySpd': {
      const updatedEnemy = {
        ...enemy,
        bonusSpd: enemy.bonusSpd - value,
      };
      state = {
        ...state,
        [target]: updatedEnemy,
      };
      logs.push({ effectName, target });
      break;
    }

    case 'GoldToArmorScaled': {
      // Gain armor = floor(gold/10), capped at value
      const armorGained = Math.min(Math.floor(ctx.playerGold / 10), value);
      if (armorGained > 0) {
        const updatedOwner = {
          ...owner,
          arm: owner.arm + armorGained,
        };
        state = {
          ...state,
          [ctx.owner]: updatedOwner,
        };
        logs.push({ effectName, target: ctx.owner, armorGained });
      }
      break;
    }

    case 'ConsumeGoldForArmor': {
      // Consume 1 gold to gain [value] armor
      if (ctx.playerGold >= 1) {
        ctx.updateGold(ctx.playerGold - 1);
        const updatedOwner = {
          ...owner,
          arm: owner.arm + value,
        };
        state = {
          ...state,
          [ctx.owner]: updatedOwner,
        };
        logs.push({ effectName, target: ctx.owner, armorGained: value, goldChange: -1 });
      }
      break;
    }

    case 'PreventDeath': {
      // This is tracked separately, just increment charges
      ctx.setPreventDeathCharges(ctx.preventDeathCharges + 1);
      logs.push({ effectName, target: ctx.owner });
      break;
    }

    case 'ArmorToMaxHp': {
      // Convert starting armor to max HP (capped at value)
      const armorBonus = Math.min(owner.arm, value);
      if (armorBonus > 0) {
        const updatedOwner = {
          ...owner,
          maxHp: owner.maxHp + armorBonus,
          hp: owner.hp + armorBonus,
        };
        state = {
          ...state,
          [ctx.owner]: updatedOwner,
        };
        logs.push({ effectName, target: ctx.owner, healing: armorBonus });
      }
      break;
    }

    case 'ReduceAllCountdowns': {
      // Reduce all countdown items by value
      ctx.countdownItems.forEach((current: number, gearId: GearId) => {
        ctx.countdownItems.set(gearId, Math.max(0, current - value));
      });
      logs.push({ effectName, target: 'none' });
      break;
    }

    case 'AmplifyNonWeaponDamage': {
      // This is tracked in context, just add to amplification
      // Note: This is typically set at battle start, not added
      logs.push({ effectName, target: 'none' });
      break;
    }

    case 'StoreDamage': {
      ctx.setStoredDamage(ctx.storedDamage + value);
      logs.push({ effectName, target: 'none' });
      break;
    }

    case 'BlastImmunity':
    case 'DoubleBombTrigger':
    case 'DoubleOnHitEffects':
    case 'TriggerAllShards':
    case 'SetArmorPiercing':
    case 'StealGold':
    case 'GoldToArmor':
    case 'ApplyReflection':
    case 'ApplyBomb':
      // These are flag-based effects handled at battle start
      logs.push({ effectName, target: 'none' });
      break;

    default:
      console.warn(`Unhandled effect type: ${effect.effectType}`);
  }

  return { state, applied: true, logs };
}

// ============================================================================
// Batch Effect Processing
// ============================================================================

export interface ProcessEffectsInput {
  effects: Array<{ effect: ItemEffect; id: string; name: string }>;
  ctx: CombatEffectContext;
  phase: string;
  triggerContext?: {
    isFirstStrike?: boolean;
    wasWounded?: boolean;
    isWounded?: boolean;
    wasExposed?: boolean;
    isExposed?: boolean;
    enemyTookBleedDamage?: boolean;
    rustApplied?: boolean;
    shrapnelGained?: boolean;
    isDayStart?: boolean;
    playerActsFirst?: boolean;
  };
}

export function processEffects(input: ProcessEffectsInput): EffectResult {
  let { state } = input.ctx;
  const allLogs: EffectLogEntry[] = [];
  let anyApplied = false;

  for (const { effect, id, name } of input.effects) {
    // Check if this effect should trigger for the current phase
    const shouldFire = shouldTrigger(
      effect.trigger,
      input.phase,
      input.ctx.turn,
      input.triggerContext || {}
    );

    if (!shouldFire) continue;

    // Handle FirstTurnIfFaster/FirstTurnIfSlower special cases
    if (effect.trigger.type === 'FirstTurnIfFaster' && !input.triggerContext?.playerActsFirst) {
      continue;
    }
    if (effect.trigger.type === 'FirstTurnIfSlower' && input.triggerContext?.playerActsFirst) {
      continue;
    }

    const result = executeEffect(effect, { ...input.ctx, state }, id, name);
    state = result.state;
    allLogs.push(...result.logs);
    if (result.applied) {
      anyApplied = true;
    }
  }

  return { state, applied: anyApplied, logs: allLogs };
}
