/**
 * T102-T109: Boss trait tests
 * Tests boss trait execution and combat integration
 * @see docs/gdd.md Section 13 - Bosses
 */

import {
  BOSS_TRAITS,
  getBossTrait,
  createBossCombatant,
  executeBossTrait,
  checkEldritchMolePhases,
  resetBossPhaseState,
  resetStatusReflectionFlag,
  applyCrystalMimicReflection,
  getBossPhaseState,
  resetPowderKegCountdown,
  getPowderKegCountdown,
  getBossWeaknessTags,
} from '../../../src/game/entities/bosses';
import { BOSSES, getBoss, getBossesForWeek } from '../../../src/data/bosses';
import type { CombatantState, CombatState, BossId } from '../../../src/game/engine/types';
import { DEFAULT_STATUS_EFFECTS, CombatPhase } from '../../../src/game/engine/types';

// Helper to create a test combatant
function createTestCombatant(overrides: Partial<CombatantState> = {}): CombatantState {
  return {
    name: 'Test Combatant',
    emoji: '🧪',
    isPlayer: false,
    maxHp: 20,
    hp: 20,
    atk: 5,
    arm: 2,
    spd: 3,
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

// Helper to create a basic combat state for testing traits
function createTestCombatState(
  playerOverrides: Partial<CombatantState> = {},
  enemyOverrides: Partial<CombatantState> = {}
): CombatState {
  return {
    player: createTestCombatant({
      name: 'Player',
      emoji: '🦦',
      isPlayer: true,
      hp: 50,
      maxHp: 50,
      atk: 10,
      arm: 5,
      spd: 5,
      ...playerOverrides,
    }),
    enemy: createTestCombatant({
      name: 'Boss',
      emoji: '👹',
      hp: 60,
      maxHp: 60,
      atk: 5,
      arm: 12,
      spd: 3,
      ...enemyOverrides,
    }),
    turn: 0,
    phase: CombatPhase.BattleStart,
    log: [],
    rngState: 12345,
    playerGold: 0,
    enemyGold: 0,
    goldReward: 0,
    enemyDefinitionId: 'TUNNEL_RAT',
    enemyTier: 1,
    consumedGearIds: [],
    result: null,
  };
}

describe('Boss Definitions', () => {
  describe('BOSSES data', () => {
    it('should have all 24 bosses defined', () => {
      // 5 Week 1 + 5 Week 2 + 2 Week 3 per biome × 2 biomes = 24
      expect(Object.keys(BOSSES)).toHaveLength(24);
    });

    it('should have 10 Week 1 bosses (5 per biome)', () => {
      const week1Bosses = getBossesForWeek(1);
      expect(week1Bosses).toHaveLength(10);
      expect(week1Bosses.map((b) => b.id)).toEqual(
        expect.arrayContaining([
          'B-A-W1-01', 'B-A-W1-02', 'B-A-W1-03', 'B-A-W1-04', 'B-A-W1-05',
          'B-B-W1-01', 'B-B-W1-02', 'B-B-W1-03', 'B-B-W1-04', 'B-B-W1-05',
        ])
      );
    });

    it('should have 10 Week 2 bosses (5 per biome)', () => {
      const week2Bosses = getBossesForWeek(2);
      expect(week2Bosses).toHaveLength(10);
      expect(week2Bosses.map((b) => b.id)).toEqual(
        expect.arrayContaining([
          'B-A-W2-01', 'B-A-W2-02', 'B-A-W2-03', 'B-A-W2-04', 'B-A-W2-05',
          'B-B-W2-01', 'B-B-W2-02', 'B-B-W2-03', 'B-B-W2-04', 'B-B-W2-05',
        ])
      );
    });

    it('should have 4 Week 3 final bosses', () => {
      const week3Bosses = getBossesForWeek(3);
      expect(week3Bosses).toHaveLength(4);
      expect(week3Bosses.map((b) => b.id)).toEqual(
        expect.arrayContaining(['B-A-W3-01', 'B-A-W3-02', 'B-B-W3-01', 'B-B-W3-02'])
      );
    });

    it('should have correct stats for each boss', () => {
      expect(BOSSES['B-A-W1-01'].stats).toEqual({ hp: 24, atk: 2, arm: 1, spd: 2, dig: 1 });
      expect(BOSSES['B-A-W1-02'].stats).toEqual({ hp: 28, atk: 2, arm: 8, spd: 0, dig: 3 });
      expect(BOSSES['B-A-W1-03'].stats).toEqual({ hp: 26, atk: 2, arm: 0, spd: 1, dig: 2 });
      expect(BOSSES['B-A-W1-04'].stats).toEqual({ hp: 26, atk: 2, arm: 3, spd: 2, dig: 3 });
      expect(BOSSES['B-A-W2-01'].stats).toEqual({ hp: 34, atk: 2, arm: 6, spd: 2, dig: 3 });
      expect(BOSSES['B-A-W2-02'].stats).toEqual({ hp: 36, atk: 3, arm: 5, spd: 2, dig: 2 });
      expect(BOSSES['B-A-W3-01'].stats).toEqual({ hp: 50, atk: 4, arm: 8, spd: 3, dig: 4 });
    });

    // T062: Biome A boss distribution
    it('T062: should have 5 Week 1, 5 Week 2, 2 Week 3 bosses for Biome A', () => {
      const biomeABosses = Object.values(BOSSES).filter((b) => b.biome === 'A');
      const week1 = biomeABosses.filter((b) => b.week === 1);
      const week2 = biomeABosses.filter((b) => b.week === 2);
      const week3 = biomeABosses.filter((b) => b.week === 3);

      expect(week1).toHaveLength(5);
      expect(week2).toHaveLength(5);
      expect(week3).toHaveLength(2);
      expect(biomeABosses).toHaveLength(12); // Total Biome A bosses
    });

    // T063: Biome B boss distribution
    it('T063: should have 5 Week 1, 5 Week 2, 2 Week 3 bosses for Biome B', () => {
      const biomeBBosses = Object.values(BOSSES).filter((b) => b.biome === 'B');
      const week1 = biomeBBosses.filter((b) => b.week === 1);
      const week2 = biomeBBosses.filter((b) => b.week === 2);
      const week3 = biomeBBosses.filter((b) => b.week === 3);

      expect(week1).toHaveLength(5);
      expect(week2).toHaveLength(5);
      expect(week3).toHaveLength(2);
      expect(biomeBBosses).toHaveLength(12);
      expect(week3.map((b) => b.id)).toEqual(expect.arrayContaining(['B-B-W3-01', 'B-B-W3-02']));
    });

    // T064: All bosses have exactly 2 weakness tags
    it('T064: should have exactly 2 weakness tags for all bosses', () => {
      for (const [bossId, boss] of Object.entries(BOSSES)) {
        expect(boss.weaknessTags).toHaveLength(2);
        expect(boss.weaknessTags[0]).toBeDefined();
        expect(boss.weaknessTags[1]).toBeDefined();
        // Verify tags are valid ItemTag values
        const validTags = ['STONE', 'SCOUT', 'GREED', 'BLAST', 'FROST', 'RUST', 'BLOOD', 'TEMPO'];
        expect(validTags).toContain(boss.weaknessTags[0]);
        expect(validTags).toContain(boss.weaknessTags[1]);
      }
    });

    // Verify all bosses have at least one ability
    it('should have at least one ability for each boss', () => {
      for (const [bossId, boss] of Object.entries(BOSSES)) {
        expect(boss.abilities.length).toBeGreaterThan(0);
      }
    });

    // T077: Boss weakness tags for loot weighting
    it('T077: getBossWeaknessTags should return correct weakness tags', () => {
      expect(getBossWeaknessTags('B-A-W1-01')).toEqual(['STONE', 'FROST']);
      expect(getBossWeaknessTags('B-A-W1-02')).toEqual(['RUST', 'BLAST']);
      expect(getBossWeaknessTags('B-A-W3-01')).toEqual(['RUST', 'TEMPO']);
      expect(getBossWeaknessTags('B-B-W3-01')).toEqual(['TEMPO', 'STONE']);
    });
  });

  describe('createBossCombatant', () => {
    it('should create combatant with correct stats', () => {
      const broodmother = createBossCombatant('B-A-W1-01');
      expect(broodmother.name).toBe('The Broodmother');
      expect(broodmother.hp).toBe(24);
      expect(broodmother.atk).toBe(2);
      expect(broodmother.arm).toBe(1);
      expect(broodmother.spd).toBe(2);
      expect(broodmother.strikesPerTurn).toBe(1); // Before trait activates
    });

    it('should set isPlayer to false', () => {
      const boss = createBossCombatant('B-A-W3-01');
      expect(boss.isPlayer).toBe(false);
    });
  });
});

describe('Boss Traits', () => {
  beforeEach(() => {
    resetBossPhaseState();
  });

  describe('T103: Broodmother - Swarm (2 strikes per turn)', () => {
    it('should set strikesPerTurn to 3 on BATTLE_START', () => {
      const state = createTestCombatState({}, { strikesPerTurn: 1 });
      const result = executeBossTrait(state, 'B-A-W1-01', 'BATTLE_START');

      expect(result.triggered).toBe(true);
      expect(result.state.enemy.strikesPerTurn).toBe(2);
      expect(result.effectName).toBe('Swarm');
    });

    it('should not trigger on other timings', () => {
      const state = createTestCombatState();
      const result = executeBossTrait(state, 'B-A-W1-01', 'TURN_START');

      expect(result.triggered).toBe(false);
      expect(result.state).toBe(state);
    });
  });

  describe('T104: Obsidian Golem - Hardened (+2 Armor on Turn Start)', () => {
    it('should add +2 to bonusArm on TURN_START', () => {
      const state = createTestCombatState({}, { bonusArm: 0 });
      const result = executeBossTrait(state, 'B-A-W1-02', 'TURN_START');

      expect(result.triggered).toBe(true);
      expect(result.state.enemy.bonusArm).toBe(2);
      expect(result.effectName).toBe('Hardened');
    });

    it('should stack armor regeneration over multiple turns', () => {
      let state = createTestCombatState({}, { bonusArm: 0 });

      // Turn 1
      let result = executeBossTrait(state, 'B-A-W1-02', 'TURN_START');
      state = result.state;
      expect(state.enemy.bonusArm).toBe(2);

      // Turn 2
      result = executeBossTrait(state, 'B-A-W1-02', 'TURN_START');
      state = result.state;
      expect(state.enemy.bonusArm).toBe(4);

      // Turn 3
      result = executeBossTrait(state, 'B-A-W1-02', 'TURN_START');
      state = result.state;
      expect(state.enemy.bonusArm).toBe(6);
    });
  });

  describe('T105: Gas Anomaly - Toxic Seep (2 damage ignoring Armor)', () => {
    it('should deal 2 damage to player on TURN_START', () => {
      const state = createTestCombatState({ hp: 50 });
      const result = executeBossTrait(state, 'B-A-W1-03', 'TURN_START');

      expect(result.triggered).toBe(true);
      expect(result.state.player.hp).toBe(48);
      expect(result.effectName).toBe('Toxic Seep');
    });

    it('should ignore armor (always deal exactly 2 damage)', () => {
      const state = createTestCombatState({ hp: 50, arm: 100 });
      const result = executeBossTrait(state, 'B-A-W1-03', 'TURN_START');

      expect(result.state.player.hp).toBe(48);
    });

    it('should not reduce HP below 0', () => {
      const state = createTestCombatState({ hp: 1 });
      const result = executeBossTrait(state, 'B-A-W1-03', 'TURN_START');

      expect(result.state.player.hp).toBe(0);
    });
  });

  describe('T106: Mad Miner - Scavenger Mirror', () => {
    it('should trigger on BATTLE_START', () => {
      const state = createTestCombatState();
      const result = executeBossTrait(state, 'B-A-W1-04', 'BATTLE_START');

      expect(result.triggered).toBe(true);
      expect(result.effectName).toBe('Scavenger Mirror');
    });
  });

  describe('T107: Drill Sergeant - Rev Up (+2 ATK on Turn Start)', () => {
    it('should add +2 to bonusAtk on TURN_START', () => {
      const state = createTestCombatState({}, { bonusAtk: 0 });
      const result = executeBossTrait(state, 'B-A-W2-01', 'TURN_START');

      expect(result.triggered).toBe(true);
      expect(result.state.enemy.bonusAtk).toBe(2);
      expect(result.effectName).toBe('Rev Up');
    });

    it('should stack ATK gain over multiple turns', () => {
      let state = createTestCombatState({}, { bonusAtk: 0 });

      // Simulate 5 turns
      for (let i = 1; i <= 5; i++) {
        const result = executeBossTrait(state, 'B-A-W2-01', 'TURN_START');
        state = result.state;
        expect(state.enemy.bonusAtk).toBe(i * 2);
      }
    });
  });

  describe('T108: Crystal Mimic - Reflection', () => {
    it('should reset reflection flag on TURN_START', () => {
      const state = createTestCombatState();
      executeBossTrait(state, 'B-A-W2-02', 'TURN_START');

      const phaseState = getBossPhaseState();
      expect(phaseState.statusReflectedThisTurn).toBe(false);
    });

    it('should reflect first status to player', () => {
      resetStatusReflectionFlag();
      const state = createTestCombatState(
        { statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 } },
        { statusEffects: { chill: 2, shrapnel: 0, rust: 0, bleed: 0 } }
      );

      const result = applyCrystalMimicReflection(state, 'B-A-W2-02', 'chill', 2);

      expect(result.player.statusEffects.chill).toBe(2);
    });

    it('should only reflect once per turn', () => {
      resetStatusReflectionFlag();
      const state = createTestCombatState({
        statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
      });

      // First reflection
      let result = applyCrystalMimicReflection(state, 'B-A-W2-02', 'chill', 2);
      expect(result.player.statusEffects.chill).toBe(2);

      // Second reflection should not happen
      result = applyCrystalMimicReflection(result, 'B-A-W2-02', 'rust', 3);
      expect(result.player.statusEffects.rust).toBe(0);
    });

    it('should not reflect for non-Crystal Mimic bosses', () => {
      resetStatusReflectionFlag();
      const state = createTestCombatState({
        statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
      });

      const result = applyCrystalMimicReflection(state, 'B-A-W1-01', 'chill', 2);

      expect(result.player.statusEffects.chill).toBe(0);
    });
  });

  describe('T109: Eldritch Mole - Three Phases', () => {
    beforeEach(() => {
      resetBossPhaseState();
    });

    it('should trigger Phase 1 at 75% HP (+12 Armor)', () => {
      const state = createTestCombatState(
        {},
        {
          hp: 54, // 75% of 72
          maxHp: 72,
          bonusArm: 0,
        }
      );

      const result = checkEldritchMolePhases(state, 'B-A-W3-01');

      expect(result.phaseTriggered).toBe('Phase 1: +12 Armor');
      expect(result.state.enemy.bonusArm).toBe(12);
    });

    it('should trigger Phase 2 at 50% HP (2 strikes)', () => {
      // Set HP to trigger phase 1 first
      const state = createTestCombatState(
        {},
        {
          hp: 54, // 75% of 72
          maxHp: 72,
          strikesPerTurn: 1,
          bonusArm: 0,
        }
      );

      // First, trigger phase 1 by dropping to 75%
      let result = checkEldritchMolePhases(state, 'B-A-W3-01');
      expect(result.phaseTriggered).toBe('Phase 1: +12 Armor');

      // Now drop to 50% and trigger phase 2
      result = checkEldritchMolePhases(
        {
          ...result.state,
          enemy: { ...result.state.enemy, hp: 36 }, // 50%
        },
        'B-A-W3-01'
      );
      expect(result.phaseTriggered).toBe('Phase 2: Strike twice');
      expect(result.state.enemy.strikesPerTurn).toBe(2);
    });

    it('should trigger Phase 3 at 25% HP (+3 ATK, +2 DIG)', () => {
      // Trigger phases in sequence
      const state = createTestCombatState(
        {},
        {
          hp: 54, // 75% of 72
          maxHp: 72,
          bonusAtk: 0,
          bonusArm: 0,
          strikesPerTurn: 1,
          dig: 4,
        }
      );

      // Phase 1 at 75%
      let result = checkEldritchMolePhases(state, 'B-A-W3-01');
      expect(result.phaseTriggered).toBe('Phase 1: +12 Armor');

      // Phase 2 at 50%
      result = checkEldritchMolePhases(
        {
          ...result.state,
          enemy: { ...result.state.enemy, hp: 36 },
        },
        'B-A-W3-01'
      );
      expect(result.phaseTriggered).toBe('Phase 2: Strike twice');

      // Phase 3 at 25%
      result = checkEldritchMolePhases(
        {
          ...result.state,
          enemy: { ...result.state.enemy, hp: 18 },
        },
        'B-A-W3-01'
      );
      expect(result.phaseTriggered).toBe('Phase 3: +3 ATK, +2 DIG');
      expect(result.state.enemy.bonusAtk).toBe(3);
      expect(result.state.enemy.dig).toBe(6);
    });

    it('should not trigger phases for non-Eldritch Mole bosses', () => {
      const state = createTestCombatState(
        {},
        {
          hp: 5,
          maxHp: 20,
        }
      );

      const result = checkEldritchMolePhases(state, 'B-A-W1-01');

      expect(result.phaseTriggered).toBeNull();
      expect(result.state).toBe(state);
    });

    it('should trigger phases only once each', () => {
      // Start at 75% to trigger Phase 1
      const state = createTestCombatState(
        {},
        {
          hp: 54, // 75%
          maxHp: 72,
          bonusArm: 0,
          bonusAtk: 0,
          strikesPerTurn: 1,
          dig: 4,
        }
      );

      // Phase 1
      let result = checkEldritchMolePhases(state, 'B-A-W3-01');
      expect(result.phaseTriggered).toBe('Phase 1: +12 Armor');
      expect(result.state.enemy.bonusArm).toBe(12);

      // Same HP should not trigger again
      result = checkEldritchMolePhases(result.state, 'B-A-W3-01');
      expect(result.phaseTriggered).toBeNull();

      // Phase 2 at 50%
      result = checkEldritchMolePhases(
        {
          ...result.state,
          enemy: { ...result.state.enemy, hp: 36 },
        },
        'B-A-W3-01'
      );
      expect(result.phaseTriggered).toBe('Phase 2: Strike twice');

      // Same HP should not trigger again
      result = checkEldritchMolePhases(result.state, 'B-A-W3-01');
      expect(result.phaseTriggered).toBeNull();

      // Phase 3 at 25%
      result = checkEldritchMolePhases(
        {
          ...result.state,
          enemy: { ...result.state.enemy, hp: 18 },
        },
        'B-A-W3-01'
      );
      expect(result.phaseTriggered).toBe('Phase 3: +3 ATK, +2 DIG');

      // Same HP should not trigger again
      result = checkEldritchMolePhases(result.state, 'B-A-W3-01');
      expect(result.phaseTriggered).toBeNull();
    });
  });

  // ============================================================================
  // T072: Shard Colossus - Prismatic Spines (8 Shrapnel at Battle Start)
  // ============================================================================
  describe('T072: Shard Colossus - Prismatic Spines', () => {
    it('should gain 8 Shrapnel on BATTLE_START', () => {
      const state = createTestCombatState(
        {},
        { statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 } }
      );
      const result = executeBossTrait(state, 'B-A-W1-05', 'BATTLE_START');

      expect(result.triggered).toBe(true);
      expect(result.state.enemy.statusEffects.shrapnel).toBe(8);
      expect(result.effectName).toBe('Prismatic Spines');
    });

    it('should gain +4 Shrapnel on EVERY_OTHER_TURN', () => {
      const state = createTestCombatState(
        {},
        { statusEffects: { chill: 0, shrapnel: 8, rust: 0, bleed: 0 } }
      );
      const result = executeBossTrait(state, 'B-A-W1-05', 'EVERY_OTHER_TURN');

      expect(result.triggered).toBe(true);
      expect(result.state.enemy.statusEffects.shrapnel).toBe(12);
      expect(result.effectName).toBe('Refracting Hide');
    });
  });

  // ============================================================================
  // T073: Rust Regent - Corroding Edict (1 Rust on hit)
  // ============================================================================
  describe('T073: Rust Regent - Corroding Edict', () => {
    it('should apply 1 Rust to player on ON_HIT', () => {
      const state = createTestCombatState({
        statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
      });
      const result = executeBossTrait(state, 'B-A-W2-03', 'ON_HIT');

      expect(result.triggered).toBe(true);
      expect(result.state.player.statusEffects.rust).toBe(1);
      expect(result.effectName).toBe('Corroding Edict');
    });

    it('should stack Rust on multiple hits', () => {
      let state = createTestCombatState({
        statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
      });

      let result = executeBossTrait(state, 'B-A-W2-03', 'ON_HIT');
      state = result.state;
      expect(state.player.statusEffects.rust).toBe(1);

      result = executeBossTrait(state, 'B-A-W2-03', 'ON_HIT');
      expect(result.state.player.statusEffects.rust).toBe(2);
    });
  });

  // ============================================================================
  // T073: Powder Keg Baron - Countdown Bomb
  // ============================================================================
  describe('T073: Powder Keg Baron - Volatile Countdown', () => {
    beforeEach(() => {
      resetPowderKegCountdown();
    });

    it('should decrement countdown on TURN_END', () => {
      const state = createTestCombatState();
      const result = executeBossTrait(state, 'B-A-W2-04', 'TURN_END');

      expect(result.triggered).toBe(true);
      expect(getPowderKegCountdown()).toBe(2);
    });

    it('should explode and deal 10 damage to both when countdown reaches 0', () => {
      const state = createTestCombatState({ hp: 50 }, { hp: 44 });

      // Countdown 3 -> 2
      let result = executeBossTrait(state, 'B-A-W2-04', 'TURN_END');
      expect(getPowderKegCountdown()).toBe(2);

      // Countdown 2 -> 1
      result = executeBossTrait(result.state, 'B-A-W2-04', 'TURN_END');
      expect(getPowderKegCountdown()).toBe(1);

      // Countdown 1 -> 0 -> BOOM!
      result = executeBossTrait(result.state, 'B-A-W2-04', 'TURN_END');
      expect(result.effectName).toBe('Volatile Countdown BOOM!');
      expect(result.state.player.hp).toBe(40); // 50 - 10
      expect(result.state.enemy.hp).toBe(34); // 44 - 10
    });

    it('should reduce countdown by 1 when WOUNDED (Short Fuse)', () => {
      const state = createTestCombatState();

      const result = executeBossTrait(state, 'B-A-W2-04', 'WOUNDED');

      expect(result.triggered).toBe(true);
      expect(getPowderKegCountdown()).toBe(2); // 3 - 1 = 2
    });

    it('should not reduce countdown below 1 (Short Fuse)', () => {
      const state = createTestCombatState();

      // Reduce from 3 to 2
      executeBossTrait(state, 'B-A-W2-04', 'WOUNDED');
      expect(getPowderKegCountdown()).toBe(2);

      // Reduce from 2 to 1
      executeBossTrait(state, 'B-A-W2-04', 'WOUNDED');
      expect(getPowderKegCountdown()).toBe(1);

      // Should stay at 1 (min)
      executeBossTrait(state, 'B-A-W2-04', 'WOUNDED');
      expect(getPowderKegCountdown()).toBe(1);
    });
  });

  // ============================================================================
  // T073: Greedkeeper - Toll Collector
  // ============================================================================
  describe('T073: Greedkeeper - Toll Collector', () => {
    it('should steal up to 10 gold and gain armor on BATTLE_START', () => {
      const state = createTestCombatState();
      state.playerGold = 15;

      const result = executeBossTrait(state, 'B-A-W2-05', 'BATTLE_START');

      expect(result.triggered).toBe(true);
      expect(result.state.playerGold).toBe(5); // 15 - 10 stolen
      expect(result.state.enemy.bonusArm).toBe(2); // floor(10/5) = 2
    });

    it('should steal all gold if player has less than 10', () => {
      const state = createTestCombatState();
      state.playerGold = 7;

      const result = executeBossTrait(state, 'B-A-W2-05', 'BATTLE_START');

      expect(result.state.playerGold).toBe(0);
      expect(result.state.enemy.bonusArm).toBe(1); // floor(7/5) = 1
    });

    it('should cap armor gain at 6', () => {
      const state = createTestCombatState();
      state.playerGold = 100;

      const result = executeBossTrait(state, 'B-A-W2-05', 'BATTLE_START');

      // Only steal 10 gold max, so armor = floor(10/5) = 2, not capped
      expect(result.state.enemy.bonusArm).toBe(2);
    });
  });

  // ============================================================================
  // T074: Gilded Devourer - Tax Feast
  // ============================================================================
  describe('T074: Gilded Devourer - Tax Feast', () => {
    it('should convert gold to armor on BATTLE_START', () => {
      const state = createTestCombatState();
      state.playerGold = 25;

      const result = executeBossTrait(state, 'B-A-W3-02', 'BATTLE_START');

      expect(result.triggered).toBe(true);
      expect(result.state.enemy.bonusArm).toBe(5); // floor(25/5) = 5
    });

    it('should cap armor gain at 10', () => {
      const state = createTestCombatState();
      state.playerGold = 100;

      const result = executeBossTrait(state, 'B-A-W3-02', 'BATTLE_START');

      expect(result.state.enemy.bonusArm).toBe(10); // capped at 10
    });

    it('should apply 3 Bleed to player when WOUNDED', () => {
      const state = createTestCombatState({
        statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
      });

      const result = executeBossTrait(state, 'B-A-W3-02', 'WOUNDED');

      expect(result.triggered).toBe(true);
      expect(result.state.player.statusEffects.bleed).toBe(3);
      expect(result.effectName).toBe('Hunger (3 Bleed)');
    });
  });

  // ============================================================================
  // T075: Frostbound Leviathan - Whiteout
  // ============================================================================
  describe('T075: Frostbound Leviathan - Whiteout', () => {
    it('should apply 3 Chill to player on BATTLE_START', () => {
      const state = createTestCombatState({
        statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
      });

      const result = executeBossTrait(state, 'B-B-W3-01', 'BATTLE_START');

      expect(result.triggered).toBe(true);
      expect(result.state.player.statusEffects.chill).toBe(3);
      expect(result.effectName).toBe('Whiteout (3 Chill)');
    });

    it('should gain +4 Armor on EVERY_OTHER_TURN', () => {
      const state = createTestCombatState({}, { bonusArm: 0 });

      const result = executeBossTrait(state, 'B-B-W3-01', 'EVERY_OTHER_TURN');

      expect(result.triggered).toBe(true);
      expect(result.state.enemy.bonusArm).toBe(4);
      expect(result.effectName).toBe('Glacial Bulk (+4 ARM)');
    });

    it('should remove Chill and gain SPD when EXPOSED', () => {
      const state = createTestCombatState(
        { statusEffects: { chill: 3, shrapnel: 0, rust: 0, bleed: 0 } },
        { bonusSpd: 0 }
      );

      const result = executeBossTrait(state, 'B-B-W3-01', 'EXPOSED');

      expect(result.triggered).toBe(true);
      expect(result.state.player.statusEffects.chill).toBe(0);
      expect(result.state.enemy.bonusSpd).toBe(2);
      expect(result.effectName).toBe('Crack Ice (+2 SPD)');
    });
  });

  // ============================================================================
  // T075: Rusted Chronomancer - Time Shear
  // ============================================================================
  describe('T075: Rusted Chronomancer - Time Shear', () => {
    it('should strike twice on FIRST_TURN', () => {
      const state = createTestCombatState({}, { strikesPerTurn: 1 });

      const result = executeBossTrait(state, 'B-B-W3-02', 'FIRST_TURN');

      expect(result.triggered).toBe(true);
      expect(result.state.enemy.strikesPerTurn).toBe(2);
      expect(result.effectName).toBe('Time Shear (2 strikes)');
    });

    it('should apply 1 Rust to player on TURN_START', () => {
      const state = createTestCombatState({
        statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
      });

      const result = executeBossTrait(state, 'B-B-W3-02', 'TURN_START');

      expect(result.triggered).toBe(true);
      expect(result.state.player.statusEffects.rust).toBe(1);
      expect(result.effectName).toBe('Oxidized Future (1 Rust)');
    });

    it('should apply 4 Bleed to player when WOUNDED', () => {
      const state = createTestCombatState({
        statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
      });

      const result = executeBossTrait(state, 'B-B-W3-02', 'WOUNDED');

      expect(result.triggered).toBe(true);
      expect(result.state.player.statusEffects.bleed).toBe(4);
      expect(result.effectName).toBe('Blood Price (4 Bleed)');
    });
  });
});
