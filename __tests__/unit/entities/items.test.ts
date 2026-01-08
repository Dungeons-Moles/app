/**
 * Item Entity Tests - T073
 * Tests for item stat calculations, rarity multipliers, and tool/gear instances
 * @see specs/001-pve-dungeon-crawler/data-model.md
 */

import {
  createToolInstance,
  createGearInstance,
  calculateItemStats,
  applyRarityMultiplier,
  getToolDefinition,
  getGearDefinition,
  TOOL_DEFINITIONS,
} from '../../../src/game/entities/items';
import type { ItemStats, ItemRarity, ToolId, GearId } from '../../../src/game/engine/types';

describe('Items Entity', () => {
  describe('createToolInstance', () => {
    it('creates a tool instance with correct base stats', () => {
      const tool = createToolInstance('T1'); // Polished Pickaxe: +3 ATK

      expect(tool.id).toBe('T1');
      expect(tool.name).toBe('Polished Pickaxe');
      expect(tool.emoji).toBe('⛏️');
      expect(tool.rarity).toBe('COMMON');
      expect(tool.stats.atk).toBe(3);
      expect(tool.tags).toContain('STONE');
    });

    it('creates Rusty Pickaxe with starter stats', () => {
      const tool = createToolInstance('T9'); // Rusty Pickaxe: +1 ATK

      expect(tool.id).toBe('T9');
      expect(tool.name).toBe('Rusty Pickaxe');
      expect(tool.emoji).toBe('⛏️');
      expect(tool.rarity).toBe('COMMON');
      expect(tool.stats.atk).toBe(1);
      expect(tool.tags).toContain('STONE');
    });

    it('creates Twin Picks with correct multi-strike property', () => {
      const tool = createToolInstance('T3'); // Twin Picks: strike twice

      expect(tool.id).toBe('T3');
      expect(tool.name).toBe('Twin Picks');
      expect(tool.stats.atk).toBe(1);
      expect(tool.tags).toContain('SCOUT');
    });

    it('creates all 9 tools with valid definitions', () => {
      const toolIds: ToolId[] = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9'];

      for (const id of toolIds) {
        const tool = createToolInstance(id);
        expect(tool.id).toBe(id);
        expect(tool.name).toBeTruthy();
        expect(tool.emoji).toBeTruthy();
        expect(tool.rarity).toBeTruthy();
      }
    });

    it('creates Reinforced Shovel with ATK and ARM stats', () => {
      const tool = createToolInstance('T2'); // +1 ATK, +6 ARM

      expect(tool.stats.atk).toBe(1);
      expect(tool.stats.arm).toBe(6);
    });

    it('creates Prospectors Pike with ATK and DIG stats', () => {
      const tool = createToolInstance('T4'); // +2 ATK, +2 DIG

      expect(tool.stats.atk).toBe(2);
      expect(tool.stats.dig).toBe(2);
    });
  });

  describe('createGearInstance', () => {
    it('creates a gear instance with base rarity stats', () => {
      const gear = createGearInstance('I1'); // Miner's Helmet: +2 ARM, +1 DIG

      expect(gear.id).toBe('I1');
      expect(gear.name).toBe("Miner's Helmet");
      expect(gear.emoji).toBe('⛑️');
      expect(gear.baseRarity).toBe('COMMON');
      expect(gear.currentRarity).toBe('COMMON');
      expect(gear.stats.arm).toBe(2);
      expect(gear.stats.dig).toBe(1);
      expect(gear.tags).toContain('STONE');
    });

    it('creates gear with Gilded rarity applying 1.5x multiplier', () => {
      const gear = createGearInstance('I1', 'GILDED'); // ARM: 2*1.5=3, DIG: 1*1.5=1

      expect(gear.currentRarity).toBe('GILDED');
      expect(gear.stats.arm).toBe(3); // Math.floor(2 * 1.5)
      expect(gear.stats.dig).toBe(1); // Math.floor(1 * 1.5)
    });

    it('creates gear with Diamond rarity applying 2x multiplier', () => {
      const gear = createGearInstance('I1', 'DIAMOND'); // ARM: 2*2=4, DIG: 1*2=2

      expect(gear.currentRarity).toBe('DIAMOND');
      expect(gear.stats.arm).toBe(4); // Math.floor(2 * 2)
      expect(gear.stats.dig).toBe(2); // Math.floor(1 * 2)
    });

    it('does not apply multiplier to Rare rarity items', () => {
      const gear = createGearInstance('I15'); // Canary Charm: RARE, +5 HP

      expect(gear.baseRarity).toBe('RARE');
      expect(gear.currentRarity).toBe('RARE');
      expect(gear.stats.hp).toBe(5); // No multiplier for RARE
    });

    it('creates all 27 gear items with valid definitions', () => {
      const gearIds: GearId[] = [
        'I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8', 'I9', 'I10',
        'I11', 'I12', 'I13', 'I14', 'I15', 'I16', 'I17', 'I18', 'I19', 'I20',
        'I21', 'I22', 'I23', 'I24', 'I25', 'I26', 'I27',
      ];

      for (const id of gearIds) {
        const gear = createGearInstance(id);
        expect(gear.id).toBe(id);
        expect(gear.name).toBeTruthy();
        expect(gear.emoji).toBeTruthy();
        expect(gear.baseRarity).toBeTruthy();
      }
    });
  });

  describe('applyRarityMultiplier', () => {
    it('returns 1.0 multiplier for COMMON rarity', () => {
      expect(applyRarityMultiplier('COMMON')).toBe(1.0);
    });

    it('returns 1.5 multiplier for GILDED rarity', () => {
      expect(applyRarityMultiplier('GILDED')).toBe(1.5);
    });

    it('returns 2.0 multiplier for DIAMOND rarity', () => {
      expect(applyRarityMultiplier('DIAMOND')).toBe(2.0);
    });

    it('returns 1.0 multiplier for RARE/HEROIC/MYTHIC (fixed rarities)', () => {
      expect(applyRarityMultiplier('RARE')).toBe(1.0);
      expect(applyRarityMultiplier('HEROIC')).toBe(1.0);
      expect(applyRarityMultiplier('MYTHIC')).toBe(1.0);
    });
  });

  describe('calculateItemStats', () => {
    it('calculates combined stats from single tool', () => {
      const tool = createToolInstance('T1'); // +3 ATK

      const stats = calculateItemStats(tool, []);

      expect(stats.atk).toBe(3);
      expect(stats.arm).toBe(0);
      expect(stats.spd).toBe(0);
      expect(stats.dig).toBe(0);
      expect(stats.hp).toBe(0);
    });

    it('calculates combined stats from single gear item', () => {
      const gear = createGearInstance('I7'); // Lucky Charm: +3 HP

      const stats = calculateItemStats(null, [gear]);

      expect(stats.hp).toBe(3);
      expect(stats.atk).toBe(0);
    });

    it('calculates combined stats from tool + multiple gear', () => {
      const tool = createToolInstance('T2'); // +1 ATK, +6 ARM
      const gear1 = createGearInstance('I1'); // +2 ARM, +1 DIG
      const gear2 = createGearInstance('I7'); // +3 HP

      const stats = calculateItemStats(tool, [gear1, gear2]);

      expect(stats.atk).toBe(1); // T2
      expect(stats.arm).toBe(8); // T2(6) + I1(2)
      expect(stats.dig).toBe(1); // I1
      expect(stats.hp).toBe(3); // I7
    });

    it('handles null tool correctly', () => {
      const gear = createGearInstance('I2'); // +1 ATK, +1 ARM

      const stats = calculateItemStats(null, [gear]);

      expect(stats.atk).toBe(1);
      expect(stats.arm).toBe(1);
    });

    it('handles empty gear array correctly', () => {
      const tool = createToolInstance('T4'); // +2 ATK, +2 DIG

      const stats = calculateItemStats(tool, []);

      expect(stats.atk).toBe(2);
      expect(stats.dig).toBe(2);
      expect(stats.arm).toBe(0);
    });

    it('handles no equipment', () => {
      const stats = calculateItemStats(null, []);

      expect(stats.atk).toBe(0);
      expect(stats.arm).toBe(0);
      expect(stats.spd).toBe(0);
      expect(stats.dig).toBe(0);
      expect(stats.hp).toBe(0);
    });

    it('correctly sums all stat types from multiple gear', () => {
      const gear1 = createGearInstance('I2'); // +1 ATK, +1 ARM
      const gear2 = createGearInstance('I3'); // +2 ARM, +1 SPD
      const gear3 = createGearInstance('I4'); // +2 DIG
      const gear4 = createGearInstance('I7'); // +3 HP

      const stats = calculateItemStats(null, [gear1, gear2, gear3, gear4]);

      expect(stats.atk).toBe(1);
      expect(stats.arm).toBe(3); // I2(1) + I3(2)
      expect(stats.spd).toBe(1);
      expect(stats.dig).toBe(2);
      expect(stats.hp).toBe(3);
    });
  });

  describe('getToolDefinition', () => {
    it('returns correct definition for T1 Polished Pickaxe', () => {
      const def = getToolDefinition('T1');

      expect(def.id).toBe('T1');
      expect(def.name).toBe('Polished Pickaxe');
      expect(def.emoji).toBe('⛏️');
      expect(def.rarity).toBe('COMMON');
      expect(def.stats.atk).toBe(3);
    });

    it('returns correct definition for T5 Pneumatic Drill (Rare)', () => {
      const def = getToolDefinition('T5');

      expect(def.id).toBe('T5');
      expect(def.name).toBe('Pneumatic Drill');
      expect(def.rarity).toBe('RARE');
    });

    it('returns correct definition for T8 Tempest Drill (Mythic)', () => {
      const def = getToolDefinition('T8');

      expect(def.id).toBe('T8');
      expect(def.name).toBe('Tempest Drill');
      expect(def.rarity).toBe('MYTHIC');
    });
  });

  describe('getGearDefinition', () => {
    it('returns correct definition for I1 Miners Helmet', () => {
      const def = getGearDefinition('I1');

      expect(def.id).toBe('I1');
      expect(def.name).toBe("Miner's Helmet");
      expect(def.baseRarity).toBe('COMMON');
    });

    it('returns correct definition for I15 Canary Charm (Rare)', () => {
      const def = getGearDefinition('I15');

      expect(def.id).toBe('I15');
      expect(def.name).toBe('Canary Charm');
      expect(def.baseRarity).toBe('RARE');
    });

    it('returns correct definition for I26 Adrenaline Shot (Heroic)', () => {
      const def = getGearDefinition('I26');

      expect(def.id).toBe('I26');
      expect(def.name).toBe('Adrenaline Shot');
      expect(def.baseRarity).toBe('HEROIC');
    });
  });

  describe('TOOL_DEFINITIONS data integrity', () => {
    it('contains exactly 9 tools', () => {
      const toolCount = Object.keys(TOOL_DEFINITIONS).length;
      expect(toolCount).toBe(9);
    });

    it('all tools have required fields', () => {
      for (const [id, def] of Object.entries(TOOL_DEFINITIONS)) {
        expect(def.id).toBe(id);
        expect(def.name).toBeTruthy();
        expect(def.emoji).toBeTruthy();
        expect(def.rarity).toBeTruthy();
        expect(def.stats).toBeDefined();
        expect(Array.isArray(def.tags)).toBe(true);
      }
    });

    it('T7 Gemfinder Staff has GREED tag', () => {
      const def = getToolDefinition('T7');
      expect(def.tags).toContain('GREED');
    });
  });
});
