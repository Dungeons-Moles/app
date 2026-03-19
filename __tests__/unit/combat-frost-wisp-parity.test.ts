/**
 * Frost Wisp Parity Test
 *
 * Verifies that the frontend combat resolver correctly handles the Frost Wisp's
 * "Frost Aura" trait (FirstTurnIfFaster: apply 1 Chill).
 *
 * Known bug: The on-chain combat system (crates/combat-system/src/lib.rs) never
 * dispatches `TriggerType::FirstTurnIfFaster` as a phase in `apply_start_of_turn_effects_for_side`.
 * The `process_effects_pass` function filters by exact `effect.trigger != phase`, so effects
 * with `FirstTurnIfFaster` trigger are silently skipped. This means Frost Aura never fires
 * on-chain, producing different results (18 HP) vs frontend (16 HP).
 *
 * On-chain fix needed in `apply_start_of_turn_effects_for_side`:
 *   Add `process_phase_effects(effects, ..., TriggerType::FirstTurnIfFaster, ...)` and
 *   `process_phase_effects(effects, ..., TriggerType::FirstTurnIfSlower, ...)` alongside
 *   the existing `FirstTurn` dispatch when `is_first_turn` is true.
 */

import { resolveCombatWithParity } from '../../src/game/combat/parity-resolver';
import type { CombatResolverInput } from '../../src/game/combat/types';
import type { CombatantState, Gear, Tool } from '../../src/game/engine/types';
import { DEFAULT_STATUS_EFFECTS } from '../../src/game/engine/types';

function makePlayer(overrides: Partial<CombatantState> = {}): CombatantState {
  return {
    name: 'Player',
    emoji: '🧑‍🔧',
    definitionId: 'player',
    isPlayer: true,
    maxHp: 20,
    hp: 20,
    atk: 0,
    arm: 0,
    spd: 0,
    dig: 0,
    bonusAtk: 0,
    bonusArm: 0,
    bonusSpd: 0,
    statusEffects: { ...DEFAULT_STATUS_EFFECTS },
    strikesPerTurn: 1,
    ignoresArmor: false,
    ...overrides,
  };
}

function makeEnemy(overrides: Partial<CombatantState> = {}): CombatantState {
  return {
    name: 'Frost Wisp',
    emoji: '🧊',
    definitionId: 'FROST_WISP',
    isPlayer: false,
    maxHp: 7,
    hp: 7,
    atk: 1,
    arm: 0,
    spd: 4,
    dig: 1,
    bonusAtk: 0,
    bonusArm: 0,
    bonusSpd: 0,
    statusEffects: { ...DEFAULT_STATUS_EFFECTS },
    strikesPerTurn: 1,
    ignoresArmor: false,
    ...overrides,
  };
}

function makeTwinPicksT1(): Tool {
  return {
    id: 'T3',
    name: 'Twin Picks',
    emoji: '⛏️⛏️',
    rarity: 'COMMON',
    stats: { atk: 1 },
    tags: ['SCOUT'],
  };
}

function makeLeatherGlovesT1(): Gear {
  return {
    id: 'I10',
    name: 'Leather Gloves',
    emoji: '🧤',
    baseRarity: 'COMMON',
    currentRarity: 'COMMON',
    stats: { atk: 1, dig: 1 },
    tags: ['SCOUT'],
  };
}

describe('Frost Wisp Parity — Frontend vs On-Chain', () => {
  it('Frost Aura applies chill when Frost Wisp acts first (SPD 4 > Player SPD 0)', () => {
    // Twin Picks T1: baked ATK 1, +1 strike (BattleStart effect)
    // Leather Gloves T1: baked ATK 1
    // Total: ATK 2, Strikes 2, SPD 0
    const tool = makeTwinPicksT1();
    const gear = [makeLeatherGlovesT1()];

    // Player ATK = 2 (from baked stats: max(directAtk, derivedAtk) per item)
    // Twin Picks: max(1, 1) = 1, Leather Gloves: max(1, 1) = 1 → total baked ATK = 2
    const player = makePlayer({ atk: 2 });

    const input: CombatResolverInput = {
      player,
      enemy: makeEnemy(), // Frost Wisp T1: 7 HP, 1 ATK, 0 ARM, 4 SPD
      seed: 1337,
      enemyId: 'FROST_WISP',
      enemyDefinitionId: 'FROST_WISP',
      enemyTier: 1,
      goldReward: 2,
      activeItemSets: [],
      playerGear: gear,
      playerTool: tool,
    };

    const result = resolveCombatWithParity(input);

    // Frost Wisp SPD (4) > Player SPD (0) → enemy acts first → Frost Aura fires
    // Turn 1: Chill 1 → Frost Wisp deals 1+1=2 dmg, Player strikes reduced to 1 → deals 2 dmg
    //   Player: 18 HP, Frost Wisp: 5 HP, chill decays to 0
    // Turn 2: Frost Wisp deals 1 dmg, Player 2 strikes × 2 ATK = 4 dmg
    //   Player: 17 HP, Frost Wisp: 1 HP
    // Turn 3: Frost Wisp deals 1 dmg, Player 2 strikes × 2 ATK = 4 dmg → Frost Wisp dead
    //   Player: 16 HP
    expect(result.result).toBe('VICTORY');
    expect(result.player.hp).toBe(16);
    expect(result.turn).toBe(3);
  });

  it('Frost Aura does NOT apply when player is faster (SPD 5 > Frost Wisp SPD 4)', () => {
    const tool = makeTwinPicksT1();
    const gear = [makeLeatherGlovesT1()];

    // Give player enough SPD to act first
    const player = makePlayer({ atk: 2, spd: 5 });

    const input: CombatResolverInput = {
      player,
      enemy: makeEnemy(), // SPD 4
      seed: 1337,
      enemyId: 'FROST_WISP',
      enemyDefinitionId: 'FROST_WISP',
      enemyTier: 1,
      goldReward: 2,
      activeItemSets: [],
      playerGear: gear,
      playerTool: tool,
    };

    const result = resolveCombatWithParity(input);

    // Player acts first → Frost Aura does NOT fire
    // Turn 1: Player 2 strikes × 2 = 4 dmg → Frost Wisp 3 HP, Frost Wisp 1 dmg → Player 19 HP
    // Turn 2: Player 2 strikes × 2 = 4 dmg → Frost Wisp dead
    expect(result.result).toBe('VICTORY');
    expect(result.player.hp).toBe(19);
    expect(result.turn).toBe(2);
  });

  it('matches expected on-chain result when Frost Aura is disabled (simulating on-chain bug)', () => {
    // Simulate what on-chain produces by NOT passing enemyId (so no traits fire)
    const tool = makeTwinPicksT1();
    const gear = [makeLeatherGlovesT1()];
    const player = makePlayer({ atk: 2 });

    const input: CombatResolverInput = {
      player,
      enemy: makeEnemy(),
      seed: 1337,
      // No enemyId → no enemy traits → simulates the on-chain bug
      goldReward: 2,
      activeItemSets: [],
      playerGear: gear,
      playerTool: tool,
    };

    const result = resolveCombatWithParity(input);

    // Without Frost Aura, no chill is applied:
    // Turn 1: Frost Wisp 1 dmg → Player 19 HP, Player 2×2=4 dmg → Frost Wisp 3 HP
    // Turn 2: Frost Wisp 1 dmg → Player 18 HP, Player 2×2=4 dmg → Frost Wisp dead
    expect(result.result).toBe('VICTORY');
    expect(result.player.hp).toBe(18);
    expect(result.turn).toBe(2);
  });
});
