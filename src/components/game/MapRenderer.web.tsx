/**
 * MapRenderer - Web fallback without Skia.
 */

import React, { useMemo, useCallback, useRef, memo } from 'react';
import { View, StyleSheet, LayoutChangeEvent, PanResponder } from 'react-native';
import { Image } from 'expo-image';
import type { Position, WallHighlightState } from '../../game/engine/types';
import { TimePhase } from '../../game/engine/types';
import type { GameMap, MapEnemy } from '../../game/map/types';
import { TileType, FogState } from '../../game/map/types';
import type { OverviewModeState } from '../../contexts/GameContext';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';
import { DEFAULT_OVERVIEW_STATE } from '../../contexts/GameContext';
import { WallHighlight } from './WallHighlight';
import { getEntityImageSource } from './entityImages';

// ============================================================================
// Constants
// ============================================================================

const TILE_SIZE = 32;
const ENTITY_SIZE = 40;
const ENTITY_OFFSET = (ENTITY_SIZE - TILE_SIZE) / 2;
const BUFFER_TILES = 2;

const SINGLE_USE_POIS = ['L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L12', 'L13'];

// Tile colors - simplified: one color for floor, black for wall (fallback)
const TILE_COLORS = {
  [TileType.Floor]: '#795040', // Brown corridor
  [TileType.Wall]: '#000000', // Black environment
  [TileType.Unknown]: '#111111', // Hidden/private tiles
} as const;

const FOG_COLOR_HIDDEN = 'transparent';
const FOG_COLOR_REVEALED = 'rgba(0, 0, 0, 0.35)';

// Tile images
const floorV1Source = require('../../../assets/world/tiles/floor-v1.webp');
const floorV2Source = require('../../../assets/world/tiles/floor-v2.webp');
const floorV3Source = require('../../../assets/world/tiles/floor-v3.webp');
const floorV4Source = require('../../../assets/world/tiles/floor-v4.webp');
const floorV5Source = require('../../../assets/world/tiles/floor-v5.webp');
const floorImages = [floorV1Source, floorV2Source, floorV3Source, floorV4Source, floorV5Source];
const rockV1Source = require('../../../assets/world/tiles/rock-v1.webp');
const rockV2Source = require('../../../assets/world/tiles/rock-v2.webp');
const rockV3Source = require('../../../assets/world/tiles/rock-v3.webp');
const rockV4Source = require('../../../assets/world/tiles/rock-v4.webp');
const rockImages = [rockV1Source, rockV2Source, rockV3Source, rockV4Source];
const defaultMoleImageSource = require('../../../assets/entities/characters/default-mole.webp');
const unknownEnemyImageSource = require('../../../assets/world/markers/question-mark.webp');

// ============================================================================
// Types
// ============================================================================

export interface MapRendererProps {
  map: GameMap;
  playerPosition: Position;
  playerFacing?: 'left' | 'right';
  timePhase: TimePhase;
  wallHighlight?: WallHighlightState;
  width?: number;
  height?: number;
  overviewMode?: OverviewModeState;
  onPanOverview?: (delta: Position) => void;
  onZoomOverview?: (zoomDelta: number) => void;
  cameraFocusOverride?: Position;
  playerSkinSource?: import('expo-image').ImageSource;
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
}: TileData & {
  showRevealOverlay: boolean;
}) {
  const screenX = x * TILE_SIZE;
  const screenY = y * TILE_SIZE;
  const size = TILE_SIZE;

  const variation = Math.abs(x * 7 + y * 13);
  let tileImage;
  if (type === TileType.Floor) {
    tileImage = floorImages[variation % floorImages.length];
  } else {
    tileImage = rockImages[variation % rockImages.length];
  }

  if (fog === FogState.Hidden || type === TileType.Unknown) {
    return (
      <View
        style={[
          styles.tile,
          {
            left: screenX,
            top: screenY,
            width: size,
            height: size,
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
            width: size,
            height: size,
          },
        ]}
      >
        <Image source={tileImage} style={[styles.tileImage, { width: size, height: size }]} />
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
          width: size,
          height: size,
        },
      ]}
    >
      <Image source={tileImage} style={[styles.tileImage, { width: size, height: size }]} />
    </View>
  );
});

