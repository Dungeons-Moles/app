import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { OverviewModeState } from '../../contexts/GameContext';
import { DEFAULT_OVERVIEW_STATE } from '../../contexts/GameContext';
import type { Position } from '../../game/engine/types';
import type { MapPOI } from '../../game/map/types';

interface FastTravelOverlayProps {
  waypoints: MapPOI[];
  selectedIndex: number;
  currentPosition: Position;
  overviewMode?: OverviewModeState;
  onCycle: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const TILE_SIZE = 32;
const ENTITY_SIZE = 40;
const ENTITY_OFFSET = (ENTITY_SIZE - TILE_SIZE) / 2;

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

export function FastTravelOverlay({
  waypoints,
  selectedIndex,
  currentPosition,
  overviewMode,
  onCycle,
  onConfirm,
  onCancel,
}: FastTravelOverlayProps) {
  const [dimensions, setDimensions] = useState({ width: 300, height: 300 });
  const pulse = useRef(new Animated.Value(0)).current;
  const longPressTriggered = useRef(false);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width && height) {
      setDimensions({ width, height });
    }
  }, []);

  const overview = overviewMode ?? DEFAULT_OVERVIEW_STATE;
  // Match MapRenderer's dynamic zoom so markers align with map tiles
  const dynamicZoom = dimensions.height / (7 * TILE_SIZE);
  const zoom = overview.active ? overview.zoom : dynamicZoom;

  const selectableWaypoints = useMemo(
    () =>
      waypoints.filter(
        (poi) => poi.position.x !== currentPosition.x || poi.position.y !== currentPosition.y
      ),
    [waypoints, currentPosition.x, currentPosition.y]
  );

  const selectedWaypoint = selectableWaypoints[selectedIndex] ?? selectableWaypoints[0] ?? null;

  // Center camera on selected waypoint (or player if none)
  const focusPosition = selectedWaypoint?.position ?? currentPosition;
  const cameraCenter = useMemo(
    () => ({
      x: focusPosition.x + (overview.active ? overview.offset.x : 0),
      y: focusPosition.y + (overview.active ? overview.offset.y : 0),
    }),
    [focusPosition.x, focusPosition.y, overview.active, overview.offset.x, overview.offset.y]
  );

  const cameraOffset = useMemo(
    () => getCameraOffset(cameraCenter, dimensions.width, dimensions.height, zoom),
    [cameraCenter, dimensions.width, dimensions.height, zoom]
  );

  const cameraTransform = useMemo(
    () => [{ scale: zoom }, { translateX: cameraOffset.x }, { translateY: cameraOffset.y }],
    [zoom, cameraOffset.x, cameraOffset.y]
  );

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onCancel();
      return true;
    });
    return () => subscription.remove();
  }, [onCancel]);

  const handlePress = useCallback(() => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    if (selectableWaypoints.length > 0) {
      onCycle();
    }
  }, [onCycle, selectableWaypoints.length]);

  const handleLongPress = useCallback(() => {
    if (selectableWaypoints.length === 0) {
      return;
    }
    longPressTriggered.current = true;
    onConfirm();
  }, [onConfirm, selectableWaypoints.length]);

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.15],
  });

  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 0.95],
  });

  const instructionLabel =
    selectableWaypoints.length > 0
      ? '◀ ▶ cycle   A travel'
      : 'No other waypoints discovered';

  return (
    <View style={styles.container} onLayout={handleLayout} pointerEvents="box-none">
      <View style={styles.scrim} pointerEvents="none" />

      <View style={[styles.markerLayer, { transform: cameraTransform }]} pointerEvents="none">
        {waypoints.map((poi) => {
          const isCurrent =
            poi.position.x === currentPosition.x && poi.position.y === currentPosition.y;
          return (
            <View
              key={`fast-travel-${poi.id}`}
              style={[
                styles.waypointMarker,
                {
                  left: poi.position.x * TILE_SIZE - ENTITY_OFFSET,
                  top: poi.position.y * TILE_SIZE - ENTITY_OFFSET,
                },
                isCurrent && styles.currentWaypoint,
              ]}
            >
              <Text style={styles.waypointEmoji}>🚃</Text>
            </View>
          );
        })}

        {selectedWaypoint && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.selectedRing,
              {
                left: selectedWaypoint.position.x * TILE_SIZE - ENTITY_OFFSET,
                top: selectedWaypoint.position.y * TILE_SIZE - ENTITY_OFFSET,
                transform: [{ scale }],
                opacity,
              },
            ]}
          />
        )}
      </View>

      <View style={styles.instructions} pointerEvents="none">
        <Text style={styles.instructionText}>{instructionLabel}</Text>
      </View>

      <TouchableOpacity style={styles.cancelButton} onPress={onCancel} activeOpacity={0.8}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 8, 12, 0.35)',
  },
  markerLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  waypointMarker: {
    position: 'absolute',
    width: ENTITY_SIZE,
    height: ENTITY_SIZE,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(14, 116, 144, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  currentWaypoint: {
    borderColor: '#e5e7eb',
    backgroundColor: 'rgba(148, 163, 184, 0.25)',
  },
  waypointEmoji: {
    fontSize: 22,
  },
  selectedRing: {
    position: 'absolute',
    width: ENTITY_SIZE,
    height: ENTITY_SIZE,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#fbbf24',
    shadowColor: '#fbbf24',
    shadowOpacity: 0.7,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  instructions: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  instructionText: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  cancelButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1,
    borderColor: '#f97316',
  },
  cancelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#f97316',
    textTransform: 'uppercase',
  },
});
