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
  ItemsetId,
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
import { calculateGoldReward } from '../entities/enemies';
import { processStatusEffectsTurnEnd, applyStatus, getEffectiveStrikes } from './status-effects';
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
  /** True if player has Shrapnel Harness itemset (deprecated, use activeItemSets) */
  hasShrapnelHarness?: boolean;
  /** Active itemsets */
  activeItemSets?: ItemsetId[];
  /** Player gear for combat effects */
  playerGear?: Gear[];
  /** Player tool for combat effects */
  playerTool?: Tool | null;
  /** Player gold for combat effects */
  playerGold?: number;
}

interface CountdownItem {
  bombId: GearId;
  remaining: number;
}

/**
 * Create initial combat state from input
 */
export function createCombatState(input: CombatResolverInput): CombatState {
  const enemyDefinitionId =
    input.enemyDefinitionId ?? (input.enemyId as MapEnemyId | undefined) ?? 'TUNNEL_RAT';
  const enemyTier = input.enemyTier ?? 1;
  const goldReward = input.goldReward ?? calculateGoldReward(enemyDefinitionId, enemyTier);

  return {
    player: { ...input.player },
    enemy: { ...input.enemy },
    turn: 0,
    phase: CombatPhase.BattleStart,
    log: [],
    rngState: input.seed,
    playerGold: input.playerGold ?? 0,
    goldReward,
    enemyDefinitionId,
    enemyTier,
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
  const { bossId, enemyId, activeItemSets = [] } = input;
  const hasShrapnelHarness =
    input.hasShrapnelHarness || activeItemSets.includes('SHRAPNEL_HARNESS');
  const playerGear = input.playerGear ?? [];
  const playerTool = input.playerTool ?? null;
  const pneumaticDrillGearAtkPenalty =
    playerTool?.id === 'T4'
      ? Math.ceil(playerGear.reduce((sum, gear) => sum + (gear.stats.atk ?? 0), 0) / 2)
      : 0;

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

  // STONE items
  // NOTE: I1 (Miner Helmet) and I2 (Work Vest) provide permanent stat bonuses via gear.ts,
  // not battle start effects. Their stats are already included in player stats.
  const spikedBracersShrapnel = sumScaled('I3', 2); // G-ST-03: Battle Start: gain 2 Shrapnel
  const shrapnelTalismanCount = countGear('I6'); // G-ST-06: gain 1 Armor when gaining Shrapnel
  const crystalCrownCount = countGear('I7'); // G-ST-07: gain Max HP equal to starting Armor
  const stoneSigilCount = countGear('I8'); // G-ST-08: End of turn: if you have Armor, gain 1 Armor

  // SCOUT items
  const drillServoBonuses = getGear('I14').map((gear) => (gear.currentRarity === 'DIAMOND' ? 2 : 1)); // G-SC-06: Wounded: gain +1/+1/+2 strikes
  const gearLinkMultiplier = countGear('I16') > 0 ? 2 : 1; // G-SC-08: On Hit effects trigger twice

  // GREED items
  const royalBracerCount = countGear('I20'); // G-GR-04: Turn Start: convert 1 Gold -> 2 Armor
  const shardEmerald = countGear('I21'); // G-GR-05: Every other turn: heal 1 HP
  const shardRuby = countGear('I22'); // G-GR-06: Every other turn: deal 1 non-weapon damage
  const shardSapphire = countGear('I23'); // G-GR-07: Every other turn: gain 1 Armor
  const shardCitrine = countGear('I24'); // G-GR-08: Every other turn: gain 1 Gold

  // BLAST items
  const smallChargeCount = countGear('I25'); // G-BL-01: Countdown(2): deal 8 to enemy and you
  const blastSuitActive = countGear('I26') > 0; // G-BL-02: Ignore damage from your own BLAST items
  const explosivePowderCount = countGear('I27'); // G-BL-03: Non-weapon damage deals +1
  const doubleDetonationBonus = countGear('I28') * 3; // G-BL-04: Second non-weapon damage deals +2
  const bombSatchelCount = countGear('I29'); // G-BL-05: Battle Start: reduce Countdown by 1
  const kindlingChargeCount = countGear('I30'); // G-BL-06: Battle Start: deal 1; next bomb deals +3
  const timeChargeCount = countGear('I31'); // G-BL-07: Turn Start: gain stored damage; Exposed: deal it
  const twinFuseMultiplier = countGear('I32') > 0 ? 2 : 1; // G-BL-08: Bomb triggers happen twice

  // FROST items
  const frostLanternChill = sumScaled('I33', 1); // G-FR-01: Battle Start: give enemy 1 Chill
  const frostguardBonuses = getGear('I34').map((gear) => {
    if (gear.currentRarity === 'DIAMOND') return 5;
    if (gear.currentRarity === 'GILDED') return 4;
    return 3;
  }); // G-FR-02: Battle Start: if enemy has Chill, gain +3/+4/+5 Armor and apply 1 Chill

  // RUST items
  const rustSpikeCount = countGear('I42'); // G-RU-02: On Hit: apply 1 Rust
  const corrodedGreavesCount = countGear('I43'); // G-RU-03: Wounded: apply 2 Rust

  // BLOOD items
  const canaryCharges = countGear('I49'); // G-BO-01: Last Breath Sigil - prevent death, heal 2 HP

  let remainingCanaryCharges = canaryCharges;
  const demolitionPermitActive = activeItemSets.includes('DEMOLITION_PERMIT');
  const demolitionPermitSelfDamageReduction = demolitionPermitActive ? 2 : 0;
  const smallChargeCountdownStart = demolitionPermitActive ? 1 : 2;
  let countdownItems: CountdownItem[] = Array.from({ length: smallChargeCount }, () => ({
    bombId: 'I25' as GearId,
    remaining: smallChargeCountdownStart,
  }));
  let nextBombBonus = 0;
  let nextBombSelfDamageReduction = 0;
  let storedTimeChargeDamage = 0;
  let nonWeaponDamageCount = 0;
  let playerTurnsTaken = 0;
  let wasPlayerWounded = isWounded(state.player);
  let wasPlayerExposed = isExposed(state.player);
  let drillServoApplied = false;
  let whiteoutFirstStrikeBonusPending = false;

  const bombPool: GearId[] = [];
  for (const gear of playerGear) {
    // Updated IDs: I25 (Small Charge), I30 (Kindling Charge), I31 (Time Charge)
    if (gear.id === 'I25' || gear.id === 'I30' || gear.id === 'I31') {
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

  const applyBleed = (target: 'player' | 'enemy', stacks: number, effectName?: string) => {
    if (stacks <= 0) return;
    const combatant = target === 'player' ? state.player : state.enemy;
    const updated = applyStatus(combatant, 'bleed', stacks);
    state = {
      ...state,
      [target]: updated,
    };

    state = addLogEntry(state, {
      turn: state.turn,
      timing: state.phase,
      actor: 'player', // Attribute to player
      action: 'APPLY_STATUS',
      target,
      result: {
        statusApplied: { type: 'bleed', stacks },
        effectName,
      },
      rngValues: [],
    });
  };

  const applyNonWeaponDamage = (
    target: 'player' | 'enemy',
    baseDamage: number,
    options: {
      source?: string;
      isBomb?: boolean;
      countForDetonation?: boolean;
      selfDamageReduction?: number;
    } = {}
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
      if (target === 'player') {
        const totalSelfDamageReduction =
          (options.selfDamageReduction ?? 0) + demolitionPermitSelfDamageReduction;
        damage = Math.max(0, damage - totalSelfDamageReduction);
      }
    }

    if (target === 'enemy' && options.countForDetonation !== false) {
      // FUSE_NETWORK: First non-weapon damage per turn deals +2
      if (nonWeaponDamageCount === 0 && activeItemSets.includes('FUSE_NETWORK')) {
        damage += 2;
      }

      // CORROSION_PAYLOAD: First time your bomb deals damage each turn: apply 1 Rust
      if (
        nonWeaponDamageCount === 0 &&
        options.isBomb &&
        activeItemSets.includes('CORROSION_PAYLOAD')
      ) {
        applyRustToEnemy(1, 'Corrosion Payload');
      }

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

    // I30: Kindling Charge - Battle Start: deal 2; your next bomb deals +3 and self-damage -2
    if (bombId === 'I30') {
      nextBombBonus += 3;
      nextBombSelfDamageReduction += 2;
    }

    for (let trigger = 0; trigger < triggerCount; trigger += 1) {
      const consumesNextBombModifiers = bombId === 'I25';
      const activeSelfReduction = consumesNextBombModifiers ? nextBombSelfDamageReduction : 0;
      if (consumesNextBombModifiers) {
        nextBombSelfDamageReduction = 0;
      }

      // I25: Small Charge - Countdown(2): deal 8 to enemy and you
      if (bombId === 'I25') {
        applyNonWeaponDamage('enemy', 10, {
          source: 'Small Charge',
          isBomb: true,
          countForDetonation: shouldCount,
        });
        applyNonWeaponDamage('player', 4, {
          source: 'Small Charge',
          isBomb: true,
          countForDetonation: shouldCount,
          selfDamageReduction: activeSelfReduction,
        });
      }

      // I30: Kindling Charge
      if (bombId === 'I30') {
        applyNonWeaponDamage('enemy', 2, {
          source: 'Kindling Charge',
          isBomb: false,
          countForDetonation: shouldCount,
        });
      }

      // I31: Time Charge
      if (bombId === 'I31') {
        if (storedTimeChargeDamage > 0) {
          applyNonWeaponDamage('enemy', storedTimeChargeDamage, {
            source: 'Time Charge',
            isBomb: true,
            countForDetonation: shouldCount,
          });
          storedTimeChargeDamage = 0;
        } else {
          applyNonWeaponDamage('enemy', 1, {
            source: 'Time Charge',
            isBomb: true,
            countForDetonation: shouldCount,
          });
        }
      }
    }
  };

  const releaseStoredTimeCharge = (reason: 'Exposed' | 'Turn 6+') => {
    if (storedTimeChargeDamage <= 0) return;
    applyNonWeaponDamage('enemy', storedTimeChargeDamage, {
      source: `Time Charge (${reason})`,
      isBomb: true,
    });
    storedTimeChargeDamage = 0;
  };

  const grantBattleStartGold = (amount: number, effectName: string) => {
    if (amount <= 0) return;
    state = {
      ...state,
      playerGold: state.playerGold + amount,
    };
    state = addLogEntry(state, {
      turn: 0,
      timing: CombatPhase.BattleStart,
      actor: 'player',
      action: 'TRIGGER_ITEMSET',
      target: 'player',
      result: { amount, effectName },
      rngValues: [],
    });
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
      consumedGearIds: [...state.consumedGearIds, 'I49'], // I49: Last Breath Sigil
    };

    state = addLogEntry(state, {
      turn: state.turn,
      timing: state.phase,
      actor: 'player',
      action: 'TRIGGER_ITEM',
      target: 'player',
      result: { healing: 1, effectName: 'Last Breath Sigil' },
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

    // NOTE: G-ST-01 (Miner Helmet) and G-ST-02 (Work Vest) now provide permanent stat bonuses
    // via gear.ts stats property. Their HP/ARM are already included in player stats at combat start.

    // G-ST-03: Spiked Bracers - Battle Start: gain 2/4/6 Shrapnel
    if (spikedBracersShrapnel > 0) {
      applyShrapnelToPlayer(spikedBracersShrapnel, 'Spiked Bracers');
    }

    // G-FR-01: Frost Lantern - Battle Start: give enemy 1/2/3 Chill
    if (frostLanternChill > 0) {
      applyChill('enemy', frostLanternChill, 'Frost Lantern');
    }

    // G-FR-02: Frostguard Buckler - Battle Start: if enemy has Chill, gain +3/+4/+5 Armor and apply 1 Chill
    // (NOTE: The armor bonus from stats is already included in player.arm)
    if (frostguardBonuses.length > 0 && state.enemy.statusEffects.chill > 0) {
      applyPlayerArmor(
        frostguardBonuses.reduce((sum, bonus) => sum + bonus, 0),
        'Frostguard Buckler'
      );
      applyChill('enemy', frostguardBonuses.length, 'Frostguard Buckler');
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
        applyBombEffect('I30', false); // I30: Kindling Charge
      }
    }

    if (bombSatchelCount > 0) {
      triggerBombSatchel('Battle Start', false);
    }

    // ============================================================================
    // Itemset Bonuses (BATTLE_START)
    // ============================================================================

    // UNION_STANDARD: +4 Armor, +1 DIG
    if (activeItemSets.includes('UNION_STANDARD')) {
      applyPlayerArmor(4, 'Union Standard');
      state = {
        ...state,
        player: {
          ...state.player,
          dig: state.player.dig + 1,
        },
      };
      state = addLogEntry(state, {
        turn: 0,
        timing: 'BATTLE_START',
        actor: 'player',
        action: 'TRIGGER_ITEMSET',
        target: 'player',
        result: { effectName: 'Union Standard (+1 DIG)' },
        rngValues: [],
      });
    }

    // SWIFT_DIGGER_KIT: If DIG > enemy DIG, +1 strike and +2 ATK
    if (activeItemSets.includes('SWIFT_DIGGER_KIT')) {
      if (state.player.dig > state.enemy.dig) {
        state = {
          ...state,
          player: {
            ...state.player,
            strikesPerTurn: state.player.strikesPerTurn + 1,
            bonusAtk: state.player.bonusAtk + 2,
          },
        };
        state = addLogEntry(state, {
          turn: 0,
          timing: 'BATTLE_START',
          actor: 'player',
          action: 'TRIGGER_ITEMSET',
          target: 'player',
          result: { effectName: 'Swift Digger Kit (+1 Strike, +2 ATK)' },
          rngValues: [],
        });
      }
    }

    // WHITEOUT_INITIATIVE: +1 SPD; if first, +2 Chill and +3 first-strike damage
    if (activeItemSets.includes('WHITEOUT_INITIATIVE')) {
      state = {
        ...state,
        player: {
          ...state.player,
          spd: state.player.spd + 1,
        },
      };
      state = addLogEntry(state, {
        turn: 0,
        timing: 'BATTLE_START',
        actor: 'player',
        action: 'TRIGGER_ITEMSET',
        target: 'player',
        result: { effectName: 'Whiteout Initiative (+1 SPD)' },
        rngValues: [],
      });

      // Apply Chill if player acts first (SPD >= Enemy SPD)
      if (state.player.spd >= state.enemy.spd) {
        applyChill('enemy', 2, 'Whiteout Initiative');
        whiteoutFirstStrikeBonusPending = true;
      }
    }

    // ROYAL_EXTRACTION: gain +1 Gold at battle start
    if (activeItemSets.includes('ROYAL_EXTRACTION')) {
      grantBattleStartGold(1, 'Royal Extraction (+1 Gold)');
    }

    // BLOODRUSH_PROTOCOL: Turn 1 apply 2 Bleed
    if (activeItemSets.includes('BLOODRUSH_PROTOCOL')) {
      applyBleed('enemy', 2, 'Bloodrush Protocol');
    }
  };

  const handlePlayerTurnStart = () => {
    const isWoundedNow = isWounded(state.player);
    const isExposedNow = isExposed(state.player);

    if (isWoundedNow && !wasPlayerWounded) {
      if (corrodedGreavesCount > 0) {
        applyRustToEnemy(corrodedGreavesCount * 3, 'Corroded Greaves');
      }

      if (drillServoBonuses.length > 0 && !drillServoApplied) {
        state = {
          ...state,
          player: {
            ...state.player,
            strikesPerTurn:
              state.player.strikesPerTurn +
              drillServoBonuses.reduce((sum, bonus) => sum + bonus, 0),
          },
        };
        drillServoApplied = true;
      }

      triggerBombSatchel('Wounded');
    }

    if (isExposedNow && !wasPlayerExposed) {
      releaseStoredTimeCharge('Exposed');

      triggerBombSatchel('Exposed');
    }

    wasPlayerWounded = isWounded(state.player);
    wasPlayerExposed = isExposed(state.player);

    if (royalBracerCount > 0) {
      let gold = state.playerGold;
      let armorGained = 0;
      const conversionRate = activeItemSets.includes('ROYAL_EXTRACTION') ? 4 : 3;

      for (let i = 0; i < royalBracerCount; i += 1) {
        if (gold <= 0) break;
        gold -= 1;
        armorGained += conversionRate;
      }

      updatePlayerGold(gold);
      if (armorGained > 0) {
        applyPlayerArmor(armorGained, 'Royal Bracer');
        if (activeItemSets.includes('GOLDEN_SHRAPNEL_EXCHANGE')) {
          applyShrapnelToPlayer(3, 'Golden Shrapnel Exchange');
        }
      }
    }

    if (timeChargeCount > 0) {
      for (let i = 0; i < timeChargeCount; i += 1) {
        // I31: Time Charge - Turn Start: gain stored damage
        storedTimeChargeDamage += 1;
      }
    }

    if (state.turn >= 6) {
      releaseStoredTimeCharge('Turn 6+');
    }

    // Shard Circuit: Shards trigger every turn
    const shardCircuitActive = activeItemSets.includes('SHARD_CIRCUIT');
    if (shardCircuitActive || playerTurnsTaken % 2 === 0) {
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
      tempAtkBonus !== 0
        ? { ...attackerState, bonusAtk: attackerState.bonusAtk + tempAtkBonus }
        : attackerState;

    const attackOverride = attackerKey === 'player' && playerTool?.id === 'T8';
    const attackerForDamage = attackOverride
      ? { ...effectiveAttacker, atk: effectiveAttacker.dig }
      : effectiveAttacker;

    const damageResult = calculateDamage(attackerForDamage, defenderState);
    const {
      combatant: updatedDefender,
      armorLost,
      hpLost,
    } = applyDamage(defenderState, {
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
          applyBombEffect(item.bombId);
        } else {
          updatedCountdowns.push({ bombId: item.bombId, remaining: nextRemaining });
        }
      }
      countdownItems = updatedCountdowns;
    }

    if (actor === 'player') {
      const statusResult = processStatusEffectsTurnEnd(state.player, hasShrapnelHarness);
      state = { ...state, player: statusResult.combatant };
      if (statusResult.bleedDamage > 0) {
        state = addLogEntry(state, {
          turn: state.turn,
          timing: 'TURN_END',
          actor: 'system',
          action: 'ATTACK',
          target: 'player',
          result: {
            damage: statusResult.bleedDamage,
            statusApplied: { type: 'bleed', stacks: -1 },
          },
          rngValues: [],
        });
      }
      playerTurnsTaken += 1;
    } else {
      const statusResult = processStatusEffectsTurnEnd(state.enemy, false);
      state = { ...state, enemy: statusResult.combatant };
      if (statusResult.bleedDamage > 0) {
        state = addLogEntry(state, {
          turn: state.turn,
          timing: 'TURN_END',
          actor: 'system',
          action: 'ATTACK',
          target: 'enemy',
          result: {
            damage: statusResult.bleedDamage,
            statusApplied: { type: 'bleed', stacks: -1 },
          },
          rngValues: [],
        });

        // BLOODRUSH_PROTOCOL: Gain +1 SPD when enemy takes Bleed damage
        if (activeItemSets.includes('BLOODRUSH_PROTOCOL')) {
          state = {
            ...state,
            player: {
              ...state.player,
              spd: state.player.spd + 1,
            },
          };
          state = addLogEntry(state, {
            turn: state.turn,
            timing: 'TURN_END',
            actor: 'player',
            action: 'TRIGGER_ITEMSET',
            target: 'player',
            result: { effectName: 'Bloodrush Protocol (+1 SPD)' },
            rngValues: [],
          });
        }
      }
    }
  };

  handleBattleStart();

  if (checkCombatEnd(state)) {
    return finalizeCombat(state, rng);
  }

  const playerSpeed = state.player.spd + state.player.bonusSpd;
  const enemySpeed = state.enemy.spd + state.enemy.bonusSpd;
  // Player attacks first ONLY if strictly faster (matches on-chain logic in engine.rs)
  // When speeds are equal, enemy attacks first
  let nextAttacker: 'player' | 'enemy' = playerSpeed > enemySpeed ? 'player' : 'enemy';

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
        if (bossId === 'B-A-W2-02') {
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
            target: bossId === 'B-A-W1-03' ? 'player' : 'enemy',
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
    // Apply Chill effect: reduces strikes by stack count (min 1)
    // This matches on-chain behavior in effects.rs:apply_chill_to_strikes()
    const strikes = getEffectiveStrikes(attackerState);
    let strikesLanded = 0;
    // Removed whetstoneBonus - that item no longer exists in the new item system
    const tempAtkBonus = 0;

    for (let strike = 0; strike < strikes; strike += 1) {
      if (isDefeated(nextAttacker === 'player' ? state.enemy : state.player)) {
        break;
      }

      const strikeTempBonus =
        nextAttacker === 'player' &&
        playerTool?.id === 'T4' &&
        strike >= 2 &&
        pneumaticDrillGearAtkPenalty > 0
          ? -pneumaticDrillGearAtkPenalty
          : tempAtkBonus +
            (nextAttacker === 'player' &&
            activeItemSets.includes('WHITEOUT_INITIATIVE') &&
            whiteoutFirstStrikeBonusPending &&
            state.turn === 1 &&
            strike === 0
              ? 3
              : 0);

      const { hpLost } = resolveWeaponStrike(nextAttacker, strikeTempBonus);
      if (
        nextAttacker === 'player' &&
        activeItemSets.includes('WHITEOUT_INITIATIVE') &&
        whiteoutFirstStrikeBonusPending &&
        state.turn === 1 &&
        strike === 0
      ) {
        whiteoutFirstStrikeBonusPending = false;
      }
      strikesLanded += 1;

      if (bossId === 'B-A-W3-01' && nextAttacker === 'player' && hpLost > 0) {
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

    if (nextAttacker === 'player' && strikesLanded > 0) {
      if (rustSpikeCount > 0) {
        const totalRustStacks = strikesLanded * rustSpikeCount * gearLinkMultiplier;
        applyRustToEnemy(totalRustStacks, 'Rust Spike');
      }
      // RUST_RITUAL: On Hit apply +1 Rust
      if (activeItemSets.includes('RUST_RITUAL')) {
        const totalRustStacks = strikesLanded * 1 * gearLinkMultiplier;
        applyRustToEnemy(totalRustStacks, 'Rust Ritual');
        if (state.enemy.arm <= 0) {
          applyNonWeaponDamage('enemy', Math.min(3, totalRustStacks), { source: 'Rust Ritual' });
        }
      }
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

  let finalState: CombatState = {
    ...state,
    result,
    rngState: finalRngState,
  };

  if (result === 'VICTORY' && state.goldReward > 0) {
    finalState = addLogEntry(finalState, {
      turn: state.turn,
      timing: CombatPhase.BattleEnd,
      actor: 'system',
      action: 'GOLD_REWARD',
      target: 'none',
      result: {
        amount: state.goldReward,
        totalGold: state.playerGold + state.goldReward,
      },
      rngValues: [],
    });
  }

  return finalState;
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
