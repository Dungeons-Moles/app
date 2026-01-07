/**
 * MapRenderer - Renders the dungeon map using Skia
 * @see specs/001-pve-dungeon-crawler/research.md R5
 * @see constitution.md P06: Mobile-First Performance (60 FPS)
 *
 * PERFORMANCE NOTES (T135/T136):
 * - Target: 60 FPS (16.67ms frame budget)
 * - Current optimizations:
 *   1. Viewport culling: Only tiles in visible range are rendered
 *   2. useMemo: Tile collection, POI/enemy filtering are memoized
 *   3. Skia Canvas: Hardware-accelerated rendering
 * - Potential bottlenecks identified:
 *   1. Tile array creation in useMemo (allocates new array each change)
 *   2. JSX mapping inside Canvas (creates React elements per frame)
 *   3. Group wrapper for fog overlay tiles (extra element per non-hidden tile)
 * - Recommended for future optimization if needed:
 *   1. Use Skia Path batching for same-color tiles
 *   2. Tile sprite atlas/caching for repeated tile types
 *   3. Consider imperative Skia drawing for hot paths
 */

import React, { useMemo, useCallback, memo } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Canvas, Rect, Group } from '@shopify/react-native-skia';
import type { Position } from '../../game/engine/types';
import type { GameMap } from '../../game/map/types';
import { TileType, FogState } from '../../game/map/types';

// ============================================================================
// Constants
// ============================================================================

const TILE_SIZE = 24;
const BUFFER_TILES = 2;

/**
 * Tile colors - using const assertion for type safety and potential
 * JIT optimization (V8 can inline these as constants).
 */
const TILE_COLORS = {
  [TileType.Wall]: '#1a1a1a',
  [TileType.EmptyTunnel]: '#3a3a3a',
  [TileType.SoftEarth]: '#5a4a3a',
  [TileType.HardRock]: '#4a4a5a',
} as const;

const FOG_COLOR_HIDDEN = '#000000';
const FOG_COLOR_REVEALED = 'rgba(0, 0, 0, 0.5)';

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

interface TileData {
  x: number;
  y: number;
  type: TileType;
  fog: FogState;
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

// ============================================================================
// Memoized Tile Components (T136: Performance Optimization)
// ============================================================================

/**
 * Memoized tile renderer - prevents re-creation of tile elements.
 * Uses React.memo with custom comparison for stable rendering.
 */
const TileRect = memo(function TileRect({
  x,
  y,
  type,
  fog,
}: TileData) {
  const screenX = x * TILE_SIZE;
  const screenY = y * TILE_SIZE;

  // Hidden tiles - just render black rectangle
  if (fog === FogState.Hidden) {
    return (
      <Rect
        x={screenX}
        y={screenY}
        width={TILE_SIZE}
        height={TILE_SIZE}
        color={FOG_COLOR_HIDDEN}
      />
    );
  }

  // Visible/Revealed tiles - render base tile + optional fog overlay
  // Using Group only when needed for fog overlay (Revealed state)
  if (fog === FogState.Revealed) {
    return (
      <Group>
        <Rect
          x={screenX}
          y={screenY}
          width={TILE_SIZE}
          height={TILE_SIZE}
          color={TILE_COLORS[type]}
        />
        <Rect
          x={screenX}
          y={screenY}
          width={TILE_SIZE}
          height={TILE_SIZE}
          color={FOG_COLOR_REVEALED}
        />
      </Group>
    );
  }

  // Fully visible - single rect, no Group wrapper
  return (
    <Rect
      x={screenX}
      y={screenY}
      width={TILE_SIZE}
      height={TILE_SIZE}
      color={TILE_COLORS[type]}
    />
  );
});

/**
 * Memoized entity renderer for POIs, enemies, and player.
 */
const EntityRect = memo(function EntityRect({
  x,
  y,
  color,
  padding = 2,
}: {
  x: number;
  y: number;
  color: string;
  padding?: number;
}) {
  return (
    <Rect
      x={x * TILE_SIZE + padding}
      y={y * TILE_SIZE + padding}
      width={TILE_SIZE - padding * 2}
      height={TILE_SIZE - padding * 2}
      color={color}
    />
  );
});

// ============================================================================
// Component
// ============================================================================

/**
 * MapRenderer - Main dungeon map rendering component
 *
 * T136 Performance Optimizations:
 * - Wrapped in React.memo for shallow prop comparison
 * - Uses memoized TileRect and EntityRect sub-components
 * - Viewport culling limits rendered tiles to visible area
 * - All computed values memoized with proper dependencies
 */
export const MapRenderer = memo(function MapRenderer({
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

  // Calculate visible tile range (viewport culling - T136)
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

  // Collect visible tiles - memoized array (T136: only re-creates when deps change)
  const visibleTiles = useMemo(() => {
    const tiles: TileData[] = [];

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

  // Collect visible POIs - filtered and memoized
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

  // Collect visible enemies - only show if tile is Visible (not Revealed)
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
          {/* Render tiles using memoized TileRect component (T136) */}
          {visibleTiles.map(tile => (
            <TileRect
              key={`tile-${tile.x}-${tile.y}`}
              x={tile.x}
              y={tile.y}
              type={tile.type}
              fog={tile.fog}
            />
          ))}

          {/* Render POIs using memoized EntityRect */}
          {visiblePOIs.map(poi => (
            <EntityRect
              key={`poi-${poi.id}`}
              x={poi.position.x}
              y={poi.position.y}
              color="#66aaff"
              padding={2}
            />
          ))}

          {/* Render enemies using memoized EntityRect */}
          {visibleEnemies.map(enemy => (
            <EntityRect
              key={`enemy-${enemy.id}`}
              x={enemy.position.x}
              y={enemy.position.y}
              color="#ff6666"
              padding={4}
            />
          ))}

          {/* Render player */}
          <EntityRect
            x={playerPosition.x}
            y={playerPosition.y}
            color="#66ff66"
            padding={2}
          />
        </Group>
      </Canvas>
    </View>
  );
});

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
