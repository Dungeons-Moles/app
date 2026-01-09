/**
 * Combat resolver for PvE Dungeon Crawler
 * Pure function resolver for deterministic auto-combat
 */

import type {
  CombatState,
  CombatantState,
  CombatLogEntry,
  BossId,
  Gear,
  Tool,
  GearId,
} from '../engine/types';
import { CombatPhase } from '../engine/types';
import type { EnemyId as MapEnemyId } from '../map/types';
import { GAME_CONSTANTS } from '../engine/constants';
import { SeededRNG } from '../engine/rng';
import { calculateDamage, applyDamage, isDefeated, isWounded, isExposed } from './damage';
import {
  executeBossTrait,
  checkEldritchMolePhases,
  resetBossPhaseState,
  resetStatusReflectionFlag,
} from '../entities/bosses';
import { processStatusEffectsTurnEnd, applyStatus } from './status-effects';
import { executeTraitEffects, type EnemyId } from './traits';
import { RARITY_MULTIPLIER } from '../../data/gear';

/**
 * Input for creating combat state
 */
export interface CombatResolverInput {
  player: CombatantState;
  enemy: CombatantState;
  seed: number;
  /** Optional boss ID if fighting a boss (enables boss traits) */
  bossId?: BossId;
  /** Optional enemy ID for trait execution (regular enemies) */
  enemyId?: EnemyId;
  /** Optional enemy definition ID for rewards */
  enemyDefinitionId?: MapEnemyId;
  /** Optional enemy tier for rewards */
  enemyTier?: 1 | 2 | 3;
  /** Optional gold reward for combat victory */
  goldReward?: number;
  /** True if player has Shrapnel Harness itemset */
  hasShrapnelHarness?: boolean;
  /** Player gear for combat effects */
  playerGear?: Gear[];
  /** Player tool for combat effects */
  playerTool?: Tool | null;
  /** Player gold for combat effects */
  playerGold?: number;
}

interface CountdownItem {
  remaining: number;
}

/**
 * Create initial combat state from input
 */
export function createCombatState(input: CombatResolverInput): CombatState {
  return {
    player: { ...input.player },
    enemy: { ...input.enemy },
    turn: 0,
    phase: CombatPhase.BattleStart,
    log: [],
    rngState: input.seed,
    playerGold: input.playerGold ?? 0,
    goldReward: input.goldReward ?? 0,
    enemyDefinitionId: input.enemyDefinitionId ?? input.enemyId ?? 'TUNNEL_RAT',
    enemyTier: input.enemyTier ?? 1,
    consumedGearIds: [],
    result: null,
  };
}

/**
 * Resolve combat to completion
 */
