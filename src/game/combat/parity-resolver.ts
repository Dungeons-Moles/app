import type { CombatAction, CombatActionResult, CombatContribution, CombatLogEntry, CombatResult, CombatSourceRef, CombatState, CombatantState, Gear, Tool } from '@/game/engine/types';
import { CombatPhase } from '@/game/engine/types';
import { getEffectiveStrikes, processStatusEffectsTurnEnd } from '@/game/combat/status-effects';
import { applyDamage, isDefeated, isExposed, isWounded } from './damage';
import type { CombatResolverInput } from './resolver';
import { createCombatState } from './resolver';
import { getShardEffects } from './effect-bridge';
import { processEffects, type CombatEffectContext, type EffectLogEntry } from './effect-executor';
import { extractBattleFlags } from './effect-bridge';
import {
  collectLoadoutEffects,
  getBossTraitEffects,
  getFieldEnemyTraitEffects,
} from './parity-effects';
import type { EquippedEffect } from './effect-bridge';

type Side = 'player' | 'enemy';

interface SideRuntime {
  effects: EquippedEffect[];
  firedThisTurn: Set<string>;
  battleFlags: ReturnType<typeof extractBattleFlags>;
  preserveShrapnelCap: number;
  preserveFreshChill: number;
  countdownTurnBonus: number;
  lastGoldStolen: number;
  shardsEveryTurn: boolean;
  wasWounded: boolean;
  wasExposed: boolean;
  hadShrapnel: boolean;
  actedThisTurn: boolean;
  forcedExposedThisTurn: boolean;
  extraStrikesThisTurn: number;
  frostboundExposedTriggered: boolean;
  eldritch75Triggered: boolean;
  eldritch50Triggered: boolean;
  eldritch25Triggered: boolean;
  eldritchBleedActive: boolean;
  atkContributions: Map<string, CombatContribution>;
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
  const tool = side === 'player' ? input.playerTool ?? null : input.enemyTool ?? null;
  const gear = side === 'player' ? input.playerGear ?? [] : input.enemyGear ?? [];

