/**
 * MapRenderer - Renders the dungeon map using Skia
 * @see specs/001-pve-dungeon-crawler/research.md R5
 */

import React, { useMemo, useCallback } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Canvas, Rect, Text as SkiaText, useFont, Group } from '@shopify/react-native-skia';
import type { Position } from '../../game/engine/types';
import type { GameMap } from '../../game/map/types';
import { TileType, FogState } from '../../game/map/types';

// ============================================================================
// Constants
// ============================================================================

const TILE_SIZE = 24;
const BUFFER_TILES = 2;

// Tile colors
const TILE_COLORS = {
  [TileType.Wall]: '#1a1a1a',
  [TileType.EmptyTunnel]: '#3a3a3a',
  [TileType.SoftEarth]: '#5a4a3a',
  [TileType.HardRock]: '#4a4a5a',
};

const FOG_COLORS = {
  [FogState.Hidden]: '#000000',
  [FogState.Revealed]: 'rgba(0, 0, 0, 0.5)',
  [FogState.Visible]: 'transparent',
};

// Emoji representations
const ENTITY_EMOJIS = {
  player: '🦦',
  moleDen: '🏠',
  supplyCache: '📦',
  toolCrate: '🧰',
  enemy: '👾',
};

// ============================================================================
// Types
// ============================================================================

export interface MapRendererProps {
  map: GameMap;
  playerPosition: Position;
  width?: number;
  height?: number;
}

