import { resolveCombatWithParity } from '@/game/combat/parity-resolver';
import type { CombatResolverInput } from '@/game/combat/resolver';
import type { CombatantState } from '@/game/engine/types';
import { createGearInstance, createToolInstance } from '@/game/entities/items';
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

  const bonuses = { atk: 0, arm: 0, spd: 0, dig: 0, hp: 0 };
  bonuses.atk += tool.stats.atk ?? 0;
  bonuses.arm += tool.stats.arm ?? 0;
  bonuses.spd += tool.stats.spd ?? 0;
  bonuses.dig += tool.stats.dig ?? 0;
  bonuses.hp += tool.stats.hp ?? 0;

  for (const item of gear) {
    bonuses.atk += item.stats.atk ?? 0;
    bonuses.arm += item.stats.arm ?? 0;
    bonuses.spd += item.stats.spd ?? 0;
    bonuses.dig += item.stats.dig ?? 0;
    bonuses.hp += item.stats.hp ?? 0;
  }

  const maxHp = startingHp + bonuses.hp;
  return {
    name: 'Player',
    emoji: '🧑‍🔧',
    definitionId: 'player',
    isPlayer: true,
    maxHp,
    hp: Math.min(currentHp, maxHp),
    atk: bonuses.atk,
    arm: bonuses.arm,
    spd: bonuses.spd,
    dig: bonuses.dig,
    bonusAtk: 0,
    bonusArm: 0,
    bonusSpd: 0,
    statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
    strikesPerTurn: 1,
    ignoresArmor: false,
  };
}

function buildEnemyCombatant(
  enemyId: 'BLOOD_MOSQUITO' | 'TUNNEL_RAT',
  tier: 1 | 2
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
});
