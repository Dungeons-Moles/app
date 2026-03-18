/**
 * Effect Executor - Processes combat effects using the type system
 *
 * This module handles the execution of ItemEffect objects, providing
 * a centralized way to apply effects that matches the Solana backend behavior.
 */

import type { CombatSourceRef, CombatState, CombatantState, GearId } from '../engine/types';
import type { ItemEffect, EffectType, Condition, TriggerType } from '../../data/combat-types';
import { applyStatus } from './status-effects';
import { getChillDamageBonus } from './damage';

// ============================================================================
// Effect Execution Context
// ============================================================================

export interface CombatEffectContext {
  /** Current combat state */
  state: CombatState;
  /** Who owns the effect (player or enemy) */
  owner: 'player' | 'enemy';
  /** Current trigger phase */
  phase: string;
  /** Current turn number */
  turn: number;
  /** Player's current gold */
  playerGold: number;
  /** Enemy's current gold */
  enemyGold?: number;
  /** Callback to update player gold */
  updateGold: (amount: number) => void;
  /** Callback to update enemy gold */
  updateEnemyGold?: (amount: number) => void;
  /** Amount stolen by the most recent StealGold effect for this owner */
  lastGoldStolen?: number;
  /** Update amount stolen by the most recent StealGold effect for this owner */
  setLastGoldStolen?: (amount: number) => void;
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
  /** Update non-weapon damage amplification */
  setNonWeaponAmplify: (value: number) => void;
  /** Self-damage multiplier for countdown BLAST damage */
  blastSelfDamageMultiplier: number;
  /** Double bomb triggers active */
  doubleBombTrigger: boolean;
  /** Bonus added to the first opponent-targeted non-weapon hit each turn */
  doubleDetonationFirst: number;
  /** Bonus added to the second opponent-targeted non-weapon hit each turn */
  doubleDetonationSecond: number;
  /** Opponent-targeted non-weapon hits dealt so far this turn */
  nonWeaponHitsThisTurn: number;
  /** Update opponent-targeted non-weapon hits dealt so far this turn */
  setNonWeaponHitsThisTurn: (value: number) => void;
  /** Bonus to carry onto the paired self non-weapon damage of the current detonation */
  pendingSelfNonWeaponBonus: number;
  /** Update the bonus to carry onto the paired self non-weapon damage */
  setPendingSelfNonWeaponBonus: (value: number) => void;
  /** Bonus applied to the next countdown bomb's enemy hit */
  nextBombDamageBonus: number;
  /** Update the bonus applied to the next countdown bomb's enemy hit */
  setNextBombDamageBonus: (value: number) => void;
  /** Reduction applied to the next countdown bomb's self damage */
  nextBombSelfDamageReduction: number;
  /** Update the reduction applied to the next countdown bomb's self damage */
  setNextBombSelfDamageReduction: (value: number) => void;
  /** Active reduction carried from the current countdown bomb enemy hit to its self damage */
  activeBombSelfDamageReduction: number;
  /** Update the active reduction carried onto the current countdown bomb self damage */
  setActiveBombSelfDamageReduction: (value: number) => void;
  /** Double on-hit effects active */
  doubleOnHitEffects: boolean;
  /** OnHit effects can trigger on each strike separately */
  onHitPerStrike: boolean;
  /** Bonus damage for countdown bombs */
  bombDamageBonus: number;
  /** Reduce weapon damage while owner has armor */
  weaponDamageReductionWhileArmored: number;
  /** Extra shrapnel retaliation damage per consumed stack */
  shrapnelReflectBonus: number;
  /** Armor piercing amount */
  armorPiercing: number;
  /** Update armor piercing amount */
  setArmorPiercing: (value: number) => void;
  /** Heal amount when prevent-death triggers */
  preventDeathHeal: number;
  /** Prevent death charges remaining */
  preventDeathCharges: number;
  /** Update prevent death charges */
  setPreventDeathCharges: (value: number) => void;
  /** Max Gold->Armor conversions this battle */
  goldArmorConversionLimit: number;
  /** Gold->Armor conversions already used */
  goldArmorConversionsUsed: number;
  /** Update Gold->Armor conversions used */
  setGoldArmorConversionsUsed: (value: number) => void;
  /** Countdown items state */
  countdownItems: Map<GearId, number>;
  /** Persistent countdown acceleration for parity countdown triggers */
  countdownTurnBonus?: number;
  /** Update persistent countdown acceleration */
  setCountdownTurnBonus?: (value: number) => void;
  /** First time wounded flag (for Gore Mantle) */
  firstTimeWoundedTriggered: boolean;
  /** Set first time wounded flag */
  setFirstTimeWoundedTriggered: (value: boolean) => void;
  /** Temporary exposed override for owner this phase */
  ownerExposedOverride?: boolean;
  /** Temporary exposed override for enemy this phase */
  enemyExposedOverride?: boolean;
  /** Enemy bleed stacks before the current OnHit effects started */
  enemyBleedBeforeHit?: number;
  allowRepeatEffectIds?: Set<string>;
}