export function resolveCombat(input: CombatResolverInput): CombatState {
  let state = createCombatState(input);
  const rng = new SeededRNG(input.seed);
  const { bossId, enemyId, hasShrapnelHarness = false } = input;
  const playerGear = input.playerGear ?? [];
  const playerTool = input.playerTool ?? null;

  const gearById = new Map<GearId, Gear[]>();
  for (const gear of playerGear) {
    const existing = gearById.get(gear.id) ?? [];
    existing.push(gear);
    gearById.set(gear.id, existing);
  }

  const getGear = (id: GearId) => gearById.get(id) ?? [];
  const countGear = (id: GearId) => getGear(id).length;
  const sumScaled = (id: GearId, base: number) =>
    getGear(id).reduce(
      (sum, gear) => sum + Math.floor(base * RARITY_MULTIPLIER[gear.currentRarity]),
      0
    );

  const whetstoneBonus = sumScaled('I5', 2);
  const spikedBracersShrapnel = sumScaled('I6', 1);
  const frostLanternChill = sumScaled('I7', 1);
  const canaryCharges = countGear('I9');
  const smallChargeCount = countGear('I10');
  const shardEmerald = countGear('I11');
  const shardRuby = countGear('I12');
  const shardSapphire = countGear('I13');
  const shardCitrine = countGear('I14');
  const frostguardCount = countGear('I15');
  const blastSuitActive = countGear('I16') > 0;
  const bombSatchelCount = countGear('I17');
  const explosivePowderCount = countGear('I18');
  const kindlingChargeCount = countGear('I19');
  const doubleDetonationBonus = countGear('I20') * 3;
  const shrapnelTalismanCount = countGear('I21');
  const rustSpikeCount = countGear('I22');
  const corrodedGreavesCount = countGear('I23');
  const crystalCrownCount = countGear('I24');
  const royalBracerCount = countGear('I25');
  const timeChargeCount = countGear('I26');
  const drillServoCount = countGear('I27');
  const gearLinkMultiplier = countGear('I28') > 0 ? 2 : 1;
  const twinFuseMultiplier = countGear('I29') > 0 ? 2 : 1;

  let remainingCanaryCharges = canaryCharges;
  let countdownItems: CountdownItem[] = Array.from({ length: smallChargeCount }, () => ({
    remaining: 2,
  }));
  let nextBombBonus = 0;
  let nonWeaponDamageCount = 0;
  let playerTurnsTaken = 0;
  let wasPlayerWounded = isWounded(state.player);
  let wasPlayerExposed = isExposed(state.player);
  let drillServoApplied = false;

  const bombPool: GearId[] = [];
  for (const gear of playerGear) {
    if (gear.id === 'I10' || gear.id === 'I19' || gear.id === 'I26') {
      bombPool.push(gear.id);
    }
  }

  if (bossId) {
    resetBossPhaseState();
  }

  const updatePlayerGold = (nextGold: number) => {
    state = { ...state, playerGold: nextGold };
  };

  const applyPlayerArmor = (amount: number, effectName?: string) => {
    if (amount <= 0) return;
    state = {
      ...state,
      player: {
        ...state.player,
        arm: state.player.arm + amount,
      },
    };

    state = addLogEntry(state, {
      turn: state.turn,
      timing: state.phase,
      actor: 'player',
      action: 'GAIN_ARMOR',
      target: 'player',
      result: { armorGained: amount, effectName },
      rngValues: [],
    });
  };

  const applyHealing = (target: 'player' | 'enemy', amount: number, effectName?: string) => {
    if (amount <= 0) return;
    const combatant = target === 'player' ? state.player : state.enemy;
    const healed = Math.min(amount, combatant.maxHp - combatant.hp);
    if (healed <= 0) return;

    const updated = {
      ...combatant,
      hp: combatant.hp + healed,
    };

    state = {
      ...state,
      [target]: updated,
    };

    state = addLogEntry(state, {
      turn: state.turn,
      timing: state.phase,
      actor: target,
      action: 'HEAL',
      target,
      result: { healing: healed, effectName },
      rngValues: [],
    });
  };

  const applyRustToEnemy = (stacks: number, effectName?: string) => {
    if (stacks <= 0) return;
    const updatedEnemy = applyStatus(state.enemy, 'rust', stacks);
    state = { ...state, enemy: updatedEnemy };

    state = addLogEntry(state, {
      turn: state.turn,
      timing: state.phase,
      actor: 'player',
      action: 'APPLY_STATUS',
      target: 'enemy',
      result: {
        statusApplied: { type: 'rust', stacks },
        effectName,
      },
      rngValues: [],
    });
  };

  const applyShrapnelToPlayer = (stacks: number, effectName?: string) => {
    if (stacks <= 0) return;
    const updatedPlayer = applyStatus(state.player, 'shrapnel', stacks);
    state = { ...state, player: updatedPlayer };

    state = addLogEntry(state, {
      turn: state.turn,
      timing: state.phase,
      actor: 'player',
      action: 'APPLY_STATUS',
      target: 'player',
      result: {
        statusApplied: { type: 'shrapnel', stacks },
        effectName,
      },
      rngValues: [],
    });

    if (shrapnelTalismanCount > 0) {
      applyPlayerArmor(stacks * shrapnelTalismanCount, 'Shrapnel Talisman');
    }
  };

  const applyChill = (target: 'player' | 'enemy', stacks: number, effectName?: string) => {
    if (stacks <= 0) return;
    const combatant = target === 'player' ? state.player : state.enemy;
    const updated = applyStatus(combatant, 'chill', stacks);
    state = {
      ...state,
      [target]: updated,
    };

    state = addLogEntry(state, {
      turn: state.turn,
      timing: state.phase,
      actor: target === 'player' ? 'player' : 'enemy',
      action: 'APPLY_STATUS',
      target,
      result: {
        statusApplied: { type: 'chill', stacks },
        effectName,
      },
      rngValues: [],
    });
  };

  const applyNonWeaponDamage = (
    target: 'player' | 'enemy',
    baseDamage: number,
    options: { source?: string; isBomb?: boolean; countForDetonation?: boolean } = {}
  ) => {
    if (baseDamage <= 0) return;
    if (target === 'player' && options.isBomb && blastSuitActive) {
      return;
    }

    let damage = baseDamage;

    if (options.isBomb) {
      damage += explosivePowderCount;
      if (nextBombBonus > 0) {
        damage += nextBombBonus;
        nextBombBonus = 0;
      }
    }

    if (target === 'enemy' && options.countForDetonation !== false) {
      if (nonWeaponDamageCount === 1) {
        damage += doubleDetonationBonus;
      }
      nonWeaponDamageCount += 1;
    }

    if (damage <= 0) return;

    const combatant = target === 'player' ? state.player : state.enemy;
    const updated = {
      ...combatant,
      hp: Math.max(0, combatant.hp - damage),
    };

    state = {
      ...state,
      [target]: updated,
    };

    state = addLogEntry(state, {
      turn: state.turn,
      timing: state.phase,
      actor: 'player',
      action: 'TRIGGER_ITEM',
      target,
      result: { damage, effectName: options.source },
      rngValues: [],
    });

    if (target === 'player') {
      preventDeathWithCanary();
    }
  };

  const applyBombEffect = (bombId: GearId, countForDetonation: boolean = true) => {
    const triggerCount = twinFuseMultiplier;
    const shouldCount = countForDetonation;

    if (bombId === 'I19') {
      nextBombBonus += 3;
    }

    for (let trigger = 0; trigger < triggerCount; trigger += 1) {
      if (bombId === 'I10') {
        applyNonWeaponDamage('enemy', 10, {
          source: 'Small Charge',
          isBomb: true,
          countForDetonation: shouldCount,
        });
        applyNonWeaponDamage('player', 10, {
          source: 'Small Charge',
          isBomb: true,
          countForDetonation: shouldCount,
        });
      }

      if (bombId === 'I19') {
        applyNonWeaponDamage('enemy', 1, {
          source: 'Kindling Charge',
          isBomb: true,
          countForDetonation: shouldCount,
        });
      }

      if (bombId === 'I26') {
        applyNonWeaponDamage('enemy', 1, {
          source: 'Time Charge',
          isBomb: true,
          countForDetonation: shouldCount,
        });
      }
    }
  };

  const triggerBombSatchel = (context: string, countForDetonation: boolean = true) => {
    if (bombSatchelCount <= 0) return;
    if (bombPool.length === 0) return;

    for (let i = 0; i < bombSatchelCount; i += 1) {
      if (state.player.dig < 3) break;

      state = {
        ...state,
        player: {
          ...state.player,
          dig: state.player.dig - 3,
        },
      };

      const bombId = rng.pick(bombPool);
      applyBombEffect(bombId, countForDetonation);

      state = addLogEntry(state, {
        turn: state.turn,
        timing: state.phase,
        actor: 'player',
        action: 'TRIGGER_ITEM',
        target: 'enemy',
        result: { effectName: `Bomb Satchel (${context})` },
        rngValues: [],
      });
    }
  };

  const preventDeathWithCanary = () => {
    if (state.player.hp > 0 || remainingCanaryCharges <= 0) return;
    remainingCanaryCharges -= 1;
    state = {
      ...state,
      player: {
        ...state.player,
        hp: 1,
      },
      consumedGearIds: [...state.consumedGearIds, 'I9'],
    };

    state = addLogEntry(state, {
      turn: state.turn,
      timing: state.phase,
      actor: 'player',
      action: 'TRIGGER_ITEM',
      target: 'player',
      result: { healing: 1, effectName: 'Canary Charm' },
      rngValues: [],
    });
  };

  const handleBattleStart = () => {
    state = { ...state, phase: CombatPhase.BattleStart };

    state = addLogEntry(state, {
      turn: 0,
      timing: CombatPhase.BattleStart,
      actor: 'system',
      action: 'TRIGGER_ITEM',
      target: 'none',
      result: { effectName: 'Battle Start' },
      rngValues: [],
    });

    if (bossId) {
      const traitResult = executeBossTrait(state, bossId, 'BATTLE_START');
      if (traitResult.triggered) {
        state = traitResult.state;
        state = addLogEntry(state, {
          turn: 0,
          timing: 'BATTLE_START',
          actor: 'enemy',
          action: 'TRIGGER_TRAIT',
          target: 'none',
          result: { effectName: traitResult.effectName },
          rngValues: [],
        });
      }
    }

    if (enemyId) {
      state = executeTraitEffects(state, 'BATTLE_START', enemyId, 'enemy');
    }

    if (spikedBracersShrapnel > 0) {
      applyShrapnelToPlayer(spikedBracersShrapnel, 'Spiked Bracers');
    }

    if (frostLanternChill > 0) {
      applyChill('enemy', frostLanternChill, 'Frost Lantern');
    }

    if (frostguardCount > 0) {
      applyChill('player', frostguardCount * 2, 'Frostguard Buckler');
    }

    if (crystalCrownCount > 0) {
      const baseArmor = state.player.arm + state.player.bonusArm;
      const bonusHp = baseArmor * crystalCrownCount;
      state = {
        ...state,
        player: {
          ...state.player,
          maxHp: state.player.maxHp + bonusHp,
          hp: state.player.hp + bonusHp,
        },
      };

      state = addLogEntry(state, {
        turn: 0,
        timing: 'BATTLE_START',
        actor: 'player',
        action: 'HEAL',
        target: 'player',
        result: { healing: bonusHp, effectName: 'Crystal Crown' },
        rngValues: [],
      });
    }

    if (kindlingChargeCount > 0) {
      for (let i = 0; i < kindlingChargeCount; i += 1) {
        applyBombEffect('I19', false);
      }
    }

    if (bombSatchelCount > 0) {
      triggerBombSatchel('Battle Start', false);
    }
  };

  const handlePlayerTurnStart = () => {
    const isWoundedNow = isWounded(state.player);
    const isExposedNow = isExposed(state.player);

    if (isWoundedNow && !wasPlayerWounded) {
      if (corrodedGreavesCount > 0) {
        applyRustToEnemy(corrodedGreavesCount * 3, 'Corroded Greaves');
      }

      if (drillServoCount > 0 && !drillServoApplied) {
        state = {
          ...state,
          player: {
            ...state.player,
            strikesPerTurn: state.player.strikesPerTurn + 2 * drillServoCount,
          },
        };
        drillServoApplied = true;
      }

      triggerBombSatchel('Wounded');
    }

    if (isExposedNow && !wasPlayerExposed) {
      if (timeChargeCount > 0) {
        for (let i = 0; i < timeChargeCount; i += 1) {
          applyBombEffect('I26');
        }
      }

      triggerBombSatchel('Exposed');
    }

    wasPlayerWounded = isWounded(state.player);
    wasPlayerExposed = isExposed(state.player);

    if (royalBracerCount > 0) {
      let gold = state.playerGold;
      let armorGained = 0;

      for (let i = 0; i < royalBracerCount; i += 1) {
        if (gold <= 0) break;
        gold -= 1;
        armorGained += 3;
      }

      updatePlayerGold(gold);
      if (armorGained > 0) {
        applyPlayerArmor(armorGained, 'Royal Bracer');
      }
    }

    if (timeChargeCount > 0) {
      state = {
        ...state,
        player: {
          ...state.player,
          bonusAtk: state.player.bonusAtk + 2 * timeChargeCount,
        },
      };
    }

    if (playerTurnsTaken % 2 === 0) {
      if (shardEmerald > 0) {
        applyHealing('player', shardEmerald, 'Emerald Shard');
      }
      if (shardRuby > 0) {
        for (let i = 0; i < shardRuby; i += 1) {
          applyNonWeaponDamage('enemy', 1, { source: 'Ruby Shard' });
        }
      }
      if (shardSapphire > 0) {
        applyPlayerArmor(shardSapphire, 'Sapphire Shard');
      }
      if (shardCitrine > 0) {
        state = {
          ...state,
          player: {
            ...state.player,
            dig: state.player.dig + shardCitrine,
          },
        };
      }
    }
  };

  const resolveWeaponStrike = (attackerKey: 'player' | 'enemy', tempAtkBonus: number) => {
    const defenderKey = attackerKey === 'player' ? 'enemy' : 'player';
    const attackerState = state[attackerKey];
    const defenderState = state[defenderKey];

    const effectiveAttacker =
      tempAtkBonus > 0
        ? { ...attackerState, bonusAtk: attackerState.bonusAtk + tempAtkBonus }
        : attackerState;

    const attackOverride = attackerKey === 'player' && playerTool?.id === 'T8';
    const attackerForDamage = attackOverride
      ? { ...effectiveAttacker, atk: effectiveAttacker.dig }
      : effectiveAttacker;

    const damageResult = calculateDamage(attackerForDamage, defenderState);
    const { combatant: updatedDefender, armorLost, hpLost } = applyDamage(defenderState, {
      armor: damageResult.armorDamage,
      hp: damageResult.hpDamage,
    });

    state = {
      ...state,
      [defenderKey]: updatedDefender,
    };

    if (armorLost > 0 || hpLost > 0) {
      state = addLogEntry(state, {
        turn: state.turn,
        timing: state.phase,
        actor: attackerKey,
        action: 'ATTACK',
        target: defenderKey,
        result: {
          damage: hpLost,
          armorLost,
        },
        rngValues: [rng.next()],
      });
    }

    if (damageResult.shrapnelReflect > 0) {
      const reflected = {
        ...state[attackerKey],
        hp: Math.max(0, state[attackerKey].hp - damageResult.shrapnelReflect),
      };

      state = {
        ...state,
        [attackerKey]: reflected,
      };

      state = addLogEntry(state, {
        turn: state.turn,
        timing: state.phase,
        actor: defenderKey,
        action: 'TRIGGER_TRAIT',
        target: attackerKey,
        result: {
          damage: damageResult.shrapnelReflect,
          effectName: 'Shrapnel',
        },
        rngValues: [],
      });

      if (attackerKey === 'player') {
        preventDeathWithCanary();
      }
    }

    if (defenderKey === 'player') {
      preventDeathWithCanary();
    }

    return {
      armorLost,
      hpLost,
    };
  };

  const handleTurnEnd = (actor: 'player' | 'enemy') => {
    state = { ...state, phase: CombatPhase.TurnEnd };

    if (countdownItems.length > 0) {
      const updatedCountdowns: CountdownItem[] = [];
      for (const item of countdownItems) {
        const nextRemaining = item.remaining - 1;
        if (nextRemaining <= 0) {
          applyBombEffect('I10');
        } else {
          updatedCountdowns.push({ remaining: nextRemaining });
        }
      }
      countdownItems = updatedCountdowns;
    }

    if (actor === 'player') {
      state = { ...state, player: processStatusEffectsTurnEnd(state.player, hasShrapnelHarness) };
      playerTurnsTaken += 1;
    } else {
      state = { ...state, enemy: processStatusEffectsTurnEnd(state.enemy, false) };
    }
  };

  handleBattleStart();

  if (checkCombatEnd(state)) {
    return finalizeCombat(state, rng);
  }

  const playerSpeed = state.player.spd + state.player.bonusSpd;
  const enemySpeed = state.enemy.spd + state.enemy.bonusSpd;
  let nextAttacker: 'player' | 'enemy' = playerSpeed >= enemySpeed ? 'player' : 'enemy';

  const MAX_TURNS = 200;
  while (state.turn < MAX_TURNS && !state.result) {
    state = {
      ...state,
      turn: state.turn + 1,
      phase: CombatPhase.TurnStart,
    };
    nonWeaponDamageCount = 0;

    if (nextAttacker === 'player') {
      handlePlayerTurnStart();
    } else {
      if (bossId) {
        if (bossId === 'CRYSTAL_MIMIC') {
          resetStatusReflectionFlag();
        }

        const traitResult = executeBossTrait(state, bossId, 'TURN_START');
        if (traitResult.triggered) {
          state = traitResult.state;
          state = addLogEntry(state, {
            turn: state.turn,
            timing: 'TURN_START',
            actor: 'enemy',
            action: 'TRIGGER_TRAIT',
            target: bossId === 'GAS_ANOMALY' ? 'player' : 'enemy',
            result: {
              effectName: traitResult.effectName,
            },
            rngValues: [],
          });
        }
      }

      if (enemyId) {
        state = executeTraitEffects(state, 'TURN_START', enemyId, 'enemy');
      }

      preventDeathWithCanary();
    }

    if (checkCombatEnd(state)) {
      break;
    }

    state = {
      ...state,
      phase: nextAttacker === 'player' ? CombatPhase.PlayerAttack : CombatPhase.EnemyAttack,
    };

    const attackerState = nextAttacker === 'player' ? state.player : state.enemy;
    const strikes = attackerState.strikesPerTurn;
    let strikesLanded = 0;
    const tempAtkBonus = nextAttacker === 'player' && playerTurnsTaken === 0 ? whetstoneBonus : 0;

    for (let strike = 0; strike < strikes; strike += 1) {
      if (isDefeated(nextAttacker === 'player' ? state.enemy : state.player)) {
        break;
      }

      const { hpLost } = resolveWeaponStrike(nextAttacker, tempAtkBonus);
      strikesLanded += 1;

      if (bossId === 'ELDRITCH_MOLE' && nextAttacker === 'player' && hpLost > 0) {
        const phaseResult = checkEldritchMolePhases(state, bossId);
        if (phaseResult.phaseTriggered) {
          state = phaseResult.state;
          state = addLogEntry(state, {
            turn: state.turn,
            timing: state.phase,
            actor: 'enemy',
            action: 'PHASE_TRIGGER',
            target: 'enemy',
            result: { effectName: phaseResult.phaseTriggered },
            rngValues: [],
          });
        }
      }

      if (nextAttacker === 'enemy' && enemyId) {
        state = executeTraitEffects(state, 'ON_HIT', enemyId, 'enemy');
      }

      if (isDefeated(nextAttacker === 'player' ? state.enemy : state.player)) {
        break;
      }
    }

    if (nextAttacker === 'player' && rustSpikeCount > 0 && strikesLanded > 0) {
      const totalRustStacks = strikesLanded * rustSpikeCount * gearLinkMultiplier;
      applyRustToEnemy(totalRustStacks, 'Rust Spike');
    }

    if (checkCombatEnd(state)) {
      break;
    }

    handleTurnEnd(nextAttacker);

    if (checkCombatEnd(state)) {
      break;
    }

    nextAttacker = nextAttacker === 'player' ? 'enemy' : 'player';
  }

  return finalizeCombat(state, rng);
}

/**
 * Check if combat should end
 */
function checkCombatEnd(state: CombatState): boolean {
  return isDefeated(state.player) || isDefeated(state.enemy);
}

/**
 * Finalize combat and set result
 */
function finalizeCombat(state: CombatState, rng: SeededRNG): CombatState {
  state = { ...state, phase: CombatPhase.BattleEnd };

  let result: 'VICTORY' | 'DEFEAT';
  if (isDefeated(state.player)) {
    result = 'DEFEAT';
  } else if (isDefeated(state.enemy)) {
    result = 'VICTORY';
  } else {
    result = 'DEFEAT';
  }

  const finalRngState = rng.getState();

  return {
    ...state,
    result,
    rngState: finalRngState,
  };
}

/**
 * Add log entry with bounded length
 */
function addLogEntry(state: CombatState, entry: CombatLogEntry): CombatState {
  const newLog = [...state.log, entry];

  if (newLog.length > GAME_CONSTANTS.MAX_COMBAT_LOG_ENTRIES) {
    return {
      ...state,
      log: newLog.slice(-GAME_CONSTANTS.MAX_COMBAT_LOG_ENTRIES),
    };
  }

  return {
    ...state,
    log: newLog,
  };
}