/**
 * Entity renderer that combines the colored square background with an emoji on top.
 */
const EntityView = memo(function EntityView({
  x,
  y,
  image,
  opacity,
  flipX = false,
  grayscale = false,
  yOffset = 0,
}: {
  x: number;
  y: number;
  image?: any;
  opacity?: number;
  flipX?: boolean;
  grayscale?: boolean;
  yOffset?: number;
}) {
  const size = ENTITY_SIZE;
  const offset = ENTITY_OFFSET;
  const screenX = x * TILE_SIZE - offset;
  const screenY = y * TILE_SIZE - offset - yOffset;

  const transform = [];
  if (flipX) transform.push({ scaleX: -1 });

  return (
    <View
      style={[
        styles.entityContainer,
        {
          left: screenX,
          top: screenY,
          width: size,
          height: size,
          opacity,
          transform,
          // @ts-ignore - grayscale filter for web
          filter: grayscale ? 'grayscale(100%)' : 'none',
        },
      ]}
    >
      {image && <Image source={image} style={styles.entityImage} contentFit="contain" />}
    </View>
  );
});

// ============================================================================
// Component
// ============================================================================

export const MapRenderer = memo(function MapRenderer({
  map,
  playerPosition,
  playerFacing = 'right',
  timePhase,
  wallHighlight,
  width: propWidth,
  height: propHeight,
  overviewMode,
  onPanOverview,
  onZoomOverview,
  cameraFocusOverride,
  playerSkinSource,
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

  // T142: Calculate dynamic zoom to show tiles above/below player
  const variant = useScreenVariant();
  const targetVerticalTiles = variant === 'compact' ? 9 : 7;
  const baseDynamicZoom = height / (targetVerticalTiles * TILE_SIZE);
  const dynamicZoom = variant === 'compact' ? baseDynamicZoom : baseDynamicZoom * 1.11;
  const overviewZoom = variant === 'compact' ? overview.zoom * 2 : overview.zoom;
  const zoom = overview.active ? overviewZoom : dynamicZoom;

  const cameraFocus = cameraFocusOverride ?? playerPosition;
  const cameraCenter = useMemo(
    () => ({
      x: cameraFocus.x + (overview.active ? overview.offset.x : 0),
      y: cameraFocus.y + (overview.active ? overview.offset.y : 0),
    }),
    [cameraFocus.x, cameraFocus.y, overview.active, overview.offset.x, overview.offset.y]
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
    () => [{ translateX: cameraOffset.x }, { translateY: cameraOffset.y }],
    [cameraOffset.x, cameraOffset.y]
  );
  const cameraScaleTransform = useMemo(() => [{ scale: zoom }], [zoom]);

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
        const isRevealed = fog === FogState.Revealed;

        if (isNight) {
          // At night: show all enemies on non-hidden tiles
          // - Visible tiles (in sight range): show actual enemy
          // - Revealed tiles (outside sight range): show question mark
          if (isVisible) {
            return { enemy, variant: 'known' as const };
          } else if (isRevealed) {
            return { enemy, variant: 'unknown' as const };
          }
          return null;
        } else {
          // During day: only show discovered or visible enemies
          const isKnown = enemy.discovered || isVisible;
          if (!isKnown) {
            return null;
          }
          return { enemy, variant: 'known' as const };
        }
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
  const pinchDistanceRef = useRef<number | null>(null);

  const getDistance = useCallback((touches: { pageX: number; pageY: number }[]) => {
    if (touches.length < 2) return null;
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => overview.active,
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          overview.active && (Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2),
        onPanResponderGrant: (event) => {
          panOffsetRef.current = { x: 0, y: 0 };
          const touches = event.nativeEvent.touches;
          if (touches && touches.length >= 2) {
            pinchDistanceRef.current = getDistance(
              touches as unknown as { pageX: number; pageY: number }[]
            );
          } else {
            pinchDistanceRef.current = null;
          }
        },
        onPanResponderMove: (event, gestureState) => {
          if (!overview.active) {
            return;
          }

          const touches = event.nativeEvent.touches;

          // Handle pinch zoom (two fingers)
          if (touches && touches.length >= 2 && onZoomOverview) {
            const currentDistance = getDistance(
              touches as unknown as { pageX: number; pageY: number }[]
            );
            if (currentDistance !== null && pinchDistanceRef.current !== null) {
              const zoomDelta = (currentDistance - pinchDistanceRef.current) / 200;
              if (Math.abs(zoomDelta) > 0.01) {
                onZoomOverview(zoomDelta);
                pinchDistanceRef.current = currentDistance;
              }
            } else {
              pinchDistanceRef.current = currentDistance;
            }
            return;
          }

          // Handle single finger pan
          if (!onPanOverview) {
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
          pinchDistanceRef.current = null;
        },
        onPanResponderTerminate: () => {
          panOffsetRef.current = { x: 0, y: 0 };
          pinchDistanceRef.current = null;
        },
      }),
    [overview.active, onPanOverview, onZoomOverview, zoom, getDistance]
  );

  return (
    <View style={styles.container} onLayout={handleLayout} {...panResponder.panHandlers}>
      <View style={styles.tileLayer}>
        <View style={[styles.cameraTranslateLayer, { transform: cameraTransform }]}>
          <View style={[styles.cameraScaleLayer, { transform: cameraScaleTransform }]}>
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
        </View>
      </View>

      {/* Layered View for Entities */}
      <View style={styles.entityOverlay} pointerEvents="none">
        <View style={styles.entityLayer}>
          {wallHighlight && highlightVisible && (
            <WallHighlight
              position={wallHighlight.targetPosition}
              cost={wallHighlight.cost}
              tileSize={TILE_SIZE * zoom}
              cameraOffset={cameraOffset}
            />
          )}

          <View style={[styles.cameraTranslateLayer, { transform: cameraTransform }]}>
            <View style={[styles.cameraScaleLayer, { transform: cameraScaleTransform }]}>
              {/* 1. POIs */}
              {visiblePOIs.map((poi) => {
                const isUsed = poi.visited && SINGLE_USE_POIS.includes(poi.definitionId);
                const isUnusableDay = poi.definitionId === 'L5' && !isNight;
                const shouldBeGray = isUsed || isUnusableDay;

                const fog = map.fog[poi.position.y][poi.position.x];
                const dimmed = isNight && fog === FogState.Revealed;
                return (
                  <EntityView
                    key={`poi-${poi.id}`}
                    x={poi.position.x}
                    y={poi.position.y}
                    image={getEntityImageSource(poi.definitionId)}
                    opacity={dimmed ? 0.6 : 1}
                    grayscale={shouldBeGray}
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
                    image={
                      isUnknown ? unknownEnemyImageSource : getEntityImageSource(enemy.definitionId)
                    }
                  />
                );
              })}

              {/* 3. Player (Topmost) */}
              <EntityView
                x={playerPosition.x}
                y={playerPosition.y}
                image={playerSkinSource ?? defaultMoleImageSource}
                flipX={playerFacing === 'left'}
                yOffset={4}
              />
            </View>
          </View>
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
    backgroundColor: 'transparent',
    position: 'relative',
  },
  tileLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  cameraTranslateLayer: {
    ...StyleSheet.absoluteFillObject,
    transformOrigin: '0 0',
  },
  cameraScaleLayer: {
    ...StyleSheet.absoluteFillObject,
    transformOrigin: '0 0',
  },
  tile: {
    position: 'absolute',
    width: TILE_SIZE,
    height: TILE_SIZE,
  },
  tileImage: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    opacity: 0.7,
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
