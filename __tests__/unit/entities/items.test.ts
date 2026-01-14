/**
 * Item Entity Tests - Updated for GDD 80 items
 * Tests for item stat calculations, rarity multipliers, and tool/gear instances
 * @see docs/gdd.md Section 9: Item System
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
import type { ToolId, GearId } from '../../../src/game/engine/types';

describe('Items Entity', () => {
  describe('createToolInstance', () => {
    it('creates a tool instance with correct base stats', () => {
      const tool = createToolInstance('T1'); // Bulwark Shovel: +1 ATK, +4 ARM

      expect(tool.id).toBe('T1');
      expect(tool.name).toBe('Bulwark Shovel');
      expect(tool.emoji).toBe('🛠️');
      expect(tool.rarity).toBe('COMMON');
      expect(tool.stats.atk).toBe(1);
      expect(tool.stats.arm).toBe(4);
      expect(tool.tags).toContain('STONE');
    });

    it('creates Rime Pike with FROST tag', () => {
      const tool = createToolInstance('T9'); // Rime Pike: +2 ATK

      expect(tool.id).toBe('T9');
      expect(tool.name).toBe('Rime Pike');
      expect(tool.rarity).toBe('COMMON');
      expect(tool.stats.atk).toBe(2);
      expect(tool.tags).toContain('FROST');
    });

    it('creates Twin Picks with correct multi-strike property', () => {
      const tool = createToolInstance('T3'); // Twin Picks: strike twice

      expect(tool.id).toBe('T3');
      expect(tool.name).toBe('Twin Picks');
      expect(tool.stats.atk).toBe(1);
      expect(tool.tags).toContain('SCOUT');
    });

    it('creates all 16 tools with valid definitions', () => {
      const toolIds: ToolId[] = [
        'T1',
        'T2',
        'T3',
        'T4',
        'T5',
        'T6',
        'T7',
        'T8',
        'T9',
        'T10',
        'T11',
        'T12',
        'T13',
        'T14',
        'T15',
        'T16',
      ];

      for (const id of toolIds) {
        const tool = createToolInstance(id);
        expect(tool.id).toBe(id);
        expect(tool.name).toBeTruthy();
        expect(tool.emoji).toBeTruthy();
        expect(tool.rarity).toBeTruthy();
      }
    });

    it('creates Cragbreaker Hammer with ATK and ARM stats', () => {
      const tool = createToolInstance('T2'); // +2 ATK, +3 ARM

      expect(tool.stats.atk).toBe(2);
      expect(tool.stats.arm).toBe(3);
    });

    it('creates Pneumatic Drill with multi-strike', () => {
      const tool = createToolInstance('T4'); // +1 ATK, strikes 3 times

      expect(tool.stats.atk).toBe(1);
      expect(tool.tags).toContain('SCOUT');
    });
  });

  describe('createGearInstance', () => {
    it('creates a gear instance with base rarity stats', () => {
      const gear = createGearInstance('I9'); // Miner Boots: +2 DIG

      expect(gear.id).toBe('I9');
      expect(gear.name).toBe('Miner Boots');
      expect(gear.emoji).toBe('🥾');
      expect(gear.baseRarity).toBe('COMMON');
      expect(gear.currentRarity).toBe('COMMON');
      expect(gear.stats.dig).toBe(2);
      expect(gear.tags).toContain('SCOUT');
    });

    it('creates gear with Gilded rarity applying 2x multiplier', () => {
      const gear = createGearInstance('I9', 'GILDED'); // DIG: 2*2=4

      expect(gear.currentRarity).toBe('GILDED');
      expect(gear.stats.dig).toBe(4);
    });

    it('creates gear with Diamond rarity applying 4x multiplier', () => {
      const gear = createGearInstance('I9', 'DIAMOND'); // DIG: 2*4=8

      expect(gear.currentRarity).toBe('DIAMOND');
      expect(gear.stats.dig).toBe(8);
    });

    it('does not apply multiplier to Rare rarity items', () => {
      const gear = createGearInstance('I34'); // Frostguard Buckler: RARE, +6 ARM

      expect(gear.baseRarity).toBe('RARE');
      expect(gear.currentRarity).toBe('RARE');
      expect(gear.stats.arm).toBe(6); // No multiplier for RARE
    });

    it('creates all 64 gear items with valid definitions', () => {
      const gearIds: GearId[] = [];
      for (let i = 1; i <= 64; i++) {
        gearIds.push(`I${i}` as GearId);
      }

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

    it('returns 2.0 multiplier for GILDED rarity', () => {
      expect(applyRarityMultiplier('GILDED')).toBe(2.0);
    });

    it('returns 4.0 multiplier for DIAMOND rarity', () => {
      expect(applyRarityMultiplier('DIAMOND')).toBe(4.0);
    });

    it('returns 1.0 multiplier for RARE/HEROIC/MYTHIC (fixed rarities)', () => {
      expect(applyRarityMultiplier('RARE')).toBe(1.0);
      expect(applyRarityMultiplier('HEROIC')).toBe(1.0);
      expect(applyRarityMultiplier('MYTHIC')).toBe(1.0);
    });
  });

  describe('calculateItemStats', () => {
    it('calculates combined stats from single tool', () => {
      const tool = createToolInstance('T1'); // +1 ATK, +4 ARM

      const stats = calculateItemStats(tool, []);

      expect(stats.atk).toBe(1);
      expect(stats.arm).toBe(4);
      expect(stats.spd).toBe(0);
      expect(stats.dig).toBe(0);
      expect(stats.hp).toBe(0);
    });

    it('calculates combined stats from single gear item', () => {
      const gear = createGearInstance('I2'); // Work Vest: +4 HP, +1 ARM

      const stats = calculateItemStats(null, [gear]);

      expect(stats.hp).toBe(4);
      expect(stats.arm).toBe(1);
      expect(stats.atk).toBe(0);
    });

    it('calculates combined stats from tool + multiple gear', () => {
      const tool = createToolInstance('T2'); // Cragbreaker: +2 ATK, +3 ARM
      const gear1 = createGearInstance('I1'); // Miner Helmet: +3 ARM
      const gear2 = createGearInstance('I2'); // Work Vest: +4 HP, +1 ARM
      const gear3 = createGearInstance('I10'); // Leather Gloves: +1 ATK, +1 DIG

      const stats = calculateItemStats(tool, [gear1, gear2, gear3]);

      expect(stats.atk).toBe(3); // T2(2) + I10(1)
      expect(stats.arm).toBe(7); // T2(3) + I1(3) + I2(1)
      expect(stats.dig).toBe(1); // I10
      expect(stats.hp).toBe(4); // I2
    });

    it('handles null tool correctly', () => {
      const gear = createGearInstance('I10'); // Leather Gloves: +1 ATK, +1 DIG

      const stats = calculateItemStats(null, [gear]);

      expect(stats.atk).toBe(1);
      expect(stats.dig).toBe(1);
    });

    it('handles empty gear array correctly', () => {
      const tool = createToolInstance('T15'); // Quickpick: +1 ATK, +1 SPD

      const stats = calculateItemStats(tool, []);

      expect(stats.atk).toBe(1);
      expect(stats.spd).toBe(1);
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
      const gear1 = createGearInstance('I9'); // Miner Boots: +2 DIG
      const gear2 = createGearInstance('I1'); // Miner Helmet: +3 ARM
      const gear3 = createGearInstance('I2'); // Work Vest: +4 HP, +1 ARM
      const gear4 = createGearInstance('I10'); // Leather Gloves: +1 ATK, +1 DIG

      const stats = calculateItemStats(null, [gear1, gear2, gear3, gear4]);

      expect(stats.atk).toBe(1); // I10
      expect(stats.arm).toBe(4); // I1(3) + I2(1)
      expect(stats.spd).toBe(0);
      expect(stats.dig).toBe(3); // I9(2) + I10(1)
      expect(stats.hp).toBe(4); // I2
    });
  });

  describe('getToolDefinition', () => {
    it('returns correct definition for T1 Bulwark Shovel', () => {
      const def = getToolDefinition('T1');

      expect(def.id).toBe('T1');
      expect(def.name).toBe('Bulwark Shovel');
      expect(def.rarity).toBe('COMMON');
      expect(def.stats.atk).toBe(1);
      expect(def.stats.arm).toBe(4);
    });

    it('returns correct definition for T5 Glittering Pick (Common)', () => {
      const def = getToolDefinition('T5');

      expect(def.id).toBe('T5');
      expect(def.name).toBe('Glittering Pick');
      expect(def.rarity).toBe('COMMON');
    });

    it('returns correct definition for T8 Spark Pick (Rare)', () => {
      const def = getToolDefinition('T8');

      expect(def.id).toBe('T8');
      expect(def.name).toBe('Spark Pick');
      expect(def.rarity).toBe('RARE');
    });
  });

  describe('getGearDefinition', () => {
    it('returns correct definition for I1 Miner Helmet', () => {
      const def = getGearDefinition('I1');

      expect(def.id).toBe('I1');
      expect(def.name).toBe('Miner Helmet');
      expect(def.baseRarity).toBe('COMMON');
    });

    it('returns correct definition for I34 Frostguard Buckler (Rare)', () => {
      const def = getGearDefinition('I34');

      expect(def.id).toBe('I34');
      expect(def.name).toBe('Frostguard Buckler');
      expect(def.baseRarity).toBe('RARE');
    });

    it('returns correct definition for I31 Time Charge (Heroic)', () => {
      const def = getGearDefinition('I31');

      expect(def.id).toBe('I31');
      expect(def.name).toBe('Time Charge');
      expect(def.baseRarity).toBe('HEROIC');
    });
  });

  describe('TOOL_DEFINITIONS data integrity', () => {
    it('contains exactly 17 tools', () => {
      const toolCount = Object.keys(TOOL_DEFINITIONS).length;
      expect(toolCount).toBe(17);
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

    it('T6 Gemfinder Staff has GREED tag', () => {
      const def = getToolDefinition('T6');
      expect(def.tags).toContain('GREED');
    });
  });
});
