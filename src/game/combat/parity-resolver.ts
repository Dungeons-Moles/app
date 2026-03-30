import type {
  CombatAction,
  CombatActionResult,
  CombatContribution,
  CombatLogEntry,
  CombatResult,
  CombatSourceRef,
  CombatState,
  CombatantState,
  Gear,
  Tool,
} from '@/game/engine/types';
import { CombatPhase } from '@/game/engine/types';
import { processStatusEffectsTurnEnd } from '@/game/combat/status-effects';
import { applyDamage, getChillDamageBonus, isDefeated, isExposed, isWounded } from './damage';
import { createCombatState } from './state';
import type { CombatResolverInput } from './types';
import { collectGearEffects, collectToolEffects } from './effect-bridge';
import {
  checkCondition,
  processEffects,
  type CombatEffectContext,
  type EffectLogEntry,
} from './effect-executor';
import { extractBattleFlags } from './effect-bridge';
import {
  collectLoadoutEffects,
  getBossTraitEffects,
  getFieldEnemyTraitEffects,
} from './parity-effects';
import type { EquippedEffect } from './effect-bridge';

type Side = 'player' | 'enemy';

// Sudden death constants — must match on-chain combat-system engine.rs
const SUDDEN_DEATH_TURN = 20;
const SUDDEN_DEATH_RAMP_TURN = 30;

/**
 * Compute cumulative sudden-death ATK bonus for the given turn.
 * Mirrors `check_sudden_death` in on-chain combat-system.
 */
function checkSuddenDeath(turn: number): number {
  if (turn < SUDDEN_DEATH_TURN) return 0;
  let bonus = turn - (SUDDEN_DEATH_TURN - 1);
  if (turn >= SUDDEN_DEATH_RAMP_TURN) {
    bonus += (turn - (SUDDEN_DEATH_RAMP_TURN - 1)) * 2;
  }
  return bonus;
}

interface SideRuntime {
  effects: EquippedEffect[];
  firedThisTurn: Set<string>;
  battleFlags: ReturnType<typeof extractBattleFlags>;
  preventDeathHeal: number;
  nonWeaponAmplify: number;
  goldArmorConversionsUsed: number;
  storedDamage: number;
  nonWeaponHitsThisTurn: number;
  pendingSelfNonWeaponBonus: number;
  nextBombDamageBonus: number;
  nextBombSelfDamageReduction: number;
  activeBombSelfDamageReduction: number;
  preserveShrapnelCap: number;
  preserveFreshChill: number;
  countdownReduction: number;
  lastGoldStolen: number;
  shardsEveryTurn: boolean;
  wasWounded: boolean;
  wasExposed: boolean;
  hadShrapnel: boolean;
  firstTimeWoundedTriggered: boolean;
  firstTimeExposedTriggered: boolean;
  firstTimeShrapnelTriggered: boolean;
  actedThisTurn: boolean;
  forcedExposedThisTurn: boolean;
  extraStrikesThisTurn: number;
  frostboundExposedTriggered: boolean;
  eldritch75Triggered: boolean;
  eldritch50Triggered: boolean;
  eldritch25Triggered: boolean;
  eldritchBleedActive: boolean;
  atkContributions: Map<string, CombatContribution>;
  gearAtkBonus: number;
}

function sourceKey(source: CombatSourceRef): string {
  return `${source.kind}:${source.id}`;
}

function addContribution(
  map: Map<string, CombatContribution>,
  source: CombatSourceRef | undefined,
  value: number
) {
  if (!source || value <= 0) return;
  const key = sourceKey(source);
  const current = map.get(key);
  if (current) {
    current.value += value;
    return;
  }
  map.set(key, { source, value });
}

function buildInitialAtkContributionMap(
  side: Side,
  input: CombatResolverInput,
  combatant: CombatantState
): Map<string, CombatContribution> {
  const map = new Map<string, CombatContribution>();
  const tool = side === 'player' ? (input.playerTool ?? null) : (input.enemyTool ?? null);
  const gear = side === 'player' ? (input.playerGear ?? []) : (input.enemyGear ?? []);

  const addTool = (item: Tool | null) => {
    if (!item) return;
    const oilAtk = item.oil === 'ATK' ? 1 : 0;
    let bakedAtk = 0;
    for (const entry of collectToolEffects(item)) {
      if (
        entry.effect.trigger.type === 'BattleStart' &&
        entry.effect.condition.type === 'None' &&
        entry.effect.effectType === 'GainAtk' &&
        entry.effect.value > 0
      ) {
        bakedAtk = Math.max(bakedAtk, entry.effect.value);
      }
    }
    const atk = Math.max(item.stats.atk ?? 0, bakedAtk) + oilAtk;
    if (atk <= 0) return;
    addContribution(map, { kind: 'tool', id: item.id, name: item.name }, atk);
  };
  const addGear = (items: Gear[]) => {
    for (const item of items) {
      let bakedAtk = 0;
      for (const entry of collectGearEffects([item])) {
        if (
          entry.effect.trigger.type === 'BattleStart' &&
          entry.effect.condition.type === 'None' &&
          entry.effect.effectType === 'GainAtk' &&
          entry.effect.value > 0
        ) {
          bakedAtk = Math.max(bakedAtk, entry.effect.value);
        }
      }
      const atk = Math.max(item.stats.atk ?? 0, bakedAtk);
      if (atk <= 0) continue;
      addContribution(map, { kind: 'gear', id: item.id, name: item.name }, atk);
    }
  };

  addTool(tool);
  addGear(gear);

  if (map.size === 0 && combatant.atk > 0) {
    if (side === 'enemy' && input.bossId) {
      addContribution(map, { kind: 'boss', id: input.bossId }, combatant.atk);
    } else if (side === 'enemy' && input.enemyId) {
      addContribution(map, { kind: 'enemy', id: input.enemyId }, combatant.atk);
    }
  }

  return map;
}

function computeInitialGearAtkBonus(gear: Gear[]): number {
  let total = 0;
  for (const item of gear) {
    let bakedAtk = 0;
    for (const entry of collectGearEffects([item])) {
      if (
        entry.effect.trigger.type === 'BattleStart' &&
        entry.effect.condition.type === 'None' &&
        entry.effect.effectType === 'GainAtk' &&
        entry.effect.value > 0
      ) {
        bakedAtk = Math.max(bakedAtk, entry.effect.value);
      }
    }
    total += Math.max(item.stats.atk ?? 0, bakedAtk);
  }
  return total;
}

function addLogEntry(state: CombatState, entry: CombatLogEntry): CombatState {
  return {
    ...state,
    log: [...state.log, entry],
  };
}

