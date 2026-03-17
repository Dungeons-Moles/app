/**
 * MapRenderer - Renders the dungeon map using Skia
 * @see specs/001-pve-dungeon-crawler/research.md R5
 * @see constitution.md P06: Mobile-First Performance (60 FPS)
 */

import React, { useMemo, useCallback, useRef, memo } from 'react';
import { View, StyleSheet, LayoutChangeEvent, PanResponder } from 'react-native';
import { Canvas, Rect, Group, Image, useImage, ColorMatrix } from '@shopify/react-native-skia';
import type { Position, WallHighlightState } from '../../game/engine/types';
import { TimePhase } from '../../game/engine/types';
import type { GameMap, MapEnemy } from '../../game/map/types';
import { TileType, FogState } from '../../game/map/types';
import { getPOIDefinition } from '../../data/pois';
import type { OverviewModeState } from '../../contexts/GameContext';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';
import { DEFAULT_OVERVIEW_STATE } from '../../contexts/GameContext';
import { WallHighlight } from './WallHighlight';
import { useSkiaEntityImages } from '../../hooks/useEntityImages';

// ============================================================================
// Constants
// ============================================================================

const TILE_SIZE = 32;
const ENTITY_SIZE = 40;
const ENTITY_OFFSET = (ENTITY_SIZE - TILE_SIZE) / 2;
const BUFFER_TILES = 2;

// Tile colors - simplified: one color for floor, black for wall
const TILE_COLORS = {
  [TileType.Floor]: '#795040', // Brown corridor (fallback)
  [TileType.Wall]: '#000000', // Black environment (fallback)
  [TileType.Unknown]: '#111111', // Hidden/private tiles
} as const;

const FOG_COLOR_HIDDEN = 'transparent'; // Fully transparent to show parchment background
const FOG_COLOR_REVEALED = 'rgba(0, 0, 0, 0.35)';

const GRAYSCALE_MATRIX = [
  0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0, 0, 0, 0, 0,
  1, 0,
];

// Tile images
const floorV1Source = require('../../../assets/world/tiles/floor-v1.webp');
const floorV2Source = require('../../../assets/world/tiles/floor-v2.webp');
const floorV3Source = require('../../../assets/world/tiles/floor-v3.webp');
const floorV4Source = require('../../../assets/world/tiles/floor-v4.webp');
const floorV5Source = require('../../../assets/world/tiles/floor-v5.webp');
const rockV1Source = require('../../../assets/world/tiles/rock-v1.webp');
const rockV2Source = require('../../../assets/world/tiles/rock-v2.webp');
const rockV3Source = require('../../../assets/world/tiles/rock-v3.webp');
const rockV4Source = require('../../../assets/world/tiles/rock-v4.webp');

const SINGLE_USE_POIS = ['L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L12', 'L13'];

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
  playerSkinSource?: import('react-native').ImageSourcePropType;
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
  floorVariation: number;
  rockVariation: number;
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

interface TileRectProps {
  x: number;
  y: number;
  type: TileType;
  fog: FogState;
  showRevealOverlay: boolean;
  floorImage: ReturnType<typeof useImage>;
  rockImage: ReturnType<typeof useImage>;
  opacity?: number;
}

const TileRect = memo(function TileRect({
  x,
  y,
  type,
  fog,
  showRevealOverlay,
  floorImage,
  rockImage,
  opacity = 0.7, // More transparent to show background
}: TileRectProps) {
  const screenX = x * TILE_SIZE;
  const screenY = y * TILE_SIZE;
  const tileSize = TILE_SIZE;

  if (fog === FogState.Hidden || type === TileType.Unknown) {
    return (
      <Rect x={screenX} y={screenY} width={tileSize} height={tileSize} color={FOG_COLOR_HIDDEN} />
    );
  }

  const tileImage = type === TileType.Floor ? floorImage : rockImage;

  if (fog === FogState.Revealed && showRevealOverlay) {
    return (
      <Group opacity={opacity}>
        {tileImage ? (
          <Image
            image={tileImage}
            x={screenX}
            y={screenY}
            width={tileSize}
            height={tileSize}
            fit="cover"
          />
        ) : (
          <Rect
            x={screenX}
            y={screenY}
            width={tileSize}
            height={tileSize}
            color={TILE_COLORS[type]}
          />
        )}
        <Rect
          x={screenX}
          y={screenY}
          width={tileSize}
          height={tileSize}
          color={FOG_COLOR_REVEALED}
        />
      </Group>
    );
  }

  if (tileImage) {
    return (
      <Image
        image={tileImage}
        x={screenX}
        y={screenY}
        width={tileSize}
        height={tileSize}
        opacity={opacity}
        fit="cover"
      />
    );
  }

  return (
    <Rect
      x={screenX}
      y={screenY}
      width={tileSize}
      height={tileSize}
      color={TILE_COLORS[type]}
      opacity={opacity}
    />
  );
});

interface SkiaEntityProps {
  x: number;
  y: number;
  image?: any;
  opacity?: number;
  flipX?: boolean;
  grayscale?: boolean;
  yOffset?: number; // Added vertical offset
}

