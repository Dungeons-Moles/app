/**
 * Itemset Entity Tests - T074
 * Tests for itemset detection, activation, and bonus application
 * @see specs/001-pve-dungeon-crawler/data-model.md
 * @see specs/001-pve-dungeon-crawler/spec.md Appendix E
 */

import {
  checkItemsetComplete,
  getActiveItemsets,
  getItemsetProgress,
  getItemsetsForItem,
  getItemsetDefinition,
  getAllItemsetDefinitions,
  ITEMSET_DEFINITIONS,
} from '../../../src/game/entities/itemsets';
import type { ItemsetId, ToolId, GearId } from '../../../src/game/engine/types';

describe('Itemsets Entity', () => {
  describe('checkItemsetComplete', () => {
    it('returns true when Union Standard set is complete (I1 + I2 + I3)', () => {
      const result = checkItemsetComplete(
        'UNION_STANDARD',
        null, // no tool
        ['I1', 'I2', 'I3']
      );

      expect(result).toBe(true);
    });

    it('returns false when Union Standard set is missing one item', () => {
      const result = checkItemsetComplete(
        'UNION_STANDARD',
        null,
        ['I1', 'I2'] // missing I3
      );

      expect(result).toBe(false);
    });

    it('returns true when Shrapnel Harness set is complete (I6 + I21 + T2)', () => {
      const result = checkItemsetComplete(
        'SHRAPNEL_HARNESS',
        'T2', // Reinforced Shovel
        ['I6', 'I21']
      );

      expect(result).toBe(true);
    });

    it('returns false when Shrapnel Harness is missing tool', () => {
      const result = checkItemsetComplete(
        'SHRAPNEL_HARNESS',
        null, // missing T2
        ['I6', 'I21']
      );

      expect(result).toBe(false);
    });

    it('returns true when Shard Circuit set is complete (I11 + I12 + I13 + I14)', () => {
      const result = checkItemsetComplete(
        'SHARD_CIRCUIT',
        null,
        ['I11', 'I12', 'I13', 'I14']
      );

      expect(result).toBe(true);
    });

    it('returns false for incomplete Shard Circuit', () => {
      const result = checkItemsetComplete(
        'SHARD_CIRCUIT',
        null,
        ['I11', 'I12', 'I13'] // missing I14
      );

      expect(result).toBe(false);
    });

    it('returns true when Swift Digger Kit set is complete (T3 + I1 + I27)', () => {
      const result = checkItemsetComplete(
        'SWIFT_DIGGER_KIT',
        'T3', // Twin Picks
        ['I1', 'I27']
      );

      expect(result).toBe(true);
    });

    it('returns true when Royal Extraction set is complete (I8 + I25 + T7)', () => {
      const result = checkItemsetComplete(
        'ROYAL_EXTRACTION',
        'T7', // Gemfinder Staff
        ['I8', 'I25']
      );

      expect(result).toBe(true);
    });

    it('ignores extra items when checking set completion', () => {
      const result = checkItemsetComplete(
        'UNION_STANDARD',
        'T1', // extra tool
        ['I1', 'I2', 'I3', 'I4', 'I5'] // extra gear
      );

      expect(result).toBe(true);
    });
  });

  describe('getActiveItemsets', () => {
    it('returns empty array when no sets are complete', () => {
      const result = getActiveItemsets(null, ['I1', 'I2']);

      expect(result).toEqual([]);
    });

    it('returns single active set when one is complete', () => {
      const result = getActiveItemsets(null, ['I1', 'I2', 'I3']);

      expect(result).toContain('UNION_STANDARD');
      expect(result).toHaveLength(1);
    });

    it('returns multiple active sets when more than one is complete', () => {
      const result = getActiveItemsets(
        'T2', // For Shrapnel Harness
        ['I1', 'I2', 'I3', 'I6', 'I21'] // Union Standard + Shrapnel Harness
      );

      expect(result).toContain('UNION_STANDARD');
      expect(result).toContain('SHRAPNEL_HARNESS');
      expect(result).toHaveLength(2);
    });

    it('returns Rust Ritual when complete (I5 + I22 + I23)', () => {
      const result = getActiveItemsets(null, ['I5', 'I22', 'I23']);

      expect(result).toContain('RUST_RITUAL');
    });

    it('returns Demolition Permit when complete (I10 + I16 + I18)', () => {
      const result = getActiveItemsets(null, ['I10', 'I16', 'I18']);

      expect(result).toContain('DEMOLITION_PERMIT');
    });

    it('returns Fuse Network when complete (I17 + I19 + I20)', () => {
      const result = getActiveItemsets(null, ['I17', 'I19', 'I20']);

      expect(result).toContain('FUSE_NETWORK');
    });
  });

  describe('getItemsetProgress', () => {
    it('returns correct progress for partially complete set', () => {
      const progress = getItemsetProgress(
        'UNION_STANDARD',
        null,
        ['I1', 'I2']
      );

      expect(progress.owned).toEqual(['I2', 'I1']); // Order may vary
      expect(progress.missing).toEqual(['I3']);
      expect(progress.total).toBe(3);
    });

    it('returns correct progress for complete set', () => {
      const progress = getItemsetProgress(
        'UNION_STANDARD',
        null,
        ['I1', 'I2', 'I3']
      );

      expect(progress.owned).toHaveLength(3);
      expect(progress.missing).toHaveLength(0);
      expect(progress.total).toBe(3);
    });

    it('returns correct progress for empty equipment', () => {
      const progress = getItemsetProgress(
        'UNION_STANDARD',
        null,
        []
      );

      expect(progress.owned).toHaveLength(0);
      expect(progress.missing).toHaveLength(3);
      expect(progress.total).toBe(3);
    });

    it('returns correct progress for set requiring tool', () => {
      const progress = getItemsetProgress(
        'SHRAPNEL_HARNESS',
        'T2',
        ['I6']
      );

      expect(progress.owned).toContain('T2');
      expect(progress.owned).toContain('I6');
      expect(progress.missing).toContain('I21');
      expect(progress.total).toBe(3);
    });

    it('handles 4-item set (Shard Circuit) correctly', () => {
      const progress = getItemsetProgress(
        'SHARD_CIRCUIT',
        null,
        ['I11', 'I12']
      );

      expect(progress.owned).toHaveLength(2);
      expect(progress.missing).toHaveLength(2);
      expect(progress.total).toBe(4);
    });
  });

  describe('getItemsetsForItem', () => {
    it('returns itemsets that I1 Miners Boots contributes to', () => {
      const itemsets = getItemsetsForItem('I1');

      expect(itemsets.map(is => is.id)).toContain('UNION_STANDARD');
      expect(itemsets.map(is => is.id)).toContain('SWIFT_DIGGER_KIT');
    });

    it('returns itemsets that T2 Reinforced Shovel contributes to', () => {
      const itemsets = getItemsetsForItem('T2');

      expect(itemsets.map(is => is.id)).toContain('SHRAPNEL_HARNESS');
    });

    it('returns itemsets that T7 Gemfinder Staff contributes to', () => {
      const itemsets = getItemsetsForItem('T7');

      expect(itemsets.map(is => is.id)).toContain('ROYAL_EXTRACTION');
    });

    it('returns empty array for item not in any set', () => {
      // I7 Frost Lantern is not in any itemset
      const itemsets = getItemsetsForItem('I7');

      expect(itemsets).toHaveLength(0);
    });

    it('returns multiple itemsets when item is in multiple sets', () => {
      // I1 is in UNION_STANDARD and SWIFT_DIGGER_KIT
      const itemsets = getItemsetsForItem('I1');

      expect(itemsets.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getItemsetDefinition', () => {
    it('returns correct definition for UNION_STANDARD', () => {
      const def = getItemsetDefinition('UNION_STANDARD');

      expect(def.id).toBe('UNION_STANDARD');
      expect(def.name).toBe('Union Standard');
      expect(def.emoji).toBe('🧰');
      expect(def.requiredItems).toContain('I1');
      expect(def.requiredItems).toContain('I2');
      expect(def.requiredItems).toContain('I3');
      expect(def.bonus.description).toContain('Armor');
      expect(def.bonus.timing).toBe('BATTLE_START');
    });

    it('returns correct definition for SHARD_CIRCUIT', () => {
      const def = getItemsetDefinition('SHARD_CIRCUIT');

      expect(def.id).toBe('SHARD_CIRCUIT');
      expect(def.name).toBe('Shard Circuit');
      expect(def.requiredItems).toHaveLength(4);
      expect(def.bonus.timing).toBe('TURN_START');
    });

    it('returns correct definition for DEMOLITION_PERMIT (passive set)', () => {
      const def = getItemsetDefinition('DEMOLITION_PERMIT');

      expect(def.id).toBe('DEMOLITION_PERMIT');
      expect(def.bonus.passive).toBe(true);
    });

    it('returns correct definition for ROYAL_EXTRACTION (passive set)', () => {
      const def = getItemsetDefinition('ROYAL_EXTRACTION');

      expect(def.id).toBe('ROYAL_EXTRACTION');
      expect(def.bonus.passive).toBe(true);
      expect(def.requiredItems).toContain('T7');
    });
  });

  describe('getAllItemsetDefinitions', () => {
    it('returns exactly 8 itemsets', () => {
      const itemsets = getAllItemsetDefinitions();

      expect(itemsets).toHaveLength(8);
    });

    it('returns all itemset IDs', () => {
      const itemsets = getAllItemsetDefinitions();
      const ids = itemsets.map(is => is.id);

      expect(ids).toContain('UNION_STANDARD');
      expect(ids).toContain('SHARD_CIRCUIT');
      expect(ids).toContain('DEMOLITION_PERMIT');
      expect(ids).toContain('FUSE_NETWORK');
      expect(ids).toContain('SHRAPNEL_HARNESS');
      expect(ids).toContain('RUST_RITUAL');
      expect(ids).toContain('SWIFT_DIGGER_KIT');
      expect(ids).toContain('ROYAL_EXTRACTION');
    });
  });

  describe('ITEMSET_DEFINITIONS data integrity', () => {
    it('contains exactly 8 itemsets', () => {
      const count = Object.keys(ITEMSET_DEFINITIONS).length;
      expect(count).toBe(8);
    });

    it('all itemsets have required fields', () => {
      for (const [id, def] of Object.entries(ITEMSET_DEFINITIONS)) {
        expect(def.id).toBe(id);
        expect(def.name).toBeTruthy();
        expect(def.emoji).toBeTruthy();
        expect(Array.isArray(def.requiredItems)).toBe(true);
        expect(def.requiredItems.length).toBeGreaterThanOrEqual(2);
        expect(def.bonus).toBeDefined();
        expect(def.bonus.description).toBeTruthy();
      }
    });

    it('all itemsets have either timing or passive set', () => {
      for (const def of Object.values(ITEMSET_DEFINITIONS)) {
        const hasTiming = def.bonus.timing !== undefined;
        const hasPassive = def.bonus.passive === true;
        expect(hasTiming || hasPassive).toBe(true);
      }
    });

    it('itemset required items reference valid tool/gear IDs', () => {
      const validToolIds: ToolId[] = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9'];
      const validGearIds: GearId[] = [
        'I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8', 'I9', 'I10',
        'I11', 'I12', 'I13', 'I14', 'I15', 'I16', 'I17', 'I18', 'I19', 'I20',
        'I21', 'I22', 'I23', 'I24', 'I25', 'I26', 'I27',
      ];
      const validIds = new Set([...validToolIds, ...validGearIds]);

      for (const def of Object.values(ITEMSET_DEFINITIONS)) {
        for (const itemId of def.requiredItems) {
          expect(validIds.has(itemId as ToolId | GearId)).toBe(true);
        }
      }
    });
  });

  describe('Itemset bonus timings', () => {
    it('UNION_STANDARD triggers at BATTLE_START', () => {
      const def = getItemsetDefinition('UNION_STANDARD');
      expect(def.bonus.timing).toBe('BATTLE_START');
    });

    it('SHARD_CIRCUIT triggers at TURN_START', () => {
      const def = getItemsetDefinition('SHARD_CIRCUIT');
      expect(def.bonus.timing).toBe('TURN_START');
    });

    it('SHRAPNEL_HARNESS triggers at TURN_END', () => {
      const def = getItemsetDefinition('SHRAPNEL_HARNESS');
      expect(def.bonus.timing).toBe('TURN_END');
    });

    it('RUST_RITUAL triggers ON_HIT', () => {
      const def = getItemsetDefinition('RUST_RITUAL');
      expect(def.bonus.timing).toBe('ON_HIT');
    });

    it('SWIFT_DIGGER_KIT triggers at BATTLE_START', () => {
      const def = getItemsetDefinition('SWIFT_DIGGER_KIT');
      expect(def.bonus.timing).toBe('BATTLE_START');
    });
  });
});