function toCombatLogEntry(
  state: CombatState,
  actor: Side,
  effectLog: EffectLogEntry,
  timing: string
): CombatLogEntry {
  let action: CombatAction = 'TRIGGER_ITEM';
  const result: CombatActionResult = { effectName: effectLog.effectName, source: effectLog.source };

  if (effectLog.statusApplied) {
    action = 'APPLY_STATUS';
    result.statusApplied = {
      type: effectLog.statusApplied.type as keyof CombatantState['statusEffects'],
      stacks: effectLog.statusApplied.stacks,
    };
  }
  if (effectLog.statusRemoved) {
    action = 'PHASE_TRIGGER';
    result.statusRemoved = {
      type: effectLog.statusRemoved.type as keyof CombatantState['statusEffects'],
      stacks: effectLog.statusRemoved.stacks,
    };
  }
  if (effectLog.healing) {
    action = 'HEAL';
    result.healing = effectLog.healing;
  }
  if (effectLog.damage) {
    if (action === 'TRIGGER_ITEM') action = 'TRIGGER_ITEM';
    result.damage = effectLog.damage;
  }
  if (effectLog.armorGained) {
    action = 'GAIN_ARMOR';
    result.armorGained = effectLog.armorGained;
  }
  if (effectLog.armorLost) {
    action = 'LOSE_ARMOR';
    result.armorLost = effectLog.armorLost;
  }
  if (effectLog.goldChange) {
    if (effectLog.isGoldGain) {
      result.goldGained = effectLog.goldChange;
    } else if (effectLog.target === actor && effectLog.goldChange < 0) {
      result.goldSpent = Math.abs(effectLog.goldChange);
    } else {
      result.goldStolen = Math.abs(effectLog.goldChange);
    }
  }
  if (effectLog.atkGained) {
    result.atkBonus = effectLog.atkGained;
  }
  if (effectLog.spdGained) {
    result.spdBonus = effectLog.spdGained;
  }
  if (effectLog.digGained) {
    result.digBonus = effectLog.digGained;
  }

  return {
    turn: state.turn,
    timing: timing as CombatLogEntry['timing'],
    actor,
    action,
    target: effectLog.target,
    result,
    rngValues: [],
  };
}