interface VisibleTileRange {
  startX: number;
  endX: number;
  startY: number;
  endY: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate which tiles are visible in the viewport.
 * Implements viewport culling for performance.
 */
function getVisibleTileRange(
  playerPos: Position,
  viewportWidth: number,
  viewportHeight: number,
  mapWidth: number,
  mapHeight: number
): VisibleTileRange {
  const tilesX = Math.ceil(viewportWidth / TILE_SIZE) + BUFFER_TILES * 2;
  const tilesY = Math.ceil(viewportHeight / TILE_SIZE) + BUFFER_TILES * 2;

  const halfTilesX = Math.floor(tilesX / 2);
  const halfTilesY = Math.floor(tilesY / 2);

  return {
    startX: Math.max(0, playerPos.x - halfTilesX),
    endX: Math.min(mapWidth - 1, playerPos.x + halfTilesX),
    startY: Math.max(0, playerPos.y - halfTilesY),
    endY: Math.min(mapHeight - 1, playerPos.y + halfTilesY),
  };
}

/**
 * Calculate camera offset to center on player.
 */
function getCameraOffset(
  playerPos: Position,
  viewportWidth: number,
  viewportHeight: number
): { x: number; y: number } {
  return {
    x: viewportWidth / 2 - playerPos.x * TILE_SIZE - TILE_SIZE / 2,
    y: viewportHeight / 2 - playerPos.y * TILE_SIZE - TILE_SIZE / 2,
  };
}

/**
 * Get POI emoji for rendering.
 */
function getPOIEmoji(definitionId: string): string {
  switch (definitionId) {
    case 'L1': return '🏠'; // Mole Den
    case 'L2': return '📦'; // Supply Cache
    case 'L3': return '🧰'; // Tool Crate
    case 'L4': return '🛢️'; // Tool Oil Rack
    case 'L5': return '🕯️'; // Rest Alcove
    case 'L6': return '📡'; // Survey Beacon
    case 'L7': return '📍'; // Seismic Scanner
    case 'L8': return '🚇'; // Rail Waypoint
    case 'L9': return '🕳️'; // Smuggler Hatch
    case 'L10': return '⚒️'; // Rusty Anvil
    case 'L11': return '🗿'; // Crusher Golem
    case 'L12': return '💠'; // Geode Vault
    default: return '❓';
  }
}

/**
 * Get enemy emoji based on type.
 */
function getEnemyEmoji(definitionId: string): string {
  switch (definitionId) {
    case 'TUNNEL_RAT': return '🐀';
    case 'CAVE_BAT': return '🦇';
    case 'SPORE_SLIME': return '🟢';
    case 'RUST_MITE_SWARM': return '🐜';
    case 'COLLAPSED_MINER': return '🧟';
    case 'SHARD_BEETLE': return '🪲';
    case 'TUNNEL_WARDEN': return '🦀';
    case 'BURROW_AMBUSHER': return '🦂';
    default: return '👾';
  }
}

// ============================================================================
// Component
// ============================================================================

export function MapRenderer({
  map,
  playerPosition,
  width: propWidth,
  height: propHeight,
}: MapRendererProps) {
  const [dimensions, setDimensions] = React.useState({
    width: propWidth || 300,
    height: propHeight || 300,
  });

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setDimensions({ width, height });
  }, []);

  const { width, height } = dimensions;

  // Calculate visible tile range (viewport culling)
  const visibleRange = useMemo(
    () => getVisibleTileRange(
      playerPosition,
      width,
      height,
      map.width,
      map.height
    ),
    [playerPosition.x, playerPosition.y, width, height, map.width, map.height]
  );

  // Calculate camera offset to center on player
  const cameraOffset = useMemo(
    () => getCameraOffset(playerPosition, width, height),
    [playerPosition.x, playerPosition.y, width, height]
  );

  // Collect visible tiles
  const visibleTiles = useMemo(() => {
    const tiles: Array<{
      x: number;
      y: number;
      type: TileType;
      fog: FogState;
    }> = [];

    for (let y = visibleRange.startY; y <= visibleRange.endY; y++) {
      for (let x = visibleRange.startX; x <= visibleRange.endX; x++) {
        tiles.push({
          x,
          y,
          type: map.tiles[y][x],
          fog: map.fog[y][x],
        });
      }
    }

    return tiles;
  }, [visibleRange, map.tiles, map.fog]);

  // Collect visible POIs
  const visiblePOIs = useMemo(() => {
    return map.pois.filter(
      poi =>
        poi.position.x >= visibleRange.startX &&
        poi.position.x <= visibleRange.endX &&
        poi.position.y >= visibleRange.startY &&
        poi.position.y <= visibleRange.endY &&
        map.fog[poi.position.y][poi.position.x] !== FogState.Hidden
    );
  }, [map.pois, visibleRange, map.fog]);

  // Collect visible enemies
  const visibleEnemies = useMemo(() => {
    return map.enemies.filter(
      enemy =>
        enemy.position.x >= visibleRange.startX &&
        enemy.position.x <= visibleRange.endX &&
        enemy.position.y >= visibleRange.startY &&
        enemy.position.y <= visibleRange.endY &&
        map.fog[enemy.position.y][enemy.position.x] === FogState.Visible
    );
  }, [map.enemies, visibleRange, map.fog]);

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <Canvas style={{ width, height }}>
        <Group transform={[{ translateX: cameraOffset.x }, { translateY: cameraOffset.y }]}>
          {/* Render tiles */}
          {visibleTiles.map(tile => {
            const screenX = tile.x * TILE_SIZE;
            const screenY = tile.y * TILE_SIZE;

            // Only render if not completely hidden
            if (tile.fog === FogState.Hidden) {
              return (
                <Rect
                  key={`tile-${tile.x}-${tile.y}`}
                  x={screenX}
                  y={screenY}
                  width={TILE_SIZE}
                  height={TILE_SIZE}
                  color={FOG_COLORS[FogState.Hidden]}
                />
              );
            }

            return (
              <Group key={`tile-${tile.x}-${tile.y}`}>
                {/* Base tile */}
                <Rect
                  x={screenX}
                  y={screenY}
                  width={TILE_SIZE}
                  height={TILE_SIZE}
                  color={TILE_COLORS[tile.type]}
                />
                {/* Fog overlay for revealed but not visible */}
                {tile.fog === FogState.Revealed && (
                  <Rect
                    x={screenX}
                    y={screenY}
                    width={TILE_SIZE}
                    height={TILE_SIZE}
                    color="rgba(0, 0, 0, 0.5)"
                  />
                )}
              </Group>
            );
          })}

          {/* Render POIs (using simple colored squares as placeholder) */}
          {visiblePOIs.map(poi => {
            const screenX = poi.position.x * TILE_SIZE + 2;
            const screenY = poi.position.y * TILE_SIZE + 2;
            const size = TILE_SIZE - 4;

            return (
              <Rect
                key={`poi-${poi.id}`}
                x={screenX}
                y={screenY}
                width={size}
                height={size}
                color="#66aaff"
              />
            );
          })}

          {/* Render enemies (using red squares as placeholder) */}
          {visibleEnemies.map(enemy => {
            const screenX = enemy.position.x * TILE_SIZE + 4;
            const screenY = enemy.position.y * TILE_SIZE + 4;
            const size = TILE_SIZE - 8;

            return (
              <Rect
                key={`enemy-${enemy.id}`}
                x={screenX}
                y={screenY}
                width={size}
                height={size}
                color="#ff6666"
              />
            );
          })}

          {/* Render player (using green square as placeholder) */}
          <Rect
            x={playerPosition.x * TILE_SIZE + 2}
            y={playerPosition.y * TILE_SIZE + 2}
            width={TILE_SIZE - 4}
            height={TILE_SIZE - 4}
            color="#66ff66"
          />
        </Group>
      </Canvas>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