export interface EffectLogEntry {
  effectName: string;
  target: 'player' | 'enemy' | 'none';
  source?: CombatSourceRef;
  atkGained?: number;
  spdGained?: number;
  digGained?: number;
  damage?: number;
  nonWeaponDamage?: number;
  healing?: number;
  armorGained?: number;
  armorLost?: number;
  statusApplied?: { type: string; stacks: number };
  statusRemoved?: { type: string; stacks: number };
  goldChange?: number;
  isGoldGain?: boolean;
}

export interface EffectResult {
  /** Updated combat state */
  state: CombatState;
  /** Whether the effect was applied */
  applied: boolean;
  /** Log entries generated */
  logs: EffectLogEntry[];
  /** Combat snapshot taken before the lethal source instance started resolving */
  lethalStartState?: CombatState;
}

function applyReflectableStatusToOpponent(
  state: CombatState,
  ctx: CombatEffectContext,
  effectName: string,
  source: CombatSourceRef | undefined,
  statusType: 'chill' | 'rust' | 'bleed',
  stacks: number
): { state: CombatState; logs: EffectLogEntry[] } {
  const owner = ctx.owner === 'player' ? state.player : state.enemy;
  const enemy = ctx.owner === 'player' ? state.enemy : state.player;
  const target = ctx.owner === 'player' ? 'enemy' : 'player';

  if ((enemy.statusEffects.reflection ?? 0) > 0) {
    const reflectionAfter = Math.max(0, (enemy.statusEffects.reflection ?? 0) - 1);
    const updatedEnemy = {
      ...enemy,
      statusEffects: {
        ...enemy.statusEffects,
        reflection: reflectionAfter,
      },
    };
    const reflectedOwner = applyStatus(owner, statusType, stacks);
    const isCrystalMimic = enemy.definitionId === 'B-A-W2-02';
    const triggerGlassHeart = isCrystalMimic && reflectionAfter === 0;
    const glassHeartDamage = triggerGlassHeart ? 2 : 0;
    const finalEnemy = triggerGlassHeart
      ? {
          ...updatedEnemy,
          hp: Math.max(0, updatedEnemy.hp - glassHeartDamage),
        }
      : updatedEnemy;
    const reflectionSource: CombatSourceRef = isCrystalMimic
      ? { kind: 'boss', id: 'B-A-W2-02', name: 'Crystal Mimic' }
      : { kind: 'status', id: 'reflection', name: 'Reflection' };
    return {
      state: {
        ...state,
        [ctx.owner]: reflectedOwner,
        [target]: finalEnemy,
      },
      logs: [
        {
          effectName: 'Reflection',
          target,
          source: { kind: 'status', id: 'reflection', name: 'Reflection' },
          statusRemoved: { type: 'reflection', stacks: 1 },
        },
        {
          effectName,
          target: ctx.owner,
          statusApplied: { type: statusType, stacks },
          source,
        },
        ...(triggerGlassHeart
          ? [
              {
                effectName: 'Glass Heart',
                target,
                damage: glassHeartDamage,
                nonWeaponDamage: glassHeartDamage,
                source: reflectionSource,
              } satisfies EffectLogEntry,
            ]
          : []),
      ],
    };
  }

  const updatedEnemy = applyStatus(enemy, statusType, stacks);
  return {
    state: {
      ...state,
      [target]: updatedEnemy,
    },
    logs: [{ effectName, target, statusApplied: { type: statusType, stacks }, source }],
  };
}

