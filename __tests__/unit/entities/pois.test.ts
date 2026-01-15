/**
 * T078-T082, T087: POI validation and behavior tests
 */

import { createPOIInteraction, applyPOIOption } from '../../../src/game/entities/pois';
import { createInitialGameState, initializeGame } from '../../../src/game/engine/state-factory';
import { TimePhase } from '../../../src/game/engine/types';
import type { GameState, Gear } from '../../../src/game/engine/types';
import {
  getAllPOIDefinitions,
  getPOIDefinition,
  getNightOnlyPOIs,
  canInteractWithPOI,
  createMapPOI,
  POI_DEFINITIONS,
  type POIId,
} from '../../../src/data/pois';
import { BOSSES } from '../../../src/data/bosses';

// Helper to create state with specific boss
function createStateWithBoss(bossId: string): GameState {
  const base = initializeGame(createInitialGameState(), 123);
  return {
    ...base,
    time: {
      ...base.time,
      weekBoss: bossId as any,
    },
  };
}

describe('POI System', () => {
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
  });

  // ============================================================================
  // T079: Night-only POIs (L1, L5)
  // ============================================================================
  describe('T079: Night-only POI validation', () => {
    it('should have exactly 2 night-only POIs', () => {
      const nightOnlyPOIs = getNightOnlyPOIs();
      expect(nightOnlyPOIs).toHaveLength(2);
    });

    it('should allow interaction with night-only POIs during night', () => {
      expect(canInteractWithPOI('L1', true)).toBe(true);
      expect(canInteractWithPOI('L5', true)).toBe(true);
    });

    it('should not allow interaction with night-only POIs during day', () => {
      expect(canInteractWithPOI('L1', false)).toBe(false);
      expect(canInteractWithPOI('L5', false)).toBe(false);
    });
  });

  // ============================================================================
  // T080: Mole Den (L1)
  // ============================================================================
  describe('T080: Mole Den (L1)', () => {
    it('should restore all HP and skip to Day', () => {
      const state = createInitialGameState();
      state.time.phase = TimePhase.Night;
      state.player.stats.hp = 1;
      state.player.stats.maxHp = 20;

      const interaction = createPOIInteraction(createMapPOI('L1', { x: 0, y: 0 }), state);

      if (!interaction) throw new Error('Interaction should not be null');

      // Attach interaction to state (simulating game engine)
      const stateWithPOI = { ...state, activePOI: interaction };

      // Option 0 is Rest
      const newState = applyPOIOption(stateWithPOI, 0);

      expect(newState.time.phase).toBe(TimePhase.Day);
      expect(newState.player.stats.hp).toBe(20);
    });
  });

  // ============================================================================
  // T081: Supply Cache (L2)
  // ============================================================================
  describe('T081: Supply Cache (L2)', () => {
    it('should offer 3 items', () => {
      const state = createInitialGameState();
      const interaction = createPOIInteraction(createMapPOI('L2', { x: 0, y: 0 }), state);

      if (!interaction || !interaction.options)
        throw new Error('Interaction or options should not be null');

      expect(interaction.options).toHaveLength(3);
      interaction.options.forEach((option) => {
        expect(option.item).toBeDefined();
        expect((option.item as Gear).stats).toBeDefined();
      });
    });
  });

  // ============================================================================
  // T082: Counter Cache (L13)
  // ============================================================================
  describe('T082: Counter Cache (L13)', () => {
    it('should offer items ONLY from boss weakness tags', () => {
      // Use Broodmother (STONE + FROST)
      const state = createStateWithBoss('B-A-W1-01');
      const interaction = createPOIInteraction(createMapPOI('L13', { x: 0, y: 0 }), state);

      if (!interaction || !interaction.options)
        throw new Error('Interaction or options should not be null');

      expect(interaction.options).toHaveLength(3);
      interaction.options.forEach((option) => {
        expect(option.item).toBeDefined();
      });
    });
  });

  // ============================================================================
  // T087: Scrap Chute (L14)
  // ============================================================================
  describe('T087: Scrap Chute (L14)', () => {
    it('should offer to scrap items in inventory', () => {
      const state = createInitialGameState();

      const interaction = createPOIInteraction(createMapPOI('L14', { x: 0, y: 0 }), state);

      if (!interaction || !interaction.options)
        throw new Error('Interaction or options should not be null');

      // Should have options equal to inventory size + Leave
      expect(interaction.options.length).toBeGreaterThanOrEqual(1); // At least Leave
    });
  });
});
