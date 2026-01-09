/**
 * MapRenderer - Renders the dungeon map using Skia
 * @see specs/001-pve-dungeon-crawler/research.md R5
 * @see constitution.md P06: Mobile-First Performance (60 FPS)
 */

import React, { useMemo, useCallback, memo } from 'react';
import { View, StyleSheet, LayoutChangeEvent, Text } from 'react-native';
import { Canvas, Rect, Group } from '@shopify/react-native-skia';
import type { Position, WallHighlightState } from '../../game/engine/types';
import { TimePhase } from '../../game/engine/types';
import type { GameMap, MapEnemy } from '../../game/map/types';
import { TileType, FogState } from '../../game/map/types';
import { getPOIDefinition } from '../../data/pois';
import { WallHighlight } from './WallHighlight';

// ============================================================================
// Constants
// ============================================================================

const TILE_SIZE = 24;
const ENTITY_SIZE = 30;
const ENTITY_OFFSET = (ENTITY_SIZE - TILE_SIZE) / 2;
const BUFFER_TILES = 2;
const STROKE_WIDTH = 3;

// Tile colors - simplified: one color for floor, black for wall
const TILE_COLORS = {
  [TileType.Floor]: '#795040', // Brown corridor
  [TileType.Wall]: '#000000',  // Black environment
} as const;

const FOG_COLOR_HIDDEN = '#000000';
const FOG_COLOR_REVEALED = 'rgba(0, 0, 0, 0.35)';

// Rock emoji for wall tiles
const WALL_EMOJI = '🪨';

// Player emoji per spec
const PLAYER_EMOJI = '🦦';

// Enemy emojis per spec Appendix A
const ENEMY_EMOJIS: Record<string, string> = {
  TUNNEL_RAT: '🐀',
  CAVE_BAT: '🦇',
  SPORE_SLIME: '🟢',
  RUST_MITE_SWARM: '🐜',
  COLLAPSED_MINER: '🧟',
  SHARD_BEETLE: '🪲',
  TUNNEL_WARDEN: '🦀',
  BURROW_AMBUSHER: '🦂',
};

// Entity Colors
const PLAYER_COLORS = {
  fill: '#6b21a8',
  stroke: '#d8b4fe',
};

const ENEMY_COLORS = {
  fill: '#991b1b',
  stroke: '#fca5a5',
};

const ENEMY_UNKNOWN_COLORS = {
  fill: '#000000',
  stroke: '#ffffff',
};

const POI_COLORS_ACTIVE = {
  fill: '#854d0e',
  stroke: '#fde047',
};

const POI_COLORS_VISITED = {
  fill: '#374151',
  stroke: '#9ca3af',
};

const SINGLE_USE_POIS = ['L2', 'L3', 'L6', 'L7', 'L12'];

// ============================================================================
// Types
// ============================================================================