  const addTool = (item: Tool | null) => {
    const oilAtk = item?.oil === 'ATK' ? 1 : 0;
    const atk = (item?.stats.atk ?? 0) + oilAtk;
    if (!item || atk <= 0) return;
    addContribution(map, { kind: 'tool', id: item.id, name: item.name }, atk);
  };
  const addGear = (items: Gear[]) => {
    for (const item of items) {
      const atk = item.stats.atk ?? 0;
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
    result.goldStolen = Math.abs(effectLog.goldChange);
  }
  if (effectLog.atkGained) {
    result.atkBonus = effectLog.atkGained;
  }
  if (effectLog.spdGained) {
    result.spdBonus = effectLog.spdGained;
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
  const gear = side === 'player' ? input.playerGear ?? [] : input.enemyGear ?? [];
  const tool = side === 'player' ? input.playerTool ?? null : input.enemyTool ?? null;
  const activeItemSets =
    side === 'player' ? input.activeItemSets ?? [] : input.enemyActiveItemSets ?? [];
  const loadoutEffects = collectLoadoutEffects(gear, tool, activeItemSets, {
    excludeBakedInBattleStartStats: true,
  });
  const traitEffects = side === 'enemy'
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

  return {
    effects,
    firedThisTurn: new Set(),
    battleFlags: extractBattleFlags(effects),
    preserveShrapnelCap,
    preserveFreshChill: 0,
    countdownTurnBonus: 0,
    lastGoldStolen: 0,
    shardsEveryTurn,
    wasWounded: false,
    wasExposed: false,
    hadShrapnel: false,
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
  };
}

function runEffectsForSide(
  state: CombatState,
  runtime: Record<Side, SideRuntime>,
  owner: Side,
  phase: string,
  ownerActsFirst: boolean,
  extra?: Partial<Parameters<typeof processEffects>[0]['triggerContext']>
): CombatState {
  const sideRuntime = runtime[owner];
  const enemy = getOpposite(owner);
  let nextState = state;
  const ctx: CombatEffectContext = {
    state: nextState,
    owner,
    turn: phase === 'COUNTDOWN' ? nextState.turn + sideRuntime.countdownTurnBonus : nextState.turn,
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
    storedDamage: 0,
    setStoredDamage: () => {},
    nonWeaponAmplify: sideRuntime.battleFlags.nonWeaponAmplify,
    blastImmunity: sideRuntime.battleFlags.blastImmunity,
    doubleBombTrigger: sideRuntime.battleFlags.doubleBombTrigger,
    doubleOnHitEffects: sideRuntime.battleFlags.doubleOnHitEffects,
    armorPiercing: sideRuntime.battleFlags.armorPiercing,
    preventDeathCharges: sideRuntime.battleFlags.preventDeathCharges,
    setPreventDeathCharges: () => {},
    countdownItems: new Map(),
    countdownTurnBonus: sideRuntime.countdownTurnBonus,
    setCountdownTurnBonus: (value: number) => {
      sideRuntime.countdownTurnBonus = Math.max(0, value);
    },
    firstTimeWoundedTriggered: sideRuntime.wasWounded,
    setFirstTimeWoundedTriggered: () => {},
    ownerExposedOverride: sideRuntime.forcedExposedThisTurn,
    enemyExposedOverride: runtime[enemy].forcedExposedThisTurn,
  };

  const result = processEffects({
    effects: sideRuntime.effects.map((entry) => ({
      effect: entry.effect,
      id: entry.id,
      name: entry.name,
      source: {
        kind: entry.sourceKind,
        id: String(entry.sourceId),
        name: entry.name,
      } as CombatSourceRef,
    })),
    ctx,
    phase,
    triggerContext: {
      ownerActsFirst,
      ...extra,
    },
  });
  nextState = result.state;
  for (const logEntry of result.logs) {
    if (logEntry.atkGained && logEntry.source && logEntry.target === owner) {
      addContribution(sideRuntime.atkContributions, logEntry.source, logEntry.atkGained);
    }
    if (logEntry.statusApplied?.type === 'chill') {
      const targetSide = logEntry.target === 'player' ? 'player' : logEntry.target === 'enemy' ? 'enemy' : null;
      if (targetSide && runtime[targetSide].actedThisTurn) {
        runtime[targetSide].preserveFreshChill += logEntry.statusApplied.stacks;
      }
    }
  }
  for (const logEntry of result.logs) {
    nextState = addLogEntry(nextState, toCombatLogEntry(nextState, owner, logEntry, phase as CombatLogEntry['timing']));
  }
  for (const logEntry of result.logs) {
    if (!logEntry.nonWeaponDamage || logEntry.target === 'none') continue;
    const targetSide = logEntry.target === 'player' ? 'player' : 'enemy';
    nextState = runEffectsForSide(
      nextState,
      runtime,
      targetSide,
      'ON_DEAL_NON_WEAPON_DAMAGE',
      targetSide === owner ? ownerActsFirst : !ownerActsFirst
    );
  }
  return nextState;
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
  let nextState = runEffectsForSide(state, runtime, owner, 'TRANSITION', ownerActsFirst, {
    wasWounded: sideRuntime.wasWounded,
    isWounded: nextWounded,
    wasExposed: sideRuntime.wasExposed,
    isExposed: nextExposed,
    shrapnelGained: !sideRuntime.hadShrapnel && hasShrapnel,
  });
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
        statusRemoved: { type: 'chill', stacks: getCombatant(nextState, 'enemy').statusEffects.chill ?? 0 },
        spdBonus: 2,
      },
      rngValues: [],
    });
  }
  sideRuntime.wasWounded = nextWounded;
  sideRuntime.wasExposed = nextExposed;
  sideRuntime.hadShrapnel = hasShrapnel;
  return nextState;
}