function getAttackSource(input: CombatResolverInput, side: Side): CombatSourceRef | undefined {
  if (side === 'player') {
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

function getGold(state: CombatState, side: Side): number {
  return side === 'player' ? state.playerGold : state.enemyGold;
}

function setGold(state: CombatState, side: Side, amount: number): CombatState {
  return side === 'player'
    ? { ...state, playerGold: Math.max(0, amount) }
    : { ...state, enemyGold: Math.max(0, amount) };
}

function getOpposite(side: Side): Side {
  return side === 'player' ? 'enemy' : 'player';
}

function getCombatant(state: CombatState, side: Side): CombatantState {
  return side === 'player' ? state.player : state.enemy;
}

function setCombatant(state: CombatState, side: Side, combatant: CombatantState): CombatState {
  return side === 'player' ? { ...state, player: combatant } : { ...state, enemy: combatant };
}

function buildSideRuntime(input: CombatResolverInput, side: Side): SideRuntime {
  const gear = side === 'player' ? (input.playerGear ?? []) : (input.enemyGear ?? []);
  const tool = side === 'player' ? (input.playerTool ?? null) : (input.enemyTool ?? null);
  const activeItemSets =
    side === 'player' ? (input.activeItemSets ?? []) : (input.enemyActiveItemSets ?? []);
  const loadoutEffects = collectLoadoutEffects(gear, tool, activeItemSets, {
    excludeBakedInBattleStartStats: true,
  });
  const traitEffects =
    side === 'enemy'
      ? input.bossId
        ? getBossTraitEffects(input.bossId)
        : input.enemyId
          ? getFieldEnemyTraitEffects(input.enemyId, input.playerGold ?? 0)
          : []
      : [];
  const effects = [...loadoutEffects, ...traitEffects];
  const preserveShrapnelCap = effects
    .filter((entry) => entry.effect.effectType === 'PreserveShrapnel')
    .reduce((sum, entry) => sum + entry.effect.value, 0);
  const shardsEveryTurn = effects.some((entry) => entry.effect.effectType === 'ShardsEveryTurn');
  const battleFlags = extractBattleFlags(effects);

  return {
    effects,
    firedThisTurn: new Set(),
    battleFlags,
    preventDeathHeal: battleFlags.preventDeathHeal,
    nonWeaponAmplify: battleFlags.nonWeaponAmplify,
    goldArmorConversionsUsed: 0,
    storedDamage: 0,
    nonWeaponHitsThisTurn: 0,
    pendingSelfNonWeaponBonus: 0,
    nextBombDamageBonus: 0,
    nextBombSelfDamageReduction: 0,
    activeBombSelfDamageReduction: 0,
    preserveShrapnelCap,
    preserveFreshChill: 0,
    countdownReduction: 0,
    lastGoldStolen: 0,
    shardsEveryTurn,
    wasWounded: false,
    wasExposed: false,
    hadShrapnel: false,
    firstTimeWoundedTriggered: false,
    firstTimeExposedTriggered: false,
    firstTimeShrapnelTriggered: false,
    actedThisTurn: false,
    forcedExposedThisTurn: false,
    extraStrikesThisTurn: 0,
    frostboundExposedTriggered: false,
    eldritch75Triggered: false,
    eldritch50Triggered: false,
    eldritch25Triggered: false,
    eldritchBleedActive: false,
    atkContributions: buildInitialAtkContributionMap(
      side,
      input,
      side === 'player' ? input.player : input.enemy
    ),
    gearAtkBonus: computeInitialGearAtkBonus(gear),
  };
}

function runEffectsForSide(
  state: CombatState,
  runtime: Record<Side, SideRuntime>,
  input: CombatResolverInput,
  owner: Side,
  phase: string,
  ownerActsFirst: boolean,
  extra?: Partial<Parameters<typeof processEffects>[0]['triggerContext']>,
  options?: {
    allowRepeatEffectIds?: Set<string>;
    /** On-chain parity: skip finalizeImmediateLethal inside this call (caller handles it). */
    skipLethalCheck?: boolean;
    /** On-chain parity: skip cross-source lethal gating in processEffects. */
    skipLethalGating?: boolean;
  }
): CombatState {
  const sideRuntime = runtime[owner];
  const enemy = getOpposite(owner);
  let nextState = state;
  const ctx: CombatEffectContext = {
    state: nextState,
    owner,
    phase,
    turn: nextState.turn,
    playerGold: getGold(nextState, owner),
    enemyGold: getGold(nextState, enemy),
    updateGold: (amount: number) => {
      nextState = setGold(nextState, owner, amount);
    },
    updateEnemyGold: (amount: number) => {
      nextState = setGold(nextState, enemy, amount);
    },
    lastGoldStolen: sideRuntime.lastGoldStolen,
    setLastGoldStolen: (amount: number) => {
      sideRuntime.lastGoldStolen = Math.max(0, amount);
      ctx.lastGoldStolen = sideRuntime.lastGoldStolen;
    },
    addLog: () => {},
    firedThisTurn: sideRuntime.firedThisTurn,
    storedDamage: sideRuntime.storedDamage,
    setStoredDamage: (value: number) => {
      sideRuntime.storedDamage = Math.max(0, value);
      ctx.storedDamage = sideRuntime.storedDamage;
    },
    nonWeaponAmplify: sideRuntime.nonWeaponAmplify,
    setNonWeaponAmplify: (value: number) => {
      sideRuntime.nonWeaponAmplify = Math.max(0, value);
      ctx.nonWeaponAmplify = sideRuntime.nonWeaponAmplify;
    },
    blastSelfDamageMultiplier: sideRuntime.battleFlags.blastSelfDamageMultiplier,
    doubleBombTrigger: sideRuntime.battleFlags.doubleBombTrigger,
    doubleDetonationFirst: sideRuntime.battleFlags.doubleDetonationFirst,
    doubleDetonationSecond: sideRuntime.battleFlags.doubleDetonationSecond,
    nonWeaponHitsThisTurn: sideRuntime.nonWeaponHitsThisTurn,
    setNonWeaponHitsThisTurn: (value: number) => {
      sideRuntime.nonWeaponHitsThisTurn = Math.max(0, value);
      ctx.nonWeaponHitsThisTurn = sideRuntime.nonWeaponHitsThisTurn;
    },
    pendingSelfNonWeaponBonus: sideRuntime.pendingSelfNonWeaponBonus,
    setPendingSelfNonWeaponBonus: (value: number) => {
      sideRuntime.pendingSelfNonWeaponBonus = Math.max(0, value);
      ctx.pendingSelfNonWeaponBonus = sideRuntime.pendingSelfNonWeaponBonus;
    },
    nextBombDamageBonus: sideRuntime.nextBombDamageBonus,
    setNextBombDamageBonus: (value: number) => {
      sideRuntime.nextBombDamageBonus = Math.max(0, value);
      ctx.nextBombDamageBonus = sideRuntime.nextBombDamageBonus;
    },
    nextBombSelfDamageReduction: sideRuntime.nextBombSelfDamageReduction,
    setNextBombSelfDamageReduction: (value: number) => {
      sideRuntime.nextBombSelfDamageReduction = Math.max(0, value);
      ctx.nextBombSelfDamageReduction = sideRuntime.nextBombSelfDamageReduction;
    },
    activeBombSelfDamageReduction: sideRuntime.activeBombSelfDamageReduction,
    setActiveBombSelfDamageReduction: (value: number) => {
      sideRuntime.activeBombSelfDamageReduction = Math.max(0, value);
      ctx.activeBombSelfDamageReduction = sideRuntime.activeBombSelfDamageReduction;
    },
    doubleOnHitEffects: sideRuntime.battleFlags.doubleOnHitEffects,
    onHitPerStrike: sideRuntime.battleFlags.onHitPerStrike,
    bombDamageBonus: sideRuntime.battleFlags.bombDamageBonus,
    weaponDamageReductionWhileArmored: sideRuntime.battleFlags.weaponDamageReductionWhileArmored,
    shrapnelReflectBonus: sideRuntime.battleFlags.shrapnelReflectBonus,
    armorPiercing: sideRuntime.battleFlags.armorPiercing,
    setArmorPiercing: (value: number) => {
      sideRuntime.battleFlags.armorPiercing = Math.max(0, value);
      ctx.armorPiercing = sideRuntime.battleFlags.armorPiercing;
    },
    preventDeathHeal: sideRuntime.preventDeathHeal,
    preventDeathCharges: sideRuntime.battleFlags.preventDeathCharges,
    setPreventDeathCharges: (value: number) => {
      sideRuntime.battleFlags.preventDeathCharges = Math.max(0, value);
      ctx.preventDeathCharges = sideRuntime.battleFlags.preventDeathCharges;
    },
    goldArmorConversionLimit: sideRuntime.battleFlags.goldArmorConversionLimit,
    goldArmorConversionsUsed: sideRuntime.goldArmorConversionsUsed,
    setGoldArmorConversionsUsed: (value: number) => {
      sideRuntime.goldArmorConversionsUsed = Math.max(0, value);
      ctx.goldArmorConversionsUsed = sideRuntime.goldArmorConversionsUsed;
    },
    countdownItems: new Map(),
    countdownReduction: sideRuntime.countdownReduction,
    setCountdownReduction: (value: number) => {
      sideRuntime.countdownReduction = Math.max(0, value);
    },
    firstTimeWoundedTriggered: sideRuntime.firstTimeWoundedTriggered,
    setFirstTimeWoundedTriggered: () => {},
    ownerExposedOverride: sideRuntime.forcedExposedThisTurn,
    enemyExposedOverride: runtime[enemy].forcedExposedThisTurn,
    enemyBleedBeforeHit: extra?.enemyBleedBeforeHit ?? 0,
    allowRepeatEffectIds: options?.allowRepeatEffectIds,
    gearAtkBonus: sideRuntime.gearAtkBonus,
    setGearAtkBonus: (value: number) => {
      sideRuntime.gearAtkBonus = Math.max(0, value);
      ctx.gearAtkBonus = sideRuntime.gearAtkBonus;
    },
  };

  const effectEntries = sideRuntime.effects.map((entry) => ({
    effect: entry.effect,
    id: entry.id,
    name: entry.name,
    sourceInstanceId: entry.sourceInstanceId,
    source: {
      kind: entry.sourceKind,
      id: String(entry.sourceId),
      name: entry.name,
    } as CombatSourceRef,
  }));
  const passCount = phase === 'COUNTDOWN' && sideRuntime.battleFlags.doubleBombTrigger ? 2 : 1;

  for (let pass = 0; pass < passCount; pass += 1) {
    ctx.state = nextState;
    const result = processEffects({
      effects: effectEntries,
      ctx,
      phase,
      triggerContext: {
        ownerActsFirst,
        shardsEveryTurn: sideRuntime.shardsEveryTurn,
        countdownReduction: sideRuntime.countdownReduction,
        firstTimeWoundedTriggered: sideRuntime.firstTimeWoundedTriggered,
        firstTimeExposedTriggered: sideRuntime.firstTimeExposedTriggered,
        firstTimeShrapnelTriggered: sideRuntime.firstTimeShrapnelTriggered,
        ...extra,
      },
      skipLethalGating: options?.skipLethalGating,
    });
    nextState = result.state;
    for (const logEntry of result.logs) {
      if (logEntry.atkGained && logEntry.source && logEntry.target === owner) {
        addContribution(sideRuntime.atkContributions, logEntry.source, logEntry.atkGained);
      }
      if (logEntry.statusApplied?.type === 'chill') {
        const targetSide =
          logEntry.target === 'player' ? 'player' : logEntry.target === 'enemy' ? 'enemy' : null;
        if (targetSide && runtime[targetSide].actedThisTurn) {
          runtime[targetSide].preserveFreshChill += logEntry.statusApplied.stacks;
        }
      }
    }
    for (const logEntry of result.logs) {
      nextState = addLogEntry(
        nextState,
        toCombatLogEntry(nextState, owner, logEntry, phase as CombatLogEntry['timing'])
      );
    }
    if (!options?.skipLethalCheck) {
      nextState = finalizeImmediateLethal(
        nextState,
        runtime,
        phase as CombatLogEntry['timing'],
        input,
        result.lethalStartState
      );
      if (nextState.result) {
        return nextState;
      }
    }
    for (const logEntry of result.logs) {
      if (!logEntry.nonWeaponDamage || logEntry.target === 'none') continue;
      const targetSide = logEntry.target === 'player' ? 'player' : 'enemy';
      nextState = runEffectsForSide(
        nextState,
        runtime,
        input,
        targetSide,
        'ON_DEAL_NON_WEAPON_DAMAGE',
        targetSide === owner ? ownerActsFirst : !ownerActsFirst,
        undefined,
        options?.skipLethalCheck || options?.skipLethalGating
          ? { skipLethalCheck: options.skipLethalCheck, skipLethalGating: options.skipLethalGating }
          : undefined
      );
      if (!options?.skipLethalCheck && nextState.result) {
        return nextState;
      }
    }
    for (const logEntry of result.logs) {
      if (logEntry.statusApplied?.type !== 'rust') continue;
      if (logEntry.target !== getOpposite(owner)) continue;
      nextState = runEffectsForSide(
        nextState,
        runtime,
        input,
        owner,
        'ON_APPLY_RUST',
        ownerActsFirst,
        {
          rustApplied: true,
        },
        options?.skipLethalCheck || options?.skipLethalGating
          ? { skipLethalCheck: options.skipLethalCheck, skipLethalGating: options.skipLethalGating }
          : undefined
      );
      if (!options?.skipLethalCheck && nextState.result) {
        return nextState;
      }
    }
  }
  if (options?.skipLethalCheck) {
    return nextState;
  }
  return finalizeImmediateLethal(nextState, runtime, phase as CombatLogEntry['timing'], input);
}

function processTransitionEffects(
  state: CombatState,
  runtime: Record<Side, SideRuntime>,
  input: CombatResolverInput,
  owner: Side,
  ownerActsFirst: boolean
): CombatState {
  const combatant = getCombatant(state, owner);
  const sideRuntime = runtime[owner];
  const nextWounded = isWounded(combatant);
  const nextExposed = isExposed(combatant) || sideRuntime.forcedExposedThisTurn;
  const hasShrapnel = (combatant.statusEffects.shrapnel ?? 0) > 0;
  let nextState = runEffectsForSide(state, runtime, input, owner, 'TRANSITION', ownerActsFirst, {
    wasWounded: sideRuntime.wasWounded,
    isWounded: nextWounded,
    wasExposed: sideRuntime.wasExposed,
    isExposed: nextExposed,
    shrapnelGained: !sideRuntime.hadShrapnel && hasShrapnel,
    firstTimeWoundedTriggered: sideRuntime.firstTimeWoundedTriggered,
    firstTimeExposedTriggered: sideRuntime.firstTimeExposedTriggered,
    firstTimeShrapnelTriggered: sideRuntime.firstTimeShrapnelTriggered,
  });
  if (nextState.result) {
    return nextState;
  }
  if (!sideRuntime.wasExposed && nextExposed && sideRuntime.storedDamage > 0) {
    const target = getOpposite(owner);
    const storedDamage = sideRuntime.storedDamage;
    const targetCombatant = getCombatant(nextState, target);
    nextState = setCombatant(nextState, target, {
      ...targetCombatant,
      hp: Math.max(0, targetCombatant.hp - storedDamage),
    });
    sideRuntime.storedDamage = 0;
    nextState = addLogEntry(nextState, {
      turn: nextState.turn,
      timing: CombatPhase.TurnStart,
      actor: owner,
      action: 'TRIGGER_ITEM',
      target,
      result: {
        damage: storedDamage,
        effectName: 'Time Charge',
        source: { kind: 'gear', id: 'I31', name: 'Time Charge' },
      },
      rngValues: [],
    });
    nextState = finalizeImmediateLethal(nextState, runtime, CombatPhase.TurnStart, input, state);
    if (nextState.result) {
      return nextState;
    }
  }
  if (
    input.bossId === 'B-B-W3-01' &&
    owner === 'enemy' &&
    nextExposed &&
    !sideRuntime.frostboundExposedTriggered
  ) {
    sideRuntime.frostboundExposedTriggered = true;
    nextState = setCombatant(nextState, 'enemy', {
      ...getCombatant(nextState, 'enemy'),
      bonusSpd: getCombatant(nextState, 'enemy').bonusSpd + 2,
      statusEffects: {
        ...getCombatant(nextState, 'enemy').statusEffects,
        chill: 0,
      },
    });
    nextState = addLogEntry(nextState, {
      turn: nextState.turn,
      timing: CombatPhase.TurnStart,
      actor: 'enemy',
      action: 'TRIGGER_ITEM',
      target: 'enemy',
      result: {
        effectName: 'Crack Ice',
        source: { kind: 'boss', id: 'B-B-W3-01', name: 'The Frostbound Leviathan' },
        statusRemoved: {
          type: 'chill',
          stacks: getCombatant(nextState, 'enemy').statusEffects.chill ?? 0,
        },
        spdBonus: 2,
      },
      rngValues: [],
    });
  }
  sideRuntime.wasWounded = nextWounded;
  sideRuntime.wasExposed = nextExposed;
  sideRuntime.hadShrapnel = hasShrapnel;
  if (nextWounded) {
    sideRuntime.firstTimeWoundedTriggered = true;
  }
  if (nextExposed) {
    sideRuntime.firstTimeExposedTriggered = true;
  }
  if (hasShrapnel) {
    sideRuntime.firstTimeShrapnelTriggered = true;
  }
  return nextState;
}

function finalizeImmediateLethal(
  state: CombatState,
  runtime: Record<Side, SideRuntime>,
  timing: CombatLogEntry['timing'],
  input: CombatResolverInput,
  preExchangeState?: CombatState
): CombatState {
  let nextState = applyPreventDeathIfNeeded(state, runtime, 'player', timing);
  nextState = applyPreventDeathIfNeeded(nextState, runtime, 'enemy', timing);
  const result = determineResult(nextState, input, preExchangeState);
  if (!result) {
    return nextState;
  }
  return {
    ...nextState,
    result,
  };
}

function processVictoryEffects(
  state: CombatState,
  runtime: Record<Side, SideRuntime>,
  input: CombatResolverInput,
  winner: Side
): CombatState {
  const resolvedResult = state.result;
  const nextState = runEffectsForSide(state, runtime, input, winner, 'VICTORY', true);
  return resolvedResult ? { ...nextState, result: resolvedResult } : nextState;
}

function applyPreventDeathIfNeeded(
  state: CombatState,
  runtime: Record<Side, SideRuntime>,
  side: Side,
  timing: CombatLogEntry['timing']
): CombatState {
  const combatant = getCombatant(state, side);
  const sideRuntime = runtime[side];
  if (combatant.hp > 0 || sideRuntime.battleFlags.preventDeathCharges <= 0) {
    return state;
  }

  const healAmount = Math.max(1, sideRuntime.preventDeathHeal);
  sideRuntime.battleFlags.preventDeathCharges -= 1;

  let nextState = setCombatant(state, side, {
    ...combatant,
    hp: Math.min(combatant.maxHp, healAmount),
  });
  nextState = addLogEntry(nextState, {
    turn: nextState.turn,
    timing,
    actor: side,
    action: 'TRIGGER_ITEM',
    target: side,
    result: {
      healing: healAmount,
      effectName: 'Last Breath Sigil',
      source: { kind: 'gear', id: 'I49', name: 'Last Breath Sigil' },
    },
    rngValues: [],
  });
  return nextState;
}

function processEldritchMolePhases(
  state: CombatState,
  runtime: Record<Side, SideRuntime>,
  input: CombatResolverInput
): CombatState {
  if (input.bossId !== 'B-A-W3-01') return state;

  const sideRuntime = runtime.enemy;
  const boss = getCombatant(state, 'enemy');
  const hpPercent = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
  let nextState = state;

  if (hpPercent <= 0.75 && !sideRuntime.eldritch75Triggered) {
    sideRuntime.eldritch75Triggered = true;
    const armorGain = state.player.dig > boss.dig ? 0 : 6;
    if (armorGain > 0) {
      const updatedBoss = {
        ...getCombatant(nextState, 'enemy'),
        arm: getCombatant(nextState, 'enemy').arm + armorGain,
      };
      nextState = setCombatant(nextState, 'enemy', updatedBoss);
      nextState = addLogEntry(nextState, {
        turn: nextState.turn,
        timing: CombatPhase.TurnStart,
        actor: 'enemy',
        action: 'GAIN_ARMOR',
        target: 'enemy',
        result: {
          armorGained: armorGain,
          effectName: 'Three Phases',
          source: { kind: 'boss', id: 'B-A-W3-01', name: 'The Eldritch Mole' },
        },
        rngValues: [],
      });
    }
  }

  if (hpPercent <= 0.5 && !sideRuntime.eldritch50Triggered) {
    sideRuntime.eldritch50Triggered = true;
    nextState = setCombatant(nextState, 'enemy', {
      ...getCombatant(nextState, 'enemy'),
      strikesPerTurn: getCombatant(nextState, 'enemy').strikesPerTurn + 1,
    });
  }

  if (hpPercent <= 0.25 && !sideRuntime.eldritch25Triggered) {
    sideRuntime.eldritch25Triggered = true;
    sideRuntime.eldritchBleedActive = true;
  }

  return nextState;
}

function processEldritchMoleTurnStart(
  state: CombatState,
  runtime: Record<Side, SideRuntime>,
  input: CombatResolverInput
): CombatState {
  if (input.bossId !== 'B-A-W3-01' || !runtime.enemy.eldritchBleedActive) {
    return state;
  }

  const updatedPlayer = {
    ...getCombatant(state, 'player'),
    statusEffects: {
      ...getCombatant(state, 'player').statusEffects,
      bleed: (getCombatant(state, 'player').statusEffects.bleed ?? 0) + 2,
    },
  };
  let nextState = setCombatant(state, 'player', updatedPlayer);
  nextState = addLogEntry(nextState, {
    turn: nextState.turn,
    timing: CombatPhase.TurnStart,
    actor: 'enemy',
    action: 'APPLY_STATUS',
    target: 'player',
    result: {
      statusApplied: { type: 'bleed', stacks: 2 },
      effectName: 'Three Phases',
      source: { kind: 'boss', id: 'B-A-W3-01', name: 'The Eldritch Mole' },
    },
    rngValues: [],
  });
  return nextState;
}

function performStrike(
  state: CombatState,
  runtime: Record<Side, SideRuntime>,
  input: CombatResolverInput,
  attackerSide: Side,
  strikeIndex: number,
  ownerActsFirst: boolean,
  attackSources: Record<Side, CombatSourceRef | undefined>
): CombatState {
  const defenderSide = getOpposite(attackerSide);

  refreshBattleStartArmorPiercing(state, runtime, attackerSide);

  // Run BEFORE_STRIKE effects (e.g. RemoveArmor before damage)
  state = runEffectsForSide(state, runtime, input, attackerSide, 'BEFORE_STRIKE', ownerActsFirst, {
    isFirstStrike: strikeIndex === 0,
  });
  if (state.result) {
    return state;
  }

  const attacker = getCombatant(state, attackerSide);
  const defender = getCombatant(state, defenderSide);
  const defenderBleedBeforeHit = defender.statusEffects.bleed ?? 0;
  const piercing = runtime[attackerSide].battleFlags.armorPiercing;
  const chillBonus = getChillDamageBonus(defender.statusEffects.chill ?? 0);
  let strikeAtk = Math.max(0, attacker.atk + attacker.bonusAtk);
  if (runtime[attackerSide].battleFlags.halfGearAtkAfterSecondStrike && strikeIndex >= 2) {
    const gearBonus = Math.max(0, runtime[attackerSide].gearAtkBonus);
    const nonGearAtk = Math.max(0, strikeAtk - gearBonus);
    strikeAtk = nonGearAtk + Math.floor(gearBonus / 2);
  }
  let attackPower = strikeAtk + chillBonus;
  const totalArmor = runtime[defenderSide].forcedExposedThisTurn
    ? 0
    : Math.max(0, defender.arm + defender.bonusArm);
  if (totalArmor > 0 && runtime[defenderSide].battleFlags.weaponDamageReductionWhileArmored > 0) {
    attackPower = Math.max(
      1,
      attackPower - runtime[defenderSide].battleFlags.weaponDamageReductionWhileArmored
    );
  }
  const armorSoak = attacker.ignoresArmor
    ? 0
    : Math.min(Math.max(0, totalArmor - piercing), attackPower);
  const hpDamage = Math.max(0, attackPower - armorSoak);
  const damageResult = applyDamage(defender, { armor: armorSoak, hp: hpDamage });
  const attackContributions = Array.from(runtime[attackerSide].atkContributions.values()).map(
    (entry) => ({ source: entry.source, value: entry.value })
  );
  if (chillBonus > 0) {
    attackContributions.push({
      source: { kind: 'status', id: 'chill', name: 'Chill' },
      value: chillBonus,
    });
  }

  let nextState = setCombatant(state, defenderSide, damageResult.combatant);
  nextState = addLogEntry(nextState, {
    turn: nextState.turn,
    timing: attackerSide === 'player' ? CombatPhase.PlayerAttack : CombatPhase.EnemyAttack,
    actor: attackerSide,
    action: 'ATTACK',
    target: defenderSide,
    result: {
      damage: damageResult.hpLost,
      armorLost: damageResult.armorLost,
      source: attackSources[attackerSide],
      contributions: attackContributions,
    },
    rngValues: [],
  });
  // On-chain parity: NO death check after weapon damage.
  // All on-hit effects, shrapnel retaliation, etc. fire before the death check,
  // matching engine.rs line 540 where the only break is at the END of the strike.

  if (runtime[attackerSide].battleFlags.onHitPerStrike && strikeIndex > 0) {
    for (const entry of runtime[attackerSide].effects) {
      if (entry.effect.trigger.type === 'OnHit' && entry.effect.oncePerTurn) {
        runtime[attackerSide].firedThisTurn.delete(entry.id);
      }
    }
  }

  // On-chain parity: all on-hit/on-struck/shrapnel phases fire without intermediate death
  // checks (engine.rs: single `if defender_stats.hp <= 0 { break; }` at line 540 AFTER all).
  const strikeOpts = { skipLethalCheck: true, skipLethalGating: true } as const;

  const firedBeforeOnHit = new Set(runtime[attackerSide].firedThisTurn);
  nextState = runEffectsForSide(nextState, runtime, input, attackerSide, 'ON_HIT', ownerActsFirst, {
    isFirstStrike: strikeIndex === 0,
    enemyBleedBeforeHit: defenderBleedBeforeHit,
  }, strikeOpts);
  if (runtime[attackerSide].battleFlags.doubleOnHitEffects) {
    const firedByFirstOnHitPass = new Set<string>();
    for (const entry of runtime[attackerSide].effects) {
      if (
        entry.effect.trigger.type === 'OnHit' &&
        entry.effect.oncePerTurn &&
        !firedBeforeOnHit.has(entry.id) &&
        runtime[attackerSide].firedThisTurn.has(entry.id)
      ) {
        firedByFirstOnHitPass.add(entry.id);
      }
    }
    nextState = runEffectsForSide(
      nextState,
      runtime,
      input,
      attackerSide,
      'ON_HIT',
      ownerActsFirst,
      {
        isFirstStrike: strikeIndex === 0,
        enemyBleedBeforeHit: defenderBleedBeforeHit,
      },
      {
        allowRepeatEffectIds: firedByFirstOnHitPass,
        ...strikeOpts,
      }
    );
  }
  nextState = runEffectsForSide(
    nextState,
    runtime,
    input,
    defenderSide,
    'ON_STRUCK',
    !ownerActsFirst,
    {
      isFirstStrike: strikeIndex === 0,
    },
    strikeOpts
  );

  // Shrapnel retaliation — on-chain fires even when defender HP <= 0 (no HP guard).
  // Use current state (not pre-weapon snapshot) for shrapnel stacks.
  const currentDefender = getCombatant(nextState, defenderSide);
  const currentDefenderShrapnel = currentDefender.statusEffects.shrapnel ?? 0;
  const rawRetaliation =
    currentDefenderShrapnel > 0
      ? strikeAtk +
        runtime[defenderSide].battleFlags.shrapnelReflectBonus +
        getChillDamageBonus(attacker.statusEffects.chill ?? 0)
      : 0;
  // 50% of raw damage (rounded down, minimum 1), goes through armor first
  const retaliation = rawRetaliation > 0 ? Math.max(1, Math.floor(rawRetaliation / 2)) : 0;
  if (retaliation > 0) {
    nextState = setCombatant(nextState, defenderSide, {
      ...getCombatant(nextState, defenderSide),
      statusEffects: {
        ...getCombatant(nextState, defenderSide).statusEffects,
        shrapnel: Math.max(0, currentDefenderShrapnel - 1),
      },
    });
    const currentAttacker = getCombatant(nextState, attackerSide);
    const attackerArm = currentAttacker.arm + currentAttacker.bonusArm;
    const armAbsorbed = Math.min(retaliation, Math.max(0, attackerArm));
    const hpDamage = retaliation - armAbsorbed;
    nextState = setCombatant(nextState, attackerSide, {
      ...currentAttacker,
      arm: currentAttacker.arm - armAbsorbed,
      hp: Math.max(0, currentAttacker.hp - hpDamage),
    });
    nextState = addLogEntry(nextState, {
      turn: nextState.turn,
      timing: attackerSide === 'player' ? CombatPhase.PlayerAttack : CombatPhase.EnemyAttack,
      actor: defenderSide,
      action: 'TRIGGER_ITEM',
      target: attackerSide,
      result: {
        damage: retaliation,
        effectName: 'Shrapnel',
        source: { kind: 'status', id: 'shrapnel', name: 'Shrapnel' },
      },
      rngValues: [],
    });
  }

  // On-chain parity: single death check at end of strike (engine.rs line 540).
  // Checks both sides + prevent-death (Last Breath Sigil).
  nextState = finalizeImmediateLethal(
    nextState,
    runtime,
    attackerSide === 'player' ? CombatPhase.PlayerAttack : CombatPhase.EnemyAttack,
    input,
    state
  );
  if (nextState.result) {
    return nextState;
  }

  nextState = processTransitionEffects(nextState, runtime, input, attackerSide, ownerActsFirst);
  if (nextState.result) {
    return nextState;
  }
  nextState = processTransitionEffects(nextState, runtime, input, defenderSide, !ownerActsFirst);
  if (nextState.result) {
    return nextState;
  }
  nextState = processEldritchMolePhases(nextState, runtime, input);
  return nextState;
}

function refreshBattleStartArmorPiercing(
  state: CombatState,
  runtime: Record<Side, SideRuntime>,
  owner: Side
) {
  const enemy = getOpposite(owner);
  let armorPiercing = 0;

  for (const { effect } of runtime[owner].effects) {
    if (effect.effectType !== 'SetArmorPiercing' || effect.trigger.type !== 'BattleStart') {
      continue;
    }

    if (
      !checkCondition(
        effect.condition,
        getCombatant(state, owner),
        getCombatant(state, enemy),
        undefined,
        {
          ownerGold: getGold(state, owner),
          enemyGold: getGold(state, enemy),
        }
      )
    ) {
      continue;
    }

    armorPiercing = Math.max(armorPiercing, effect.value);
  }

  runtime[owner].battleFlags.armorPiercing = Math.max(
    runtime[owner].battleFlags.armorPiercing,
    armorPiercing
  );
}

function performSideAttacks(
  state: CombatState,
  runtime: Record<Side, SideRuntime>,
  input: CombatResolverInput,
  side: Side,
  ownerActsFirst: boolean,
  attackSources: Record<Side, CombatSourceRef | undefined>
): CombatState {
  let nextState = state;
  runtime[side].actedThisTurn = true;
  const combatant = getCombatant(nextState, side);
  const spdExtraStrike = hasSpdAdvantageExtraStrike(nextState, side) ? 1 : 0;
  const rawStrikes =
    combatant.strikesPerTurn + runtime[side].extraStrikesThisTurn + spdExtraStrike;
  const cappedStrikes = Math.min(rawStrikes, 5);
  const strikes =
    combatant.statusEffects.chill > 0
      ? Math.max(1, cappedStrikes - combatant.statusEffects.chill)
      : cappedStrikes;
  if (isDefeated(getCombatant(nextState, getOpposite(side)))) {
    return nextState;
  }
  for (let strike = 0; strike < strikes; strike += 1) {
    if (isDefeated(getCombatant(nextState, getOpposite(side)))) {
      break;
    }
    nextState = performStrike(
      nextState,
      runtime,
      input,
      side,
      strike,
      ownerActsFirst,
      attackSources
    );
    if (nextState.result) {
      break;
    }
  }
  return nextState;
}

function hasSpdAdvantageExtraStrike(state: CombatState, side: Side): boolean {
  const owner = getCombatant(state, side);
  const enemy = getCombatant(state, getOpposite(side));
  const ownerSpd = owner.spd + owner.bonusSpd;
  const enemySpd = enemy.spd + enemy.bonusSpd;
  return ownerSpd >= enemySpd + 5;
}

function processTurnEnd(
  state: CombatState,
  runtime: Record<Side, SideRuntime>,
  input: CombatResolverInput
): CombatState {
  let nextState = state;
  for (const side of ['player', 'enemy'] as const) {
    nextState = runEffectsForSide(nextState, runtime, input, side, 'TURN_END', side === 'player');
    if (nextState.result) {
      return nextState;
    }
  }

  for (const side of ['player', 'enemy'] as const) {
    const combatant = getCombatant(nextState, side);
    const result = processStatusEffectsTurnEnd(
      combatant,
      runtime[side].preserveShrapnelCap,
      runtime[side].preserveFreshChill
    );
    nextState = setCombatant(nextState, side, result.combatant);
    nextState = finalizeImmediateLethal(nextState, runtime, CombatPhase.TurnEnd, input, state);
    if (nextState.result) {
      return nextState;
    }
    runtime[side].preserveFreshChill = 0;
    if (result.armLost > 0) {
      nextState = addLogEntry(nextState, {
        turn: nextState.turn,
        timing: CombatPhase.TurnEnd,
        actor: side,
        action: 'LOSE_ARMOR',
        target: side,
        result: {
          armorLost: result.armLost,
          effectName: 'Rust',
          source: { kind: 'status', id: 'rust', name: 'Rust' },
        },
        rngValues: [],
      });
    }
    if (result.bleedDamage > 0) {
      nextState = addLogEntry(nextState, {
        turn: nextState.turn,
        timing: CombatPhase.TurnEnd,
        actor: getOpposite(side),
        action: 'TRIGGER_ITEM',
        target: side,
        result: {
          damage: result.bleedDamage,
          effectName: 'Bleed',
          source: { kind: 'status', id: 'bleed', name: 'Bleed' },
        },
        rngValues: [],
      });
      nextState = finalizeImmediateLethal(
        nextState,
        runtime,
        CombatPhase.TurnEnd,
        input,
        nextState
      );
      if (nextState.result) {
        return nextState;
      }
      nextState = runEffectsForSide(
        nextState,
        runtime,
        input,
        getOpposite(side),
        'TURN_END',
        side !== 'player',
        {
          enemyTookBleedDamage: true,
        }
      );
      if (nextState.result) {
        return nextState;
      }
    }
    for (const [statusType, stacks] of Object.entries(result.statusRemoved)) {
      if (!stacks) continue;
      nextState = addLogEntry(nextState, {
        turn: nextState.turn,
        timing: CombatPhase.TurnEnd,
        actor: side,
        action: 'PHASE_TRIGGER',
        target: side,
        result: {
          statusRemoved: {
            type: statusType as keyof CombatantState['statusEffects'],
            stacks,
          },
          source: { kind: 'status', id: statusType, name: statusType },
        },
        rngValues: [],
      });
    }
    nextState = processTransitionEffects(nextState, runtime, input, side, side === 'player');
    if (nextState.result) {
      return nextState;
    }
  }

  return nextState;
}

function processStartOfTurnForSide(
  state: CombatState,
  runtime: Record<Side, SideRuntime>,
  input: CombatResolverInput,
  side: Side,
  ownerActsFirst: boolean
): CombatState {
  let nextState = runEffectsForSide(state, runtime, input, side, 'TURN_START', ownerActsFirst);
  if (nextState.result) {
    return nextState;
  }
  if (nextState.turn >= 5 && runtime[side].storedDamage > 0) {
    const target = getOpposite(side);
    const storedDamage = runtime[side].storedDamage;
    const targetCombatant = getCombatant(nextState, target);
    nextState = setCombatant(nextState, target, {
      ...targetCombatant,
      hp: Math.max(0, targetCombatant.hp - storedDamage),
    });
    runtime[side].storedDamage = 0;
    nextState = addLogEntry(nextState, {
      turn: nextState.turn,
      timing: CombatPhase.TurnStart,
      actor: side,
      action: 'TRIGGER_ITEM',
      target,
      result: {
        damage: storedDamage,
        effectName: 'Time Charge',
        source: { kind: 'gear', id: 'I31', name: 'Time Charge' },
      },
      rngValues: [],
    });
    nextState = finalizeImmediateLethal(nextState, runtime, CombatPhase.TurnStart, input, state);
    if (nextState.result) {
      return nextState;
    }
  }
  if (side === 'enemy') {
    nextState = processEldritchMoleTurnStart(nextState, runtime, input);
    if (nextState.result) {
      return nextState;
    }
  }
  nextState = runEffectsForSide(nextState, runtime, input, side, 'COUNTDOWN', ownerActsFirst);
  if (nextState.result) {
    return nextState;
  }
  nextState = processTransitionEffects(nextState, runtime, input, side, ownerActsFirst);
  return nextState;
}

function isPvpCombat(input: CombatResolverInput): boolean {
  return input.enemyDefinitionId === 'pvpOpponent';
}

function comparePvpTieCombatants(
  player: CombatantState,
  enemy: CombatantState,
  favorPlayer: boolean
): CombatResult {
  const comparisons: Array<[number, number]> = [
    [
      Math.max(0, player.hp) + Math.max(0, player.arm + player.bonusArm),
      Math.max(0, enemy.hp) + Math.max(0, enemy.arm + enemy.bonusArm),
    ],
    [player.spd + player.bonusSpd, enemy.spd + enemy.bonusSpd],
    [player.dig, enemy.dig],
    [player.atk + player.bonusAtk, enemy.atk + enemy.bonusAtk],
    [player.maxHp, enemy.maxHp],
  ];

  for (const [playerValue, enemyValue] of comparisons) {
    if (playerValue > enemyValue) return 'VICTORY';
    if (enemyValue > playerValue) return 'DEFEAT';
  }

  return favorPlayer ? 'VICTORY' : 'DEFEAT';
}

function determineResult(
  state: CombatState,
  input: CombatResolverInput,
  preExchangeState?: CombatState
): CombatResult | null {
  if (isDefeated(state.enemy) && isDefeated(state.player)) {
    if (!isPvpCombat(input)) {
      return 'DEFEAT';
    }

    const tieState = preExchangeState ?? state;
    return comparePvpTieCombatants(
      tieState.player,
      tieState.enemy,
      input.pvpTieBreakerFavorPlayer ?? input.seed % 2 === 0
    );
  }
  if (isDefeated(state.enemy)) return 'VICTORY';
  if (isDefeated(state.player)) return 'DEFEAT';
  return null;
}

export function resolveCombatWithParity(input: CombatResolverInput): CombatState {
  let state = createCombatState(input);
  const runtime: Record<Side, SideRuntime> = {
    player: buildSideRuntime(input, 'player'),
    enemy: buildSideRuntime(input, 'enemy'),
  };
  runtime.player.wasWounded = isWounded(state.player);
  runtime.player.wasExposed = isExposed(state.player);
  runtime.player.hadShrapnel = (state.player.statusEffects.shrapnel ?? 0) > 0;
  runtime.enemy.wasWounded = isWounded(state.enemy);
  runtime.enemy.wasExposed = isExposed(state.enemy);
  runtime.enemy.hadShrapnel = (state.enemy.statusEffects.shrapnel ?? 0) > 0;
  const attackSources: Record<Side, CombatSourceRef | undefined> = {
    player: getAttackSource(input, 'player'),
    enemy: getAttackSource(input, 'enemy'),
  };

  state = runEffectsForSide(state, runtime, input, 'player', 'BATTLE_START', true);
  state = runEffectsForSide(state, runtime, input, 'enemy', 'BATTLE_START', false);
  state = processTransitionEffects(state, runtime, input, 'player', true);
  state = processTransitionEffects(state, runtime, input, 'enemy', false);

  const MAX_TURNS = 50;
  let suddenDeathBonus = 0;
  while (state.turn < MAX_TURNS && !state.result) {
    state = {
      ...state,
      turn: state.turn + 1,
      phase: CombatPhase.TurnStart,
    };
    runtime.player.firedThisTurn.clear();
    runtime.enemy.firedThisTurn.clear();
    runtime.player.nonWeaponHitsThisTurn = 0;
    runtime.enemy.nonWeaponHitsThisTurn = 0;
    runtime.player.pendingSelfNonWeaponBonus = 0;
    runtime.enemy.pendingSelfNonWeaponBonus = 0;
    runtime.player.activeBombSelfDamageReduction = 0;
    runtime.enemy.activeBombSelfDamageReduction = 0;
    runtime.player.actedThisTurn = false;
    runtime.enemy.actedThisTurn = false;
    runtime.player.forcedExposedThisTurn = false;
    runtime.enemy.forcedExposedThisTurn = false;
    runtime.player.extraStrikesThisTurn = 0;
    runtime.enemy.extraStrikesThisTurn = 0;

    // Sudden death: escalating ATK bonus for both sides (mirrors on-chain apply_sudden_death)
    const newSdBonus = checkSuddenDeath(state.turn);
    if (newSdBonus > suddenDeathBonus) {
      const delta = newSdBonus - suddenDeathBonus;
      state = {
        ...state,
        player: { ...state.player, atk: state.player.atk + delta },
        enemy: { ...state.enemy, atk: state.enemy.atk + delta },
      };
      suddenDeathBonus = newSdBonus;
    }

    const playerTotalSpd = state.player.spd + state.player.bonusSpd;
    const enemyTotalSpd = state.enemy.spd + state.enemy.bonusSpd;
    const playerActsFirst = playerTotalSpd > enemyTotalSpd
      || (playerTotalSpd === enemyTotalSpd && !!input.pvpPlayerActsFirstOnTie);
    const madMinerTurnOneExpose =
      input.bossId === 'B-A-W1-04' && state.turn === 1 && state.enemy.dig > state.player.dig;

    if (madMinerTurnOneExpose) {
      runtime.player.forcedExposedThisTurn = true;
    }
    if (input.bossId === 'B-B-W3-02' && state.turn === 1) {
      runtime.enemy.extraStrikesThisTurn = 1;
    }

    if (playerActsFirst) {
      state = processStartOfTurnForSide(state, runtime, input, 'player', true);
      const resultAfterPlayerStart = state.result ?? determineResult(state, input);
      if (resultAfterPlayerStart) {
        state = { ...state, result: resultAfterPlayerStart };
        break;
      }

      state = processStartOfTurnForSide(state, runtime, input, 'enemy', false);
      const resultAfterEnemyStart = state.result ?? determineResult(state, input);
      if (resultAfterEnemyStart) {
        state = { ...state, result: resultAfterEnemyStart };
        break;
      }
    } else {
      state = processStartOfTurnForSide(state, runtime, input, 'enemy', true);
      const resultAfterEnemyStart = state.result ?? determineResult(state, input);
      if (resultAfterEnemyStart) {
        state = { ...state, result: resultAfterEnemyStart };
        break;
      }

      state = processStartOfTurnForSide(state, runtime, input, 'player', false);
      const resultAfterPlayerStart = state.result ?? determineResult(state, input);
      if (resultAfterPlayerStart) {
        state = { ...state, result: resultAfterPlayerStart };
        break;
      }
    }

    if (playerActsFirst) {
      state = performSideAttacks(state, runtime, input, 'player', true, attackSources);
      if (!state.result && !isDefeated(state.enemy)) {
        state = performSideAttacks(state, runtime, input, 'enemy', false, attackSources);
      }
    } else {
      state = performSideAttacks(state, runtime, input, 'enemy', true, attackSources);
      if (!state.result && !isDefeated(state.player)) {
        state = performSideAttacks(state, runtime, input, 'player', false, attackSources);
      }
    }

    const resultAfterAttacks = state.result ?? determineResult(state, input);
    if (resultAfterAttacks) {
      state = { ...state, result: resultAfterAttacks };
      break;
    }

    state = processTurnEnd(state, runtime, input);
    const resultAfterTurnEnd = state.result ?? determineResult(state, input);
    if (resultAfterTurnEnd) {
      state = { ...state, result: resultAfterTurnEnd };
      break;
    }
  }

  if (!state.result) {
    // Turn-50 failsafe: compare HP percentages (mirrors on-chain check_failsafe).
    // Player wins only with strictly higher HP%; ties go to the enemy (DEFEAT).
    const existingResult = determineResult(state, input);
    if (existingResult) {
      state = { ...state, result: existingResult };
    } else {
      const playerPct = Math.trunc((state.player.hp * 100) / state.player.maxHp);
      const enemyPct = Math.trunc((state.enemy.hp * 100) / state.enemy.maxHp);
      state = { ...state, result: playerPct > enemyPct ? 'VICTORY' : 'DEFEAT' };
    }
  }

  if (state.result === 'VICTORY') {
    state = processVictoryEffects(state, runtime, input, 'player');
  } else {
    state = processVictoryEffects(state, runtime, input, 'enemy');
  }

  return {
    ...state,
    phase: CombatPhase.BattleEnd,
  };
}
