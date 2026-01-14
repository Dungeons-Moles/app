/**
 * T124: Determinism Integration
 */

import { gameReducer } from '../../src/game/engine/game-reducer';
import { createInitialGameState } from '../../src/game/engine/state-factory';

describe('Game Determinism', () => {
  it('produces identical states for same seed', () => {
    const seed = 999;

    // Run 1
    let state1 = createInitialGameState();
    state1 = gameReducer(state1, { type: 'START_GAME', seed });

    // Run 2
    let state2 = createInitialGameState();
    state2 = gameReducer(state2, { type: 'START_GAME', seed });

    expect(state1).toEqual(state2);
    expect(state1.map.enemies[0].position).toEqual(state2.map.enemies[0].position);
  });
});
