import { resolveCombatWithParity } from '@/game/combat/parity-resolver';
import type { CombatResolverInput } from '@/game/combat/types';
import type { CombatantState } from '@/game/engine/types';
import {
  calculateCombatBakedItemStats,
  createGearInstance,
  createToolInstance,
} from '@/game/entities/items';
import { ENEMY_DEFINITIONS } from '@/game/entities/enemies';
import type { GearId, ToolId } from '@/game/engine/types';

function buildPlayerCombatant(
  startingHp: number,
  currentHp: number,
  toolId: ToolId,
  gearIds: GearId[]
): CombatantState {
  const tool = createToolInstance(toolId);
  const gear = gearIds.map((id) => createGearInstance(id, 'COMMON'));
  const bonuses = calculateCombatBakedItemStats(tool, gear);

  const maxHp = startingHp + (bonuses.hp ?? 0);
  return {
    name: 'Player',
    emoji: '🧑‍🔧',
    definitionId: 'player',
    isPlayer: true,
    maxHp,
    hp: Math.min(currentHp, maxHp),
    atk: bonuses.atk ?? 0,
    arm: bonuses.arm ?? 0,
    spd: bonuses.spd ?? 0,
    dig: bonuses.dig ?? 0,
    bonusAtk: 0,
    bonusArm: 0,
    bonusSpd: 0,
    statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
    strikesPerTurn: 1,
    ignoresArmor: false,
  };
}

function buildEnemyCombatant(
  enemyId: 'BLOOD_MOSQUITO' | 'TUNNEL_RAT' | 'COIN_SLUG' | 'POWDER_TICK' | 'TUNNEL_WARDEN',
  tier: 1 | 2 | 3
): CombatantState {
  const stats = ENEMY_DEFINITIONS[enemyId].tiers[tier - 1];
  return {
    name: ENEMY_DEFINITIONS[enemyId].name,
    emoji: ENEMY_DEFINITIONS[enemyId].emoji,
    definitionId: enemyId,
    isPlayer: false,
    maxHp: stats.hp,
    hp: stats.hp,
    atk: stats.atk,
    arm: stats.arm,
    spd: stats.spd,
    dig: stats.dig,
    bonusAtk: 0,
    bonusArm: 0,
    bonusSpd: 0,
    statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
    strikesPerTurn: 1,
    ignoresArmor: false,
  };
}

