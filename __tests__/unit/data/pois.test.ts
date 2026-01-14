/**
 * T078-T082: POI validation and behavior tests
 * Tests for POI definitions and behaviors per GDD Section 12
 * @see docs/gdd.md Section 12 - Points of Interest
 */

import {
  POI_DEFINITIONS,
  getAllPOIDefinitions,
  getPOIDefinition,
  getNightOnlyPOIs,
  canInteractWithPOI,
  type POIId,
} from '../../../src/data/pois';

describe('POI Definitions', () => {
  // ============================================================================
  // T078: Exactly 14 POI types (L1-L14)
  // ============================================================================
  describe('T078: POI count validation', () => {
    it('should have exactly 14 POI types defined', () => {
      const allPOIs = getAllPOIDefinitions();
      expect(allPOIs).toHaveLength(14);
    });

    it('should have POI IDs L1 through L14', () => {
      const expectedIds: POIId[] = [
        'L1',
        'L2',
        'L3',
        'L4',
        'L5',
        'L6',
        'L7',
        'L8',
        'L9',
        'L10',
        'L11',
        'L12',
        'L13',
        'L14',
      ];

      for (const id of expectedIds) {
        expect(POI_DEFINITIONS[id]).toBeDefined();
        expect(POI_DEFINITIONS[id].id).toBe(id);
      }
    });

    it('should have unique names for all POIs', () => {
      const allPOIs = getAllPOIDefinitions();
      const names = allPOIs.map((poi) => poi.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it('should have unique emojis for all POIs', () => {
      const allPOIs = getAllPOIDefinitions();
      const emojis = allPOIs.map((poi) => poi.emoji);
      const uniqueEmojis = new Set(emojis);
      expect(uniqueEmojis.size).toBe(emojis.length);
    });
  });

  // ============================================================================
  // T079: Night-only POIs (L1, L5)
  // ============================================================================
  describe('T079: Night-only POI validation', () => {
    it('should have exactly 2 night-only POIs', () => {
      const nightOnlyPOIs = getNightOnlyPOIs();
      expect(nightOnlyPOIs).toHaveLength(2);
    });

    it('should mark L1 (Mole Den) as night-only', () => {
      const moleDen = getPOIDefinition('L1');
      expect(moleDen.nightOnly).toBe(true);
    });

    it('should mark L5 (Rest Alcove) as night-only', () => {
      const restAlcove = getPOIDefinition('L5');
      expect(restAlcove.nightOnly).toBe(true);
    });

    it('should not mark other POIs as night-only', () => {
      const nonNightPOIs: POIId[] = [
        'L2',
        'L3',
        'L4',
        'L6',
        'L7',
        'L8',
        'L9',
        'L10',
        'L11',
        'L12',
        'L13',
        'L14',
      ];

      for (const id of nonNightPOIs) {
        const poi = getPOIDefinition(id);
        expect(poi.nightOnly).toBeFalsy();
      }
    });

    it('should allow interaction with night-only POIs during night', () => {
      expect(canInteractWithPOI('L1', true)).toBe(true);
      expect(canInteractWithPOI('L5', true)).toBe(true);
    });

    it('should not allow interaction with night-only POIs during day', () => {
      expect(canInteractWithPOI('L1', false)).toBe(false);
      expect(canInteractWithPOI('L5', false)).toBe(false);
    });

    it('should allow interaction with non-night POIs anytime', () => {
      expect(canInteractWithPOI('L2', true)).toBe(true);
      expect(canInteractWithPOI('L2', false)).toBe(true);
      expect(canInteractWithPOI('L13', true)).toBe(true);
      expect(canInteractWithPOI('L13', false)).toBe(true);
    });
  });

  // ============================================================================
  // POI Definition Details
  // ============================================================================
  describe('POI definition details', () => {
    it('L13 (Counter Cache) should be defined correctly', () => {
      const counterCache = getPOIDefinition('L13');
      expect(counterCache.name).toBe('Counter Cache');
      expect(counterCache.emoji).toBe('🎯');
      expect(counterCache.rarity).toBe('UNCOMMON');
      expect(counterCache.interaction).toBe('ITEM_SELECTION');
      expect(counterCache.nightOnly).toBeFalsy();
    });

    it('L14 (Scrap Chute) should be defined correctly', () => {
      const scrapChute = getPOIDefinition('L14');
      expect(scrapChute.name).toBe('Scrap Chute');
      expect(scrapChute.emoji).toBe('🗑️');
      expect(scrapChute.rarity).toBe('UNCOMMON');
      expect(scrapChute.interaction).toBe('DESTROY');
      expect(scrapChute.nightOnly).toBeFalsy();
    });

    it('all POIs should have valid interaction types', () => {
      const validInteractions = [
        'ITEM_SELECTION',
        'REST',
        'TOOL_MODIFY',
        'REVEAL',
        'LOCATE',
        'FAST_TRAVEL',
        'SHOP',
        'UPGRADE',
        'FUSE',
        'DESTROY',
      ];

      const allPOIs = getAllPOIDefinitions();
      for (const poi of allPOIs) {
        expect(validInteractions).toContain(poi.interaction);
      }
    });

    it('all POIs should have valid rarity', () => {
      const validRarities = ['FIXED', 'COMMON', 'UNCOMMON', 'RARE'];

      const allPOIs = getAllPOIDefinitions();
      for (const poi of allPOIs) {
        expect(validRarities).toContain(poi.rarity);
      }
    });
  });
});
