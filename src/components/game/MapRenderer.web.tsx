/**
 * MapRenderer - Web fallback without Skia.
 */

import React, { useMemo, useCallback, useRef, memo } from 'react';
import { View, StyleSheet, LayoutChangeEvent, Text, PanResponder, Image } from 'react-native';
import type { Position, WallHighlightState } from '../../game/engine/types';
import { TimePhase } from '../../game/engine/types';
import type { GameMap, MapEnemy } from '../../game/map/types';
import { TileType, FogState } from '../../game/map/types';
import { getPOIDefinition } from '../../data/pois';
import type { OverviewModeState } from '../../contexts/GameContext';
import { DEFAULT_OVERVIEW_STATE } from '../../contexts/GameContext';
import { WallHighlight } from './WallHighlight';

// ============================================================================
// Constants
// ============================================================================

const TILE_SIZE = 32;
const ENTITY_SIZE = 40;
const ENTITY_OFFSET = (ENTITY_SIZE - TILE_SIZE) / 2;
const BUFFER_TILES = 2;
const STROKE_WIDTH = 3;

// Tile colors - simplified: one color for floor, black for wall (fallback)
const TILE_COLORS = {
  [TileType.Floor]: '#795040', // Brown corridor
  [TileType.Wall]: '#000000', // Black environment
} as const;

const FOG_COLOR_HIDDEN = '#000000';
const FOG_COLOR_REVEALED = 'rgba(0, 0, 0, 0.35)';

// Tile images
const floorImageSource = require('../../../assets/map/floor.png');
const rockImageSource = require('../../../assets/map/rock.png');
const defaultMoleImageSource = require('../../../assets/characters/default-mole.png');

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
  overviewMode?: OverviewModeState;
  onPanOverview?: (delta: Position) => void;
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
  centerPos: Position,
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
    startX: Math.max(0, Math.floor(centerPos.x - halfTilesX)),
    endX: Math.min(mapWidth - 1, Math.ceil(centerPos.x + halfTilesX)),
    startY: Math.max(0, Math.floor(centerPos.y - halfTilesY)),
    endY: Math.min(mapHeight - 1, Math.ceil(centerPos.y + halfTilesY)),
  };
}

function getCameraOffset(
  centerPos: Position,
  viewportWidth: number,
  viewportHeight: number,
  zoom: number
): { x: number; y: number } {
  const centerWorldX = centerPos.x * TILE_SIZE + TILE_SIZE / 2;
  const centerWorldY = centerPos.y * TILE_SIZE + TILE_SIZE / 2;

  return {
    x: viewportWidth / 2 - centerWorldX * zoom,
    y: viewportHeight / 2 - centerWorldY * zoom,
  };
}

// ============================================================================
// Memoized Render Components
// ============================================================================

