import { createInitialGameState } from '../../src/game/engine/state-factory';
import {
  DEFAULT_OVERVIEW_STATE,
  applyOverviewAction,
} from '../../src/contexts/GameContext';

describe('Map Overview Mode', () => {
  it('does not mutate game state when toggling and panning', () => {
    const initialState = createInitialGameState();
    const snapshot = JSON.stringify(initialState);

    let overview = DEFAULT_OVERVIEW_STATE;
    overview = applyOverviewAction(overview, { type: 'TOGGLE', canActivate: true });
    overview = applyOverviewAction(overview, {
      type: 'PAN',
      delta: { x: 10, y: -5 },
      map: initialState.map,
      playerPosition: initialState.player.position,
    });

    expect(overview.active).toBe(true);
    expect(JSON.stringify(initialState)).toBe(snapshot);
  });

  it('resets camera offset when exiting overview', () => {
    const initialState = createInitialGameState();

    let overview = applyOverviewAction(DEFAULT_OVERVIEW_STATE, { type: 'TOGGLE', canActivate: true });
    overview = applyOverviewAction(overview, {
      type: 'PAN',
      delta: { x: 12, y: 8 },
      map: initialState.map,
      playerPosition: initialState.player.position,
    });
    overview = applyOverviewAction(overview, { type: 'TOGGLE', canActivate: true });

    expect(overview.active).toBe(false);
    expect(overview.offset).toEqual({ x: 0, y: 0 });
    expect(overview.zoom).toBe(1);
  });
});