// ============================================================================
// Condition Checking
// ============================================================================

export function checkCondition(
  condition: Condition,
  owner: CombatantState,
  enemy: CombatantState,
  overrides?: {
    ownerExposedOverride?: boolean;
    enemyExposedOverride?: boolean;
  },
  resources?: {
    ownerGold?: number;
    enemyGold?: number;
  }
): boolean {
  const ownerStatus = owner.statusEffects;
  const enemyStatus = enemy.statusEffects;

  switch (condition.type) {
    case 'None':
      return true;

    case 'EnemyHasStatus': {
      const statusKey = condition.status.toLowerCase() as keyof typeof enemyStatus;
      return (enemyStatus[statusKey] ?? 0) > 0;
    }

    case 'EnemyHasNoArmor':
      return enemy.arm <= 0;

    case 'EnemyHasArmor':
      return enemy.arm > 0;

    case 'DigGreaterThanEnemyDig':
      return owner.dig > enemy.dig;

    case 'SpdGreaterThanEnemySpd':
      return owner.spd + owner.bonusSpd > enemy.spd + enemy.bonusSpd;

    case 'OwnerWounded':
      return owner.hp < owner.maxHp / 2;

    case 'OwnerExposed':
      return owner.arm <= 0 || overrides?.ownerExposedOverride === true;

    case 'EnemyWounded':
      return enemy.hp < enemy.maxHp / 2;

    case 'OwnerHasArmor':
      return owner.arm > 0;

    case 'OwnerArmorAtLeast':
      return owner.arm >= condition.value;

    case 'OwnerGoldAtLeast':
      return (resources?.ownerGold ?? 0) >= condition.value;

    case 'OwnerHasStatus': {
      const statusKey = condition.status.toLowerCase() as keyof typeof ownerStatus;
      return (ownerStatus[statusKey] ?? 0) > 0;
    }

    case 'EnemyHasStatusAtLeast': {
      const statusKey = condition.status.toLowerCase() as keyof typeof enemyStatus;
      return (enemyStatus[statusKey] ?? 0) >= condition.minStacks;
    }

    case 'EnemyHasNoArmorAndStatusAtLeast': {
      const statusKey = condition.status.toLowerCase() as keyof typeof enemyStatus;
      return enemy.arm <= 0 && (enemyStatus[statusKey] ?? 0) >= condition.minStacks;
    }

    case 'EnemyHasStatusOrNoArmor': {
      const statusKey = condition.status.toLowerCase() as keyof typeof enemyStatus;
      return enemy.arm <= 0 || (enemyStatus[statusKey] ?? 0) > 0;
    }

    case 'Or':
      return (
        checkCondition(condition.conditions[0], owner, enemy, overrides, resources) ||
        checkCondition(condition.conditions[1], owner, enemy, overrides, resources)
      );

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
    firstTimeWoundedTriggered?: boolean;
    firstTimeExposedTriggered?: boolean;
    firstTimeShrapnelTriggered?: boolean;
    isDayStart?: boolean;
    shardsEveryTurn?: boolean;
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

    case 'BeforeStrike':
      return phase === 'BEFORE_STRIKE';

    case 'Exposed':
      return !context.wasExposed && context.isExposed === true;

    case 'Wounded':
      return !context.wasWounded && context.isWounded === true;

    case 'Countdown':
      return phase === 'COUNTDOWN' && trigger.turns > 0 && turn > 0 && turn % trigger.turns === 0;

    case 'Victory':
      return phase === 'VICTORY';

    case 'OnStruck':
      return phase === 'ON_STRUCK';

    case 'TurnN':
      return phase === 'TURN_START' && turn === trigger.turn;

    case 'EveryOtherTurnFirstHit':
      return (
        phase === 'ON_HIT' &&
        context.isFirstStrike === true &&
        (turn % 2 === 0 || context.shardsEveryTurn === true)
      );

    case 'TurnEnd':
      return phase === 'TURN_END';

    case 'OnEnemyBleedDamage':
      return context.enemyTookBleedDamage === true;

    case 'OnApplyRust':
      return context.rustApplied === true;

    case 'OnDealNonWeaponDamage':
      return phase === 'ON_DEAL_NON_WEAPON_DAMAGE';

    case 'OnGainShrapnel':
      return context.shrapnelGained === true;

    case 'OnGoldArmorConverted':
      return phase === 'ON_GOLD_ARMOR_CONVERTED';

    case 'DayStart':
      return context.isDayStart === true;

    case 'FirstTimeWounded':
      return !context.firstTimeWoundedTriggered && context.isWounded === true;

    case 'FirstTimeExposed':
      return !context.firstTimeExposedTriggered && context.isExposed === true;

    case 'FirstTimeGainShrapnel':
      return context.shrapnelGained === true && !context.firstTimeShrapnelTriggered;

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
  effectName: string,
  source?: CombatSourceRef
): EffectResult {
  const logs: EffectLogEntry[] = [];
  let { state } = ctx;
  const owner = ctx.owner === 'player' ? state.player : state.enemy;
  const enemy = ctx.owner === 'player' ? state.enemy : state.player;
  const target = ctx.owner === 'player' ? 'enemy' : 'player';

  // Check once-per-turn
  if (
    effect.oncePerTurn &&
    ctx.firedThisTurn.has(effectId) &&
    !ctx.allowRepeatEffectIds?.has(effectId)
  ) {
    return { state, applied: false, logs };
  }

  // Check condition
  const isVampiricToothHeal =
    source?.id === 'I56' && effect.effectType === 'Heal' && ctx.phase === 'ON_HIT';

  if (
    !checkCondition(
      effect.condition,
      owner,
      enemy,
      {
        ownerExposedOverride: ctx.ownerExposedOverride,
        enemyExposedOverride: ctx.enemyExposedOverride,
      },
      {
        ownerGold: ctx.owner === 'player' ? (ctx.playerGold ?? 0) : (ctx.enemyGold ?? 0),
        enemyGold: ctx.owner === 'player' ? (ctx.enemyGold ?? 0) : (ctx.playerGold ?? 0),
      }
    )
  ) {
    return { state, applied: false, logs };
  }

  if (isVampiricToothHeal && (ctx.enemyBleedBeforeHit ?? 0) <= 0) {
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
        logs.push({ effectName, target, armorLost: armDamage, source });
      }
      if (hpDamage > 0) {
        logs.push({ effectName, target, damage: hpDamage, source });
      }
      break;
    }

    case 'DealNonWeaponDamage': {
      let amplifiedDamage =
        value + ctx.nonWeaponAmplify + getChillDamageBonus(enemy.statusEffects.chill ?? 0);
      let detonationBonus = 0;
      if (ctx.nonWeaponHitsThisTurn === 0) {
        detonationBonus = ctx.doubleDetonationFirst;
      } else if (ctx.nonWeaponHitsThisTurn === 1) {
        detonationBonus = ctx.doubleDetonationSecond;
      }
      amplifiedDamage += detonationBonus;
      ctx.setNonWeaponHitsThisTurn(ctx.nonWeaponHitsThisTurn + 1);
      if (ctx.phase === 'COUNTDOWN') {
        amplifiedDamage += ctx.bombDamageBonus;
        if (ctx.nextBombDamageBonus > 0) {
          amplifiedDamage += ctx.nextBombDamageBonus;
          ctx.setNextBombDamageBonus(0);
        }
        if (ctx.nextBombSelfDamageReduction > 0) {
          ctx.setActiveBombSelfDamageReduction(ctx.nextBombSelfDamageReduction);
          ctx.setNextBombSelfDamageReduction(0);
        }
        ctx.setPendingSelfNonWeaponBonus(detonationBonus);
      }
      const updatedEnemy = {
        ...enemy,
        hp: Math.max(0, enemy.hp - amplifiedDamage),
      };
      state = {
        ...state,
        [target]: updatedEnemy,
      };
      logs.push({
        effectName,
        target,
        damage: amplifiedDamage,
        nonWeaponDamage: amplifiedDamage,
        source,
      });
      break;
    }

    case 'DealSelfNonWeaponDamage': {
      const pendingBonus = ctx.phase === 'COUNTDOWN' ? ctx.pendingSelfNonWeaponBonus : 0;
      const activeReduction = ctx.phase === 'COUNTDOWN' ? ctx.activeBombSelfDamageReduction : 0;
      ctx.setPendingSelfNonWeaponBonus(0);
      ctx.setActiveBombSelfDamageReduction(0);
      let amplifiedDamage = Math.max(
        0,
        value +
          ctx.nonWeaponAmplify +
          pendingBonus -
          activeReduction +
          getChillDamageBonus(owner.statusEffects.chill ?? 0)
      );
      if (ctx.phase === 'COUNTDOWN' && ctx.blastSelfDamageMultiplier < 100) {
        amplifiedDamage = Math.floor((amplifiedDamage * ctx.blastSelfDamageMultiplier) / 100);
      }
      const updatedOwner = {
        ...owner,
        hp: Math.max(0, owner.hp - amplifiedDamage),
      };
      state = {
        ...state,
        [ctx.owner]: updatedOwner,
      };
      logs.push({
        effectName,
        target: ctx.owner,
        damage: amplifiedDamage,
        nonWeaponDamage: amplifiedDamage,
        source,
      });
      break;
    }

    case 'Heal': {
      const healValue = isVampiricToothHeal ? Math.min(value, ctx.enemyBleedBeforeHit ?? 0) : value;
      const healed = Math.min(healValue, owner.maxHp - owner.hp);
      if (healed > 0) {
        const updatedOwner = {
          ...owner,
          hp: owner.hp + healed,
        };
        state = {
          ...state,
          [ctx.owner]: updatedOwner,
        };
        logs.push({ effectName, target: ctx.owner, healing: healed, source });
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
      logs.push({ effectName, target: ctx.owner, armorGained: value, source });
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
      logs.push({ effectName, target: ctx.owner, source, atkGained: value });
      break;
    }

    case 'GainGearAtk': {
      const updatedOwner = {
        ...owner,
        bonusAtk: owner.bonusAtk + value,
      };
      state = {
        ...state,
        [ctx.owner]: updatedOwner,
      };
      logs.push({ effectName, target: ctx.owner, source, atkGained: value });
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
      logs.push({ effectName, target: ctx.owner, source, spdGained: value });
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
      logs.push({ effectName, target: ctx.owner, source, digGained: value });
      break;
    }

    case 'GainGold': {
      const newGold = ctx.playerGold + value;
      ctx.updateGold(newGold);
      ctx.playerGold = newGold;
      const goldKey = ctx.owner === 'player' ? 'playerGold' : 'enemyGold';
      state = { ...state, [goldKey]: Math.max(0, newGold) };
      logs.push({ effectName, target: ctx.owner, goldChange: value, isGoldGain: true, source });
      break;
    }

    case 'ApplyChill': {
      const reflected = applyReflectableStatusToOpponent(
        state,
        ctx,
        effectName,
        source,
        'chill',
        value
      );
      state = reflected.state;
      logs.push(...reflected.logs);
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
        source,
      });
      break;
    }

    case 'ApplyRust': {
      const reflected = applyReflectableStatusToOpponent(
        state,
        ctx,
        effectName,
        source,
        'rust',
        value
      );
      state = reflected.state;
      logs.push(...reflected.logs);
      break;
    }

    case 'ApplyBleed': {
      const reflected = applyReflectableStatusToOpponent(
        state,
        ctx,
        effectName,
        source,
        'bleed',
        value
      );
      state = reflected.state;
      logs.push(...reflected.logs);
      break;
    }

    case 'ApplyReflection': {
      const updatedOwner = applyStatus(owner, 'reflection', value);
      state = {
        ...state,
        [ctx.owner]: updatedOwner,
      };
      logs.push({
        effectName,
        target: ctx.owner,
        statusApplied: { type: 'reflection', stacks: value },
        source,
      });
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
        logs.push({ effectName, target, armorLost: removed, source });
      }
      break;
    }

    case 'RemoveOwnArmor': {
      const removed = Math.min(value, owner.arm);
      if (removed > 0) {
        const updatedOwner = {
          ...owner,
          arm: owner.arm - removed,
        };
        state = {
          ...state,
          [ctx.owner]: updatedOwner,
        };
        logs.push({ effectName, target: ctx.owner, armorLost: removed, source });
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
      logs.push({ effectName, target: ctx.owner, source });
      break;
    }

    case 'StealGold': {
      const available = Math.max(0, ctx.enemyGold ?? 0);
      const stolen = Math.min(value, available);
      if (stolen > 0) {
        const newEnemyGold = available - stolen;
        const newOwnerGold = ctx.playerGold + stolen;
        ctx.updateEnemyGold?.(newEnemyGold);
        ctx.updateGold(newOwnerGold);
        ctx.enemyGold = newEnemyGold;
        ctx.playerGold = newOwnerGold;
        const ownerGoldKey = ctx.owner === 'player' ? 'playerGold' : 'enemyGold';
        const enemyGoldKey = ctx.owner === 'player' ? 'enemyGold' : 'playerGold';
        state = {
          ...state,
          [ownerGoldKey]: Math.max(0, newOwnerGold),
          [enemyGoldKey]: Math.max(0, newEnemyGold),
        };
        ctx.setLastGoldStolen?.(stolen);
        logs.push({ effectName, target, goldChange: stolen, source });
      }
      break;
    }

    case 'GoldToArmor': {
      let availableGold =
        (ctx.lastGoldStolen ?? 0) > 0 ? (ctx.lastGoldStolen ?? 0) : ctx.playerGold;
      if (source?.kind === 'boss' && source.id === 'B-A-W3-02') {
        availableGold = ctx.enemyGold ?? 0;
      }
      let armorGained = value > 0 ? Math.floor(availableGold / value) : 0;
      if (source?.kind === 'boss' && source.id === 'B-A-W3-02') {
        armorGained = Math.min(armorGained, 12);
      }
      if (armorGained > 0) {
        const updatedOwner = {
          ...owner,
          arm: owner.arm + armorGained,
        };
        state = {
          ...state,
          [ctx.owner]: updatedOwner,
        };
        logs.push({ effectName, target: ctx.owner, armorGained, source });
      }
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
      logs.push({ effectName, target: ctx.owner, healing: value, source });
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
      logs.push({ effectName, target, source, spdGained: -value });
      break;
    }

    case 'GoldToArmorScaled': {
      // Gain armor = floor(owner gold / 6), capped at the effect value.
      const ownerGold = ctx.owner === 'player' ? (ctx.playerGold ?? 0) : (ctx.enemyGold ?? 0);
      const armorGained = Math.min(Math.floor(ownerGold / 6), value);
      if (armorGained > 0) {
        const updatedOwner = {
          ...owner,
          arm: owner.arm + armorGained,
        };
        state = {
          ...state,
          [ctx.owner]: updatedOwner,
        };
        logs.push({ effectName, target: ctx.owner, armorGained, source });
      }
      break;
    }

    case 'ConsumeGoldForArmor': {
      // Consume 1 gold to gain [value] armor
      const limitReached =
        ctx.goldArmorConversionLimit > 0 &&
        ctx.goldArmorConversionsUsed >= ctx.goldArmorConversionLimit;
      if (!limitReached && ctx.playerGold >= 1) {
        const newGold = ctx.playerGold - 1;
        ctx.updateGold(newGold);
        ctx.playerGold = newGold;
        ctx.setGoldArmorConversionsUsed(ctx.goldArmorConversionsUsed + 1);
        const updatedOwner = {
          ...owner,
          arm: owner.arm + value,
        };
        const goldKey = ctx.owner === 'player' ? 'playerGold' : 'enemyGold';
        state = {
          ...state,
          [ctx.owner]: updatedOwner,
          [goldKey]: Math.max(0, newGold),
        };
        logs.push({ effectName, target: ctx.owner, armorGained: value, goldChange: -1, source });
      }
      break;
    }

    case 'PreventDeath': {
      // This is tracked separately, just increment charges
      ctx.setPreventDeathCharges(ctx.preventDeathCharges + 1);
      logs.push({ effectName, target: ctx.owner, source });
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
        logs.push({ effectName, target: ctx.owner, healing: armorBonus, source });
      }
      break;
    }

    case 'ReduceAllCountdowns': {
      // Reduce all countdown items by value
      ctx.countdownItems.forEach((current: number, gearId: GearId) => {
        ctx.countdownItems.set(gearId, Math.max(0, current - value));
      });
      if (ctx.setCountdownTurnBonus) {
        ctx.setCountdownTurnBonus((ctx.countdownTurnBonus ?? 0) + value);
      }
      logs.push({ effectName, target: 'none', source });
      break;
    }

    case 'ReduceWeaponDamageWhileArmored':
    case 'BombDamageBonus':
    case 'ShrapnelReflectBonus':
    case 'OnHitPerStrike':
    case 'LimitGoldArmorConversions': {
      logs.push({ effectName, target: 'none', source });
      break;
    }

    case 'AmplifyNonWeaponDamage': {
      ctx.setNonWeaponAmplify(ctx.nonWeaponAmplify + Math.max(0, value));
      logs.push({ effectName, target: 'none', source });
      break;
    }

    case 'StoreDamage': {
      ctx.setStoredDamage(ctx.storedDamage + value);
      logs.push({ effectName, target: 'none', source });
      break;
    }

    case 'EmpowerNextNonWeaponDamage':
    case 'ShardsEveryTurn':
    case 'PreserveShrapnel':
    case 'AmplifyGoldGain':
    case 'DoubleDetonationFirst':
    case 'DoubleDetonationSecond': {
      logs.push({ effectName, target: 'none', source });
      break;
    }

    case 'EmpowerNextBombDamage': {
      ctx.setNextBombDamageBonus(ctx.nextBombDamageBonus + Math.max(0, value));
      logs.push({ effectName, target: 'none', source });
      break;
    }

    case 'ReduceNextBombSelfDamage': {
      if (ctx.phase === 'TURN_START') {
        ctx.setNextBombSelfDamageReduction(
          Math.max(ctx.nextBombSelfDamageReduction, Math.max(0, value))
        );
      } else {
        ctx.setNextBombSelfDamageReduction(ctx.nextBombSelfDamageReduction + Math.max(0, value));
      }
      logs.push({ effectName, target: 'none', source });
      break;
    }

    case 'HalfGearAtkAfterSecondStrike': {
      // Resolver-specific behavior is handled in resolver.ts.
      logs.push({ effectName, target: 'none', source });
      break;
    }

    case 'BlastImmunity':
    case 'DoubleBombTrigger':
    case 'DoubleOnHitEffects':
    case 'TriggerAllShards':
    case 'StealGold':
    case 'GoldToArmor':
    case 'ApplyReflection':
    case 'ApplyBomb':
      // These are flag-based effects handled at battle start
      logs.push({ effectName, target: 'none', source });
      break;

    case 'SetArmorPiercing':
      ctx.setArmorPiercing(Math.max(ctx.armorPiercing, value));
      logs.push({ effectName, target: 'none', source });
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
  effects: Array<{
    effect: ItemEffect;
    id: string;
    name: string;
    source?: CombatSourceRef;
    sourceInstanceId?: string;
  }>;
  ctx: CombatEffectContext;
  phase: string;
  triggerContext?: {
    isFirstStrike?: boolean;
    enemyBleedBeforeHit?: number;
    wasWounded?: boolean;
    isWounded?: boolean;
    wasExposed?: boolean;
    isExposed?: boolean;
    enemyTookBleedDamage?: boolean;
    rustApplied?: boolean;
    shrapnelGained?: boolean;
    firstTimeWoundedTriggered?: boolean;
    firstTimeExposedTriggered?: boolean;
    firstTimeShrapnelTriggered?: boolean;
    isDayStart?: boolean;
    ownerActsFirst?: boolean;
    shardsEveryTurn?: boolean;
  };
}