describe('resolveCombatWithParity', () => {
  it('matches the rust-side blood mosquito regression scenario', () => {
    const playerTool = createToolInstance('T9');
    const playerGear = [createGearInstance('I33', 'COMMON'), createGearInstance('I34', 'COMMON')];
    const input: CombatResolverInput = {
      player: buildPlayerCombatant(25, 25, 'T9', ['I33', 'I34']),
      enemy: buildEnemyCombatant('BLOOD_MOSQUITO', 2),
      seed: 1,
      enemyId: 'BLOOD_MOSQUITO',
      enemyDefinitionId: 'BLOOD_MOSQUITO',
      enemyTier: 2,
      playerTool,
      playerGear,
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);

    expect(outcome.player.hp).toBe(23);
  });

  it('orders tunnel rat gold steal before shrapnel retaliation kill', () => {
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 25, 'T0', ['I3']),
        atk: 1,
        arm: 2,
        spd: 0,
      },
      enemy: buildEnemyCombatant('TUNNEL_RAT', 1),
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool: createToolInstance('T0'),
      playerGear: [createGearInstance('I3', 'RARE')],
      playerGold: 5,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const stealIndex = outcome.log.findIndex(
      (entry) => entry.result.goldStolen === 1 && entry.actor === 'enemy'
    );
    const shrapnelIndex = outcome.log.findIndex(
      (entry) => entry.result.source?.id === 'shrapnel' && (entry.result.damage ?? 0) > 0
    );

    expect(stealIndex).toBeGreaterThanOrEqual(0);
    expect(shrapnelIndex).toBeGreaterThan(stealIndex);
  });

  it('matches the backend result for rime pike + frost lantern + rust engine vs coin slug t1', () => {
    const input: CombatResolverInput = {
      player: buildPlayerCombatant(25, 25, 'T9', ['I33', 'I46']),
      enemy: buildEnemyCombatant('COIN_SLUG', 1),
      seed: 1,
      enemyId: 'COIN_SLUG',
      enemyDefinitionId: 'COIN_SLUG',
      enemyTier: 1,
      playerTool: createToolInstance('T9'),
      playerGear: [createGearInstance('I33', 'COMMON'), createGearInstance('I46', 'COMMON')],
      playerGold: 10,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);

    expect(outcome.player.hp).toBe(25);
  });

  it('resolves powder tick t3 using faster-side countdown before slower turn-start effects', () => {
    const input: CombatResolverInput = {
      player: buildPlayerCombatant(25, 25, 'T9', ['I33', 'I46']),
      enemy: {
        ...buildEnemyCombatant('POWDER_TICK', 3),
        hp: 20,
        maxHp: 20,
      },
      seed: 1,
      enemyId: 'POWDER_TICK',
      enemyDefinitionId: 'POWDER_TICK',
      enemyTier: 3,
      playerTool: createToolInstance('T9'),
      playerGear: [createGearInstance('I33', 'COMMON'), createGearInstance('I46', 'COMMON')],
      playerGold: 10,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);

    expect(outcome.player.hp).toBe(20);
    const countdownPlayerDamageIndex = outcome.log.findIndex(
      (entry) =>
        entry.actor === 'enemy' &&
        entry.target === 'player' &&
        entry.result.damage === 3
    );
    const postCountdownEnemyAttackIndex = outcome.log.findIndex(
      (entry, index) =>
        index > countdownPlayerDamageIndex && entry.actor === 'enemy' && entry.action === 'ATTACK'
    );

    expect(countdownPlayerDamageIndex).toBeGreaterThanOrEqual(0);
    expect(postCountdownEnemyAttackIndex).toBe(-1);
  });

  it('applies Double Detonation to both halves of the first and second bomb detonations each turn', () => {
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 25, 'T0', ['I25', 'I25', 'I28']),
        atk: 0,
        spd: 5,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        hp: 40,
        maxHp: 40,
        atk: 0,
        spd: 0,
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool: createToolInstance('T0'),
      playerGear: [
        createGearInstance('I25', 'COMMON'),
        createGearInstance('I25', 'COMMON'),
        createGearInstance('I28', 'COMMON'),
      ],
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const countdownLog = outcome.log.filter(
      (entry) => entry.turn === 3 && entry.actor === 'player' && entry.result.source?.id === 'I25'
    );
    const damageSequence = countdownLog.map((entry) => entry.result.damage);

    expect(damageSequence).toEqual([9, 5, 11, 7]);
  });

  it('applies Kindling Charge to the next bomb only', () => {
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 25, 'T0', ['I30', 'I25']),
        atk: 0,
        spd: 5,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        hp: 40,
        maxHp: 40,
        atk: 0,
        spd: 0,
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool: createToolInstance('T0'),
      playerGear: [createGearInstance('I30', 'COMMON'), createGearInstance('I25', 'COMMON')],
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const bombDamageSequence = outcome.log
      .filter(
        (entry) => entry.turn === 3 && entry.actor === 'player' && entry.result.source?.id === 'I25'
      )
      .map((entry) => entry.result.damage);

    expect(bombDamageSequence).toEqual([11, 2]);
  });

  it('makes countdown bombs trigger twice with Twin-Fuse Knot', () => {
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 25, 'T0', ['I25', 'I32']),
        atk: 0,
        spd: 5,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        hp: 40,
        maxHp: 40,
        atk: 0,
        spd: 0,
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool: createToolInstance('T0'),
      playerGear: [createGearInstance('I25', 'COMMON'), createGearInstance('I32', 'COMMON')],
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const bombDamageSequence = outcome.log
      .filter(
        (entry) => entry.turn === 3 && entry.actor === 'player' && entry.result.source?.id === 'I25'
      )
      .map((entry) => entry.result.damage);

    expect(bombDamageSequence).toEqual([8, 3, 8, 4]);
  });

  it('releases Time Charge stored damage when the owner is first exposed', () => {
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 25, 'T0', ['I31']),
        atk: 0,
        spd: 0,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        hp: 20,
        maxHp: 20,
        atk: 3,
        arm: 0,
        spd: 2,
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool: createToolInstance('T0'),
      playerGear: [createGearInstance('I31', 'COMMON')],
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const exposureRelease = outcome.log.find(
      (entry) =>
        entry.turn === 1 &&
        entry.actor === 'player' &&
        entry.result.source?.id === 'I31' &&
        entry.result.damage === 2
    );

    expect(exposureRelease).toBeDefined();
  });

  it('releases Time Charge stored damage on turn 5', () => {
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 25, 'T0', ['I31']),
        atk: 0,
        spd: 5,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        hp: 50,
        maxHp: 50,
        atk: 0,
        arm: 0,
        spd: 0,
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool: createToolInstance('T0'),
      playerGear: [createGearInstance('I31', 'COMMON')],
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const turnFiveRelease = outcome.log.find(
      (entry) =>
        entry.turn === 5 &&
        entry.actor === 'player' &&
        entry.result.source?.id === 'I31' &&
        entry.result.damage === 10
    );

    expect(turnFiveRelease).toBeDefined();
  });

  it('Last Breath Sigil revives the player to 2 HP after a fatal hit', () => {
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(20, 20, 'T0', ['I49']),
        atk: 50,
        spd: 0,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        hp: 10,
        maxHp: 10,
        atk: 25,
        arm: 0,
        spd: 2,
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool: createToolInstance('T0'),
      playerGear: [createGearInstance('I49', 'COMMON')],
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const reviveLog = outcome.log.find(
      (entry) =>
        entry.actor === 'player' &&
        entry.target === 'player' &&
        entry.result.source?.id === 'I49' &&
        entry.result.healing === 2
    );

    expect(reviveLog).toBeDefined();
    expect(outcome.player.hp).toBe(2);
    expect(outcome.result).toBe('VICTORY');
  });

  it('Vampiric Tooth does not heal on the same hit that first applies bleed, and heals by pre-hit bleed stacks later', () => {
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 21, 'T13', ['I56']),
        atk: 1,
        spd: 4,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        hp: 20,
        maxHp: 20,
        atk: 0,
        arm: 0,
        spd: 0,
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool: createToolInstance('T13'),
      playerGear: [createGearInstance('I56', 'COMMON')],
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const turnOneVampHeal = outcome.log.find(
      (entry) =>
        entry.turn === 1 &&
        entry.actor === 'player' &&
        entry.result.source?.id === 'I56' &&
        entry.result.healing
    );
    const turnTwoVampHeal = outcome.log.find(
      (entry) =>
        entry.turn === 2 &&
        entry.actor === 'player' &&
        entry.result.source?.id === 'I56' &&
        entry.result.healing === 1
    );

    expect(turnOneVampHeal).toBeUndefined();
    expect(turnTwoVampHeal).toBeDefined();
  });

  it('Deep Freeze Charm logs enemy SPD reduction and only amplifies non-weapon damage while enemy is chilled', () => {
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 25, 'T0', ['I40', 'I25']),
        hp: 40,
        maxHp: 40,
        atk: 0,
        spd: 0,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        hp: 20,
        maxHp: 20,
        atk: 16,
        arm: 0,
        spd: 2,
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool: createToolInstance('T0'),
      playerGear: [createGearInstance('I40', 'COMMON'), createGearInstance('I25', 'COMMON')],
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const spdReduction = outcome.log.find(
      (entry) =>
        entry.actor === 'player' &&
        entry.target === 'enemy' &&
        entry.result.source?.id === 'I40' &&
        entry.result.spdBonus === -1
    );
    const smallChargeEnemyHit = outcome.log.find(
      (entry) =>
        entry.actor === 'player' &&
        entry.target === 'enemy' &&
        entry.result.source?.id === 'I25' &&
        (entry.result.damage ?? 0) > 8
    );

    expect(spdReduction).toBeDefined();
    expect(smallChargeEnemyHit).toBeDefined();
  });

  it('does not grant Etched Burrowblade armor piercing unless the enemy already has Rust', () => {
    const playerTool = createToolInstance('T12');
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 25, 'T12', []),
        atk: 4,
        spd: 5,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        hp: 10,
        maxHp: 10,
        arm: 3,
        spd: 0,
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool,
      playerGear: [],
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const firstAttack = outcome.log.find(
      (entry) => entry.actor === 'player' && entry.action === 'ATTACK'
    );

    expect(firstAttack?.result.armorLost).toBe(3);
    expect(firstAttack?.result.damage).toBe(1);
  });

  it('duplicates Serrated Drill bleed on the same hit with Gear-Link Medallion', () => {
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 25, 'T13', ['I16']),
        spd: 5,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        hp: 10,
        maxHp: 10,
        arm: 0,
        spd: 0,
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool: createToolInstance('T13'),
      playerGear: [createGearInstance('I16', 'COMMON')],
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const bleedApplications = outcome.log.filter(
      (entry) =>
        entry.turn === 1 &&
        entry.actor === 'player' &&
        entry.action === 'APPLY_STATUS' &&
        entry.result.source?.id === 'T13' &&
        entry.result.statusApplied?.type === 'bleed' &&
        entry.result.statusApplied?.stacks === 1
    );

    expect(bleedApplications).toHaveLength(2);
  });

  it('grants Gilded Band armor from floor(playerGold / 6) capped by tier', () => {
    const commonInput: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 25, 'T0', ['I19']),
        spd: 5,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        atk: 0,
        hp: 20,
        maxHp: 20,
        spd: 0,
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool: createToolInstance('T0'),
      playerGear: [createGearInstance('I19', 'COMMON')],
      playerGold: 100,
      enemyGold: 0,
      preserveArmor: true,
    };

    const rareInput: CombatResolverInput = {
      ...commonInput,
      playerGear: [createGearInstance('I19', 'SAPPHIRE')],
    };

    const commonOutcome = resolveCombatWithParity(commonInput);
    const gildedOutcome = resolveCombatWithParity(rareInput);

    const commonGoldArmorGain = commonOutcome.log.find(
      (entry) =>
        entry.actor === 'player' &&
        entry.result.source?.id === 'I19' &&
        entry.result.armorGained === 6
    );
    const rareGoldArmorGain = gildedOutcome.log.find(
      (entry) =>
        entry.actor === 'player' &&
        entry.result.source?.id === 'I19' &&
        entry.result.armorGained === 12
    );

    expect(commonGoldArmorGain).toBeDefined();
    expect(rareGoldArmorGain).toBeDefined();
  });

  it('does not grant Gilded Band SPD below 20 gold', () => {
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 25, 'T0', ['I19']),
        spd: 1,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        atk: 0,
        spd: 0,
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool: createToolInstance('T0'),
      playerGear: [createGearInstance('I19', 'COMMON')],
      playerGold: 19,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const gildedBandSpdLog = outcome.log.find(
      (entry) =>
        entry.actor === 'player' && entry.result.source?.id === 'I19' && entry.result.spdBonus === 1
    );

    expect(gildedBandSpdLog).toBeUndefined();
  });

  it('logs Royal Bracer as spending gold and gaining armor at turn start', () => {
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 25, 'T0', ['I20']),
        spd: 5,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        atk: 0,
        spd: 0,
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool: createToolInstance('T0'),
      playerGear: [createGearInstance('I20', 'COMMON')],
      playerGold: 5,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const royalBracerLog = outcome.log.find(
      (entry) =>
        entry.turn === 1 &&
        entry.actor === 'player' &&
        entry.result.source?.id === 'I20' &&
        entry.result.armorGained === 4
    );

    expect(royalBracerLog?.result.goldSpent).toBe(1);
    expect(royalBracerLog?.result.goldStolen).toBeUndefined();
  });

  it('lets Tunnel Warden remove Royal Bracer armor on its first strike of turn 1', () => {
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 25, 'T0', ['I20']),
        arm: 0,
        spd: 0,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_WARDEN', 1),
        spd: 2,
      },
      seed: 1,
      enemyId: 'TUNNEL_WARDEN',
      enemyDefinitionId: 'TUNNEL_WARDEN',
      enemyTier: 1,
      playerTool: createToolInstance('T0'),
      playerGear: [createGearInstance('I20', 'COMMON')],
      playerGold: 1,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const royalBracerGainIndex = outcome.log.findIndex(
      (entry) =>
        entry.turn === 1 &&
        entry.actor === 'player' &&
        entry.result.source?.id === 'I20' &&
        entry.result.armorGained === 4
    );
    const tunnelWardenArmorBreakIndex = outcome.log.findIndex(
      (entry) =>
        entry.turn === 1 &&
        entry.actor === 'enemy' &&
        entry.result.source?.id === 'TUNNEL_WARDEN' &&
        entry.result.armorLost === 1
    );

    expect(royalBracerGainIndex).toBeGreaterThanOrEqual(0);
    expect(tunnelWardenArmorBreakIndex).toBeGreaterThan(royalBracerGainIndex);
  });

  it('splits Basic Pickaxe and Royal Bracer attack contributions on the first hit', () => {
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 25, 'T0', ['I20']),
        spd: 5,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        arm: 0,
        hp: 10,
        maxHp: 10,
        spd: 0,
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool: createToolInstance('T0'),
      playerGear: [createGearInstance('I20', 'COMMON')],
      playerGold: 1,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const firstAttack = outcome.log.find(
      (entry) => entry.actor === 'player' && entry.action === 'ATTACK'
    );

    expect(firstAttack?.result.damage).toBe(2);
    expect(firstAttack?.result.contributions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: expect.objectContaining({ id: 'T0' }), value: 1 }),
        expect.objectContaining({ source: expect.objectContaining({ id: 'I20' }), value: 1 }),
      ])
    );
    expect(firstAttack?.result.contributions).toHaveLength(2);
  });

  it('triggers Quartz Shard on turn 1 first hit with Gemfinder Staff', () => {
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 20, 'T6', ['I21']),
        spd: 5,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        hp: 10,
        maxHp: 10,
        arm: 0,
        spd: 0,
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool: createToolInstance('T6'),
      playerGear: [createGearInstance('I21', 'COMMON')],
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const emeraldHeal = outcome.log.find(
      (entry) =>
        entry.turn === 1 &&
        entry.actor === 'player' &&
        entry.result.source?.id === 'I21' &&
        entry.result.healing === 2
    );

    expect(emeraldHeal).toBeDefined();
  });

  it('grants the faster side one extra strike when leading by 5 SPD', () => {
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 25, 'T0', []),
        atk: 1,
        spd: 6,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        hp: 10,
        maxHp: 10,
        atk: 1,
        arm: 0,
        spd: 1,
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool: createToolInstance('T0'),
      playerGear: [],
      playerGold: 0,
      enemyGold: 0,
    };

    const outcome = resolveCombatWithParity(input);
    const firstEnemyAttackIndex = outcome.log.findIndex(
      (entry) => entry.actor === 'enemy' && entry.action === 'ATTACK'
    );
    const playerAttackIndexes = outcome.log
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.actor === 'player' && entry.action === 'ATTACK')
      .map(({ index }) => index);
    const playerAttacksBeforeEnemyActs = playerAttackIndexes.filter(
      (index) => index < firstEnemyAttackIndex
    );

    expect(playerAttacksBeforeEnemyActs).toHaveLength(2);
    expect(firstEnemyAttackIndex).toBeGreaterThan(playerAttacksBeforeEnemyActs[1] ?? -1);
  });

  it('upgrades Etched Burrowblade to full armor ignore after hitting a 4+ Rust enemy', () => {
    const playerTool = createToolInstance('T12');
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 25, 'T12', []),
        atk: 4,
        spd: 4,
        strikesPerTurn: 2,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        hp: 20,
        maxHp: 20,
        arm: 8,
        spd: 0,
        statusEffects: { chill: 0, shrapnel: 0, rust: 4, bleed: 0 },
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool,
      playerGear: [],
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const playerAttacks = outcome.log.filter(
      (entry) => entry.actor === 'player' && entry.action === 'ATTACK' && entry.turn === 1
    );

    expect(playerAttacks).toHaveLength(2);
    expect(playerAttacks[0]?.result.armorLost).toBe(0);
    expect(playerAttacks[0]?.result.damage).toBe(4);
    expect(playerAttacks[1]?.result.armorLost).toBe(0);
    expect(playerAttacks[1]?.result.damage).toBe(4);
  });

  it('applies Etched Burrowblade battle-start piercing when Salvage Clamp adds Rust first', () => {
    const playerTool = createToolInstance('T12');
    const playerGear = [createGearInstance('I48', 'GOLDEN')];
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 25, 'T12', ['I48']),
        atk: 4,
        spd: 5,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        hp: 10,
        maxHp: 10,
        arm: 2,
        spd: 0,
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool,
      playerGear,
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const firstAttack = outcome.log.find(
      (entry) => entry.actor === 'player' && entry.action === 'ATTACK'
    );

    expect(firstAttack?.result.armorLost).toBe(0);
    expect(firstAttack?.result.damage).toBe(4);
  });

  it('grants Salvage Clamp gold when its battle-start Rust is applied', () => {
    const playerGear = [createGearInstance('I48', 'COMMON')];
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 25, 'T0', ['I48']),
        atk: 0,
        spd: 5,
      },
      enemy: {
        ...buildEnemyCombatant('COIN_SLUG', 1),
        hp: 10,
        maxHp: 10,
        arm: 2,
        atk: 0,
        spd: 0,
      },
      seed: 1,
      enemyId: 'COIN_SLUG',
      enemyDefinitionId: 'COIN_SLUG',
      enemyTier: 1,
      playerTool: createToolInstance('T0'),
      playerGear,
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const salvageClampGoldLog = outcome.log.find(
      (entry) =>
        entry.actor === 'player' &&
        entry.target === 'player' &&
        entry.result.source?.id === 'I48' &&
        entry.result.goldGained === 2
    );

    expect(outcome.playerGold).toBe(2);
    expect(salvageClampGoldLog).toBeDefined();
  });

  it('fully ignores armor on the first strike when battle-start Rust is already at four stacks', () => {
    const playerTool = createToolInstance('T12');
    const playerGear = [createGearInstance('I48', 'GOLDEN')];
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 25, 'T12', ['I48']),
        atk: 2,
        spd: 5,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        hp: 10,
        maxHp: 10,
        arm: 8,
        spd: 0,
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool,
      playerGear,
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const firstAttack = outcome.log.find(
      (entry) => entry.actor === 'player' && entry.action === 'ATTACK'
    );

    expect(firstAttack?.result.armorLost).toBe(0);
    expect(firstAttack?.result.damage).toBe(2);
  });

  it('triggers Rebar Carapace only once even if the player becomes exposed multiple times', () => {
    const playerGear = [createGearInstance('I5', 'COMMON')];
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(40, 40, 'T0', ['I5']),
        atk: 0,
        arm: 0,
        spd: 0,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        hp: 40,
        maxHp: 40,
        atk: 4,
        arm: 0,
        spd: 1,
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool: createToolInstance('T0'),
      playerGear,
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const rebarTriggers = outcome.log.filter(
      (entry) =>
        entry.actor === 'player' &&
        entry.action === 'GAIN_ARMOR' &&
        entry.result.effectName === 'Rebar Carapace' &&
        entry.result.armorGained === 4
    );

    expect(rebarTriggers).toHaveLength(1);
  });

  it('emits a DIG bonus log for Tunneler Spurs when the player acts first on turn one', () => {
    const playerGear = [createGearInstance('I12', 'COMMON')];
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 25, 'T0', ['I12']),
        atk: 1,
        spd: 5,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        hp: 10,
        maxHp: 10,
        spd: 0,
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool: createToolInstance('T0'),
      playerGear,
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const digGain = outcome.log.find(
      (entry) =>
        entry.actor === 'player' &&
        entry.result.effectName === 'Tunneler Spurs' &&
        entry.result.digBonus === 1
    );

    expect(digGain).toBeDefined();
  });

  it('tracks Weak-Point Manual baked attack on each Twin Picks strike immediately', () => {
    const playerTool = createToolInstance('T3');
    const playerGear = [createGearInstance('I15', 'COMMON'), createGearInstance('I9', 'SAPPHIRE')];
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 25, 'T3', ['I15', 'I9']),
        strikesPerTurn: 2,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_WARDEN', 1),
        hp: 8,
        maxHp: 8,
      },
      seed: 1,
      enemyId: 'TUNNEL_WARDEN',
      enemyDefinitionId: 'TUNNEL_WARDEN',
      enemyTier: 1,
      playerTool,
      playerGear,
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const firstTurnPlayerAttacks = outcome.log.filter(
      (entry) => entry.turn === 1 && entry.actor === 'player' && entry.action === 'ATTACK'
    );

    expect(firstTurnPlayerAttacks.length).toBeGreaterThan(0);
    for (const attack of firstTurnPlayerAttacks) {
      expect(attack.result.contributions?.some((c) => c.source.id === 'I15' && c.value === 1)).toBe(
        true
      );
    }
  });

  it('does not let Execution Emblem trigger on the second strike after that strike wounds the enemy', () => {
    const playerGear = [createGearInstance('I54', 'COMMON')];
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 25, 'T0', ['I54']),
        atk: 2,
        spd: 4,
        strikesPerTurn: 2,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        hp: 10,
        maxHp: 10,
        arm: 0,
        atk: 0,
        spd: 0,
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool: createToolInstance('T0'),
      playerGear,
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const executionEmblemHitOnTurnOne = outcome.log.find(
      (entry) =>
        entry.turn === 1 &&
        entry.actor === 'player' &&
        entry.target === 'enemy' &&
        entry.result.source?.id === 'I54' &&
        entry.result.damage === 3
    );
    const turnOnePlayerAttacks = outcome.log.filter(
      (entry) => entry.turn === 1 && entry.actor === 'player' && entry.action === 'ATTACK'
    );

    expect(executionEmblemHitOnTurnOne).toBeUndefined();
    expect(turnOnePlayerAttacks).toHaveLength(2);
    expect(turnOnePlayerAttacks.every((entry) => entry.result.source?.id !== 'I54')).toBe(true);
  });

  it('still lets Execution Emblem trigger on the actual first strike when the enemy starts wounded', () => {
    const playerGear = [createGearInstance('I54', 'COMMON')];
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 25, 'T0', ['I54']),
        atk: 2,
        spd: 4,
        strikesPerTurn: 2,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        hp: 4,
        maxHp: 10,
        arm: 0,
        atk: 0,
        spd: 0,
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool: createToolInstance('T0'),
      playerGear,
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const executionEmblemHit = outcome.log.find(
      (entry) =>
        entry.turn === 1 &&
        entry.actor === 'player' &&
        entry.target === 'enemy' &&
        entry.result.source?.id === 'I54' &&
        entry.result.damage === 3
    );

    expect(executionEmblemHit).toBeDefined();
    expect(outcome.result).toBe('VICTORY');
  });

  it('fires shrapnel retaliation even on a lethal hit (on-chain parity: death check after shrapnel)', () => {
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 25, 'T0', []),
        atk: 5,
        spd: 5,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        hp: 1,
        maxHp: 1,
        atk: 0,
        arm: 0,
        spd: 0,
        statusEffects: { chill: 0, shrapnel: 3, rust: 0, bleed: 0 },
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool: createToolInstance('T0'),
      playerGear: [],
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const shrapnelRetaliation = outcome.log.find(
      (entry) =>
        entry.result.source?.id === 'shrapnel' &&
        entry.target === 'player' &&
        (entry.result.damage ?? 0) > 0
    );

    // On-chain: shrapnel fires even when defender dies (death check is AFTER shrapnel)
    // Player ATK 5, shrapnel reflects floor(5/2) = 2 back
    expect(outcome.result).toBe('VICTORY');
    expect(outcome.player.hp).toBe(23); // 25 - 2 shrapnel (50% of 5)
    expect(shrapnelRetaliation).toBeDefined();
  });

  it('does not cancel later enemy strikes when shrapnel retaliates and the attacker survives', () => {
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 25, 'T0', ['I3']),
        atk: 1,
        arm: 0,
        spd: 0,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        hp: 5,
        maxHp: 5,
        atk: 1,
        arm: 0,
        spd: 4,
        strikesPerTurn: 2,
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool: createToolInstance('T0'),
      playerGear: [createGearInstance('I3', 'COMMON')],
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const enemyAttackEntries = outcome.log.filter(
      (entry) =>
        entry.turn === 1 &&
        entry.timing === 'ENEMY_ATTACK' &&
        entry.actor === 'enemy' &&
        entry.action === 'ATTACK'
    );
    const shrapnelEntries = outcome.log.filter(
      (entry) =>
        entry.turn === 1 &&
        entry.timing === 'ENEMY_ATTACK' &&
        entry.result.source?.id === 'shrapnel' &&
        (entry.result.damage ?? 0) > 0
    );

    expect(enemyAttackEntries).toHaveLength(2);
    expect(shrapnelEntries).toHaveLength(2);
    expect(outcome.player.hp).toBe(21);
  });

  it('keeps the second mole Twin Picks strike and the later player turn with Basic Pickaxe vs Spiked Bracers', () => {
    const enemyTool = createToolInstance('T3');
    const input: CombatResolverInput = {
      player: buildPlayerCombatant(20, 20, 'T0', ['I3']),
      enemy: {
        name: 'Opponent',
        emoji: '',
        definitionId: 'pvpOpponent',
        isPlayer: false,
        maxHp: 20,
        hp: 20,
        atk: 1,
        arm: 0,
        spd: 0,
        dig: 0,
        bonusAtk: 0,
        bonusArm: 0,
        bonusSpd: 0,
        statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
        strikesPerTurn: 1,
        ignoresArmor: false,
      },
      seed: 1337,
      enemyDefinitionId: 'pvpOpponent',
      playerTool: createToolInstance('T0'),
      playerGear: [createGearInstance('I3', 'COMMON')],
      playerGold: 0,
      enemyGold: 0,
      enemyTool,
      enemyGear: [],
      enemyActiveItemSets: [],
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const turnOneEnemyAttacks = outcome.log.filter(
      (entry) =>
        entry.turn === 1 &&
        entry.timing === 'ENEMY_ATTACK' &&
        entry.actor === 'enemy' &&
        entry.action === 'ATTACK'
    );
    const turnOneShrapnelRetaliations = outcome.log.filter(
      (entry) =>
        entry.turn === 1 &&
        entry.timing === 'ENEMY_ATTACK' &&
        entry.actor === 'player' &&
        entry.result.source?.id === 'shrapnel' &&
        (entry.result.damage ?? 0) > 0
    );
    const firstPlayerAttack = outcome.log.find(
      (entry) =>
        entry.turn === 1 &&
        entry.timing === 'PLAYER_ATTACK' &&
        entry.actor === 'player' &&
        entry.action === 'ATTACK'
    );

    expect(turnOneEnemyAttacks).toHaveLength(2);
    expect(turnOneShrapnelRetaliations).toHaveLength(2);
    expect(firstPlayerAttack).toBeDefined();
  });

  it('finishes a bomb source instance before ending combat, but does not trigger later bomb instances', () => {
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 9, 'T0', ['I25', 'I25']),
        atk: 0,
        spd: 4,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        hp: 8,
        maxHp: 8,
        atk: 0,
        spd: 0,
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool: createToolInstance('T0'),
      playerGear: [createGearInstance('I25', 'COMMON'), createGearInstance('I25', 'COMMON')],
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const turnTwoChargeLogs = outcome.log.filter(
      (entry) => entry.turn === 3 && entry.actor === 'player' && entry.result.source?.id === 'I25'
    );
    const turnTwoDamages = turnTwoChargeLogs.map((entry) => entry.result.damage);

    expect(outcome.result).toBe('VICTORY');
    expect(outcome.player.hp).toBe(5);
    expect(turnTwoDamages).toEqual([8, 4]);
  });

  it('counts a same-bomb mutual kill as defeat for the player', () => {
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 4, 'T0', ['I25']),
        atk: 0,
        spd: 4,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        hp: 8,
        maxHp: 8,
        atk: 0,
        spd: 0,
      },
      seed: 1,
      enemyId: 'TUNNEL_RAT',
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      playerTool: createToolInstance('T0'),
      playerGear: [createGearInstance('I25', 'COMMON')],
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);
    const turnTwoChargeLogs = outcome.log.filter(
      (entry) => entry.turn === 3 && entry.actor === 'player' && entry.result.source?.id === 'I25'
    );

    expect(turnTwoChargeLogs.map((entry) => entry.result.damage)).toEqual([8, 4]);
    expect(outcome.result).toBe('DEFEAT');
    expect(outcome.player.hp).toBe(0);
    expect(outcome.enemy.hp).toBe(0);
  });

  it('uses PvP stat tiebreakers for mutual kills before the final fallback', () => {
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 4, 'T0', ['I25']),
        atk: 0,
        spd: 4,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        hp: 4,
        maxHp: 4,
        atk: 0,
        spd: 3,
      },
      seed: 1,
      enemyDefinitionId: 'pvpOpponent',
      playerTool: createToolInstance('T0'),
      playerGear: [createGearInstance('I25', 'COMMON')],
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);

    expect(outcome.player.hp).toBe(0);
    expect(outcome.enemy.hp).toBe(0);
    expect(outcome.result).toBe('VICTORY');
  });

  it('uses pre-exchange HP plus ARM before later PvP stat tiebreakers', () => {
    const input: CombatResolverInput = {
      player: {
        ...buildPlayerCombatant(25, 4, 'T0', ['I25']),
        atk: 0,
        spd: 4,
      },
      enemy: {
        ...buildEnemyCombatant('TUNNEL_RAT', 1),
        hp: 8,
        maxHp: 8,
        atk: 0,
        spd: 3,
      },
      seed: 1,
      enemyDefinitionId: 'pvpOpponent',
      playerTool: createToolInstance('T0'),
      playerGear: [createGearInstance('I25', 'COMMON')],
      playerGold: 0,
      enemyGold: 0,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);

    expect(outcome.player.hp).toBe(0);
    expect(outcome.enemy.hp).toBe(0);
    expect(outcome.result).toBe('DEFEAT');
  });

  it('PvP speed tie: enemy acts first by default (on-chain creator = player slot)', () => {
    // On-chain: creator is "player", opponent is "enemy". Equal speed → enemy first.
    // Player A (creator) view: self=player, opp=enemy → enemy acts first ✓
    const player: CombatantState = {
      name: 'Creator', emoji: '', definitionId: 'player', isPlayer: true,
      maxHp: 10, hp: 10, atk: 5, arm: 0, spd: 3, dig: 0,
      bonusAtk: 0, bonusArm: 0, bonusSpd: 0,
      statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
      strikesPerTurn: 1, ignoresArmor: false,
    };
    const enemy: CombatantState = {
      name: 'Opponent', emoji: '', definitionId: 'pvpOpponent', isPlayer: false,
      maxHp: 10, hp: 10, atk: 5, arm: 0, spd: 3, dig: 0,
      bonusAtk: 0, bonusArm: 0, bonusSpd: 0,
      statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
      strikesPerTurn: 1, ignoresArmor: false,
    };

    const outcome = resolveCombatWithParity({
      player, enemy, seed: 0, preserveArmor: true,
    });

    // Enemy acts first → enemy's attack is logged first (ENEMY_ATTACK timing)
    const firstAttackLog = outcome.log.find(
      (e) => e.timing === 'ENEMY_ATTACK' || e.timing === 'PLAYER_ATTACK'
    );
    expect(firstAttackLog?.timing).toBe('ENEMY_ATTACK');
  });

  it('PvP speed tie: pvpPlayerActsFirstOnTie flips turn order for Player B view', () => {
    // Player B (opponent) view: self=player, creator=enemy.
    // On-chain, opponent goes first → in B's view, "player" should go first.
    const player: CombatantState = {
      name: 'You', emoji: '', definitionId: 'player', isPlayer: true,
      maxHp: 10, hp: 10, atk: 5, arm: 0, spd: 3, dig: 0,
      bonusAtk: 0, bonusArm: 0, bonusSpd: 0,
      statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
      strikesPerTurn: 1, ignoresArmor: false,
    };
    const enemy: CombatantState = {
      name: 'Opponent', emoji: '', definitionId: 'pvpOpponent', isPlayer: false,
      maxHp: 10, hp: 10, atk: 5, arm: 0, spd: 3, dig: 0,
      bonusAtk: 0, bonusArm: 0, bonusSpd: 0,
      statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
      strikesPerTurn: 1, ignoresArmor: false,
    };

    const outcome = resolveCombatWithParity({
      player, enemy, seed: 0, preserveArmor: true,
      pvpPlayerActsFirstOnTie: true,
    });

    // Player acts first → player's attack is logged first
    const firstAttackLog = outcome.log.find(
      (e) => e.timing === 'ENEMY_ATTACK' || e.timing === 'PLAYER_ATTACK'
    );
    expect(firstAttackLog?.timing).toBe('PLAYER_ATTACK');
  });

  it('PvP speed tie: both views agree with on-chain perspective (symmetric stats)', () => {
    // With identical stats and equal speed, the one who strikes first wins.
    // On-chain: enemy (opponent) acts first → enemy wins.
    // Player A's view (creator=player, default): enemy first → A loses (DEFEAT) ✓
    // Player B's view (opponent=player, flag): player first → B wins (VICTORY) ✓
    // Both views match on-chain: opponent (Player B) wins.
    const baseStats = {
      maxHp: 15, hp: 15, atk: 4, arm: 1, spd: 3, dig: 0,
      bonusAtk: 0, bonusArm: 0, bonusSpd: 0,
      statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 } as const,
      strikesPerTurn: 1 as const, ignoresArmor: false as const,
    };

    // Player A view (creator=player, no flag) → enemy acts first → A loses
    const outcomeA = resolveCombatWithParity({
      player: { ...baseStats, name: 'You', emoji: '', definitionId: 'player', isPlayer: true },
      enemy: { ...baseStats, name: 'Opponent', emoji: '', definitionId: 'pvpOpponent', isPlayer: false },
      seed: 42, preserveArmor: true,
    });

    // Player B view (opponent=player, flag set) → player acts first → B wins
    const outcomeB = resolveCombatWithParity({
      player: { ...baseStats, name: 'You', emoji: '', definitionId: 'player', isPlayer: true },
      enemy: { ...baseStats, name: 'Opponent', emoji: '', definitionId: 'pvpOpponent', isPlayer: false },
      seed: 42, preserveArmor: true,
      pvpPlayerActsFirstOnTie: true,
    });

    // A loses (enemy wins), B wins (player wins) — both agree opponent (B) wins
    expect(outcomeA.result).toBe('DEFEAT');
    expect(outcomeB.result).toBe('VICTORY');
  });

  it('pvpPlayerActsFirstOnTie has no effect when speeds differ', () => {
    const player: CombatantState = {
      name: 'You', emoji: '', definitionId: 'player', isPlayer: true,
      maxHp: 15, hp: 15, atk: 4, arm: 0, spd: 5, dig: 0,
      bonusAtk: 0, bonusArm: 0, bonusSpd: 0,
      statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
      strikesPerTurn: 1, ignoresArmor: false,
    };
    const enemy: CombatantState = {
      name: 'Opponent', emoji: '', definitionId: 'pvpOpponent', isPlayer: false,
      maxHp: 15, hp: 15, atk: 4, arm: 0, spd: 3, dig: 0,
      bonusAtk: 0, bonusArm: 0, bonusSpd: 0,
      statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
      strikesPerTurn: 1, ignoresArmor: false,
    };

    const withoutFlag = resolveCombatWithParity({
      player, enemy, seed: 0, preserveArmor: true,
    });
    const withFlag = resolveCombatWithParity({
      player, enemy, seed: 0, preserveArmor: true,
      pvpPlayerActsFirstOnTie: true,
    });

    // Player has higher speed, goes first regardless of flag
    const firstWithout = withoutFlag.log.find(
      (e) => e.timing === 'ENEMY_ATTACK' || e.timing === 'PLAYER_ATTACK'
    );
    const firstWith = withFlag.log.find(
      (e) => e.timing === 'ENEMY_ATTACK' || e.timing === 'PLAYER_ATTACK'
    );
    expect(firstWithout?.timing).toBe('PLAYER_ATTACK');
    expect(firstWith?.timing).toBe('PLAYER_ATTACK');
    expect(withoutFlag.player.hp).toBe(withFlag.player.hp);
  });
});
