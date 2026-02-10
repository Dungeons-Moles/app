import type { GameMap, MapPOI } from '../../src/game/map/types';
import { FogState, TileType } from '../../src/game/map/types';
import { canFastTravel, getDiscoveredWaypoints } from '../../src/game/entities/pois';

function createMap(pois: MapPOI[], fogOverrides?: { x: number; y: number; state: FogState }[]): GameMap {
  const width = 3;
  const height = 3;
  const tiles = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => TileType.Floor)
  );
  const fog = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => FogState.Visible)
  );
  for (const o of fogOverrides ?? []) {
    fog[o.y][o.x] = o.state;
  }

  return {
    width,
    height,
    tiles,
    fog,
    enemies: [],
    pois,
    moleDenPosition: { x: 0, y: 0 },
  };
}

describe('Fast Travel', () => {
  it('filters to discovered rail waypoints', () => {
    const pois: MapPOI[] = [
      {
        id: 'wp-1',
        definitionId: 'L8',
        position: { x: 0, y: 0 },
        visited: true,
        discovered: true,
      },
      {
        id: 'wp-2',
        definitionId: 'L8',
        position: { x: 1, y: 1 },
        visited: true,
        discovered: false,
      },
      {
        id: 'wp-3',
        definitionId: 'L8',
        position: { x: 2, y: 2 },
        visited: true,
        discovered: true,
      },
      {
        id: 'cache-1',
        definitionId: 'L2',
        position: { x: 1, y: 2 },
        visited: true,
        discovered: true,
      },
    ];

    const discovered = getDiscoveredWaypoints(
      createMap(pois, [{ x: 1, y: 1, state: FogState.Hidden }])
    );

    expect(discovered.map((poi) => poi.id)).toEqual(['wp-1', 'wp-3']);
  });

  it('requires at least two discovered waypoints', () => {
    const oneWaypoint = createMap([
      {
        id: 'wp-1',
        definitionId: 'L8',
        position: { x: 0, y: 0 },
        visited: true,
        discovered: true,
      },
    ]);
    const twoWaypoints = createMap([
      {
        id: 'wp-1',
        definitionId: 'L8',
        position: { x: 0, y: 0 },
        visited: true,
        discovered: true,
      },
      {
        id: 'wp-2',
        definitionId: 'L8',
        position: { x: 1, y: 1 },
        visited: true,
        discovered: true,
      },
    ]);

    expect(canFastTravel(oneWaypoint)).toBe(false);
    expect(canFastTravel(twoWaypoints)).toBe(true);
  });
});
