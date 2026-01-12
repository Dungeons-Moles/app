import { gameReducer } from '../../src/game/engine/game-reducer';
import { createInitialGameState } from '../../src/game/engine/state-factory';
import { GamePhase, type Position } from '../../src/game/engine/types';
import type { MapPOI } from '../../src/game/map/types';

function createWaypoint(id: string, position: Position): MapPOI {
  return {
    id,
    definitionId: 'L8',
    position,
    visited: true,
    discovered: true,
  };
}

function createStateWithWaypoints(
  positions: Position[],
  playerIndex = 0,
  movesRemaining = 30
) {
  const base = createInitialGameState();
  const pois = positions.map((position, index) =>
    createWaypoint(`wp-${index + 1}`, position)
  );

  return {
    ...base,
    phase: GamePhase.Exploration,
    map: {
      ...base.map,
      pois,
    },
    player: {
      ...base.player,
      position: positions[playerIndex],
    },
    time: {
      ...base.time,
      movesRemaining,
    },
    fastTravel: null,
  };
}

describe('Fast Travel Integration', () => {
  it('teleports to the selected waypoint without consuming time', () => {
    const state = createStateWithWaypoints(
      [
        { x: 5, y: 5 },
        { x: 20, y: 20 },
      ],
      0,
      30
    );

    const activated = gameReducer(state, { type: 'ACTIVATE_FAST_TRAVEL' });
    const result = gameReducer(activated, { type: 'CONFIRM_FAST_TRAVEL' });

    expect(result.player.position).toEqual({ x: 20, y: 20 });
    expect(result.time.movesRemaining).toBe(30);
    expect(result.phase).toBe(GamePhase.Exploration);
    expect(result.fastTravel).toBeNull();
  });
});