export function processEffects(input: ProcessEffectsInput): EffectResult {
  let { state } = input.ctx;
  const allLogs: EffectLogEntry[] = [];
  let anyApplied = false;
  const isExecutionEmblemEffect = (source?: CombatSourceRef): boolean =>
    source?.kind === 'gear' && source.id === 'I54';
  const hasLethalCombatant = (nextState: CombatState): boolean =>
    nextState.player.hp <= 0 || nextState.enemy.hp <= 0;
  let lethalSourceInstanceId: string | null = null;
  let lethalStartState: CombatState | undefined;
  let sourceStartState: CombatState | undefined;
  let currentSourceInstanceId: string | undefined;

  const isUnconditionalStatusApply = (effect: ItemEffect): boolean =>
    effect.condition.type === 'None' &&
    (effect.effectType === 'ApplyChill' ||
      effect.effectType === 'ApplyShrapnel' ||
      effect.effectType === 'ApplyRust' ||
      effect.effectType === 'ApplyBleed');

  for (const firstPass of [true, false]) {
    for (const { effect, id, name, source, sourceInstanceId } of input.effects) {
      if (lethalSourceInstanceId && sourceInstanceId !== lethalSourceInstanceId) {
        break;
      }
      if (currentSourceInstanceId !== sourceInstanceId) {
        currentSourceInstanceId = sourceInstanceId;
        sourceStartState = state;
      }
      const shouldRunInPass = firstPass
        ? isUnconditionalStatusApply(effect)
        : !isUnconditionalStatusApply(effect);
      if (!shouldRunInPass) continue;

      if (
        input.phase === 'ON_HIT' &&
        input.triggerContext?.isFirstStrike === false &&
        isExecutionEmblemEffect(source)
      ) {
        continue;
      }

      // Check if this effect should trigger for the current phase
      const shouldFire = shouldTrigger(
        effect.trigger,
        input.phase,
        input.ctx.turn,
        input.triggerContext || {}
      );

      if (!shouldFire) continue;

      // Handle FirstTurnIfFaster/FirstTurnIfSlower special cases
      if (effect.trigger.type === 'FirstTurnIfFaster' && !input.triggerContext?.ownerActsFirst) {
        continue;
      }
      if (effect.trigger.type === 'FirstTurnIfSlower' && input.triggerContext?.ownerActsFirst) {
        continue;
      }

      const result = executeEffect(effect, { ...input.ctx, state }, id, name, source);
      state = result.state;
      allLogs.push(...result.logs);
      if (result.applied) {
        anyApplied = true;
      }
      if (hasLethalCombatant(state)) {
        lethalSourceInstanceId ??= sourceInstanceId ?? null;
        lethalStartState ??= sourceStartState;
      }
    }
    if (hasLethalCombatant(state)) {
      break;
    }
  }

  return { state, applied: anyApplied, logs: allLogs, lethalStartState };
}