const SkiaEntity = memo(function SkiaEntity({
  x,
  y,
  image,
  opacity = 1,
  flipX = false,
  grayscale = false,
  yOffset = 0,
}: SkiaEntityProps) {
  const size = ENTITY_SIZE;
  const offset = ENTITY_OFFSET;
  const drawX = x * TILE_SIZE - offset;
  const drawY = y * TILE_SIZE - offset - yOffset;

  if (image) {
    const ImageComponent = (
      <Image
        image={image}
        x={drawX}
        y={drawY}
        width={size}
        height={size}
        opacity={opacity}
        fit="contain"
      >
        {grayscale && <ColorMatrix matrix={GRAYSCALE_MATRIX} />}
      </Image>
    );

    if (flipX) {
      return (
        <Group origin={{ x: drawX + size / 2, y: drawY + size / 2 }} transform={[{ scaleX: -1 }]}>
          {ImageComponent}
        </Group>
      );
    }
    return ImageComponent;
  }

  // No fallback: Do not render colored squares as per user request
  return null;
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
  // Load tile images
  const floorV1 = useImage(floorV1Source);
  const floorV2 = useImage(floorV2Source);
  const floorV3 = useImage(floorV3Source);
  const floorV4 = useImage(floorV4Source);
  const floorV5 = useImage(floorV5Source);
  const floorImages = useMemo(
    () => [floorV1, floorV2, floorV3, floorV4, floorV5],
    [floorV1, floorV2, floorV3, floorV4, floorV5]
  );

  const rockV1 = useImage(rockV1Source);
  const rockV2 = useImage(rockV2Source);
  const rockV3 = useImage(rockV3Source);
  const rockV4 = useImage(rockV4Source);
  const rockImages = useMemo(
    () => [rockV1, rockV2, rockV3, rockV4],
    [rockV1, rockV2, rockV3, rockV4]
  );

  const entityImages = useSkiaEntityImages(playerSkinSource);

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
  const cameraTranslateTransform = useMemo(
    () => [{ translateX: cameraOffset.x }, { translateY: cameraOffset.y }],
    [cameraOffset.x, cameraOffset.y]
  );
  const cameraScaleTransform = useMemo(() => [{ scale: zoom }], [zoom]);

  const isNight = timePhase === TimePhase.Night;
  const showRevealOverlay = isNight;

  const visibleTiles = useMemo(() => {
    const tiles: TileData[] = [];
    const floorCount = 5; // number of floor image variants
    const rockCount = 4;  // number of rock image variants
    for (let y = visibleRange.startY; y <= visibleRange.endY; y++) {
      for (let x = visibleRange.startX; x <= visibleRange.endX; x++) {
        const variation = Math.abs(x * 7 + y * 13);
        tiles.push({
          x,
          y,
          type: map.tiles[y][x],
          fog: map.fog[y][x],
          floorVariation: variation % floorCount,
          rockVariation: variation % rockCount,
        });
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
      <Canvas style={styles.canvas}>
        <Group origin={{ x: 0, y: 0 }} transform={cameraTranslateTransform}>
          <Group origin={{ x: 0, y: 0 }} transform={cameraScaleTransform}>
            {/* 1. Tiles */}
            {visibleTiles.map((tile) => (
              <TileRect
                key={`tile-${tile.x}-${tile.y}`}
                x={tile.x}
                y={tile.y}
                type={tile.type}
                fog={tile.fog}
                showRevealOverlay={showRevealOverlay}
                floorImage={floorImages[tile.floorVariation]}
                rockImage={rockImages[tile.rockVariation]}
              />
            ))}

            {/* 3. POIs */}
            {visiblePOIs.map((poi) => {
              const isUsed = poi.visited && SINGLE_USE_POIS.includes(poi.definitionId);
              const isUnusableDay = poi.definitionId === 'L5' && !isNight;
              const shouldBeGray = isUsed || isUnusableDay;

              const fog = map.fog[poi.position.y][poi.position.x];
              const dimmed = isNight && fog === FogState.Revealed;

              return (
                <SkiaEntity
                  key={`poi-${poi.id}`}
                  x={poi.position.x}
                  y={poi.position.y}
                  image={entityImages[poi.definitionId]}
                  opacity={dimmed ? 0.6 : 1}
                  grayscale={shouldBeGray}
                />
              );
            })}

            {/* 4. Enemies */}
            {visibleEnemies.map((entry) => {
              const { enemy, variant } = entry;
              const isUnknown = variant === 'unknown';
              return (
                <SkiaEntity
                  key={`enemy-${enemy.id}`}
                  x={enemy.position.x}
                  y={enemy.position.y}
                  image={isUnknown ? entityImages.unknownEnemy : entityImages[enemy.definitionId]}
                  opacity={1}
                />
              );
            })}

            {/* 5. Player */}
            <SkiaEntity
              x={playerPosition.x}
              y={playerPosition.y}
              image={entityImages.player}
              flipX={playerFacing === 'left'}
              yOffset={4}
            />
          </Group>
        </Group>
      </Canvas>

      {/* 2. Wall Highlight (UI Overlay) */}
      {wallHighlight && highlightVisible && (
        <View style={styles.entityOverlay} pointerEvents="none">
          <WallHighlight
            position={wallHighlight.targetPosition}
            cost={wallHighlight.cost}
            tileSize={TILE_SIZE * zoom}
            cameraOffset={cameraOffset}
          />
        </View>
      )}
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
  },
  canvas: {
    ...StyleSheet.absoluteFillObject,
  },
  entityOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
});
