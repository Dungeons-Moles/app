/**
 * T090-T093: Itemset validation and logic tests
 */

import {
  ITEMSET_DEFINITIONS,
  getAllItemsetDefinitions,
  getItemsetDefinition,
  checkItemsetComplete,
  getActiveItemsets,
  getItemsetProgress,
} from '../../../src/data/itemsets';

describe('Itemset Definitions', () => {
  // ============================================================================
  // T090: Validation tests
  // ============================================================================
  it('should have exactly 12 itemsets defined', () => {
    const sets = getAllItemsetDefinitions();
    expect(sets).toHaveLength(12);
  });

  it('should have correct required items for Union Standard', () => {
    const set = getItemsetDefinition('UNION_STANDARD');
    expect(set.requiredItems).toEqual(expect.arrayContaining(['I1', 'I2', 'I9']));
    expect(set.requiredItems).toHaveLength(3);
  });

  it('should have correct required items for Shard Circuit', () => {
    const set = getItemsetDefinition('SHARD_CIRCUIT');
    expect(set.requiredItems).toEqual(expect.arrayContaining(['I21', 'I22', 'I23', 'I24']));
    expect(set.requiredItems).toHaveLength(4);
  });

  it('should have correct required items for Demolition Permit', () => {
    const set = getItemsetDefinition('DEMOLITION_PERMIT');
    expect(set.requiredItems).toEqual(expect.arrayContaining(['I25', 'I26', 'I27']));
    expect(set.requiredItems).toHaveLength(3);
  });
});

describe('Itemset Logic', () => {
  // ============================================================================
  // T091: Itemset activation logic
  // ============================================================================
  it('checkItemsetComplete returns true when all items equipped', () => {
    // Union Standard: I1, I2, I9
    const result = checkItemsetComplete('UNION_STANDARD', null, ['I1', 'I2', 'I9']);
    expect(result).toBe(true);
  });

  it('checkItemsetComplete returns true with extra items', () => {
    const result = checkItemsetComplete('UNION_STANDARD', 'T1', ['I1', 'I2', 'I9', 'I5']);
    expect(result).toBe(true);
  });

  // ============================================================================
  // T092: Incomplete itemset logic
  // ============================================================================
  it('checkItemsetComplete returns false when missing an item', () => {
    // Missing I9
    const result = checkItemsetComplete('UNION_STANDARD', null, ['I1', 'I2']);
    expect(result).toBe(false);
  });

  it('checkItemsetComplete returns false when empty', () => {
    const result = checkItemsetComplete('UNION_STANDARD', null, []);
    expect(result).toBe(false);
  });

  // ============================================================================
  // getActiveItemsets
  // ============================================================================
  it('getActiveItemsets returns all completed sets', () => {
    // Equip items for Union Standard and Demolition Permit
    // Union: I1, I2, I9
    // Demo: I25, I26, I27
    const gearIds = ['I1', 'I2', 'I9', 'I25', 'I26', 'I27'];
    const active = getActiveItemsets(null, gearIds as any); // cast for test simplicity

    expect(active).toHaveLength(2);
    expect(active).toContain('UNION_STANDARD');
    expect(active).toContain('DEMOLITION_PERMIT');
  });

  it('getActiveItemsets handles tool requirement', () => {
    // Fuse Network: T8, I29, I28
    const active = getActiveItemsets('T8', ['I29', 'I28'] as any);
    expect(active).toContain('FUSE_NETWORK');
  });

  // ============================================================================
  // getItemsetProgress
  // ============================================================================
  it('getItemsetProgress returns correct progress', () => {
    // Union Standard: I1, I2, I9
    // Have: I1, I2
    const progress = getItemsetProgress('UNION_STANDARD', null, ['I1', 'I2'] as any);

    expect(progress.total).toBe(3);
    expect(progress.owned).toEqual(expect.arrayContaining(['I1', 'I2']));
    expect(progress.missing).toEqual(['I9']);
  });
});
