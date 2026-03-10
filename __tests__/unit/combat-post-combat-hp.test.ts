/**
 * Ensures temporary combat-only maxHp/hp buffs do not persist after RESOLVE_COMBAT.
 */

import { gameReducer } from '../../src/game/engine/game-reducer';
import { createInitialGameState, initializeGame } from '../../src/game/engine/state-factory';
import { GamePhase, type CombatantState } from '../../src/game/engine/types';
import { createCombatState } from '../../src/game/combat/state';

function createTestEnemy(): CombatantState {
  return {
    name: 'Test Enemy',
    emoji: '👾',
    isPlayer: false,
    maxHp: 1,
    hp: 1,
    atk: 0,
    arm: 0,
    spd: 0,
    dig: 0,
    bonusAtk: 0,
    bonusArm: 0,
    bonusSpd: 0,
    statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
    strikesPerTurn: 1,
    ignoresArmor: false,
  };
}

describe('Post-combat HP', () => {
  it('removes temporary maxHp bonus from final hp (does not just cap)', () => {
    const seeded = initializeGame(createInitialGameState(), 123);

    const playerCombatant: CombatantState = {
      name: 'Player',
      emoji: '🦦',
      isPlayer: true,
      maxHp: 10,
      hp: 10,
      atk: 0,
      arm: 2,
      spd: 0,
      dig: 0,
      bonusAtk: 0,
      bonusArm: 0,
      bonusSpd: 0,
      statusEffects: { ...seeded.player.statusEffects },
      strikesPerTurn: 1,
      ignoresArmor: false,
    };

    const combat = createCombatState({
      player: playerCombatant,
      enemy: createTestEnemy(),
      seed: seeded.rngState,
      playerGold: seeded.player.stats.gold,
      enemyDefinitionId: 'TUNNEL_RAT',
      enemyTier: 1,
      goldReward: 0,
    });

    const stateInCombat = {
      ...seeded,
      phase: GamePhase.Combat,
      player: {
        ...seeded.player,
        baseStats: {
          ...seeded.player.baseStats,
          hp: 10,
          maxHp: 10,
        },
        stats: {
          ...seeded.player.stats,
          hp: 10,
          maxHp: 10,
        },
      },
      combat,
    };

    // Simulate a combat-only buff that temporarily increases maxHp/hp by +2, then player takes 1 damage.
    // If we only capped to 10, we'd incorrectly end at 10; correct post-combat hp is 9.
    const resolvedCombat = {
      ...combat,
      player: {
        ...combat.player,
        maxHp: 12,
        hp: 11,
      },
      rngState: combat.rngState,
    };

    const result = gameReducer(stateInCombat, {
      type: 'RESOLVE_COMBAT',
      result: 'VICTORY',
      combat: resolvedCombat,
    });

    expect(result.phase).toBe(GamePhase.Exploration);
    expect(result.player.stats.maxHp).toBe(10);
    expect(result.player.stats.hp).toBe(9);
  });
});
