/**
 * Ensures POIs that offer multiple item choices don't show duplicates.
 */

import { createInitialGameState, initializeGame } from '../../src/game/engine/state-factory';
import type { MapPOI } from '../../src/game/map/types';
import { createPOIInteraction } from '../../src/game/entities/pois';

function createTestPOI(definitionId: MapPOI['definitionId']): MapPOI {
  return {
    id: `poi-${definitionId}`,
    definitionId,
    position: { x: 0, y: 0 },
    visited: false,
    discovered: true,
  };
}

function uniqueCount(values: string[]): number {
  return new Set(values).size;
}

describe('POI item choice uniqueness', () => {
  it('Supply Cache (L2) shows 3 different gear options', () => {
    const base = initializeGame(createInitialGameState(), 123);
    const state = { ...base, rngState: 42 };
    const interaction = createPOIInteraction(createTestPOI('L2'), state);
    expect(interaction).not.toBeNull();

    const itemIds = (interaction?.options ?? []).flatMap((option) =>
      option.item ? [option.item.id] : []
    );
    expect(itemIds).toHaveLength(3);
    expect(uniqueCount(itemIds)).toBe(3);
  });

  it('Tool Crate (L3) shows 3 different tools and excludes Rusty Pickaxe (T9)', () => {
    const base = initializeGame(createInitialGameState(), 123);
    const state = { ...base, rngState: 99 };
    const interaction = createPOIInteraction(createTestPOI('L3'), state);
    expect(interaction).not.toBeNull();

    const itemIds = (interaction?.options ?? []).flatMap((option) =>
      option.item ? [option.item.id] : []
    );
    expect(itemIds).toHaveLength(3);
    expect(uniqueCount(itemIds)).toBe(3);
    expect(itemIds).not.toContain('T9');
  });

  it('Geode Vault (L12) shows 3 different gear options', () => {
    const base = initializeGame(createInitialGameState(), 123);
    const state = { ...base, rngState: 7 };
    const interaction = createPOIInteraction(createTestPOI('L12'), state);
    expect(interaction).not.toBeNull();

    const itemIds = (interaction?.options ?? []).flatMap((option) =>
      option.item ? [option.item.id] : []
    );
    expect(itemIds).toHaveLength(3);
    expect(uniqueCount(itemIds)).toBe(3);
  });

  it('Smuggler Hatch (L9) shop does not contain duplicate items', () => {
    const base = initializeGame(createInitialGameState(), 123);
    const state = { ...base, rngState: 4242 };
    const interaction = createPOIInteraction(createTestPOI('L9'), state);
    expect(interaction).not.toBeNull();

    const itemIds = (interaction?.options ?? []).flatMap((option) =>
      option.item ? [option.item.id] : []
    );
    expect(uniqueCount(itemIds)).toBe(itemIds.length);
  });
});

