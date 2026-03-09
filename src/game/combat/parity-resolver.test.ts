import { resolveCombatWithParity } from '@/game/combat/parity-resolver';
import type { CombatResolverInput } from '@/game/combat/resolver';
import type { CombatantState } from '@/game/engine/types';
import { calculateCombatBakedItemStats, createGearInstance, createToolInstance } from '@/game/entities/items';
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
  enemyId: 'BLOOD_MOSQUITO' | 'TUNNEL_RAT' | 'COIN_SLUG' | 'POWDER_TICK',
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
    const playerGear = [
      createGearInstance('I33', 'COMMON'),
      createGearInstance('I34', 'COMMON'),
    ];
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
      useParityResolver: true,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);

    expect(outcome.player.hp).toBe(21);
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
      useParityResolver: true,
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
      useParityResolver: true,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);

    expect(outcome.player.hp).toBe(25);
  });

  it('resolves powder tick t3 using faster-side countdown before slower turn-start effects', () => {
    const input: CombatResolverInput = {
      player: buildPlayerCombatant(25, 25, 'T9', ['I33', 'I46']),
      enemy: buildEnemyCombatant('POWDER_TICK', 3),
      seed: 1,
      enemyId: 'POWDER_TICK',
      enemyDefinitionId: 'POWDER_TICK',
      enemyTier: 3,
      playerTool: createToolInstance('T9'),
      playerGear: [createGearInstance('I33', 'COMMON'), createGearInstance('I46', 'COMMON')],
      playerGold: 10,
      enemyGold: 0,
      useParityResolver: true,
      preserveArmor: true,
    };

    const outcome = resolveCombatWithParity(input);

    expect(outcome.player.hp).toBe(20);
    const countdownSelfDamageIndex = outcome.log.findIndex(
      (entry) =>
        entry.actor === 'enemy' &&
        entry.target === 'enemy' &&
        entry.result.source?.id === 'POWDER_TICK' &&
        entry.result.damage === 3
    );
    const postCountdownEnemyAttackIndex = outcome.log.findIndex(
      (entry, index) =>
        index > countdownSelfDamageIndex &&
        entry.actor === 'enemy' &&
        entry.action === 'ATTACK'
    );

    expect(countdownSelfDamageIndex).toBeGreaterThanOrEqual(0);
    expect(postCountdownEnemyAttackIndex).toBe(-1);
  });
});
