/**
 * T091, T093: Itemset combat tests
 */

import { resolveCombat } from '../../../src/game/combat/resolver';
import type { CombatResolverInput } from '../../../src/game/combat/resolver';
import type { CombatantState } from '../../../src/game/engine/types';
import { DEFAULT_STATUS_EFFECTS } from '../../../src/game/engine/types';

// Helper to create a test combatant
function createTestCombatant(overrides: Partial<CombatantState> = {}): CombatantState {
  return {
    name: 'Test Combatant',
    emoji: '🧪',
    isPlayer: false,
    maxHp: 20,
    hp: 20,
    atk: 10,
    arm: 5,
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

describe('Itemset Combat Bonuses', () => {
  // ============================================================================
  // T093: Union Standard
  // Battle Start: +4 Armor, +1 DIG
  // ============================================================================
  describe('Union Standard', () => {
    it('should grant +4 Armor and +1 DIG at battle start', () => {
      const player = createTestCombatant({
        arm: 0,
        dig: 2,
        isPlayer: true,
      });
      const enemy = createTestCombatant();

      // Enemy with 0 ATK to preserve Armor
      const safeEnemy = createTestCombatant({ atk: 0 });
      const result = resolveCombat({
        player,
        enemy: safeEnemy,
        seed: 123,
        activeItemSets: ['UNION_STANDARD'],
      });

      // +4 Armor applied
      const logEntry = result.log.find(
        (entry) =>
          entry.action === 'TRIGGER_ITEMSET' && entry.result.effectName?.includes('Union Standard')
      );
      expect(logEntry).toBeDefined();

      expect(result.player.dig).toBe(3);
      expect(result.player.arm).toBe(4);
    });
  });

  // ============================================================================
  // Swift Digger Kit
  // Battle Start: If DIG > enemy DIG, +2 strikes
  // ============================================================================
  describe('Swift Digger Kit', () => {
    it('should grant +2 strikes if DIG > enemy DIG', () => {
      const player = createTestCombatant({
        dig: 5,
        strikesPerTurn: 1,
        atk: 10,
        isPlayer: true,
      });
      const enemy = createTestCombatant({
        dig: 3, // Player has more
        hp: 100, // Survive first hit
        strikesPerTurn: 0, // Don't kill player
      });

      const result = resolveCombat({
        player,
        enemy,
        seed: 123,
        activeItemSets: ['SWIFT_DIGGER_KIT'],
      });

      const turn1Attacks = result.log.filter(
        (entry) => entry.turn === 1 && entry.action === 'ATTACK' && entry.actor === 'player'
      );

      expect(turn1Attacks).toHaveLength(3);
    });

    it('should NOT grant strikes if DIG <= enemy DIG', () => {
      const player = createTestCombatant({
        dig: 2,
        strikesPerTurn: 1,
        isPlayer: true,
      });
      const enemy = createTestCombatant({
        dig: 5, // Enemy has more
        hp: 100,
      });

      const result = resolveCombat({
        player,
        enemy,
        seed: 123,
        activeItemSets: ['SWIFT_DIGGER_KIT'],
      });

      const turn1Attacks = result.log.filter(
        (entry) => entry.turn === 1 && entry.action === 'ATTACK' && entry.actor === 'player'
      );
      expect(turn1Attacks).toHaveLength(1);
    });
  });

  // ============================================================================
  // Whiteout Initiative
  // Battle Start: +1 SPD; if you act first Turn 1, apply +2 Chill
  // ============================================================================
  describe('Whiteout Initiative', () => {
    it('should grant +1 SPD and apply Chill if faster', () => {
      const player = createTestCombatant({
        spd: 4, // Will become 5
        isPlayer: true,
      });
      const enemy = createTestCombatant({
        spd: 4,
      });

      const result = resolveCombat({
        player,
        enemy,
        seed: 123,
        activeItemSets: ['WHITEOUT_INITIATIVE'],
      });

      expect(result.player.spd).toBe(5);

      const chillLog = result.log.find(
        (entry) =>
          entry.action === 'APPLY_STATUS' &&
          entry.result.statusApplied?.type === 'chill' &&
          entry.result.effectName === 'Whiteout Initiative'
      );
      expect(chillLog).toBeDefined();
    });
  });

  // ============================================================================
  // Shard Circuit
  // Shards trigger every turn
  // ============================================================================
  describe('Shard Circuit', () => {
    it('should trigger shards on Turn 2 (normally only Turn 1/3/5)', () => {
      const player = createTestCombatant({ hp: 10, maxHp: 20, isPlayer: true });
      const enemy = createTestCombatant();

      // Mock I21 gear
      const shardGear = { id: 'I21', currentRarity: 'COMMON' } as any;

      const result = resolveCombat({
        player,
        enemy,
        seed: 123,
        activeItemSets: ['SHARD_CIRCUIT'],
        playerGear: [shardGear], // Player has Emerald Shard
      });

      const heals = result.log.filter(
        (entry) => entry.action === 'HEAL' && entry.result.effectName === 'Emerald Shard'
      );

      // Turn 1 and Turn 2 should both heal
      expect(heals.length).toBeGreaterThanOrEqual(2);
      const turn2Heal = heals.find((h) => h.turn === 1); // 0-based index 1 = Turn 2
      expect(turn2Heal).toBeDefined();
    });
  });
});