function processVictoryEffects(
  state: CombatState,
  runtime: Record<Side, SideRuntime>,
  winner: Side
): CombatState {
  return runEffectsForSide(state, runtime, winner, 'VICTORY', true);
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
  const attacker = getCombatant(state, attackerSide);
  const defender = getCombatant(state, defenderSide);
  const piercing = runtime[attackerSide].battleFlags.armorPiercing;
  const attackPower = Math.max(0, attacker.atk + attacker.bonusAtk);
  const totalArmor = runtime[defenderSide].forcedExposedThisTurn
    ? 0
    : Math.max(0, defender.arm + defender.bonusArm);
  const armorSoak = attacker.ignoresArmor ? 0 : Math.min(Math.max(0, totalArmor - piercing), attackPower);
  const hpDamage = Math.max(0, attackPower - armorSoak);
  const damageResult = applyDamage(defender, { armor: armorSoak, hp: hpDamage });
  const attackContributions = Array.from(runtime[attackerSide].atkContributions.values()).map(
    (entry) => ({ source: entry.source, value: entry.value })
  );

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

  nextState = runEffectsForSide(nextState, runtime, attackerSide, 'ON_HIT', ownerActsFirst, {
    isFirstStrike: strikeIndex === 0,
  });
  if (runtime[attackerSide].battleFlags.doubleOnHitEffects) {
    nextState = runEffectsForSide(nextState, runtime, attackerSide, 'ON_HIT', ownerActsFirst, {
      isFirstStrike: strikeIndex === 0,
    });
  }
  nextState = runEffectsForSide(nextState, runtime, defenderSide, 'ON_STRUCK', !ownerActsFirst, {
    isFirstStrike: strikeIndex === 0,
  });

  const attackerHasShardTrigger = runtime[attackerSide].battleFlags.triggerAllShards;
  if (attackerHasShardTrigger && strikeIndex === 0) {
    const shardEffects = getShardEffects(runtime[attackerSide].effects);
    const shardState = runtime[attackerSide].effects;
    runtime[attackerSide].effects = shardEffects;
    nextState = runEffectsForSide(nextState, runtime, attackerSide, 'ON_HIT', ownerActsFirst, {
      isFirstStrike: true,
    });
    runtime[attackerSide].effects = shardState;
  }

  const retaliation = (defender.statusEffects.shrapnel ?? 0) > 0
    ? (defender.statusEffects.shrapnel ?? 0)
    : 0;
  if (retaliation > 0) {
    nextState = setCombatant(nextState, attackerSide, {
      ...getCombatant(nextState, attackerSide),
      hp: Math.max(0, getCombatant(nextState, attackerSide).hp - retaliation),
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

  nextState = processTransitionEffects(nextState, runtime, input, attackerSide, ownerActsFirst);
  nextState = processTransitionEffects(nextState, runtime, input, defenderSide, !ownerActsFirst);
  nextState = processEldritchMolePhases(nextState, runtime, input);
  return nextState;
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
  const strikes = getEffectiveStrikes(getCombatant(nextState, side)) + runtime[side].extraStrikesThisTurn;
  if (isDefeated(getCombatant(nextState, getOpposite(side)))) {
    return nextState;
  }
  for (let strike = 0; strike < strikes; strike += 1) {
    if (isDefeated(getCombatant(nextState, getOpposite(side)))) {
      break;
    }
    nextState = performStrike(nextState, runtime, input, side, strike, ownerActsFirst, attackSources);
  }
  return nextState;
}

function processTurnEnd(
  state: CombatState,
  runtime: Record<Side, SideRuntime>,
  input: CombatResolverInput
): CombatState {
  let nextState = state;
  for (const side of ['player', 'enemy'] as const) {
    nextState = runEffectsForSide(nextState, runtime, side, 'TURN_END', side === 'player');
  }

  for (const side of ['player', 'enemy'] as const) {
    const combatant = getCombatant(nextState, side);
    const result = processStatusEffectsTurnEnd(
      combatant,
      runtime[side].preserveShrapnelCap,
      runtime[side].preserveFreshChill
    );
    nextState = setCombatant(nextState, side, result.combatant);
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
      nextState = runEffectsForSide(nextState, runtime, getOpposite(side), 'TURN_END', side !== 'player', {
        enemyTookBleedDamage: true,
      });
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
  let nextState = runEffectsForSide(state, runtime, side, 'TURN_START', ownerActsFirst);
  if (side === 'enemy') {
    nextState = processEldritchMoleTurnStart(nextState, runtime, input);
  }
  nextState = runEffectsForSide(nextState, runtime, side, 'COUNTDOWN', ownerActsFirst);
  nextState = processTransitionEffects(nextState, runtime, input, side, ownerActsFirst);
  return nextState;
}

function determineResult(state: CombatState): CombatResult | null {
  if (isDefeated(state.enemy) && isDefeated(state.player)) {
    return 'DEFEAT';
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

  state = runEffectsForSide(state, runtime, 'player', 'BATTLE_START', true);
  state = runEffectsForSide(state, runtime, 'enemy', 'BATTLE_START', false);
  state = processTransitionEffects(state, runtime, input, 'player', true);
  state = processTransitionEffects(state, runtime, input, 'enemy', false);

  const MAX_TURNS = 50;
  while (state.turn < MAX_TURNS && !state.result) {
    state = {
      ...state,
      turn: state.turn + 1,
      phase: CombatPhase.TurnStart,
    };
    runtime.player.firedThisTurn.clear();
    runtime.enemy.firedThisTurn.clear();
    runtime.player.actedThisTurn = false;
    runtime.enemy.actedThisTurn = false;
    runtime.player.forcedExposedThisTurn = false;
    runtime.enemy.forcedExposedThisTurn = false;
    runtime.player.extraStrikesThisTurn = 0;
    runtime.enemy.extraStrikesThisTurn = 0;

    const playerActsFirst =
      state.player.spd + state.player.bonusSpd > state.enemy.spd + state.enemy.bonusSpd;
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
      const resultAfterPlayerStart = determineResult(state);
      if (resultAfterPlayerStart) {
        state = { ...state, result: resultAfterPlayerStart };
        break;
      }

      state = processStartOfTurnForSide(state, runtime, input, 'enemy', false);
      const resultAfterEnemyStart = determineResult(state);
      if (resultAfterEnemyStart) {
        state = { ...state, result: resultAfterEnemyStart };
        break;
      }
    } else {
      state = processStartOfTurnForSide(state, runtime, input, 'enemy', true);
      const resultAfterEnemyStart = determineResult(state);
      if (resultAfterEnemyStart) {
        state = { ...state, result: resultAfterEnemyStart };
        break;
      }

      state = processStartOfTurnForSide(state, runtime, input, 'player', false);
      const resultAfterPlayerStart = determineResult(state);
      if (resultAfterPlayerStart) {
        state = { ...state, result: resultAfterPlayerStart };
        break;
      }
    }

    if (playerActsFirst) {
      state = performSideAttacks(state, runtime, input, 'player', true, attackSources);
      if (!isDefeated(state.enemy)) {
        state = performSideAttacks(state, runtime, input, 'enemy', false, attackSources);
      }
    } else {
      state = performSideAttacks(state, runtime, input, 'enemy', true, attackSources);
      if (!isDefeated(state.player)) {
        state = performSideAttacks(state, runtime, input, 'player', false, attackSources);
      }
    }

    const resultAfterAttacks = determineResult(state);
    if (resultAfterAttacks) {
      state = { ...state, result: resultAfterAttacks };
      break;
    }

    state = processTurnEnd(state, runtime, input);
    const resultAfterTurnEnd = determineResult(state);
    if (resultAfterTurnEnd) {
      state = { ...state, result: resultAfterTurnEnd };
      break;
    }
  }

  if (!state.result) {
    state = { ...state, result: determineResult(state) ?? 'DEFEAT' };
  }

  if (state.result === 'VICTORY') {
    state = processVictoryEffects(state, runtime, 'player');
  } else {
    state = processVictoryEffects(state, runtime, 'enemy');
  }

  return {
    ...state,
    phase: CombatPhase.BattleEnd,
  };
}