const TileView = memo(function TileView({
  x,
  y,
  type,
  fog,
  showRevealOverlay,
}: TileData & { showRevealOverlay: boolean }) {
  const screenX = x * TILE_SIZE;
  const screenY = y * TILE_SIZE;
  const tileImage = type === TileType.Floor ? floorImageSource : rockImageSource;

  if (fog === FogState.Hidden) {
    return (
      <View
        style={[
          styles.tile,
          {
            left: screenX,
            top: screenY,
            backgroundColor: FOG_COLOR_HIDDEN,
          },
        ]}
      />
    );
  }

  if (fog === FogState.Revealed && showRevealOverlay) {
    return (
      <View
        style={[
          styles.tile,
          {
            left: screenX,
            top: screenY,
          },
        ]}
      >
        <Image source={tileImage} style={styles.tileImage} />
        <View style={styles.tileFog} />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.tile,
        {
          left: screenX,
          top: screenY,
        },
      ]}
    >
      <Image source={tileImage} style={styles.tileImage} />
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
  image,
  colors,
  textColor,
  opacity,
}: {
  x: number;
  y: number;
  emoji?: string;
  image?: any;
  colors: { fill: string; stroke: string };
  textColor?: string;
  opacity?: number;
}) {
  const screenX = x * TILE_SIZE - ENTITY_OFFSET;
  const screenY = y * TILE_SIZE - ENTITY_OFFSET;

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
      {image ? (
        <Image source={image} style={styles.entityImage} resizeMode="contain" />
      ) : (
        <Text style={[styles.entityEmoji, textColor && { color: textColor }]}>{emoji}</Text>
      )}
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
  overviewMode,
  onPanOverview,
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

  const overview = overviewMode ?? DEFAULT_OVERVIEW_STATE;
  const zoom = overview.active ? overview.zoom : 1;
  const cameraCenter = useMemo(
    () => ({
      x: playerPosition.x + (overview.active ? overview.offset.x : 0),
      y: playerPosition.y + (overview.active ? overview.offset.y : 0),
    }),
    [playerPosition.x, playerPosition.y, overview.active, overview.offset.x, overview.offset.y]
  );

  const scaledWidth = width / zoom;
  const scaledHeight = height / zoom;

  const visibleRange = useMemo(
    () => getVisibleTileRange(cameraCenter, scaledWidth, scaledHeight, map.width, map.height),
    [cameraCenter, scaledWidth, scaledHeight, map.width, map.height]
  );

  const cameraOffset = useMemo(
    () => getCameraOffset(cameraCenter, width, height, zoom),
    [cameraCenter, width, height, zoom]
  );
  const cameraTransform = useMemo(
    () => [{ scale: zoom }, { translateX: cameraOffset.x }, { translateY: cameraOffset.y }],
    [zoom, cameraOffset.x, cameraOffset.y]
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

  const visiblePOIs = useMemo(() => {
    return map.pois.filter(
      (poi) =>
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
      .filter(
        (entry): entry is { enemy: MapEnemy; variant: 'known' | 'unknown' } => entry !== null
      );
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

  const panOffsetRef = useRef({ x: 0, y: 0 });
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => overview.active,
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          overview.active && (Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2),
        onPanResponderGrant: () => {
          panOffsetRef.current = { x: 0, y: 0 };
        },
        onPanResponderMove: (_event, gestureState) => {
          if (!overview.active || !onPanOverview) {
            return;
          }
          const deltaX = (gestureState.dx - panOffsetRef.current.x) / (TILE_SIZE * zoom);
          const deltaY = (gestureState.dy - panOffsetRef.current.y) / (TILE_SIZE * zoom);
          panOffsetRef.current = { x: gestureState.dx, y: gestureState.dy };
          if (deltaX === 0 && deltaY === 0) {
            return;
          }
          onPanOverview({ x: -deltaX, y: -deltaY });
        },
        onPanResponderRelease: () => {
          panOffsetRef.current = { x: 0, y: 0 };
        },
        onPanResponderTerminate: () => {
          panOffsetRef.current = { x: 0, y: 0 };
        },
      }),
    [overview.active, onPanOverview, zoom]
  );

  return (
    <View style={styles.container} onLayout={handleLayout} {...panResponder.panHandlers}>
      <View style={[styles.tileLayer, { transform: cameraTransform }]}>
        {visibleTiles.map((tile) => (
          <TileView
            key={`tile-${tile.x}-${tile.y}`}
            x={tile.x}
            y={tile.y}
            type={tile.type}
            fog={tile.fog}
            showRevealOverlay={showRevealOverlay}
          />
        ))}
      </View>

      {/* Layered View for Entities */}
      <View style={styles.entityOverlay} pointerEvents="none">
        <View style={[styles.entityLayer, { transform: cameraTransform }]}>
          {wallHighlight && highlightVisible && (
            <WallHighlight
              position={wallHighlight.targetPosition}
              cost={wallHighlight.cost}
              tileSize={TILE_SIZE}
              cameraOffset={{ x: 0, y: 0 }}
            />
          )}

          {/* 1. POIs */}
          {visiblePOIs.map((poi) => {
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
              />
            );
          })}

          {/* 2. Enemies */}
          {visibleEnemies.map((entry) => {
            const { enemy, variant } = entry;
            const isUnknown = variant === 'unknown';
            return (
              <EntityView
                key={`enemy-${enemy.id}`}
                x={enemy.position.x}
                y={enemy.position.y}
                emoji={isUnknown ? '?' : ENEMY_EMOJIS[enemy.definitionId] || '👾'}
                colors={isUnknown ? ENEMY_UNKNOWN_COLORS : ENEMY_COLORS}
                textColor={isUnknown ? '#ffffff' : undefined}
              />
            );
          })}

          {/* 3. Player (Topmost) */}
          <EntityView
            x={playerPosition.x}
            y={playerPosition.y}
            image={defaultMoleImageSource}
            colors={PLAYER_COLORS}
          />
        </View>
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
    position: 'relative',
  },
  tileLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  tile: {
    position: 'absolute',
    width: TILE_SIZE,
    height: TILE_SIZE,
  },
  tileImage: {
    width: TILE_SIZE,
    height: TILE_SIZE,
  },
  tileFog: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: FOG_COLOR_REVEALED,
  },
  entityOverlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  entityLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  entityContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 2,
  },
  entityEmoji: {
    fontSize: 22,
    textAlign: 'center',
  },
  entityImage: {
    width: '90%',
    height: '90%',
  },
});
