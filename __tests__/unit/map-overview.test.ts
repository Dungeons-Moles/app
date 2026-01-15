import { createInitialGameState } from '../../src/game/engine/state-factory';
import {
  DEFAULT_OVERVIEW_STATE,
  applyOverviewAction,
  OVERVIEW_CONFIG,
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

    let overview = applyOverviewAction(DEFAULT_OVERVIEW_STATE, {
      type: 'TOGGLE',
      canActivate: true,
    });
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

  describe('Pinch Zoom', () => {
    it('zooms in when positive zoomDelta is applied', () => {
      let overview = applyOverviewAction(DEFAULT_OVERVIEW_STATE, {
        type: 'TOGGLE',
        canActivate: true,
      });
      const initialZoom = overview.zoom;

      overview = applyOverviewAction(overview, { type: 'ZOOM', zoomDelta: 0.1 });

      expect(overview.zoom).toBeGreaterThan(initialZoom);
      expect(overview.zoom).toBe(initialZoom + 0.1);
    });

    it('zooms out when negative zoomDelta is applied', () => {
      let overview = applyOverviewAction(DEFAULT_OVERVIEW_STATE, {
        type: 'TOGGLE',
        canActivate: true,
      });
      const initialZoom = overview.zoom;

      overview = applyOverviewAction(overview, { type: 'ZOOM', zoomDelta: -0.1 });

      expect(overview.zoom).toBeLessThan(initialZoom);
      expect(overview.zoom).toBe(initialZoom - 0.1);
    });

    it('clamps zoom to minimum value', () => {
      let overview = applyOverviewAction(DEFAULT_OVERVIEW_STATE, {
        type: 'TOGGLE',
        canActivate: true,
      });

      // Try to zoom out way beyond minimum
      overview = applyOverviewAction(overview, { type: 'ZOOM', zoomDelta: -10 });

      expect(overview.zoom).toBe(OVERVIEW_CONFIG.minZoom);
    });

    it('clamps zoom to maximum value', () => {
      let overview = applyOverviewAction(DEFAULT_OVERVIEW_STATE, {
        type: 'TOGGLE',
        canActivate: true,
      });

      // Try to zoom in way beyond maximum
      overview = applyOverviewAction(overview, { type: 'ZOOM', zoomDelta: 10 });

      expect(overview.zoom).toBe(OVERVIEW_CONFIG.maxZoom);
    });

    it('does not zoom when overview is not active', () => {
      const overview = applyOverviewAction(DEFAULT_OVERVIEW_STATE, {
        type: 'ZOOM',
        zoomDelta: 0.5,
      });

      expect(overview.zoom).toBe(DEFAULT_OVERVIEW_STATE.zoom);
      expect(overview.active).toBe(false);
    });
  });
});
