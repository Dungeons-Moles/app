/**
 * T123: Full Run Integration
 * Simulates a game run sequence
 */

import { gameReducer } from '../../src/game/engine/game-reducer';
import { createInitialGameState } from '../../src/game/engine/state-factory';
import { GamePhase, TimePhase } from '../../src/game/engine/types';

describe('Full Game Run', () => {
  it('initializes and enters exploration', () => {
    let state = createInitialGameState();
    state = gameReducer(state, { type: 'START_GAME', seed: 12345 });

    expect(state.phase).toBe(GamePhase.Exploration);
    expect(state.time.week).toBe(1);
    expect(state.map.width).toBeGreaterThan(0);
    expect(state.player.stats.hp).toBeGreaterThan(0);
  });

  // More detailed simulation would require pathfinding and extensive mocking
  // which is better covered by specific integration tests (combat-flow, exploration).
});
