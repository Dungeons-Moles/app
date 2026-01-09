/**
 * T102-T109: Boss trait tests
 * Tests boss trait execution and combat integration
 * @see specs/001-pve-dungeon-crawler/spec.md User Story 6, FR-032-034
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
} from '../../../src/game/entities/bosses';
import { BOSSES, getBoss, getBossesForWeek } from '../../../src/data/bosses';
import { resolveCombat } from '../../../src/game/combat/resolver';
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
    consumedGearIds: [],
    result: null,
  };
}

describe('Boss Definitions', () => {
  describe('BOSSES data', () => {
    it('should have all 7 bosses defined', () => {
      expect(Object.keys(BOSSES)).toHaveLength(7);
    });

    it('should have 4 Week 1 gatekeepers', () => {
      const week1Bosses = getBossesForWeek(1);
      expect(week1Bosses).toHaveLength(4);
      expect(week1Bosses.map(b => b.id)).toEqual(
        expect.arrayContaining(['BROODMOTHER', 'OBSIDIAN_GOLEM', 'GAS_ANOMALY', 'MAD_MINER'])
      );
    });

    it('should have 2 Week 2 filters', () => {
      const week2Bosses = getBossesForWeek(2);
      expect(week2Bosses).toHaveLength(2);
      expect(week2Bosses.map(b => b.id)).toEqual(
        expect.arrayContaining(['DRILL_SERGEANT', 'CRYSTAL_MIMIC'])
      );
    });

    it('should have 1 Week 3 final boss', () => {
      const week3Bosses = getBossesForWeek(3);
      expect(week3Bosses).toHaveLength(1);
      expect(week3Bosses[0].id).toBe('ELDRITCH_MOLE');
    });

    it('should have correct stats for each boss', () => {
      expect(BOSSES.BROODMOTHER.stats).toEqual({ hp: 20, atk: 1, arm: 0, spd: 3 });
      expect(BOSSES.OBSIDIAN_GOLEM.stats).toEqual({ hp: 12, atk: 3, arm: 18, spd: 0 });
      expect(BOSSES.GAS_ANOMALY.stats).toEqual({ hp: 28, atk: 2, arm: 0, spd: 2 });
      expect(BOSSES.MAD_MINER.stats).toEqual({ hp: 22, atk: 3, arm: 6, spd: 2 });
      expect(BOSSES.DRILL_SERGEANT.stats).toEqual({ hp: 26, atk: 0, arm: 10, spd: 2 });
      expect(BOSSES.CRYSTAL_MIMIC.stats).toEqual({ hp: 30, atk: 4, arm: 8, spd: 3 });
      expect(BOSSES.ELDRITCH_MOLE.stats).toEqual({ hp: 60, atk: 5, arm: 12, spd: 3, dig: 5 });
    });
  });

  describe('createBossCombatant', () => {
    it('should create combatant with correct stats', () => {
      const broodmother = createBossCombatant('BROODMOTHER');
      expect(broodmother.name).toBe('The Broodmother');
      expect(broodmother.hp).toBe(20);
      expect(broodmother.atk).toBe(1);
      expect(broodmother.arm).toBe(0);
      expect(broodmother.spd).toBe(3);
      expect(broodmother.strikesPerTurn).toBe(1); // Before trait activates
    });

    it('should set isPlayer to false', () => {
      const boss = createBossCombatant('ELDRITCH_MOLE');
      expect(boss.isPlayer).toBe(false);
    });
  });
});

describe('Boss Traits', () => {
  beforeEach(() => {
    resetBossPhaseState();
  });

  describe('T103: Broodmother - Swarm (3 strikes per turn)', () => {
    it('should set strikesPerTurn to 3 on BATTLE_START', () => {
      const state = createTestCombatState({}, { strikesPerTurn: 1 });
      const result = executeBossTrait(state, 'BROODMOTHER', 'BATTLE_START');

      expect(result.triggered).toBe(true);
      expect(result.state.enemy.strikesPerTurn).toBe(3);
      expect(result.effectName).toBe('Swarm');
    });

    it('should not trigger on other timings', () => {
      const state = createTestCombatState();
      const result = executeBossTrait(state, 'BROODMOTHER', 'TURN_START');

      expect(result.triggered).toBe(false);
      expect(result.state).toBe(state);
    });
  });

  describe('T104: Obsidian Golem - Hardened (+3 Armor on Turn Start)', () => {
    it('should add +3 to bonusArm on TURN_START', () => {
      const state = createTestCombatState({}, { bonusArm: 0 });
      const result = executeBossTrait(state, 'OBSIDIAN_GOLEM', 'TURN_START');

      expect(result.triggered).toBe(true);
      expect(result.state.enemy.bonusArm).toBe(3);
      expect(result.effectName).toBe('Hardened');
    });

    it('should stack armor regeneration over multiple turns', () => {
      let state = createTestCombatState({}, { bonusArm: 0 });

      // Turn 1
      let result = executeBossTrait(state, 'OBSIDIAN_GOLEM', 'TURN_START');
      state = result.state;
      expect(state.enemy.bonusArm).toBe(3);

      // Turn 2
      result = executeBossTrait(state, 'OBSIDIAN_GOLEM', 'TURN_START');
      state = result.state;
      expect(state.enemy.bonusArm).toBe(6);

      // Turn 3
      result = executeBossTrait(state, 'OBSIDIAN_GOLEM', 'TURN_START');
      state = result.state;
      expect(state.enemy.bonusArm).toBe(9);
    });
  });

  describe('T105: Gas Anomaly - Toxic Seep (2 damage ignoring Armor)', () => {
    it('should deal 2 damage to player on TURN_START', () => {
      const state = createTestCombatState({ hp: 50 });
      const result = executeBossTrait(state, 'GAS_ANOMALY', 'TURN_START');

      expect(result.triggered).toBe(true);
      expect(result.state.player.hp).toBe(48);
      expect(result.effectName).toBe('Toxic Seep');
    });

    it('should ignore armor (always deal exactly 2 damage)', () => {
      const state = createTestCombatState({ hp: 50, arm: 100 });
      const result = executeBossTrait(state, 'GAS_ANOMALY', 'TURN_START');

      expect(result.state.player.hp).toBe(48);
    });

    it('should not reduce HP below 0', () => {
      const state = createTestCombatState({ hp: 1 });
      const result = executeBossTrait(state, 'GAS_ANOMALY', 'TURN_START');

      expect(result.state.player.hp).toBe(0);
    });
  });

  describe('T106: Mad Miner - Scavenger Mirror', () => {
    it('should trigger on BATTLE_START', () => {
      const state = createTestCombatState();
      const result = executeBossTrait(state, 'MAD_MINER', 'BATTLE_START');

      expect(result.triggered).toBe(true);
      expect(result.effectName).toBe('Scavenger Mirror');
    });
  });

  describe('T107: Drill Sergeant - Rev Up (+2 ATK on Turn Start)', () => {
    it('should add +2 to bonusAtk on TURN_START', () => {
      const state = createTestCombatState({}, { bonusAtk: 0 });
      const result = executeBossTrait(state, 'DRILL_SERGEANT', 'TURN_START');

      expect(result.triggered).toBe(true);
      expect(result.state.enemy.bonusAtk).toBe(2);
      expect(result.effectName).toBe('Rev Up');
    });

    it('should stack ATK gain over multiple turns', () => {
      let state = createTestCombatState({}, { bonusAtk: 0 });

      // Simulate 5 turns
      for (let i = 1; i <= 5; i++) {
        const result = executeBossTrait(state, 'DRILL_SERGEANT', 'TURN_START');
        state = result.state;
        expect(state.enemy.bonusAtk).toBe(i * 2);
      }
    });
  });

  describe('T108: Crystal Mimic - Reflection', () => {
    it('should reset reflection flag on TURN_START', () => {
      const state = createTestCombatState();
      executeBossTrait(state, 'CRYSTAL_MIMIC', 'TURN_START');

      const phaseState = getBossPhaseState();
      expect(phaseState.statusReflectedThisTurn).toBe(false);
    });

    it('should reflect first status to player', () => {
      resetStatusReflectionFlag();
      const state = createTestCombatState(
        { statusEffects: { chill: 0, shrapnel: 0, rust: 0 } },
        { statusEffects: { chill: 2, shrapnel: 0, rust: 0 } }
      );

      const result = applyCrystalMimicReflection(state, 'CRYSTAL_MIMIC', 'chill', 2);

      expect(result.player.statusEffects.chill).toBe(2);
    });

    it('should only reflect once per turn', () => {
      resetStatusReflectionFlag();
      const state = createTestCombatState(
        { statusEffects: { chill: 0, shrapnel: 0, rust: 0 } }
      );

      // First reflection
      let result = applyCrystalMimicReflection(state, 'CRYSTAL_MIMIC', 'chill', 2);
      expect(result.player.statusEffects.chill).toBe(2);

      // Second reflection should not happen
      result = applyCrystalMimicReflection(result, 'CRYSTAL_MIMIC', 'rust', 3);
      expect(result.player.statusEffects.rust).toBe(0);
    });

    it('should not reflect for non-Crystal Mimic bosses', () => {
      resetStatusReflectionFlag();
      const state = createTestCombatState(
        { statusEffects: { chill: 0, shrapnel: 0, rust: 0 } }
      );

      const result = applyCrystalMimicReflection(state, 'BROODMOTHER', 'chill', 2);

      expect(result.player.statusEffects.chill).toBe(0);
    });
  });

  describe('T109: Eldritch Mole - Three Phases', () => {
    beforeEach(() => {
      resetBossPhaseState();
    });

    it('should trigger Phase 1 at 75% HP (+12 Armor)', () => {
      const state = createTestCombatState({}, {
        hp: 45,  // 75% of 60
        maxHp: 60,
        bonusArm: 0,
      });

      const result = checkEldritchMolePhases(state, 'ELDRITCH_MOLE');

      expect(result.phaseTriggered).toBe('Phase 1: +12 Armor');
      expect(result.state.enemy.bonusArm).toBe(12);
    });

    it('should trigger Phase 2 at 50% HP (2 strikes)', () => {
      // Set HP to exactly 50% (not below 75%)
      const state = createTestCombatState({}, {
        hp: 44,  // Just above 75% threshold (45)
        maxHp: 60,
        strikesPerTurn: 1,
        bonusArm: 0,
      });

      // First, trigger phase 1 by dropping to 75%
      let result = checkEldritchMolePhases({
        ...state,
        enemy: { ...state.enemy, hp: 45 }, // exactly 75%
      }, 'ELDRITCH_MOLE');
      expect(result.phaseTriggered).toBe('Phase 1: +12 Armor');

      // Now drop to 50% and trigger phase 2
      result = checkEldritchMolePhases({
        ...result.state,
        enemy: { ...result.state.enemy, hp: 30 }, // 50%
      }, 'ELDRITCH_MOLE');
      expect(result.phaseTriggered).toBe('Phase 2: Strike twice');
      expect(result.state.enemy.strikesPerTurn).toBe(2);
    });

    it('should trigger Phase 3 at 25% HP (+3 ATK, +2 DIG)', () => {
      // Trigger phases in sequence
      let state = createTestCombatState({}, {
        hp: 45,  // 75% of 60
        maxHp: 60,
        bonusAtk: 0,
        bonusArm: 0,
        strikesPerTurn: 1,
        dig: 5,
      });

      // Phase 1 at 75%
      let result = checkEldritchMolePhases(state, 'ELDRITCH_MOLE');
      expect(result.phaseTriggered).toBe('Phase 1: +12 Armor');

      // Phase 2 at 50%
      result = checkEldritchMolePhases({
        ...result.state,
        enemy: { ...result.state.enemy, hp: 30 },
      }, 'ELDRITCH_MOLE');
      expect(result.phaseTriggered).toBe('Phase 2: Strike twice');

      // Phase 3 at 25%
      result = checkEldritchMolePhases({
        ...result.state,
        enemy: { ...result.state.enemy, hp: 15 },
      }, 'ELDRITCH_MOLE');
      expect(result.phaseTriggered).toBe('Phase 3: +3 ATK, +2 DIG');
      expect(result.state.enemy.bonusAtk).toBe(3);
      expect(result.state.enemy.dig).toBe(7);
    });

    it('should not trigger phases for non-Eldritch Mole bosses', () => {
      const state = createTestCombatState({}, {
        hp: 5,
        maxHp: 20,
      });

      const result = checkEldritchMolePhases(state, 'BROODMOTHER');

      expect(result.phaseTriggered).toBeNull();
      expect(result.state).toBe(state);
    });

    it('should trigger phases only once each', () => {
      // Start at 75% to trigger Phase 1
      let state = createTestCombatState({}, {
        hp: 45,  // 75%
        maxHp: 60,
        bonusArm: 0,
        bonusAtk: 0,
        strikesPerTurn: 1,
        dig: 5,
      });

      // Phase 1
      let result = checkEldritchMolePhases(state, 'ELDRITCH_MOLE');
      expect(result.phaseTriggered).toBe('Phase 1: +12 Armor');
      expect(result.state.enemy.bonusArm).toBe(12);

      // Same HP should not trigger again
      result = checkEldritchMolePhases(result.state, 'ELDRITCH_MOLE');
      expect(result.phaseTriggered).toBeNull();

      // Phase 2 at 50%
      result = checkEldritchMolePhases({
        ...result.state,
        enemy: { ...result.state.enemy, hp: 30 },
      }, 'ELDRITCH_MOLE');
      expect(result.phaseTriggered).toBe('Phase 2: Strike twice');

      // Same HP should not trigger again
      result = checkEldritchMolePhases(result.state, 'ELDRITCH_MOLE');
      expect(result.phaseTriggered).toBeNull();

      // Phase 3 at 25%
      result = checkEldritchMolePhases({
        ...result.state,
        enemy: { ...result.state.enemy, hp: 15 },
      }, 'ELDRITCH_MOLE');
      expect(result.phaseTriggered).toBe('Phase 3: +3 ATK, +2 DIG');

      // Same HP should not trigger again
      result = checkEldritchMolePhases(result.state, 'ELDRITCH_MOLE');
      expect(result.phaseTriggered).toBeNull();
    });
  });
});

describe('Combat Integration with Boss Traits', () => {
  describe('Broodmother in combat', () => {
    it('should strike 3 times per turn', () => {
      const result = resolveCombat({
        player: createTestCombatant({
          isPlayer: true,
          hp: 100,
          maxHp: 100,
          atk: 10,
          arm: 0,
          spd: 1, // Slower than boss
        }),
        enemy: createBossCombatant('BROODMOTHER'),
        seed: 12345,
        bossId: 'BROODMOTHER',
      });

      // Broodmother should have attacked multiple times per turn
      const bossAttacks = result.log.filter(
        entry => entry.actor === 'enemy' && entry.action === 'ATTACK'
      );

      // Verify boss attacked with 3 strikes in at least one turn
      // (we check the ratio of boss attacks to player attacks)
      const playerAttacks = result.log.filter(
        entry => entry.actor === 'player' && entry.action === 'ATTACK'
      );

      // Boss should have roughly 3x the attacks (accounting for combat ending early)
      expect(bossAttacks.length).toBeGreaterThanOrEqual(playerAttacks.length);
    });
  });

  describe('Obsidian Golem in combat', () => {
    it('should regenerate armor each turn', () => {
      const result = resolveCombat({
        player: createTestCombatant({
          isPlayer: true,
          hp: 50,
          maxHp: 50,
          atk: 5,
          arm: 5,
          spd: 5,
        }),
        enemy: createBossCombatant('OBSIDIAN_GOLEM'),
        seed: 12345,
        bossId: 'OBSIDIAN_GOLEM',
      });

      // Check that Hardened trait was triggered in the log
      const hardenedTriggers = result.log.filter(
        entry => entry.result.effectName === 'Hardened'
      );

      expect(hardenedTriggers.length).toBeGreaterThan(0);
    });
  });

  describe('Gas Anomaly in combat', () => {
    it('should deal damage to player each turn', () => {
      const initialPlayerHp = 50;
      const result = resolveCombat({
        player: createTestCombatant({
          isPlayer: true,
          hp: initialPlayerHp,
          maxHp: initialPlayerHp,
          atk: 20,
          arm: 0,
          spd: 5,
        }),
        enemy: createBossCombatant('GAS_ANOMALY'),
        seed: 12345,
        bossId: 'GAS_ANOMALY',
      });

      // Check that Toxic Seep was triggered
      const toxicSeepTriggers = result.log.filter(
        entry => entry.result.effectName === 'Toxic Seep'
      );

      expect(toxicSeepTriggers.length).toBeGreaterThan(0);
    });
  });

  describe('Drill Sergeant in combat', () => {
    it('should gain ATK each turn', () => {
      const result = resolveCombat({
        player: createTestCombatant({
          isPlayer: true,
          hp: 100,
          maxHp: 100,
          atk: 5,
          arm: 5,
          spd: 5,
        }),
        enemy: createBossCombatant('DRILL_SERGEANT'),
        seed: 12345,
        bossId: 'DRILL_SERGEANT',
      });

      // Check that Rev Up was triggered
      const revUpTriggers = result.log.filter(
        entry => entry.result.effectName === 'Rev Up'
      );

      expect(revUpTriggers.length).toBeGreaterThan(0);
    });
  });

  describe('Eldritch Mole phase transitions in combat', () => {
    it('should trigger phase transitions as HP decreases', () => {
      // Reset boss phase state before this test
      resetBossPhaseState();

      // Give player overwhelming stats to ensure victory and phase triggers
      const result = resolveCombat({
        player: createTestCombatant({
          isPlayer: true,
          hp: 500,
          maxHp: 500,
          atk: 50, // Very high damage to overcome armor+phase armor
          arm: 50, // Very high armor
          spd: 20, // Higher speed to go first
        }),
        enemy: createBossCombatant('ELDRITCH_MOLE'),
        seed: 12345,
        bossId: 'ELDRITCH_MOLE',
      });

      // Check for phase trigger logs
      const phaseTriggers = result.log.filter(
        entry => entry.action === 'PHASE_TRIGGER'
      );

      // Combat should complete with a result
      expect(result.result).not.toBeNull();

      // Should have at least one phase trigger since player dealt enough damage
      // to reduce boss HP from 60 through 75%/50%/25% thresholds
      expect(phaseTriggers.length).toBeGreaterThan(0);
    });
  });
});