export interface MapRendererProps {
  map: GameMap;
  playerPosition: Position;
  timePhase: TimePhase;
  wallHighlight?: WallHighlightState;
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
// Memoized Render Components
// ============================================================================

const TileRect = memo(function TileRect({
  x,
  y,
  type,
  fog,
  showRevealOverlay,
}: TileData & { showRevealOverlay: boolean }) {
  const screenX = x * TILE_SIZE;
  const screenY = y * TILE_SIZE;

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

  if (fog === FogState.Revealed && showRevealOverlay) {
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
 * Wall tile emoji overlay - renders rock emoji centered on wall tiles
 */
const WallEmojiView = memo(function WallEmojiView({
  x,
  y,
  cameraOffset,
  dimmed,
}: {
  x: number;
  y: number;
  cameraOffset: { x: number; y: number };
  dimmed: boolean;
}) {
  const screenX = x * TILE_SIZE + cameraOffset.x;
  const screenY = y * TILE_SIZE + cameraOffset.y;

  return (
    <View
      style={[
        styles.wallEmojiContainer,
        {
          left: screenX,
          top: screenY,
          width: TILE_SIZE,
          height: TILE_SIZE,
        },
        dimmed && styles.dimmedOverlay,
      ]}
    >
      <Text style={styles.wallEmoji}>{WALL_EMOJI}</Text>
    </View>
  );
});

/**
 * Entity renderer that combines the colored square background with an emoji on top.
 */
const EntityView = memo(function EntityView({
  x,
  y,
  emoji,
  colors,
  textColor,
  opacity,
  cameraOffset,
}: {
  x: number;
  y: number;
  emoji: string;
  colors: { fill: string; stroke: string };
  textColor?: string;
  opacity?: number;
  cameraOffset: { x: number; y: number };
}) {
  const screenX = x * TILE_SIZE + cameraOffset.x - ENTITY_OFFSET;
  const screenY = y * TILE_SIZE + cameraOffset.y - ENTITY_OFFSET;

  return (
    <View
      style={[
        styles.entityContainer,
        {
          left: screenX,
          top: screenY,
          width: ENTITY_SIZE,
          height: ENTITY_SIZE,
          backgroundColor: colors.fill,
          borderColor: colors.stroke,
          borderWidth: STROKE_WIDTH,
          opacity,
        },
      ]}
    >
      <Text style={[styles.entityEmoji, textColor && { color: textColor }]}>{emoji}</Text>
    </View>
  );
});

// ============================================================================
// Component
// ============================================================================

export const MapRenderer = memo(function MapRenderer({
  map,
  playerPosition,
  timePhase,
  wallHighlight,
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

  const visibleRange = useMemo(
    () => getVisibleTileRange(playerPosition, width, height, map.width, map.height),
    [playerPosition.x, playerPosition.y, width, height, map.width, map.height]
  );

  const cameraOffset = useMemo(
    () => getCameraOffset(playerPosition, width, height),
    [playerPosition.x, playerPosition.y, width, height]
  );

  const isNight = timePhase === TimePhase.Night;
  const showRevealOverlay = isNight;

  const visibleTiles = useMemo(() => {
    const tiles: TileData[] = [];
    for (let y = visibleRange.startY; y <= visibleRange.endY; y++) {
      for (let x = visibleRange.startX; x <= visibleRange.endX; x++) {
        tiles.push({ x, y, type: map.tiles[y][x], fog: map.fog[y][x] });
      }
    }
    return tiles;
  }, [visibleRange, map.tiles, map.fog]);

  // Get visible wall tiles for emoji overlay (only visible/revealed, not hidden)
  const visibleWallTiles = useMemo(() => {
    return visibleTiles.filter(
      tile => tile.type === TileType.Wall && tile.fog !== FogState.Hidden
    );
  }, [visibleTiles]);

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

  const visibleEnemies = useMemo(() => {
    return map.enemies
      .map((enemy) => {
        if (
          enemy.position.x < visibleRange.startX ||
          enemy.position.x > visibleRange.endX ||
          enemy.position.y < visibleRange.startY ||
          enemy.position.y > visibleRange.endY
        ) {
          return null;
        }

        const fog = map.fog[enemy.position.y][enemy.position.x];
        const isVisible = fog === FogState.Visible;
        const isKnown = enemy.discovered || isVisible;
        if (!isKnown) {
          return null;
        }

        if (isNight && !isVisible) {
          return { enemy, variant: 'unknown' as const };
        }

        return { enemy, variant: 'known' as const };
      })
      .filter((entry): entry is { enemy: MapEnemy; variant: 'known' | 'unknown' } => entry !== null);
  }, [map.enemies, map.fog, visibleRange, isNight]);

  const highlightVisible = useMemo(() => {
    if (!wallHighlight) {
      return false;
    }

    const { x, y } = wallHighlight.targetPosition;
    if (
      x < visibleRange.startX ||
      x > visibleRange.endX ||
      y < visibleRange.startY ||
      y > visibleRange.endY
    ) {
      return false;
    }

    return map.fog[y][x] !== FogState.Hidden;
  }, [wallHighlight, visibleRange, map.fog]);

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <Canvas style={{ width, height }}>
        <Group transform={[{ translateX: cameraOffset.x }, { translateY: cameraOffset.y }]}>
          {visibleTiles.map(tile => (
            <TileRect
              key={`tile-${tile.x}-${tile.y}`}
              x={tile.x}
              y={tile.y}
              type={tile.type}
              fog={tile.fog}
              showRevealOverlay={showRevealOverlay}
            />
          ))}
        </Group>
      </Canvas>

      {/* Layered View for Wall Emoji and Entities */}
      <View style={styles.entityOverlay} pointerEvents="none">
        {/* 0. Wall emoji (below entities) */}
        {visibleWallTiles.map(tile => (
          <WallEmojiView
            key={`wall-${tile.x}-${tile.y}`}
            x={tile.x}
            y={tile.y}
            cameraOffset={cameraOffset}
            dimmed={isNight && tile.fog === FogState.Revealed}
          />
        ))}

        {/* Wall highlight */}
        {wallHighlight && highlightVisible && (
          <WallHighlight
            position={wallHighlight.targetPosition}
            cost={wallHighlight.cost}
            tileSize={TILE_SIZE}
            cameraOffset={cameraOffset}
          />
        )}

        {/* 1. POIs */}
        {visiblePOIs.map(poi => {
          const def = getPOIDefinition(poi.definitionId);
          const isUsed = poi.visited && SINGLE_USE_POIS.includes(poi.definitionId);
          const colors = isUsed ? POI_COLORS_VISITED : POI_COLORS_ACTIVE;
          const fog = map.fog[poi.position.y][poi.position.x];
          const dimmed = isNight && fog === FogState.Revealed;
          return (
            <EntityView
              key={`poi-${poi.id}`}
              x={poi.position.x}
              y={poi.position.y}
              emoji={def.emoji}
              colors={colors}
              opacity={dimmed ? 0.6 : 1}
              cameraOffset={cameraOffset}
            />
          );
        })}

        {/* 2. Enemies */}
        {visibleEnemies.map((entry) => {
          if (!entry) {
            return null;
          }
          const { enemy, variant } = entry;
          const isUnknown = variant === 'unknown';
          return (
            <EntityView
              key={`enemy-${enemy.id}`}
              x={enemy.position.x}
              y={enemy.position.y}
              emoji={isUnknown ? '?' : (ENEMY_EMOJIS[enemy.definitionId] || '👾')}
              colors={isUnknown ? ENEMY_UNKNOWN_COLORS : ENEMY_COLORS}
              textColor={isUnknown ? '#ffffff' : undefined}
              cameraOffset={cameraOffset}
            />
          );
        })}

        {/* 3. Player (Topmost) */}
        <EntityView
          x={playerPosition.x}
          y={playerPosition.y}
          emoji={PLAYER_EMOJI}
          colors={PLAYER_COLORS}
          cameraOffset={cameraOffset}
        />
      </View>
    </View>
  );
});

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000', // Pure black background
  },
  entityOverlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  wallEmojiContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  wallEmoji: {
    fontSize: 14,
    textAlign: 'center',
  },
  dimmedOverlay: {
    opacity: 0.6,
  },
  entityContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 2,
  },
  entityEmoji: {
    fontSize: 16,
    textAlign: 'center',
  },
});
